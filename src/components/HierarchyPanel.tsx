import { useEffect, useMemo, useState } from 'react';
import {
  createCaseContext,
  deleteCase,
  ensureCasePlan,
  listCases,
  updateCaseContext,
} from '../db/repository';

interface Row { [key: string]: unknown }

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function rememberActiveCase(row: Row): void {
  try {
    sessionStorage.setItem('ragtime-active-case-id', String(row.case_id));
    sessionStorage.setItem('ragtime-active-case-name', String(row.case_name));
  } catch {
    // Session guidance only; SQLite remains authoritative.
  }
}

export function HierarchyPanel({
  refreshToken,
  onContinue,
}: {
  refreshToken: number;
  onContinue?: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const [cases, setCases] = useState<Row[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseName, setCaseName] = useState('');
  const [planNumber, setPlanNumber] = useState('');
  const [caseNotes, setCaseNotes] = useState('');

  const selectedCase = useMemo(
    () => cases.find((row) => Number(row.case_id) === caseId) ?? null,
    [cases, caseId],
  );

  useEffect(() => {
    let active = true;
    void listCases().then((rows) => {
      if (!active) return;
      setCases(rows);

      let rememberedId: number | null = null;
      try {
        const raw = sessionStorage.getItem('ragtime-active-case-id');
        rememberedId = raw ? Number(raw) : null;
      } catch {
        rememberedId = null;
      }

      const next = rememberedId !== null && rows.some((row) => Number(row.case_id) === rememberedId)
        ? rememberedId
        : rows[0] ? Number(rows[0].case_id) : null;

      setCaseId(next);
      if (!rows.length) setCreating(true);
    });

    return () => { active = false; };
  }, [refreshToken, revision]);

  useEffect(() => {
    if (!selectedCase) return;
    setCaseName(String(selectedCase.case_name ?? ''));
    setPlanNumber(String(selectedCase.plan_number ?? ''));
    setCaseNotes(String(selectedCase.notes ?? ''));
    rememberActiveCase(selectedCase);
  }, [selectedCase]);

  const fail = (error: unknown) => setStatus(error instanceof Error ? error.message : String(error));

  const continueCase = async () => {
    if (!selectedCase) return;
    setWorking(true);
    setStatus('');
    try {
      await ensureCasePlan(Number(selectedCase.case_id));
      rememberActiveCase(selectedCase);
      onContinue?.();
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
      rememberActiveCase(created);
      setCreating(false);
      setStatus('Case created.');
      setRevision((value) => value + 1);
      onContinue?.();
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

  return (
    <section className="panel guided-context">
      <div className="panel-heading guided-heading">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Choose the case</h2>
          <p className="panel-description">
            In Ragtime, the case is the pension plan. The eFAST CSV will create the plan years and expected filings automatically.
          </p>
        </div>
      </div>

      <div className="single-step-marker" aria-label="Current setup step">
        <span>1</span>
        <strong>Case</strong>
        <em>Next: import eFAST CSV</em>
      </div>

      <div className="wizard-card">
        {!creating && cases.length ? (
          <>
            <label>Case
              <select
                aria-label="Cases"
                value={caseId ?? ''}
                onChange={(event) => setCaseId(Number(event.target.value))}
              >
                {cases.map((row) => (
                  <option key={String(row.case_id)} value={Number(row.case_id)}>
                    {String(row.case_name)}
                  </option>
                ))}
              </select>
            </label>

            <div className="wizard-actions">
              <button type="button" disabled={!selectedCase || working} onClick={() => void continueCase()}>
                {working ? 'Opening…' : 'Use this case → import files'}
              </button>
            </div>

            <details className="wizard-maintenance">
              <summary>Manage selected case</summary>
              <div className="form-stack">
                <label>Case name
                  <input aria-label="Case name" value={caseName} onChange={(event) => setCaseName(event.target.value)} />
                </label>
                <label>Plan number (PN)
                  <input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} />
                </label>
                <label>Notes
                  <textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} />
                </label>
                <div className="button-row">
                  <button type="button" disabled={!caseName.trim() || working} onClick={() => void updateCase()}>
                    Save changes
                  </button>
                  <button
                    className="danger"
                    type="button"
                    disabled={working}
                    onClick={() => confirm('Delete this case and all dependent records?') && void (async () => {
                      try {
                        await deleteCase(caseId!);
                        setStatus('Case deleted.');
                        setRevision((value) => value + 1);
                      } catch (error) {
                        fail(error);
                      }
                    })()}
                  >
                    Delete case
                  </button>
                </div>
              </div>
            </details>

            <button
              className="button-tertiary new-case-link"
              type="button"
              onClick={() => {
                setCreating(true);
                setCaseId(null);
                setCaseName('');
                setPlanNumber('');
                setCaseNotes('');
                setStatus('');
              }}
            >
              Create another case
            </button>
          </>
        ) : (
          <div className="form-stack">
            <label>Case name
              <input
                aria-label="Case name"
                autoFocus
                value={caseName}
                onChange={(event) => setCaseName(event.target.value)}
                placeholder="Pension plan / case name"
              />
            </label>

            <details className="wizard-maintenance">
              <summary>Add plan number or notes</summary>
              <div className="form-stack">
                <label>Plan number (PN)
                  <input aria-label="Plan number" value={planNumber} onChange={(event) => setPlanNumber(event.target.value)} />
                </label>
                <label>Notes
                  <textarea aria-label="Case notes" rows={3} value={caseNotes} onChange={(event) => setCaseNotes(event.target.value)} />
                </label>
              </div>
            </details>

            <div className="wizard-actions">
              <button type="button" disabled={!caseName.trim() || working} onClick={() => void createCase()}>
                {working ? 'Creating…' : 'Create case → import files'}
              </button>
              {cases.length ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={working}
                  onClick={() => {
                    setCreating(false);
                    setCaseId(Number(cases[0].case_id));
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
