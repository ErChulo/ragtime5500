import initialSql from './migrations/001_initial.sql?raw';
import localSourceBlobsSql from './migrations/002_local_source_blobs.sql?raw';
import caseEqualsPlanSql from './migrations/003_case_equals_plan.sql?raw';

export interface Migration {
  version: number;
  filename: string;
  sql: string;
}

export const migrations: Migration[] = [
  { version: 1, filename: '001_initial.sql', sql: initialSql },
  { version: 2, filename: '002_local_source_blobs.sql', sql: localSourceBlobsSql },
  { version: 3, filename: '003_case_equals_plan.sql', sql: caseEqualsPlanSql },
];
