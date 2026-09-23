import { db, type DbDiagnostics } from '../db/client';
import { listSourceDocuments } from '../db/repository';
import { readStoredFile, writeStoredFile } from '../ingest/opfsFiles';
import { sha256Hex } from '../utils/hash';

const MAGIC_TEXT = 'RAGTIME5500_WORKSPACE_V1\n';
const MAGIC = new TextEncoder().encode(MAGIC_TEXT);
const LENGTH_BYTES = 4;
const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;

interface ArchiveSource {
  storageKey: string;
  filename: string;
  mimeType: string;
  sha256: string;
  size: number;
}

interface ArchiveManifest {
  format: 'ragtime5500-workspace';
  version: 1;
  createdAt: string;
  sqlite: {
    size: number;
    sha256: string;
  };
  sources: ArchiveSource[];
}

export interface WorkspaceArchiveResult {
  documentCount: number;
  archiveBytes: number;
}

export interface WorkspaceRestoreResult {
  documentCount: number;
  diagnostics: DbDiagnostics;
}

function uint32Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(LENGTH_BYTES);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function readUint32(bytes: Uint8Array): number {
  if (bytes.byteLength !== LENGTH_BYTES) throw new Error('Workspace archive header is truncated.');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function validateManifest(value: unknown): ArchiveManifest {
  if (!value || typeof value !== 'object') throw new Error('Workspace archive manifest is invalid.');
  const manifest = value as Partial<ArchiveManifest>;
  if (manifest.format !== 'ragtime5500-workspace' || manifest.version !== 1) {
    throw new Error('Unsupported Ragtime 5500 workspace archive format.');
  }
  if (!manifest.sqlite || typeof manifest.sqlite.size !== 'number' || typeof manifest.sqlite.sha256 !== 'string') {
    throw new Error('Workspace archive is missing SQLite metadata.');
  }
  if (!Number.isSafeInteger(manifest.sqlite.size) || manifest.sqlite.size < 0 || !/^[a-f0-9]{64}$/i.test(manifest.sqlite.sha256)) {
    throw new Error('Workspace archive contains invalid SQLite metadata.');
  }
  if (!Array.isArray(manifest.sources)) throw new Error('Workspace archive is missing source-document metadata.');

  const seen = new Set<string>();
  for (const source of manifest.sources) {
    if (!source || typeof source !== 'object') throw new Error('Workspace archive contains an invalid source-document record.');
    if (
      typeof source.storageKey !== 'string' ||
      typeof source.filename !== 'string' ||
      typeof source.mimeType !== 'string' ||
      typeof source.sha256 !== 'string' ||
      typeof source.size !== 'number'
    ) {
      throw new Error('Workspace archive contains incomplete source-document metadata.');
    }
    if (!Number.isSafeInteger(source.size) || source.size < 0 || !/^[a-f0-9]{64}$/i.test(source.sha256)) {
      throw new Error(`Workspace archive contains invalid metadata for ${source.filename || source.storageKey}.`);
    }
    if (seen.has(source.storageKey)) throw new Error(`Workspace archive repeats storage key ${source.storageKey}.`);
    seen.add(source.storageKey);
  }

  return manifest as ArchiveManifest;
}

export async function createWorkspaceArchive(): Promise<{ blob: Blob; result: WorkspaceArchiveResult }> {
  const sqliteBuffer = await db.exportDatabase();
  const sqliteBytes = new Uint8Array(sqliteBuffer);
  const sqliteHash = await sha256Hex(sqliteBytes);
  const documents = await listSourceDocuments();

  const sources: ArchiveSource[] = [];
  const sourceBytes: Uint8Array[] = [];

  for (const document of documents) {
    const storageKey = String(document.storage_key ?? '');
    const filename = String(document.filename ?? '');
    const bytes = await readStoredFile(storageKey);
    const expectedSize = Number(document.file_size);
    const expectedHash = String(document.sha256 ?? '');

    if (bytes.byteLength !== expectedSize) {
      throw new Error(`Cannot create full backup: ${filename} has a size mismatch.`);
    }

    const actualHash = await sha256Hex(bytes);
    if (actualHash !== expectedHash) {
      throw new Error(`Cannot create full backup: ${filename} failed SHA-256 verification.`);
    }

    sources.push({
      storageKey,
      filename,
      mimeType: String(document.mime_type ?? 'application/octet-stream'),
      sha256: expectedHash,
      size: expectedSize,
    });
    sourceBytes.push(bytes);
  }

  const manifest: ArchiveManifest = {
    format: 'ragtime5500-workspace',
    version: 1,
    createdAt: new Date().toISOString(),
    sqlite: { size: sqliteBytes.byteLength, sha256: sqliteHash },
    sources,
  };

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new Error('Workspace archive manifest is unexpectedly large.');

  const blob = new Blob(
    [
      asArrayBuffer(MAGIC),
      asArrayBuffer(uint32Bytes(manifestBytes.byteLength)),
      asArrayBuffer(manifestBytes),
      asArrayBuffer(sqliteBytes),
      ...sourceBytes.map(asArrayBuffer),
    ],
    { type: 'application/octet-stream' },
  );

  return {
    blob,
    result: {
      documentCount: sources.length,
      archiveBytes: blob.size,
    },
  };
}

export async function restoreWorkspaceArchive(file: File): Promise<WorkspaceRestoreResult> {
  const prefixSize = MAGIC.byteLength + LENGTH_BYTES;
  if (file.size < prefixSize) throw new Error('Workspace archive is too small.');

  const prefix = new Uint8Array(await file.slice(0, prefixSize).arrayBuffer());
  if (!sameBytes(prefix.subarray(0, MAGIC.byteLength), MAGIC)) {
    throw new Error('This file is not a Ragtime 5500 workspace archive.');
  }

  const manifestLength = readUint32(prefix.subarray(MAGIC.byteLength));
  if (manifestLength <= 0 || manifestLength > MAX_MANIFEST_BYTES) {
    throw new Error('Workspace archive manifest length is invalid.');
  }

  const manifestStart = prefixSize;
  const manifestEnd = manifestStart + manifestLength;
  if (manifestEnd > file.size) throw new Error('Workspace archive manifest is truncated.');

  let manifest: ArchiveManifest;
  try {
    const manifestText = await file.slice(manifestStart, manifestEnd).text();
    manifest = validateManifest(JSON.parse(manifestText));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Workspace archive manifest JSON is invalid.');
    throw error;
  }

  let offset = manifestEnd;
  const sqliteEnd = offset + manifest.sqlite.size;
  if (sqliteEnd > file.size) throw new Error('Workspace archive SQLite payload is truncated.');

  const sqliteBuffer = await file.slice(offset, sqliteEnd).arrayBuffer();
  const sqliteBytes = new Uint8Array(sqliteBuffer);
  if (await sha256Hex(sqliteBytes) !== manifest.sqlite.sha256) {
    throw new Error('Workspace archive SQLite payload failed SHA-256 verification.');
  }
  offset = sqliteEnd;

  // First pass: validate every source payload before writing anything.
  for (const source of manifest.sources) {
    const end = offset + source.size;
    if (end > file.size) throw new Error(`Workspace archive is truncated at ${source.filename}.`);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    if (await sha256Hex(bytes) !== source.sha256) {
      throw new Error(`Workspace archive source file ${source.filename} failed SHA-256 verification.`);
    }
    offset = end;
  }
  if (offset !== file.size) throw new Error('Workspace archive contains unexpected trailing bytes.');

  // Second pass: restore content-addressed source files. Orphaned files are harmless if DB restore later rejects.
  offset = sqliteEnd;
  for (const source of manifest.sources) {
    const end = offset + source.size;
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    await writeStoredFile(source.storageKey, bytes);
    offset = end;
  }

  const restoreBuffer = sqliteBuffer.slice(0);
  const restored = await db.restoreDatabase(restoreBuffer);

  const databaseSources = await listSourceDocuments();
  const databaseIndex = new Map(databaseSources.map((row) => [String(row.storage_key), row]));
  for (const source of manifest.sources) {
    const row = databaseIndex.get(source.storageKey);
    if (!row || String(row.sha256) !== source.sha256 || Number(row.file_size) !== source.size) {
      throw new Error(`Restored database metadata does not match archived source file ${source.filename}.`);
    }
  }

  return {
    documentCount: manifest.sources.length,
    diagnostics: restored.diagnostics,
  };
}
