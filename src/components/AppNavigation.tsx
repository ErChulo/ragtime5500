export type AppSection = 'workspace' | 'import' | 'review' | 'explore' | 'database';

export interface AppSectionDefinition {
  id: AppSection;
  step: string;
  label: string;
  description: string;
}

export const appSections: AppSectionDefinition[] = [
  { id: 'workspace', step: '01', label: 'Workspace', description: 'Cases, plans, plan years, and filings' },
  { id: 'import', step: '02', label: 'Import', description: 'eFAST CSV and locally downloaded PDFs' },
  { id: 'review', step: '03', label: 'Review', description: 'Document matching and extracted values' },
  { id: 'explore', step: '04', label: 'Explore', description: 'Exact line and canonical concept queries' },
  { id: 'database', step: '05', label: 'Database', description: 'Backup, restore, and read-only SQL' },
];

export function AppNavigation({ value, onChange }: { value: AppSection; onChange: (section: AppSection) => void }) {
  return (
    <nav className="app-nav" aria-label="Ragtime 5500 workspace">
      {appSections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`nav-item${value === section.id ? ' active' : ''}`}
          aria-current={value === section.id ? 'page' : undefined}
          onClick={() => onChange(section.id)}
        >
          <span className="nav-step" aria-hidden="true">{section.step}</span>
          <span className="nav-copy">
            <strong>{section.label}</strong>
            <small>{section.description}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}
