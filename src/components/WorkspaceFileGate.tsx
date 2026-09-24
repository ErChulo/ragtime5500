interface Props {
  databaseReady: boolean;
  supported: boolean;
  status: string;
  onOpen: () => void;
  onCreate: () => void;
}

export function WorkspaceFileGate({ databaseReady, supported, status, onOpen, onCreate }: Props) {
  return (
    <main className="workspace workspace-gate" id="main-content">
      <section className="workspace-file-card" aria-labelledby="workspace-file-title">
        <p className="eyebrow">Local persistent workspace</p>
        <h2 id="workspace-file-title">Open a Ragtime database</h2>
        <p className="workspace-file-lede">
          Ragtime runs directly from this HTML file. Your case data, imported PDFs, eFAST CSV rows,
          extracted values, and audit history are stored in a separate local SQLite workspace file
          that you choose.
        </p>

        <div className="workspace-file-facts" aria-label="Workspace properties">
          <div><strong>No server</strong><span>Direct file:// application</span></div>
          <div><strong>No network</strong><span>Outbound connections remain blocked</span></div>
          <div><strong>Portable</strong><span>One SQLite workspace contains the case database and source-file bytes</span></div>
        </div>

        {!supported && databaseReady ? (
          <div className="workspace-file-warning" role="alert">
            This Chrome installation does not expose the local file access API needed to write a persistent
            workspace from a directly opened HTML file.
          </div>
        ) : null}

        <div className="workspace-file-actions">
          <button type="button" onClick={onOpen} disabled={!databaseReady || !supported}>
            Open existing workspace
          </button>
          <button className="button-secondary" type="button" onClick={onCreate} disabled={!databaseReady || !supported}>
            Create new workspace
          </button>
        </div>

        <p className="action-hint">
          After reopening Ragtime later, choose the same <span className="mono">.sqlite3</span> workspace file.
          No data is stored on a server.
        </p>

        {status ? <p className="status" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
