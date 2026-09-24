import { useState } from 'react';
import type { AppSection } from './AppNavigation';

interface Props {
  workspaceName: string;
  onNavigate: (section: AppSection) => void;
}

interface TestStep {
  title: string;
  action: string;
  expected: string;
  proves: string;
  section?: AppSection;
  button?: string;
}

const TEST_STEPS: TestStep[] = [
  {
    title: 'Create the filing context',
    action: 'Create or select one Case, Plan Year, and Filing. In Ragtime, one case is one pension plan.',
    expected: 'You finish with a single filing context selected.',
    proves: 'Ragtime can maintain the authoritative case → plan year → filing hierarchy without asking you to create a duplicate Plan record.',
    section: 'workspace',
    button: 'Go to case setup',
  },
  {
    title: 'Import the eFAST CSV',
    action: 'Choose the local eFAST export CSV and import it.',
    expected: 'Ragtime shows the imported row count and preserves the eFAST URL only as provenance text.',
    proves: 'Ragtime can ingest and preserve the eFAST export without contacting eFAST.',
    section: 'import',
    button: 'Go to import',
  },
  {
    title: 'Import the local Form 5500 PDFs',
    action: 'Choose the PDFs you downloaded manually outside Ragtime.',
    expected: 'Each PDF is hashed and classified as matched, ambiguous, or unmatched.',
    proves: 'Ragtime can ingest local evidence and match it to the expected filing.',
    section: 'import',
    button: 'Go to PDFs',
  },
  {
    title: 'Review matching and extraction',
    action: 'Resolve any uncertain PDF match, then inspect the extracted Schedule H 1C9 values.',
    expected: 'The value shows its line, subfield, source PDF, page, extraction method, confidence, and verification state.',
    proves: 'Ragtime preserves provenance instead of returning an unexplained number.',
    section: 'review',
    button: 'Go to review',
  },
  {
    title: 'Query one exact Form 5500 value',
    action: 'Run the structured query for Plan Year 2024, Schedule H, Part I, location 1C9, subfield EOY.',
    expected: 'For the designated acceptance filing, the result should be 957892 and trace back to the PDF page.',
    proves: 'Exact factual questions are answered from SQLite, not invented by a model.',
    section: 'explore',
    button: 'Go to exact query',
  },
  {
    title: 'Test backup and restore',
    action: 'Export the SQLite backup, then verify that Ragtime can restore it.',
    expected: 'The same structured value and provenance remain available after restore.',
    proves: 'The complete local case workspace is portable and recoverable.',
    section: 'database',
    button: 'Go to backup',
  },
  {
    title: 'Test persistence',
    action: 'Close Chrome completely. Reopen ragtime5500.html, choose the same workspace file, and rerun the exact query.',
    expected: 'The case, imported evidence, and extracted value are still present.',
    proves: 'The local SQLite workspace survives browser and workstation restarts without a server.',
  },
];

function clampStep(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(TEST_STEPS.length - 1, Math.trunc(value)));
}

export function HomeGuide({ workspaceName, onNavigate }: Props) {
  const [mode, setMode] = useState<'home' | 'test'>(() => {
    try {
      return sessionStorage.getItem('ragtime-home-mode') === 'test' ? 'test' : 'home';
    } catch {
      return 'home';
    }
  });
  const [stepIndex, setStepIndex] = useState(() => {
    try {
      return clampStep(Number(sessionStorage.getItem('ragtime-test-step') ?? 0));
    } catch {
      return 0;
    }
  });

  const chooseMode = (next: 'home' | 'test') => {
    setMode(next);
    try { sessionStorage.setItem('ragtime-home-mode', next); } catch { /* local hint only */ }
  };

  const chooseStep = (next: number) => {
    const bounded = clampStep(next);
    setStepIndex(bounded);
    try { sessionStorage.setItem('ragtime-test-step', String(bounded)); } catch { /* local hint only */ }
  };

  const step = TEST_STEPS[stepIndex];

  if (mode === 'test') {
    return (
      <section className="panel home-guide">
        <div className="guide-topline">
          <button className="button-tertiary" type="button" onClick={() => chooseMode('home')}>← Home</button>
          <span className="guide-step-count">Test step {stepIndex + 1} of {TEST_STEPS.length}</span>
        </div>

        <div className="guide-progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / TEST_STEPS.length) * 100}%` }} />
        </div>

        <div className="guide-card">
          <p className="eyebrow">Do this now</p>
          <h2>{step.title}</h2>
          <p className="guide-action">{step.action}</p>

          <dl className="guide-expectation">
            <div><dt>What you should see</dt><dd>{step.expected}</dd></div>
            <div><dt>What this proves</dt><dd>{step.proves}</dd></div>
          </dl>

          <div className="guide-actions">
            {stepIndex > 0 ? <button className="button-secondary" type="button" onClick={() => chooseStep(stepIndex - 1)}>Previous</button> : <span />}
            {step.section ? <button type="button" onClick={() => onNavigate(step.section!)}>{step.button}</button> : null}
            {stepIndex < TEST_STEPS.length - 1
              ? <button className="button-secondary" type="button" onClick={() => chooseStep(stepIndex + 1)}>Mark done → next</button>
              : <button type="button" onClick={() => chooseMode('home')}>Finish test guide</button>}
          </div>
        </div>

        <p className="guide-memory-note">
          You can return here at any time with <strong>Guide</strong>. Ragtime remembers the current test step during this browser session.
        </p>
      </section>
    );
  }

  return (
    <section className="panel home-guide">
      <p className="eyebrow">Ragtime 5500</p>
      <h2>What do you want to do?</h2>
      <p className="panel-description">Choose one task. Ragtime will show only the controls needed for that task.</p>

      <div className="home-actions">
        <button className="home-action primary" type="button" onClick={() => chooseMode('test')}>
          <strong>Test Ragtime step by step</strong>
          <span>Recommended while you are learning the application.</span>
        </button>

        <button className="home-action" type="button" onClick={() => onNavigate('workspace')}>
          <strong>Set up or change a case</strong>
          <span>Case → Plan Year → Filing, one decision at a time.</span>
        </button>

        <button className="home-action" type="button" onClick={() => onNavigate('explore')}>
          <strong>Find a Form 5500 value</strong>
          <span>Use SQL-backed exact-line, concept, or document search.</span>
        </button>
      </div>

      <details className="home-cheatsheet">
        <summary>Cheat sheet: where do I go?</summary>
        <div className="cheat-grid">
          <button type="button" onClick={() => onNavigate('import')}><strong>Import files</strong><span>eFAST CSV, then local PDFs</span></button>
          <button type="button" onClick={() => onNavigate('review')}><strong>Review evidence</strong><span>PDF matching and extracted values</span></button>
          <button type="button" onClick={() => onNavigate('database')}><strong>Backup / restore</strong><span>SQLite workspace maintenance</span></button>
        </div>
      </details>

      <p className="workspace-context-line">Current workspace: <strong>{workspaceName}</strong></p>
    </section>
  );
}
