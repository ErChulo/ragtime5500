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


# Milestone 2 implementation status

**Status: RELEASE CANDIDATE — v0.2.0-rc.2**

Milestone 2 extends the accepted direct-file architecture without changing the office runtime contract.

## Implemented

- schema migration v5 for metadata-driven extraction rules, extraction-issue review, and deterministic validation results
- 2024 Schedule H Part I extraction definitions for 11 locations:
  - 1C9
  - 1D1
  - 1D2
  - 1E
  - 1F
  - 1G
  - 1H
  - 1I
  - 1J
  - 1K
  - 1L
- BOY/EOY line definitions mapped to stable canonical concepts
- reusable positional BOY/EOY extraction engine driven by SQLite metadata
- hidden fillable-form placeholder rejection retained from the accepted 1C9 path
- blank source cells remain missing; no zero is inferred
- ambiguous numeric cells fail closed and enter an explicit review queue
- missing configured lines enter an explicit review queue rather than creating data
- re-extraction from the PDF bytes already stored in the workspace
- re-extraction cannot overwrite USER_VERIFIED or USER_CORRECTED values
- extraction-run audit events and issue-review audit events
- deterministic Schedule H Part I validation of 1L = 1F - 1K for BOY and EOY
- NOT_EVALUATED validation state when a required input is missing
- canonical-concept suggestions and deterministic year-over-year deltas
- four-stage Review workflow: Matches → Extract → Verify values → Validate
- progress/status feedback for all newly added non-instant operations
- Milestone 1 regression tests preserved

## Automated candidate gates

The candidate test suite verifies:

- migration v5 applies to the existing normalized schema
- 11 active extraction rules and 22 BOY/EOY line definitions exist for 2024 Schedule H Part I
- generic multi-line extraction from positioned PDF text
- blank-column preservation
- placeholder-number rejection
- ambiguous-cell fail-closed behavior
- missing-line issue generation
- label-driven line discovery
- deterministic balance-sheet identity checks
- preservation of the direct-file, zero-network, single-HTML release contract

## Remaining acceptance gate

Milestone 2 is not marked stable until the target office workstation re-extracts the designated real 2024 filing and the newly supported Schedule H values, review queue, validation results, persistence, backup/restore, and offline operation are checked against the local source evidence.
