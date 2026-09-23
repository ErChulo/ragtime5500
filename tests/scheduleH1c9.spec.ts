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

  it('returns no value rather than inferring a missing column', () => {
    const page: PdfPageText = {
      pageNumber: 7, width: 1000, height: 1200,
      text: 'Schedule H 1c(9) Common/collective trusts',
      tokens: [token('1c(9)', 40), token('Common/collective', 110), token('trusts', 250), token('1,175,000', 840)],
    };
    expect(extractScheduleH1c9([page])).toEqual([]);
  });
});
