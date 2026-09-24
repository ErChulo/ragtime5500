import { useEffect, useMemo, useState } from 'react';
import {
  createCase, createFiling, createPlan, createPlanYear,
  deleteCase, deleteFiling, deletePlan, deletePlanYear,
  listCases, listFilings, listPlans, listPlanYears,
  updateCase, updateFiling, updatePlan, updatePlanYear,
} from '../db/repository';

interface Row { [key: string]: unknown }
type Stage = 'case' | 'plan' | 'year' | 'filing' | 'done';

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function Progress({ stage }: { stage: Stage }) {
  const steps = [
    { id: 'case', label: 'Case' },
    { id: 'plan', label: 'Plan' },
    { id: 'year', label: 'Year' },
    { id: 'filing', label: 'Filing' },
  ] as const;
  const activeIndex = stage === 'done' ? steps.length : steps.findIndex((step) => step.id === stage);

  return (
    <ol className="context-progress" aria-label="Filing context progress">
      {steps.map((step, index) => (
        <li key={step.id} className={index < activeIndex ? 'complete' : index === activeIndex ? 'active' : ''}>
          <span>{index + 1}</span><strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

export function HierarchyPanel({
  refreshToken,
  onContinue,
}: {
  refreshToken: number;
  onContinue?: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [stage, setStage] = useState<Stage>('case');
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');

  const [cases, setCases] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [years, setYears] = useState<Row[]>([]);
  const [filings, setFilings] = useState<Row[]>([]);

  const [caseId, setCaseId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [planYearId, setPlanYearId] = useState<number | null>(null);
  const [filingId, setFilingId] = useState<number | null>(null);

  const [caseName, setCaseName] = useState('');
  const [caseNotes, setCaseNotes] = useState('');
  const [planName, setPlanName] = useState('');
  const [planNumber, setPlanNumber] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [periodBegin, setPeriodBegin] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [filingType, setFilingType] = useState('FORM_5500');
  const [filingDate, setFilingDate] = useState('');

  const selectedCase = useMemo(() => cases.find((row) => Number(row.case_id) === caseId) ?? null, [cases, caseId]);
  const selectedPlan = useMemo(() => plans.find((row) => Number(row.plan_id) === planId) ?? null, [plans, planId]);
  const selectedYear = useMemo(() => years.find((row) => Number(row.plan_year_id) === planYearId) ?? null, [years, planYearId]);
  const selectedFiling = useMemo(() => filings.find((row) => Number(row.filing_id) === filingId) ?? null, [filings, filingId]);

  useEffect(() => {
    let active = true;
    void listCases().then((rows) => {
      if (!active) return;
      setCases(rows);
      setCaseId((current) => current !== null && rows.some((row) => Number(row.case_id) === current)
        ? current
        : rows[0] ? Number(rows[0].case_id) : null);
      if (!rows.length) setCreating(true);
    });
    return () => { active = false; };
  }, [refreshToken, revision]);

  useEffect(() => {
    if (!selectedCase) return;
    setCaseName(String(selectedCase.case_name ?? ''));
    setCaseNotes(String(selectedCase.notes ?? ''));
  }, [selectedCase]);

  useEffect(() => {
    if (caseId === null) {
      setPlans([]); setPlanId(null); return;
    }
    let active = true;
    void listPlans(caseId).then((rows) => {
      if (!active) return;
      setPlans(rows);
      setPlanId((current) => current !== null && rows.some((row) => Number(row.plan_id) === current)
        ? current
        : rows[0] ? Number(rows[0].plan_id) : null);
    });
    return () => { active = false; };
  }, [caseId, refreshToken, revision]);

  useEffect(() => {
    if (!selectedPlan) return;
    setPlanName(String(selectedPlan.plan_name ?? ''));
    setPlanNumber(String(selectedPlan.plan_number ?? ''));
  }, [selectedPlan]);

  useEffect(() => {
    if (planId === null) {
      setYears([]); setPlanYearId(null); return;
    }
    let active = true;
    void listPlanYears(planId).then((rows) => {
      if (!active) return;
      setYears(rows);
      setPlanYearId((current) => current !== null && rows.some((row) => Number(row.plan_year_id) === current)
        ? current
        : rows[0] ? Number(rows[0].plan_year_id) : null);
    });
    return () => { active = false; };
  }, [planId, refreshToken, revision]);

  useEffect(() => {
    if (!selectedYear) return;
    setYear(Number(selectedYear.year));
    setPeriodBegin(String(selectedYear.period_begin ?? ''));
    setPeriodEnd(String(selectedYear.period_end ?? ''));
  }, [selectedYear]);

  useEffect(() => {
    if (planYearId === null) {
      setFilings([]); setFilingId(null); return;
    }
    let active = true;
    void listFilings(planYearId).then((rows) => {
      if (!active) return;
      setFilings(rows);
      setFilingId((current) => current !== null && rows.some((row) => Number(row.filing_id) === current)
        ? current
        : rows[0] ? Number(rows[0].filing_id) : null);
    });
    return () => { active = false; };
  }, [planYearId, refreshToken, revision]);

  useEffect(() => {
    if (!selectedFiling) return;
    setFilingType(String(selectedFiling.filing_type ?? 'FORM_5500'));
    setFilingDate(String(selectedFiling.filing_date ?? ''));
  }, [selectedFiling]);

  const commit = async (action: () => Promise<void>, message: string) => {
    try {
      await action();
      setStatus(message);
      setCreating(false);
      setRevision((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const newForStage = () => {
    setCreating(true);
    setStatus('');
    if (stage === 'case') { setCaseId(null); setCaseName(''); setCaseNotes(''); }
    if (stage === 'plan') { setPlanId(null); setPlanName(''); setPlanNumber(''); }
    if (stage === 'year') { setPlanYearId(null); setYear(new Date().getFullYear()); setPeriodBegin(''); setPeriodEnd(''); }
    if (stage === 'filing') { setFilingId(null); setFilingType('FORM_5500'); setFilingDate(''); }
  };

  return (
    <section className="panel guided-context">
      <div className="panel-heading guided-heading">
        <div>
          <p className="eyebrow">Start here</p>
          <h2>Choose the filing context</h2>
          <p className="panel-description">One decision at a time. Optional maintenance controls stay hidden until needed.</p>
        </div>
      </div>

      <Progress stage={stage} />

      {stage === 'case' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 1</span><h3>Case</h3></div>
            {cases.length ? <button className="button-tertiary" type="button" onClick={newForStage}>New case</button> : null}
          </div>
          {!creating && cases.length ? (
            <>
              <label>Choose case
                <select aria-label="Cases" value={caseId ?? ''} onChange={(event) => setCaseId(Number(event.target.value))}>
                  {cases.map((row) => <option key={String(row.case_id)} value={Number(row.case_id)}>{String(row.case_name)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button type="button" disabled={caseId === null} onClick={() => { setStage('plan'); setCreating(false); setStatus(''); }}>Continue</button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected case</summary>
                <div className="form-stack">
                  <label>Case name<input aria-label="Case name" value={caseName} onChange={(event) => setCaseName(event.target.value)} /></label>
                  <label>Notes<textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label>
                  <div className="button-row">
                    <button type="button" disabled={!caseName.trim()} onClick={() => void commit(() => updateCase(caseId!, caseName.trim(), nullable(caseNotes)), 'Case updated.')}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this case and all dependent records?') && void commit(() => deleteCase(caseId!), 'Case deleted.')}>Delete case</button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-stack">
              <label>Case name<input aria-label="Case name" autoFocus value={caseName} onChange={(event) => setCaseName(event.target.value)} placeholder="Internal case label" /></label>
              <details className="wizard-maintenance"><summary>Add notes</summary><label>Notes<textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label></details>
              <div className="wizard-actions">
                <button type="button" disabled={!caseName.trim()} onClick={() => void commit(async () => {
                  await createCase(caseName.trim(), nullable(caseNotes));
                  setStage('plan');
                }, 'Case created.')}>Create and continue</button>
                {cases.length ? <button className="button-secondary" type="button" onClick={() => { setCreating(false); setCaseId(Number(cases[0].case_id)); }}>Cancel</button> : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'plan' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 2</span><h3>Plan</h3></div>
            {plans.length ? <button className="button-tertiary" type="button" onClick={newForStage}>New plan</button> : null}
          </div>
          <div className="context-chip">{selectedCase ? String(selectedCase.case_name) : 'Selected case'}</div>
          {!creating && plans.length ? (
            <>
              <label>Choose plan
                <select aria-label="Plans" value={planId ?? ''} onChange={(event) => setPlanId(Number(event.target.value))}>
                  {plans.map((row) => <option key={String(row.plan_id)} value={Number(row.plan_id)}>{String(row.plan_name)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('case'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planId === null} onClick={() => { setStage('year'); setCreating(false); }}>Continue</button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected plan</summary>
                <div className="form-stack">
                  <label>Plan name<input aria-label="Plan name" value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
                  <label>Plan number<input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} /></label>
                  <div className="button-row">
                    <button type="button" disabled={!planName.trim()} onClick={() => void commit(() => updatePlan(planId!, planName.trim(), nullable(planNumber)), 'Plan updated.')}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this plan and all dependent records?') && void commit(() => deletePlan(planId!), 'Plan deleted.')}>Delete plan</button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-stack">
              <label>Plan name<input aria-label="Plan name" autoFocus value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
              <details className="wizard-maintenance"><summary>Add plan number</summary><label>Plan number<input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} /></label></details>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('case'); setCreating(false); }}>Back</button>
                <button type="button" disabled={caseId === null || !planName.trim()} onClick={() => void commit(async () => {
                  await createPlan(caseId!, planName.trim(), nullable(planNumber));
                  setStage('year');
                }, 'Plan created.')}>Create and continue</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'year' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 3</span><h3>Plan year</h3></div>
            {years.length ? <button className="button-tertiary" type="button" onClick={newForStage}>New year</button> : null}
          </div>
          <div className="context-chip">{selectedPlan ? String(selectedPlan.plan_name) : 'Selected plan'}</div>
          {!creating && years.length ? (
            <>
              <label>Choose year
                <select aria-label="Plan years" value={planYearId ?? ''} onChange={(event) => setPlanYearId(Number(event.target.value))}>
                  {years.map((row) => <option key={String(row.plan_year_id)} value={Number(row.plan_year_id)}>{String(row.year)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('plan'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planYearId === null} onClick={() => { setStage('filing'); setCreating(false); }}>Continue</button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected year</summary>
                <div className="form-stack">
                  <label>Plan year<input aria-label="Plan year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
                  <div className="two-field-row">
                    <label>Period begin<input aria-label="Period begin" type="date" value={periodBegin} onChange={(event) => setPeriodBegin(event.target.value)} /></label>
                    <label>Period end<input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => void commit(() => updatePlanYear(planYearId!, year, nullable(periodBegin), nullable(periodEnd)), 'Plan year updated.')}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this plan year and dependent filings?') && void commit(() => deletePlanYear(planYearId!), 'Plan year deleted.')}>Delete year</button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-stack">
              <label>Plan year<input aria-label="Plan year" autoFocus type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
              <details className="wizard-maintenance">
                <summary>Add period dates</summary>
                <div className="two-field-row">
                  <label>Period begin<input aria-label="Period begin" type="date" value={periodBegin} onChange={(event) => setPeriodBegin(event.target.value)} /></label>
                  <label>Period end<input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
                </div>
              </details>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('plan'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planId === null} onClick={() => void commit(async () => {
                  await createPlanYear(planId!, year, nullable(periodBegin), nullable(periodEnd));
                  setStage('filing');
                }, 'Plan year created.')}>Create and continue</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'filing' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 4</span><h3>Filing</h3></div>
            {filings.length ? <button className="button-tertiary" type="button" onClick={newForStage}>New filing</button> : null}
          </div>
          <div className="context-chip">{selectedYear ? String(selectedYear.year) : 'Selected year'}</div>
          {!creating && filings.length ? (
            <>
              <label>Choose filing
                <select aria-label="Filings" value={filingId ?? ''} onChange={(event) => setFilingId(Number(event.target.value))}>
                  {filings.map((row) => <option key={String(row.filing_id)} value={Number(row.filing_id)}>{String(row.filing_type)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('year'); setCreating(false); }}>Back</button>
                <button type="button" disabled={filingId === null} onClick={() => { setStage('done'); setCreating(false); }}>Use this filing</button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected filing</summary>
                <div className="form-stack">
                  <label>Filing type<input aria-label="Filing type" value={filingType} onChange={(event) => setFilingType(event.target.value)} /></label>
                  <label>Filing date<input aria-label="Filing date" type="date" value={filingDate} onChange={(event) => setFilingDate(event.target.value)} /></label>
                  <div className="button-row">
                    <button type="button" disabled={!filingType.trim()} onClick={() => void commit(() => updateFiling(filingId!, filingType.trim(), nullable(filingDate)), 'Filing updated.')}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this filing and dependent values?') && void commit(() => deleteFiling(filingId!), 'Filing deleted.')}>Delete filing</button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-stack">
              <label>Filing type<input aria-label="Filing type" value={filingType} onChange={(event) => setFilingType(event.target.value)} /></label>
              <details className="wizard-maintenance"><summary>Add filing date</summary><label>Filing date<input aria-label="Filing date" type="date" value={filingDate} onChange={(event) => setFilingDate(event.target.value)} /></label></details>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('year'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planYearId === null || !filingType.trim()} onClick={() => void commit(async () => {
                  await createFiling(planYearId!, filingType.trim(), nullable(filingDate));
                  setStage('done');
                }, 'Filing created.')}>Create filing</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'done' ? (
        <div className="wizard-card wizard-complete">
          <span className="wizard-complete-mark" aria-hidden="true">✓</span>
          <div>
            <p className="eyebrow">Context ready</p>
            <h3>{selectedCase ? String(selectedCase.case_name) : 'Case'} · {selectedYear ? String(selectedYear.year) : 'Year'}</h3>
            <p className="panel-description">Continue to import the eFAST CSV and local PDF evidence.</p>
          </div>
          <div className="wizard-actions">
            <button className="button-secondary" type="button" onClick={() => setStage('case')}>Change context</button>
            {onContinue ? <button type="button" onClick={onContinue}>Continue to import</button> : null}
          </div>
        </div>
      ) : null}

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
