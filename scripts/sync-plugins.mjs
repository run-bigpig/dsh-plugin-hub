import { createHash, timingSafeEqual } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pluginDirectory = resolve(root, 'catalog/plugins')
const apply = process.argv.includes('--apply')
const mirrorRepository = process.env.GITHUB_REPOSITORY || 'run-bigpig/dsh-plugin-hub'
const userAgent = `${mirrorRepository} plugin mirror sync`
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/

function parseSemver(value) {
  const match = semverPattern.exec(value)
  if (match === null) throw new Error(`unsupported version ${value}`)
  return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] }
}

function compareSemver(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return Math.sign(a.numbers[index] - b.numbers[index])
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === undefined) return 1
  if (b.prerelease === undefined) return -1
  return a.prerelease.localeCompare(b.prerelease, 'en', { numeric: true })
}

function repositoryCoordinates(rawURL) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(rawURL)
  if (match === null) throw new Error(`unsupported GitHub repository URL ${rawURL}`)
  return `${match[1]}/${match[2]}`
}

function normalizeRepository(rawURL) {
  return rawURL
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
}

async function fetchResponse(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent, ...options.headers },
  })
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} returned HTTP ${response.status}`)
  return response
}

async function fetchJSON(url, options) {
  return fetchResponse(url, options).then(response => response.json())
}

function githubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    throw new Error('set GH_TOKEN before creating mirror releases')
  }
}

async function githubRequest(path, options = {}) {
  const token = githubToken()
  return fetchJSON(`https://api.github.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers },
  })
}

async function existingRelease(tag) {
  const token = githubToken()
  const response = await fetch(`https://api.github.com/repos/${mirrorRepository}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`GET release ${tag} returned HTTP ${response.status}`)
  return response.json()
}

async function ensureMirror(entry, version, tarball, sha256, integrity) {
  const safeID = entry.id.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const tag = `mirror-${safeID}-v${version}`
  const assetName = `${entry.packageName.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`
  let release = await existingRelease(tag)
  if (release === undefined) {
    release = await githubRequest(`/repos/${mirrorRepository}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: process.env.GITHUB_REF_NAME || 'main',
        name: `${entry.name} ${version} (automated community mirror)`,
        body: `Automated mirror of ${entry.packageName}@${version} from npm.\n\nUpstream: ${entry.repository.url}\nIntegrity: ${integrity}\n\nThis is not an upstream-signed GitHub Release asset.`,
        draft: false,
        prerelease: version.includes('-'),
      }),
    })
  }
  const currentAsset = release.assets.find(asset => asset.name === assetName)
  if (currentAsset !== undefined) {
    const mirrored = Buffer.from(await (await fetchResponse(currentAsset.browser_download_url)).arrayBuffer())
    const mirroredSHA = createHash('sha256').update(mirrored).digest('hex')
    if (mirroredSHA !== sha256) throw new Error(`${tag}/${assetName} does not match the npm artifact`)
    return currentAsset.browser_download_url
  }
  const token = githubToken()
  const uploadURL = `https://uploads.github.com/repos/${mirrorRepository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`
  const asset = await fetchJSON(uploadURL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/gzip',
      'User-Agent': userAgent,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: tarball,
  })
  return asset.browser_download_url
}

async function downloadPackage(entry, metadata) {
  const tarballURL = new URL(metadata.dist.tarball)
  if (tarballURL.protocol !== 'https:' || tarballURL.hostname !== 'registry.npmjs.org') {
    throw new Error(`${entry.packageName} tarball must come from registry.npmjs.org`)
  }
  const tarball = Buffer.from(await (await fetchResponse(tarballURL)).arrayBuffer())
  if (tarball.length > 64 * 1024 * 1024) throw new Error(`${entry.packageName} tarball exceeds 64 MiB`)
  const [algorithm, encodedDigest] = metadata.dist.integrity.split('-', 2)
  if (algorithm !== 'sha512' || !encodedDigest) throw new Error(`${entry.packageName} has unsupported npm integrity`)
  const actualDigest = createHash('sha512').update(tarball).digest()
  const expectedDigest = Buffer.from(encodedDigest, 'base64')
  if (actualDigest.length !== expectedDigest.length || !timingSafeEqual(actualDigest, expectedDigest)) {
    throw new Error(`${entry.packageName} failed npm integrity verification`)
  }
  const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-plugin-mirror-'))
  const tarballPath = resolve(temporary, basename(tarballURL.pathname))
  try {
    await writeFile(tarballPath, tarball)
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], { encoding: 'utf8' }))
    if (manifest.name !== entry.packageName || manifest.version !== metadata.version) {
      throw new Error(`${entry.packageName} tarball manifest does not match registry metadata`)
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return { tarball, sha256: createHash('sha256').update(tarball).digest('hex') }
}

const files = (await readdir(pluginDirectory)).filter(file => file.endsWith('.json')).sort()
let updates = 0
for (const file of files) {
  const path = resolve(pluginDirectory, file)
  const entry = JSON.parse(await readFile(path, 'utf8'))
  if (entry.updates?.source !== 'npm') throw new Error(`${file} does not define an npm update source`)
  const coordinates = repositoryCoordinates(entry.repository.url)
  const repository = await fetchJSON(`https://api.github.com/repos/${coordinates}`)
  if (repository.id !== entry.repository.id) throw new Error(`${file} GitHub repository ID changed`)
  const registry = await fetchJSON(`https://registry.npmjs.org/${encodeURIComponent(entry.packageName)}`)
  const version = registry['dist-tags']?.[entry.updates.distTag]
  const metadata = registry.versions?.[version]
  if (!version || !metadata?.dist?.tarball || !metadata?.dist?.integrity) {
    throw new Error(`${entry.packageName} has no complete ${entry.updates.distTag} release metadata`)
  }
  const packageRepository = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url
  if (!packageRepository || normalizeRepository(packageRepository) !== normalizeRepository(entry.repository.url)) {
    throw new Error(`${entry.packageName}@${version} points at a different repository`)
  }
  const order = compareSemver(version, entry.release.version)
  if (order < 0) throw new Error(`${entry.packageName} dist-tag would downgrade ${entry.release.version} to ${version}`)
  if (order === 0) {
    process.stdout.write(`${entry.id}: ${version} is current\n`)
    continue
  }
  updates += 1
  process.stdout.write(`${entry.id}: ${entry.release.version} -> ${version}${apply ? '' : ' (dry run)'}\n`)
  if (!apply) continue
  const { tarball, sha256 } = await downloadPackage(entry, metadata)
  const assetURL = await ensureMirror(entry, version, tarball, sha256, metadata.dist.integrity)
  entry.release = { version, assetUrl: assetURL, sha256 }
  await writeFile(path, `${JSON.stringify(entry, null, 2)}\n`)
}

process.stdout.write(`${updates} plugin update(s) found${apply ? ' and applied' : ''}\n`)
