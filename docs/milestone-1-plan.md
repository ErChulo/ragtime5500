# Milestone 1 implementation plan

1. Scaffold Vite + React + TypeScript with only local package dependencies.
2. Add restrictive CSP and loopback-only production launcher.
3. Add embedded SQLite WASM worker using OPFS `opfs-sahpool`.
4. Add migration runner and initial normalized schema.
5. Add Case / Plan / Plan Year / Filing repositories and minimal CRUD UI.
6. Add local SHA-256 and OPFS file store.
7. Add RFC-4180 eFAST CSV ingestion preserving raw bytes and rows.
8. Add local PDF bulk import with hash-based deduplication.
9. Add bundled PDF.js extraction from bytes only.
10. Add deterministic PDF-to-CSV matching and review state.
11. Add narrow Schedule H Part I 1c(9) BOY/EOY parser.
12. Store extracted values with page/source-text provenance.
13. Add exact-location/canonical-concept query UI and SQL console.
14. Add database export and restore.
15. Run migration/query/parser/security tests and manual offline acceptance checklist.
16. Stop. Do not add embeddings or an LLM until this slice passes with the real 2024 source PDF.
