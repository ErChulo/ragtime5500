import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';

const chrome = process.argv[2];
if (!chrome) throw new Error('Usage: node scripts/browser-persistence-smoke.mjs <chrome-binary>');
if (typeof WebSocket !== 'function') throw new Error('Node.js WebSocket global is required for the CDP smoke test.');

const profileDir = await mkdtemp(join(tmpdir(), 'ragtime5500-chrome-'));
const appUrl = `${pathToFileURL(resolve('dist/ragtime5500.html')).href}#/workspace`;
const sentinel = `CI Persistence Probe ${Date.now()}`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForFile(path, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError ?? new Error(`Timed out waiting for ${path}`);
}

function getJson(url) {
  return new Promise((resolvePromise, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`CDP endpoint returned HTTP ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.httpRequests = [];
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      this.ws.addEventListener('open', resolvePromise, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('Unable to open Chrome DevTools Protocol WebSocket.')), { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }

      if (message.method === 'Network.requestWillBeSent') {
        const url = String(message.params?.request?.url ?? '');
        if (/^https?:/i.test(url)) this.httpRequests.push(url);
      }
    });
  }

  send(method, params = {}) {
    if (!this.ws) throw new Error('CDP client is not open.');
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed.');
    }
    return result.result?.value;
  }

  close() {
    this.ws?.close();
  }
}

async function startBrowser() {
  const process = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  process.stderr.on('data', (chunk) => { stderr += String(chunk); });

  const portText = await waitForFile(join(profileDir, 'DevToolsActivePort'));
  const port = Number(portText.split(/\r?\n/, 1)[0]);
  if (!Number.isInteger(port) || port <= 0) {
    process.kill('SIGKILL');
    throw new Error(`Chrome did not publish a valid DevTools port. ${stderr}`);
  }

  const deadline = Date.now() + 15000;
  let target;
  while (Date.now() < deadline) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      target = targets.find((item) => item.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch {
      // Chrome may need a moment after writing DevToolsActivePort.
    }
    await sleep(100);
  }

  if (!target?.webSocketDebuggerUrl) {
    process.kill('SIGKILL');
    throw new Error(`Chrome page target was not available. ${stderr}`);
  }

  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: appUrl });

  await cdp.evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const timer = setInterval(() => {
      const text = document.body?.innerText ?? '';
      if (text.includes('Database ready')) {
        clearInterval(timer);
        resolve(true);
      } else if (text.includes('Database initialization failed')) {
        clearInterval(timer);
        reject(new Error(text));
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for Database ready.'));
      }
    }, 100);
  })`, true);

  return { process, cdp };
}

async function stopBrowser(browser) {
  browser.cdp.close();
  browser.process.kill('SIGTERM');
  await Promise.race([
    new Promise((resolvePromise) => browser.process.once('exit', resolvePromise)),
    sleep(4000).then(() => browser.process.kill('SIGKILL')),
  ]);
  await sleep(300);
}

async function createSentinel(browser) {
  await browser.cdp.evaluate(`new Promise((resolve, reject) => {
    const input = document.querySelector('input[aria-label="Case name"]');
    if (!(input instanceof HTMLInputElement)) {
      reject(new Error('Case name input not found.'));
      return;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(sentinel)});
    input.dispatchEvent(new Event('input', { bubbles: true }));

    setTimeout(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Create case');
      if (!(button instanceof HTMLButtonElement)) {
        reject(new Error('Create case button not found.'));
        return;
      }
      button.click();

      const deadline = Date.now() + 10000;
      const timer = setInterval(() => {
        const exists = [...document.querySelectorAll('select[aria-label="Cases"] option')]
          .some((option) => option.textContent?.trim() === ${JSON.stringify(sentinel)});
        if (exists) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error('Sentinel case was not created.'));
        }
      }, 100);
    }, 50);
  })`, true);
}

async function verifySentinel(browser) {
  const exists = await browser.cdp.evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const timer = setInterval(() => {
      const options = [...document.querySelectorAll('select[aria-label="Cases"] option')];
      if (options.some((option) => option.textContent?.trim() === ${JSON.stringify(sentinel)})) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('Persisted sentinel case was not found after browser restart.'));
      }
    }, 100);
  })`, true);
  if (!exists) throw new Error('Persisted sentinel was not found.');
}

let first;
let second;
try {
  first = await startBrowser();
  await createSentinel(first);
  if (first.cdp.httpRequests.length) {
    throw new Error(`Outbound HTTP(S) request detected during first run: ${first.cdp.httpRequests.join(', ')}`);
  }
  await stopBrowser(first);
  first = null;

  second = await startBrowser();
  await verifySentinel(second);
  if (second.cdp.httpRequests.length) {
    throw new Error(`Outbound HTTP(S) request detected during restart run: ${second.cdp.httpRequests.join(', ')}`);
  }

  process.stdout.write('BROWSER PERSISTENCE SMOKE: PASS — OPFS data survived a full Chromium process restart; zero page HTTP(S) requests observed.\n');
} finally {
  if (first) await stopBrowser(first);
  if (second) await stopBrowser(second);
  await rm(profileDir, { recursive: true, force: true });
}
