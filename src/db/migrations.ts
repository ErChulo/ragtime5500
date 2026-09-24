import initialSql from './migrations/001_initial.sql?raw';
import localSourceBlobsSql from './migrations/002_local_source_blobs.sql?raw';

export interface Migration {
  version: number;
  filename: string;
  sql: string;
}

export const migrations: Migration[] = [
  { version: 1, filename: '001_initial.sql', sql: initialSql },
  { version: 2, filename: '002_local_source_blobs.sql', sql: localSourceBlobsSql },
];
