import { useEffect, useState } from 'react';
import { db } from '../db/client';
import { CsvImportPanel } from './CsvImportPanel';
import { PdfImportPanel } from './PdfImportPanel';

type Step = 'csv' | 'pdf';

export function ImportWizard({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [step, setStep] = useState<Step>('csv');
  const [hasCsv, setHasCsv] = useState(false);

  useEffect(() => {
    let active = true;
    void db.exec<{ count: number }>('SELECT COUNT(*) AS count FROM efast_import')
      .then((rows) => {
        if (!active) return;
        const present = Number(rows[0]?.count ?? 0) > 0;
        setHasCsv(present);
        if (present) setStep((current) => current);
      })
      .catch(() => {
        if (active) setHasCsv(false);
      });
    return () => { active = false; };
  }, [refreshToken]);

  const csvImported = () => {
    setHasCsv(true);
    setStep('pdf');
    onChanged();
  };

  return (
    <section className="guided-flow">
      <div className="substep-bar" aria-label="Import progress">
        <button type="button" className={step === 'csv' ? 'substep active' : 'substep'} onClick={() => setStep('csv')}>
          <span>1</span> eFAST CSV
        </button>
        <button type="button" className={step === 'pdf' ? 'substep active' : 'substep'} disabled={!hasCsv} onClick={() => setStep('pdf')}>
          <span>2</span> Local PDFs
        </button>
      </div>

      {step === 'csv' ? <CsvImportPanel onImported={csvImported} /> : null}
      {step === 'pdf' ? <PdfImportPanel onImported={onChanged} /> : null}

      {step === 'csv' && hasCsv ? (
        <div className="flow-next">
          <button type="button" onClick={() => setStep('pdf')}>Continue to PDFs</button>
        </div>
      ) : null}
    </section>
  );
}
