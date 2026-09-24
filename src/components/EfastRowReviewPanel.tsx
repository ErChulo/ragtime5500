import { useEffect, useMemo, useState } from 'react';
import { classifyEfastRow, listEfastRowsForReview } from '../db/repository';

interface Row { [key: string]: unknown }

export function EfastRowReviewPanel({
  efastImportId,
  onComplete,
}: {
  efastImportId: number;
  onComplete: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const load = async () => {
    const next = await listEfastRowsForReview(efastImportId);
    setRows(next);
  };

  useEffect(() => {
    void load();
  }, [efastImportId]);

  const pending = useMemo(
    () => rows.filter((row) => String(row.classification_status) === 'NEEDS_REVIEW'),
    [rows],
  );
  const current = pending[0] ?? null;
  const included = rows.filter((row) => Number(row.included_for_matching) === 1).length;
  const excluded = rows.filter((row) => String(row.classification_status) === 'NON_TARGET').length;
  const reviewed = rows.length - pending.length;

  const classify = async (include: boolean) => {
    if (!current) return;
    setWorking(true);
    setStatus('');
    try {
      await classifyEfastRow(Number(current.import_row_id), include);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  if (!current) {
    return (
      <section className="panel efast-review-card">
        <p className="eyebrow">Step 3</p>
        <h2>CSV review complete</h2>
        <p className="panel-description">
          {included} row{included === 1 ? '' : 's'} will be used as this case&apos;s Form 5500 filings.
          {excluded ? ` ${excluded} row${excluded === 1 ? '' : 's'} were kept but excluded.` : ''}
        </p>
        <div className="panel-actions">
          <button type="button" onClick={onComplete}>Continue to local PDFs</button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel efast-review-card">
      <div className="review-progress-line">
        <div>
          <p className="eyebrow">Step 3 · Review CSV rows</p>
          <h2>Does this row belong to this pension case?</h2>
        </div>
        <strong>{reviewed + 1} of {rows.length}</strong>
      </div>

      <div className="efast-row-summary">
        <dl>
          <div><dt>Plan year</dt><dd>{current.plan_year == null ? 'Not reported' : String(current.plan_year)}</dd></div>
          <div><dt>Plan name</dt><dd>{current.plan_name == null ? 'Not reported' : String(current.plan_name)}</dd></div>
          <div><dt>Plan number</dt><dd>{current.plan_number == null ? 'Not reported' : String(current.plan_number)}</dd></div>
          <div><dt>Date received</dt><dd>{current.date_received == null ? 'Not reported' : String(current.date_received)}</dd></div>
          <div><dt>Plan codes</dt><dd>{current.plan_codes == null ? 'Not reported' : String(current.plan_codes)}</dd></div>
        </dl>
      </div>

      <p className="review-question">
        Choose <strong>Use as Form 5500</strong> only if this row is the pension plan filing you want Ragtime to match to a local PDF.
        Other arrangements remain preserved in the database but are excluded from matching.
      </p>

      <div className="decision-actions">
        <button type="button" disabled={working} onClick={() => void classify(true)}>
          {working ? 'Saving…' : 'Use as Form 5500'}
        </button>
        <button className="button-secondary" type="button" disabled={working} onClick={() => void classify(false)}>
          Not this case filing
        </button>
      </div>

      <p className="action-hint">Nothing is fetched from the Link column. This review is entirely local.</p>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
