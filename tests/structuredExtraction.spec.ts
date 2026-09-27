import { describe, expect, it } from 'vitest';
import { extractDefinedValues } from '../src/pdf/structuredExtraction';
import type { PdfPageText, PositionedToken, StructuredExtractionRule } from '../src/types/domain';

function token(text: string, x: number, y = 500): PositionedToken {
  return { text, x, y, width: Math.max(8, text.length * 6), height: 10 };
}

function page(tokens: PositionedToken[], pageNumber = 16): PdfPageText {
  return {
    pageNumber,
    width: 1000,
    height: 1200,
    text: ['Schedule H Part I', ...tokens.map((item) => item.text)].join(' '),
    tokens,
  };
}

function rule(
  locationReference: string,
  canonicalConcept: string,
  labelPattern: string,
): StructuredExtractionRule {
  return {
    extractionRuleId: Number(locationReference.replace(/\D/g, '') || 1),
    formYear: 2024,
    schedule: 'H',
    part: 'I',
    locationReference,
    canonicalConcept,
    label: canonicalConcept,
    labelPattern,
    strategy: 'POSITIONAL_BOY_EOY',
    minValueXRatio: 0.45,
    sourceAuthority: 'test',
    sourceReference: `test ${locationReference}`,
    sourceUrl: null,
  };
}

describe('metadata-driven Schedule H extraction', () => {
  it('extracts multiple defined lines through the same engine', () => {
    const result = extractDefinedValues([
      page([
        token('Beginning of Year', 620, 700),
        token('End of Year', 820, 700),
        token('1c(9)', 40, 600), token('Common/collective', 120, 600), token('trusts', 260, 600),
        token('1,133,669', 650, 600), token('957,892', 840, 600),
        token('1f', 40, 500), token('Total', 120, 500), token('assets', 180, 500),
        token('5,000,000', 650, 500), token('4,800,000', 840, 500),
      ]),
    ], [
      rule('1C9', 'COMMON_COLLECTIVE_TRUST_VALUE', 'common.*collective.*trust'),
      rule('1F', 'TOTAL_ASSETS', 'total.*assets'),
    ]);

    expect(result.issues).toEqual([]);
    expect(result.values.map((value) => [value.locationReference, value.subfield, value.normalizedNumber])).toEqual([
      ['1C9', 'BOY', 1133669],
      ['1C9', 'EOY', 957892],
      ['1F', 'BOY', 5000000],
      ['1F', 'EOY', 4800000],
    ]);
  });

  it('preserves a legitimately blank BOY cell and extracts only EOY', () => {
    const result = extractDefinedValues([
      page([
        token('Beginning of Year', 620, 700),
        token('End of Year', 820, 700),
        token('1h', 40), token('Operating', 120), token('payables', 200),
        token('425,893', 840),
      ]),
    ], [rule('1H', 'OPERATING_PAYABLES', 'operating.*payables')]);

    expect(result.issues).toEqual([]);
    expect(result.values.map((value) => [value.subfield, value.normalizedNumber])).toEqual([
      ['EOY', 425893],
    ]);
  });

  it('rejects hidden fillable-form placeholder numerals', () => {
    const result = extractDefinedValues([
      page([
        token('1c(9)', 40), token('Common/collective', 120), token('trusts', 260),
        token('1,133,669', 650), token('-123,456,789,012,345', 700), token('957,892', 840),
      ]),
    ], [rule('1C9', 'COMMON_COLLECTIVE_TRUST_VALUE', 'common.*collective.*trust')]);

    expect(result.values.map((value) => value.normalizedNumber)).toEqual([1133669, 957892]);
    expect(result.values.some((value) => Math.abs(value.normalizedNumber) === 123456789012345)).toBe(false);
  });

  it('fails closed when more than one legitimate number lands in one amount column', () => {
    const result = extractDefinedValues([
      page([
        token('1f', 40), token('Total', 120), token('assets', 180),
        token('5,000,000', 620), token('999', 680), token('4,800,000', 840),
      ]),
    ], [rule('1F', 'TOTAL_ASSETS', 'total.*assets')]);

    expect(result.values).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        locationReference: '1F',
        reason: 'AMBIGUOUS_NUMERIC_CELL',
        sourcePage: 16,
      }),
    ]);
  });

  it('records a definition issue when the configured line cannot be located', () => {
    const result = extractDefinedValues([
      page([token('1f', 40), token('Total', 120), token('assets', 180), token('5,000,000', 650), token('4,800,000', 840)]),
    ], [rule('1K', 'TOTAL_LIABILITIES', 'total.*liabilit')]);

    expect(result.values).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ locationReference: '1K', reason: 'LINE_NOT_FOUND' }),
    ]);
  });

  it('can locate a line by its metadata label when the printed reference token is absent', () => {
    const result = extractDefinedValues([
      page([
        token('Net', 120), token('assets', 170),
        token('4,900,000', 650), token('4,700,000', 840),
      ]),
    ], [rule('1L', 'NET_ASSETS', 'net.*assets')]);

    expect(result.values.map((value) => [value.subfield, value.normalizedNumber])).toEqual([
      ['BOY', 4900000],
      ['EOY', 4700000],
    ]);
  });

  it('never manufactures zero when both source cells are blank', () => {
    const result = extractDefinedValues([
      page([token('1g', 40), token('Benefit', 120), token('claims', 180), token('payable', 230)]),
    ], [rule('1G', 'BENEFIT_CLAIMS_PAYABLE', 'benefit.*claims.*payable')]);

    expect(result.values).toEqual([]);
    expect(result.issues).toEqual([]);
  });
});
