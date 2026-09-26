import { useState } from 'react';
import { db } from '../db/client';
import { ProcessStatus } from './ProcessStatus';

const DEFAULT_SQL = `SELECT plan_year, schedule_name, part, location_reference, subfield,
       canonical_concept, normalized_number, source_filename, source_page, verification_status
FROM filing_value_provenance
WHERE plan_year = 2024
  AND schedule_name = 'H'
  AND part = 'I'
  AND location_reference = '1C9'
  AND subfield = 'EOY';`;

function isReadOnlySql(sql: string): boolean {
  const withoutTrailingSemicolon = sql.trim().replace(/;\s*$/, '');
  if (!withoutTrailingSemicolon || withoutTrailingSemicolon.includes(';')) return false;
  if (/^pragma\s+(table_info|foreign_key_check|integrity_check)\s*(?:\(|$)/i.test(withoutTrailingSemicolon)) return true;
  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon)) return false;

  const scrubbed = withoutTrailingSemicolon
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\"(?:\"\"|[^\"])*\"/g, '\"\"');
  return !/\b(insert|update|delete|replace|create|drop|alter|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release)\b/i.test(scrubbed);
}

export function SqlConsole() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const run = async () => {
    setError('');
    const trimmed = sql.trim();
    if (!isReadOnlySql(trimmed)) {
      setError('The console accepts one read-only SELECT/CTE or a safe inspection PRAGMA only.');
      return;
    }
    setWorking(true);
    try {
      setRows(await db.exec(trimmed));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Advanced inspection</p>
          <h2>Read-only SQL console</h2>
          <p className="panel-description">Inspect the authoritative SQLite database directly. Mutation statements are rejected by the UI.</p>
        </div>
      </div>
      <label>
        <span>SQL query</span>
        <textarea value={sql} onChange={(event) => setSql(event.target.value)} rows={10} spellCheck={false} />
      </label>
      <div className="panel-actions"><button type="button" onClick={run} disabled={working}>{working ? 'Executing…' : 'Execute query'}</button></div>
      <ProcessStatus active={working} label="Executing read-only SQL" eta="usually under 1 second" />
      {error ? <p className="error" role="alert">{error}</p> : null}
      {rows.length ? <pre className="result-json">{JSON.stringify(rows, null, 2)}</pre> : null}
    </section>
  );
}
