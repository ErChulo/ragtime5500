import { useState } from 'react';
import { QueryPanel } from './QueryPanel';
import { ConceptHistoryPanel } from './ConceptHistoryPanel';
import { DocumentSearchPanel } from './DocumentSearchPanel';

type Mode = 'exact' | 'concept' | 'document';

export function ExploreWizard() {
  const [mode, setMode] = useState<Mode>('exact');

  return (
    <section className="guided-flow">
      <div className="mode-picker" role="group" aria-label="Search mode">
        <button type="button" className={mode === 'exact' ? 'active' : ''} onClick={() => setMode('exact')}>Exact Form 5500 value</button>
        <button type="button" className={mode === 'concept' ? 'active' : ''} onClick={() => setMode('concept')}>Concept history</button>
        <button type="button" className={mode === 'document' ? 'active' : ''} onClick={() => setMode('document')}>Document text</button>
      </div>

      {mode === 'exact' ? <QueryPanel /> : null}
      {mode === 'concept' ? <ConceptHistoryPanel /> : null}
      {mode === 'document' ? <DocumentSearchPanel /> : null}
    </section>
  );
}
