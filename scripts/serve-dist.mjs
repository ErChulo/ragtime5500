import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const CSP = "default-src 'self'; connect-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.wasm', 'application/wasm'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
]);

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const normalizedPath = normalize(decoded).replace(/^([/\\])+/, '');
  if (normalizedPath.includes('..')) return null;
  return normalizedPath || 'index.html';
}

createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const rel = safePath(req.url || '/');
  if (!rel) { res.writeHead(400); res.end('Bad request'); return; }

  let filePath = join(ROOT, rel);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(ROOT, 'index.html');
  }

  try {
    const bytes = await readFile(filePath);
    res.setHeader('Content-Type', types.get(extname(filePath).toLowerCase()) || 'application/octet-stream');
    res.writeHead(200);
    if (req.method === 'GET') res.end(bytes); else res.end();
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, HOST, () => {
  process.stdout.write(`Ragtime 5500 local-only server: http://${HOST}:${PORT}\n`);
});
