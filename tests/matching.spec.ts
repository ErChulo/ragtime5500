import { describe, expect, it } from 'vitest';
import { chooseMatch } from '../src/matching/matchPdf';
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
