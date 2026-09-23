import { describe, expect, it } from 'vitest';
import { rowsToCsv } from '../src/utils/csvExport';

describe('CSV export', () => {
  it('quotes commas, quotes, and line breaks without changing values', () => {
    const csv = rowsToCsv([
      { year: 2024, plan: 'Example, Pension Plan', note: 'He said "ok"', value: 957892 },
      { year: 2023, plan: 'Other Plan', note: 'line 1\nline 2', value: null },
    ]);

    expect(csv).toBe(
      'year,plan,note,value\r\n' +
      '2024,"Example, Pension Plan","He said ""ok""",957892\r\n' +
      '2023,Other Plan,"line 1\nline 2",',
    );
  });

  it('returns an empty string for no rows', () => {
    expect(rowsToCsv([])).toBe('');
  });
});
