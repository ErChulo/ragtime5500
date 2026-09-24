# Ragtime 5500

**Offline Form 5500 Case Database + Local Retrieval**

Ragtime 5500 is a local-first Vite + React + TypeScript application for importing, storing, tracing, querying, reviewing, and eventually analyzing Form 5500 filings across pension cases and plan years.

The structured SQLite database is authoritative. Full-text retrieval and future local RAG capabilities are secondary layers and may not invent database facts.

## Final-deliverable contract

The production build is constrained to **one standalone HTML file**:

`dist/ragtime5500.html`

JavaScript, CSS, SQLite WASM, the SQLite worker, the PDF.js worker, and other runtime resources are embedded into that file. The build fails if Vite emits a second production file.

Application navigation uses hash routes such as `#/workspace`, `#/import`, `#/review`, `#/explore`, and `#/database`. Routing therefore does not depend on server rewrites or network requests.

The final browser acceptance pass must prove that the standalone file initializes, persists its IndexedDB-backed SQLite database, imports local files, and remains fully functional with networking disabled in the target office browser.

## Security invariant

Normal application runtime is designed for **zero outbound network communication**:

- CSP contains `connect-src 'none'`.
- Browser connection APIs are disabled before feature modules load.
- No CDN resources, remote fonts, analytics, telemetry, cloud APIs, or hosted models are used.
- eFAST URLs are inert provenance strings only; they are never fetched automatically.
- SQLite WASM is embedded into the production HTML and initialized from local bytes.
- The SQLite and PDF.js workers are embedded into the HTML.
- PDF.js receives user-selected local bytes; it is never given an eFAST URL.
- The optional development/acceptance server binds to `127.0.0.1` only.
- CI audits that production `dist/` contains exactly one HTML file.

See `docs/security.md` and `docs/milestone-1-test-plan.md`.

## Public-repository data policy

This repository contains **application source code only**. Do not commit pension case material.

The `.gitignore` blocks common case-data artifacts including PDFs, imported CSVs, SQLite databases, backups, IndexedDB/browser data, and local model files. Test fixtures use synthetic names and values. Real acceptance values and source-page evidence belong only in the local application database.

## Development

Dependencies are acquired on a development machine. The resulting single HTML artifact can then be transferred to the air-gapped workstation; normal office runtime does not require npm or internet access.

```bash
npm install
npm run check
```

After a successful check, the only production artifact is:

```text
dist/ragtime5500.html
```

For loopback-browser acceptance testing:

```bash
npm run serve:offline
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

The designated local acceptance filing must only be marked verified after its actual local source PDF is imported and the page-level evidence is reviewed. Real case names, values, PDFs, and CSVs are intentionally absent from this repository.
