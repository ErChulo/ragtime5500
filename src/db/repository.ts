import { db } from './client';
import type { EfastRow, Extracted5500Value, StructuredExtractionIssue, StructuredExtractionRule } from '../types/domain';
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
      sql: `INSERT INTO efast_import(source_document_id,row_count,case_id)
            SELECT ?,?,case_id FROM pension_case WHERE case_name=?`,
      bind: [sourceDocumentId, rows.length, caseName],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'EFAST_IMPORT',efast_import_id,'IMPORT_RAW',NULL,
                   json_object('source_document_id',source_document_id,'row_count',row_count,'review_required',1)
            FROM efast_import WHERE source_document_id=?`,
      bind: [sourceDocumentId],
    },
  ];

  for (const row of rows) {
    statements.push({
      sql: `INSERT INTO efast_import_row(
              efast_import_id,row_number,plan_number,plan_name,plan_year,date_received,plan_codes,
              participants,participants_eoy,assets_boy,assets_eoy,source_url,raw_row_json,raw_record_text,efast_filing_id,
              matched_filing_id,classification_status,classification_reason,included_for_matching,user_verified
            )
            SELECT ei.efast_import_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,
                   'NEEDS_REVIEW','Imported raw row; user classification required',0,0
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

export async function listEfastRowsForReview(efastImportId: number): Promise<Array<Record<string, unknown>>> {
  return db.exec(`
    SELECT import_row_id,row_number,plan_number,plan_name,plan_year,date_received,plan_codes,
           participants,participants_eoy,assets_boy,assets_eoy,source_url,efast_filing_id,
           classification_status,classification_reason,included_for_matching,user_verified
    FROM efast_import_row
    WHERE efast_import_id=?
    ORDER BY row_number
  `, [efastImportId]);
}

export async function classifyEfastRow(
  importRowId: number,
  include: boolean,
): Promise<void> {
  const rows = await db.exec<Record<string, unknown>>(`
    SELECT er.*, ei.case_id, pc.case_name
    FROM efast_import_row er
    JOIN efast_import ei ON ei.efast_import_id=er.efast_import_id
    LEFT JOIN pension_case pc ON pc.case_id=ei.case_id
    WHERE er.import_row_id=?
  `, [importRowId]);
  const row = rows[0];
  if (!row) throw new Error('eFAST row not found.');

  if (!include) {
    await db.transaction([
      {
        sql: `UPDATE efast_import_row
              SET classification_status='NON_TARGET',
                  classification_reason='User excluded this row from the case filing set',
                  included_for_matching=0,
                  user_verified=1,
                  matched_filing_id=NULL
              WHERE import_row_id=?`,
        bind: [importRowId],
      },
      {
        sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
              VALUES('EFAST_IMPORT_ROW',?,'CLASSIFY_NON_TARGET',NULL,
                     json_object('included_for_matching',0,'user_verified',1))`,
        bind: [importRowId],
      },
    ]);
    return;
  }

  const planYear = row.plan_year == null ? null : Number(row.plan_year);
  if (planYear === null || !Number.isFinite(planYear)) {
    throw new Error('This row has no usable plan year and cannot be included as a target filing.');
  }

  const caseId = row.case_id == null ? null : Number(row.case_id);
  if (caseId === null) throw new Error('This eFAST import is not associated with a case.');

  const planId = await ensureCasePlan(caseId);

  await db.transaction([
    {
      sql: `UPDATE plan
            SET plan_name=COALESCE(?,plan_name),
                plan_number=COALESCE(?,plan_number),
                updated_at=CURRENT_TIMESTAMP
            WHERE plan_id=?`,
      bind: [
        row.plan_name == null ? null : String(row.plan_name),
        row.plan_number == null ? null : String(row.plan_number),
        planId,
      ],
    },
    {
      sql: `INSERT INTO plan_year(plan_id,year)
            VALUES(?,?)
            ON CONFLICT(plan_id,year) DO NOTHING`,
      bind: [planId, planYear],
    },
    {
      sql: `INSERT INTO filing(plan_year_id,filing_date,efast_filing_id,source_url,filing_status)
            SELECT py.plan_year_id,?,?,?,'EXPECTED'
            FROM plan_year py
            WHERE py.plan_id=? AND py.year=?
              AND NOT EXISTS (
                SELECT 1 FROM filing f
                WHERE (? IS NOT NULL AND f.efast_filing_id=?)
                   OR (? IS NULL AND f.plan_year_id=py.plan_year_id AND f.source_url IS ?)
              )`,
      bind: [
        row.date_received == null ? null : String(row.date_received),
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.source_url == null ? null : String(row.source_url),
        planId,
        planYear,
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.source_url == null ? null : String(row.source_url),
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
                ),
                classification_status='TARGET_FORM_5500',
                classification_reason='User confirmed this row as a target Form 5500 filing',
                included_for_matching=1,
                user_verified=1
            WHERE import_row_id=?`,
      bind: [
        planId,
        planYear,
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.efast_filing_id == null ? null : String(row.efast_filing_id),
        row.source_url == null ? null : String(row.source_url),
        importRowId,
      ],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            VALUES('EFAST_IMPORT_ROW',?,'CLASSIFY_TARGET',NULL,
                   json_object('included_for_matching',1,'user_verified',1,'plan_year',?))`,
      bind: [importRowId, planYear],
    },
  ]);
}

export async function listMatchableRows(): Promise<MatchableEfastRow[]> {
  const rows = await db.exec<Record<string, unknown>>(`
    SELECT er.import_row_id, er.plan_number, er.plan_name, er.plan_year, er.date_received,
           er.source_url, f.efast_filing_id, p.sponsor_ein
    FROM efast_import_row er
    LEFT JOIN filing f ON f.filing_id=er.matched_filing_id
    LEFT JOIN plan_year py ON py.plan_year_id=f.plan_year_id
    LEFT JOIN plan p ON p.plan_id=py.plan_id
    WHERE er.included_for_matching=1
      AND (f.source_document_id IS NULL OR f.filing_id IS NULL)
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

export async function saveExtractedValues(filingId: number, planYear: number, values: Extracted5500Value[]): Promise<void> {
  const statements: Array<{ sql: string; bind?: (string | number | null)[] }> = [];
  for (const value of values) {
    statements.push({
      sql: `INSERT INTO filing_value(
              filing_id,line_definition_id,raw_value,normalized_number,extraction_method,
              extraction_confidence,verification_status,source_page,source_text
            )
            SELECT ?, ld.line_definition_id, ?, ?, ?, ?, ?, ?, ?
            FROM line_definition ld
            JOIN form_definition fd ON fd.form_definition_id=ld.form_definition_id
            WHERE fd.form_year=? AND ld.schedule_name=? AND ld.part=?
              AND ld.location_reference=? AND ld.subfield=?
            ON CONFLICT(filing_id,line_definition_id) DO UPDATE SET
              raw_value=excluded.raw_value,
              normalized_number=excluded.normalized_number,
              extraction_method=excluded.extraction_method,
              extraction_confidence=excluded.extraction_confidence,
              source_page=excluded.source_page,
              source_text=excluded.source_text,
              updated_at=CURRENT_TIMESTAMP
            WHERE filing_value.verification_status='EXTRACTED_UNVERIFIED'`,
      bind: [
        filingId, value.rawValue, value.normalizedNumber, value.extractionMethod,
        value.confidence, value.verificationStatus, value.sourcePage, value.sourceText,
        planYear, value.schedule, value.part, value.locationReference, value.subfield,
      ],
    });
  }
  if (values.length) {
    statements.push({
      sql: `UPDATE filing SET filing_status='PARSED' WHERE filing_id=? AND filing_status IN ('EXPECTED','MATCHED')`,
      bind: [filingId],
    });
  }
  await db.transaction(statements);
}

export async function verifyValue(filingValueId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING_VALUE', filing_value_id, 'VERIFY', verification_status, 'USER_VERIFIED'
            FROM filing_value WHERE filing_value_id=?`,
      bind: [filingValueId],
    },
    {
      sql: `UPDATE filing_value SET verification_status='USER_VERIFIED',updated_at=CURRENT_TIMESTAMP
            WHERE filing_value_id=?`,
      bind: [filingValueId],
    },
  ]);
}

export async function correctNumericValue(filingValueId: number, newValue: number, reason: string): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO filing_value_revision(
              filing_value_id,revision_reason,raw_value,normalized_text,normalized_number,normalized_date,
              extraction_method,extraction_confidence,verification_status,source_page,source_text
            )
            SELECT filing_value_id,?,raw_value,normalized_text,normalized_number,normalized_date,
                   extraction_method,extraction_confidence,verification_status,source_page,source_text
            FROM filing_value WHERE filing_value_id=?`,
      bind: [reason, filingValueId],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING_VALUE',filing_value_id,'CORRECT',CAST(normalized_number AS TEXT),?
            FROM filing_value WHERE filing_value_id=?`,
      bind: [String(newValue), filingValueId],
    },
    {
      sql: `UPDATE filing_value SET raw_value=?,normalized_number=?,verification_status='USER_CORRECTED',updated_at=CURRENT_TIMESTAMP
            WHERE filing_value_id=?`,
      bind: [String(newValue), newValue, filingValueId],
    },
  ]);
}

export async function listCases(): Promise<Array<Record<string, unknown>>> {
  return db.exec(`
    SELECT pc.case_id, pc.case_name, pc.notes,
           p.plan_id, p.plan_number, p.sponsor_ein, p.sponsor_name
    FROM pension_case pc
    LEFT JOIN plan p ON p.plan_id=(
      SELECT MIN(p2.plan_id) FROM plan p2 WHERE p2.case_id=pc.case_id
    )
    ORDER BY pc.case_name
  `);
}

export async function ensureCasePlan(caseId: number): Promise<number> {
  const existing = await db.exec<{ plan_id: number }>(
    'SELECT plan_id FROM plan WHERE case_id=? ORDER BY plan_id LIMIT 1',
    [caseId],
  );
  if (existing[0]) return existing[0].plan_id;

  await db.transaction([
    {
      sql: `INSERT INTO plan(case_id,plan_name)
            SELECT case_id,case_name FROM pension_case WHERE case_id=?`,
      bind: [caseId],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN',plan_id,'CREATE_INTERNAL',NULL,
                   json_object('case_id',case_id,'plan_name',plan_name,'reason','case-plan compatibility row')
            FROM plan WHERE case_id=? ORDER BY plan_id LIMIT 1`,
      bind: [caseId],
    },
  ]);

  const created = await db.exec<{ plan_id: number }>(
    'SELECT plan_id FROM plan WHERE case_id=? ORDER BY plan_id LIMIT 1',
    [caseId],
  );
  if (!created[0]) throw new Error('Unable to initialize the case storage row.');
  return created[0].plan_id;
}

export async function createCaseContext(
  caseName: string,
  planNumber: string | null = null,
  notes: string | null = null,
): Promise<void> {
  await db.transaction([
    { sql: 'INSERT INTO pension_case(case_name,notes) VALUES(?,?)', bind: [caseName, notes] },
    {
      sql: `INSERT INTO plan(case_id,plan_name,plan_number)
            SELECT case_id,case_name,? FROM pension_case WHERE case_name=?`,
      bind: [planNumber, caseName],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PENSION_CASE',case_id,'CREATE',NULL,
                   json_object('case_name',case_name,'plan_number',?,'notes',notes)
            FROM pension_case WHERE case_name=?`,
      bind: [planNumber, caseName],
    },
  ]);
}

export async function updateCaseContext(
  caseId: number,
  caseName: string,
  planNumber: string | null,
  notes: string | null,
): Promise<void> {
  const planId = await ensureCasePlan(caseId);
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PENSION_CASE',pc.case_id,'UPDATE',
                   json_object('case_name',pc.case_name,'plan_number',p.plan_number,'notes',pc.notes),
                   json_object('case_name',?,'plan_number',?,'notes',?)
            FROM pension_case pc
            LEFT JOIN plan p ON p.plan_id=?
            WHERE pc.case_id=?`,
      bind: [caseName, planNumber, notes, planId, caseId],
    },
    {
      sql: 'UPDATE pension_case SET case_name=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE case_id=?',
      bind: [caseName, notes, caseId],
    },
    {
      sql: 'UPDATE plan SET plan_name=?,plan_number=?,updated_at=CURRENT_TIMESTAMP WHERE plan_id=?',
      bind: [caseName, planNumber, planId],
    },
  ]);
}

export async function createCase(caseName: string, notes: string | null = null): Promise<void> {
  await db.transaction([
    { sql: 'INSERT INTO pension_case(case_name,notes) VALUES(?,?)', bind: [caseName, notes] },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PENSION_CASE',case_id,'CREATE',NULL,
                   json_object('case_name',case_name,'notes',notes)
            FROM pension_case WHERE case_id=last_insert_rowid()`,
    },
  ]);
}

export async function updateCase(caseId: number, caseName: string, notes: string | null): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PENSION_CASE',case_id,'UPDATE',
                   json_object('case_name',case_name,'notes',notes),
                   json_object('case_name',?,'notes',?)
            FROM pension_case WHERE case_id=?`,
      bind: [caseName, notes, caseId],
    },
    {
      sql: `UPDATE pension_case SET case_name=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE case_id=?`,
      bind: [caseName, notes, caseId],
    },
  ]);
}

export async function deleteCase(caseId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PENSION_CASE',case_id,'DELETE',
                   json_object('case_name',case_name,'notes',notes),NULL
            FROM pension_case WHERE case_id=?`,
      bind: [caseId],
    },
    { sql: 'DELETE FROM pension_case WHERE case_id=?', bind: [caseId] },
  ]);
}

export async function queryValue(filters: {
  year: number; schedule?: string; part?: string; location?: string; subfield?: string; canonicalConcept?: string;
}): Promise<Array<Record<string, unknown>>> {
  const clauses = ['plan_year=?'];
  const bind: (string | number)[] = [filters.year];
  if (filters.schedule) { clauses.push('schedule_name=?'); bind.push(filters.schedule); }
  if (filters.part) { clauses.push('part=?'); bind.push(filters.part); }
  if (filters.location) { clauses.push('location_reference=?'); bind.push(filters.location); }
  if (filters.subfield) { clauses.push('subfield=?'); bind.push(filters.subfield); }
  if (filters.canonicalConcept) { clauses.push('canonical_concept=?'); bind.push(filters.canonicalConcept); }
  return db.exec(`SELECT * FROM filing_value_provenance WHERE ${clauses.join(' AND ')} ORDER BY schedule_name,location_reference,subfield`, bind);
}

export async function getFilingContext(filingId: number): Promise<{ planYear: number; sourceDocumentId: number | null }> {
  const rows = await db.exec<{ planYear: number; sourceDocumentId: number | null }>(
    `SELECT py.year AS planYear, f.source_document_id AS sourceDocumentId
     FROM filing f JOIN plan_year py ON py.plan_year_id=f.plan_year_id WHERE f.filing_id=?`, [filingId],
  );
  if (!rows[0]) throw new Error('Filing not found.');
  return rows[0];
}

export async function listPlans(caseId: number): Promise<Array<Record<string, unknown>>> {
  return db.exec('SELECT plan_id,plan_name,plan_number,sponsor_ein,sponsor_name FROM plan WHERE case_id=? ORDER BY plan_name', [caseId]);
}

export async function createPlan(caseId: number, planName: string, planNumber: string | null): Promise<void> {
  await db.transaction([
    { sql: 'INSERT INTO plan(case_id,plan_name,plan_number) VALUES(?,?,?)', bind: [caseId, planName, planNumber] },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN',plan_id,'CREATE',NULL,
                   json_object('case_id',case_id,'plan_name',plan_name,'plan_number',plan_number)
            FROM plan WHERE plan_id=last_insert_rowid()`,
    },
  ]);
}

export async function updatePlan(planId: number, planName: string, planNumber: string | null): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN',plan_id,'UPDATE',
                   json_object('plan_name',plan_name,'plan_number',plan_number),
                   json_object('plan_name',?,'plan_number',?)
            FROM plan WHERE plan_id=?`,
      bind: [planName, planNumber, planId],
    },
    {
      sql: 'UPDATE plan SET plan_name=?,plan_number=?,updated_at=CURRENT_TIMESTAMP WHERE plan_id=?',
      bind: [planName, planNumber, planId],
    },
  ]);
}

export async function deletePlan(planId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN',plan_id,'DELETE',
                   json_object('case_id',case_id,'plan_name',plan_name,'plan_number',plan_number),NULL
            FROM plan WHERE plan_id=?`,
      bind: [planId],
    },
    { sql: 'DELETE FROM plan WHERE plan_id=?', bind: [planId] },
  ]);
}

export async function listPlanYears(planId: number): Promise<Array<Record<string, unknown>>> {
  return db.exec('SELECT plan_year_id,year,period_begin,period_end FROM plan_year WHERE plan_id=? ORDER BY year DESC', [planId]);
}

export async function createPlanYear(planId: number, year: number, periodBegin: string | null, periodEnd: string | null): Promise<void> {
  await db.transaction([
    {
      sql: 'INSERT INTO plan_year(plan_id,year,period_begin,period_end) VALUES(?,?,?,?)',
      bind: [planId, year, periodBegin, periodEnd],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN_YEAR',plan_year_id,'CREATE',NULL,
                   json_object('plan_id',plan_id,'year',year,'period_begin',period_begin,'period_end',period_end)
            FROM plan_year WHERE plan_year_id=last_insert_rowid()`,
    },
  ]);
}

export async function updatePlanYear(planYearId: number, year: number, periodBegin: string | null, periodEnd: string | null): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN_YEAR',plan_year_id,'UPDATE',
                   json_object('year',year,'period_begin',period_begin,'period_end',period_end),
                   json_object('year',?,'period_begin',?,'period_end',?)
            FROM plan_year WHERE plan_year_id=?`,
      bind: [year, periodBegin, periodEnd, planYearId],
    },
    {
      sql: 'UPDATE plan_year SET year=?,period_begin=?,period_end=?,updated_at=CURRENT_TIMESTAMP WHERE plan_year_id=?',
      bind: [year, periodBegin, periodEnd, planYearId],
    },
  ]);
}

export async function deletePlanYear(planYearId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'PLAN_YEAR',plan_year_id,'DELETE',
                   json_object('plan_id',plan_id,'year',year,'period_begin',period_begin,'period_end',period_end),NULL
            FROM plan_year WHERE plan_year_id=?`,
      bind: [planYearId],
    },
    { sql: 'DELETE FROM plan_year WHERE plan_year_id=?', bind: [planYearId] },
  ]);
}

export async function listFilings(planYearId: number): Promise<Array<Record<string, unknown>>> {
  return db.exec(`SELECT filing_id,filing_type,filing_date,efast_filing_id,source_url,amended_flag,filing_status
                  FROM filing WHERE plan_year_id=? ORDER BY filing_date DESC, filing_id DESC`, [planYearId]);
}

export async function createFiling(planYearId: number, filingType: string, filingDate: string | null): Promise<void> {
  await db.transaction([
    {
      sql: 'INSERT INTO filing(plan_year_id,filing_type,filing_date) VALUES(?,?,?)',
      bind: [planYearId, filingType, filingDate],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING',filing_id,'CREATE',NULL,
                   json_object('plan_year_id',plan_year_id,'filing_type',filing_type,'filing_date',filing_date)
            FROM filing WHERE filing_id=last_insert_rowid()`,
    },
  ]);
}

export async function updateFiling(filingId: number, filingType: string, filingDate: string | null): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING',filing_id,'UPDATE',
                   json_object('filing_type',filing_type,'filing_date',filing_date),
                   json_object('filing_type',?,'filing_date',?)
            FROM filing WHERE filing_id=?`,
      bind: [filingType, filingDate, filingId],
    },
    {
      sql: 'UPDATE filing SET filing_type=?,filing_date=? WHERE filing_id=?',
      bind: [filingType, filingDate, filingId],
    },
  ]);
}

export async function deleteFiling(filingId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING',filing_id,'DELETE',
                   json_object('plan_year_id',plan_year_id,'filing_type',filing_type,'filing_date',filing_date,
                               'efast_filing_id',efast_filing_id,'filing_status',filing_status),NULL
            FROM filing WHERE filing_id=?`,
      bind: [filingId],
    },
    { sql: 'DELETE FROM filing WHERE filing_id=?', bind: [filingId] },
  ]);
}

export async function listDocumentMatches(): Promise<Array<Record<string, unknown>>> {
  return db.exec(`
    SELECT dm.document_match_id, dm.import_row_id, dm.source_document_id,
           dm.verification_status, dm.match_score, dm.evidence_json,
           sd.filename, sd.sha256, sd.storage_key,
           er.plan_year, er.plan_number, er.plan_name, er.source_url
    FROM document_match dm
    JOIN source_document sd ON sd.source_document_id=dm.source_document_id
    LEFT JOIN efast_import_row er ON er.import_row_id=dm.import_row_id
    ORDER BY dm.document_match_id DESC
  `);
}

export async function listExtractionReview(): Promise<Array<Record<string, unknown>>> {
  return db.exec(`
    SELECT * FROM filing_value_provenance
    ORDER BY CASE verification_status WHEN 'EXTRACTED_UNVERIFIED' THEN 0 ELSE 1 END,
             plan_year DESC, schedule_name, location_reference, subfield
  `);
}

export async function deleteFilingValue(filingValueId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'FILING_VALUE',filing_value_id,'DELETE',
                   json_object('raw_value',raw_value,'normalized_number',normalized_number,'status',verification_status),
                   NULL
            FROM filing_value WHERE filing_value_id=?`,
      bind: [filingValueId],
    },
    { sql: 'DELETE FROM filing_value WHERE filing_value_id=?', bind: [filingValueId] },
  ]);
}


export interface AcceptedDocumentMatch {
  filingId: number;
  planYear: number;
  storageKey: string;
}

export async function acceptDocumentMatch(documentMatchId: number, importRowId: number): Promise<AcceptedDocumentMatch> {
  const matches = await db.exec<{
    source_document_id: number;
    storage_key: string;
    verification_status: string;
    import_row_id: number | null;
  }>(
    `SELECT dm.source_document_id, sd.storage_key, dm.verification_status, dm.import_row_id
     FROM document_match dm
     JOIN source_document sd ON sd.source_document_id=dm.source_document_id
     WHERE dm.document_match_id=?`,
    [documentMatchId],
  );
  const match = matches[0];
  if (!match) throw new Error('Document match not found.');
  if (!['AMBIGUOUS', 'UNMATCHED', 'USER_REJECTED'].includes(match.verification_status)) {
    throw new Error('Only unresolved document matches can be manually assigned.');
  }

  const targets = await db.exec<{
    filing_id: number;
    plan_year: number;
    current_source_document_id: number | null;
  }>(
    `SELECT f.filing_id, py.year AS plan_year, f.source_document_id AS current_source_document_id
     FROM efast_import_row er
     JOIN filing f ON f.filing_id=er.matched_filing_id
     JOIN plan_year py ON py.plan_year_id=f.plan_year_id
     WHERE er.import_row_id=?`,
    [importRowId],
  );
  const target = targets[0];
  if (!target) throw new Error('Expected eFAST filing row not found.');
  if (target.current_source_document_id !== null && target.current_source_document_id !== match.source_document_id) {
    throw new Error('That expected filing already has a different local PDF.');
  }

  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'DOCUMENT_MATCH',document_match_id,'USER_ACCEPT',
                   json_object('import_row_id',import_row_id,'status',verification_status,'score',match_score),
                   json_object('import_row_id',?,'status','USER_ACCEPTED','score',1.0)
            FROM document_match WHERE document_match_id=?`,
      bind: [importRowId, documentMatchId],
    },
    {
      sql: `UPDATE document_match
            SET import_row_id=?, match_method='USER_REVIEW', match_score=1.0,
                verification_status='USER_ACCEPTED',
                evidence_json=json_set(CASE WHEN json_valid(evidence_json) THEN evidence_json ELSE '{}' END,
                                       '$.userDecision','accepted')
            WHERE document_match_id=?`,
      bind: [importRowId, documentMatchId],
    },
    {
      sql: `UPDATE filing
            SET source_document_id=?, filing_status='MATCHED'
            WHERE filing_id=(SELECT matched_filing_id FROM efast_import_row WHERE import_row_id=?)`,
      bind: [match.source_document_id, importRowId],
    },
    {
      sql: `UPDATE source_document
            SET original_source_url=COALESCE(
              original_source_url,
              (SELECT source_url FROM efast_import_row WHERE import_row_id=?)
            )
            WHERE source_document_id=?`,
      bind: [importRowId, match.source_document_id],
    },
  ]);

  return {
    filingId: target.filing_id,
    planYear: target.plan_year,
    storageKey: match.storage_key,
  };
}


export async function listAuditLog(limit = 200): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  return db.exec(
    `SELECT audit_id,entity_type,entity_id,action,old_value,new_value,timestamp
     FROM audit_log ORDER BY audit_id DESC LIMIT ?`,
    [safeLimit],
  );
}

export async function listSourceDocuments(): Promise<Array<Record<string, unknown>>> {
  return db.exec(
    `SELECT source_document_id,filename,storage_key,mime_type,sha256,file_size,source_type,imported_at
     FROM source_document ORDER BY source_document_id`,
  );
}

export async function searchDocumentText(
  query: string,
  year?: number,
): Promise<Array<Record<string, unknown>>> {
  const text = query.trim();
  if (!text) return [];
  const bind: (string | number)[] = [text];
  const yearClause = year === undefined ? '' : 'AND py.year=?';
  if (year !== undefined) bind.push(year);

  return db.exec(
    `SELECT dc.chunk_id, dc.page_number, dc.section,
            snippet(document_chunk_fts,0,'[',']',' … ',18) AS snippet,
            sd.filename AS source_filename, sd.storage_key, sd.sha256 AS source_sha256,
            pc.case_name, p.plan_name, p.plan_number, py.year AS plan_year,
            bm25(document_chunk_fts) AS rank
     FROM document_chunk_fts
     JOIN document_chunk dc ON dc.chunk_id=document_chunk_fts.chunk_id
     JOIN source_document sd ON sd.source_document_id=dc.source_document_id
     LEFT JOIN filing f ON f.source_document_id=sd.source_document_id
     LEFT JOIN plan_year py ON py.plan_year_id=f.plan_year_id
     LEFT JOIN plan p ON p.plan_id=py.plan_id
     LEFT JOIN pension_case pc ON pc.case_id=p.case_id
     WHERE document_chunk_fts MATCH ? ${yearClause}
     ORDER BY rank, py.year DESC, dc.page_number
     LIMIT 100`,
    bind,
  );
}

export async function queryCanonicalHistory(
  canonicalConcept: string,
): Promise<Array<Record<string, unknown>>> {
  const concept = canonicalConcept.trim();
  if (!concept) return [];
  return db.exec(
    `SELECT case_name,plan_name,plan_number,plan_year,schedule_name,part,location_reference,
            subfield,canonical_concept,normalized_number,normalized_text,verification_status,
            source_filename,source_page,filing_value_id
     FROM filing_value_provenance
     WHERE canonical_concept=?
     ORDER BY plan_name,plan_year,subfield`,
    [concept],
  );
}


export async function getDatabaseHealth(): Promise<{
  quickCheck: string;
  foreignKeyViolations: number;
  migrationVersion: number;
  caseCount: number;
  planCount: number;
  filingCount: number;
  sourceDocumentCount: number;
  filingValueCount: number;
}> {
  const [
    quickRows,
    fkRows,
    migrationRows,
    countRows,
  ] = await Promise.all([
    db.exec<{ quick_check: string }>('PRAGMA quick_check'),
    db.exec<Record<string, unknown>>('PRAGMA foreign_key_check'),
    db.exec<{ version: number }>('SELECT COALESCE(MAX(version),0) AS version FROM schema_migration'),
    db.exec<{
      case_count: number;
      plan_count: number;
      filing_count: number;
      source_document_count: number;
      filing_value_count: number;
    }>(`SELECT
          (SELECT COUNT(*) FROM pension_case) AS case_count,
          (SELECT COUNT(*) FROM plan) AS plan_count,
          (SELECT COUNT(*) FROM filing) AS filing_count,
          (SELECT COUNT(*) FROM source_document) AS source_document_count,
          (SELECT COUNT(*) FROM filing_value) AS filing_value_count`),
  ]);

  const counts = countRows[0];
  return {
    quickCheck: quickRows[0]?.quick_check ?? 'unknown',
    foreignKeyViolations: fkRows.length,
    migrationVersion: migrationRows[0]?.version ?? 0,
    caseCount: counts?.case_count ?? 0,
    planCount: counts?.plan_count ?? 0,
    filingCount: counts?.filing_count ?? 0,
    sourceDocumentCount: counts?.source_document_count ?? 0,
    filingValueCount: counts?.filing_value_count ?? 0,
  };
}

export async function listSourceDocumentsForIntegrity(): Promise<Array<{
  sourceDocumentId: number;
  filename: string;
  storageKey: string;
  sha256: string;
  fileSize: number;
  sourceType: string;
}>> {
  const rows = await db.exec<Record<string, unknown>>(`
    SELECT source_document_id, filename, storage_key, sha256, file_size, source_type
    FROM source_document
    ORDER BY source_document_id
  `);
  return rows.map((row) => ({
    sourceDocumentId: Number(row.source_document_id),
    filename: String(row.filename),
    storageKey: String(row.storage_key),
    sha256: String(row.sha256),
    fileSize: Number(row.file_size),
    sourceType: String(row.source_type),
  }));
}


export async function listStructuredExtractionRules(
  formYear: number,
  schedule = 'H',
): Promise<StructuredExtractionRule[]> {
  const rows = await db.exec<Record<string, unknown>>(
    `SELECT r.extraction_rule_id,fd.form_year,r.schedule_name,r.part,r.location_reference,
            MIN(ld.canonical_concept) AS canonical_concept,
            MIN(ld.label) AS label,
            r.label_pattern,r.strategy,r.min_value_x_ratio,
            r.source_authority,r.source_reference,r.source_url
       FROM line_extraction_rule r
       JOIN form_definition fd ON fd.form_definition_id=r.form_definition_id
       JOIN line_definition ld
         ON ld.form_definition_id=r.form_definition_id
        AND ld.schedule_name=r.schedule_name
        AND ld.part=r.part
        AND ld.location_reference=r.location_reference
      WHERE fd.form_year=? AND r.schedule_name=? AND r.active=1
      GROUP BY r.extraction_rule_id,fd.form_year,r.schedule_name,r.part,r.location_reference,
               r.label_pattern,r.strategy,r.min_value_x_ratio,
               r.source_authority,r.source_reference,r.source_url
      ORDER BY r.part,r.location_reference`,
    [formYear, schedule],
  );

  return rows.map((row) => ({
    extractionRuleId: Number(row.extraction_rule_id),
    formYear: Number(row.form_year),
    schedule: String(row.schedule_name),
    part: String(row.part),
    locationReference: String(row.location_reference),
    canonicalConcept: String(row.canonical_concept),
    label: String(row.label),
    labelPattern: String(row.label_pattern),
    strategy: String(row.strategy) as StructuredExtractionRule['strategy'],
    minValueXRatio: Number(row.min_value_x_ratio),
    sourceAuthority: String(row.source_authority),
    sourceReference: String(row.source_reference),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
  }));
}

export async function listExtractionCoverage(
  formYear?: number,
): Promise<Array<Record<string, unknown>>> {
  const clauses = ['r.active=1'];
  const bind: number[] = [];
  if (formYear != null) {
    clauses.push('fd.form_year=?');
    bind.push(formYear);
  }
  return db.exec(
    `SELECT fd.form_year,r.schedule_name,r.part,r.location_reference,
            MIN(ld.label) AS label,MIN(ld.canonical_concept) AS canonical_concept,
            r.strategy,r.source_authority,r.source_reference,
            COUNT(ld.line_definition_id) AS output_field_count
       FROM line_extraction_rule r
       JOIN form_definition fd ON fd.form_definition_id=r.form_definition_id
       JOIN line_definition ld
         ON ld.form_definition_id=r.form_definition_id
        AND ld.schedule_name=r.schedule_name
        AND ld.part=r.part
        AND ld.location_reference=r.location_reference
      WHERE ${clauses.join(' AND ')}
      GROUP BY fd.form_year,r.schedule_name,r.part,r.location_reference,
               r.strategy,r.source_authority,r.source_reference
      ORDER BY fd.form_year DESC,r.schedule_name,r.part,r.location_reference`,
    bind,
  );
}

export async function listMatchedFilingsForExtraction(): Promise<Array<Record<string, unknown>>> {
  return db.exec(
    `SELECT f.filing_id,py.year AS plan_year,sd.filename AS source_filename,
            sd.storage_key,p.plan_name,p.plan_number,
            COUNT(DISTINCT r.extraction_rule_id) AS rule_count
       FROM filing f
       JOIN plan_year py ON py.plan_year_id=f.plan_year_id
       JOIN plan p ON p.plan_id=py.plan_id
       JOIN source_document sd ON sd.source_document_id=f.source_document_id
       JOIN form_definition fd ON fd.form_year=py.year
       JOIN line_extraction_rule r ON r.form_definition_id=fd.form_definition_id AND r.active=1
      WHERE f.source_document_id IS NOT NULL
      GROUP BY f.filing_id,py.year,sd.filename,sd.storage_key,p.plan_name,p.plan_number
      ORDER BY py.year DESC,f.filing_id DESC`,
  );
}

export async function recordStructuredExtraction(
  filingId: number,
  ruleCount: number,
  values: Extracted5500Value[],
  issues: StructuredExtractionIssue[],
): Promise<void> {
  const statements: Array<{ sql: string; bind?: (string | number | null)[] }> = [
    {
      sql: `UPDATE extraction_issue
               SET status='RESOLVED_BY_REEXTRACTION',updated_at=CURRENT_TIMESTAMP
             WHERE filing_id=? AND status='OPEN'`,
      bind: [filingId],
    },
  ];

  for (const issue of issues) {
    statements.push({
      sql: `INSERT INTO extraction_issue(
              filing_id,schedule_name,part,location_reference,issue_code,source_page,source_text,status
            ) VALUES(?,?,?,?,?,?,?,'OPEN')
            ON CONFLICT(filing_id,schedule_name,part,location_reference,issue_code) DO UPDATE SET
              source_page=excluded.source_page,
              source_text=excluded.source_text,
              status='OPEN',
              updated_at=CURRENT_TIMESTAMP`,
      bind: [
        filingId,
        issue.schedule,
        issue.part,
        issue.locationReference,
        issue.reason,
        issue.sourcePage,
        issue.sourceText,
      ],
    });
  }

  statements.push({
    sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
          VALUES('FILING',?,'STRUCTURED_EXTRACTION_RUN',NULL,
                 json_object(
                   'engine','METADATA_POSITIONAL_BOY_EOY_V1',
                   'rule_count',?,
                   'value_count',?,
                   'issue_count',?,
                   'issues_json',?
                 ))`,
    bind: [filingId, ruleCount, values.length, issues.length, JSON.stringify(issues)],
  });

  await db.transaction(statements);
}

export async function listExtractionIssues(
  includeReviewed = false,
): Promise<Array<Record<string, unknown>>> {
  return db.exec(
    `SELECT ei.extraction_issue_id,ei.schedule_name,ei.part,ei.location_reference,
            ei.issue_code,ei.source_page,ei.source_text,ei.status,ei.updated_at,
            f.filing_id,py.year AS plan_year,p.plan_name,p.plan_number,
            sd.filename AS source_filename,sd.storage_key
       FROM extraction_issue ei
       JOIN filing f ON f.filing_id=ei.filing_id
       JOIN plan_year py ON py.plan_year_id=f.plan_year_id
       JOIN plan p ON p.plan_id=py.plan_id
       LEFT JOIN source_document sd ON sd.source_document_id=f.source_document_id
      WHERE ${includeReviewed ? "ei.status IN ('OPEN','USER_REVIEWED')" : "ei.status='OPEN'"}
      ORDER BY py.year DESC,ei.schedule_name,ei.part,ei.location_reference`,
  );
}

export async function markExtractionIssueReviewed(extractionIssueId: number): Promise<void> {
  await db.transaction([
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            SELECT 'EXTRACTION_ISSUE',extraction_issue_id,'USER_REVIEW',
                   status,'USER_REVIEWED'
              FROM extraction_issue
             WHERE extraction_issue_id=?`,
      bind: [extractionIssueId],
    },
    {
      sql: `UPDATE extraction_issue
               SET status='USER_REVIEWED',updated_at=CURRENT_TIMESTAMP
             WHERE extraction_issue_id=?`,
      bind: [extractionIssueId],
    },
  ]);
}

export async function validateScheduleHPartI(
  filingId: number,
): Promise<void> {
  const rows = await db.exec<{
    location_reference: string;
    subfield: string;
    normalized_number: number | null;
  }>(
    `SELECT ld.location_reference,ld.subfield,fv.normalized_number
       FROM filing_value fv
       JOIN line_definition ld ON ld.line_definition_id=fv.line_definition_id
      WHERE fv.filing_id=?
        AND ld.schedule_name='H'
        AND ld.part='I'
        AND ld.location_reference IN ('1F','1K','1L')`,
    [filingId],
  );

  const byKey = new Map<string, number>();
  for (const row of rows) {
    if (row.normalized_number == null) continue;
    byKey.set(`${row.location_reference}:${row.subfield}`, Number(row.normalized_number));
  }

  const statements: Array<{ sql: string; bind?: (string | number | null)[] }> = [];
  for (const subfield of ['BOY', 'EOY']) {
    const assets = byKey.get(`1F:${subfield}`);
    const liabilities = byKey.get(`1K:${subfield}`);
    const netAssets = byKey.get(`1L:${subfield}`);

    let status: 'PASS' | 'FAIL' | 'NOT_EVALUATED' = 'NOT_EVALUATED';
    let severity: 'INFO' | 'WARNING' | 'ERROR' = 'INFO';
    let observed: number | null = netAssets ?? null;
    let expected: number | null = null;
    let message = `${subfield}: net-assets identity not evaluated because 1F, 1K, or 1L is missing.`;

    if (assets != null && liabilities != null && netAssets != null) {
      expected = assets - liabilities;
      const difference = netAssets - expected;
      status = Math.abs(difference) <= 1 ? 'PASS' : 'FAIL';
      severity = status === 'PASS' ? 'INFO' : 'ERROR';
      message = status === 'PASS'
        ? `${subfield}: Schedule H Part I balances: 1L = 1F - 1K.`
        : `${subfield}: Schedule H Part I does not balance; 1L differs from 1F - 1K by ${difference.toLocaleString()}.`;
    }

    statements.push({
      sql: `INSERT INTO filing_validation_result(
              filing_id,rule_code,subfield,status,severity,observed_number,expected_number,message,details_json,checked_at
            ) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(filing_id,rule_code,subfield) DO UPDATE SET
              status=excluded.status,
              severity=excluded.severity,
              observed_number=excluded.observed_number,
              expected_number=excluded.expected_number,
              message=excluded.message,
              details_json=excluded.details_json,
              checked_at=CURRENT_TIMESTAMP`,
      bind: [
        filingId,
        'H_PART_I_NET_ASSETS_IDENTITY',
        subfield,
        status,
        severity,
        observed,
        expected,
        message,
        JSON.stringify({ assets, liabilities, netAssets }),
      ],
    });
  }

  await db.transaction(statements);
}

export async function listValidationResults(): Promise<Array<Record<string, unknown>>> {
  return db.exec(
    `SELECT vr.validation_result_id,vr.rule_code,vr.subfield,vr.status,vr.severity,
            vr.observed_number,vr.expected_number,vr.message,vr.checked_at,
            py.year AS plan_year,p.plan_name,p.plan_number,sd.filename AS source_filename
       FROM filing_validation_result vr
       JOIN filing f ON f.filing_id=vr.filing_id
       JOIN plan_year py ON py.plan_year_id=f.plan_year_id
       JOIN plan p ON p.plan_id=py.plan_id
       LEFT JOIN source_document sd ON sd.source_document_id=f.source_document_id
      ORDER BY CASE vr.status WHEN 'FAIL' THEN 0 WHEN 'NOT_EVALUATED' THEN 1 ELSE 2 END,
               py.year DESC,vr.rule_code,vr.subfield`,
  );
}

export async function listCanonicalConcepts(): Promise<string[]> {
  const rows = await db.exec<{ canonical_concept: string }>(
    `SELECT DISTINCT canonical_concept
       FROM line_definition
      ORDER BY canonical_concept`,
  );
  return rows.map((row) => row.canonical_concept);
}
