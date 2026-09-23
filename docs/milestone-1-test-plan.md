# Milestone 1 test plan

## Automated

- **Schema**: migration 1 applies to empty SQLite and `PRAGMA foreign_key_check` returns no rows.
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
- **Single-file audit**: `dist/` must contain exactly one file named `ragtime5500.html`; CSS and JavaScript must be embedded; no companion runtime assets are permitted.

## Browser integration — final standalone artifact

1. Run `npm run check` on a development machine.
2. Confirm that `dist/` contains only `ragtime5500.html`.
3. Transfer only `ragtime5500.html` to the test workstation.
4. Disconnect the workstation from all networks.
5. Open the HTML file in the target office browser using the intended final launch method.
6. Open DevTools Network, clear the log, and keep it open for the complete test.
7. Verify that the application initializes SQLite and reports the local database as ready.
8. Navigate through all internal routes and confirm no page reload/server route is required.
9. Create a case, plan, year, and filing or import them through the eFAST CSV workflow.
10. Import the designated local eFAST CSV and verify the raw-row count.
11. Import the designated local Form 5500 PDFs and verify matched/ambiguous/unmatched statuses.
12. Select the designated 2024 acceptance PDF.
13. Run Schedule H Part I 1c(9) extraction.
14. Verify that BOY and EOY match the values visible on the actual PDF page. The expected real values are not committed to this public repository.
15. Verify the source PDF filename, page number, raw source text, extraction method, confidence, and verification state.
16. Close the browser completely, reopen the same HTML file, and query the same values.
17. Restart the workstation, reopen the same HTML file, and query the same values again.
18. Export the SQLite database.
19. Clear the application's browser storage, reopen, restore the export, and rerun the query.
20. Verify the source-page viewer renders the imported PDF page locally.
21. Verify the browser console shows no CSP violations caused by required application resources.
22. Verify the Network panel shows **zero outbound requests** for the complete workflow.

## Optional loopback diagnostic

If the target browser blocks a browser capability specifically because of direct `file:` execution, `npm run serve:offline` may be used on a development machine to isolate the browser restriction. This diagnostic does not replace the required final standalone-file acceptance test.

## Pass condition

Milestone 1 passes only when all automated tests pass and the designated real source-PDF checks above are completed with the final standalone HTML artifact. Synthetic fixtures prove parser/query contracts but do not satisfy source verification.
