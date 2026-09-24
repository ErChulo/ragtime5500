import { useEffect, useMemo, useState } from 'react';
import {
  createCaseContext,
  createFiling,
  createPlanYear,
  deleteCase,
  deleteFiling,
  deletePlanYear,
  ensureCasePlan,
  listCases,
  listFilings,
  listPlanYears,
  updateCaseContext,
  updateFiling,
  updatePlanYear,
} from '../db/repository';

interface Row { [key: string]: unknown }
type Stage = 'case' | 'year' | 'filing' | 'done';

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function Progress({ stage }: { stage: Stage }) {
  const steps = [
    { id: 'case', label: 'Case' },
    { id: 'year', label: 'Plan year' },
    { id: 'filing', label: 'Filing' },
  ] as const;
  const activeIndex = stage === 'done' ? steps.length : steps.findIndex((step) => step.id === stage);

  return (
    <ol className="context-progress context-progress-three" aria-label="Filing context progress">
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
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const [cases, setCases] = useState<Row[]>([]);
  const [years, setYears] = useState<Row[]>([]);
  const [filings, setFilings] = useState<Row[]>([]);

  const [caseId, setCaseId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [planYearId, setPlanYearId] = useState<number | null>(null);
  const [filingId, setFilingId] = useState<number | null>(null);

  const [caseName, setCaseName] = useState('');
  const [planNumber, setPlanNumber] = useState('');
  const [caseNotes, setCaseNotes] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [periodBegin, setPeriodBegin] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [filingType, setFilingType] = useState('FORM_5500');
  const [filingDate, setFilingDate] = useState('');

  const selectedCase = useMemo(() => cases.find((row) => Number(row.case_id) === caseId) ?? null, [cases, caseId]);
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
    setPlanNumber(String(selectedCase.plan_number ?? ''));
    setCaseNotes(String(selectedCase.notes ?? ''));
    setPlanId(selectedCase.plan_id == null ? null : Number(selectedCase.plan_id));
  }, [selectedCase]);

  useEffect(() => {
    if (planId === null) {
      setYears([]);
      setPlanYearId(null);
      return;
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
      setFilings([]);
      setFilingId(null);
      return;
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

  const fail = (error: unknown) => setStatus(error instanceof Error ? error.message : String(error));

  const continueCase = async () => {
    if (caseId === null) return;
    setWorking(true);
    setStatus('');
    try {
      const resolvedPlanId = await ensureCasePlan(caseId);
      setPlanId(resolvedPlanId);
      setStage('year');
      setCreating(false);
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  };

  const createCase = async () => {
    if (!caseName.trim()) return;
    setWorking(true);
    setStatus('Creating case…');
    try {
      const name = caseName.trim();
      await createCaseContext(name, nullable(planNumber), nullable(caseNotes));
      const rows = await listCases();
      const created = rows.find((row) => String(row.case_name) === name);
      if (!created) throw new Error('Case was created but could not be reopened.');
      setCases(rows);
      setCaseId(Number(created.case_id));
      setPlanId(Number(created.plan_id));
      setCreating(false);
      setStage('year');
      setStatus('Case created.');
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  };

  const updateCase = async () => {
    if (caseId === null || !caseName.trim()) return;
    setWorking(true);
    try {
      await updateCaseContext(caseId, caseName.trim(), nullable(planNumber), nullable(caseNotes));
      setStatus('Case updated.');
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  };

  const createYear = async () => {
    if (planId === null) return;
    setWorking(true);
    try {
      await createPlanYear(planId, year, nullable(periodBegin), nullable(periodEnd));
      setStatus('Plan year created.');
      setCreating(false);
      setStage('filing');
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  };

  const createNewFiling = async () => {
    if (planYearId === null || !filingType.trim()) return;
    setWorking(true);
    try {
      await createFiling(planYearId, filingType.trim(), nullable(filingDate));
      setStatus('Filing created.');
      setCreating(false);
      setStage('done');
      setRevision((value) => value + 1);
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel guided-context">
      <div className="panel-heading guided-heading">
        <div>
          <p className="eyebrow">Start here</p>
          <h2>Choose the filing context</h2>
          <p className="panel-description">In Ragtime, one case is one pension plan. Choose the case, then the plan year, then the filing.</p>
        </div>
      </div>

      <Progress stage={stage} />

      {stage === 'case' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 1</span><h3>Case</h3></div>
            {cases.length ? <button className="button-tertiary" type="button" onClick={() => {
              setCreating(true); setCaseId(null); setCaseName(''); setPlanNumber(''); setCaseNotes(''); setStatus('');
            }}>New case</button> : null}
          </div>

          {!creating && cases.length ? (
            <>
              <label>Choose case
                <select aria-label="Cases" value={caseId ?? ''} onChange={(event) => setCaseId(Number(event.target.value))}>
                  {cases.map((row) => <option key={String(row.case_id)} value={Number(row.case_id)}>{String(row.case_name)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button type="button" disabled={caseId === null || working} onClick={() => void continueCase()}>
                  {working ? 'Opening…' : 'Continue'}
                </button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected case</summary>
                <div className="form-stack">
                  <label>Case name<input aria-label="Case name" value={caseName} onChange={(event) => setCaseName(event.target.value)} /></label>
                  <label>Plan number (PN)<input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} /></label>
                  <label>Notes<textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label>
                  <div className="button-row">
                    <button type="button" disabled={!caseName.trim() || working} onClick={() => void updateCase()}>Save changes</button>
                    <button className="danger" type="button" disabled={working} onClick={() => confirm('Delete this case and all dependent records?') && void (async () => {
                      try {
                        await deleteCase(caseId!);
                        setStatus('Case deleted.');
                        setStage('case');
                        setRevision((value) => value + 1);
                      } catch (error) { fail(error); }
                    })()}>Delete case</button>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-stack">
              <label>Case name<input aria-label="Case name" autoFocus value={caseName} onChange={(event) => setCaseName(event.target.value)} placeholder="Case / pension plan name" /></label>
              <details className="wizard-maintenance">
                <summary>Add plan number or notes</summary>
                <div className="form-stack">
                  <label>Plan number (PN)<input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} /></label>
                  <label>Notes<textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label>
                </div>
              </details>
              <div className="wizard-actions">
                <button type="button" disabled={!caseName.trim() || working} onClick={() => void createCase()}>
                  {working ? 'Creating…' : 'Create case and continue'}
                </button>
                {cases.length ? <button className="button-secondary" type="button" disabled={working} onClick={() => {
                  setCreating(false); setCaseId(Number(cases[0].case_id));
                }}>Cancel</button> : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'year' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 2</span><h3>Plan year</h3></div>
            {years.length ? <button className="button-tertiary" type="button" onClick={() => {
              setCreating(true); setPlanYearId(null); setYear(new Date().getFullYear()); setPeriodBegin(''); setPeriodEnd('');
            }}>New year</button> : null}
          </div>
          <div className="context-chip">{selectedCase ? String(selectedCase.case_name) : 'Selected case'}</div>

          {!creating && years.length ? (
            <>
              <label>Choose plan year
                <select aria-label="Plan years" value={planYearId ?? ''} onChange={(event) => setPlanYearId(Number(event.target.value))}>
                  {years.map((row) => <option key={String(row.plan_year_id)} value={Number(row.plan_year_id)}>{String(row.year)}</option>)}
                </select>
              </label>
              <div className="wizard-actions">
                <button className="button-secondary" type="button" onClick={() => { setStage('case'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planYearId === null} onClick={() => { setStage('filing'); setCreating(false); }}>Continue</button>
              </div>
              <details className="wizard-maintenance">
                <summary>Manage selected plan year</summary>
                <div className="form-stack">
                  <label>Plan year<input aria-label="Plan year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
                  <div className="two-field-row">
                    <label>Period begin<input aria-label="Period begin" type="date" value={periodBegin} onChange={(event) => setPeriodBegin(event.target.value)} /></label>
                    <label>Period end<input aria-label="Period end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => void (async () => {
                      try {
                        await updatePlanYear(planYearId!, year, nullable(periodBegin), nullable(periodEnd));
                        setStatus('Plan year updated.');
                        setRevision((value) => value + 1);
                      } catch (error) { fail(error); }
                    })()}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this plan year and dependent filings?') && void (async () => {
                      try {
                        await deletePlanYear(planYearId!);
                        setStatus('Plan year deleted.');
                        setRevision((value) => value + 1);
                      } catch (error) { fail(error); }
                    })()}>Delete year</button>
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
                <button className="button-secondary" type="button" onClick={() => { setStage('case'); setCreating(false); }}>Back</button>
                <button type="button" disabled={planId === null || working} onClick={() => void createYear()}>
                  {working ? 'Creating…' : 'Create year and continue'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {stage === 'filing' ? (
        <div className="wizard-card">
          <div className="wizard-card-heading">
            <div><span className="wizard-kicker">Step 3</span><h3>Filing</h3></div>
            {filings.length ? <button className="button-tertiary" type="button" onClick={() => {
              setCreating(true); setFilingId(null); setFilingType('FORM_5500'); setFilingDate('');
            }}>New filing</button> : null}
          </div>
          <div className="context-chip">{selectedCase ? String(selectedCase.case_name) : 'Case'} · {selectedYear ? String(selectedYear.year) : 'Year'}</div>

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
                    <button type="button" onClick={() => void (async () => {
                      try {
                        await updateFiling(filingId!, filingType.trim(), nullable(filingDate));
                        setStatus('Filing updated.');
                        setRevision((value) => value + 1);
                      } catch (error) { fail(error); }
                    })()}>Save changes</button>
                    <button className="danger" type="button" onClick={() => confirm('Delete this filing and dependent values?') && void (async () => {
                      try {
                        await deleteFiling(filingId!);
                        setStatus('Filing deleted.');
                        setRevision((value) => value + 1);
                      } catch (error) { fail(error); }
                    })()}>Delete filing</button>
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
                <button type="button" disabled={planYearId === null || !filingType.trim() || working} onClick={() => void createNewFiling()}>
                  {working ? 'Creating…' : 'Create filing'}
                </button>
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
