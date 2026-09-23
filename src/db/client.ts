import DbWorker from './worker?worker&inline';
type BindValue = string | number | bigint | null | Uint8Array;
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

export class DbClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    this.worker = new DbWorker();
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error));
    };
    this.worker.onerror = (event) => {
      for (const pending of this.pending.values()) pending.reject(event.error ?? new Error(event.message));
      this.pending.clear();
    };
  }

  private request<T>(payload: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, ...payload }, transfer);
    });
  }

  init(): Promise<{ sqliteVersion: string; persistence: string; filename: string; foreignKeys: number }> {
    return this.request({ type: 'init' });
  }

  exec<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, bind?: SqlBind): Promise<T[]> {
    return this.request({ type: 'exec', sql, bind });
  }

  transaction(statements: Array<{ sql: string; bind?: SqlBind }>): Promise<unknown[][]> {
    return this.request({ type: 'transaction', statements });
  }

  diagnostics(): Promise<DbDiagnostics> {
    return this.request({ type: 'diagnostics' });
  }

  exportDatabase(): Promise<ArrayBuffer> {
    return this.request({ type: 'export' });
  }

  restoreDatabase(bytes: ArrayBuffer): Promise<{ restored: boolean; diagnostics: DbDiagnostics }> {
    return this.request({ type: 'restore', bytes }, [bytes]);
  }

  close(): Promise<{ closed: boolean }> {
    return this.request({ type: 'close' });
  }
}

export const db = new DbClient();
