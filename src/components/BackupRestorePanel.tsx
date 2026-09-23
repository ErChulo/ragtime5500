import { useState } from 'react';
import { db } from '../db/client';

function downloadBytes(bytes: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function BackupRestorePanel({ onRestored }: { onRestored: () => void }) {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');

  const exportDb = async () => {
    try {
      const bytes = await db.exportDatabase();
      downloadBytes(bytes, `ragtime5500-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`, 'application/x-sqlite3');
      setStatus('Database backup created locally.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const restoreDb = async () => {
    if (!restoreFile || !confirm('Restore this SQLite backup? Current database contents will be replaced.')) return;
    try {
      const bytes = await restoreFile.arrayBuffer();
      await db.restoreDatabase(bytes);
      setStatus('Database restored. Migration and integrity checks passed.');
      onRestored();
    } catch (error) {
      setStatus(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Persistence</p>
          <h2>SQLite backup and restore</h2>
          <p className="panel-description">Export the complete local database or replace it from a previously exported SQLite backup.</p>
        </div>
      </div>
      <div className="backup-actions">
        <button type="button" onClick={exportDb}>Export database</button>
        <label className="file-field">
          <span>Restore from local backup</span>
          <input
            type="file"
            accept=".sqlite,.sqlite3,application/x-sqlite3"
            onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" className="button-secondary" onClick={restoreDb} disabled={!restoreFile}>Restore selected backup</button>
      </div>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
