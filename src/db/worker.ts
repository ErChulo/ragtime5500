/// <reference lib="webworker" />
import sqliteWasmBase64 from 'virtual:sqlite-wasm-bytes';
import { migrations } from './migrations';

type BindValue = string | number | bigint | null | Uint8Array;
type Bind = BindValue[] | Record<string, BindValue>;

type Request =
  | { id: number; type: 'init' }
  | { id: number; type: 'exec'; sql: string; bind?: Bind }
  | { id: number; type: 'transaction'; statements: Array<{ sql: string; bind?: Bind }> }
  | { id: number; type: 'export' }
  | { id: number; type: 'restore'; bytes: ArrayBuffer }
  | { id: number; type: 'close' };

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const DB_NAME = '/ragtime5500.sqlite3';
let sqlite3: any;
let pool: any;
let db: any;

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function execRows(sql: string, bind?: Bind): unknown[] {
  const options: Record<string, unknown> = {
    sql,
    rowMode: 'object',
    returnValue: 'resultRows',
  };
  if (bind !== undefined) options.bind = bind;
  return db.exec(options) as unknown[];
}

async function applyMigrations(): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum_sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const migration of migrations) {
    const checksum = await sha256Text(migration.sql);
    const existing = db.selectObject(
      'SELECT version, checksum_sha256 FROM schema_migration WHERE version = ?',
      [migration.version],
    ) as { version: number; checksum_sha256: string } | undefined;

    if (existing) {
      if (existing.checksum_sha256 !== checksum) {
        throw new Error(`Migration checksum mismatch for ${migration.filename}.`);
      }
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.exec({
        sql: 'INSERT INTO schema_migration(version, filename, checksum_sha256) VALUES(?,?,?)',
        bind: [migration.version, migration.filename, checksum],
      });
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    }
  }
}

async function openDatabase(): Promise<void> {
  if (!sqlite3) {
    const scope = globalThis as typeof globalThis & { sqlite3ApiConfig?: Record<string, unknown> };
    scope.sqlite3ApiConfig = {
      disable: { vfs: { opfs: true, 'opfs-wl': true, kvvfs: true } },
    };

    const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm');
    sqlite3 = await sqlite3InitModule({ wasmBinary: decodeBase64(sqliteWasmBase64) });
    pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'ragtime5500-sahpool',
      directory: '.ragtime5500-sahpool',
      initialCapacity: 8,
    });
    await pool.reserveMinimumCapacity(8);
  }

  if (!db) {
    db = new pool.OpfsSAHPoolDb(DB_NAME);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = DELETE');
    await applyMigrations();
  }
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'init':
      await openDatabase();
      return {
        sqliteVersion: sqlite3.version.libVersion,
        persistence: 'OPFS opfs-sahpool',
        filename: DB_NAME,
        foreignKeys: db.selectValue('PRAGMA foreign_keys'),
      };

    case 'exec':
      await openDatabase();
      return execRows(request.sql, request.bind);

    case 'transaction': {
      await openDatabase();
      const results: unknown[][] = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const statement of request.statements) {
          results.push(execRows(statement.sql, statement.bind));
        }
        db.exec('COMMIT');
        return results;
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* preserve original error */ }
        throw error;
      }
    }

    case 'export': {
      await openDatabase();
      const bytes = pool.exportFile(DB_NAME) as Uint8Array;
      return bytes.slice().buffer;
    }

    case 'restore':
      await openDatabase();
      db.close();
      db = undefined;
      pool.importDb(DB_NAME, new Uint8Array(request.bytes));
      await openDatabase();
      return { restored: true };

    case 'close':
      if (db) {
        db.close();
        db = undefined;
      }
      return { closed: true };
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const result = await handle(request);
    const response: Response = { id: request.id, ok: true, result };
    if (request.type === 'export' && result instanceof ArrayBuffer) {
      self.postMessage(response, [result]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    const response: Response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
