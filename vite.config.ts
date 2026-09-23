import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const VIRTUAL_ID = 'virtual:sqlite-wasm-bytes';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

function inlineSqliteWasm(): Plugin {
  return {
    name: 'ragtime5500-inline-sqlite-wasm',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const wasmPath = require.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm');
      const base64 = readFileSync(wasmPath).toString('base64');
      return `export default ${JSON.stringify(base64)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineSqliteWasm()],
  server: {
    host: '127.0.0.1',
    hmr: false,
  },
  preview: {
    host: '127.0.0.1',
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
