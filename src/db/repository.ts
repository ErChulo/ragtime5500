import { db } from './client';
import type { EfastRow, Extracted5500Value } from '../types/domain';
import type { StoredFile } from '../ingest/opfsFiles';
import type { MatchableEfastRow } from '../matching/matchPdf';

function sourceTypeFor(category: 'csv' | 'pdf' | 'backup' | 'other'): string {
  if (category === 'csv') return 'EFAST_CSV';
  if (category === 'pdf') return 'FORM_5500_PDF';
  if (category === 'backup') return 'DATABASE_BACKUP';
  return 'OTHER';
}

export async function ensureSourceDocument(
  stored: StoredFile,
  category: 'csv' | 'pdf' | 'backup' | 'other',
  originalSourceUrl: string | null = null,
): Promise<number> {
  await db.exec(
    `INSERT OR IGNORE INTO source_document
      (filename, storage_key, mime_type, sha256, file_size, source_type, original_source_url)
     VALUES(?,?,?,?,?,?,?)`,
    [stored.filename, stored.storageKey, stored.mimeType, stored.sha256, stored.size, sourceTypeFor(category), originalSourceUrl],
  );
  const rows = await db.exec<{ source_document_id: number }>(
    'SELECT source_document_id FROM source_document WHERE sha256 = ?', [stored.sha256],
  );
  if (!rows[0]) throw new Error('Unable to create source_document.');
  return rows[0].source_document_id;
}

export async function importEfastRows(caseName: string, stored: StoredFile, rows: EfastRow[]): Promise<number> {
  const sourceDocumentId = await ensureSourceDocument(stored, 'csv');
  const existing = await db.exec<{ efast_import_id: number }>(
    'SELECT efast_import_id FROM efast_import WHERE source_document_id = ?', [sourceDocumentId],
  );
  if (existing[0]) return existing[0].efast_import_id;

  const statements: Array<{ sql: string; bind?: (string | number | null)[] }> = [
    {
      sql: `INSERT INTO pension_case(case_name) VALUES(?)
            ON CONFLICT(case_name) DO NOTHING`,
      bind: [caseName],
    },
    {
      sql: `INSERT INTO efast_import(source_document_id, row_count) VALUES(?,?)`,
      bind: [sourceDocumentId, rows.length],
    },
  ];

  for (const row of rows) {
    if (row.planName && row.planNumber && row.planYear !== null) {
      statements.push(
        {
          sql: `INSERT INTO plan(case_id, plan_name, plan_number)
                SELECT case_id, ?, ? FROM pension_case WHERE case_name = ?
                ON CONFLICT(case_id, plan_number) DO UPDATE SET
                  plan_name=excluded.plan_name, updated_at=CURRENT_TIMESTAMP`,
          bind: [row.planName, row.planNumber, caseName],
        },
        {
          sql: `INSERT INTO plan_year(plan_id, year)
                SELECT p.plan_id, ?
                FROM plan p JOIN pension_case pc ON pc.case_id=p.case_id
                WHERE pc.case_name=? AND p.plan_number=?
                ON CONFLICT(plan_id, year) DO NOTHING`,
          bind: [row.planYear, caseName, row.planNumber],
        },
        {
          sql: `INSERT INTO filing(plan_year_id, filing_date, efast_filing_id, source_url, filing_status)
                SELECT py.plan_year_id, ?, ?, ?, 'EXPECTED'
                FROM plan_year py
                JOIN plan p ON p.plan_id=py.plan_id
                JOIN pension_case pc ON pc.case_id=p.case_id
                WHERE pc.case_name=? AND p.plan_number=? AND py.year=?
                ON CONFLICT(efast_filing_id) DO UPDATE SET
                  filing_date=excluded.filing_date, source_url=excluded.source_url`,
          bind: [row.dateReceived, row.filingId, row.sourceUrl, caseName, row.planNumber, row.planYear],
        },
      );
    }

    statements.push({
      sql: `INSERT INTO efast_import_row(
              efast_import_id,row_number,plan_number,plan_name,plan_year,date_received,plan_codes,
              participants,participants_eoy,assets_boy,assets_eoy,source_url,raw_row_json,raw_record_text,matched_filing_id
            )
            SELECT ei.efast_import_id,?,?,?,?,?,?,?,?,?,?,?,?,?,
                   (SELECT filing_id FROM filing WHERE efast_filing_id=?)
            FROM efast_import ei WHERE ei.source_document_id=?`,
      bind: [
        row.rowNumber, row.planNumber, row.planName, row.planYear, row.dateReceived, row.planCodes,
        row.participants, row.participantsEoy, row.assetsBoy, row.assetsEoy, row.sourceUrl,
        JSON.stringify(row.raw), row.rawRecordText, row.filingId, sourceDocumentId,
      ],
    });
  }

  await db.transaction(statements);
  const imported = await db.exec<{ efast_import_id: number }>(
    'SELECT efast_import_id FROM efast_import WHERE source_document_id = ?', [sourceDocumentId],
  );
  if (!imported[0]) throw new Error('eFAST import transaction did not create an import row.');
  return imported[0].efast_import_id;
}

export async function listMatchableRows(): Promise<MatchableEfastRow[]> {
  const rows = await db.exec<Record<string, unknown>>(`
    SELECT er.import_row_id, er.plan_number, er.plan_name, er.plan_year, er.date_received,
           er.source_url, f.efast_filing_id, p.sponsor_ein
    FROM efast_import_row er
    LEFT JOIN filing f ON f.filing_id=er.matched_filing_id
    LEFT JOIN plan_year py ON py.plan_year_id=f.plan_year_id
    LEFT JOIN plan p ON p.plan_id=py.plan_id
    WHERE f.source_document_id IS NULL OR f.filing_id IS NULL
  `);

  return rows.map((row) => ({
    importRowId: Number(row.import_row_id),
    planNumber: row.plan_number == null ? null : String(row.plan_number),
    planName: row.plan_name == null ? null : String(row.plan_name),
    planYear: row.plan_year == null ? null : Number(row.plan_year),
    dateReceived: row.date_received == null ? null : String(row.date_received),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    efastFilingId: row.efast_filing_id == null ? null : String(row.efast_filing_id),
    sponsorEin: row.sponsor_ein == null ? null : String(row.sponsor_ein),
  }));
}

export async function savePdfImport(
  sourceDocumentId: number,
  pages: Array<{ pageNumber: number; text: string }>,
  match: { importRowId: number; score: number; status: 'AUTO_ACCEPTED' | 'AMBIGUOUS'; evidence: Record<string, unknown> } | null,
): Promise<{ filingId: number | null; matchStatus: string }> {
  const statements: Array<{ sql: string; bind?: (string | number | null)[] }> = [];

  for (const page of pages) {
    statements.push({
      sql: `INSERT OR IGNORE INTO document_chunk(source_document_id,page_number,section,text,chunk_order)
            VALUES(?,?,NULL,?,?)`,
      bind: [sourceDocumentId, page.pageNumber, page.text, page.pageNumber - 1],
    });
  }

  if (!match) {
    statements.push({
      sql: `INSERT INTO document_match(import_row_id,source_document_id,match_method,match_score,verification_status,evidence_json)
            VALUES(NULL,?,'DETERMINISTIC_METADATA',0,'UNMATCHED','{}')`,
      bind: [sourceDocumentId],
    });
    await db.transaction(statements);
    return { filingId: null, matchStatus: 'UNMATCHED' };
  }

  statements.push({
    sql: `UPDATE source_document
          SET original_source_url=COALESCE(original_source_url,(SELECT source_url FROM efast_import_row WHERE import_row_id=?))
          WHERE source_document_id=?`,
    bind: [match.importRowId, sourceDocumentId],
  });

  statements.push({
    sql: `INSERT INTO document_match(import_row_id,source_document_id,match_method,match_score,verification_status,evidence_json)
          VALUES(?,?,'DETERMINISTIC_METADATA',?,?,?)
          ON CONFLICT(import_row_id,source_document_id) DO UPDATE SET
            match_score=excluded.match_score,
            verification_status=excluded.verification_status,
            evidence_json=excluded.evidence_json`,
    bind: [match.importRowId, sourceDocumentId, match.score, match.status, JSON.stringify(match.evidence)],
  });

  if (match.status === 'AUTO_ACCEPTED') {
    statements.push({
      sql: `UPDATE filing
            SET source_document_id=?, filing_status='MATCHED'
            WHERE filing_id=(SELECT matched_filing_id FROM efast_import_row WHERE import_row_id=?)`,
      bind: [sourceDocumentId, match.importRowId],
    });
  }

  await db.transaction(statements);
  const result = await db.exec<{ filing_id: number }>(
    `SELECT f.filing_id FROM filing f
     JOIN efast_import_row er ON er.matched_filing_id=f.filing_id
     WHERE er.import_row_id=? AND f.source_document_id=?`,
    [match.importRowId, sourceDocumentId],
  );
  return { filingId: result[0]?.filing_id ?? null, matchStatus: match.status };
}

export async function saveExtractedValues(filingId: number, planYear: number, values: Extracted