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
      <section className="workspace-file-card simple-gate" aria-labelledby="workspace-file-title">
        <p className="eyebrow">First step</p>
        <h2 id="workspace-file-title">Choose where Ragtime saves your work</h2>
        <p className="workspace-file-lede">
          Ragtime uses one local SQLite workspace file. Nothing is sent anywhere.
        </p>

        {!supported && databaseReady ? (
          <div className="workspace-file-warning" role="alert">
            This Chrome installation does not expose the local file access API Ragtime needs.
          </div>
        ) : null}

        <div className="workspace-choice-grid">
          <button type="button" onClick={onOpen} disabled={!databaseReady || !supported}>
            <strong>Open my existing workspace</strong>
            <span>I already created a Ragtime .sqlite3 file.</span>
          </button>
          <button className="button-secondary" type="button" onClick={onCreate} disabled={!databaseReady || !supported}>
            <strong>Create a new workspace</strong>
            <span>This is my first time using this case database.</span>
          </button>
        </div>

        <details className="why-workspace">
          <summary>What is a workspace?</summary>
          <p>
            It is the local SQLite file that holds the case database and imported evidence. Keep it with the case files and reopen the same file next time.
          </p>
        </details>

        {status ? <p className="status" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
