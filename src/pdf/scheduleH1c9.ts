import type { Extracted5500Value, PdfPageText, PositionedToken } from '../types/domain';

interface TextLine {
  y: number;
  tokens: PositionedToken[];
  text: string;
}

const canonicalConcept = 'COMMON_COLLECTIVE_TRUST_VALUE';

function groupLines(tokens: PositionedToken[]): TextLine[] {
  const sorted = [...tokens].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
  const lines: TextLine[] = [];
  for (const token of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - token.y) <= 2.5);
    if (line) {
      line.tokens.push(token);
    } else {
      lines.push({ y: token.y, tokens: [token], text: '' });
    }
  }
  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
    line.text = line.tokens.map((token) => token.text).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines.sort((a, b) => b.y - a.y);
}

function isTargetLine(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const hasReference = /\b1\s*c\s*\(?\s*9\s*\)?\b/i.test(normalized) || /\b1c9\b/i.test(normalized);
  const hasLabel = /common/.test(normalized) && /(collective|trust)/.test(normalized);
  return hasReference || hasLabel;
}

function parseMoneyToken(text: string): { raw: string; value: number } | null {
  const trimmed = text.trim();
  if (!/^\$?\(?-?[\d,]+\)?$/.test(trimmed)) return null;
  const negative = trimmed.includes('(') || trimmed.includes('-');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(value)) return null;
  return { raw: trimmed, value };
}

function extractFromLine(page: PdfPageText, line: TextLine): Extracted5500Value[] | null {
  const numeric = line.tokens
    .map((token) => ({ token, money: parseMoneyToken(token.text) }))
    .filter((item): item is { token: PositionedToken; money: { raw: string; value: number } } => item.money !== null)
    .filter((item) => item.token.x > page.width * 0.45);

  if (numeric.length < 2) return null;
  const [boy, eoy] = numeric.slice(-2).map((item) => item.money);
  const confidence = /common/i.test(line.text) && /trust/i.test(line.text) ? 0.96 : 0.88;

  return [
    {
      schedule: 'H', part: 'I', locationReference: '1C9', subfield: 'BOY',
      canonicalConcept, rawValue: boy.raw, normalizedNumber: boy.value,
      sourcePage: page.pageNumber, sourceText: line.text,
      extractionMethod: 'PDFJS_POSITIONAL_LINE_1C9', confidence,
      verificationStatus: 'EXTRACTED_UNVERIFIED',
    },
    {
      schedule: 'H', part: 'I', locationReference: '1C9', subfield: 'EOY',
      canonicalConcept, rawValue: eoy.raw, normalizedNumber: eoy.value,
      sourcePage: page.pageNumber, sourceText: line.text,
      extractionMethod: 'PDFJS_POSITIONAL_LINE_1C9', confidence,
      verificationStatus: 'EXTRACTED_UNVERIFIED',
    },
  ];
}

export function extractScheduleH1c9(pages: PdfPageText[]): Extracted5500Value[] {
  const schedulePages = pages.filter((page) => /schedule\s+h/i.test(page.text));
  const candidates = schedulePages.length ? schedulePages : pages;

  for (const page of candidates) {
    const lines = groupLines(page.tokens);
    for (const line of lines) {
      if (!isTargetLine(line.text)) continue;
      const values = extractFromLine(page, line);
      if (values) return values;
    }
  }

  return [];
}
