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

const syntheticCase = 'Ragtime Synthetic Import Case';
const syntheticPdfName = 'SYNTHETICFILING1234567890.pdf';
const syntheticCsvText = [
  'PN,Plan Name,Date Received,Plan Codes,Plan Year,Participants,Participants EOY,Assets BOY,Assets,Link',
  '001,Synthetic Pension Plan,09/23/2026,DB,2024,10,9,1200000,1100000,https://example.invalid/SYNTHETICFILING1234567890.pdf',
  '',
].join('\n');

function pdfEscape(value) {
  return value.replace(/[\\()]/g, (character) => `\\${character}`);
}

function buildSyntheticPdfBase64() {
  const stream = [
    'BT /F1 14 Tf 1 0 0 1 50 740 Tm (Schedule H) Tj ET',
    'BT /F1 11 Tf 1 0 0 1 50 715 Tm (Plan Year beginning 2024) Tj ET',
    'BT /F1 11 Tf 1 0 0 1 50 695 Tm (Name of Plan: Synthetic Pension Plan Plan Number: 001) Tj ET',
    `BT /F1 11 Tf 1 0 0 1 50 650 Tm (${pdfEscape('1c(9) Common collective trust')}) Tj ET`,
    'BT /F1 11 Tf 1 0 0 1 350 650 Tm (1133669) Tj ET',
    'BT /F1 11 Tf 1 0 0 1 470 650 Tm (957892) Tj ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1').toString('base64');
}

const syntheticPdfBase64 = buildSyntheticPdfBase64();

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




async function privateFieldDiagnostics(fieldName) {
  try {
    const html = await readFile(htmlPath, 'utf8');
    const needle = `#${fieldName}`;
    const samples = [];
    let start = 0;
    while (samples.length < 8) {
      const index = html.indexOf(needle, start);
      if (index < 0) break;
      samples.push(html.slice(Math.max(0, index - 450), index + 650));
      start = index + needle.length;
    }
    return `Occurrences of ${needle}: ${(html.match(new RegExp(needle, 'g')) ?? []).length}\n${samples.join('\n---\n')}`;
  } catch {
    return 'private field diagnostics unavailable';
  }
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

async function setInputFile(cdp, selector, filename, mimeType, base64Bytes) {
  const changed = await evaluate(cdp, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return false;
    const binary = atob(${JSON.stringify(base64Bytes)});
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], ${JSON.stringify(filename)}, { type: ${JSON.stringify(mimeType)} }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
    if (!setter) return false;
    setter.call(input, transfer.files);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files?.length === 1;
  })()`);
  if (!changed) throw new Error(`Unable to attach synthetic file to ${selector}.`);
}

async function importSyntheticVerticalSlice(cdp) {
  await evaluate(cdp, `location.hash = '#/import'`);
  await waitFor(cdp, `document.body.innerText.includes('Import eFAST CSV')`, 'import route');

  await evaluate(cdp, `(() => {
    const input = document.querySelector('input[placeholder="Internal case label"]');
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(syntheticCase)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  await setInputFile(
    cdp,
    'input[accept*=".csv"]',
    'synthetic-efast.csv',
    'text/csv',
    Buffer.from(syntheticCsvText, 'utf8').toString('base64'),
  );

  await waitFor(
    cdp,
    `Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'Import CSV' && !button.disabled)`,
    'enabled CSV import button',
  );
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Import CSV')?.click()`);
  await waitFor(cdp, `document.body.innerText.includes('Imported 1 raw rows.')`, 'synthetic eFAST CSV import', 20000);

  await setInputFile(
    cdp,
    'input[accept*="application/pdf"]',
    syntheticPdfName,
    'application/pdf',
    syntheticPdfBase64,
  );
  await waitFor(
    cdp,
    `Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'Import 1 PDF' && !button.disabled)`,
    'enabled PDF import button',
  );
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Import 1 PDF')?.click()`);
  await waitFor(
    cdp,
    `document.body.innerText.includes(${JSON.stringify(syntheticPdfName)}) && document.body.innerText.includes('AUTO_ACCEPTED') && document.body.innerText.includes('Extracted H/I/1C9 BOY=1,133,669 and EOY=957,892')`,
    'synthetic PDF match and 1C9 extraction',
    30000,
  );

  await evaluate(cdp, `location.hash = '#/explore'`);
  await waitFor(cdp, `document.body.innerText.includes('Exact structured query')`, 'explore route');
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Run structured query')?.click()`);
  await waitFor(
    cdp,
    `document.body.innerText.includes('1 structured value matched.') && document.body.innerText.includes('957,892') && document.body.innerText.includes(${JSON.stringify(syntheticPdfName)})`,
    'SQL-backed provenance query for synthetic EOY value',
    15000,
  );
}

async function verifySyntheticVerticalSlice(cdp) {
  await evaluate(cdp, `location.hash = '#/explore'`);
  await waitFor(cdp, `document.body.innerText.includes('Exact structured query')`, 'persisted explore route');
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Run structured query')?.click()`);
  await waitFor(
    cdp,
    `document.body.innerText.includes('1 structured value matched.') && document.body.innerText.includes('957,892') && document.body.innerText.includes(${JSON.stringify(syntheticPdfName)})`,
    'persisted synthetic structured value and provenance',
    15000,
  );
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

    await importSyntheticVerticalSlice(session.cdp);

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
    const privateField = exception?.match(/Private field '#([^']+)'/)?.[1];
    const fieldDiagnostics = privateField ? await privateFieldDiagnostics(privateField) : 'no private-field diagnostic requested';
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBrowser snapshot:\n${snapshot}\nBrowser messages:\n${browserMessages.join('\n')}\nCompiled source snippet:\n${snippet}\nPrivate-field diagnostics:\n${fieldDiagnostics}\nChrome stderr:\n${session.stderr()}`);
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

    await verifySyntheticVerticalSlice(session.cdp);

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
    const snapshot = await evaluate(session.cdp, `JSON.stringify({ href: location.href, title: document.title, text: document.body?.innerText?.slice(0, 5000) ?? '', html: document.documentElement?.outerHTML?.slice(0, 2500) ?? '' })`).catch(() => 'browser snapshot unavailable');
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBrowser snapshot:\n${snapshot}\nBrowser messages:\n${browserMessages.join('\n')}\nChrome stderr:\n${session.stderr()}`);
  } finally {
    await closeChrome(session);
  }
}

try {
  await firstRun();
  await secondRun();
  process.stdout.write('FILE-BROWSER SMOKE: PASS — direct file startup, synthetic CSV/PDF import, automatic matching, 1C9 extraction, SQL provenance retrieval, OPFS browser-restart persistence, integrity reopen, and zero outbound HTTP(S).\n');
} finally {
  await rm(profile, { recursive: true, force: true });
}
