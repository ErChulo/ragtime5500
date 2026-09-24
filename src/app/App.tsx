import { useEffect, useState } from 'react';
import { db } from '../db/client';
import { HierarchyPanel } from '../components/HierarchyPanel';
import { AppNavigation, appSections } from '../components/AppNavigation';
import { useHashSection } from './routes';
import { WorkspaceFileGate } from '../components/WorkspaceFileGate';
import { ImportWizard } from '../components/ImportWizard';
import { ReviewWizard } from '../components/ReviewWizard';
import { ExploreWizard } from '../components/ExploreWizard';
import { DatabaseWorkspace } from '../components/DatabaseWorkspace';

export default function App() {
  const [dbInfo, setDbInfo] = useState('Initializing SQLite…');
  const [dbReady, setDbReady] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [activeSection, navigate] = useHashSection();
  const refresh = () => setRefreshToken((value) => value + 1);

  useEffect(() => {
    db.init().then((info) => {
      setDbInfo(`SQLite ${info.sqliteVersion} · ${info.persistence} · foreign keys ${info.foreignKeys ? 'ON' : 'OFF'}`);
      setDbReady(true);
      setWorkspaceStatus('SQLite is ready. Open or create a local workspace file.');
    }).catch((error) => {
      setDbInfo(`Database initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      setDbReady(false);
    });
  }, []);


  const openWorkspace = async () => {
    setWorkspaceStatus('Opening local SQLite workspace…');
    try {
      const name = await db.openWorkspace();
      setWorkspaceName(name);
      setWorkspaceStatus(`Workspace opened: ${name}`);
      refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setWorkspaceStatus('Open workspace canceled.');
      } else {
        setWorkspaceStatus(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const createWorkspace = async () => {
    setWorkspaceStatus('Creating local SQLite workspace…');
    try {
      const name = await db.createWorkspace();
      setWorkspaceName(name);
      setWorkspaceStatus(`Workspace created: ${name}`);
      refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setWorkspaceStatus('Create workspace canceled.');
      } else {
        setWorkspaceStatus(error instanceof Error ? error.message : String(error));
      }
    }
  };

  const section = appSections.find((item) => item.id === activeSection) ?? appSections[0];

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="brand-block">
          <p className="eyebrow">Offline Form 5500 workbench</p>
          <h1>Ragtime 5500</h1>
          <p className="brand-subtitle">Structured pension filing data with page-level provenance.</p>
        </div>
        <div className="system-status" aria-label="Local security and database status">
          <span className="status-pill status-pill-secure"><span className="status-dot" />Offline</span>
          <span className={`status-pill${workspaceName ? ' status-pill-ready' : ''}`}>{workspaceName ? workspaceName : dbReady ? 'Choose workspace' : 'Starting'}</span>
        </div>
      </header>

      {!workspaceName ? (
        <WorkspaceFileGate
          databaseReady={dbReady}
          supported={dbReady ? db.supportsWorkspaceFiles() : false}
          status={workspaceStatus}
          onOpen={() => void openWorkspace()}
          onCreate={() => void createWorkspace()}
        />
      ) : (
      <div className="app-layout">
        <aside className="sidebar">
          <AppNavigation value={activeSection} onChange={navigate} />
          <div className="sidebar-footnote">
            <span className="sidebar-footnote-label">Local database</span>
            <span>{dbInfo}</span>
            <span className="sidebar-footnote-label">Workspace</span>
            <span>{workspaceName}</span>
          </div>
        </aside>

        <main className="workspace" id="main-content">
          <section className="workspace-heading" aria-labelledby="workspace-title">
            <div>
              <p className="eyebrow">{section.step} / 05</p>
              <h2 id="workspace-title">{section.label}</h2>
              <p>{section.description}</p>
            </div>
          </section>

          {activeSection === 'workspace' ? <HierarchyPanel refreshToken={refreshToken} onContinue={() => navigate('import')} /> : null}
          {activeSection === 'import' ? <ImportWizard refreshToken={refreshToken} onChanged={refresh} /> : null}
          {activeSection === 'review' ? <ReviewWizard refreshToken={refreshToken} onChanged={refresh} /> : null}
          {activeSection === 'explore' ? <ExploreWizard /> : null}
          {activeSection === 'database' ? <DatabaseWorkspace refreshToken={refreshToken} onRestored={refresh} /> : null}
        </main>
      </div>
      )}
    </div>
  );
}
