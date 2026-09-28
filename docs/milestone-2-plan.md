# Milestone 2 implementation plan

**Candidate:** v0.2.0-rc.2  
**Purpose:** Generalize the accepted Milestone 1 Form 5500 extraction path into a metadata-driven Schedule H engine without changing the direct-file/offline runtime contract.

## Scope

Milestone 2 is intentionally limited to a complete, testable Schedule H Part I slice. It does not attempt to implement every Form 5500 schedule.

### 1. Metadata-driven form definitions

- Keep `FORM_DEFINITION` and `LINE_DEFINITION` authoritative for form/year/location metadata.
- Add `LINE_EXTRACTION_RULE` so extraction behavior is data-driven rather than one source file per line.
- Store definition-source authority and reference text with each rule.
- Treat any stored source URL as inert provenance only.

### 2. 2024 Schedule H Part I support

The candidate defines BOY/EOY extraction for:

- 1C9 — common/collective trust value
- 1D1 — employer securities
- 1D2 — employer real property
- 1E — buildings and other property used in plan operation
- 1F — total assets
- 1G — benefit claims payable
- 1H — operating payables
- 1I — acquisition indebtedness
- 1J — other liabilities
- 1K — total liabilities
- 1L — net assets

Each exact form location maps to a stable canonical concept.

### 3. Generic positional extraction

- Use positioned PDF.js text tokens.
- Locate a configured line by exact reference and/or metadata label pattern.
- Determine BOY and EOY from source-page position.
- Reject known fillable-form placeholder numerals.
- Preserve legitimately blank cells as missing.
- Never infer zero.
- Fail closed if a numeric cell is ambiguous.

### 4. Explicit extraction review

- Persist missing-line and ambiguous-cell issues.
- Show an extraction review queue in the application.
- Let a user mark an issue reviewed without inventing or changing a filing value.
- Resolve stale open issues automatically when a later re-extraction succeeds.

### 5. Re-extraction of stored evidence

- Re-run structured extraction against PDF bytes already stored in the workspace.
- Do not require re-importing or renaming a PDF.
- Preserve USER_VERIFIED and USER_CORRECTED values during re-extraction.
- Audit every structured extraction run.

### 6. Deterministic validation

For each BOY/EOY column, evaluate the Schedule H Part I identity:

`1L = 1F - 1K`

- PASS when the stored values balance within the defined one-dollar tolerance.
- FAIL when all inputs exist and the identity does not balance.
- NOT_EVALUATED when any required structured input is absent.
- Never treat a missing value as zero.

### 7. Canonical comparison

- Keep SQLite values authoritative.
- Add a canonical-concept selector.
- Calculate year-over-year numeric deltas only from stored structured values.
- Export comparison results to CSV.

## Non-goals

Milestone 2 does not add:

- hosted or local LLM inference;
- embeddings;
- OCR;
- automatic eFAST retrieval;
- cloud services;
- a server or localhost runtime;
- full Schedule H coverage;
- Schedules A, C, R, SB, or other forms.

Those remain later incremental work.

## Release discipline

1. Preserve the accepted v0.1.1 behavior with regression tests.
2. Apply schema migration v5 to existing workspaces.
3. Pass unit/contract/schema tests.
4. Pass production build, network audit, single-file audit, and direct-`file://` Chromium smoke.
5. Merge only after PR CI is green.
6. Publish the versioned standalone HTML to `office-builds`.
7. Perform target-workstation source validation against a copy of the accepted workspace.
8. Promote to stable only after the real source evidence passes.
