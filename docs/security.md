# Security invariants

1. Runtime network connections are denied by CSP: `connect-src 'none'`.
2. Connection-capable browser globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`) and `window.open` are disabled before feature modules load.
3. Source auditing rejects those primitives, remote runtime imports/resources, and explicit location-navigation APIs outside the security bootstrap/audit code.
4. The production build emits exactly one artifact: `ragtime5500.html`.
5. SQLite WASM is embedded in that HTML and initialized from bytes; no WASM URL is fetched.
6. The SQLite worker is embedded and started from an inline worker payload rather than a companion file.
7. The PDF.js worker source is embedded and instantiated locally; PDF.js receives local `Uint8Array` data only.
8. eFAST URLs are inert provenance strings and are never opened automatically.
9. Internal navigation uses URL fragments only. Hash routing does not trigger a document or network navigation.
10. The optional acceptance server binds to `127.0.0.1` only and serves the same single HTML artifact.
11. No analytics, telemetry, remote fonts, remote scripts, CDN references, or cloud model calls are allowed.
12. All imported source files are copied into OPFS and addressed by SHA-256-derived storage keys.
13. Local model support, when added later, must use bundled hash-pinned model/tokenizer assets.
14. Pension case artifacts are excluded from the public source repository through `.gitignore` and repository policy.
15. Release requires both the source network audit and the single-file artifact audit.
16. Final acceptance additionally requires DevTools verification with the workstation disconnected from the network.

## Standalone-file caveat to verify

The target office browser must be tested with the final `ragtime5500.html` opened in the intended manner. The release is not considered complete until OPFS, embedded workers, SQLite WASM, PDF.js, backup/restore, and hash routing all work in that exact environment.
