import { describe, expect, it } from 'vitest';
import { parseEfastCsv } from '../src/ingest/efast';

describe('eFAST CSV parsing', () => {
  it('preserves raw records and parses quoted plan names', () => {
    const csv = 'PN,Plan Name,Date Received,Plan Year,Participants,Participants EOY,Assets BOY,Assets,Link\r\n' +
      '2,"Example, Pension Plan",01/15/2025,2024,100,96,2500000,2375000,https://example.invalid/20250115093000NAL0000000000001.pdf\r\n';
    const [row] = parseEfastCsv(csv);
    expect(row.planNumber).toBe('2');
    expect(row.planName).toBe('Example, Pension Plan');
    expect(row.planYear).toBe(2024);
    expect(row.filingId).toBe('20250115093000NAL0000000000001');
    expect(row.rawRecordText).toContain('"Example, Pension Plan"');
  });
});
