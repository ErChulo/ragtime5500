import type {
  Extracted5500Value,
  PdfPageText,
  PositionedToken,
  StructuredExtractionIssue,
  StructuredExtractionResult,
  StructuredExtractionRule,
} from '../types/domain';

interface TextLine {
  y: number;
  tokens: PositionedToken[];
  text: string;
}

interface ColumnCenters {
  boy: number;
  eoy: number;
  detectedFromHeader: boolean;
}

function groupLines(tokens: PositionedToken[]): TextLine[] {
  const sorted = [...tokens].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
  const lines: TextLine[] = [];
  for (const token of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - token.y) <= 2.5);
    if (line) line.tokens.push(token);
    else lines.push({ y: token.y, tokens: [token], text: '' });
  }

  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
    line.text = line.tokens.map((token) => token.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines.sort((a, b) => b.y - a.y);
}

function normalizeReference(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function looksLikeFormPlaceholder(digits: string): boolean {
  const compact = digits.replace(/^0+/, '');
  return compact === '123456789012345'
    || compact === '12345678901234'
    || /^1234567890(?:12345)?$/.test(compact);
}

function parseMoneyToken(text: string): { raw: string; value: number } | null {
  const trimmed = text.trim();
  if (!/^\$?\(?-?[\d,]+\)?$/.test(trimmed)) return null;
  const negative = trimmed.includes('(') || trimmed.includes('-');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits || looksLikeFormPlaceholder(digits)) return null;
  const value = Number(digits) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(value)) return null;
  return { raw: trimmed, value };
}

function detectColumnCenters(page: PdfPageText): ColumnCenters {
  const beginning = page.tokens.find((token) => /beginning/i.test(token.text));
  const ending = page.tokens.find((token) => /\bend\b/i.test(token.text));

  if (beginning && ending && beginning.x < ending.x) {
    return {
      boy: beginning.x + Math.max(beginning.width / 2, 0),
      eoy: ending.x + Math.max(ending.width / 2, 0),
      detectedFromHeader: true,
    };
  }

  return {
    boy: page.width * 0.66,
    eoy: page.width * 0.84,
    detectedFromHeader: false,
  };
}

function lineMatchScore(line: TextLine, rule: StructuredExtractionRule): {
  score: number;
  referenceMatched: boolean;
  labelMatched: boolean;
} {
  const referenceMatched = normalizeReference(line.text).includes(normalizeReference(rule.locationReference));
  let labelMatched = false;
  try {
    labelMatched = new RegExp(rule.labelPattern, 'i').test(line.text);
  } catch {
    labelMatched = false;
  }

  return {
    score: (referenceMatched ? 2 : 0) + (labelMatched ? 1 : 0),
    referenceMatched,
    labelMatched,
  };
}

function scheduleCandidatePages(pages: PdfPageText[], schedule: string): PdfPageText[] {
  const schedulePattern = new RegExp(`schedule\\s+${schedule.replace(/[^A-Za-z0-9]/g, '')}`, 'i');
  const explicit = pages.filter((page) => schedulePattern.test(page.text));
  return explicit.length ? explicit : pages;
}

function makeValue(
  rule: StructuredExtractionRule,
  subfield: 'BOY' | 'EOY',
  money: { raw: string; value: number },
  page: PdfPageText,
  line: TextLine,
  confidence: number,
): Extracted5500Value {
  return {
    schedule: rule.schedule,
    part: rule.part,
    locationReference: rule.locationReference,
    subfield,
    canonicalConcept: rule.canonicalConcept,
    rawValue: money.raw,
    normalizedNumber: money.value,
    sourcePage: page.pageNumber,
    sourceText: line.text,
    extractionMethod: 'METADATA_POSITIONAL_BOY_EOY_V1',
    confidence,
    verificationStatus: 'EXTRACTED_UNVERIFIED',
  };
}

function extractBoyEoy(
  page: PdfPageText,
  line: TextLine,
  rule: StructuredExtractionRule,
  referenceMatched: boolean,
  labelMatched: boolean,
): { values: Extracted5500Value[]; issue: StructuredExtractionIssue | null } {
  const numeric = line.tokens
    .map((token) => ({ token, money: parseMoneyToken(token.text) }))
    .filter((item): item is { token: PositionedToken; money: { raw: string; value: number } } => item.money !== null)
    .filter((item) => item.token.x > page.width * rule.minValueXRatio);

  // A blank BOY/EOY cell is a legitimate source state. Never manufacture zero.
  if (!numeric.length) return { values: [], issue: null };

  const centers = detectColumnCenters(page);

  // Preserve the accepted Milestone 1 invariant: after placeholder rejection,
  // exactly two legitimate amount tokens on a BOY/EOY line are unambiguous by
  // horizontal order. Do not let imperfect PDF header token geometry turn
  // that deterministic case into an extraction issue.
  if (numeric.length === 2) {
    const ordered = [...numeric].sort((a, b) => a.token.x - b.token.x);
    const confidence = Math.min(
      0.99,
      0.84
        + (referenceMatched ? 0.07 : 0)
        + (labelMatched ? 0.04 : 0)
        + (centers.detectedFromHeader ? 0.04 : 0),
    );
    return {
      values: [
        makeValue(rule, 'BOY', ordered[0].money, page, line, confidence),
        makeValue(rule, 'EOY', ordered[1].money, page, line, confidence),
      ],
      issue: null,
    };
  }

  const buckets: Record<'BOY' | 'EOY', typeof numeric> = { BOY: [], EOY: [] };

  for (const item of numeric) {
    const boyDistance = Math.abs(item.token.x - centers.boy);
    const eoyDistance = Math.abs(item.token.x - centers.eoy);
    const closest: 'BOY' | 'EOY' = boyDistance <= eoyDistance ? 'BOY' : 'EOY';
    const distance = Math.min(boyDistance, eoyDistance);

    if (distance > page.width * 0.20) {
      return {
        values: [],
        issue: {
          schedule: rule.schedule,
          part: rule.part,
          locationReference: rule.locationReference,
          reason: 'AMBIGUOUS_NUMERIC_CELL',
          sourcePage: page.pageNumber,
          sourceText: line.text,
        },
      };
    }
    buckets[closest].push(item);
  }

  if (buckets.BOY.length > 1 || buckets.EOY.length > 1) {
    return {
      values: [],
      issue: {
        schedule: rule.schedule,
        part: rule.part,
        locationReference: rule.locationReference,
        reason: 'AMBIGUOUS_NUMERIC_CELL',
        sourcePage: page.pageNumber,
        sourceText: line.text,
      },
    };
  }

  const confidence = Math.min(
    0.99,
    0.84
      + (referenceMatched ? 0.07 : 0)
      + (labelMatched ? 0.04 : 0)
      + (centers.detectedFromHeader ? 0.04 : 0),
  );

  const values: Extracted5500Value[] = [];
  if (buckets.BOY[0]) values.push(makeValue(rule, 'BOY', buckets.BOY[0].money, page, line, confidence));
  if (buckets.EOY[0]) values.push(makeValue(rule, 'EOY', buckets.EOY[0].money, page, line, confidence));
  return { values, issue: null };
}

export function extractDefinedValues(
  pages: PdfPageText[],
  rules: StructuredExtractionRule[],
): StructuredExtractionResult {
  const values: Extracted5500Value[] = [];
  const issues: StructuredExtractionIssue[] = [];

  for (const rule of rules.filter((item) => item.strategy === 'POSITIONAL_BOY_EOY')) {
    const candidates: Array<{
      page: PdfPageText;
      line: TextLine;
      score: number;
      referenceMatched: boolean;
      labelMatched: boolean;
    }> = [];

    for (const page of scheduleCandidatePages(pages, rule.schedule)) {
      for (const line of groupLines(page.tokens)) {
        const match = lineMatchScore(line, rule);
        if (match.score > 0) candidates.push({ page, line, ...match });
      }
    }

    candidates.sort((a, b) => b.score - a.score || a.page.pageNumber - b.page.pageNumber);

    const candidate = candidates[0];
    if (!candidate) {
      issues.push({
        schedule: rule.schedule,
        part: rule.part,
        locationReference: rule.locationReference,
        reason: 'LINE_NOT_FOUND',
        sourcePage: null,
        sourceText: null,
      });
      continue;
    }

    if (rule.strategy !== 'POSITIONAL_BOY_EOY') {
      issues.push({
        schedule: rule.schedule,
        part: rule.part,
        locationReference: rule.locationReference,
        reason: 'UNSUPPORTED_STRATEGY',
        sourcePage: candidate.page.pageNumber,
        sourceText: candidate.line.text,
      });
      continue;
    }

    const extracted = extractBoyEoy(
      candidate.page,
      candidate.line,
      rule,
      candidate.referenceMatched,
      candidate.labelMatched,
    );
    values.push(...extracted.values);
    if (extracted.issue) issues.push(extracted.issue);
  }

  return { values, issues };
}
