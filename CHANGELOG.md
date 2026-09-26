# Ragtime 5500 Changelog

## 0.1.1-test.3

Stable-test UX and traceability checkpoint.

- Added visible application version metadata.
- Versioned user-facing exports: SQLite backups, full workspace archives, and CSV exports.
- Full workspace archives now record the creating application version in their manifest.
- Added reusable process feedback with spinner, elapsed time, batch counts, and estimated/typical wait guidance.
- Added process feedback to workspace open/create, case saves, eFAST CSV import, plan-number filtering, PDF import/matching, local searches, SQL queries, source-page rendering, extraction review, integrity checks, and backup/restore.
- PDF matching uses a four-digit filename such as `2009.pdf` as plan-year evidence after the CSV has been filtered to the case plan number.
- eFAST imports preserve all source rows while target filings are selected by the case plan number.

Version policy: every user-facing artifact must expose either the semantic application version, an immutable source commit, or both.
