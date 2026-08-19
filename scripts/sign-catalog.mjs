import { createPrivateKey, sign } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const keyPath = process.env.DSH_MARKETPLACE_SIGNING_KEY
if (keyPath === undefined || keyPath.trim() === '') {
  throw new Error('set DSH_MARKETPLACE_SIGNING_KEY to the Ed25519 private PEM path')
}

const catalogPath = resolve(root, 'catalog/catalog.json')
const catalog = await readFile(catalogPath)
const privateKey = createPrivateKey(await readFile(resolve(keyPath)))
if (privateKey.asymmetricKeyType !== 'ed25519') {
  throw new Error('catalog signing key must be Ed25519')
}

const signature = sign(null, catalog, privateKey).toString('base64')
await writeFile(resolve(root, 'catalog/catalog.sig'), `${signature}\n`, { mode: 0o644 })
process.stdout.write('signed catalog/catalog.json as catalog/catalog.sig\n')
