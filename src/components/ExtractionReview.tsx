import { useEffect, useState } from 'react';
import { correctNumericValue, deleteFilingValue, listExtractionReview, verifyValue } from '../db/repository';
import { ProvenanceCard } from './ProvenanceCard';
import { ProcessStatus } from './ProcessStatus';

export function ExtractionReview({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [correction, setCorrection] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const load = async () => {
    const next = await listExtractionReview();
    setRows(next);
    if (selectedId === null && next[0]) setSelectedId(Number(next[0].filing_value_id));
    if (selectedId !== null && !next.some((row) => Number(row.filing_value_id) === selectedId)) {
      setSelectedId(next[0] ? Number(next[0].filing_value_id) : null);
    }
  };

  useEffect(() => { void load(); }, [refreshToken]);
  const selected = rows.find((row) => Number(row.filing_value_id) === selectedId) ?? null;

  const run = async (action: () => Promise<void>, message: string) => {
    setWorking(true);
    try {
      await action();
      setStatus(message);
      await load();
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Value verification</p>
          <h2>Extraction review</h2>
          <p className="panel-description">Review extracted values against the source page. Corrections preserve the original extraction in immutable revision history.</p>
        </div>
      </div>
      {!rows.length ? <div className="empty-state">No extracted values yet. Parsed values that require review will appear here.</div> : <>
        <label>Value to review
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {rows.map((row) => <option key={String(row.filing_value_id)} value={Number(row.filing_value_id)}>
              {String(row.plan_year)} · H/{String(row.part)}/{String(row.location_reference)} {String(row.subfield)} · {String(row.normalized_number ?? row.normalized_text ?? '')} · {String(row.verification_status)}
            </option>)}
          </select>
        </label>
        {selected ? <ProvenanceCard row={selected} /> : null}
        {selectedId !== null ? <div className="review-actions">
          <button type="button" disabled={working} onClick={() => run(() => verifyValue(selectedId), 'Value marked USER_VERIFIED.')}>{working ? 'Saving…' : 'Verify source value'}</button>
          <label>Correct numeric value<input inputMode="decimal" value={correction} onChange={(e) => setCorrection(e.target.value)} /></label>
          <label>Correction reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" disabled={working || !correction.trim() || !reason.trim() || !Number.isFinite(Number(correction))}
            onClick={() => run(() => correctNumericValue(selectedId, Number(correction), reason.trim()), 'Correction saved; original revision preserved.')}>Save correction</button>
          <button className="danger" type="button" disabled={working} onClick={() => {
            if (confirm('Delete this current filing value? The deletion is recorded in the audit log.')) {
              void run(() => deleteFilingValue(selectedId), 'Value deleted; audit entry retained.');
            }
          }}>Delete value</button>
        </div> : null}
      </>}
      <ProcessStatus active={working} label="Saving extraction review" detail="Writing the verification or correction and audit history to SQLite." eta="usually under 2 seconds" />
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
