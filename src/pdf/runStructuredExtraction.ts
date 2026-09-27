import type { PdfPageText, StructuredExtractionIssue } from '../types/domain';
import {
  listStructuredExtractionRules,
  recordStructuredExtraction,
  saveExtractedValues,
  validateScheduleHPartI,
} from '../db/repository';
import { extractDefinedValues } from './structuredExtraction';

export interface StructuredExtractionSummary {
  ruleCount: number;
  valueCount: number;
  issueCount: number;
  issues: StructuredExtractionIssue[];
  extractedLocations: string[];
}

export async function runStructuredExtraction(
  filingId: number,
  formYear: number,
  pages: PdfPageText[],
): Promise<StructuredExtractionSummary> {
  const rules = await listStructuredExtractionRules(formYear, 'H');
  if (!rules.length) {
    return { ruleCount: 0, valueCount: 0, issueCount: 0, issues: [], extractedLocations: [] };
  }

  const result = extractDefinedValues(pages, rules);
  if (result.values.length) {
    await saveExtractedValues(filingId, formYear, result.values);
  }
  await recordStructuredExtraction(filingId, rules.length, result.values, result.issues);
  await validateScheduleHPartI(filingId);

  return {
    ruleCount: rules.length,
    valueCount: result.values.length,
    issueCount: result.issues.length,
    issues: result.issues,
    extractedLocations: [...new Set(result.values.map((value) => value.locationReference))].sort(),
  };
}
