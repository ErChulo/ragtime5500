import { describe, expect, it } from 'vitest';
import { chooseMatch, inferDocumentSignals } from '../src/matching/matchPdf';
import type { DocumentSignals } from '../src/types/domain';

const signals: DocumentSignals = {
  filename: '20250115093000NAL0000000000001.pdf',
  filingId: '20250115093000NAL0000000000001',
  planNumber: '2', planYear: 2024, filingDate: '2025-01-15', ein: null,
  planName: 'Example Pension Plan',
};

describe('PDF/eFAST matching', () => {
  it('auto-accepts a unique high-confidence match', () => {
    const match = chooseMatch(signals, [{
      importRowId: 9, planNumber: '2', planName: 'Example Pension Plan',
      planYear: 2024, dateReceived: '2025-01-15',
      sourceUrl: 'https://example.invalid/20250115093000NAL0000000000001.pdf',
      efastFilingId: '20250115093000NAL0000000000001', sponsorEin: null,
    }]);
    expect(match?.status).toBe('AUTO_ACCEPTED');
    expect(match?.score).toBe(1);
  });

  it('does not auto-accept a plan-year conflict', () => {
    const match = chooseMatch(signals, [{
      importRowId: 10, planNumber: '2', planName: 'Example Pension Plan',
      planYear: 2023, dateReceived: '2025-01-15', sourceUrl: null,
      efastFilingId: null, sponsorEin: null,
    }]);
    expect(match?.status ?? 'UNMATCHED').not.toBe('AUTO_ACCEPTED');
  });
});


  it('matches a year-named PDF to the unique filtered target row for that year', () => {
    const yearOnlySignals: DocumentSignals = {
      filename: '2009.pdf',
      filingId: null,
      planNumber: null,
      planYear: 2009,
      filingDate: null,
      ein: null,
      planName: null,
    };

    const match = chooseMatch(yearOnlySignals, [
      {
        importRowId: 20,
        planNumber: '2',
        planName: 'Blonder-Tongue Pension Plan',
        planYear: 2009,
        dateReceived: null,
        sourceUrl: null,
        efastFilingId: null,
        sponsorEin: null,
      },
      {
        importRowId: 21,
        planNumber: '2',
        planName: 'Blonder-Tongue Pension Plan',
        planYear: 2010,
        dateReceived: null,
        sourceUrl: null,
        efastFilingId: null,
        sponsorEin: null,
      },
    ]);

    expect(match?.status).toBe('AUTO_ACCEPTED');
    expect(match?.importRowId).toBe(20);
    expect(match?.score).toBeGreaterThanOrEqual(0.9);
  });

  it('does not auto-accept a unique year when the PDF reports a conflicting plan number', () => {
    const conflicting: DocumentSignals = {
      filename: '2009.pdf',
      filingId: null,
      planNumber: '501',
      planYear: 2009,
      filingDate: null,
      ein: null,
      planName: null,
    };

    const match = chooseMatch(conflicting, [{
      importRowId: 30,
      planNumber: '2',
      planName: 'Blonder-Tongue Pension Plan',
      planYear: 2009,
      dateReceived: null,
      sourceUrl: null,
      efastFilingId: null,
      sponsorEin: null,
    }]);

    expect(match?.status ?? 'UNMATCHED').not.toBe('AUTO_ACCEPTED');
  });


it('infers the plan year from a YYYY.pdf filename when PDF text does not provide it', () => {
  const inferred = inferDocumentSignals('2009.pdf', []);
  expect(inferred.planYear).toBe(2009);
});
