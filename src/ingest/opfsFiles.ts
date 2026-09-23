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

async function rootDirectory(): Promise<FileSystemDirectoryHandle> {
  const opfs = await navigator.storage.getDirectory();
  return opfs.getDirectoryHandle(ROOT, { create: true });
}

async function ensurePath(path: string[]): Promise<FileSystemDirectoryHandle> {
  let current = await rootDirectory();
  for (const part of path) current = await current.getDirectoryHandle(part, { create: true });
  return current;
}

function extensionOf(filename: string): string {
  const match = filename.match(/(\.[A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : '';
}

function parseStorageKey(storageKey: string): { directories: string[]; filename: string } {
  const parts = storageKey.split('/').filter(Boolean);
  if (parts.shift() !== ROOT || parts.length < 2) throw new Error('Invalid Ragtime 5500 storage key.');
  const filename = parts.pop()!;
  if (!parts.every((part) => /^[A-Za-z0-9._-]+$/.test(part)) || !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new Error('Storage key contains an unsupported path segment.');
  }
  return { directories: parts, filename };
}

export async function storeLocalFile(file: File, category: 'csv' | 'pdf' | 'backup' | 'other'): Promise<StoredFile> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sha256 = await sha256Hex(bytes);
  const extension = extensionOf(file.name);
  const directory = await ensurePath([category]);
  const storedName = `${sha256}${extension}`;
  const handle = await directory.getFileHandle(storedName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();

  return {
    sha256,
    storageKey: `${ROOT}/${category}/${storedName}`,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    bytes,
  };
}

export async function writeStoredFile(storageKey: string, bytes: Uint8Array): Promise<void> {
  const { directories, filename } = parseStorageKey(storageKey);
  const directory = await ensurePath(directories);
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await writable.write(copy.buffer);
  await writable.close();
}

export async function readStoredFile(storageKey: string): Promise<Uint8Array> {
  const { directories, filename } = parseStorageKey(storageKey);
  let directory = await rootDirectory();
  for (const part of directories) directory = await directory.getDirectoryHandle(part);
  const file = await (await directory.getFileHandle(filename)).getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  let parsed: { directories: string[]; filename: string };
  try {
    parsed = parseStorageKey(storageKey);
  } catch {
    return;
  }

  let directory = await rootDirectory();
  for (const part of parsed.directories) directory = await directory.getDirectoryHandle(part);
  await directory.removeEntry(parsed.filename);
}
