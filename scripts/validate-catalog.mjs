import { createPublicKey, verify } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'

const root = resolve(import.meta.dirname, '..')
const schema = JSON.parse(await readFile(resolve(root, 'schemas/plugin.schema.json'), 'utf8'))
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
const files = (await readdir(resolve(root, 'catalog/plugins'))).filter(file => file.endsWith('.json')).sort()
let failed = false

const entries = []
for (const file of files) {
  const entry = JSON.parse(await readFile(resolve(root, 'catalog/plugins', file), 'utf8'))
  entries.push(entry)
  if (!validate(entry)) {
    failed = true
    process.stderr.write(`${file}: ${JSON.stringify(validate.errors)}\n`)
  }
}

if (failed) process.exit(1)

const catalog = await readFile(resolve(root, 'catalog/catalog.json'))
const document = JSON.parse(catalog)
if (document.schemaVersion !== 1 || Number.isNaN(Date.parse(document.generatedAt))) {
  throw new Error('catalog/catalog.json has invalid root metadata')
}
if (!isDeepStrictEqual(document.plugins, entries)) {
  throw new Error('catalog/catalog.json is stale; run pnpm catalog and sign it again')
}
const signature = Buffer.from((await readFile(resolve(root, 'catalog/catalog.sig'), 'utf8')).trim(), 'base64')
const rawPublicKey = Buffer.from((await readFile(resolve(root, 'catalog/public-key.txt'), 'utf8')).trim(), 'base64')
if (rawPublicKey.length !== 32) throw new Error('catalog public key must contain 32 raw Ed25519 bytes')
const x = rawPublicKey.toString('base64url')
const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' })
if (!verify(null, catalog, publicKey, signature)) throw new Error('catalog signature verification failed')

process.stdout.write(`validated ${files.length} catalog entries and signature\n`)
