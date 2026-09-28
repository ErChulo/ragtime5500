# Changelog

All notable Ragtime 5500 build milestones are recorded here.

## v0.2.0-rc.2 — 2026-09-28 — 1C9 regression repair

- preserves the accepted Milestone 1 BOY/EOY invariant when exactly two legitimate amount tokens remain after placeholder rejection;
- uses left/right amount order instead of imperfect PDF header-token geometry for that deterministic case;
- adds a regression fixture matching the target-workstation 1C9 failure pattern;
- retains fail-closed ambiguity handling when more than two legitimate numeric candidates remain.

## v0.2.0-rc.2 — 2026-09-27 — Milestone 2 candidate

Metadata-driven Schedule H extraction candidate built on the accepted v0.1.1 baseline.

### Added

- schema migration v5 for extraction definitions, extraction issues, and filing validation results
- 2024 Schedule H Part I extraction rules for 1C9, 1D1, 1D2, 1E, 1F, 1G, 1H, 1I, 1J, 1K, and 1L
- stable canonical concepts and BOY/EOY structured fields for supported lines
- reusable metadata-driven positional extraction engine
- re-extraction of already stored local PDFs
- explicit review queue for missing/ambiguous extraction evidence
- deterministic 1L = 1F - 1K validation with PASS / FAIL / NOT_EVALUATED states
- canonical-concept year-over-year deltas
- Review workflow expanded to Matches → Extract → Verify values → Validate
- progress/status feedback across Milestone 2 operations

### Safety invariants retained

- direct `file://` single-HTML runtime
- zero outbound network runtime
- no automatic eFAST retrieval
- no inferred zero for blank cells
- no overwrite of USER_VERIFIED or USER_CORRECTED values during re-extraction
- ambiguous extraction fails closed

### Acceptance status

Automated release gates are required before publication. Target-workstation source verification is still required before Milestone 2 can be promoted from release candidate to stable.

## v0.1.1 — 2026-09-27 — Milestone 1 accepted

Stable release promoted from the tested v0.1.1-rc.7 baseline after successful target-workstation acceptance.

### Accepted capabilities

- standalone direct-`file://` HTML runtime
- zero outbound network runtime
- user-selected persistent SQLite workspace
- raw eFAST CSV preservation
- target plan-number filtering
- deterministic bulk PDF matching
- stable multi-PDF batch matching
- 2024 Schedule H Part I 1C9 BOY/EOY extraction
- rejection of hidden fillable-form numeric placeholders
- source-page provenance
- restart persistence
- full-workspace backup/restore
- deterministic structured retrieval after restore
- offline target-workstation operation

## v0.1.1-rc.7

Rejected hidden Form 5500 fillable-form placeholder numerals during Schedule H 1C9 extraction and failed closed on ambiguous cells.

## v0.1.1-rc.6

Stabilized multi-PDF batch matching by using one target-row snapshot for the complete batch and supporting deterministic re-import/relink.

## v0.1.1-rc.5

Automatically excluded stale non-target eFAST rows from PDF matching preflight.

## v0.1.1-rc.4

Restored the required pure single-HTML direct-file runtime, removed localhost/server delivery, used same-page SQLite under `file://`, and emitted a classic ES2019 script.

Earlier test builds established the normalized SQLite schema, local source storage, PDF extraction, provenance surfaces, and office-build publication pipeline.
