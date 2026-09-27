import { useEffect, useState } from 'react';
import { db } from '../db/client';
import { MatchReview } from './MatchReview';
import { StructuredExtractionPanel } from './StructuredExtractionPanel';
import { ExtractionReview } from './ExtractionReview';
import { ValidationPanel } from './ValidationPanel';

type Step = 'matches' | 'extract' | 'values' | 'validation';

export function ReviewWizard({ refreshToken, onChanged }: { refreshToken: number; onChanged: () => void }) {
  const [step, setStep] = useState<Step>('matches');
  const [unresolved, setUnresolved] = useState(0);
  const [valueCount, setValueCount] = useState(0);
  const [validationCount, setValidationCount] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      db.exec<{ count: number }>("SELECT COUNT(*) AS count FROM document_match WHERE verification_status IN ('AMBIGUOUS','UNMATCHED','USER_REJECTED')"),
      db.exec<{ count: number }>('SELECT COUNT(*) AS count FROM filing_value'),
      db.exec<{ count: number }>('SELECT COUNT(*) AS count FROM filing_validation_result'),
    ]).then(([matchRows, valueRows, validationRows]) => {
      if (!active) return;
      const pending = Number(matchRows[0]?.count ?? 0);
      const values = Number(valueRows[0]?.count ?? 0);
      const validations = Number(validationRows[0]?.count ?? 0);
      setUnresolved(pending);
      setValueCount(values);
      setValidationCount(validations);
      setStep((current) => {
        if (pending > 0) return 'matches';
        if (current === 'matches') return 'extract';
        return current;
      });
    });
    return () => { active = false; };
  }, [refreshToken]);

  return (
    <section className="guided-flow">
      <div className="substep-bar" aria-label="Review progress">
        <button type="button" className={step === 'matches' ? 'substep active' : 'substep'} onClick={() => setStep('matches')}>
          <span>1</span> Matches {unresolved ? <em>{unresolved}</em> : null}
        </button>
        <button type="button" className={step === 'extract' ? 'substep active' : 'substep'} disabled={unresolved > 0} onClick={() => setStep('extract')}>
          <span>2</span> Extract
        </button>
        <button type="button" className={step === 'values' ? 'substep active' : 'substep'} disabled={!valueCount && unresolved > 0} onClick={() => setStep('values')}>
          <span>3</span> Verify values {valueCount ? <em>{valueCount}</em> : null}
        </button>
        <button type="button" className={step === 'validation' ? 'substep active' : 'substep'} disabled={!validationCount && !valueCount} onClick={() => setStep('validation')}>
          <span>4</span> Validate {validationCount ? <em>{validationCount}</em> : null}
        </button>
      </div>

      {step === 'matches' ? <MatchReview refreshToken={refreshToken} onChanged={onChanged} /> : null}
      {step === 'extract' ? <StructuredExtractionPanel refreshToken={refreshToken} onChanged={onChanged} /> : null}
      {step === 'values' ? <ExtractionReview refreshToken={refreshToken} onChanged={onChanged} /> : null}
      {step === 'validation' ? <ValidationPanel refreshToken={refreshToken} /> : null}

      {step === 'matches' && unresolved === 0 ? (
        <div className="flow-next">
          <span className="action-hint">No unresolved PDF matches.</span>
          <button type="button" onClick={() => setStep('extract')}>Continue to structured extraction</button>
        </div>
      ) : null}
      {step === 'extract' && valueCount > 0 ? (
        <div className="flow-next">
          <span className="action-hint">Structured values are available for source verification.</span>
          <button type="button" onClick={() => setStep('values')}>Review extracted values</button>
        </div>
      ) : null}
      {step === 'values' && validationCount > 0 ? (
        <div className="flow-next">
          <span className="action-hint">Deterministic validation results are available.</span>
          <button type="button" onClick={() => setStep('validation')}>Review validation</button>
        </div>
      ) : null}
    </section>
  );
}
