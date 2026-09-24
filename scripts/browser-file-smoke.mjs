import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';

const chrome = process.argv[2] || process.env.CHROME_PATH;
if (!chrome) throw new Error('Usage: node scripts/browser-file-smoke.mjs <chrome-binary>');
if (typeof WebSocket !== 'function') throw new Error('Node.js WebSocket global is required for the CDP smoke test.');

const profileDir = await mkdtemp(join(tmpdir(), 'ragtime5500-chrome-'));
const htmlPath = resolve('dist/ragtime5500.html');
const appUrl = `${pathToFileURL(htmlPath).href}#/workspace`;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForFile(path, timeoutMs = 30000) {
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
    this.ws = null;
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.httpRequests = [];
    this.messages = [];
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

      if (message.method === 'Runtime.consoleAPICalled') {
        this.messages.push(`CONSOLE: ${JSON.stringify(message.params?.args ?? [])}`);
      }

      if (message.method === 'Runtime.exceptionThrown') {
        this.messages.push(`EXCEPTION: ${message.params?.exceptionDetails?.text ?? ''} ${message.params?.exceptionDetails?.exception?.description ?? ''}`);
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

  return { process, cdp, stderr: () => stderr };
}

async function stopBrowser(browser) {
  browser.cdp.close();
  browser.process.kill('SIGTERM');
  await Promise.race([
    new Promise((resolvePromise) => browser.process.once('exit', resolvePromise)),
    sleep(4000).then(() => browser.process.kill('SIGKILL')),
  ]);
}

async function waitFor(cdp, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

let browser;
try {
  browser = await startBrowser();

  await waitFor(
    browser.cdp,
    `document.body?.innerText.includes('SQLite ready') && document.body?.innerText.includes('Open existing workspace') && document.body?.innerText.includes('Create new workspace')`,
    'direct-file SQLite startup and workspace chooser',
  );

  const capabilities = await browser.cdp.evaluate(`({
    href: location.href,
    secureContext: isSecureContext,
    openPicker: typeof window.showOpenFilePicker,
    savePicker: typeof window.showSaveFilePicker,
    networkBadge: document.body?.innerText.includes('Network blocked'),
    noWorkspaceBadge: document.body?.innerText.includes('No workspace open')
  })`);

  if (!capabilities?.secureContext) {
    throw new Error('The direct file page is not a secure context in this Chromium build.');
  }
  if (capabilities.openPicker !== 'function' || capabilities.savePicker !== 'function') {
    throw new Error(`Local workspace file picker APIs are unavailable: ${JSON.stringify(capabilities)}`);
  }
  if (!capabilities.networkBadge || !capabilities.noWorkspaceBadge) {
    throw new Error(`Expected standalone status badges are missing: ${JSON.stringify(capabilities)}`);
  }
  if (browser.cdp.httpRequests.length) {
    throw new Error(`Outbound HTTP(S) request detected: ${browser.cdp.httpRequests.join(', ')}`);
  }

  process.stdout.write('FILE-BROWSER SMOKE: PASS — direct file startup, SQLite WASM, workspace-file APIs, hash route, and zero outbound HTTP(S).\n');
} catch (error) {
  let snapshot = 'browser snapshot unavailable';
  if (browser) {
    snapshot = await browser.cdp.evaluate(`JSON.stringify({ href: location.href, title: document.title, text: document.body?.innerText?.slice(0, 5000) ?? '' })`).catch(() => snapshot);
  }
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\nBrowser snapshot:\n${snapshot}\nBrowser messages:\n${browser?.cdp.messages.join('\n') ?? ''}\nChrome stderr:\n${browser?.stderr() ?? ''}`,
  );
} finally {
  if (browser) await stopBrowser(browser);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
