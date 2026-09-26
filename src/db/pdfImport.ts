import { db } from './client';
import type { MatchableEfastRow } from '../matching/matchPdf';
import { normalizePlanNumber, samePlanNumber } from '../ingest/planNumber';

export interface PdfImportPreflight {
  efastImportId: number;
  caseId: number;
  caseName: string;
  planNumber: string;
  expectedCount: number;
  readyCount: number;
  alreadyMatchedCount: number;
  years: number[];
  problems: string[];
}

interface ImportContext {
  case_id: number;
  case_name: string;
  plan_id: number | null;
  plan_number: string | null;
}

interface TargetRow {
  import_row_id: number;
  plan_number: string | null;
  plan_name: string | null;
  plan_year: number | null;
  date_received: string | null;
  source_url: string | null;
  efast_filing_id: string | null;
  matched_filing_id: number | null;
}

async function getImportContext(efastImportId: number): Promise<ImportContext> {
  const rows = await db.exec<ImportContext>(
    `SELECT ei.case_id,
            pc.case_name,
            p.plan_id,
            p.plan_number
       FROM efast_import ei
       JOIN pension_case pc ON pc.case_id=ei.case_id
       LEFT JOIN plan p ON p.plan_id=(
         SELECT MIN(p2.plan_id) FROM plan p2 WHERE p2.case_id=ei.case_id
       )
      WHERE ei.efast_import_id=?`,
    [efastImportId],
  );
  if (!rows[0]) throw new Error('The selected eFAST import no longer exists.');
  return rows[0];
}

async function getTargetRows(efastImportId: number): Promise<TargetRow[]> {
  return db.exec<TargetRow>(
    `SELECT import_row_id,plan_number,plan_name,plan_year,date_received,source_url,
            efast_filing_id,matched_filing_id
       FROM efast_import_row
      WHERE efast_import_id=? AND included_for_matching=1
      ORDER BY plan_year,row_number`,
    [efastImportId],
  );
}

async function repairExpectedFiling(
  context: ImportContext,
  row: TargetRow,
): Promise<void> {
  if (context.plan_id === null || row.plan_year === null) return;

  const year = Number(row.plan_year);
  const filingId = row.efast_filing_id == null ? null : String(row.efast_filing_id);
  const sourceUrl = row.source_url == null ? null : String(row.source_url);
  const filingDate = row.date_received == null ? null : String(row.date_received);

  await db.transaction([
    {
      sql: `INSERT INTO plan_year(plan_id,year)
            VALUES(?,?)
            ON CONFLICT(plan_id,year) DO NOTHING`,
      bind: [context.plan_id, year],
    },
    {
      sql: `INSERT INTO filing(plan_year_id,filing_date,efast_filing_id,source_url,filing_status)
            SELECT py.plan_year_id,?,?,?,'EXPECTED'
              FROM plan_year py
             WHERE py.plan_id=? AND py.year=?
               AND NOT EXISTS (
                 SELECT 1
                   FROM filing f
                  WHERE f.plan_year_id=py.plan_year_id
                    AND ((? IS NOT NULL AND f.efast_filing_id=?)
                         OR (? IS NULL AND f.source_url IS ?))
               )`,
      bind: [
        filingDate,
        filingId,
        sourceUrl,
        context.plan_id,
        year,
        filingId,
        filingId,
        filingId,
        sourceUrl,
      ],
    },
    {
      sql: `UPDATE efast_import_row
               SET matched_filing_id=(
                 SELECT f.filing_id
                   FROM filing f
                   JOIN plan_year py ON py.plan_year_id=f.plan_year_id
                  WHERE py.plan_id=? AND py.year=?
                    AND ((? IS NOT NULL AND f.efast_filing_id=?)
                         OR (? IS NULL AND f.source_url IS ?))
                  ORDER BY f.filing_id DESC
                  LIMIT 1
               )
             WHERE import_row_id=?`,
      bind: [
        context.plan_id,
        year,
        filingId,
        filingId,
        filingId,
        sourceUrl,
        row.import_row_id,
      ],
    },
  ]);
}

export async function preparePdfImport(efastImportId: number): Promise<PdfImportPreflight> {
  const context = await getImportContext(efastImportId);
  const problems: string[] = [];
  const normalizedPlanNumber = normalizePlanNumber(context.plan_number);

  if (context.plan_id === null) problems.push('The case has no plan record.');
  if (!normalizedPlanNumber) problems.push('The case has no plan number. Set the target plan number before importing PDFs.');

  const targetRows = await getTargetRows(efastImportId);
  if (!targetRows.length) problems.push('No eFAST rows are marked for PDF matching in this import.');

  for (const row of targetRows) {
    if (normalizedPlanNumber && !samePlanNumber(row.plan_number, normalizedPlanNumber)) {
      problems.push(`Row ${row.import_row_id} has plan number ${row.plan_number ?? 'blank'}, not target plan number ${normalizedPlanNumber}.`);
      continue;
    }
    if (row.plan_year === null || !Number.isFinite(Number(row.plan_year))) {
      problems.push(`Row ${row.import_row_id} has no usable plan year.`);
      continue;
    }
    await repairExpectedFiling(context, row);
  }

  const linked = await db.exec<{
    import_row_id: number;
    plan_year: number | null;
    matched_filing_id: number | null;
    source_document_id: number | null;
  }>(
    `SELECT er.import_row_id,er.plan_year,er.matched_filing_id,f.source_document_id
       FROM efast_import_row er
       LEFT JOIN filing f ON f.filing_id=er.matched_filing_id
      WHERE er.efast_import_id=? AND er.included_for_matching=1
      ORDER BY er.plan_year,er.row_number`,
    [efastImportId],
  );

  const missingLinks = linked.filter((row) => row.matched_filing_id === null);
  if (missingLinks.length) {
    problems.push(`${missingLinks.length} target row${missingLinks.length === 1 ? '' : 's'} could not be linked to an expected filing.`);
  }

  const years = linked
    .map((row) => row.plan_year == null ? null : Number(row.plan_year))
    .filter((year): year is number => year !== null && Number.isFinite(year));

  const alreadyMatchedCount = linked.filter((row) => row.source_document_id !== null).length;
  const readyCount = linked.filter((row) => row.matched_filing_id !== null && row.source_document_id === null).length;

  return {
    efastImportId,
    caseId: Number(context.case_id),
    caseName: String(context.case_name),
    planNumber: normalizedPlanNumber ?? '',
    expectedCount: linked.length,
    readyCount,
    alreadyMatchedCount,
    years,
    problems,
  };
}

export async function listMatchableRowsForImport(efastImportId: number): Promise<MatchableEfastRow[]> {
  const rows = await db.exec<Record<string, unknown>>(
    `SELECT er.import_row_id,er.plan_number,er.plan_name,er.plan_year,er.date_received,
            er.source_url,f.efast_filing_id,p.sponsor_ein
       FROM efast_import_row er
       JOIN efast_import ei ON ei.efast_import_id=er.efast_import_id
       LEFT JOIN filing f ON f.filing_id=er.matched_filing_id
       LEFT JOIN plan_year py ON py.plan_year_id=f.plan_year_id
       LEFT JOIN plan p ON p.plan_id=py.plan_id
      WHERE er.efast_import_id=?
        AND er.included_for_matching=1
        AND (f.source_document_id IS NULL OR f.filing_id IS NULL)
      ORDER BY er.plan_year,er.row_number`,
    [efastImportId],
  );

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

export async function saveScopedPdfImport(
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

  statements.push({
    sql: `DELETE FROM document_match
           WHERE source_document_id=?
             AND import_row_id IS NULL
             AND verification_status='UNMATCHED'`,
    bind: [sourceDocumentId],
  });

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
              SET original_source_url=COALESCE(
                original_source_url,
                (SELECT source_url FROM efast_import_row WHERE import_row_id=?)
              )
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
                SET source_document_id=?,filing_status='MATCHED'
              WHERE filing_id=(
                SELECT matched_filing_id FROM efast_import_row WHERE import_row_id=?
              )`,
      bind: [sourceDocumentId, match.importRowId],
    });
  }

  await db.transaction(statements);
  const result = await db.exec<{ filing_id: number }>(
    `SELECT f.filing_id
       FROM filing f
       JOIN efast_import_row er ON er.matched_filing_id=f.filing_id
      WHERE er.import_row_id=? AND f.source_document_id=?`,
    [match.importRowId, sourceDocumentId],
  );

  return { filingId: result[0]?.filing_id ?? null, matchStatus: match.status };
}
