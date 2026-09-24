const DB_NAME = 'ragtime5500-local';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const FILE_STORE = 'files';
const SQLITE_KEY = 'sqlite-main';

interface StoredBinaryRecord {
  key: string;
  bytes: ArrayBuffer;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Unable to open Ragtime 5500 IndexedDB storage.'));
    };
  });

  return databasePromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function copyBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

async function putBinary(storeName: string, key: string, bytes: ArrayBuffer | Uint8Array): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  store.put({
    key,
    bytes: copyBuffer(bytes),
    updatedAt: new Date().toISOString(),
  } satisfies StoredBinaryRecord);
  await transactionDone(transaction);
}

async function getBinary(storeName: string, key: string): Promise<ArrayBuffer | null> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const record = await requestResult(store.get(key)) as StoredBinaryRecord | undefined;
  await transactionDone(transaction);
  return record?.bytes ? record.bytes.slice(0) : null;
}

async function deleteBinary(storeName: string, key: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export function readSqliteSnapshot(): Promise<ArrayBuffer | null> {
  return getBinary(STATE_STORE, SQLITE_KEY);
}

export function writeSqliteSnapshot(bytes: ArrayBuffer | Uint8Array): Promise<void> {
  return putBinary(STATE_STORE, SQLITE_KEY, bytes);
}

export function writeFileBytes(storageKey: string, bytes: ArrayBuffer | Uint8Array): Promise<void> {
  return putBinary(FILE_STORE, storageKey, bytes);
}

export function readFileBytes(storageKey: string): Promise<ArrayBuffer | null> {
  return getBinary(FILE_STORE, storageKey);
}

export function deleteFileBytes(storageKey: string): Promise<void> {
  return deleteBinary(FILE_STORE, storageKey);
}
