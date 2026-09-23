import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css']);
const ignored = new Set([
  'index.html',
  'src/security/networkLockdown.ts',
  'scripts/audit-network.mjs',
  'scripts/serve-dist.mjs',
  'scripts/browser-file-smoke.mjs',
]);

const checks = [
  ['fetch()', /\bfetch\s*\(/g],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/g],
  ['WebSocket', /\bWebSocket\b/g],
  ['EventSource', /\bEventSource\b/g],
  ['sendBeacon', /\bsendBeacon\s*\(/g],
  ['window.open', /\bwindow\.open\s*\(/g],
  ['location navigation', /\b(?:window\.)?location\s*(?:\.href\s*=|=)|\blocation\.(?:assign|replace)\s*\(/g],
  ['remote import', /(?:from\s*|import\s*\()\s*["']https?:\/\//gi],
  ['remote runtime URL', /(?:src|href)\s*=\s*["']https?:\/\//gi],
  ['remote CSS URL', /url\(\s*["']?https?:\/\//gi],
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.tmp-test'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (SOURCE_EXT.has(extname(entry.name))) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of await walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  if (ignored.has(rel)) continue;
  const text = await readFile(file, 'utf8');
  for (const [name, regex] of checks) {
    regex.lastIndex = 0;
    if (regex.test(text)) violations.push(`${rel}: ${name}`);
  }
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
if (!/connect-src\s+'none'/.test(html)) violations.push("index.html: missing connect-src 'none'");
if (!/script-src\s+'self'\s+'wasm-unsafe-eval'/.test(html)) violations.push("index.html: missing local WASM script policy");

try {
  const distHtml = await readFile(join(ROOT, 'dist', 'ragtime5500.html'), 'utf8');
  if (!/connect-src\s+'none'/.test(distHtml)) violations.push("dist/ragtime5500.html: missing connect-src 'none'");
  if (!/worker-src\s+'self'\s+blob:\s+data:/.test(distHtml)) violations.push('dist/ragtime5500.html: missing local worker policy');
} catch {
  // Dist is optional before the first production build.
}

if (violations.length) {
  process.stderr.write(`NETWORK AUDIT: FAIL\n${violations.map((v) => `- ${v}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('NETWORK AUDIT: PASS\n');
