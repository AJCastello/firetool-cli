import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: './src/cli/index.ts',
  format: 'esm',
  outDir: './dist/cli',
  clean: true,
  platform: 'node',
  outExtensions: () => ({ js: '.js' }),
  banner: {
    js: '#!/usr/bin/env node',
  },
})
