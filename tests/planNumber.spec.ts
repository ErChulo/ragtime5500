import { describe, expect, it } from 'vitest';
import { normalizePlanNumber, samePlanNumber } from '../src/ingest/planNumber';

describe('plan number normalization', () => {
  it('treats 2, 02, and 002 as the same plan number', () => {
    expect(normalizePlanNumber('002')).toBe('2');
    expect(normalizePlanNumber('02')).toBe('2');
    expect(normalizePlanNumber('2')).toBe('2');
    expect(samePlanNumber('002', '2')).toBe(true);
  });

  it('keeps plan 3 and plan 501 distinct from plan 2', () => {
    expect(samePlanNumber('3', '2')).toBe(false);
    expect(samePlanNumber('501', '2')).toBe(false);
  });

  it('handles whitespace and missing values safely', () => {
    expect(normalizePlanNumber(' 002 ')).toBe('2');
    expect(normalizePlanNumber('')).toBeNull();
    expect(normalizePlanNumber(null)).toBeNull();
  });
});
