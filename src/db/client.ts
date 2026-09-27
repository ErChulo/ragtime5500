import dbWorkerUrl from './worker?worker&url';
import { LocalDbRuntime, type BindValue, type DbRequest } from './runtime';

export type SqlBind = BindValue[] | Record<string, BindValue>;

export interface DbDiagnostics {
  quickCheck: string;
  foreignKeyViolationCount: number;
  migrationVersion: number;
  pageCount: number;
  pageSize: number;
  databaseBytes: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

interface WorkspaceWritable {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

interface WorkspaceFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WorkspaceWritable>;
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options?: Record<string, unknown>) => Promise<WorkspaceFileHandle[]>;
  showSaveFilePicker?: (options?: Record<string, unknown>) => Promise<WorkspaceFileHandle>;
}

const PICKER_TYPES = [{
  description: 'Ragtime 5500 SQLite workspace',
  accept: {
    'application/x-sqlite3': ['.sqlite3', '.sqlite', '.db'],
  },
}];

function workerFromBundledUrl(url: string): Worker {
  if (!url.startsWith('data:')) {
    return new Worker(url, { name: 'ragtime5500-db' });
  }

  const separator = url.indexOf(',');
  if (separator < 0 || !url.slice(0, separator).includes(';base64')) {
    throw new Error('Embedded database worker URL is not a base64 data URI.');
  }

  const binary = atob(url.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  const worker = new Worker(blobUrl, { name: 'ragtime5500-db' });
  worker.addEventListener('error', () => URL.revokeObjectURL(blobUrl), { once: true });
  return worker;
}

function looksReadOnly(sql: string): boolean {
  const normalized = sql.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, '').trimStart();
  return /^(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(normalized);
}

export class DbClient {
  private worker: Worker | null = null;
  private fallback: LocalDbRuntime | null = null;
  private workerUnavailableReason: string | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private workspaceHandle: WorkspaceFileHandle | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (this.workerUnavailableReason) throw new Error(this.workerUnavailableReason);

    try {
      const worker = workerFromBundledUrl(dbWorkerUrl);
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (response.ok) pending.resolve(response.result);
        else pending.reject(new Error(response.error));
      };
      worker.onerror = (event) => {
        const reason = event.error ?? new Error(event.message || 'Database worker failed to start.');
        this.workerUnavailableReason = reason instanceof Error ? reason.message : String(reason);
        for (const pending of this.pending.values()) pending.reject(reason);
        this.pending.clear();
        try { worker.terminate(); } catch {}
        this.worker = null;
      };
      this.worker = worker;
      return worker;
    } catch (error) {
      this.workerUnavailableReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async fallbackRequest<T>(payload: DbRequest): Promise<T> {
    if (!this.fallback) this.fallback = new LocalDbRuntime();
    return this.fallback.handle(payload) as Promise<T>;
  }

  private workerRequest<T>(payload: DbRequest, transfer: Transferable[] = []): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finishResolve = (value: unknown) => {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        resolve(value as T);
      };
      const finishReject = (reason?: unknown) => {
        if (settled) return;
        settled = true;
        if (timer !== null) window.clearTimeout(timer);
        reject(reason);
      };
      const timer = payload.type === 'init'
        ? window.setTimeout(() => {
            this.pending.delete(id);
            finishReject(new Error('Database worker startup timed out; switching to same-page SQLite compatibility mode.'));
          }, 4000)
        : null;

      this.pending.set(id, {
        resolve: finishResolve,
        reject: finishReject,
      });
      try {
        worker.postMessage({ id, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        finishReject(error);
      }
    });
  }

  private async request<T>(payload: DbRequest, transfer: Transferable[] = []): Promise<T> {
    if (this.fallback) return this.fallbackRequest<T>(payload);

    try {
      return await this.workerRequest<T>(payload, transfer);
    } catch (workerError) {
      if (payload.type !== 'init') throw workerError;
      this.workerUnavailableReason = workerError instanceof Error ? workerError.message : String(workerError);
      try { this.worker?.terminate(); } catch {}
      this.worker = null;
      return this.fallbackRequest<T>(payload);
    }
  }

  private requireWorkspace(): WorkspaceFileHandle {
    if (!this.workspaceHandle) {
      throw new Error('Open or create a Ragtime workspace before changing data.');
    }
    return this.workspaceHandle;
  }

  private persistSnapshot(): Promise<void> {
    const handle = this.requireWorkspace();
    this.persistChain = this.persistChain.then(async () => {
      const bytes = await this.request<ArrayBuffer>({ type: 'export' });
      const writable = await handle.createWritable();
      try {
        await writable.write(new Uint8Array(bytes));
      } finally {
        await writable.close();
      }
    });
    return this.persistChain;
  }

  async init(): Promise<{ sqliteVersion: string; persistence: string; filename: string; foreignKeys: number }> {
    return this.request({ type: 'init' });
  }

  runtimeMode(): 'worker' | 'same-page-fallback' | 'not-started' {
    if (this.fallback) return 'same-page-fallback';
    if (this.worker) return 'worker';
    return 'not-started';
  }

  supportsWorkspaceFiles(): boolean {
    const pickerWindow = window as FilePickerWindow;
    return typeof pickerWindow.showOpenFilePicker === 'function' && typeof pickerWindow.showSaveFilePicker === 'function';
  }

  hasWorkspace(): boolean {
    return this.workspaceHandle !== null;
  }

  workspaceName(): string | null {
    return this.workspaceHandle?.name ?? null;
  }

  async createWorkspace(suggestedName = 'ragtime5500-workspace.sqlite3'): Promise<string> {
    const pickerWindow = window as FilePickerWindow;
    if (typeof pickerWindow.showSaveFilePicker !== 'function') {
      throw new Error('This browser does not expose the local file workspace API required by the standalone app.');
    }

    const handle = await pickerWindow.showSaveFilePicker({
      id: 'ragtime5500-workspace',
      suggestedName,
      types: PICKER_TYPES,
      excludeAcceptAllOption: false,
    });

    await this.request({ type: 'reset' });
    this.workspaceHandle = handle;
    await this.persistSnapshot();
    return handle.name;
  }

  async openWorkspace(): Promise<string> {
    const pickerWindow = window as FilePickerWindow;
    if (typeof pickerWindow.showOpenFilePicker !== 'function') {
      throw new Error('This browser does not expose the local file workspace API required by the standalone app.');
    }

    const handles = await pickerWindow.showOpenFilePicker({
      id: 'ragtime5500-workspace',
      multiple: false,
      types: PICKER_TYPES,
      excludeAcceptAllOption: false,
    });
    const handle = handles[0];
    if (!handle) throw new Error('No workspace file was selected.');

    const file = await handle.getFile();
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) throw new Error('The selected workspace file is empty.');

    await this.request({ type: 'restore', bytes }, [bytes]);
    this.workspaceHandle = handle;
    return handle.name;
  }

  async exec<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, bind?: SqlBind): Promise<T[]> {
    const mutating = !looksReadOnly(sql);
    if (mutating) this.requireWorkspace();
    const rows = await this.request<T[]>({ type: 'exec', sql, bind });
    if (mutating) await this.persistSnapshot();
    return rows;
  }

  async transaction(statements: Array<{ sql: string; bind?: SqlBind }>): Promise<unknown[][]> {
    this.requireWorkspace();
    const results = await this.request<unknown[][]>({ type: 'transaction', statements });
    await this.persistSnapshot();
    return results;
  }

  diagnostics(): Promise<DbDiagnostics> {
    return this.request({ type: 'diagnostics' });
  }

  exportDatabase(): Promise<ArrayBuffer> {
    return this.request({ type: 'export' });
  }

  async restoreDatabase(bytes: ArrayBuffer): Promise<{ restored: boolean; diagnostics: DbDiagnostics }> {
    this.requireWorkspace();
    const result = await this.request<{ restored: boolean; diagnostics: DbDiagnostics }>({ type: 'restore', bytes }, [bytes]);
    await this.persistSnapshot();
    return result;
  }

  async close(): Promise<{ closed: boolean }> {
    if (this.workspaceHandle) await this.persistSnapshot();
    return this.request({ type: 'close' });
  }
}

export const db = new DbClient();
