import type { Extracted5500Value, PdfPageText, StructuredExtractionRule } from '../types/domain';
import { extractDefinedValues } from './structuredExtraction';

const rule: StructuredExtractionRule = {
  extractionRuleId: 0,
  formYear: 2024,
  schedule: 'H',
  part: 'I',
  locationReference: '1C9',
  canonicalConcept: 'COMMON_COLLECTIVE_TRUST_VALUE',
  label: 'Common/collective trust value',
  labelPattern: 'common.*collective.*trust',
  strategy: 'POSITIONAL_BOY_EOY',
  minValueXRatio: 0.45,
  sourceAuthority: 'U.S. Department of Labor / IRS / PBGC',
  sourceReference: '2024 Schedule H (Form 5500), Part I, line 1c(9)',
  sourceUrl: null,
};

/**
 * Backward-compatible Milestone 1 entry point.
 * The extraction implementation is now the metadata-driven engine.
 */
export function extractScheduleH1c9(pages: PdfPageText[]): Extracted5500Value[] {
  return extractDefinedValues(pages, [rule]).values;
}
