import initialSql from './migrations/001_initial.sql?raw';

export interface Migration {
  version: number;
  filename: string;
  sql: string;
}

export const migrations: Migration[] = [
  { version: 1, filename: '001_initial.sql', sql: initialSql },
];
