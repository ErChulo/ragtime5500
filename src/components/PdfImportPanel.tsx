import { useState } from 'react';
import { storeLocalFile } from '../ingest/opfsFiles';
import { extractScheduleH1c9 } from '../pdf/scheduleH1c9';
import { chooseMatch, inferDocumentSignals } from '../matching/matchPdf';
import {
  ensureSourceDocument,
  getFilingContext,
  listDocumentMatches,
  listMatchableRows,
  saveExtractedValues,
  savePdfImport,
} from '../db/repository';

interface ImportedResult {
  filename: string;
  status: string;
  detail: string;
}

export function PdfImportPanel({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportedResult[]>([]);
  const [working, setWorking] = useState(false);

  const importFiles = async () => {
    setWorking(true);
    const next: ImportedResult[] = [];
    try {
      for (const file of files) {
        try {
          const stored = await storeLocalFile(file, 'pdf');
          const sourceDocumentId = await ensureSourceDocument(stored, 'pdf');
          const { extractPdfPages } = await import('../pdf/extractText');
          const pages = await extractPdfPages(stored.bytes);
          const signals = inferDocumentSignals(file.name, pages);
          const matchable = await listMatchableRows();
          const match = chooseMatch(signals, matchable);
          const saved = await savePdfImport(sourceDocumentId, pages, match);

          let detail = `Match: ${saved.matchStatus}.`;
          if (saved.filingId !== null) {
            const context = await getFilingContext(saved.filingId);
            const extracted = extractScheduleH1c9(pages);
            if (context.planYear === 2024 && extracted.length === 2) {
              await saveExtractedValues(saved.filingId, context.planYear, extracted);
              detail += ` Extracted H/I/1C9 BOY=${extracted[0].normalizedNumber.toLocaleString()} and EOY=${extracted[1].normalizedNumber.toLocaleString()} from page ${extracted[0].sourcePage}.`;
            } else if (context.planYear === 2024) {
              detail += ' H/I/1C9 requires extraction review; no values were inferred.';
            }
          }
          next.push({ filename: file.name, status: saved.matchStatus, detail });
        } catch (error) {
          next.push({ filename: file.name, status: 'ERROR', detail: error instanceof Error ? error.message : String(error) });
        }
      }
      setResults(next);
      await listDocumentMatches();
      onImported();
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Step B</p>
          <h2>Import local Form 5500 PDFs</h2>
          <p className="panel-description">Hashes, stores, parses, and matches PDFs entirely in-browser. Ambiguous matches remain in the review queue.</p>
        </div>
      </div>
      <label>
        <span>PDF files</span>
        <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
      </label>
      <div className="panel-actions">
        <button type="button" onClick={importFiles} disabled={!files.length || working}>
          {working ? 'Processing locally…' : files.length ? `Import ${files.length} PDF${files.length === 1 ? '' : 's'}` : 'Select PDFs to continue'}
        </button>
        <span className="action-hint">{files.length ? `${files.length} local file${files.length === 1 ? '' : 's'} selected.` : 'No files selected.'}</span>
      </div>
      {results.length ? (
        <div className="table-wrap import-results">
          <table>
            <thead><tr><th>PDF</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>{results.map((result) => <tr key={result.filename}>
              <td>{result.filename}</td>
              <td><span className="data-badge">{result.status}</span></td>
              <td>{result.detail}</td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
