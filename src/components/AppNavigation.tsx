export type AppSection = 'home' | 'workspace' | 'import' | 'review' | 'explore' | 'database';

export interface AppSectionDefinition {
  id: AppSection;
  label: string;
  description: string;
}

export const appSections: AppSectionDefinition[] = [
  { id: 'home', label: 'Guide', description: 'Start here or return to the testing guide' },
  { id: 'workspace', label: 'Case setup', description: 'Case → Plan → Year → Filing' },
  { id: 'import', label: 'Import', description: 'eFAST CSV and local PDFs' },
  { id: 'review', label: 'Review', description: 'Match documents and verify extracted values' },
  { id: 'explore', label: 'Find values', description: 'Exact lines, concepts, and document text' },
  { id: 'database', label: 'Backup', description: 'Backup, restore, and advanced database tools' },
];

export function AppNavigation({ value, onChange }: { value: AppSection; onChange: (section: AppSection) => void }) {
  const current = appSections.find((section) => section.id === value) ?? appSections[0];
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

      <details className="tools-menu">
        <summary>All tools</summary>
        <div className="tools-menu-popover">
          {appSections.filter((section) => section.id !== 'home').map((section) => (
            <button
              key={section.id}
              type="button"
              className={value === section.id ? 'active' : ''}
              aria-current={value === section.id ? 'page' : undefined}
              onClick={() => onChange(section.id)}
            >
              <strong>{section.label}</strong>
              <span>{section.description}</span>
            </button>
          ))}
        </div>
      </details>
    </nav>
  );
}
