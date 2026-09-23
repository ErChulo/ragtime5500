import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAuditLog } from '../db/repository';

export function AuditHistoryPanel({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await listAuditLog(250);
      setRows(result);
      setStatus(`${result.length} most recent audit event${result.length === 1 ? '' : 's'} loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [filter, rows]);

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Traceability</p>
          <h2>Audit history</h2>
          <p className="panel-description">
            Manual hierarchy changes, value verification/corrections, imports, and reviewed document matches are retained as local audit events.
          </p>
        </div>
        <button className="button-secondary" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      <div className="filter-row">
        <label>
          <span>Filter audit history</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Entity, action, ID, date…" />
        </label>
        <span className="action-hint">{visible.length} shown</span>
      </div>

      {!visible.length ? <div className="empty-state">No audit events match the current filter.</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Entity</th><th>ID</th><th>Action</th><th>Change</th></tr></thead>
            <tbody>{visible.map((row) => (
              <tr key={String(row.audit_id)}>
                <td className="mono">{String(row.timestamp ?? '')}</td>
                <td>{String(row.entity_type ?? '')}</td>
                <td className="mono">{String(row.entity_id ?? '')}</td>
                <td><span className="data-badge">{String(row.action ?? '')}</span></td>
                <td>
                  <details className="audit-detail">
                    <summary>Inspect</summary>
                    <div className="audit-diff">
                      <div><strong>Before</strong><pre>{String(row.old_value ?? '—')}</pre></div>
                      <div><strong>After</strong><pre>{String(row.new_value ?? '—')}</pre></div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
