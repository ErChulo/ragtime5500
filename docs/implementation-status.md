# Milestone 1 implementation status

## Implemented in source

- Vite + React + TypeScript local frontend
- embedded SQLite WASM build path
- OPFS SAH-pool persistence worker
- numbered/checksummed migration system
- normalized hierarchy and provenance schema
- FTS5 document chunks
- Case / Plan / Plan Year / Filing CRUD
- eFAST CSV SHA-256, OPFS storage, raw-row preservation, expected filings
- bulk local PDF SHA-256, OPFS storage, PDF.js byte-only extraction
- deterministic PDF/eFAST matching with matched / ambiguous / unmatched states
- 2024 Schedule H Part I 1C9 BOY/EOY positional parser
- extraction review with verify/correct/delete and immutable correction revision
- exact-location and canonical-concept SQL retrieval
- local PDF page rendering for provenance
- read-only SQL console
- SQLite database export/restore
- zero-network CSP, eager network-global lockdown, source audit, loopback-only static server
- future local-RAG schema only; no model added
- first Ragtime 5500 navigation and visual-design system for workflow-oriented use

## Executed in the original build session

PASS:

- pure TypeScript CSV / matcher / H-1C9 algorithm tests
- SQLite DDL application with FTS5
- foreign-key check
- canonical-concept lookup
- synthetic acceptance-query fixture
- correction-history preservation
- SQLite backup/restore integrity
- first-party zero-network source audit

Still required before Milestone 1 is formally accepted:

- full dependency-backed Vite/React browser build in an environment with the npm dependencies available
- OPFS persistence across a real browser/workstation restart
- DevTools confirmation of zero outbound requests on the production bundle
- designated real 2024 acceptance source-PDF page verification

Synthetic fixtures prove the schema/query/parser contract; they do **not** replace source-PDF verification.
