# Milestone 1 test plan

## Automated

- **Schema**: migrations apply to empty SQLite and `PRAGMA foreign_key_check` returns no rows.
- **Acceptance SQL contract**: a synthetic 2024 H/I/1C9/EOY row returns its seeded value.
- **BOY SQL contract**: the corresponding synthetic BOY row returns its seeded value.
- **Canonical concept**: `COMMON_COLLECTIVE_TRUST_VALUE` returns both BOY/EOY synthetic fixture values for 2024.
- **CSV parser**: quoted plan names, empty cells, embedded commas, CRLF, and escaped quotes round-trip.
- **Raw preservation**: every CSV row keeps raw JSON and raw record text.
- **URL safety**: Link is stored but never dereferenced.
- **Matching**: exact filing-ID/source-filename match auto-accepts; conflicting year remains review-required.
- **PDF parser**: synthetic position-aware page fixtures recover both 1c(9) columns; uncertainty emits no value.
- **Revision preservation**: correcting a value preserves the prior row in `filing_value_revision` and writes `audit_log`.
- **FTS5**: inserted chunks are retrievable by local full-text search.
- **Hash routing**: valid fragment routes select each workspace and unknown fragments fall back safely.
- **Network audit**: source/build fail if forbidden network primitives or remote runtime imports/resources are found.
- **Single-file audit**: `dist/` must contain exactly one application file named `ragtime5500.html`; CSS and JavaScript must be embedded; no companion runtime assets are permitted.
- **Direct-file browser smoke**: normal Chromium opens the HTML through `file://`, SQLite WASM initializes, the local workspace picker APIs are present, internal routing renders, and no browser-initiated HTTP(S) request occurs.

## Target-workstation acceptance

1. Run `npm run check` on the development machine.
2. Confirm that `dist/` contains only `ragtime5500.html`.
3. Transfer only `ragtime5500.html` to the test workstation.
4. Disconnect the workstation from all networks.
5. Open the HTML file directly in the target office Chrome installation.
6. Confirm the header reports **Network blocked**, **SQLite ready**, and **No workspace open**.
7. Click **Create new workspace** and save a local `.sqlite3` file.
8. Confirm the workspace status changes to the selected filename.
9. Create a test case, close Chrome completely, reopen the same HTML, choose **Open existing workspace**, and select that workspace file.
10. Confirm the test case is still present.
11. Import the designated local eFAST CSV and verify the raw-row count.
12. Import the designated local Form 5500 PDFs and verify matched/ambiguous/unmatched statuses.
13. Resolve one ambiguous match if available and verify the audit event.
14. Select the designated 2024 acceptance PDF.
15. Run Schedule H Part I 1c(9) extraction.
16. Verify that BOY and EOY match the values visible on the actual PDF page. The expected real values are not committed to this public repository.
17. Verify the source PDF filename, page number, raw source text, extraction method, confidence, and verification state.
18. Close Chrome, reopen the HTML, reopen the same workspace, and query the same values again.
19. Restart the workstation, reopen the HTML and the same workspace, and query the values again.
20. Export a SQLite backup.
21. Restore that backup into the open workspace and rerun the query.
22. Verify the source-page viewer renders the imported PDF page locally.
23. Verify the browser console shows no CSP violations caused by required application resources.
24. Verify the Network panel shows **zero outbound requests** for the complete workflow.

## Pass condition

Milestone 1 passes only when all automated tests pass and the designated real source-PDF checks above are completed with the final standalone HTML artifact and its local SQLite workspace. Synthetic fixtures prove parser/query contracts but do not satisfy source verification.
