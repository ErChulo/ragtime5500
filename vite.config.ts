import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const VIRTUAL_ID = 'virtual:sqlite-wasm-bytes';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;
const FINAL_HTML = 'ragtime5500.html';
const INLINE_NONCE = 'ragtime5500-local-runtime-v1';

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mimeType(fileName: string): string {
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) return 'text/javascript';
  if (fileName.endsWith('.wasm')) return 'application/wasm';
  if (fileName.endsWith('.json')) return 'application/json';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function sourceBytes(source: string | Uint8Array): Buffer {
  return typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source);
}

function replaceAssetReference(source: string, fileName: string, dataUri: string): string {
  const escaped = escapeRegExp(fileName);
  return source
    .replace(new RegExp(`(["'])\\./${escaped}\\1`, 'g'), (_match, quote) => `${quote}${dataUri}${quote}`)
    .replace(new RegExp(`(["'])/${escaped}\\1`, 'g'), (_match, quote) => `${quote}${dataUri}${quote}`)
    .replace(new RegExp(`(["'])${escaped}\\1`, 'g'), (_match, quote) => `${quote}${dataUri}${quote}`);
}

function singleHtmlBundle(): Plugin {
  return {
    name: 'ragtime5500-single-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlKey = Object.keys(bundle).find((fileName) => fileName.endsWith('.html'));
      if (!htmlKey) throw new Error('Standalone build did not emit an HTML entry.');

      const htmlAsset = bundle[htmlKey];
      if (htmlAsset.type !== 'asset') throw new Error('HTML entry was not emitted as an asset.');

      let html = String(htmlAsset.source);
      const styles: string[] = [];
      const scripts: string[] = [];

      const embeddedAssets = new Map<string, string>();
      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName === htmlKey || output.type !== 'asset' || fileName.endsWith('.css')) continue;
        const base64 = sourceBytes(output.source).toString('base64');
        embeddedAssets.set(fileName, `data:${mimeType(fileName)};base64,${base64}`);
      }

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [fileName, dataUri] of embeddedAssets) {
          output.code = replaceAssetReference(output.code, fileName, dataUri);
        }
      }
      for (const [fileName, dataUri] of embeddedAssets) {
        html = replaceAssetReference(html, fileName, dataUri);
        delete bundle[fileName];
      }

      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName === htmlKey) continue;

        if (output.type === 'asset' && fileName.endsWith('.css')) {
          styles.push(String(output.source));
          html = html.replace(
            new RegExp(`<link\\b[^>]*\\bhref=["'][^"']*${escapeRegExp(fileName)}["'][^>]*>`, 'g'),
            '',
          );
          delete bundle[fileName];
          continue;
        }

        if (output.type === 'chunk') {
          if (!output.isEntry) {
            throw new Error(`Standalone build emitted an unexpected JavaScript chunk: ${fileName}`);
          }
          scripts.push(output.code);
          html = html.replace(
            new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escapeRegExp(fileName)}["'][^>]*>\\s*</script>`, 'g'),
            '',
          );
          delete bundle[fileName];
        }
      }

      const leftovers = Object.keys(bundle).filter((fileName) => fileName !== htmlKey);
      if (leftovers.length) {
        throw new Error(`Standalone build emitted external assets: ${leftovers.join(', ')}`);
      }

      const styleText = styles.join('\n').replace(/<\/style/gi, '<\\/style');
      const scriptText = scripts.join('\n').replace(/<\/script/gi, '<\\/script');
      if (!styleText || !scriptText) throw new Error('Standalone build is missing inlined CSS or JavaScript.');

      const scriptDirective = "script-src 'self' 'wasm-unsafe-eval'";
      const styleDirective = "style-src 'self'";
      if (!html.includes(scriptDirective) || !html.includes(styleDirective)) {
        throw new Error('Expected CSP directives were not found before single-file inlining.');
      }

      html = html
        .replace(scriptDirective, `${scriptDirective} 'nonce-${INLINE_NONCE}'`)
        .replace(styleDirective, `${styleDirective} 'nonce-${INLINE_NONCE}'`)
        .replace('</head>', `<style nonce="${INLINE_NONCE}">${styleText}</style>\n  </head>`)
        .replace('</body>', `<script type="module" nonce="${INLINE_NONCE}">${scriptText}</script>\n  </body>`);

      htmlAsset.source = html;

      if (htmlKey !== FINAL_HTML) {
        delete bundle[htmlKey];
        htmlAsset.fileName = FINAL_HTML;
        bundle[FINAL_HTML] = htmlAsset;
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), inlineSqliteWasm(), singleHtmlBundle()],
  worker: {
    format: 'es',
    plugins: () => [inlineSqliteWasm()],
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
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
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
