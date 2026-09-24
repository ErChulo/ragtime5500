import { useEffect, useState } from 'react';
import { db } from '../db/client';
import { CsvImportPanel } from './CsvImportPanel';
import { EfastRowReviewPanel } from './EfastRowReviewPanel';
import { PdfImportPanel } from './PdfImportPanel';

type Step = 'csv' | 'review' | 'pdf';

export function ImportWizard({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [step, setStep] = useState<Step>('csv');
  const [efastImportId, setEfastImportId] = useState<number | null>(null);
  const [reviewComplete, setReviewComplete] = useState(false);

  useEffect(() => {
    let active = true;
    void db.exec<{ efast_import_id: number; pending_count: number }>(`
      SELECT ei.efast_import_id,
             (SELECT COUNT(*) FROM efast_import_row er
              WHERE er.efast_import_id=ei.efast_import_id
                AND er.classification_status='NEEDS_REVIEW') AS pending_count
      FROM efast_import ei
      ORDER BY ei.efast_import_id DESC
      LIMIT 1
    `).then((rows) => {
      if (!active || !rows[0]) return;
      setEfastImportId(Number(rows[0].efast_import_id));
      const done = Number(rows[0].pending_count) === 0;
      setReviewComplete(done);
      setStep(done ? 'pdf' : 'review');
    }).catch(() => {
      if (active) {
        setEfastImportId(null);
        setReviewComplete(false);
        setStep('csv');
      }
    });
    return () => { active = false; };
  }, [refreshToken]);

  const csvImported = (importId: number) => {
    setEfastImportId(importId);
    setReviewComplete(false);
    setStep('review');
    onChanged();
  };

  const reviewFinished = () => {
    setReviewComplete(true);
    setStep('pdf');
    onChanged();
  };

  return (
    <section className="guided-flow">
      <div className="substep-bar" aria-label="Import progress">
        <button type="button" className={step === 'csv' ? 'substep active' : 'substep'} onClick={() => setStep('csv')}>
          <span>1</span> eFAST CSV
        </button>
        <button
          type="button"
          className={step === 'review' ? 'substep active' : 'substep'}
          disabled={efastImportId === null}
          onClick={() => setStep('review')}
        >
          <span>2</span> Review rows
        </button>
        <button
          type="button"
          className={step === 'pdf' ? 'substep active' : 'substep'}
          disabled={!reviewComplete}
          onClick={() => setStep('pdf')}
        >
          <span>3</span> Local PDFs
        </button>
      </div>

      {step === 'csv' ? <CsvImportPanel onImported={csvImported} /> : null}
      {step === 'review' && efastImportId !== null ? (
        <EfastRowReviewPanel efastImportId={efastImportId} onComplete={reviewFinished} />
      ) : null}
      {step === 'pdf' ? <PdfImportPanel onImported={onChanged} /> : null}
    </section>
  );
}
