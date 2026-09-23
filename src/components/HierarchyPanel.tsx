import { useEffect, useState } from 'react';
import {
  createCase, createFiling, createPlan, createPlanYear,
  deleteCase, deleteFiling, deletePlan, deletePlanYear,
  listCases, listFilings, listPlans, listPlanYears,
  updateCase, updateFiling, updatePlan, updatePlanYear,
} from '../db/repository';

interface Row { [key: string]: unknown }

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function HierarchyPanel({ refreshToken }: { refreshToken: number }) {
  const [revision, setRevision] = useState(0);
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
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void listCases().then((rows) => {
      if (!active) return;
      setCases(rows);
      setCaseId((current) => (
        current !== null && rows.some((row) => Number(row.case_id) === current)
          ? current
          : rows[0] ? Number(rows[0].case_id) : null
      ));
    });
    return () => { active = false; };
  }, [refreshToken, revision]);

  useEffect(() => {
    const selected = cases.find((row) => Number(row.case_id) === caseId);
    if (!selected) return;
    setCaseName(String(selected.case_name ?? ''));
    setCaseNotes(String(selected.notes ?? ''));
  }, [caseId, cases]);

  useEffect(() => {
    if (caseId === null) {
      setPlans([]);
      setPlanId(null);
      return;
    }
    let active = true;
    void listPlans(caseId).then((rows) => {
      if (!active) return;
      setPlans(rows);
      setPlanId((current) => (
        current !== null && rows.some((row) => Number(row.plan_id) === current)
          ? current
          : rows[0] ? Number(rows[0].plan_id) : null
      ));
    });
    return () => { active = false; };
  }, [caseId, refreshToken, revision]);

  useEffect(() => {
    const selected = plans.find((row) => Number(row.plan_id) === planId);
    if (!selected) return;
    setPlanName(String(selected.plan_name ?? ''));
    setPlanNumber(String(selected.plan_number ?? ''));
  }, [planId, plans]);

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
      setPlanYearId((current) => (
        current !== null && rows.some((row) => Number(row.plan_year_id) === current)
          ? current
          : rows[0] ? Number(rows[0].plan_year_id) : null
      ));
    });
    return () => { active = false; };
  }, [planId, refreshToken, revision]);

  useEffect(() => {
    const selected = years.find((row) => Number(row.plan_year_id) === planYearId);
    if (!selected) return;
    setYear(Number(selected.year));
    setPeriodBegin(String(selected.period_begin ?? ''));
    setPeriodEnd(String(selected.period_end ?? ''));
  }, [planYearId, years]);

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
      setFilingId((current) => (
        current !== null && rows.some((row) => Number(row.filing_id) === current)
          ? current
          : rows[0] ? Number(rows[0].filing_id) : null
      ));
    });
    return () => { active = false; };
  }, [planYearId, refreshToken, revision]);

  useEffect(() => {
    const selected = filings.find((row) => Number(row.filing_id) === filingId);
    if (!selected) return;
    setFilingType(String(selected.filing_type ?? 'FORM_5500'));
    setFilingDate(String(selected.filing_date ?? ''));
  }, [filingId, filings]);

  const guarded = async (action: () => Promise<void>, message = 'Saved.') => {
    try {
      await action();
      setStatus(message);
      setRevision((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const clearCaseDraft = () => {
    setCaseId(null);
    setCaseName('');
    setCaseNotes('');
  };

  const clearPlanDraft = () => {
    setPlanId(null);
    setPlanName('');
    setPlanNumber('');
  };

  const clearYearDraft = () => {
    setPlanYearId(null);
    setYear(new Date().getFullYear());
    setPeriodBegin('');
    setPeriodEnd('');
  };

  const clearFilingDraft = () => {
    setFilingId(null);
    setFilingType('FORM_5500');
    setFilingDate('');
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Authoritative hierarchy</p>
          <h2>Case / Plan / Year / Filing</h2>
          <p className="panel-description">
            Select a record to edit it, or clear an editor to create a new record. Manual changes are written to the audit history.
          </p>
        </div>
      </div>

      <div className="hierarchy-columns">
        <div className="hierarchy-column">
          <div className="column-heading">
            <h3>Cases</h3>
            <button className="button-tertiary" type="button" onClick={clearCaseDraft}>New</button>
          </div>
          <select aria-label="Cases" size={6} value={caseId ?? ''} onChange={(event) => setCaseId(Number(event.target.value))}>
            {cases.map((row) => <option key={String(row.case_id)} value={Number(row.case_id)}>{String(row.case_name)}</option>)}
          </select>
          <label>Case name<input value={caseName} onChange={(event) => setCaseName(event.target.value)} /></label>
          <label>Notes<textarea rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} /></label>
          <div className="button-row">
            {caseId === null
              ? <button type="button" disabled={!caseName.trim()} onClick={() => guarded(() => createCase(caseName.trim(), nullable(caseNotes)), 'Case created.')}>Create case</button>
              : <>
                <button type="button" disabled={!caseName.trim()} onClick={() => guarded(() => updateCase(caseId, caseName.trim(), nullable(caseNotes)), 'Case updated.')}>Save</button>
                <button className="danger" type="button" onClick={() => confirm('Delete this case and all dependent plans, years, filings, and values?') && void guarded(() => deleteCase(caseId), 'Case deleted.')}>Delete</button>
              </>}
          </div>
        </div>

        <div className="hierarchy-column">
          <div className="column-heading">
            <h3>Plans</h3>
            <button className="button-tertiary" type="button" disabled={caseId === null} onClick={clearPlanDraft}>New</button>
          </div>
          <select aria-label="Plans" size={6} value={planId ?? ''} onChange={(event) => setPlanId(Number(event.target.value))}>
            {plans.map((row) => <option key={String(row.plan_id)} value={Number(row.plan_id)}>{String(row.plan_number ?? '')} — {String(row.plan_name)}</option>)}
          </select>
          <label>Plan name<input value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>
          <label>Plan number<input value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} /></label>
          <div className="button-row">
            {planId === null
              ? <button type="button" disabled={caseId === null || !planName.trim()} onClick={() => guarded(() => createPlan(caseId!, planName.trim(), nullable(planNumber)), 'Plan created.')}>Create plan</button>
              : <>
                <button type="button" disabled={!planName.trim()} onClick={() => guarded(() => updatePlan(planId, planName.trim(), nullable(planNumber)), 'Plan updated.')}>Save</button>
                <button className="danger" type="button" onClick={() => confirm('Delete this plan and all dependent years and filings?') && void guarded(() => deletePlan(planId), 'Plan deleted.')}>Delete</button>
              </>}
          </div>
        </div>

        <div className="hierarchy-column">
          <div className="column-heading">
            <h3>Plan years</h3>
            <button className="button-tertiary" type="button" disabled={planId === null} onClick={clearYearDraft}>New</button>
          </div>
          <select aria-label="Plan years" size={6} value={planYearId ?? ''} onChange={(event) => setPlanYearId(Number(event.target.value))}>
            {years.map((row) => <option key={String(row.plan_year_id)} value={Number(row.plan_year_id)}>{String(row.year)}</option>)}
          </select>
          <label>Plan year<input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
          <label>Period begin<input type="date" value={periodBegin} onChange={(event) => setPeriodBegin(event.target.value)} /></label>
          <label>Period end<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <div className="button-row">
            {planYearId === null
              ? <button type="button" disabled={planId === null} onClick={() => guarded(() => createPlanYear(planId!, year, nullable(periodBegin), nullable(periodEnd)), 'Plan year created.')}>Create year</button>
              : <>
                <button type="button" onClick={() => guarded(() => updatePlanYear(planYearId, year, nullable(periodBegin), nullable(periodEnd)), 'Plan year updated.')}>Save</button>
                <button className="danger" type="button" onClick={() => confirm('Delete this plan year and all dependent filings?') && void guarded(() => deletePlanYear(planYearId), 'Plan year deleted.')}>Delete</button>
              </>}
          </div>
        </div>

        <div className="hierarchy-column">
          <div className="column-heading">
            <h3>Filings</h3>
            <button className="button-tertiary" type="button" disabled={planYearId === null} onClick={clearFilingDraft}>New</button>
          </div>
          <div className="filing-list" role="listbox" aria-label="Filings">
            {filings.map((row) => <button
              type="button"
              className={`list-row${Number(row.filing_id) === filingId ? ' selected' : ''}`}
              key={String(row.filing_id)}
              onClick={() => setFilingId(Number(row.filing_id))}
            >
              <span>{String(row.filing_type)} {String(row.filing_date ?? '')}</span>
              <span className="data-badge">{String(row.filing_status)}</span>
            </button>)}
          </div>
          <label>Filing type<input value={filingType} onChange={(event) => setFilingType(event.target.value)} /></label>
          <label>Filing date<input type="date" value={filingDate} onChange={(event) => setFilingDate(event.target.value)} /></label>
          <div className="button-row">
            {filingId === null
              ? <button type="button" disabled={planYearId === null || !filingType.trim()} onClick={() => guarded(() => createFiling(planYearId!, filingType.trim(), nullable(filingDate)), 'Filing created.')}>Create filing</button>
              : <>
                <button type="button" disabled={!filingType.trim()} onClick={() => guarded(() => updateFiling(filingId, filingType.trim(), nullable(filingDate)), 'Filing updated.')}>Save</button>
                <button className="danger" type="button" onClick={() => confirm('Delete the selected filing and its extracted values?') && void guarded(() => deleteFiling(filingId), 'Filing deleted.')}>Delete</button>
              </>}
          </div>
        </div>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
