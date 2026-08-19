import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@run-bigpig/dsh-desktop-marketplace-host',
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
