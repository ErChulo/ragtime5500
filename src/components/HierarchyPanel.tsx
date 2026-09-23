import { useEffect, useState } from 'react';
import {
  createCase, createFiling, createPlan, createPlanYear,
  deleteFiling, deletePlan, deletePlanYear,
  listCases, listFilings, listPlans, listPlanYears,
  updateFiling, updatePlan, updatePlanYear,
} from '../db/repository';

interface Row { [key: string]: unknown }

export function HierarchyPanel({ refreshToken }: { refreshToken: number }) {
  const [cases, setCases] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [years, setYears] = useState<Row[]>([]);
  const [filings, setFilings] = useState<Row[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [planYearId, setPlanYearId] = useState<number | null>(null);
  const [filingId, setFilingId] = useState<number | null>(null);
  const [caseName, setCaseName] = useState('');
  const [planName, setPlanName] = useState('');
  const [planNumber, setPlanNumber] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [filingType, setFilingType] = useState('FORM_5500');
  const [filingDate, setFilingDate] = useState('');
  const [status, setStatus] = useState('');

  const loadCases = async () => {
    const rows = await listCases();
    setCases(rows);
    if (caseId === null && rows[0]) setCaseId(Number(rows[0].case_id));
  };

  useEffect(() => { void loadCases(); }, [refreshToken]);
  useEffect(() => {
    if (caseId === null) { setPlans([]); setPlanId(null); return; }
    listPlans(caseId).then((rows) => {
      setPlans(rows);
      if (!rows.some((row) => Number(row.plan_id) === planId)) setPlanId(rows[0] ? Number(rows[0].plan_id) : null);
    });
  }, [caseId, refreshToken]);
  useEffect(() => {
    if (planId === null) { setYears([]); setPlanYearId(null); return; }
    listPlanYears(planId).then((rows) => {
      setYears(rows);
      if (!rows.some((row) => Number(row.plan_year_id) === planYearId)) setPlanYearId(rows[0] ? Number(rows[0].plan_year_id) : null);
    });
  }, [planId, refreshToken]);
  useEffect(() => {
    if (planYearId === null) { setFilings([]); setFilingId(null); return; }
    void listFilings(planYearId).then((rows) => {
      setFilings(rows);
      if (!rows.some((row) => Number(row.filing_id) === filingId)) {
        setFilingId(rows[0] ? Number(rows[0].filing_id) : null);
      }
    });
  }, [planYearId, refreshToken]);

  const guarded = async (action: () => Promise<void>) => {
    try { await action(); setStatus('Saved.'); await loadCases(); }
    catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Case hierarchy</p>
          <h2>Case / Plan / Year / Filing</h2>
          <p className="panel-description">Navigate the authoritative hierarchy or add records manually when an import has not created them yet.</p>
        </div>
      </div>
      <div className="hierarchy-columns">
        <div className="hierarchy-column">
          <h3>Cases</h3>
          <select aria-label="Cases" size={6} value={caseId ?? ''} onChange={(e) => setCaseId(Number(e.target.value))}>
            {cases.map((row) => <option key={String(row.case_id)} value={Number(row.case_id)}>{String(row.case_name)}</option>)}
          </select>
          <input aria-label="New case name" placeholder="New case name" value={caseName} onChange={(e) => setCaseName(e.target.value)} />
          <button type="button" onClick={() => guarded(() => createCase(caseName.trim()))} disabled={!caseName.trim()}>Add case</button>
        </div>

        <div className="hierarchy-column">
          <h3>Plans</h3>
          <select aria-label="Plans" size={6} value={planId ?? ''} onChange={(e) => setPlanId(Number(e.target.value))}>
            {plans.map((row) => <option key={String(row.plan_id)} value={Number(row.plan_id)}>{String(row.plan_number ?? '')} — {String(row.plan_name)}</option>)}
          </select>
          <input aria-label="Plan name" placeholder="Plan name" value={planName} onChange={(e) => setPlanName(e.target.value)} />
          <input aria-label="Plan number" placeholder="Plan number" value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} />
          <div className="button-row">
            <button type="button" disabled={caseId === null || !planName.trim()} onClick={() => guarded(() => createPlan(caseId!, planName.trim(), planNumber.trim() || null))}>Add</button>
            <button type="button" disabled={planId === null || !planName.trim()} onClick={() => guarded(() => updatePlan(planId!, planName.trim(), planNumber.trim() || null))}>Update</button>
            <button className="danger" type="button" disabled={planId === null} onClick={() => planId !== null && confirm('Delete this plan and dependent records?') && guarded(() => deletePlan(planId))}>Delete</button>
          </div>
        </div>

        <div className="hierarchy-column">
          <h3>Plan years</h3>
          <select aria-label="Plan years" size={6} value={planYearId ?? ''} onChange={(e) => setPlanYearId(Number(e.target.value))}>
            {years.map((row) => <option key={String(row.plan_year_id)} value={Number(row.plan_year_id)}>{String(row.year)}</option>)}
          </select>
          <input aria-label="Plan year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <div className="button-row">
            <button type="button" disabled={planId === null} onClick={() => guarded(() => createPlanYear(planId!, year, null, null))}>Add</button>
            <button type="button" disabled={planYearId === null} onClick={() => guarded(() => updatePlanYear(planYearId!, year, null, null))}>Update</button>
            <button className="danger" type="button" disabled={planYearId === null} onClick={() => planYearId !== null && confirm('Delete this plan year and dependent filings?') && guarded(() => deletePlanYear(planYearId))}>Delete</button>
          </div>
        </div>

        <div className="hierarchy-column">
          <h3>Filings</h3>
          <div className="filing-list">
            {filings.map((row) => <button type="button" className={`list-row${Number(row.filing_id) === filingId ? ' selected' : ''}`} key={String(row.filing_id)} onClick={() => {
              setFilingId(Number(row.filing_id));
              setFilingType(String(row.filing_type));
              setFilingDate(String(row.filing_date ?? ''));
            }}>{String(row.filing_type)} {String(row.filing_date ?? '')} [{String(row.filing_status)}]</button>)}
          </div>
          <input aria-label="Filing type" value={filingType} onChange={(e) => setFilingType(e.target.value)} />
          <input aria-label="Filing date" type="date" value={filingDate} onChange={(e) => setFilingDate(e.target.value)} />
          <div className="button-row">
            <button type="button" disabled={planYearId === null} onClick={() => guarded(() => createFiling(planYearId!, filingType.trim(), filingDate || null))}>Add</button>
            {filingId !== null ? <>
              <button type="button" onClick={() => guarded(() => updateFiling(filingId, filingType.trim(), filingDate || null))}>Update selected</button>
              <button className="danger" type="button" onClick={() => confirm('Delete the selected filing?') && guarded(() => deleteFiling(filingId))}>Delete selected</button>
            </> : null}
          </div>
        </div>
      </div>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
