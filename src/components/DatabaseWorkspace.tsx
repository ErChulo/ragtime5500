import { BackupRestorePanel } from './BackupRestorePanel';
import { DatabaseHealthPanel } from './DatabaseHealthPanel';
import { AuditHistoryPanel } from './AuditHistoryPanel';
import { SqlConsole } from './SqlConsole';

export function DatabaseWorkspace({ refreshToken, onRestored }: { refreshToken: number; onRestored: () => void }) {
  return (
    <section className="guided-flow">
      <BackupRestorePanel onRestored={onRestored} />

      <details className="advanced-tools">
        <summary>Advanced database tools</summary>
        <div className="advanced-tools-body">
          <DatabaseHealthPanel />
          <AuditHistoryPanel refreshToken={refreshToken} />
          <SqlConsole />
        </div>
      </details>
    </section>
  );
}
