import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/ingest/csv';
import { filingIdFromUrl, normalizeDate, parseEfastCsv } from '../src/ingest/efast';
import { displayPlanNumber, normalizePlanNumber, samePlanNumber } from '../src/ingest/planNumber';
import { chooseMatch, inferDocumentSignals, scoreCandidate } from '../src/matching/matchPdf';
import { extractScheduleH1c9 } from '../src/pdf/scheduleH1c9';
import type { DocumentSignals, PdfPageText, PositionedToken } from '../src/types/domain';

function page(text: string, tokens: PositionedToken[] = [], pageNumber = 1): PdfPageText {
  return { pageNumber, width: 1000, height: 1200, text, tokens };
}

function token(text: string, x: number, y = 500): PositionedToken {
  return { text, x, y, width: Math.max(8, text.length * 6), height: 10 };
}

const baseSignals: DocumentSignals = {
  filename: 'filing.pdf',
  filingId: null,
  planNumber: null,
  planYear: null,
  filingDate: null,
  ein: null,
  planName: null,
};

describe('Milestone 1 ingestion edge cases', () => {
  it('accepts a UTF-8 BOM in the first CSV header', () => {
    const parsed = parseCsv('\uFEFFPN,Plan Year\r\n2,2024\r\n');
    expect(parsed.headers).toEqual(['PN', 'Plan Year']);
  });

  it('decodes escaped quotes inside a quoted field', () => {
    const parsed = parseCsv('PN,Plan Name\n2,"Example ""Quoted"" Plan"\n');
    expect(parsed.records[0].fields[1]).toBe('Example "Quoted" Plan');
  });

  it('preserves embedded newlines inside quoted CSV fields', () => {
    const parsed = parseCsv('PN,Plan Name\n2,"Example\nPension Plan"\n');
    expect(parsed.records[0].fields[1]).toBe('Example\nPension Plan');
  });

  it('rejects CSV rows with the wrong field count', () => {
    expect(() => parseCsv('A,B\n1,2,3\n')).toThrow(/expected 2/i);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('A,B\n1,"two\n')).toThrow(/unterminated/i);
  });

  it('rejects an empty CSV header', () => {
    expect(() => parseCsv('A,\n1,2\n')).toThrow(/header 2 is empty/i);
  });

  it('recognizes alternate eFAST column names', () => {
    const [row] = parseEfastCsv(
      'PlanNumber,PlanName,DateReceived,PlanYear,ParticipantsEOY,AssetsBOY,AssetsEOY,URL\n' +
      '002,Example Plan,1/5/2025,2024,96,"$2,500,000","2,375,000",https://example.invalid/ABC123456789012345678.pdf\n',
    );
    expect(row.planNumber).toBe('002');
    expect(row.planYear).toBe(2024);
    expect(row.dateReceived).toBe('2025-01-05');
    expect(row.participantsEoy).toBe(96);
    expect(row.assetsBoy).toBe(2500000);
    expect(row.assetsEoy).toBe(2375000);
    expect(row.filingId).toBe('ABC123456789012345678');
  });

  it('leaves already normalized dates unchanged', () => {
    expect(normalizeDate('2025-01-05')).toBe('2025-01-05');
  });

  it('extracts a filing id from a PDF URL with query text', () => {
    expect(filingIdFromUrl('https://example.invalid/ABC123456789012345678.pdf?x=1#y'))
      .toBe('ABC123456789012345678');
  });

  it('does not invent a filing id when the provenance URL is absent', () => {
    expect(filingIdFromUrl(null)).toBeNull();
  });
});

describe('Milestone 1 plan-number normalization', () => {
  it('normalizes leading-zero numeric plan numbers', () => {
    expect(normalizePlanNumber('002')).toBe('2');
  });

  it('normalizes nonnumeric plan identifiers deterministically', () => {
    expect(normalizePlanNumber(' ab-2 ')).toBe('AB-2');
  });

  it('treats blank plan numbers as missing', () => {
    expect(normalizePlanNumber('   ')).toBeNull();
  });

  it('matches equivalent numeric plan numbers', () => {
    expect(samePlanNumber('002', 2)).toBe(true);
  });

  it('does not match a missing plan number', () => {
    expect(samePlanNumber(null, 2)).toBe(false);
  });

  it('uses a clear display fallback for missing plan numbers', () => {
    expect(displayPlanNumber(null)).toBe('Not reported');
  });
});

describe('Milestone 1 deterministic PDF matching', () => {
  it('scores an exact eFAST source filename', () => {
    const result = scoreCandidate(
      { ...baseSignals, filename: 'ABC.pdf' },
      { importRowId: 1, planNumber: null, planName: null, planYear: null, dateReceived: null, sourceUrl: 'https://example.invalid/ABC.pdf', efastFilingId: null },
    );
    expect(result.score).toBe(0.35);
    expect(result.evidence.sourceFilename).toBe('exact');
  });

  it('scores an exact EIN as evidence', () => {
    const result = scoreCandidate(
      { ...baseSignals, ein: '12-3456789' },
      { importRowId: 1, planNumber: null, planName: null, planYear: null, dateReceived: null, sourceUrl: null, efastFilingId: null, sponsorEin: '12-3456789' },
    );
    expect(result.score).toBe(0.2);
    expect(result.evidence.ein).toBe('exact');
  });

  it('records a plan-number conflict and will not auto-accept it', () => {
    const result = scoreCandidate(
      { ...baseSignals, planNumber: '2' },
      { importRowId: 1, planNumber: '3', planName: null, planYear: null, dateReceived: null, sourceUrl: null, efastFilingId: null },
    );
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.evidence.planNumber).toBe('conflict');
  });

  it('returns null when evidence is below the matching threshold', () => {
    const result = chooseMatch(
      { ...baseSignals, planName: 'Example Pension Plan' },
      [{ importRowId: 1, planNumber: null, planName: 'Example Pension Plan', planYear: null, dateReceived: null, sourceUrl: null, efastFilingId: null }],
    );
    expect(result).toBeNull();
  });

  it('marks an otherwise exact tie as ambiguous', () => {
    const signals = { ...baseSignals, filename: 'ID12345678901234567890.pdf', filingId: 'ID12345678901234567890' };
    const rows = [1, 2].map((importRowId) => ({
      importRowId,
      planNumber: null,
      planName: null,
      planYear: null,
      dateReceived: null,
      sourceUrl: 'https://example.invalid/ID12345678901234567890.pdf',
      efastFilingId: 'ID12345678901234567890',
    }));
    expect(chooseMatch(signals, rows)?.status).toBe('AMBIGUOUS');
  });

  it('refuses the unique-year shortcut when plan number conflicts', () => {
    const result = chooseMatch(
      { ...baseSignals, filename: '2024.pdf', planYear: 2024, planNumber: '3' },
      [{ importRowId: 1, planNumber: '2', planName: null, planYear: 2024, dateReceived: null, sourceUrl: null, efastFilingId: null }],
    );
    expect(result).toBeNull();
  });

  it('extracts filing metadata signals from local PDF text', () => {
    const signals = inferDocumentSignals(
      'local.pdf',
      [page('Name of plan: Example Pension Plan Plan number: 002 Employer EIN 12-3456789 Plan year 2024 Date filed: 1/15/2025')],
    );
    expect(signals.planName).toContain('Example Pension Plan');
    expect(signals.planNumber).toBe('002');
    expect(signals.ein).toBe('12-3456789');
    expect(signals.planYear).toBe(2024);
    expect(signals.filingDate).toBe('2025-01-15');
  });

  it('uses only the first four pages for metadata inference', () => {
    const pages = [1, 2, 3, 4].map((n) => page('Form 5500', [], n));
    pages.push(page('Plan number: 999 Plan year 2024', [], 5));
    const signals = inferDocumentSignals('local.pdf', pages);
    expect(signals.planNumber).toBeNull();
    expect(signals.planYear).toBeNull();
  });
});

describe('Milestone 1 Schedule H 1C9 extraction safety', () => {
  it('parses parenthesized amounts as negative values', () => {
    const values = extractScheduleH1c9([
      page('Schedule H Part I', [
        token('1c(9)', 40), token('Common', 110), token('collective', 180), token('trusts', 260),
        token('(1,250)', 650), token('(1,175)', 840),
      ], 7),
    ]);
    expect(values.map((value) => value.normalizedNumber)).toEqual([-1250, -1175]);
  });

  it('parses dollar-prefixed amounts', () => {
    const values = extractScheduleH1c9([
      page('Schedule H Part I', [
        token('1c(9)', 40), token('Common', 110), token('collective', 180), token('trusts', 260),
        token('$1,250', 650), token('$1,175', 840),
      ], 7),
    ]);
    expect(values.map((value) => value.normalizedNumber)).toEqual([1250, 1175]);
  });

  it('can identify the target line from its label even when the line number token is absent', () => {
    const values = extractScheduleH1c9([
      page('Schedule H Part I', [
        token('Common', 110), token('collective', 180), token('trusts', 260),
        token('1,250', 650), token('1,175', 840),
      ], 7),
    ]);
    expect(values).toHaveLength(2);
  });

  it('prefers Schedule H pages when other pages contain similar text', () => {
    const values = extractScheduleH1c9([
      page('Other schedule common collective trusts', [
        token('1c(9)', 40), token('common', 110), token('trusts', 220), token('9,999', 650), token('8,888', 840),
      ], 2),
      page('Schedule H Part I', [
        token('1c(9)', 40), token('common', 110), token('trusts', 220), token('1,250', 650), token('1,175', 840),
      ], 7),
    ]);
    expect(values.map((value) => value.normalizedNumber)).toEqual([1250, 1175]);
    expect(values[0].sourcePage).toBe(7);
  });

  it('never accepts the fillable-form 123456789012345 placeholder as a reported amount', () => {
    const values = extractScheduleH1c9([
      page('Schedule H Part I', [
        token('1c(9)', 40), token('common', 110), token('trusts', 220),
        token('1,250', 650), token('-123,456,789,012,345', 700), token('1,175', 840),
      ], 7),
    ]);
    expect(values.map((value) => value.normalizedNumber)).toEqual([1250, 1175]);
    expect(values.some((value) => Math.abs(value.normalizedNumber ?? 0) === 123456789012345)).toBe(false);
  });

  it('preserves unverified provenance status for machine extraction', () => {
    const values = extractScheduleH1c9([
      page('Schedule H Part I', [
        token('1c(9)', 40), token('common', 110), token('trusts', 220), token('1,250', 650), token('1,175', 840),
      ], 7),
    ]);
    expect(values.every((value) => value.verificationStatus === 'EXTRACTED_UNVERIFIED')).toBe(true);
    expect(values.every((value) => value.locationReference === '1C9')).toBe(true);
  });
});
