# Ragtime 5500

**Offline Form 5500 Case Database + Local Retrieval**

Ragtime 5500 is a local-first Vite + React + TypeScript application for importing, storing, tracing, querying, reviewing, and eventually analyzing Form 5500 filings across pension cases and plan years.

The structured SQLite database is authoritative. Full-text retrieval and future local RAG capabilities are secondary layers and may not invent database facts.

## Final-deliverable contract

The production application is exactly one standalone file:

`dist/ragtime5500.html`

The application is opened directly from the local filesystem with `file://`. It does not require a web server, backend, localhost process, network share, CDN, or internet connection.

JavaScript, CSS, SQLite WASM, the database worker, PDF.js, and other runtime resources are embedded into that HTML file. The build fails if Vite emits a second production runtime artifact.

Application navigation uses fragment routes such as `#/workspace`, `#/import`, `#/review`, `#/explore`, and `#/database`, so navigation never requires a server rewrite.

## Persistent data model for direct-file deployment

Chrome does not provide a dependable origin-private persistence environment for this application when it is opened directly with `file://`. Ragtime therefore uses a **user-selected local SQLite workspace file** rather than a browser-private OPFS database.

At startup the user chooses one of two actions:

- **Open existing workspace** — select an existing `.sqlite3`, `.sqlite`, or `.db` Ragtime workspace.
- **Create new workspace** — choose a local filename for a new SQLite workspace.

All case data, imported eFAST rows, extracted values, audit history, document chunks, and the imported CSV/PDF bytes themselves are stored inside that SQLite workspace. The HTML application remains one file; the workspace file is user data, not an application dependency.

After closing Chrome or restarting the workstation, open `ragtime5500.html` again and choose the same workspace file.

## Security invariant

Normal application runtime is designed for **zero outbound network communication**:

- CSP contains `connect-src 'none'`.
- Browser connection APIs are disabled before feature modules load.
- No CDN resources, remote fonts, analytics, telemetry, cloud APIs, or hosted models are used.
- eFAST URLs are inert provenance strings only; they are never fetched automatically.
- SQLite WASM is embedded into the production HTML and initialized from local bytes.
- The database and PDF.js workers are embedded into the HTML.
- PDF.js receives user-selected local bytes; it is never given an eFAST URL.
- Imported source-document bytes are stored inside the local SQLite workspace.
- No server is required or provided for office runtime.
- CI audits that production `dist/` contains exactly one HTML file.

See `docs/security.md`, `docs/architecture-decisions/002-direct-file-workspace.md`, and `docs/milestone-1-test-plan.md`.

## Public-repository data policy

This repository contains **application source code only**. Do not commit pension case material.

The `.gitignore` blocks common case-data artifacts including PDFs, imported CSVs, SQLite databases, backups, browser data, and local model files. Test fixtures use synthetic names and values. Real acceptance values and source-page evidence belong only in the user's local Ragtime workspace.

## Development

Dependencies are acquired on a development machine. The resulting single HTML artifact can then be transferred to the air-gapped workstation; normal office runtime does not require npm, a server, or internet access.

```bash
npm install
npm run check
```

After a successful check, the only production runtime artifact is:

```text
dist/ragtime5500.html
```

## Milestone 1 scope

- Case / Plan / Plan Year / Filing CRUD
- eFAST CSV import with raw rows preserved
- bulk local PDF import
- deterministic PDF-to-CSV matching
- local PDF text extraction and page chunks
- Schedule H Part I line 1C9 BOY/EOY extraction for 2024
- complete structured provenance
- exact-location and canonical-concept retrieval
- SQLite export/restore
- FTS5 schema for later local RAG
- dedicated review surfaces for matching and extraction
- single-file HTML production build
- file-safe internal hash routing
- user-selected local SQLite workspace persistence

The designated local acceptance filing must only be marked verified after its actual local source PDF is imported and the page-level evidence is reviewed. Real case names, values, PDFs, and CSVs are intentionally absent from this repository.
