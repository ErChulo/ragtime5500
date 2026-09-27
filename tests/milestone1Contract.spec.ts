import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
}

describe('Milestone 1 release contract', () => {
  it('keeps the package version and visible app version synchronized', () => {
    const pkg = JSON.parse(source('package.json')) as { version: string };
    const version = source('src/app/version.ts');
    expect(version).toContain(`APP_VERSION = '${pkg.version}'`);
    expect(version).toContain('APP_CHANNEL =');
  });

  it('enforces connect-src none in the application CSP', () => {
    expect(source('index.html')).toMatch(/connect-src\s+'none'/);
  });

  it('keeps the production artifact contract to exactly one HTML file', () => {
    const audit = source('scripts/audit-singlefile.mjs');
    expect(audit).toContain("const TARGET = 'ragtime5500.html'");
    expect(audit).toContain('relativeFiles.length !== 1');
  });

  it('actively audits prohibited outbound browser APIs', () => {
    const audit = source('scripts/audit-network.mjs');
    for (const capability of ['fetch()', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'window.open']) {
      expect(audit).toContain(capability);
    }
  });

  it('smoke-tests the final file over the file protocol', () => {
    const smoke = source('scripts/browser-file-smoke.mjs');
    expect(smoke).toContain('pathToFileURL(htmlPath)');
    expect(smoke).toContain('Network.requestWillBeSent');
    expect(smoke).toContain('Outbound HTTP(S) request detected');
  });

  it('falls back to same-page SQLite when Worker startup is blocked', () => {
    const client = source('src/db/client.ts');
    const smoke = source('scripts/browser-file-smoke.mjs');
    expect(client).toContain('same-page-fallback');
    expect(client).toContain('LocalDbRuntime');
    expect(smoke).toContain('Worker blocked by simulated managed-browser policy');
    expect(smoke).toContain('WORKER-BLOCKED SMOKE: PASS');
  });

  it('renders a visible startup shell before React initializes', () => {
    const html = source('index.html');
    expect(html).toContain('Starting the offline application locally');
    expect(html).toContain('this browser blocked the application runtime');
  });

  it('falls back when a database worker silently hangs during startup', () => {
    const client = source('src/db/client.ts');
    expect(client).toContain('Database worker startup timed out');
    expect(client).toContain('same-page SQLite compatibility mode');
    expect(client).toContain('window.setTimeout');
  });

  it('shows startup failures in the standalone HTML instead of remaining blank', () => {
    const html = source('index.html');
    expect(html).toContain('Ragtime 5500 could not start');
    expect(html).toContain("window.addEventListener('unhandledrejection'");
  });

  it('targets ES2019 for broader enterprise Chromium/Edge compatibility', () => {
    expect(source('vite.config.ts')).toContain("target: 'es2019'");
  });

  it('uses same-page SQLite directly under file protocol', () => {
    const client = source('src/db/client.ts');
    expect(client).toContain("location.protocol === 'file:'");
    expect(client).toContain('fallbackRequest');
  });

  it('emits a classic script rather than a module script in the final HTML', () => {
    const vite = source('vite.config.ts');
    const audit = source('scripts/audit-singlefile.mjs');
    expect(vite).toContain("format: 'iife'");
    expect(audit).toContain('compiled HTML still contains a module script');
  });

  it('requires local file picker APIs for workspace persistence', () => {
    const smoke = source('scripts/browser-file-smoke.mjs');
    expect(smoke).toContain('showOpenFilePicker');
    expect(smoke).toContain('showSaveFilePicker');
  });

  it('preserves every raw eFAST row before classification', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('raw_row_json');
    expect(repository).toContain('raw_record_text');
    expect(repository).toContain("'NEEDS_REVIEW'");
    expect(repository).toContain('included_for_matching');
  });

  it('records eFAST target-plan selection in the audit log', () => {
    const review = source('src/db/efastReview.ts');
    expect(review).toContain("'SET_TARGET_PLAN_NUMBER'");
    expect(review).toContain('audit_log');
  });

  it('uses normalized plan numbers for target filtering', () => {
    const review = source('src/db/efastReview.ts');
    expect(review).toContain('normalizePlanNumber');
    expect(review).toContain('samePlanNumber');
  });

  it('auto-excludes stale non-target rows instead of blocking PDF import', () => {
    const pdfImport = source('src/db/pdfImport.ts');
    expect(pdfImport).toContain('excludeStaleNonTargetRows');
    expect(pdfImport).toContain("classification_status='NON_TARGET'");
    expect(pdfImport).toContain('AUTO_EXCLUDE_NON_TARGET_PRE_PDF');
    expect(pdfImport).not.toContain('not target plan number');
  });

  it('uses one stable target-row snapshot for the entire PDF batch', () => {
    const panel = source('src/components/PdfImportPanel.tsx');
    expect(panel).toContain('let availableRows = await listTargetRowsForImport(efastImportId)');
    expect(panel).toContain('chooseMatch(signals, availableRows)');
    expect(panel).toContain('availableRows = availableRows.filter');
    expect(panel).not.toContain('No eligible filing remains in this eFAST import');
  });

  it('allows deliberate re-import even when all expected filings already have PDFs', () => {
    const panel = source('src/components/PdfImportPanel.tsx');
    expect(panel).toContain("preflight.expectedCount === 0");
    expect(panel).toContain('you may re-import to verify or repair their links');
    expect(panel).not.toContain("currentPreflight.readyCount === 0");
  });

  it('includes already-linked target rows in the batch matching snapshot', () => {
    const pdfImport = source('src/db/pdfImport.ts');
    expect(pdfImport).toContain('listTargetRowsForImport');
    expect(pdfImport).not.toContain('AND (f.source_document_id IS NULL OR f.filing_id IS NULL)');
  });

  it('audits automatic source-document relinking during deterministic re-import', () => {
    expect(source('src/db/pdfImport.ts')).toContain('AUTO_RELINK_SOURCE_DOCUMENT');
  });

  it('scopes PDF matching to the selected eFAST import', () => {
    const pdfImport = source('src/db/pdfImport.ts');
    expect(pdfImport).toContain('WHERE er.efast_import_id=?');
    expect(pdfImport).toContain('er.included_for_matching=1');
  });

  it('keeps unmatched PDFs explicit rather than silently assigning them', () => {
    const pdfImport = source('src/db/pdfImport.ts');
    expect(pdfImport).toContain("'UNMATCHED'");
    expect(pdfImport).toContain('import_row_id IS NULL');
  });

  it('stores extracted values with source page and source text provenance', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('source_page');
    expect(repository).toContain('source_text');
    expect(repository).toContain('extraction_confidence');
    expect(repository).toContain('verification_status');
  });

  it('does not overwrite a user-verified extracted value during re-extraction', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain("WHERE filing_value.verification_status='EXTRACTED_UNVERIFIED'");
  });

  it('stores eFAST URLs only as provenance fields', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('original_source_url');
    expect(source('src/security/externalUrl.ts')).toContain('External HTTP(S) navigation is forbidden');
  });

  it('verifies source-document hashes before creating a full workspace backup', () => {
    const archive = source('src/backup/workspaceArchive.ts');
    expect(archive).toContain('failed SHA-256 verification');
    expect(archive).toContain('size mismatch');
  });

  it('validates all archived source payloads before restoring database state', () => {
    const archive = source('src/backup/workspaceArchive.ts');
    expect(archive).toContain('First pass: validate every source payload before writing anything.');
    expect(archive).toContain('unexpected trailing bytes');
  });

  it('checks SQLite integrity and foreign keys through the health surface', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('PRAGMA quick_check');
    expect(repository).toContain('PRAGMA foreign_key_check');
  });

  it('provides deterministic FTS retrieval against local document chunks', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('document_chunk_fts MATCH ?');
    expect(repository).toContain('snippet(document_chunk_fts');
  });

  it('provides canonical-concept history independent of line-number layout', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('queryCanonicalHistory');
    expect(repository).toContain('canonical_concept=?');
  });

  it('keeps migrations explicitly ordered and versioned', () => {
    const migrations = source('src/db/migrations.ts');
    for (const version of [1, 2, 3, 4, 5]) {
      expect(migrations).toContain(`version: ${version}`);
    }
  });

  it('publishes office builds only after the check job succeeds', () => {
    const ci = source('.github/workflows/ci.yml');
    expect(ci).toContain('publish-office-build:');
    expect(ci).toContain('needs: check');
    expect(ci).toContain('ragtime5500-latest.html');
    expect(ci).toContain('SHA256SUMS.txt');
  });

  it('runs schema verification, source tests, build audits, and browser smoke in CI', () => {
    const ci = source('.github/workflows/ci.yml');
    expect(ci).toContain('python3 tests/verify_schema.py');
    expect(ci).toContain('npm run check');
    expect(ci).toContain('browser-file-smoke.mjs');
  });
});
