import { useEffect, useState } from 'react';
import { db } from '../db/client';
import { MatchReview } from './MatchReview';
import { ExtractionReview } from './ExtractionReview';

type Step = 'matches' | 'values';

export function ReviewWizard({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [step, setStep] = useState<Step>('matches');
  const [unresolved, setUnresolved] = useState(0);
  const [valueCount, setValueCount] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      db.exec<{ count: number }>("SELECT COUNT(*) AS count FROM document_match WHERE verification_status IN ('AMBIGUOUS','UNMATCHED','USER_REJECTED')"),
      db.exec<{ count: number }>('SELECT COUNT(*) AS count FROM filing_value'),
    ]).then(([matchRows, valueRows]) => {
      if (!active) return;
      const pending = Number(matchRows[0]?.count ?? 0);
      const values = Number(valueRows[0]?.count ?? 0);
      setUnresolved(pending);
      setValueCount(values);
      setStep(pending > 0 ? 'matches' : 'values');
    });
    return () => { active = false; };
  }, [refreshToken]);

  return (
    <section className="guided-flow">
      <div className="substep-bar" aria-label="Review progress">
        <button type="button" className={step === 'matches' ? 'substep active' : 'substep'} onClick={() => setStep('matches')}>
          <span>1</span> Matches {unresolved ? <em>{unresolved}</em> : null}
        </button>
        <button type="button" className={step === 'values' ? 'substep active' : 'substep'} disabled={!valueCount && unresolved > 0} onClick={() => setStep('values')}>
          <span>2</span> Extracted values
        </button>
      </div>

      {step === 'matches' ? <MatchReview refreshToken={refreshToken} onChanged={onChanged} /> : null}
      {step === 'values' ? <ExtractionReview refreshToken={refreshToken} onChanged={onChanged} /> : null}

      {step === 'matches' && unresolved === 0 ? (
        <div className="flow-next">
          <span className="action-hint">No unresolved PDF matches.</span>
          <button type="button" onClick={() => setStep('values')}>Review extracted values</button>
        </div>
      ) : null}
    </section>
  );
}
