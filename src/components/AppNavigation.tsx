import { useRef } from 'react';

export type AppSection = 'home' | 'workspace' | 'import' | 'review' | 'explore' | 'database';

export interface AppSectionDefinition {
  id: AppSection;
  label: string;
  description: string;
}

export const appSections: AppSectionDefinition[] = [
  { id: 'home', label: 'Guide', description: 'Return to the step-by-step guide' },
  { id: 'workspace', label: 'Case', description: 'Create or choose the pension case' },
  { id: 'import', label: 'Import files', description: 'Import the local eFAST CSV, then local PDFs' },
  { id: 'review', label: 'Review', description: 'Resolve document matches and verify extracted values' },
  { id: 'explore', label: 'Find values', description: 'Search exact Form 5500 values and local evidence' },
  { id: 'database', label: 'Backup', description: 'Backup, restore, and advanced database tools' },
];

export function AppNavigation({ value, onChange }: { value: AppSection; onChange: (section: AppSection) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const current = appSections.find((section) => section.id === value) ?? appSections[0];

  const goTo = (section: AppSection) => {
    dialogRef.current?.close();
    onChange(section);
  };

  return (
    <nav className="app-nav-minimal" aria-label="Ragtime 5500 navigation">
      <button
        type="button"
        className={`guide-home-button${value === 'home' ? ' active' : ''}`}
        aria-current={value === 'home' ? 'page' : undefined}
        onClick={() => onChange('home')}
      >
        Guide
      </button>

      <div className="current-location" aria-live="polite">
        <span>You are in</span>
        <strong>{current.label}</strong>
      </div>

      <button
        type="button"
        className="menu-open-button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Go to…
      </button>

      <dialog ref={dialogRef} className="navigation-dialog" aria-labelledby="navigation-dialog-title">
        <div className="navigation-dialog-card">
          <div className="navigation-dialog-header">
            <div>
              <p className="eyebrow">Navigation</p>
              <h2 id="navigation-dialog-title">Where do you want to go?</h2>
            </div>
            <button
              type="button"
              className="dialog-close-button"
              aria-label="Close navigation"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
          </div>

          <div className="navigation-dialog-options">
            {appSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={value === section.id ? 'active' : ''}
                aria-current={value === section.id ? 'page' : undefined}
                onClick={() => goTo(section.id)}
              >
                <strong>{section.label}</strong>
                <span>{section.description}</span>
              </button>
            ))}
          </div>
        </div>
      </dialog>
    </nav>
  );
}
