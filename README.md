# Ragtime 5500

[![Ragtime 5500 CI](https://github.com/ErChulo/ragtime5500/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ErChulo/ragtime5500/actions/workflows/ci.yml)
![Single HTML](https://img.shields.io/badge/build-single%20HTML-passing-brightgreen)
![Direct file runtime](https://img.shields.io/badge/runtime-file%3A%2F%2F-passing-brightgreen)
![Zero outbound network](https://img.shields.io/badge/outbound%20network-blocked-passing-brightgreen)
![SQLite WASM](https://img.shields.io/badge/SQLite-WASM-passing-brightgreen)
![Schema contracts](https://img.shields.io/badge/schema%20contracts-passing-brightgreen)
![Security audit](https://img.shields.io/badge/security%20audit-passing-brightgreen)
![Manual acceptance](https://img.shields.io/badge/manual%20acceptance-passed-brightgreen)

**Offline Form 5500 Case Database + Local Retrieval**

## Office download

For the air-gapped office workstation, download the tested standalone HTML from the dedicated `office-builds` branch:

- **[Download latest single-HTML build](https://github.com/ErChulo/ragtime5500/raw/office-builds/ragtime5500-latest.html)**
- [Download Milestone 2 candidate v0.2.0-rc.2](https://github.com/ErChulo/ragtime5500/raw/office-builds/ragtime5500-v0.2.0-rc.2.html)
- [Download accepted Milestone 1 stable v0.1.1](https://github.com/ErChulo/ragtime5500/raw/office-builds/ragtime5500-v0.1.1.html)
- [SHA-256 checksums](https://github.com/ErChulo/ragtime5500/blob/office-builds/SHA256SUMS.txt)
- [Published version](https://github.com/ErChulo/ragtime5500/blob/office-builds/VERSION.txt)

The `office-builds` branch is generated only after the repository test/build/security gates pass on `main`. The downloaded HTML is the complete application and is intended to open directly from local disk with the network disconnected.

**Milestone 1 was accepted on 2026-09-27 on the target workstation.** The accepted workflow covered eFAST CSV import and target-plan filtering, 16 local Form 5500 PDFs, deterministic matching, 2024 Schedule H Part I 1C9 extraction with page provenance, persistence after browser restart, full-workspace backup/restore into a new SQLite workspace, deterministic retrieval after restore, and successful operation with the workstation disconnected from the network. Case-specific source values and documents are intentionally not committed to this public repository.



Ragtime 5500 is a local-first Vite + React + TypeScript application for importing, storing, tracing, querying, reviewing, and eventually analyzing Form 5500 filings across pension cases and plan years.

The structured SQLite database is authoritative. Full-text retrieval and future local RAG capabilities are secondary layers and may not invent database facts.

## UX operating principle

Ragtime is designed for low working-memory load. A first-time user should not have to remember the application structure.

The interface therefore follows these rules:

- show one primary decision at a time;
- keep optional and destructive controls collapsed until requested;
- always provide a visible **Guide** return point;
- explain **what to do now**, **what should happen**, and **what the step proves**;
- use the application itself as a cheat sheet instead of requiring memorized procedures;
- reserve advanced SQL, diagnostics, and maintenance tools for explicit disclosure;
- treat supervisor-ready deliverables as a first-class product requirement after the Milestone 1 vertical slice is accepted.

For the accepted Milestone 1 walkthrough, see **[docs/testing-guide.md](docs/testing-guide.md)**. The accepted Milestone 1 record is in **[docs/milestone-1-acceptance.md](docs/milestone-1-acceptance.md)**. Milestone 2 scope and acceptance are in **[docs/milestone-2-plan.md](docs/milestone-2-plan.md)** and **[docs/milestone-2-test-plan.md](docs/milestone-2-test-plan.md)**. Version history is in **[CHANGELOG.md](CHANGELOG.md)**.

## Primary user workflow

The normal user workflow is intentionally linear:

`Workspace → Case → eFAST CSV → Review CSV rows → Local PDFs → Review evidence → Query / Report`

The user creates the **Case only**. Ragtime preserves every eFAST CSV row first. The user then reviews the CSV rows one at a time and explicitly marks which rows are the pension plan's Form 5500 filings. Only those confirmed rows create expected plan-year/filing records and become eligible for PDF matching. Other arrangements remain preserved but excluded. Manual plan-year/filing creation is not part of the normal workflow.

## Case = pension plan domain rule

For Ragtime 5500, a **case is the pension plan being worked**. The user-facing hierarchy is:

`Case → Plan Year → Filing`

The legacy internal `plan` table is retained only as a relational compatibility layer for existing SQL/provenance joins. Ragtime automatically creates and maintains that one internal row; it is not a separate user concept or wizard step.

## Final-deliverable contract

The production application is exactly one standalone file:

`dist/ragtime5500.html`

The application is opened directly from the local filesystem with `file://`. It does not require a server, localhost process, backend, network share, CDN, or internet connection.

JavaScript, CSS, SQLite WASM, the database worker, PDF.js, and other runtime resources are embedded into that HTML file. The build fails if Vite emits a second production runtime artifact.

Application navigation uses fragment routes such as `#/workspace`, `#/import`, `#/review`, `#/explore`, and `#/database`, so navigation never requires a server rewrite.

## Persistent data model for direct-file deployment

Chrome does not provide a dependable origin-private persistence environment for this application when it is opened directly with `file://`. Ragtime therefore uses a **user-selected local SQLite workspace file** rather than a browser-private OPFS database.

At startup the user chooses one of two actions:

- **Open existing workspace** — select an existing `.sqlite3`, `.sqlite`, or `.db` Ragtime workspace.
- **Create new workspace** — choose a local filename for a new SQLite workspace.

All case data, imported eFAST rows, extracted values, audit history, document chunks, and the imported CSV/PDF bytes themselves are stored inside that SQLite workspace. The HTML application remains one file; the workspace file is user data, not an application dependency.

After closing the browser or restarting the workstation, open `ragtime5500.html` again and choose the same workspace file.

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
- No server, localhost process, or remote runtime is used.
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

## Testing

The repository has two layers of acceptance:

1. **Automated gates** — TypeScript/tests, SQLite schema contracts, single-file build, zero-network source audit, direct-`file://` browser startup, embedded runtime resources, and workspace-file capability checks.
2. **Target-workstation acceptance** — the real eFAST CSV/PDF workflow, source-page verification, persistence after restart, backup/restore, and DevTools confirmation of zero outbound requests.

Use the step-by-step **[Manual Test Drive](docs/testing-guide.md)**. It is written as one action per step so a tester does not need to hold the workflow in short-term memory.

## Milestone 1 scope

- Case (= one pension plan) setup; eFAST import creates Plan Year / Filing records automatically
- eFAST CSV import with every raw row preserved and explicit target/non-target row review before filing creation
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


## Milestone 2 candidate scope

Version **v0.2.0-rc.2** generalizes the accepted Milestone 1 extraction path into a metadata-driven Schedule H engine while preserving the same offline/direct-file architecture.

The candidate adds:

- SQLite-backed extraction definitions rather than a one-off hard-coded 1C9 implementation;
- 2024 Schedule H Part I rules for 11 supported locations and up to 22 BOY/EOY structured fields;
- stable canonical concepts for each supported location;
- re-extraction of already-imported local PDFs without re-importing or renaming them;
- explicit extraction-issue review for missing or ambiguous source lines;
- deterministic validation of the Schedule H Part I identity `1L = 1F - 1K` when all required values are present;
- year-over-year canonical-concept deltas without replacing the authoritative stored values;
- progress/status feedback for extraction, review, validation, and comparison operations.

Milestone 2 remains a **release candidate** until the designated real 2024 filing is re-extracted and the newly supported values are checked against the actual local Schedule H source page on the target office workstation. The accepted Milestone 1 baseline remains v0.1.1 until that validation is complete.
