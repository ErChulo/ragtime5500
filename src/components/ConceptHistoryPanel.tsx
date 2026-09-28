import { useEffect, useMemo, useState } from 'react';
import { listCanonicalConcepts, queryCanonicalHistory } from '../db/repository';
import { downloadCsv } from '../utils/csvExport';
import { ProcessStatus } from './ProcessStatus';

function addYearOverYear(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const sorted = [...rows].sort((a, b) => {
    const plan = String(a.plan_name ?? '').localeCompare(String(b.plan_name ?? ''));
    if (plan) return plan;
    const subfield = String(a.subfield ?? '').localeCompare(String(b.subfield ?? ''));
    if (subfield) return subfield;
    return Number(a.plan_year ?? 0) - Number(b.plan_year ?? 0);
  });

  const prior = new Map<string, { year: number; value: number }>();
  const decorated: Array<Record<string, unknown>> = sorted.map((row): Record<string, unknown> => {
    const value = row.normalized_number == null ? null : Number(row.normalized_number);
    const year = Number(row.plan_year ?? 0);
    const key = `${String(row.plan_number ?? row.plan_name ?? '')}|${String(row.subfield ?? '')}`;
    const previous = prior.get(key);

    let delta: number | null = null;
    let deltaPct: number | null = null;
    let priorYear: number | null = null;
    if (value !== null && Number.isFinite(value) && previous) {
      delta = value - previous.value;
      deltaPct = previous.value === 0 ? null : delta / Math.abs(previous.value);
      priorYear = previous.year;
    }
    if (value !== null && Number.isFinite(value)) prior.set(key, { year, value });

    return {
      ...row,
      prior_year: priorYear,
      year_over_year_change: delta,
      year_over_year_change_pct: deltaPct,
    };
  });

  return decorated.sort((a, b) => {
    const plan = String(a.plan_name ?? '').localeCompare(String(b.plan_name ?? ''));
    if (plan) return plan;
    return Number(b.plan_year ?? 0) - Number(a.plan_year ?? 0)
      || String(a.subfield ?? '').localeCompare(String(b.subfield ?? ''));
  });
}

export function ConceptHistoryPanel() {
  const [concept, setConcept] = useState('COMMON_COLLECTIVE_TRUST_VALUE');
  const [concepts, setConcepts] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void listCanonicalConcepts().then(setConcepts).catch(() => setConcepts([]));
  }, []);

  const displayRows = useMemo(() => addYearOverYear(rows), [rows]);

  const run = async () => {
    setWorking(true);
    setStatus('');
    try {
      const result = await queryCanonicalHistory(concept);
      setRows(result);
      setStatus(result.length ? `${result.length} comparable structured value${result.length === 1 ? '' : 's'} found.` : 'No values are stored for that canonical concept.');
    } catch (error) {
      setRows([]);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cross-year semantics</p>
          <h2>Canonical concept history</h2>
          <p className="panel-description">
            Compare the stable semantic concept across plan years even when a Form 5500 layout moves the concept to another exact line. Numeric rows include a deterministic change from the prior stored year for the same plan and subfield.
          </p>
        </div>
      </div>

      <div className="search-row concept-search">
        <label>
          <span>Canonical concept</span>
          <input list="canonical-concepts" value={concept} onChange={(event) => setConcept(event.target.value)} />
          <datalist id="canonical-concepts">
            {concepts.map((item) => <option key={item} value={item} />)}
          </datalist>
        </label>
        <button type="button" disabled={!concept.trim() || working} onClick={() => void run()}>{working ? 'Comparing…' : 'Compare years'}</button>
        <button className="button-secondary" type="button" disabled={!displayRows.length || working} onClick={() => downloadCsv(displayRows, 'ragtime5500-canonical-history.csv')}>Export CSV</button>
      </div>

      <ProcessStatus
        active={working}
        label="Comparing canonical values locally"
        detail="Reading authoritative SQLite values and calculating prior-year differences."
        eta="usually under 2 seconds"
      />

      {status ? <p className="status" role="status">{status}</p> : null}
      {displayRows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Year</th><th>Form location</th><th>Subfield</th><th>Value</th><th>Δ vs prior</th><th>% vs prior</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>{displayRows.map((row) => (
              <tr key={String(row.filing_value_id)}>
                <td>{String(row.plan_name ?? '')}</td>
                <td>{String(row.plan_year ?? '')}</td>
                <td className="mono">{String(row.schedule_name ?? '')} / {String(row.part ?? '')} / {String(row.location_reference ?? '')}</td>
                <td>{String(row.subfield ?? '')}</td>
                <td className="mono">{row.normalized_number == null ? String(row.normalized_text ?? '') : Number(row.normalized_number).toLocaleString()}</td>
                <td className="mono">{row.year_over_year_change == null ? '—' : Number(row.year_over_year_change).toLocaleString()}</td>
                <td className="mono">{row.year_over_year_change_pct == null ? '—' : `${(Number(row.year_over_year_change_pct) * 100).toFixed(2)}%`}</td>
                <td><span className="data-badge">{String(row.verification_status ?? '')}</span></td>
                <td>{String(row.source_filename ?? '')} p.{String(row.source_page ?? '')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
