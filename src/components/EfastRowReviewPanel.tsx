import { useEffect, useMemo, useRef, useState } from 'react';
import {
  classifyEfastImportByPlanNumber,
  getEfastImportCasePlanNumber,
  listEfastRowsForReview,
} from '../db/repository';
import { normalizePlanNumber } from '../ingest/planNumber';

interface Row { [key: string]: unknown }

interface PlanNumberGroup {
  key: string;
  display: string;
  count: number;
  names: string[];
}

export function EfastRowReviewPanel({
  efastImportId,
  onComplete,
}: {
  efastImportId: number;
  onComplete: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [storedPlanNumber, setStoredPlanNumber] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState<{ included: number; excluded: number } | null>(null);
  const autoApplied = useRef(false);

  const load = async () => {
    const [nextRows, planNumber] = await Promise.all([
      listEfastRowsForReview(efastImportId),
      getEfastImportCasePlanNumber(efastImportId),
    ]);
    setRows(nextRows);
    setStoredPlanNumber(planNumber);
  };

  useEffect(() => {
    void load();
  }, [efastImportId]);

  const pending = useMemo(
    () => rows.filter((row) => String(row.classification_status) === 'NEEDS_REVIEW'),
    [rows],
  );

  const groups = useMemo(() => {
    const byPlanNumber = new Map<string, PlanNumberGroup>();
    for (const row of rows) {
      const key = normalizePlanNumber(row.plan_number);
      if (!key) continue;
      const existing = byPlanNumber.get(key) ?? {
        key,
        display: String(row.plan_number).trim(),
        count: 0,
        names: [],
      };
      existing.count += 1;
      const name = row.plan_name == null ? '' : String(row.plan_name).trim();
      if (name && !existing.names.includes(name)) existing.names.push(name);
      byPlanNumber.set(key, existing);
    }
    return [...byPlanNumber.values()].sort((a, b) => Number(a.key) - Number(b.key));
  }, [rows]);

  const applyFilter = async (planNumber: string) => {
    setWorking(true);
    setStatus(`Filtering the CSV to plan number ${planNumber}…`);
    try {
      const result = await classifyEfastImportByPlanNumber(efastImportId, planNumber);
      setSummary(result);
      await load();
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    if (
      storedPlanNumber &&
      pending.length > 0 &&
      !working &&
      !autoApplied.current
    ) {
      autoApplied.current = true;
      void applyFilter(storedPlanNumber);
    }
  }, [storedPlanNumber, pending.length]);

  const included = rows.filter((row) => Number(row.included_for_matching) === 1).length;
  const excluded = rows.filter((row) => String(row.classification_status) === 'NON_TARGET').length;
  const complete = rows.length > 0 && pending.length === 0;

  if (complete) {
    return (
      <section className="panel efast-review-card">
        <p className="eyebrow">Step 3</p>
        <h2>Plan-number filter complete</h2>
        <p className="panel-description">
          Ragtime will use {summary?.included ?? included} row{(summary?.included ?? included) === 1 ? '' : 's'} for this case.
          {' '}{summary?.excluded ?? excluded} other row{(summary?.excluded ?? excluded) === 1 ? '' : 's'} remain preserved but are ignored for PDF matching.
        </p>
        <div className="panel-actions">
          <button type="button" onClick={onComplete}>Continue to local PDFs</button>
        </div>
      </section>
    );
  }

  if (storedPlanNumber && pending.length > 0) {
    return (
      <section className="panel efast-review-card">
        <p className="eyebrow">Step 3 · Filter CSV</p>
        <h2>Using plan number {normalizePlanNumber(storedPlanNumber)}</h2>
        <p className="panel-description">
          Ragtime is keeping only rows whose plan number matches this case. All other rows stay in the database as non-target source rows.
        </p>
        <p className="status" role="status">{status || 'Filtering locally…'}</p>
      </section>
    );
  }

  return (
    <section className="panel efast-review-card">
      <div className="review-progress-line">
        <div>
          <p className="eyebrow">Step 3 · Choose once</p>
          <h2>Which plan number is this case?</h2>
        </div>
      </div>

      <p className="panel-description">
        Ragtime found {groups.length} plan number{groups.length === 1 ? '' : 's'} in the CSV.
        Choose the case&apos;s plan number once. Ragtime will automatically keep every matching row and ignore the others.
      </p>

      <div className="plan-number-options">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            disabled={working}
            onClick={() => void applyFilter(group.display)}
          >
            <strong>Plan number {group.key}</strong>
            <span>{group.count} row{group.count === 1 ? '' : 's'}</span>
            {group.names[0] ? <small>{group.names[0]}</small> : null}
          </button>
        ))}
      </div>

      <p className="action-hint">
        Example: choosing plan number 2 automatically excludes plan numbers 3 and 501. No Link is opened or fetched.
      </p>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
