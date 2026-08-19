import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@deepseek-ai/dsh-desktop-marketplace-host',
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
