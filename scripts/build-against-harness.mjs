import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function option(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || process.argv[index + 1] === undefined) throw new Error(`missing ${name} <path>`)
  return resolve(process.argv[index + 1])
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)))
  })
}

const project = resolve(import.meta.dirname, '..')
const harness = option('--harness')
const output = option('--out')
const store = resolve(dirname(harness), 'pnpm-store')
if (!await exists(resolve(harness, 'packages/client/tsdown.client.ts'))) {
  throw new Error(`${harness} is not a DeepSeek Harness source checkout`)
}
const seed = JSON.parse(await readFile(resolve(harness, 'package.json'), 'utf8'))
process.stdout.write(`building Marketplace against Harness ${seed.version}\n`)
const overlay = resolve(harness, 'packages/desktop')
await rm(overlay, { recursive: true, force: true })
await mkdir(overlay, { recursive: true })
for (const name of ['marketplace-host', 'marketplace-client', 'marketplace-bundle']) {
  await cp(resolve(project, 'packages', name), resolve(overlay, name), { recursive: true })
}
await mkdir(output, { recursive: true })

const pnpm = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm'
await run(pnpm, [
  'install', '--frozen-lockfile=false', '--ignore-scripts',
  '--filter', '.',
  '--filter', '@deepseek-ai/dsh-typert-generator',
  '--filter', '@deepseek-ai/dsh-desktop-marketplace-host',
  '--filter', '@deepseek-ai/dsh-desktop-marketplace-client',
  '--filter', '@deepseek-ai/dsh-desktop-marketplace',
  '--store-dir', store,
  '--fetch-retries', '5', '--fetch-retry-mintimeout', '10000',
  '--fetch-retry-maxtimeout', '120000', '--fetch-timeout', '300000',
  '--network-concurrency', '8',
], harness)
const harnessRequire = createRequire(resolve(harness, 'package.json'))
const tsc = harnessRequire.resolve('typescript/bin/tsc')
const tsdown = harnessRequire.resolve('tsdown/run')
await run(process.execPath, [tsc, '-b', 'packages/desktop/marketplace-host'], harness)
const generatorURL = pathToFileURL(resolve(harness, 'packages/typert/generator/lib/types/workspace.js')).href
const { WorkspaceTypertGenerator } = await import(generatorURL)
const hostAggregatePath = resolve(harness, 'tsconfig.host.json')
const hostAggregate = await readFile(hostAggregatePath, 'utf8')
const hostMarker = '    { "path": "./apps/cli" }'
if (!hostAggregate.includes(hostMarker)) throw new Error('unexpected Harness host aggregate shape')
await writeFile(hostAggregatePath, hostAggregate.replace(
  hostMarker,
  '    { "path": "./packages/desktop/marketplace-host" },\n' + hostMarker,
))
let artifacts
try {
  artifacts = new WorkspaceTypertGenerator(harness).generate(
    ['@deepseek-ai/dsh-desktop-marketplace-host'],
    ['host'],
  )
} finally {
  await writeFile(hostAggregatePath, hostAggregate)
}
if (artifacts.length !== 1) throw new Error(`expected one Marketplace Host Typert artifact, got ${artifacts.length}`)
const hostDir = resolve(overlay, 'marketplace-host')
for (const artifact of artifacts) {
  await writeFile(resolve(hostDir, `lib/typert.${artifact.face}.js`), artifact.js)
  await writeFile(resolve(hostDir, `lib/typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote !== undefined) {
    await writeFile(resolve(hostDir, 'lib/typert.remote-client.js'), artifact.remote.js)
    await writeFile(resolve(hostDir, 'lib/typert.remote-client.d.ts'), artifact.remote.dts)
    await writeFile(resolve(hostDir, 'lib/typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  }
}
await run(process.execPath, [tsdown, '--config', 'packages/desktop/marketplace-host/tsdown.config.ts'], harness)
await run(process.execPath, [tsc, '-b', 'packages/desktop/marketplace-client'], harness)
await run(process.execPath, [
  tsdown, '--config', 'packages/desktop/marketplace-client/tsdown.config.ts', '--env.DSH_BUILD_FACE', 'client',
], harness)

for (const name of [
  '@deepseek-ai/dsh-desktop-marketplace-host',
  '@deepseek-ai/dsh-desktop-marketplace-client',
  '@deepseek-ai/dsh-desktop-marketplace',
]) {
  const packageDir = name.endsWith('-host')
    ? resolve(overlay, 'marketplace-host')
    : name.endsWith('-client')
      ? resolve(overlay, 'marketplace-client')
      : resolve(overlay, 'marketplace-bundle')
  await run(pnpm, ['pack', '--pack-destination', output], packageDir)
}
process.stdout.write(`Marketplace artifacts written to ${basename(output)}\n`)
