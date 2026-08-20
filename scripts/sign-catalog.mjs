import { createPrivateKey, sign } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const keyPath = process.env.DSH_MARKETPLACE_SIGNING_KEY
const inlineKey = process.env.DSH_MARKETPLACE_SIGNING_KEY_PEM
if ((keyPath === undefined || keyPath.trim() === '') && (inlineKey === undefined || inlineKey.trim() === '')) {
  throw new Error('set DSH_MARKETPLACE_SIGNING_KEY or DSH_MARKETPLACE_SIGNING_KEY_PEM')
}

const catalogPath = resolve(root, 'catalog/catalog.json')
const catalog = await readFile(catalogPath)
const privateKeyPEM = inlineKey !== undefined && inlineKey.trim() !== ''
  ? inlineKey
  : await readFile(resolve(keyPath))
const privateKey = createPrivateKey(privateKeyPEM)
if (privateKey.asymmetricKeyType !== 'ed25519') {
  throw new Error('catalog signing key must be Ed25519')
}

const signature = sign(null, catalog, privateKey).toString('base64')
await writeFile(resolve(root, 'catalog/catalog.sig'), `${signature}\n`, { mode: 0o644 })
process.stdout.write('signed catalog/catalog.json as catalog/catalog.sig\n')
