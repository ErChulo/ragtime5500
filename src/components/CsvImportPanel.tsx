import { useEffect, useMemo, useState } from 'react';
import { storeLocalFile } from '../ingest/opfsFiles';
import { parseEfastCsv } from '../ingest/efast';
import { importEfastRows, listCases } from '../db/repository';

interface Row { [key: string]: unknown }

export function CsvImportPanel({ onImported }: { onImported: () => void }) {
  const [cases, setCases] = useState<Row[]>([]);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

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
    });
    return () => { active = false; };
  }, []);

  const selectedCase = useMemo(
    () => cases.find((row) => Number(row.case_id) === caseId) ?? null,
    [cases, caseId],
  );

  const importFile = async () => {
    if (!file || !selectedCase) return;
    setWorking(true);
    setStatus('Importing locally…');
    try {
      const stored = await storeLocalFile(file, 'csv');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(stored.bytes);
      const rows = parseEfastCsv(text);
      const importId = await importEfastRows(String(selectedCase.case_name), stored, rows);
      setStatus(`Imported ${rows.length} raw rows. eFAST import ID ${importId}.`);
      onImported();
    } catch (error) {
      setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Import the eFAST CSV</h2>
          <p className="panel-description">
            Ragtime will create the plan years and expected filing records for this case from the CSV.
          </p>
        </div>
      </div>

      {selectedCase ? (
        <div className="import-target">
          <span>Import into case</span>
          <strong>{String(selectedCase.case_name)}</strong>
        </div>
      ) : null}

      {cases.length > 1 ? (
        <label className="compact-selector">
          <span>Change case</span>
          <select value={caseId ?? ''} onChange={(event) => setCaseId(Number(event.target.value))}>
            {cases.map((row) => (
              <option key={String(row.case_id)} value={Number(row.case_id)}>
                {String(row.case_name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="form-stack">
        <label>
          <span>Local eFAST export</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>

      <div className="panel-actions">
        <button type="button" onClick={() => void importFile()} disabled={!file || !selectedCase || working}>
          {working ? 'Importing…' : 'Import CSV → continue to PDFs'}
        </button>
      </div>

      <p className="action-hint">The eFAST URL column is stored as provenance text only. Ragtime never opens or fetches it.</p>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
