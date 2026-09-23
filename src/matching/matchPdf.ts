import type { DocumentSignals, MatchCandidate, PdfPageText } from '../types/domain';
import { filingIdFromUrl } from '../ingest/efast';

export interface MatchableEfastRow {
  importRowId: number;
  planNumber: string | null;
  planName: string | null;
  planYear: number | null;
  dateReceived: string | null;
  sourceUrl: string | null;
  efastFilingId: string | null;
  sponsorEin?: string | null;
}

function basename(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/([^/?#]+)(?:[?#].*)?$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizeName(value: string | null): string[] {
  if (!value) return [];
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const aa = new Set(a);
  const bb = new Set(b);
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const union = new Set([...aa, ...bb]).size;
  return union ? intersection / union : 0;
}


function normalizeDateSignal(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function sameNullable(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

export function inferDocumentSignals(filename: string, pages: PdfPageText[]): DocumentSignals {
  const firstText = pages.slice(0, 4).map((page) => page.text).join(' ');
  const filenameStem = filename.replace(/\.pdf$/i, '');
  const filingId = /^[A-Za-z0-9]{20,}$/.test(filenameStem)
    ? filenameStem
    : firstText.match(/\b([A-Z0-9]{20,})\b/)?.[1] ?? null;

  const planNumber = firstText.match(/plan\s*(?:number|no\.?|#)\s*[:\-]?\s*(\d{1,3})\b/i)?.[1] ?? null;
  const ein = firstText.match(/\b(\d{2}-\d{7})\b/)?.[1] ?? null;
  const explicitYear = firstText.match(/plan\s+year(?:\s+beginning)?[^0-9]{0,40}(20\d{2}|19\d{2})/i)?.[1];
  const planYear = explicitYear ? Number(explicitYear) : null;
  const dateMatch = firstText.match(/(?:date\s+(?:received|filed)|filing\s+date)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
  const filingDate = dateMatch ? normalizeDateSignal(dateMatch) : null;
  const nameMatch = firstText.match(/name\s+of\s+plan\s*[:\-]?\s*(.{5,120}?)(?:plan\s+number|employer|sponsor|ein|$)/i);
  const planName = nameMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null;

  return { filename, filingId, planNumber, planYear, filingDate, ein, planName };
}

export function scoreCandidate(signals: DocumentSignals, row: MatchableEfastRow): MatchCandidate {
  let score = 0;
  const evidence: Record<string, unknown> = {};
  let conflict = false;

  const rowFilingId = row.efastFilingId ?? filingIdFromUrl(row.sourceUrl);
  if (sameNullable(signals.filingId, rowFilingId)) {
    score += 0.55;
    evidence.filingId = 'exact';
  }

  if (basename(row.sourceUrl) === signals.filename.toLowerCase()) {
    score += 0.35;
    evidence.sourceFilename = 'exact';
  }

  if (signals.planYear !== null && row.planYear !== null) {
    if (signals.planYear === row.planYear) {
      score += 0.15;
      evidence.planYear = 'exact';
    } else {
      score -= 0.4;
      evidence.planYear = 'conflict';
      conflict = true;
    }
  }

  if (signals.planNumber && row.planNumber) {
    if (signals.planNumber.replace(/^0+/, '') === row.planNumber.replace(/^0+/, '')) {
      score += 0.15;
      evidence.planNumber = 'exact';
    } else {
      score -= 0.4;
      evidence.planNumber = 'conflict';
      conflict = true;
    }
  }

  if (sameNullable(signals.ein, row.sponsorEin)) {
    score += 0.2;
    evidence.ein = 'exact';
  }

  if (signals.filingDate && row.dateReceived) {
    const rowDate = normalizeDateSignal(row.dateReceived);
    if (rowDate === signals.filingDate) {
      score += 0.05;
      evidence.filingDate = 'exact';
    }
  }

  const similarity = jaccard(normalizeName(signals.planName), normalizeName(row.planName));
  if (similarity >= 0.6) {
    score += 0.1 * similarity;
    evidence.planNameSimilarity = Number(similarity.toFixed(3));
  }

  score = Math.max(0, Math.min(1, score));
  return {
    importRowId: row.importRowId,
    score,
    status: !conflict && score >= 0.9 ? 'AUTO_ACCEPTED' : 'AMBIGUOUS',
    evidence,
  };
}

export function chooseMatch(signals: DocumentSignals, rows: MatchableEfastRow[]): MatchCandidate | null {
  const ranked = rows.map((row) => scoreCandidate(signals, row)).sort((a, b) => b.score - a.score);
  if (!ranked.length || ranked[0].score < 0.35) return null;

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (best.status === 'AUTO_ACCEPTED' && (!runnerUp || best.score - runnerUp.score >= 0.15)) return best;
  return { ...best, status: 'AMBIGUOUS' };
}
