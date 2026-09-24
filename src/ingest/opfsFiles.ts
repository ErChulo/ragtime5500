import { db } from '../db/client';
import { sha256Hex } from '../utils/hash';

export interface StoredFile {
  sha256: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

const ROOT = 'ragtime5500-user-files';

function extensionOf(filename: string): string {
  const match = filename.match(/(\.[A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : '';
}

function assertStorageKey(storageKey: string): void {
  const parts = storageKey.split('/').filter(Boolean);
  if (parts.shift() !== ROOT || parts.length < 2) throw new Error('Invalid Ragtime 5500 storage key.');
  if (!parts.every((part) => /^[A-Za-z0-9._-]+$/.test(part))) {
    throw new Error('Storage key contains an unsupported path segment.');
  }
}

export async function storeLocalFile(file: File, category: 'csv' | 'pdf' | 'backup' | 'other'): Promise<StoredFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sha256 = await sha256Hex(bytes);
  const extension = extensionOf(file.name);
  const storageKey = `${ROOT}/${category}/${sha256}${extension}`;

  await db.exec(
    `INSERT INTO local_file_blob(storage_key, bytes)
     VALUES(?,?)
     ON CONFLICT(storage_key) DO UPDATE SET
       bytes=excluded.bytes,
       updated_at=CURRENT_TIMESTAMP`,
    [storageKey, bytes],
  );

  return {
    sha256,
    storageKey,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    bytes,
  };
}

export async function writeStoredFile(storageKey: string, bytes: Uint8Array): Promise<void> {
  assertStorageKey(storageKey);
  await db.exec(
    `INSERT INTO local_file_blob(storage_key, bytes)
     VALUES(?,?)
     ON CONFLICT(storage_key) DO UPDATE SET
       bytes=excluded.bytes,
       updated_at=CURRENT_TIMESTAMP`,
    [storageKey, bytes],
  );
}

export async function readStoredFile(storageKey: string): Promise<Uint8Array> {
  assertStorageKey(storageKey);
  const rows = await db.exec<{ bytes: Uint8Array }>(
    'SELECT bytes FROM local_file_blob WHERE storage_key=?',
    [storageKey],
  );
  const value = rows[0]?.bytes;
  if (!value) throw new Error('Stored local source file is missing from the Ragtime workspace database.');
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    assertStorageKey(storageKey);
  } catch {
    return;
  }
  await db.exec('DELETE FROM local_file_blob WHERE storage_key=?', [storageKey]);
}
