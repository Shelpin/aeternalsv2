import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  external: [
    '@elizaos/core',
    'better-sqlite3',
    'sqlite',
    'sqlite3',
    'uuid'
  ],
});
