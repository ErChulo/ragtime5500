import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error('CHROME_PATH is required.');

const htmlPath = resolve('dist/ragtime5500.html');
const profile = await mkdtemp(join(tmpdir(), 'ragtime5500-ci-profile-'));
const sentinel = 'Ragtime CI Persistence Sentinel';

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function debuggerPage(port) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((item) => item.type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Chrome remote debugging endpoint did not become ready: ${String(lastError ?? '')}`);
}

class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(url) {
    this.#socket = new WebSocket(url);
  }

  async ready() {
    if (this.#socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolveReady, reject) => {
      const onOpen = () => {
        cleanup();
        resolveReady();
      };
      const onError = (event) => {
        cleanup();
        reject(event.error ?? new Error('CDP WebSocket failed to open.'));
      };
      const cleanup = () => {
        this.#socket.removeEventListener('open', onOpen);
        this.#socket.removeEventListener('error', onError);
      };
      this.#socket.addEventListener('open', onOpen);
      this.#socket.addEventListener('error', onError);
    });

    this.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }

      const listeners = this.#listeners.get(message.method);
      if (!listeners) return;
      for (const listener of listeners) listener(message.params);
    });
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? [];
    listeners.push(listener);
    this.#listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolveSend, reject) => {
      this.#pending.set(id, { resolve: resolveSend, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

async function launch() {
  const child = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--disable-features=OptimizationHints,MediaRouter',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  let resolveDevTools;
  let rejectDevTools;
  const devToolsReady = new Promise((resolveReady, rejectReady) => {
    resolveDevTools = resolveReady;
    rejectDevTools = rejectReady;
  });

  const timer = setTimeout(() => {
    rejectDevTools(new Error('Chrome did not announce a DevTools endpoint within 10 seconds.'));
  }, 10000);

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\//);
    if (match) {
      clearTimeout(timer);
      resolveDevTools(Number(match[1]));
    }
  });

  child.once('exit', (code, signal) => {
    if (!/DevTools listening on/.test(stderr)) {
      clearTimeout(timer);
      rejectDevTools(new Error(`Chrome exited before DevTools became ready (code=${code}, signal=${signal}).`));
    }
  });

  let debugPort;
  try {
    debugPort = await devToolsReady;
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChrome stderr:\n${stderr}`);
  }

  let page;
  try {
    page = await debuggerPage(debugPort);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChrome stderr:\n${stderr}`);
  }

  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.ready();
  return { child, cdp, stderr: () => stderr };
}
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return result.result?.value;
}

async function waitFor(cdp, expression, description, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}



async function debuggerSourceSnippet(cdp, scriptId, lineNumber, columnNumber) {
  try {
    const result = await cdp.send('Debugger.getScriptSource', { scriptId });
    const lines = String(result.scriptSource ?? '').split(/\r?\n/);
    const line = lines[Math.max(0, Number(lineNumber))] ?? '';
    const column = Math.max(0, Number(columnNumber) || 0);
    return line.slice(Math.max(0, column - 900), column + 900);
  } catch {
    return 'debugger source snippet unavailable';
  }
}

async function sourceSnippet(lineNumber, columnNumber) {
  try {
    const html = await readFile(htmlPath, 'utf8');
    const lines = html.split(/\r?\n/);
    const line = lines[Math.max(0, Number(lineNumber))] ?? lines[Math.max(0, Number(lineNumber) - 1)] ?? '';
    const column = Math.max(0, Number(columnNumber) || 0);
    return line.slice(Math.max(0, column - 700), column + 700);
  } catch {
    return 'source snippet unavailable';
  }
}

async function verifyLoadedAndCollect(cdp, hash, externalRequests, browserMessages) {
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');

  cdp.on('Network.requestWillBeSent', (params) => {
    const url = params?.request?.url ?? '';
    if (/^https?:\/\//i.test(url)) externalRequests.push(url);
  });
  cdp.on('Log.entryAdded', (params) => {
    const entry = params?.entry;
    if (entry) browserMessages.push(`LOG ${entry.level}: ${entry.text}`);
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    const details = params?.exceptionDetails;
    if (details) browserMessages.push(`EXCEPTION @ ${details.lineNumber ?? '?'}:${details.columnNumber ?? '?'} [script ${details.scriptId ?? '?'}]: ${details.text ?? ''} ${details.exception?.description ?? ''}`);
  });
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params?.type === 'error' || params?.type === 'warning') {
      browserMessages.push(`CONSOLE ${params.type}: ${(params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
    }
  });

  const url = `${pathToFileURL(htmlPath).href}#/${hash}`;
  await cdp.send('Page.navigate', { url });
  await waitFor(
    cdp,
    `document.readyState === 'complete' && document.body && document.body.innerText.includes('Database ready')`,
    'standalone application database readiness',
    20000,
  );
}
async function closeChrome(session) {
  try {
    await session.cdp.send('Browser.close');
  } catch {
    session.child.kill('SIGKILL');
  }
  session.cdp.close();

  await Promise.race([
    new Promise((resolveExit) => session.child.once('exit', resolveExit)),
    sleep(3000).then(() => session.child.kill('SIGKILL')),
  ]);
}

async function firstRun() {
  const externalRequests = [];
  const browserMessages = [];
  const session = await launch();
  try {
    await verifyLoadedAndCollect(session.cdp, 'workspace', externalRequests, browserMessages);

    await evaluate(session.cdp, `(() => {
      const input = document.querySelector('input[aria-label="Case name"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(sentinel)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    await waitFor(
      session.cdp,
      `Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'Create case' && !button.disabled)`,
      'enabled Create case button',
    );

    await evaluate(session.cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Create case')?.click()`);

    await waitFor(
      session.cdp,
      `Array.from(document.querySelector('select[aria-label="Cases"]')?.options ?? []).some((option) => option.textContent.includes(${JSON.stringify(sentinel)}))`,
      'persistence sentinel case creation',
    );

    if (externalRequests.length) {
      throw new Error(`Outbound HTTP(S) requests detected during first file-protocol run: ${externalRequests.join(', ')}`);
    }
  } catch (error) {
    const snapshot = await evaluate(session.cdp, `JSON.stringify({ href: location.href, title: document.title, text: document.body?.innerText?.slice(0, 4000) ?? '', html: document.documentElement?.outerHTML?.slice(0, 4000) ?? '' })`).catch(() => 'browser snapshot unavailable');
    const exception = browserMessages.find((message) => message.startsWith('EXCEPTION @ '));
    const locationMatch = exception?.match(/EXCEPTION @ (\d+):(\d+) \[script ([^\]]+)\]:/);
    const snippet = locationMatch
      ? await debuggerSourceSnippet(session.cdp, locationMatch[3], Number(locationMatch[1]), Number(locationMatch[2]))
      : 'no exception location available';
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBrowser snapshot:\n${snapshot}\nBrowser messages:\n${browserMessages.join('\n')}\nCompiled source snippet:\n${snippet}\nChrome stderr:\n${session.stderr()}`);
  } finally {
    await closeChrome(session);
  }
}

async function secondRun() {
  const externalRequests = [];
  const browserMessages = [];
  const session = await launch();
  try {
    await verifyLoadedAndCollect(session.cdp, 'workspace', externalRequests, browserMessages);

    await waitFor(
      session.cdp,
      `Array.from(document.querySelector('select[aria-label="Cases"]')?.options ?? []).some((option) => option.textContent.includes(${JSON.stringify(sentinel)}))`,
      'persistence sentinel after complete browser restart',
    );

    await evaluate(session.cdp, `location.hash = '#/database'`);
    await waitFor(
      session.cdp,
      `document.body.innerText.includes('Database and source health')`,
      'database diagnostics route',
    );

    await evaluate(session.cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Run integrity check')?.click()`);
    await waitFor(
      session.cdp,
      `document.body.innerText.includes('PASS — SQLite reopened from OPFS')`,
      'OPFS reopen and integrity check',
      20000,
    );

    await evaluate(session.cdp, `location.hash = '#/workspace'`);
    await waitFor(
      session.cdp,
      `Boolean(document.querySelector('select[aria-label="Cases"]'))`,
      'workspace route after diagnostics',
    );

    await evaluate(session.cdp, `(() => {
      const select = document.querySelector('select[aria-label="Cases"]');
      const option = Array.from(select?.options ?? []).find((item) => item.textContent.includes(${JSON.stringify(sentinel)}));
      if (!select || !option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, option.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    await waitFor(
      session.cdp,
      `document.querySelector('input[aria-label="Case name"]')?.value === ${JSON.stringify(sentinel)}`,
      'sentinel case selection',
    );

    await evaluate(session.cdp, `window.confirm = () => true`);
    await evaluate(session.cdp, `document.querySelector('.hierarchy-column button.danger')?.click()`);
    await waitFor(
      session.cdp,
      `!Array.from(document.querySelector('select[aria-label="Cases"]')?.options ?? []).some((option) => option.textContent.includes(${JSON.stringify(sentinel)}))`,
      'persistence sentinel cleanup',
    );

    if (externalRequests.length) {
      throw new Error(`Outbound HTTP(S) requests detected during second file-protocol run: ${externalRequests.join(', ')}`);
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChrome stderr:\n${session.stderr()}`);
  } finally {
    await closeChrome(session);
  }
}

try {
  await firstRun();
  await secondRun();
  process.stdout.write('FILE-BROWSER SMOKE: PASS — direct file startup, hash routing, OPFS browser-restart persistence, integrity reopen, and zero outbound HTTP(S).\n');
} finally {
  await rm(profile, { recursive: true, force: true });
}
