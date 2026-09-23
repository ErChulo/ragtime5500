import { useState } from 'react';
import { db } from '../db/client';

function downloadBytes(bytes: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BackupRestorePanel({ onRestored }: { onRestored: () => void }) {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const exportDb = async () => {
    setWorking(true);
    try {
      const bytes = await db.exportDatabase();
      downloadBytes(bytes, `ragtime5500-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`, 'application/x-sqlite3');
      setStatus(`Database backup created locally (${bytes.byteLength.toLocaleString()} bytes). SQLite integrity checks passed before export.`);
    } catch (error) {
      setStatus(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  const restoreDb = async () => {
    if (!restoreFile || !confirm('Restore this SQLite backup? Current database contents will be replaced only if the candidate passes migration, integrity, and foreign-key checks.')) return;
    setWorking(true);
    try {
      const bytes = await restoreFile.arrayBuffer();
      const result = await db.restoreDatabase(bytes);
      setStatus(
        `Database restored. SQLite quick_check=${result.diagnostics.quickCheck}; foreign-key violations=${result.diagnostics.foreignKeyViolationCount}; schema migration=v${result.diagnostics.migrationVersion}.`,
      );
      setRestoreFile(null);
      onRestored();
    } catch (error) {
      setStatus(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Persistence</p>
          <h2>SQLite backup and restore</h2>
          <p className="panel-description">
            Export the authoritative SQLite database or replace it from a local backup. A rejected restore automatically reopens the previous database.
          </p>
        </div>
      </div>
      <div className="backup-actions">
        <button type="button" onClick={exportDb} disabled={working}>{working ? 'Working locally…' : 'Export database'}</button>
        <label className="file-field">
          <span>Restore from local backup</span>
          <input
            type="file"
            accept=".sqlite,.sqlite3,application/x-sqlite3"
            disabled={working}
            onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="button-secondary" onClick={restoreDb} disabled={!restoreFile || working}>Restore selected backup</button>
      </div>
      <p className="backup-note">
        SQLite backup contains the authoritative relational database. Imported PDF/CSV source files are stored separately in browser OPFS and are verified by the local integrity check.
      </p>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
