# Milestone 2 target-workstation test plan

**Candidate:** v0.2.0-rc.1  
**Baseline:** accepted Milestone 1 v0.1.1 workspace  
**Rule:** Use a copy of the accepted workspace. Do not risk the accepted baseline during candidate testing.

## Test 1 — Open the copied workspace

**Do:** Open v0.2.0-rc.1 directly from disk and choose a copy of the accepted v0.1.1 SQLite workspace.

**Expect:** The application opens normally, reports the Milestone 2 candidate version, and the existing case/filings remain present.

**Proves:** Migration v5 preserves the accepted workspace.

## Test 2 — Confirm database health

**Do:** Go to **Backup → Advanced database tools** and inspect database health.

**Expect:** SQLite quick check is OK, foreign-key violations are zero, and the latest migration is v5.

**Proves:** The existing workspace upgraded cleanly.

## Test 3 — Open structured extraction

**Do:** Go to **Review → Extract**.

**Expect:** The coverage summary shows:

- 11 supported line rules;
- 22 possible BOY/EOY output fields;
- the matched 2024 filing is available.

**Proves:** Extraction behavior is loaded from SQLite metadata.

## Test 4 — Re-extract the designated 2024 filing

**Do:** Select the stored 2024 PDF and click **Re-extract structured values**.

**Expect:** A visible progress indicator remains active while the local PDF is parsed. The result reports extracted values and any review items.

**Proves:** Ragtime can re-use locally stored evidence without PDF re-import.

## Test 5 — Milestone 1 regression

**Do:** Query 2024 Schedule H Part I 1C9 BOY and EOY.

**Expect:** The previously accepted values remain unchanged and retain the same source PDF/page provenance.

**Proves:** The generic engine did not break the accepted 1C9 result.

## Test 6 — Review newly supported lines

**Do:** In **Review → Verify values**, inspect every newly extracted 2024 Schedule H Part I value from 1D1 through 1L.

**Expect:** For each stored value, confirm:

- exact line;
- BOY or EOY;
- displayed number;
- source PDF;
- source page;
- raw source text;
- extraction method;
- confidence;
- EXTRACTED_UNVERIFIED status until reviewed.

Compare the number to the visible source PDF page before marking it verified.

**Proves:** New structured values are traceable to source evidence.

## Test 7 — Confirm blank cells remain blank

**Do:** For any supported source line that has a visibly blank BOY or EOY cell, check the structured values.

**Expect:** Ragtime does not create a zero or another inferred number for the blank cell.

**Proves:** Missing source values are not silently inferred.

## Test 8 — Review extraction issues

**Do:** Return to **Review → Extract** and inspect any open review items.

**Expect:** Missing or ambiguous configured lines appear explicitly. Marking one reviewed changes only the review state; it does not create a filing value.

**Proves:** Uncertain extraction fails closed.

## Test 9 — Re-extraction preservation

**Do:** Mark one correctly sourced test value USER_VERIFIED, then run structured extraction again on the same PDF.

**Expect:** The verified value remains unchanged and USER_VERIFIED.

**Proves:** Re-extraction cannot overwrite a user-verified value.

## Test 10 — Deterministic Schedule H validation

**Do:** Go to **Review → Validate**.

**Expect:** BOY and EOY validation for `1L = 1F - 1K` is one of:

- PASS if all three source values exist and balance;
- FAIL if all exist and do not balance;
- NOT_EVALUATED if any required structured value is absent.

**Proves:** Validation is deterministic and missing values are not treated as zero.

## Test 11 — Canonical concept comparison

**Do:** Go to **Find values → Concept history**, choose an available canonical concept, and compare years.

**Expect:** Stored values appear with exact form location/source provenance. Where consecutive stored numeric observations exist, Ragtime shows the change and percentage change from the prior stored year.

**Proves:** Cross-year calculations are derived from authoritative structured values.

## Test 12 — Persistence

**Do:** Close the browser completely, reopen the same candidate HTML, reopen the copied workspace, and inspect a newly extracted value plus the validation results.

**Expect:** Both persist.

**Proves:** Milestone 2 data survives restart.

## Test 13 — Full workspace backup/restore

**Do:** Export a full `.r5500` workspace, restore it into a new empty SQLite workspace, and inspect the Milestone 2 values/issues/validation.

**Expect:** Source files, structured values, review states, and validation results restore with SQLite quick check OK and zero foreign-key violations.

**Proves:** Migration v5 data participates in disaster recovery.

## Test 14 — Offline operation

**Do:** Disconnect the workstation from the network, reopen the candidate, open the restored workspace, re-run a structured query, show a source page, and run concept history.

**Expect:** All operations succeed with no external connection.

**Proves:** Milestone 2 preserves the air-gapped runtime contract.

## Pass condition

Milestone 2 can be promoted from release candidate to stable only when:

- all automated CI gates pass;
- the accepted 1C9 result remains unchanged;
- all newly stored Schedule H values selected for verification match the real local source page;
- blank cells are not converted to zero;
- extraction issues are explicit rather than silently guessed;
- the deterministic balance check behaves correctly;
- persistence and full-workspace restore pass;
- the candidate operates with the workstation disconnected.

Do not mark a newly extracted value USER_VERIFIED unless it has been checked against the actual source page.
