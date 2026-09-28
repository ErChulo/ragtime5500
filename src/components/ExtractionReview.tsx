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
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await listExtractionReview();
      setRows(next);
      setSelectedId((current) => {
        if (current !== null && next.some((row) => Number(row.filing_value_id) === current)) return current;
        return next[0] ? Number(next[0].filing_value_id) : null;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [refreshToken]);
  const selected = rows.find((row) => Number(row.filing_value_id) === selectedId) ?? null;

  const run = async (action: () => Promise<void>, message: string) => {
    setWorking(true);
    setStatus('');
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

      <ProcessStatus
        active={loading}
        label="Loading extracted values"
        detail="Reading structured values and provenance from the local SQLite workspace."
        eta="usually under 2 seconds"
      />

      {!loading && !rows.length ? <div className="empty-state">No extracted values yet. Parsed values that require review will appear here.</div> : null}
      {rows.length ? <>
        <label>Value to review
          <select value={selectedId ?? ''} disabled={working} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {rows.map((row) => <option key={String(row.filing_value_id)} value={Number(row.filing_value_id)}>
              {String(row.plan_year)} · {String(row.schedule_name)}/{String(row.part)}/{String(row.location_reference)} {String(row.subfield)} · {String(row.normalized_number ?? row.normalized_text ?? '')} · {String(row.verification_status)}
            </option>)}
          </select>
        </label>
        {selected ? <ProvenanceCard row={selected} /> : null}
        {selectedId !== null ? <div className="review-actions">
          <button type="button" disabled={working} onClick={() => void run(() => verifyValue(selectedId), 'Value marked USER_VERIFIED.')}>Verify source value</button>
          <label>Correct numeric value<input inputMode="decimal" disabled={working} value={correction} onChange={(e) => setCorrection(e.target.value)} /></label>
          <label>Correction reason<input disabled={working} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" disabled={working || !correction.trim() || !reason.trim() || !Number.isFinite(Number(correction))}
            onClick={() => void run(() => correctNumericValue(selectedId, Number(correction), reason.trim()), 'Correction saved; original revision preserved.')}>Save correction</button>
          <button className="danger" type="button" disabled={working} onClick={() => {
            if (confirm('Delete this current filing value? The deletion is recorded in the audit log.')) {
              void run(() => deleteFilingValue(selectedId), 'Value deleted; audit entry retained.');
            }
          }}>Delete value</button>
        </div> : null}
      </> : null}

      <ProcessStatus
        active={working}
        label="Saving extraction review"
        detail="Updating the local SQLite workspace and preserving audit/revision history."
        eta="usually under 2 seconds"
      />
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
