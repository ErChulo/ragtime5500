import { useState } from 'react';
import { queryCanonicalHistory } from '../db/repository';
import { downloadCsv } from '../utils/csvExport';

export function ConceptHistoryPanel() {
  const [concept, setConcept] = useState('COMMON_COLLECTIVE_TRUST_VALUE');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');

  const run = async () => {
    try {
      const result = await queryCanonicalHistory(concept);
      setRows(result);
      setStatus(result.length ? `${result.length} comparable structured value${result.length === 1 ? '' : 's'} found.` : 'No values are stored for that canonical concept.');
    } catch (error) {
      setRows([]);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Cross-year semantics</p>
          <h2>Canonical concept history</h2>
          <p className="panel-description">
            Compare the stable semantic concept across plan years even when future Form 5500 layouts move the concept to another exact line.
          </p>
        </div>
      </div>

      <div className="search-row concept-search">
        <label>
          <span>Canonical concept</span>
          <input value={concept} onChange={(event) => setConcept(event.target.value)} />
        </label>
        <button type="button" disabled={!concept.trim()} onClick={run}>Compare years</button>
        <button className="button-secondary" type="button" disabled={!rows.length} onClick={() => downloadCsv(rows, 'ragtime5500-canonical-history.csv')}>Export CSV</button>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Plan</th><th>Year</th><th>Form location</th><th>Subfield</th><th>Value</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={String(row.filing_value_id)}>
                <td>{String(row.plan_name ?? '')}</td>
                <td>{String(row.plan_year ?? '')}</td>
                <td className="mono">{String(row.schedule_name ?? '')} / {String(row.part ?? '')} / {String(row.location_reference ?? '')}</td>
                <td>{String(row.subfield ?? '')}</td>
                <td className="mono">{row.normalized_number == null ? String(row.normalized_text ?? '') : Number(row.normalized_number).toLocaleString()}</td>
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
