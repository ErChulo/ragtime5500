import { useState } from 'react';
import { queryValue } from '../db/repository';
import { downloadCsv } from '../utils/csvExport';
import { ProvenanceCard } from './ProvenanceCard';
import { ProcessStatus } from './ProcessStatus';

export function QueryPanel() {
  const [year, setYear] = useState(2024);
  const [schedule, setSchedule] = useState('H');
  const [part, setPart] = useState('I');
  const [location, setLocation] = useState('1C9');
  const [subfield, setSubfield] = useState('EOY');
  const [concept, setConcept] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const run = async () => {
    setWorking(true);
    try {
      const result = await queryValue({
        year,
        schedule: schedule.trim().toUpperCase() || undefined,
        part: part.trim().toUpperCase() || undefined,
        location: location.trim().toUpperCase() || undefined,
        subfield: subfield.trim().toUpperCase() || undefined,
        canonicalConcept: concept.trim() || undefined,
      });
      setRows(result);
      setStatus(result.length ? `${result.length} structured value${result.length === 1 ? '' : 's'} matched.` : 'No authoritative structured value matched.');
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
          <p className="eyebrow">Authoritative retrieval</p>
          <h2>Exact structured query</h2>
          <p className="panel-description">Use SQL-backed fields for exact filing facts. Canonical concepts let equivalent form locations remain comparable across years.</p>
        </div>
      </div>
      <div className="query-grid">
        <label>Plan year<input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
        <label>Schedule<input value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
        <label>Part<input value={part} onChange={(event) => setPart(event.target.value)} /></label>
        <label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional for concept search" /></label>
        <label>Subfield<input value={subfield} onChange={(event) => setSubfield(event.target.value)} /></label>
        <label>Canonical concept<input value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="Optional" /></label>
      </div>
      <div className="panel-actions">
        <button type="button" onClick={run} disabled={working}>{working ? 'Querying…' : 'Run structured query'}</button>
        <button
          className="button-secondary"
          type="button"
          disabled={!rows.length}
          onClick={() => downloadCsv(rows, `ragtime5500-query-${year}.csv`)}
        >
          Export results CSV
        </button>
        <span className="action-hint">Results include their complete source provenance.</span>
      </div>
      <ProcessStatus active={working} label="Querying SQLite" detail="Looking up the authoritative structured value and provenance." eta="usually under 1 second" />
      {status ? <p className="status" role="status">{status}</p> : null}
      <div className="cards">{rows.map((row) => <ProvenanceCard key={String(row.filing_value_id)} row={row} />)}</div>
    </section>
  );
}
