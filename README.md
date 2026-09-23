# Ragtime 5500

**Offline Form 5500 Case Database + Local Retrieval**

Ragtime 5500 is a local-first Vite + React + TypeScript application for importing, storing, tracing, querying, reviewing, and eventually analyzing Form 5500 filings across pension cases and plan years.

The structured SQLite database is authoritative. Full-text retrieval and future local RAG capabilities are secondary layers and may not invent database facts.

## Security invariant

Normal application runtime is designed for **zero outbound network communication**:

- CSP contains `connect-src 'none'`.
- Browser connection APIs are disabled before feature modules load.
- No CDN resources, remote fonts, analytics, telemetry, cloud APIs, or hosted models are used.
- eFAST URLs are inert provenance strings only; they are never fetched automatically.
- SQLite WASM is embedded into the production bundle and initialized from local bytes.
- PDF.js receives user-selected local bytes; it is never given an eFAST URL.
- The supplied production server binds to `127.0.0.1` only.

See `docs/security.md` and `docs/milestone-1-test-plan.md`.

## Public-repository data policy

This repository contains **application source code only**. Do not commit pension case material.

The `.gitignore` blocks common case-data artifacts including PDFs, imported CSVs, SQLite databases, backups, OPFS/browser data, and local model files. Test fixtures must use synthetic names and values. Real acceptance values and source-page evidence belong only in the local application database.

## Development

Dependencies are acquired on a development machine. The complete production `dist/` can then be transferred to the air-gapped workstation; normal office runtime does not require npm or internet access.

```bash
npm install
npm run check
npm run serve:offline
```

Open the loopback URL printed by the server. Browser persistence uses OPFS.

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

The designated local acceptance filing must only be marked verified after its actual local source PDF is imported and the page-level evidence is reviewed. Real case names, values, PDFs, and CSVs are intentionally absent from this repository.
