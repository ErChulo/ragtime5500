# Milestone 1 implementation status

**Status: ACCEPTED — 2026-09-27**

Milestone 1 has completed both automated CI gates and target-workstation acceptance.

## Accepted architecture

- Vite + React + TypeScript frontend
- exactly one production artifact: `dist/ragtime5500.html`
- direct `file://` office runtime; no server, localhost process, backend, CDN, or internet requirement
- SQLite WASM bundled inside the HTML
- same-page SQLite compatibility runtime for direct-file deployment
- user-selected local SQLite workspace file for persistence
- numbered/checksummed schema migrations
- normalized case → plan → plan year → filing → source-document → line-definition → filing-value model
- imported source bytes stored inside the SQLite workspace
- SQLite FTS5 document chunks for local retrieval
- PDF.js bundled locally and fed only user-selected local PDF bytes
- zero-outbound-network CSP and runtime lockdown
- eFAST URLs stored only as provenance strings
- full-workspace backup/restore with SHA-256 validation
- SQLite-only export/restore
- visible process progress/status for non-instant operations

## Accepted Milestone 1 vertical slice

- eFAST CSV raw-row preservation
- target plan-number selection and normalization
- automatic exclusion of non-target plan rows from matching
- bulk import of the designated local Form 5500 PDF set
- stable deterministic multi-PDF batch matching
- matched / ambiguous / unmatched review states
- 2024 Schedule H Part I 1C9 BOY/EOY positional extraction
- rejection of hidden fillable-form placeholder numerals
- source filename, source page, raw source text, extraction method, confidence, and verification state
- deterministic exact-location SQL retrieval
- canonical-concept retrieval
- audit history for classification, matching, relinking, verification, and correction
- persistence after closing and reopening the browser
- full-workspace backup and restore into a new workspace
- SQLite `quick_check=ok` and zero foreign-key violations after restore
- successful retrieval of the designated acceptance values after restore
- successful target-workstation use with the network disconnected

## Automated release gates

The `main` workflow verifies:

- TypeScript and Vitest suite
- SQLite schema contracts
- production build
- source/network audit
- single-HTML artifact audit
- direct `file://` Chromium smoke test
- no browser-initiated outbound HTTP(S)
- final artifact checksum
- publication to the `office-builds` branch only after the check job succeeds

## Public repository data policy

The repository records the acceptance result and software behavior, but not case materials. Real case PDFs, CSVs, SQLite workspaces, plan names, and designated source values remain local to the office/test workspace.
