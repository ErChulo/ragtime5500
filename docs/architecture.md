# Ragtime 5500 — Milestone 1 Architecture

## 1. Repository structure

```text
ragtime5500/
├─ docs/
│  ├─ architecture.md
│  ├─ er-diagram.md
│  ├─ design-system.md
│  ├─ milestone-1-plan.md
│  ├─ milestone-1-test-plan.md
│  └─ security.md
├─ scripts/
│  ├─ audit-network.mjs
│  └─ serve-dist.mjs
├─ src/
│  ├─ app/
│  │  └─ App.tsx
│  ├─ components/
│  │  ├─ AppNavigation.tsx
│  │  ├─ BackupRestorePanel.tsx
│  │  ├─ CsvImportPanel.tsx
│  │  ├─ PdfImportPanel.tsx
│  │  ├─ HierarchyPanel.tsx
│  │  ├─ MatchReview.tsx
│  │  ├─ ExtractionReview.tsx
│  │  ├─ QueryPanel.tsx
│  │  ├─ SqlConsole.tsx
│  │  └─ ProvenanceCard.tsx
│  ├─ db/
│  │  ├─ client.ts
│  │  ├─ worker.ts
│  │  ├─ migrations.ts
│  │  ├─ repository.ts
│  │  └─ migrations/001_initial.sql
│  ├─ ingest/
│  │  ├─ csv.ts
│  │  ├─ efast.ts
│  │  └─ opfsFiles.ts
│  ├─ matching/
│  │  └─ matchPdf.ts
│  ├─ pdf/
│  │  ├─ extractText.ts
│  │  ├─ renderPage.ts
│  │  └─ scheduleH1c9.ts
│  ├─ security/
│  │  ├─ externalUrl.ts
│  │  └─ networkLockdown.ts
│  ├─ types/
│  │  └─ domain.ts
│  ├─ utils/
│  │  └─ hash.ts
│  ├─ main.tsx
│  ├─ bootstrap.tsx
│  └─ styles.css
├─ tests/
│  ├─ verify_schema.py
│  ├─ csv.spec.ts
│  ├─ matching.spec.ts
│  └─ scheduleH1c9.spec.ts
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

The business logic runs in the browser. A local static server is used only to serve the built files; it performs no data processing and binds to loopback only.

## 2. ER model

The authoritative hierarchy is:

`CASE → PLAN → PLAN_YEAR → FILING → LINE_DEFINITION → FILING_VALUE`

`SOURCE_DOCUMENT` is attached to both imports and filings. `FORM_DEFINITION` versions form layouts. `LINE_DEFINITION` maps form-specific locations to stable canonical concepts. `FILING_VALUE_REVISION` preserves old values when a user changes the current authoritative row.

See `docs/er-diagram.md`.

## 3. SQLite DDL

The complete DDL is `src/db/migrations/001_initial.sql`.

Design decisions:

- `pension_case` is used instead of `case` because `CASE` is SQL syntax.
- `line_definition.schedule_name` is stored explicitly so exact-location queries can remain simple and match the requested acceptance-query shape.
- `filing_value` contains the current authoritative representation.
- Before a correction replaces a current row, its prior state is copied to `filing_value_revision`; the original evidence is therefore not destroyed.
- `document_chunk_fts` is an FTS5 virtual table for local text retrieval. SQLite remains authoritative for structured values.
- Foreign keys, uniqueness constraints, and indexes are enabled from migration 1.

## 4. Migration strategy

Migrations are immutable numbered SQL files. Startup performs:

1. open the OPFS SQLite database;
2. create `schema_migration` if absent;
3. read applied versions;
4. execute each newer migration in one immediate transaction;
5. record `version`, filename, SHA-256 checksum, and timestamp;
6. rollback the migration on any failure.

A changed checksum for an already-applied migration is a hard error. Existing migrations are never edited after release; schema changes require a new numbered migration.

## 5. eFAST CSV ingestion

1. Read the user-selected file as bytes; no URL dereferencing occurs.
2. Compute SHA-256 locally with Web Crypto.
3. Copy the raw CSV bytes into the application's OPFS import store.
4. Insert `source_document` metadata with `source_type='EFAST_CSV'`.
5. Parse RFC-4180 CSV locally.
6. Preserve each original row as `raw_row_json` plus its original raw CSV record text.
7. Normalize known columns without inventing missing values.
8. Create/match case, plan, plan year, and expected filing records.
9. Store the `Link` field only as `source_url`/`original_source_url`; the UI renders it as inert text, never as a clickable anchor.
10. Insert `efast_import` and `efast_import_row` rows in one transaction.

No `fetch`, `XMLHttpRequest`, hyperlink navigation, or background retrieval is used.

## 6. Bulk PDF import and matching

For each selected local PDF:

1. compute SHA-256;
2. deduplicate by hash;
3. copy the PDF bytes to OPFS under a hash-derived storage key;
4. extract page text with bundled PDF.js from the in-memory bytes;
5. derive document signals: plan name, plan number, EIN, plan year, filing identifier, schedules, filename;
6. compare against unmatched `efast_import_row` records;
7. score deterministic evidence; no ML or cloud service is involved;
8. auto-accept only when score is at least 0.90 and exceeds the runner-up by at least 0.15;
9. otherwise mark `AMBIGUOUS` or `UNMATCHED` for review.

Initial score weights:

| Evidence | Weight |
|---|---:|
| Exact filing ID | 0.55 |
| Exact source-URL filename | 0.35 |
| Plan year | 0.15 |
| Plan number | 0.15 |
| EIN | 0.20 |
| Plan-name similarity | 0.10 |
| Exact filing date | 0.05 |

The score is capped at 1.0. Conflicting plan year or plan number applies a penalty and prevents automatic acceptance.

## 7. Local PDF extraction architecture

PDF.js is bundled in the Vite build. The application always calls `getDocument({data: bytes})`; it never passes a URL. The worker script is emitted as a local build asset.

Milestone 1 extraction is intentionally narrow:

- identify Schedule H pages from page text;
- locate the Part I assets section;
- detect line 1c(9), common/collective trusts;
- recover BOY and EOY amounts using position-aware tokens on the identified line;
- store page number, source text, method, and confidence;
- mark output `EXTRACTED_UNVERIFIED` unless the user verifies it.

Failure to confidently identify both values yields an extraction-review item; values are never inferred from neighboring lines.

## 8. Local persistence architecture

SQLite runs in a dedicated worker. Persistence uses SQLite's OPFS SyncAccessHandle Pool (`opfs-sahpool`) VFS, which is single-connection and therefore fits the application's one-database-worker design.

Important security choice: the SQLite WASM binary is embedded into the worker bundle at **build time** as bytes and passed as `wasmBinary` to the Emscripten initializer. That avoids a runtime `fetch()` for `sqlite3.wasm`, allowing `connect-src 'none'` to remain effective.

PDF and original import files are copied into a separate OPFS directory keyed by SHA-256. The SQLite database stores only the storage key and metadata, not an external path.

Database export uses SQLite serialization to produce a local downloadable `.sqlite3` file. Restore closes the current DB, imports user-selected bytes into the SAH pool, reopens it, and reruns migration validation.

## 9. Zero-network security architecture

The browser policy is deny-by-default:

```text
default-src 'self';
connect-src 'none';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
worker-src 'self' blob:;
media-src 'self' blob:;
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none';
```

Additional controls:

- no runtime URLs are imported from CDNs;
- eFAST URLs are data only and rendered with `<code>`/text, not `<a href>`;
- no telemetry, analytics, service workers, WebSocket, EventSource, or XHR;
- a source-audit script fails on forbidden network primitives and remote runtime imports;
- the production static server binds only to `127.0.0.1`;
- all user documents are processed in memory/OPFS locally;
- optional future models must be packaged local assets and hash-verified before use.

## 10. RAG extension architecture

Milestone 1 includes only the schema and FTS5 retrieval substrate.

Future path:

`DOCUMENT_CHUNK → FTS5 candidates → optional local embedding reranker → optional local LLM`

Rules:

- structured questions are answered by SQL first;
- the RAG layer may not overwrite or manufacture `filing_value` facts;
- every RAG answer must cite plan year, schedule/form, part, location, page, and source document;
- embedding and model binaries are local, versioned, and stored with SHA-256 in `model_metadata`;
- if no source supports a statement, the answer must say the evidence is unavailable.
