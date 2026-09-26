import { useEffect, useMemo, useState } from 'react';
import { storeLocalFile } from '../ingest/opfsFiles';
import { extractScheduleH1c9 } from '../pdf/scheduleH1c9';
import { extractPdfPages } from '../pdf/extractText';
import { chooseMatch, inferDocumentSignals } from '../matching/matchPdf';
import {
  ensureSourceDocument,
  getFilingContext,
  listDocumentMatches,
  saveExtractedValues,
} from '../db/repository';
import {
  listMatchableRowsForImport,
  preparePdfImport,
  saveScopedPdfImport,
  type PdfImportPreflight,
} from '../db/pdfImport';
import { ProcessStatus } from './ProcessStatus';

interface ImportedResult {
  filename: string;
  status: string;
  detail: string;
}

function yearRange(preflight: PdfImportPreflight): string {
  if (!preflight.years.length) return 'No plan years';
  const years = [...new Set(preflight.years)].sort((a, b) => a - b);
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
}

export function PdfImportPanel({
  efastImportId,
  onImported,
}: {
  efastImportId: number;
  onImported: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportedResult[]>([]);
  const [working, setWorking] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentFilename, setCurrentFilename] = useState('');
  const [preflight, setPreflight] = useState<PdfImportPreflight | null>(null);
  const [preflightWorking, setPreflightWorking] = useState(true);
  const [preflightError, setPreflightError] = useState('');

  const loadPreflight = async () => {
    setPreflightWorking(true);
    setPreflightError('');
    try {
      const next = await preparePdfImport(efastImportId);
      setPreflight(next);
    } catch (error) {
      setPreflight(null);
      setPreflightError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreflightWorking(false);
    }
  };

  useEffect(() => {
    void loadPreflight();
  }, [efastImportId]);

  const blockedReason = useMemo(() => {
    if (preflightError) return preflightError;
    if (!preflight) return 'PDF preflight has not completed.';
    if (preflight.problems.length) return preflight.problems.join(' ');
    if (preflight.readyCount === 0) {
      return preflight.alreadyMatchedCount === preflight.expectedCount && preflight.expectedCount > 0
        ? 'All expected filings already have local PDFs.'
        : 'No expected filing is currently available for matching.';
    }
    return '';
  }, [preflight, preflightError]);

  const importFiles = async () => {
    if (!files.length) return;

    setWorking(true);
    setProcessedCount(0);
    setCurrentFilename('');
    setResults([]);
    const next: ImportedResult[] = [];

    try {
      const currentPreflight = await preparePdfImport(efastImportId);
      setPreflight(currentPreflight);
      if (currentPreflight.problems.length) {
        throw new Error(`PDF import stopped by preflight: ${currentPreflight.problems.join(' ')}`);
      }
      if (currentPreflight.readyCount === 0) {
        throw new Error('PDF import stopped: no expected filing is available for matching.');
      }

      for (const file of files) {
        setCurrentFilename(file.name);
        try {
          const stored = await storeLocalFile(file, 'pdf');
          const sourceDocumentId = await ensureSourceDocument(stored, 'pdf');
          const pages = await extractPdfPages(stored.bytes);
          const signals = inferDocumentSignals(file.name, pages);
          const matchable = await listMatchableRowsForImport(efastImportId);
          if (!matchable.length) {
            throw new Error('No eligible filing remains in this eFAST import.');
          }

          const match = chooseMatch(signals, matchable);
          const saved = await saveScopedPdfImport(sourceDocumentId, pages, match);

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
          next.push({
            filename: file.name,
            status: 'ERROR',
            detail: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setProcessedCount((value) => value + 1);
        }
      }

      setResults(next);
      await listDocumentMatches();
      await loadPreflight();
      onImported();
    } catch (error) {
      next.push({
        filename: 'Preflight',
        status: 'ERROR',
        detail: error instanceof Error ? error.message : String(error),
      });
      setResults(next);
    } finally {
      setWorking(false);
      setCurrentFilename('');
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Step B</p>
          <h2>Import local Form 5500 PDFs</h2>
          <p className="panel-description">
            Hashes, stores, parses, and matches PDFs entirely in-browser. Matching is restricted to this case and this eFAST import.
          </p>
        </div>
      </div>

      <ProcessStatus
        active={preflightWorking}
        label="Checking PDF matching preflight"
        detail="Validating the case, target plan number, expected filings, and stale filing links."
        eta="usually under 5 seconds"
      />

      {preflight ? (
        <div className="pdf-preflight" aria-label="PDF matching preflight">
          <div><span>Plan number</span><strong>{preflight.planNumber || 'Not set'}</strong></div>
          <div><span>Expected filings</span><strong>{preflight.expectedCount}</strong></div>
          <div><span>Years</span><strong>{yearRange(preflight)}</strong></div>
          <div><span>Ready for matching</span><strong>{preflight.readyCount}</strong></div>
          {preflight.alreadyMatchedCount ? (
            <div><span>Already matched</span><strong>{preflight.alreadyMatchedCount}</strong></div>
          ) : null}
        </div>
      ) : null}

      {preflight?.problems.length ? (
        <div className="preflight-error" role="alert">
          <strong>PDF import is blocked.</strong>
          <ul>{preflight.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </div>
      ) : null}
      {preflightError ? <p className="error" role="alert">{preflightError}</p> : null}

      <label>
        <span>PDF files</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={preflightWorking || Boolean(blockedReason)}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </label>

      <div className="panel-actions">
        <button
          type="button"
          onClick={() => void importFiles()}
          disabled={!files.length || working || preflightWorking || Boolean(blockedReason)}
        >
          {working ? 'Processing locally…' : files.length ? `Import ${files.length} PDF${files.length === 1 ? '' : 's'}` : 'Select PDFs to continue'}
        </button>
        <span className="action-hint">
          {blockedReason || (files.length ? `${files.length} local file${files.length === 1 ? '' : 's'} selected.` : 'No files selected.')}
        </span>
      </div>

      <ProcessStatus
        active={working}
        label="Importing and matching PDFs locally"
        detail={currentFilename ? `Processing ${currentFilename}: hash → text extraction → filing match` : 'Preparing local PDF import.'}
        current={processedCount}
        total={files.length}
        eta="large PDFs may take several seconds each"
      />

      {results.length ? (
        <div className="table-wrap import-results">
          <table>
            <thead><tr><th>PDF</th><th>Status</th><th>Result</th></tr></thead>
            <tbody>{results.map((result, index) => <tr key={`${result.filename}-${index}`}>
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
