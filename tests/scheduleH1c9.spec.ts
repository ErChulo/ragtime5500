import { describe, expect, it } from 'vitest';
import { extractScheduleH1c9 } from '../src/pdf/scheduleH1c9';
import type { PdfPageText } from '../src/types/domain';

function token(text: string, x: number, y = 500) {
  return { text, x, y, width: Math.max(8, text.length * 6), height: 10 };
}

describe('Schedule H 1C9 parser', () => {
  it('extracts BOY and EOY from one positioned line', () => {
    const page: PdfPageText = {
      pageNumber: 7, width: 1000, height: 1200,
      text: 'Schedule H Part I 1c(9) Common/collective trusts',
      tokens: [
        token('1c(9)', 40), token('Common/collective', 110), token('trusts', 250),
        token('1,250,000', 650), token('1,175,000', 840),
      ],
    };
    const values = extractScheduleH1c9([page]);
    expect(values.map((x) => [x.subfield, x.normalizedNumber])).toEqual([
      ['BOY', 1250000], ['EOY', 1175000],
    ]);
    expect(values[0].sourcePage).toBe(7);
  });

  it('ignores fillable-form placeholder numerals instead of saving them as BOY', () => {
    const page: PdfPageText = {
      pageNumber: 7, width: 1000, height: 1200,
      text: 'Schedule H Part I 1c(9) Common/collective trusts',
      tokens: [
        token('1c(9)', 40), token('Common/collective', 110), token('trusts', 250),
        token('1,250,000', 650),
        token('-123,456,789,012,345', 700),
        token('1,175,000', 840),
      ],
    };
    const values = extractScheduleH1c9([page]);
    expect(values.map((x) => [x.subfield, x.normalizedNumber])).toEqual([
      ['BOY', 1250000], ['EOY', 1175000],
    ]);
  });

  it('fails closed when extra non-placeholder numeric values make a column ambiguous', () => {
    const page: PdfPageText = {
      pageNumber: 7, width: 1000, height: 1200,
      text: 'Schedule H Part I 1c(9) Common/collective trusts',
      tokens: [
        token('1c(9)', 40), token('Common/collective', 110), token('trusts', 250),
        token('1,250,000', 620), token('999', 680), token('1,175,000', 840),
      ],
    };
    expect(extractScheduleH1c9([page])).toEqual([]);
  });

  it('extracts only the populated positional column without inventing the blank column', () => {
    const page: PdfPageText = {
      pageNumber: 7, width: 1000, height: 1200,
      text: 'Schedule H 1c(9) Common/collective trusts',
      tokens: [token('1c(9)', 40), token('Common/collective', 110), token('trusts', 250), token('1,175,000', 840)],
    };
    const values = extractScheduleH1c9([page]);
    expect(values.map((value) => [value.subfield, value.normalizedNumber])).toEqual([['EOY', 1175000]]);
    expect(values.some((value) => value.subfield === 'BOY')).toBe(false);
  });
});
