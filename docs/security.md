# Security invariants

1. Runtime network connections are denied by CSP: `connect-src 'none'`.
2. Connection-capable browser globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`) and `window.open` are disabled before feature modules load.
3. Source auditing rejects those primitives, remote runtime imports/resources, and explicit location-navigation APIs outside the security bootstrap/audit code.
4. The production build emits exactly one application artifact: `ragtime5500.html`.
5. SQLite WASM is embedded in that HTML and initialized from bytes; no WASM URL is fetched.
6. The SQLite worker is embedded and started from a local blob URL created from bundled bytes.
7. The PDF.js worker source is embedded and instantiated locally; PDF.js receives local `Uint8Array` data only.
8. eFAST URLs are inert provenance strings and are never opened automatically.
9. Internal navigation uses URL fragments only. Hash routing does not trigger a document or network navigation.
10. Office runtime uses direct `file://` execution. No server, localhost process, backend, or remote service is required.
11. Persistent case data lives in a user-selected local SQLite workspace file.
12. Imported eFAST CSV and PDF bytes are stored inside that SQLite workspace, keyed through local source-document provenance records.
13. No analytics, telemetry, remote fonts, remote scripts, CDN references, or cloud model calls are allowed.
14. Local model support, when added later, must use bundled or explicitly imported hash-pinned model/tokenizer assets.
15. Pension case artifacts are excluded from the public source repository through `.gitignore` and repository policy.
16. Release requires both the source network audit and the single-file artifact audit.
17. Final acceptance additionally requires DevTools verification with the workstation disconnected from the network.

## Direct-file persistence

Browser-private OPFS was removed from the deployment design because the target runtime is a directly opened `file://` document and no server is available. The application instead asks the user to open or create a local SQLite workspace file. The browser grants access to that explicit file through a user action; Ragtime writes the authoritative SQLite image back to the same file after mutations.

This architecture keeps persistence outside browser-origin storage and makes the workspace portable and backup-friendly while preserving the one-HTML application requirement.

## Final acceptance

The target office browser must be tested with the final `ragtime5500.html` opened directly from disk. Release is not complete until local workspace creation/opening, SQLite persistence, embedded workers, PDF.js, backup/restore, hash routing, source-document retrieval, and zero-network operation all work in that exact environment.
