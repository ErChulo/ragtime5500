# Changelog

All notable Ragtime 5500 build milestones are recorded here.

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
