# Security invariants

1. Runtime network connections are denied by CSP: `connect-src 'none'`.
2. Connection-capable browser globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`) and `window.open` are disabled before feature modules load.
3. Source auditing rejects those primitives, remote runtime imports/resources, and explicit location-navigation APIs outside the security bootstrap/audit code.
4. SQLite WASM is embedded at build time and initialized from bytes; no WASM URL is fetched.
5. PDF.js receives local `Uint8Array` data only.
6. eFAST URLs are inert provenance strings and are never opened automatically.
7. The production launcher binds to `127.0.0.1` only.
8. No analytics, telemetry, remote fonts, remote scripts, CDN references, or cloud model calls.
9. All imported source files are copied into OPFS and addressed by SHA-256-derived storage keys.
10. Local model support, when added later, must use bundled hash-pinned model/tokenizer assets.
11. Pension case artifacts are excluded from the public source repository through `.gitignore` and repository policy.
12. The security audit script is required before release.
