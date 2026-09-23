export type VerificationStatus =
  | 'SOURCE_REPORTED'
  | 'EXTRACTED_UNVERIFIED'
  | 'USER_VERIFIED'
  | 'USER_CORRECTED'
  | 'DERIVED';

export interface SqlRow {
  [key: string]: string | number | null;
}

export interface EfastRow {
  rowNumber: number;
  rawRecordText: string;
  raw: Record<string, string>;
  planNumber: string | null;
  planName: string | null;
  planYear: number | null;
  dateReceived: string | null;
  planCodes: string | null;
  participants: number | null;
  participantsEoy: number | null;
  assetsBoy: number | null;
  assetsEoy: number | null;
  sourceUrl: string | null;
  filingId: string | null;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  tokens: PositionedToken[];
}

export interface PositionedToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentSignals {
  filename: string;
  filingId: string | null;
  planNumber: string | null;
  planYear: number | null;
  filingDate: string | null;
  ein: string | null;
  planName: string | null;
}

export interface MatchCandidate {
  importRowId: number;
  score: number;
  status: 'AUTO_ACCEPTED' | 'AMBIGUOUS';
  evidence: Record<string, unknown>;
}

export interface Extracted5500Value {
  schedule: string;
  part: string;
  locationReference: string;
  subfield: 'BOY' | 'EOY';
  canonicalConcept: string;
  rawValue: string;
  normalizedNumber: number;
  sourcePage: number;
  sourceText: string;
  extractionMethod: string;
  confidence: number;
  verificationStatus: VerificationStatus;
}
