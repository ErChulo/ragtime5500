import { useEffect, useState } from 'react';
import { listValidationResults } from '../db/repository';
import { ProcessStatus } from './ProcessStatus';

export function ValidationPanel({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listValidationResults()
      .then((next) => { if (active) setRows(next); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshToken]);

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Deterministic validation</p>
          <h2>Schedule H checks</h2>
          <p className="panel-description">
            Validation uses only stored structured values. Missing inputs are reported as not evaluated; they are never treated as zero.
          </p>
        </div>
      </div>

      <ProcessStatus
        active={loading}
        label="Loading validation results"
        detail="Reading deterministic checks from the local SQLite workspace."
        eta="usually under 2 seconds"
      />

      {!loading && !rows.length ? (
        <div className="empty-state">No validation results yet. Run structured extraction on a supported filing first.</div>
      ) : null}

      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Year</th><th>Check</th><th>Column</th><th>Status</th><th>Observed</th><th>Expected</th><th>Message</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.validation_result_id)}>
                  <td>{String(row.plan_year)}</td>
                  <td className="mono">{String(row.rule_code)}</td>
                  <td>{String(row.subfield)}</td>
                  <td><span className="data-badge">{String(row.status)}</span></td>
                  <td className="mono">{row.observed_number == null ? '—' : Number(row.observed_number).toLocaleString()}</td>
                  <td className="mono">{row.expected_number == null ? '—' : Number(row.expected_number).toLocaleString()}</td>
                  <td>{String(row.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
