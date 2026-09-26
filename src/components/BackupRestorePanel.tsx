import { useState } from 'react';
import { createWorkspaceArchive, restoreWorkspaceArchive } from '../backup/workspaceArchive';
import { db } from '../db/client';
import { ProcessStatus } from './ProcessStatus';
import { versionedArtifactName } from '../version';

function downloadBlob(blob: Blob, filename: string): void {
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

function downloadBytes(bytes: ArrayBuffer, filename: string, mime: string): void {
  downloadBlob(new Blob([bytes], { type: mime }), filename);
}

export function BackupRestorePanel({ onRestored }: { onRestored: () => void }) {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [workspaceFile, setWorkspaceFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [operation, setOperation] = useState('');

  const exportDb = async () => {
    setWorking(true);
    setOperation('Exporting SQLite backup');
    try {
      const bytes = await db.exportDatabase();
      downloadBytes(bytes, versionedArtifactName('ragtime5500-backup', 'sqlite3'), 'application/x-sqlite3');
      setStatus(`Database backup created locally (${bytes.byteLength.toLocaleString()} bytes). SQLite integrity checks passed before export.`);
    } catch (error) {
      setStatus(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
      setOperation('');
    }
  };

  const exportWorkspace = async () => {
    setWorking(true);
    setOperation('Exporting full workspace');
    setStatus('Verifying the SQLite database and all stored source documents before creating the workspace archive…');
    try {
      const { blob, result } = await createWorkspaceArchive();
      downloadBlob(blob, versionedArtifactName('ragtime5500-workspace', 'r5500'));
      setStatus(
        `Full workspace backup created locally: ${result.documentCount} source document${result.documentCount === 1 ? '' : 's'}, ${result.archiveBytes.toLocaleString()} bytes total.`,
      );
    } catch (error) {
      setStatus(`Workspace backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
      setOperation('');
    }
  };

  const restoreDb = async () => {
    if (!restoreFile || !confirm('Restore this SQLite backup? Current database contents will be replaced only if the candidate passes migration, integrity, and foreign-key checks.')) return;
    setWorking(true);
    setOperation('Restoring SQLite backup');
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
      setOperation('');
    }
  };

  const restoreWorkspace = async () => {
    if (!workspaceFile || !confirm('Restore this full Ragtime 5500 workspace? The archive will be hash-verified before source files and the SQLite database are restored.')) return;
    setWorking(true);
    setOperation('Restoring full workspace');
    setStatus('Validating full workspace archive locally…');
    try {
      const result = await restoreWorkspaceArchive(workspaceFile);
      setStatus(
        `Full workspace restored: ${result.documentCount} source document${result.documentCount === 1 ? '' : 's'}; SQLite quick_check=${result.diagnostics.quickCheck}; foreign-key violations=${result.diagnostics.foreignKeyViolationCount}.`,
      );
      setWorkspaceFile(null);
      onRestored();
    } catch (error) {
      setStatus(`Workspace restore failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
      setOperation('');
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Persistence</p>
          <h2>Backup and restore</h2>
          <p className="panel-description">
            Use the full workspace archive for disaster recovery. SQLite-only export remains available for direct database inspection and portability.
          </p>
        </div>
      </div>

      <div className="backup-section">
        <div className="backup-section-heading">
          <strong>Full workspace</strong>
          <span>SQLite + imported local PDFs/CSVs</span>
        </div>
        <div className="backup-actions">
          <button type="button" onClick={exportWorkspace} disabled={working}>{working ? 'Working locally…' : 'Export full workspace'}</button>
          <label className="file-field">
            <span>Restore .r5500 workspace</span>
            <input
              type="file"
              accept=".r5500,application/octet-stream"
              disabled={working}
              onChange={(event) => setWorkspaceFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="button-secondary" onClick={restoreWorkspace} disabled={!workspaceFile || working}>Restore workspace</button>
        </div>
      </div>

      <div className="backup-section backup-section-secondary">
        <div className="backup-section-heading">
          <strong>SQLite only</strong>
          <span>Authoritative relational database without source-file bytes</span>
        </div>
        <div className="backup-actions">
          <button type="button" className="button-secondary" onClick={exportDb} disabled={working}>Export SQLite</button>
          <label className="file-field">
            <span>Restore SQLite backup</span>
            <input
              type="file"
              accept=".sqlite,.sqlite3,application/x-sqlite3"
              disabled={working}
              onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="button-secondary" onClick={restoreDb} disabled={!restoreFile || working}>Restore SQLite</button>
        </div>
      </div>

      <p className="backup-note">
        Full workspace archives verify SHA-256 for the SQLite payload and every source document before restoration. All processing and downloads remain local to the browser.
      </p>
      <ProcessStatus active={working} label={operation || 'Working locally'} detail="Ragtime is verifying data before completing this operation." eta="a few seconds; large workspaces may take longer" />
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
