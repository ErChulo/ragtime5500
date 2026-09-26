import { db } from './client';
import { classifyEfastRow } from './repository';
import { normalizePlanNumber, samePlanNumber } from '../ingest/planNumber';

export async function getEfastImportCasePlanNumber(efastImportId: number): Promise<string | null> {
  const rows = await db.exec<{ plan_number: string | null }>(`
    SELECT p.plan_number
    FROM efast_import ei
    LEFT JOIN plan p ON p.plan_id=(
      SELECT MIN(p2.plan_id) FROM plan p2 WHERE p2.case_id=ei.case_id
    )
    WHERE ei.efast_import_id=?
  `, [efastImportId]);
  return rows[0]?.plan_number ?? null;
}

export async function classifyEfastImportByPlanNumber(
  efastImportId: number,
  targetPlanNumber: string,
): Promise<{ included: number; excluded: number }> {
  const normalizedTarget = normalizePlanNumber(targetPlanNumber);
  if (!normalizedTarget) throw new Error('Choose a valid plan number.');

  const importRows = await db.exec<{
    import_row_id: number;
    plan_number: string | null;
    case_id: number | null;
  }>(`
    SELECT er.import_row_id,er.plan_number,ei.case_id
    FROM efast_import_row er
    JOIN efast_import ei ON ei.efast_import_id=er.efast_import_id
    WHERE er.efast_import_id=?
    ORDER BY er.row_number
  `, [efastImportId]);

  if (!importRows.length) throw new Error('This eFAST import has no rows.');
  const caseId = importRows[0].case_id == null ? null : Number(importRows[0].case_id);
  if (caseId === null) throw new Error('This eFAST import is not associated with a case.');

  await db.transaction([
    {
      sql: `UPDATE plan
            SET plan_number=?,updated_at=CURRENT_TIMESTAMP
            WHERE plan_id=(SELECT MIN(plan_id) FROM plan WHERE case_id=?)`,
      bind: [normalizedTarget, caseId],
    },
    {
      sql: `INSERT INTO audit_log(entity_type,entity_id,action,old_value,new_value)
            VALUES('EFAST_IMPORT',?,'SET_TARGET_PLAN_NUMBER',NULL,
                   json_object('plan_number',?))`,
      bind: [efastImportId, normalizedTarget],
    },
  ]);

  let included = 0;
  let excluded = 0;

  for (const row of importRows) {
    const include = samePlanNumber(row.plan_number, normalizedTarget);
    await classifyEfastRow(Number(row.import_row_id), include);
    if (include) included += 1;
    else excluded += 1;
  }

  return { included, excluded };
}
