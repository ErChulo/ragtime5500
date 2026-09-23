import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../dist/ragtime5500.html', import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);

const bytes = await readFile(APP);
const html = bytes.toString('utf8');
const csp = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)["']/i)?.[1];
if (!csp) throw new Error('Compiled standalone HTML is missing its Content Security Policy.');

createServer((req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const pathname = new URL(req.url || '/', `http://${HOST}:${PORT}`).pathname;
  if (pathname !== '/' && pathname !== '/ragtime5500.html') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.writeHead(200);
  if (req.method === 'GET') res.end(bytes);
  else res.end();
}).listen(PORT, HOST, () => {
  process.stdout.write(`Ragtime 5500 local-only server: http://${HOST}:${PORT}\n`);
});
