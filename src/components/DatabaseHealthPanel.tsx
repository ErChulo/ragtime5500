import { useState } from 'react';
import { db, type DbDiagnostics } from '../db/client';
import { listSourceDocuments } from '../db/repository';
import { readStoredFile } from '../ingest/opfsFiles';
import { sha256Hex } from '../utils/hash';
import { ProcessStatus } from './ProcessStatus';

interface SourceFailure {
  filename: string;
  problem: string;
}

export function DatabaseHealthPanel() {
  const [diagnostics, setDiagnostics] = useState<DbDiagnostics | null>(null);
  const [failures, setFailures] = useState<SourceFailure[]>([]);
  const [status, setStatus] = useState('Integrity has not been checked in this session.');
  const [working, setWorking] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);

  const run = async () => {
    setWorking(true);
    setFailures([]);
    setCheckedCount(0);
    setDocumentCount(0);
    setStatus('Checking the SQLite workspace and verifying embedded source-document hashes…');

    try {
      const before = await db.diagnostics();
      if (before.quickCheck.toLowerCase() !== 'ok' || before.foreignKeyViolationCount !== 0) {
        throw new Error('SQLite integrity checks did not pass before the reopen test.');
      }

      await db.close();
      await db.init();
      const after = await db.diagnostics();
      setDiagnostics(after);

      const documents = await listSourceDocuments();
      setDocumentCount(documents.length);
      const nextFailures: SourceFailure[] = [];
      let checked = 0;

      for (const document of documents) {
        const filename = String(document.filename ?? '');
        try {
          const bytes = await readStoredFile(String(document.storage_key ?? ''));
          if (bytes.byteLength !== Number(document.file_size)) {
            nextFailures.push({ filename, problem: `Size mismatch: expected ${document.file_size}, found ${bytes.byteLength} bytes.` });
            continue;
          }

          const hash = await sha256Hex(bytes);
          if (hash !== String(document.sha256)) {
            nextFailures.push({ filename, problem: 'SHA-256 mismatch.' });
            continue;
          }
          checked += 1;
        } catch (error) {
          nextFailures.push({ filename, problem: error instanceof Error ? error.message : String(error) });
        } finally {
          setCheckedCount((value) => value + 1);
        }
      }

      setFailures(nextFailures);
      setStatus(
        nextFailures.length
          ? `SQLite passed, but ${nextFailures.length} of ${documents.length} stored source document${documents.length === 1 ? '' : 's'} failed verification.`
          : `PASS — SQLite workspace reopened and ${checked} stored source document${checked === 1 ? '' : 's'} passed size and SHA-256 verification.`,
      );
    } catch (error) {
      setStatus(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Local integrity</p>
          <h2>Database and source health</h2>
          <p className="panel-description">
            Runs SQLite integrity/foreign-key checks, then verifies every imported source file stored inside the workspace against its recorded size and SHA-256.
          </p>
        </div>
      </div>

      <div className="panel-actions">
        <button type="button" onClick={run} disabled={working}>{working ? 'Checking locally…' : 'Run integrity check'}</button>
      </div>

            <ProcessStatus active={working} label="Checking database and source files" detail="Running SQLite checks and verifying local SHA-256 hashes." current={checkedCount} total={documentCount || undefined} eta="large workspaces may take several seconds" />

      {diagnostics ? (
        <dl className="health-grid">
          <dt>SQLite quick check</dt><dd><span className="data-badge">{diagnostics.quickCheck}</span></dd>
          <dt>Foreign-key violations</dt><dd>{diagnostics.foreignKeyViolationCount}</dd>
          <dt>Schema migration</dt><dd>v{diagnostics.migrationVersion}</dd>
          <dt>SQLite file size</dt><dd>{diagnostics.databaseBytes.toLocaleString()} bytes</dd>
        </dl>
      ) : null}

      {failures.length ? (
        <div className="integrity-failures" role="alert">
          <strong>Source-file verification failures</strong>
          <ul>{failures.map((failure) => <li key={failure.filename}><span>{failure.filename}</span> — {failure.problem}</li>)}</ul>
        </div>
      ) : null}

      <p className="status" role="status">{status}</p>
    </section>
  );
}
