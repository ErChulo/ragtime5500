import { useState } from 'react';
import { getDatabaseHealth, listSourceDocumentsForIntegrity } from '../db/repository';
import { readStoredFile } from '../ingest/opfsFiles';
import { sha256Hex } from '../utils/hash';

interface IntegrityResult {
  sourceDocumentId: number;
  filename: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

export function SystemDiagnosticsPanel() {
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getDatabaseHealth>> | null>(null);
  const [documents, setDocuments] = useState<IntegrityResult[]>([]);
  const [working, setWorking] = useState(false);

  const run = async () => {
    setWorking(true);
    setStatus('Running SQLite and source-file integrity checks locally…');
    try {
      const [nextHealth, sourceDocuments] = await Promise.all([
        getDatabaseHealth(),
        listSourceDocumentsForIntegrity(),
      ]);

      const nextDocuments: IntegrityResult[] = [];
      for (const document of sourceDocuments) {
        try {
          const bytes = await readStoredFile(document.storageKey);
          const hash = await sha256Hex(bytes);
          const sizeMatches = bytes.byteLength === document.fileSize;
          const hashMatches = hash === document.sha256;
          nextDocuments.push({
            sourceDocumentId: document.sourceDocumentId,
            filename: document.filename,
            status: sizeMatches && hashMatches ? 'PASS' : 'FAIL',
            detail: sizeMatches && hashMatches
              ? `${bytes.byteLength.toLocaleString()} bytes · SHA-256 verified`
              : `Expected ${document.fileSize.toLocaleString()} bytes / ${document.sha256}; found ${bytes.byteLength.toLocaleString()} bytes / ${hash}`,
          });
        } catch (error) {
          nextDocuments.push({
            sourceDocumentId: document.sourceDocumentId,
            filename: document.filename,
            status: 'FAIL',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      setHealth(nextHealth);
      setDocuments(nextDocuments);
      const documentFailures = nextDocuments.filter((row) => row.status === 'FAIL').length;
      const databasePass = nextHealth.quickCheck === 'ok' && nextHealth.foreignKeyViolations === 0;
      setStatus(
        databasePass && documentFailures === 0
          ? `Integrity PASS. SQLite quick_check=ok; 0 foreign-key violations; ${nextDocuments.length} source document${nextDocuments.length === 1 ? '' : 's'} verified.`
          : `Integrity requires review. Database pass=${databasePass ? 'yes' : 'no'}; source-document failures=${documentFailures}.`,
      );
    } catch (error) {
      setHealth(null);
      setDocuments([]);
      setStatus(`Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Local integrity</p>
          <h2>System diagnostics</h2>
          <p className="panel-description">
            Verifies SQLite integrity, foreign keys, schema migration state, and every imported source file against its stored SHA-256.
          </p>
        </div>
      </div>

      <div className="panel-actions">
        <button type="button" onClick={run} disabled={working}>
          {working ? 'Checking locally…' : 'Run integrity check'}
        </button>
        <span className="action-hint">No network access is used or required.</span>
      </div>

      {health ? (
        <dl className="diagnostic-grid">
          <div><dt>SQLite quick_check</dt><dd><span className="data-badge">{health.quickCheck}</span></dd></div>
          <div><dt>Foreign-key violations</dt><dd>{health.foreignKeyViolations}</dd></div>
          <div><dt>Schema migration</dt><dd>v{health.migrationVersion}</dd></div>
          <div><dt>Cases</dt><dd>{health.caseCount}</dd></div>
          <div><dt>Plans</dt><dd>{health.planCount}</dd></div>
          <div><dt>Filings</dt><dd>{health.filingCount}</dd></div>
          <div><dt>Source documents</dt><dd>{health.sourceDocumentCount}</dd></div>
          <div><dt>Filing values</dt><dd>{health.filingValueCount}</dd></div>
        </dl>
      ) : null}

      {documents.length ? (
        <div className="table-wrap diagnostic-table">
          <table>
            <thead><tr><th>Source document</th><th>Integrity</th><th>Evidence</th></tr></thead>
            <tbody>
              {documents.map((row) => (
                <tr key={row.sourceDocumentId}>
                  <td>{row.filename}</td>
                  <td><span className="data-badge">{row.status}</span></td>
                  <td className="mono wrap">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
