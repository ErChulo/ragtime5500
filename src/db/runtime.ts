import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import sqliteWasmBase64 from 'virtual:sqlite-wasm-bytes';
import { migrations } from './migrations';

export type BindValue = string | number | bigint | null | Uint8Array;
export type Bind = BindValue[] | Record<string, BindValue>;

export type DbRequest =
  | { type: 'init'; bytes?: ArrayBuffer }
  | { type: 'exec'; sql: string; bind?: Bind }
  | { type: 'transaction'; statements: Array<{ sql: string; bind?: Bind }> }
  | { type: 'reset' }
  | { type: 'diagnostics' }
  | { type: 'export' }
  | { type: 'restore'; bytes: ArrayBuffer }
  | { type: 'close' };

export interface RuntimeDiagnostics {
  quickCheck: string;
  foreignKeyViolationCount: number;
  migrationVersion: number;
  pageCount: number;
  pageSize: number;
  databaseBytes: number;
}

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

export class LocalDbRuntime {
  private sqlite3: any;
  private db: any;
  private openPromise: Promise<void> | null = null;

  private execRows(sql: string, bind?: Bind): unknown[] {
    const options: Record<string, unknown> = {
      sql,
      rowMode: 'object',
      returnValue: 'resultRows',
    };
    if (bind !== undefined) options.bind = bind;
    return this.db.exec(options) as unknown[];
  }

  private async applyMigrations(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum_sha256 TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of migrations) {
      const checksum = await sha256Text(migration.sql);
      const existing = this.db.selectObject(
        'SELECT version, checksum_sha256 FROM schema_migration WHERE version = ?',
        [migration.version],
      ) as { version: number; checksum_sha256: string } | undefined;

      if (existing) {
        if (existing.checksum_sha256 !== checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.filename}.`);
        }
        continue;
      }

      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(migration.sql);
        this.db.exec({
          sql: 'INSERT INTO schema_migration(version, filename, checksum_sha256) VALUES(?,?,?)',
          bind: [migration.version, migration.filename, checksum],
        });
        this.db.exec('COMMIT');
      } catch (error) {
        try { this.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
        throw error;
      }
    }
  }

  private diagnostics(): RuntimeDiagnostics {
    const quickRows = this.execRows('PRAGMA quick_check') as Array<Record<string, unknown>>;
    const quickCheck = String(quickRows[0]?.quick_check ?? quickRows[0]?.integrity_check ?? '');
    const foreignKeyViolationCount = (this.execRows('PRAGMA foreign_key_check') as unknown[]).length;
    const migrationVersion = Number(this.db.selectValue('SELECT COALESCE(MAX(version),0) FROM schema_migration') ?? 0);
    const pageCount = Number(this.db.selectValue('PRAGMA page_count') ?? 0);
    const pageSize = Number(this.db.selectValue('PRAGMA page_size') ?? 0);
    return {
      quickCheck,
      foreignKeyViolationCount,
      migrationVersion,
      pageCount,
      pageSize,
      databaseBytes: pageCount * pageSize,
    };
  }

  private assertHealthy(result: RuntimeDiagnostics): void {
    if (result.quickCheck.toLowerCase() !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${result.quickCheck || 'unknown result'}.`);
    }
    if (result.foreignKeyViolationCount !== 0) {
      throw new Error(`SQLite foreign_key_check found ${result.foreignKeyViolationCount} violation(s).`);
    }
  }

  private async initSqlite(): Promise<void> {
    if (this.sqlite3) return;

    const scope = globalThis as typeof globalThis & { sqlite3ApiConfig?: Record<string, unknown> };
    scope.sqlite3ApiConfig = {
      disable: { vfs: { opfs: true, 'opfs-wl': true, kvvfs: true } },
    };

    const initWithLocalWasm = sqlite3InitModule as unknown as (
      config: { wasmBinary: Uint8Array },
    ) => Promise<any>;

    this.sqlite3 = await initWithLocalWasm({ wasmBinary: decodeBase64(sqliteWasmBase64) });
  }

  private openFromBytes(bytes?: ArrayBuffer): void {
    if (this.db) this.db.close();

    this.db = new this.sqlite3.oo1.DB(':memory:', 'c');

    if (bytes && bytes.byteLength) {
      const source = new Uint8Array(bytes);
      const pointer = this.sqlite3.wasm.allocFromTypedArray(source);
      const flags = this.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | this.sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
      const rc = this.sqlite3.capi.sqlite3_deserialize(
        this.db.pointer,
        'main',
        pointer,
        source.byteLength,
        source.byteLength,
        flags,
      );
      this.db.checkRc(rc);
    }

    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = MEMORY');
  }

  private async openDatabaseOnce(bytes?: ArrayBuffer): Promise<void> {
    await this.initSqlite();
    if (!this.db) {
      this.openFromBytes(bytes);
      await this.applyMigrations();
    }
  }

  private async openDatabase(bytes?: ArrayBuffer): Promise<void> {
    if (this.db) return;
    if (!this.openPromise) {
      this.openPromise = this.openDatabaseOnce(bytes).finally(() => {
        this.openPromise = null;
      });
    }
    await this.openPromise;
  }

  private exportDatabaseBytes(): ArrayBuffer {
    const bytes = this.sqlite3.capi.sqlite3_js_db_export(this.db) as Uint8Array;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }

  async handle(request: DbRequest): Promise<unknown> {
    switch (request.type) {
      case 'init':
        await this.openDatabase(request.bytes);
        return {
          sqliteVersion: this.sqlite3.version.libVersion,
          persistence: 'user-selected SQLite workspace file',
          filename: 'ragtime5500.sqlite3',
          foreignKeys: this.db.selectValue('PRAGMA foreign_keys'),
        };

      case 'exec':
        await this.openDatabase();
        return this.execRows(request.sql, request.bind);

      case 'transaction': {
        await this.openDatabase();
        const results: unknown[][] = [];
        this.db.exec('BEGIN IMMEDIATE');
        try {
          for (const statement of request.statements) {
            results.push(this.execRows(statement.sql, statement.bind));
          }
          this.db.exec('COMMIT');
          return results;
        } catch (error) {
          try { this.db.exec('ROLLBACK'); } catch { /* preserve original error */ }
          throw error;
        }
      }

      case 'reset':
        await this.initSqlite();
        this.openFromBytes();
        await this.applyMigrations();
        return { reset: true, diagnostics: this.diagnostics() };

      case 'diagnostics':
        await this.openDatabase();
        return this.diagnostics();

      case 'export': {
        await this.openDatabase();
        const result = this.diagnostics();
        this.assertHealthy(result);
        return this.exportDatabaseBytes();
      }

      case 'restore': {
        await this.openDatabase();
        const previous = this.exportDatabaseBytes();

        try {
          this.openFromBytes(request.bytes);
          await this.applyMigrations();
          const result = this.diagnostics();
          this.assertHealthy(result);
          return { restored: true, diagnostics: result };
        } catch (error) {
          try {
            this.openFromBytes(previous);
            await this.applyMigrations();
            this.assertHealthy(this.diagnostics());
          } catch (rollbackError) {
            throw new Error(
              `Restore failed and the previous database could not be reopened: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            );
          }

          throw new Error(`Restore rejected; the previous database was preserved. ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case 'close':
        if (this.db) {
          this.db.close();
          this.db = undefined;
        }
        return { closed: true };
    }
  }
}
