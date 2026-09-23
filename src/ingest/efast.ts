import type { EfastRow } from '../types/domain';
import { parseCsv, recordToObject } from './csv';

const COLUMN_ALIASES: Record<string, string[]> = {
  planNumber: ['PN', 'Plan Number', 'PlanNumber'],
  planName: ['Plan Name', 'PlanName'],
  dateReceived: ['Date Received', 'DateReceived'],
  planCodes: ['Plan Codes', 'PlanCodes'],
  planYear: ['Plan Year', 'PlanYear'],
  participants: ['Participants'],
  participantsEoy: ['Participants EOY', 'ParticipantsEOY'],
  assetsBoy: ['Assets BOY', 'AssetsBOY'],
  assetsEoy: ['Assets', 'Assets EOY', 'AssetsEOY'],
  sourceUrl: ['Link', 'URL', 'Source URL'],
};

function pick(raw: Record<string, string>, aliases: string[]): string | null {
  const key = Object.keys(raw).find((candidate) => aliases.some((alias) => candidate.trim().toLowerCase() === alias.toLowerCase()));
  if (!key) return null;
  const value = raw[key]?.trim();
  return value ? value : null;
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/[$,%s]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: string | null): number | null {
  const number = numberOrNull(value);
  return number === null ? null : Math.trunc(number);
}

export function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const mdy = value.match(/^(d{1,2})/(d{1,2})/(d{4})$/);
  if (!mdy) return value;
  return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
}

export function filingIdFromUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(//([^/?#]+).pdf(?:[?#].*)?$/i);
  return match?.[1] ?? null;
}

export function parseEfastCsv(text: string): EfastRow[] {
  const parsed = parseCsv(text);
  return parsed.records.map((record, index) => {
    const raw = recordToObject(parsed.headers, record);
    const sourceUrl = pick(raw, COLUMN_ALIASES.sourceUrl);
    return {
      rowNumber: index + 1,
      rawRecordText: record.raw,
      raw,
      planNumber: pick(raw, COLUMN_ALIASES.planNumber),
      planName: pick(raw, COLUMN_ALIASES.planName),
      planYear: integerOrNull(pick(raw, COLUMN_ALIASES.planYear)),
      dateReceived: normalizeDate(pick(raw, COLUMN_ALIASES.dateReceived)),
      planCodes: pick(raw, COLUMN_ALIASES.planCodes),
      participants: integerOrNull(pick(raw, COLUMN_ALIASES.participants)),
      participantsEoy: integerOrNull(pick(raw, COLUMN_ALIASES.participantsEoy)),
      assetsBoy: numberOrNull(pick(raw, COLUMN_ALIASES.assetsBoy)),
      assetsEoy: numberOrNull(pick(raw, COLUMN_ALIASES.assetsEoy)),
      sourceUrl,
      filingId: filingIdFromUrl(sourceUrl),
    };
  });
}
