import { useState } from 'react';
import { storeLocalFile } from '../ingest/opfsFiles';
import { parseEfastCsv } from '../ingest/efast';
import { importEfastRows } from '../db/repository';

export function CsvImportPanel({ onImported }: { onImported: () => void }) {
  const [caseName, setCaseName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const importFile = async () => {
    if (!file || !caseName.trim()) return;
    setWorking(true);
    setStatus('Importing locally…');
    try {
      const stored = await storeLocalFile(file, 'csv');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(stored.bytes);
      const rows = parseEfastCsv(text);
      const importId = await importEfastRows(caseName.trim(), stored, rows);
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
          <p className="eyebrow">Step A</p>
          <h2>Import eFAST CSV</h2>
          <p className="panel-description">Creates or matches plans and plan years, preserves every raw row, and stores eFAST links as inert provenance text.</p>
        </div>
      </div>
      <div className="form-stack">
        <label>
          <span>Case name</span>
          <input value={caseName} onChange={(event) => setCaseName(event.target.value)} placeholder="Internal case label" autoComplete="off" />
        </label>
        <label>
          <span>Local eFAST export</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="panel-actions">
        <button type="button" onClick={importFile} disabled={!file || !caseName.trim() || working}>
          {working ? 'Importing…' : 'Import CSV'}
        </button>
        <span className="action-hint">No URL in the CSV is opened or fetched.</span>
      </div>
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
