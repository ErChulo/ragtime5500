# ADR 002 — Direct-file persistence without a server

**Status:** Accepted  
**Date:** 2026-09-24

## Context

Ragtime 5500 has two non-negotiable deployment constraints:

1. the application must be delivered as one standalone HTML file and opened directly on the office workstation;
2. the office environment does not provide or permit a web server/backend for the application.

The original design used SQLite WASM with OPFS persistence. During target-style `file://` testing, Chromium's origin/security behavior prevented that browser-private persistence model from satisfying the deployment requirements reliably.

## Decision

Use an in-memory SQLite WASM database while the application is running and persist the complete SQLite database image to a **user-selected local workspace file**.

The startup workflow is:

```text
ragtime5500.html
      |
      +--> Open existing workspace ----> local .sqlite3 file
      |
      +--> Create new workspace -------> local .sqlite3 file
```

After each authoritative mutation, Ragtime exports the SQLite image and writes it back to the currently selected workspace file.

Imported eFAST CSV and PDF bytes are stored inside SQLite in `local_file_blob`, so one workspace contains the complete local case database and its imported source evidence.

## Consequences

### Benefits

- no web server, localhost listener, backend, or network dependency;
- direct double-click/file-open deployment remains possible;
- SQLite remains authoritative;
- data survives browser and workstation restarts because it is a normal local file;
- source PDFs/CSVs remain portable with the database;
- backup is straightforward;
- browser-origin storage is not a hidden dependency.

### Trade-off

The browser requires an explicit user gesture to grant access to a local workspace file. When Ragtime is reopened, the user selects the same workspace file again.

This is preferable to relying on browser-private storage whose identity or permissions are unsuitable for the required direct-file deployment.
