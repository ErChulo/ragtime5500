/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import sqliteWasmBase64 from 'virtual:sqlite-wasm-bytes';
import { migrations } from './migrations';

type BindValue = string | number | bigint | null | Uint8Array;
type Bind = BindValue[] | Record<string, BindValue>;

type Request =
  | { id: number; type: 'init' }
  | { id: number; type: 'exec'; sql: string; bind?: Bind }
  | { id: number; type: 'transaction'; statements: Array<{ sql: string; bind?: Bind }> }
  | { id: number; type: 'diagnostics' }
  | { id: number; type: 'export' }
  | { id: number; type: 'restore'; bytes: ArrayBuffer }
  | { id: number; type: 'close' };

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

interface Diagnostics {
  quickCheck: string;
  foreignKeyViolationCount: number;
  migrationVersion: number;
  pageCount: number;
  pageSize: number;
  databaseBytes: number;
}

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

function diagnostics(): Diagnostics {
  const quickRows = execRows('PRAGMA quick_check') as Array<Record<string, unknown>>;
  const quickCheck = String(quickRows[0]?.quick_check ?? quickRows[0]?.integrity_check ?? '');
  const foreignKeyViolationCount = (execRows('PRAGMA foreign_key_check') as unknown[]).length;
  const migrationVersion = Number(db.selectValue('SELECT COALESCE(MAX(version),0) FROM schema_migration') ?? 0);
  const pageCount = Number(db.selectValue('PRAGMA page_count') ?? 0);
  const pageSize = Number(db.selectValue('PRAGMA page_size') ?? 0);
  return {
    quickCheck,
    foreignKeyViolationCount,
    migrationVersion,
    pageCount,
    pageSize,
    databaseBytes: pageCount * pageSize,
  };
}

function assertHealthy(result: Diagnostics): void {
  if (result.quickCheck.toLowerCase() !== 'ok') {
    throw new Error(`SQLite quick_check failed: ${result.quickCheck || 'unknown result'}.`);
  }
  if (result.foreignKeyViolationCount !== 0) {
    throw new Error(`SQLite foreign_key_check found ${result.foreignKeyViolationCount} violation(s).`);
  }
}

async function openDatabase(): Promise<void> {
  if (!sqlite3) {
    const scope = globalThis as typeof globalThis & { sqlite3ApiConfig?: Record<string, unknown> };
    scope.sqlite3ApiConfig = {
      disable: { vfs: { opfs: true, 'opfs-wl': true, kvvfs: true } },
    };

    const initWithLocalWasm = sqlite3InitModule as unknown as (
      config: { wasmBinary: Uint8Array },
    ) => Promise<any>;

    sqlite3 = await initWithLocalWasm({ wasmBinary: decodeBase64(sqliteWasmBase64) });
    pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'ragtime5500-sahpool',
      directory: '.ragtime5500-sahpool',
      initialCapacity: 8,
    });
    await pool.reserveMinimumCapacity();
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

    case 'diagnostics':
      await openDatabase();
      return diagnostics();

    case 'export': {
      await openDatabase();
      const result = diagnostics();
      assertHealthy(result);
      const bytes = pool.exportFile(DB_NAME) as Uint8Array;
      return bytes.slice().buffer;
    }

    case 'restore': {
      await openDatabase();
      const previous = (pool.exportFile(DB_NAME) as Uint8Array).slice();

      try {
        db.close();
        db = undefined;
        pool.importDb(DB_NAME, new Uint8Array(request.bytes));
        await openDatabase();
        const result = diagnostics();
        assertHealthy(result);
        return { restored: true, diagnostics: result };
      } catch (error) {
        try {
          if (db) db.close();
        } catch {
          // Continue with restoration of the previous known-good database.
        }
        db = undefined;

        try {
          pool.importDb(DB_NAME, previous);
          await openDatabase();
          assertHealthy(diagnostics());
        } catch (rollbackError) {
          throw new Error(
            `Restore failed and the previous database could not be reopened: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          );
        }

        throw new Error(`Restore rejected; the previous database was preserved. ${error instanceof Error ? error.message : String(error)}`);
      }
    }

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
