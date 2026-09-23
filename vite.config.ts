import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
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

function replaceBundleReference(source: string, fileName: string, replacement: string): string {
  const escaped = escapeRegExp(fileName);
  return source
    .replace(new RegExp(`(["'])\\./${escaped}\\1`, 'g'), (_match, quote) => `${quote}${replacement}${quote}`)
    .replace(new RegExp(`(["'])/${escaped}\\1`, 'g'), (_match, quote) => `${quote}${replacement}${quote}`)
    .replace(new RegExp(`(["'])${escaped}\\1`, 'g'), (_match, quote) => `${quote}${replacement}${quote}`);
}

function dataUri(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
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

      const entryNames = Object.entries(bundle)
        .filter(([, output]) => output.type === 'chunk' && output.isEntry)
        .map(([fileName]) => fileName);
      if (entryNames.length !== 1) {
        throw new Error(`Standalone build requires exactly one application entry chunk; found ${entryNames.length}.`);
      }
      const entryName = entryNames[0];
      const entryChunk = bundle[entryName];
      if (entryChunk.type !== 'chunk') throw new Error('Application entry was not emitted as a JavaScript chunk.');

      let html = String(htmlAsset.source);
      const styles: string[] = [];
      const assetUris = new Map<string, string>();

      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName === htmlKey || output.type !== 'asset') continue;
        if (fileName.endsWith('.css')) {
          styles.push(String(output.source));
          html = html.replace(
            new RegExp(`<link\\b[^>]*\\bhref=["'][^"']*${escapeRegExp(fileName)}["'][^>]*>`, 'g'),
            '',
          );
          continue;
        }
        assetUris.set(fileName, dataUri(mimeType(fileName), sourceBytes(output.source)));
      }

      const chunkUriCache = new Map<string, string>();
      const building = new Set<string>();

      const buildChunkUri = (fileName: string): string => {
        const cached = chunkUriCache.get(fileName);
        if (cached) return cached;
        if (building.has(fileName)) {
          throw new Error(`Standalone dynamic chunk cycle is not supported: ${[...building, fileName].join(' -> ')}`);
        }

        const output = bundle[fileName];
        if (!output || output.type !== 'chunk') {
          throw new Error(`Expected JavaScript chunk ${fileName} while embedding the standalone build.`);
        }

        building.add(fileName);
        let code = output.code;

        for (const [assetName, uri] of assetUris) {
          code = replaceBundleReference(code, assetName, uri);
          const shortAssetName = basename(assetName);
          if (shortAssetName !== assetName) {
            code = replaceBundleReference(code, shortAssetName, uri);
          }
        }

        const dependencies = [...new Set([...output.imports, ...output.dynamicImports])];
        for (const dependency of dependencies) {
          if (dependency === entryName) {
            throw new Error(`Standalone chunk ${fileName} imports the application entry, which cannot be encoded safely.`);
          }
          const dependencyOutput = bundle[dependency];
          if (!dependencyOutput || dependencyOutput.type !== 'chunk') continue;
          const dependencyUri = buildChunkUri(dependency);
          code = replaceBundleReference(code, dependency, dependencyUri);
          const shortDependency = basename(dependency);
          if (shortDependency !== dependency) {
            code = replaceBundleReference(code, shortDependency, dependencyUri);
          }
        }

        for (const [candidateName, candidateOutput] of Object.entries(bundle)) {
          if (candidateName === fileName || candidateName === entryName || candidateOutput.type !== 'chunk') continue;
          const shortCandidate = basename(candidateName);
          if (!code.includes(candidateName) && !code.includes(shortCandidate)) continue;
          const candidateUri = buildChunkUri(candidateName);
          code = replaceBundleReference(code, candidateName, candidateUri);
          if (shortCandidate !== candidateName) {
            code = replaceBundleReference(code, shortCandidate, candidateUri);
          }
        }

        building.delete(fileName);
        const uri = dataUri('text/javascript', Buffer.from(code, 'utf8'));
        chunkUriCache.set(fileName, uri);
        return uri;
      };

      let entryCode = entryChunk.code;
      for (const [assetName, uri] of assetUris) {
        entryCode = replaceBundleReference(entryCode, assetName, uri);
        html = replaceBundleReference(html, assetName, uri);
        const shortAssetName = basename(assetName);
        if (shortAssetName !== assetName) {
          entryCode = replaceBundleReference(entryCode, shortAssetName, uri);
          html = replaceBundleReference(html, shortAssetName, uri);
        }
      }

      const entryDependencies = [...new Set([...entryChunk.imports, ...entryChunk.dynamicImports])];
      for (const dependency of entryDependencies) {
        const dependencyOutput = bundle[dependency];
        if (!dependencyOutput || dependencyOutput.type !== 'chunk') continue;
        const dependencyUri = buildChunkUri(dependency);
        entryCode = replaceBundleReference(entryCode, dependency, dependencyUri);
        const shortDependency = basename(dependency);
        if (shortDependency !== dependency) {
          entryCode = replaceBundleReference(entryCode, shortDependency, dependencyUri);
        }
      }

      for (const [candidateName, candidateOutput] of Object.entries(bundle)) {
        if (candidateName === entryName || candidateOutput.type !== 'chunk') continue;
        const shortCandidate = basename(candidateName);
        if (!entryCode.includes(candidateName) && !entryCode.includes(shortCandidate)) continue;
        const candidateUri = buildChunkUri(candidateName);
        entryCode = replaceBundleReference(entryCode, candidateName, candidateUri);
        if (shortCandidate !== candidateName) {
          entryCode = replaceBundleReference(entryCode, shortCandidate, candidateUri);
        }
      }

      html = html.replace(
        new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escapeRegExp(entryName)}["'][^>]*>\\s*</script>`, 'g'),
        '',
      );

      const styleText = styles.join('\n').replace(/<\/style/gi, '<\\/style');
      const scriptText = entryCode.replace(/<\/script/gi, '<\\/script');
      if (!styleText || !scriptText) throw new Error('Standalone build is missing inlined CSS or JavaScript.');

      const scriptDirective = `script-src 'self' 'wasm-unsafe-eval' 'nonce-${INLINE_NONCE}'`;
      const styleDirective = "style-src 'self'";
      if (!html.includes(scriptDirective) || !html.includes(styleDirective)) {
        throw new Error('Expected CSP directives were not found before single-file inlining.');
      }

      html = html
        .replace(scriptDirective, `${scriptDirective} data:`)
        .replace(styleDirective, `${styleDirective} 'nonce-${INLINE_NONCE}'`)
        .replace('</head>', () => `<style nonce="${INLINE_NONCE}">${styleText}</style>\n  </head>`)
        .replace('</body>', () => `<script type="module" nonce="${INLINE_NONCE}">${scriptText}</script>\n  </body>`);

      for (const fileName of Object.keys(bundle)) {
        if (fileName !== htmlKey) delete bundle[fileName];
      }

      htmlAsset.source = html;
      if (htmlKey !== FINAL_HTML) {
        delete bundle[htmlKey];
        htmlAsset.fileName = FINAL_HTML;
        bundle[FINAL_HTML] = htmlAsset;
      }

      const leftovers = Object.keys(bundle);
      if (leftovers.length !== 1 || leftovers[0] !== FINAL_HTML) {
        throw new Error(`Standalone build must contain exactly ${FINAL_HTML}; found ${leftovers.join(', ')}.`);
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
    minify: false,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
});
