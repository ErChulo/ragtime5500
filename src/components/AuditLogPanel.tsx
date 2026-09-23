import { useEffect, useState } from 'react';
import { listAuditLog } from '../db/repository';

function displayValue(value: unknown): string {
  if (value == null || value === '') return '—';
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

export function AuditLogPanel({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void listAuditLog(100)
      .then((next) => {
        if (!active) return;
        setRows(next);
        setStatus(next.length ? `Showing the ${next.length} most recent audit event${next.length === 1 ? '' : 's'}.` : 'No audit events have been recorded yet.');
      })
      .catch((error) => {
        if (active) setStatus(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, [refreshToken]);

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Traceability</p>
          <h2>Audit history</h2>
          <p className="panel-description">
            User corrections, verification actions, deletions, and manual document-match decisions are retained here as append-only audit events.
          </p>
        </div>
      </div>

      {!rows.length ? <div className="empty-state">No audit events yet.</div> : (
        <div className="table-wrap audit-table">
          <table>
            <thead><tr><th>Time</th><th>Entity</th><th>ID</th><th>Action</th><th>Previous</th><th>New</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.audit_id)}>
                  <td className="mono">{String(row.timestamp)}</td>
                  <td>{String(row.entity_type)}</td>
                  <td className="mono">{String(row.entity_id)}</td>
                  <td><span className="data-badge">{String(row.action)}</span></td>
                  <td className="mono wrap">{displayValue(row.old_value)}</td>
                  <td className="mono wrap">{displayValue(row.new_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
