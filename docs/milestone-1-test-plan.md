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
- **Network audit**: source/build fail if forbidden network primitives or remote runtime imports/resources are found.

## Browser integration

1. Build and start the application on loopback only.
2. Open DevTools Network and clear the log.
3. Enable browser offline mode or disconnect the workstation network.
4. Reload the application; it must initialize successfully.
5. Create a case, plan, year, and filing or import them through the eFAST CSV workflow.
6. Import the designated local eFAST CSV and verify the raw-row count.
7. Import the designated local Form 5500 PDFs and verify matched/ambiguous/unmatched statuses.
8. Select the designated 2024 acceptance PDF.
9. Run Schedule H Part I 1c(9) extraction.
10. Verify that BOY and EOY match the values visible on the actual PDF page. The expected real values are not committed to this public repository.
11. Verify the source PDF filename, page number, raw source text, extraction method, confidence, and verification state.
12. Close all application tabs, reopen, and query the same values.
13. Export the SQLite database.
14. Clear the application's site storage, reload, restore the export, and rerun the query.
15. Verify CSP console has no violations caused by required application resources.
16. Verify the Network panel contains only loopback/static asset traffic and **zero outbound requests**.

## Pass condition

Milestone 1 passes only when all automated tests pass and the designated real source-PDF checks above are completed. Synthetic fixtures prove parser/query contracts but do not satisfy source verification.
