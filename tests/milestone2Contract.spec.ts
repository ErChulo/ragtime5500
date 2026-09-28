import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
}

describe('Milestone 2 metadata extraction contract', () => {
  it('identifies the Milestone 2 candidate consistently', () => {
    const pkg = JSON.parse(source('package.json')) as { version: string };
    const version = source('src/app/version.ts');
    expect(pkg.version).toBe('0.2.0-rc.2');
    expect(version).toContain("APP_VERSION = '0.2.0-rc.2'");
    expect(version).toContain("APP_CHANNEL = 'Milestone 2 metadata extraction candidate'");
  });

  it('adds versioned metadata extraction and validation schema', () => {
    const migration = source('src/db/migrations/005_metadata_extraction.sql');
    expect(migration).toContain('CREATE TABLE line_extraction_rule');
    expect(migration).toContain('CREATE TABLE extraction_issue');
    expect(migration).toContain('CREATE TABLE filing_validation_result');
    expect(source('src/db/migrations.ts')).toContain("version: 5");
  });

  it('defines eleven 2024 Schedule H Part I line rules from metadata', () => {
    const migration = source('src/db/migrations/005_metadata_extraction.sql');
    for (const location of ['1C9', '1D1', '1D2', '1E', '1F', '1G', '1H', '1I', '1J', '1K', '1L']) {
      expect(migration).toContain(`'${location}'`);
    }
    expect(migration).toContain("'POSITIONAL_BOY_EOY'");
    expect(migration).toContain('source_authority');
    expect(migration).toContain('source_reference');
  });

  it('maps new form locations to stable canonical concepts', () => {
    const migration = source('src/db/migrations/005_metadata_extraction.sql');
    for (const concept of [
      'EMPLOYER_SECURITIES_VALUE',
      'EMPLOYER_REAL_PROPERTY_VALUE',
      'PLAN_OPERATION_PROPERTY_VALUE',
      'TOTAL_ASSETS',
      'BENEFIT_CLAIMS_PAYABLE',
      'OPERATING_PAYABLES',
      'ACQUISITION_INDEBTEDNESS',
      'OTHER_LIABILITIES',
      'TOTAL_LIABILITIES',
      'NET_ASSETS',
    ]) {
      expect(migration).toContain(concept);
    }
  });

  it('uses one reusable extraction engine rather than a hard-coded 1C9 parser path', () => {
    const engine = source('src/pdf/structuredExtraction.ts');
    const legacy = source('src/pdf/scheduleH1c9.ts');
    const importPanel = source('src/components/PdfImportPanel.tsx');
    expect(engine).toContain('extractDefinedValues');
    expect(engine).toContain('METADATA_POSITIONAL_BOY_EOY_V1');
    expect(legacy).toContain('extractDefinedValues');
    expect(importPanel).toContain('runStructuredExtraction');
    expect(importPanel).not.toContain('extractScheduleH1c9');
  });

  it('rejects template placeholders and fails closed on ambiguous numeric cells', () => {
    const engine = source('src/pdf/structuredExtraction.ts');
    expect(engine).toContain('looksLikeFormPlaceholder');
    expect(engine).toContain('AMBIGUOUS_NUMERIC_CELL');
    expect(engine).toContain('if (!numeric.length)');
  });

  it('re-extracts already stored PDFs without requiring re-import', () => {
    const panel = source('src/components/StructuredExtractionPanel.tsx');
    expect(panel).toContain('readStoredFile');
    expect(panel).toContain('extractPdfPages');
    expect(panel).toContain('Re-extract structured values');
  });

  it('persists extraction issues in an explicit review queue', () => {
    const repository = source('src/db/repository.ts');
    const panel = source('src/components/StructuredExtractionPanel.tsx');
    expect(repository).toContain('INSERT INTO extraction_issue');
    expect(repository).toContain('listExtractionIssues');
    expect(repository).toContain('markExtractionIssueReviewed');
    expect(panel).toContain('Open review items');
    expect(panel).toContain('Mark reviewed');
  });

  it('runs a deterministic Schedule H net-assets identity without treating missing values as zero', () => {
    const repository = source('src/db/repository.ts');
    expect(repository).toContain('H_PART_I_NET_ASSETS_IDENTITY');
    expect(repository).toContain("status: 'PASS' | 'FAIL' | 'NOT_EVALUATED'");
    expect(repository).toContain('1L = 1F - 1K');
    expect(repository).toContain('not evaluated because 1F, 1K, or 1L is missing');
  });

  it('shows extraction, value review, and deterministic validation as separate workflow steps', () => {
    const wizard = source('src/components/ReviewWizard.tsx');
    expect(wizard).toContain('<span>2</span> Extract');
    expect(wizard).toContain('<span>3</span> Verify values');
    expect(wizard).toContain('<span>4</span> Validate');
    expect(wizard).toContain('StructuredExtractionPanel');
    expect(wizard).toContain('ValidationPanel');
  });

  it('shows process feedback for Milestone 2 non-instant operations', () => {
    const extraction = source('src/components/StructuredExtractionPanel.tsx');
    const review = source('src/components/ExtractionReview.tsx');
    const history = source('src/components/ConceptHistoryPanel.tsx');
    for (const content of [extraction, review, history]) {
      expect(content).toContain('ProcessStatus');
    }
  });

  it('adds deterministic year-over-year concept deltas without replacing authoritative values', () => {
    const history = source('src/components/ConceptHistoryPanel.tsx');
    expect(history).toContain('year_over_year_change');
    expect(history).toContain('year_over_year_change_pct');
    expect(history).toContain('Δ vs prior');
    expect(history).toContain('queryCanonicalHistory');
  });

  it('keeps extraction-definition URLs as inert provenance rather than runtime retrieval targets', () => {
    const migration = source('src/db/migrations/005_metadata_extraction.sql');
    expect(migration).toContain('source_url');
    expect(source('src/pdf/structuredExtraction.ts')).not.toContain('fetch(');
    expect(source('src/pdf/runStructuredExtraction.ts')).not.toContain('fetch(');
  });
});
