import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const TARGET = 'ragtime5500.html';

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full));
    else out.push(full);
  }
  return out;
}

const violations = [];
const files = await filesUnder(DIST);
const relativeFiles = files.map((file) => relative(DIST, file).replaceAll('\\', '/'));

if (relativeFiles.length !== 1 || relativeFiles[0] !== TARGET) {
  violations.push(`dist must contain exactly one file named ${TARGET}; found: ${relativeFiles.join(', ') || '(none)'}`);
}

const html = await readFile(join(DIST, TARGET), 'utf8');
const shell = html
  .replace(/<style>[\s\S]*?<\/style>/i, '<style></style>')
  .replace(/<script\s+type=["']module["']>[\s\S]*?<\/script>/i, '<script type="module"></script>');

if (!/<style\\b[^>]*\\bnonce=["']ragtime5500-local-runtime-v1["'][^>]*>[\\s\\S]+<\\/style>/i.test(html)) violations.push('compiled CSS is not inlined with the required CSP nonce');
if (!/<script\s+type=["']module["']>[\s\S]+<\/script>/i.test(html)) violations.push('compiled JavaScript is not inlined');
if (/<script\b[^>]*\bsrc\s*=/i.test(shell)) violations.push('HTML shell still references an external script asset');
if (/<link\b[^>]*\bhref\s*=/i.test(shell)) violations.push('HTML shell still references an external link asset');
if (/<(?:img|source|audio|video|iframe)\b[^>]*\bsrc\s*=\s*["'](?!data:|blob:|#)/i.test(shell)) {
  violations.push('HTML shell still references a non-embedded media asset');
}
if (!/connect-src\s+'none'/.test(html)) violations.push("compiled CSP is missing connect-src 'none'");
if (!/script-src[^;]*'nonce-ragtime5500-local-runtime-v1'/.test(html)) violations.push('compiled CSP is missing the inline script nonce');
if (!/style-src[^;]*'nonce-ragtime5500-local-runtime-v1'/.test(html)) violations.push('compiled CSP is missing the inline style nonce');
if (!/worker-src\s+'self'\s+blob:\s+data:/.test(html)) violations.push('compiled CSP does not allow only embedded worker transports');

if (violations.length) {
  process.stderr.write(`SINGLE-FILE AUDIT: FAIL\n${violations.map((v) => `- ${v}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`SINGLE-FILE AUDIT: PASS — dist/${TARGET} is the only production artifact.\n`);
