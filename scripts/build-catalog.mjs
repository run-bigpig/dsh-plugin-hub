import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(root, 'catalog/plugins')
const files = (await readdir(directory)).filter(file => file.endsWith('.json')).sort()
const plugins = await Promise.all(files.map(async file => JSON.parse(await readFile(resolve(directory, file), 'utf8'))))
const catalog = { schemaVersion: 1, generatedAt: new Date().toISOString(), plugins }
await writeFile(resolve(root, 'catalog/catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
process.stdout.write(`wrote catalog/catalog.json with ${plugins.length} entries\n`)
