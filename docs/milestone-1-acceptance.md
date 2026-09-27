# Milestone 1 acceptance record

**Release:** v0.1.1  
**Accepted:** 2026-09-27  
**Runtime:** standalone HTML opened directly with `file://` on the target office workstation

## Acceptance evidence

The designated real-workspace test completed the full Milestone 1 vertical slice:

1. Imported the local eFAST CSV.
2. Selected the target plan number and preserved non-target rows without allowing them to participate in PDF matching.
3. Imported the complete designated local Form 5500 PDF set.
4. Deterministically matched every selected PDF to the intended target-plan filing.
5. Extracted the designated 2024 Schedule H Part I line 1C9 BOY and EOY values from the source PDF.
6. Verified source-document and source-page provenance.
7. Closed and reopened the application and reopened the same SQLite workspace; the imported documents, matches, and extracted values persisted.
8. Exported a full `.r5500` workspace archive.
9. Created a new empty SQLite workspace and restored the full archive into it.
10. Restore reported `SQLite quick_check=ok` and zero foreign-key violations.
11. Re-ran the structured Schedule H Part I 1C9 queries in the restored workspace and confirmed the designated BOY and EOY source values and provenance.
12. Disconnected the workstation from the network, reopened the standalone HTML, reopened the workspace, and successfully queried the designated value again.

## Security / data handling

This acceptance record intentionally excludes case names, plan names, PDFs, CSV rows, SQLite workspaces, and designated real source values. Those materials remain local and are not committed to the public repository.

## Result

**Milestone 1: PASSED.**

The accepted baseline is the source tree associated with v0.1.1 and the corresponding single-HTML artifact published on the `office-builds` branch.
