import { deleteFileBytes, readFileBytes, writeFileBytes } from '../storage/indexedDb';
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
  const storedName = `${sha256}${extension}`;
  const storageKey = `${ROOT}/${category}/${storedName}`;

  await writeFileBytes(storageKey, bytes);

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
  await writeFileBytes(storageKey, bytes);
}

export async function readStoredFile(storageKey: string): Promise<Uint8Array> {
  assertStorageKey(storageKey);
  const bytes = await readFileBytes(storageKey);
  if (!bytes) throw new Error('Stored local file is missing from IndexedDB.');
  return new Uint8Array(bytes);
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    assertStorageKey(storageKey);
  } catch {
    return;
  }
  await deleteFileBytes(storageKey);
}
