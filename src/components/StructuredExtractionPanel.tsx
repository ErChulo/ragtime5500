import { useEffect, useState } from 'react';
import { listExtractionCoverage, listMatchedFilingsForExtraction } from '../db/repository';
import { readStoredFile } from '../ingest/opfsFiles';
import { extractPdfPages } from '../pdf/extractText';
import { runStructuredExtraction } from '../pdf/runStructuredExtraction';
import { ProcessStatus } from './ProcessStatus';

export function StructuredExtractionPanel({
  refreshToken,
  onChanged,
}: {
  refreshToken: number;
  onChanged: () => void;
}) {
  const [filings, setFilings] = useState<Array<Record<string, unknown>>>([]);
  const [coverage, setCoverage] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [nextFilings, nextCoverage] = await Promise.all([
        listMatchedFilingsForExtraction(),
        listExtractionCoverage(),
      ]);
      setFilings(nextFilings);
      setCoverage(nextCoverage);
      setSelectedId((current) => {
        if (current !== null && nextFilings.some((row) => Number(row.filing_id) === current)) return current;
        return nextFilings[0] ? Number(nextFilings[0].filing_id) : null;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [refreshToken]);

  const run = async () => {
    const filing = filings.find((row) => Number(row.filing_id) === selectedId);
    if (!filing) return;

    setWorking(true);
    setStatus('');
    try {
      const bytes = await readStoredFile(String(filing.storage_key));
      const pages = await extractPdfPages(bytes);
      const summary = await runStructuredExtraction(
        Number(filing.filing_id),
        Number(filing.plan_year),
        pages,
      );
      setStatus(
        `Extraction complete: ${summary.valueCount} value${summary.valueCount === 1 ? '' : 's'} from ${summary.ruleCount} metadata rule${summary.ruleCount === 1 ? '' : 's'}; ${summary.issueCount} review item${summary.issueCount === 1 ? '' : 's'}.`,
      );
      await load();
      onChanged();
    } catch (error) {
      setStatus(`Extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setWorking(false);
    }
  };

  const outputFields = coverage.reduce((sum, row) => sum + Number(row.output_field_count ?? 0), 0);

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Metadata-driven extraction</p>
          <h2>Structured extraction</h2>
          <p className="panel-description">
            Re-run supported Form 5500 extraction against an already stored local PDF. Definitions come from SQLite metadata; ambiguous cells are left for review rather than inferred.
          </p>
        </div>
      </div>

      <ProcessStatus
        active={loading}
        label="Loading extraction coverage"
        detail="Reading supported form definitions and matched local filings from SQLite."
        eta="usually under 2 seconds"
      />

      <div className="pdf-preflight" aria-label="Extraction coverage summary">
        <div><span>Supported line rules</span><strong>{coverage.length}</strong></div>
        <div><span>Output fields</span><strong>{outputFields}</strong></div>
        <div><span>Matched filings available</span><strong>{filings.length}</strong></div>
      </div>

      {filings.length ? (
        <div className="panel-actions">
          <label>
            <span>Filing to extract</span>
            <select value={selectedId ?? ''} onChange={(event) => setSelectedId(Number(event.target.value))} disabled={working}>
              {filings.map((row) => (
                <option key={String(row.filing_id)} value={Number(row.filing_id)}>
                  {String(row.plan_year)} · {String(row.source_filename)} · {String(row.rule_count)} rules
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void run()} disabled={selectedId === null || working || loading}>
            {working ? 'Extracting locally…' : 'Re-extract structured values'}
          </button>
        </div>
      ) : (
        <div className="empty-state">No matched local filing has an active extraction definition.</div>
      )}

      <ProcessStatus
        active={working}
        label="Extracting structured values locally"
        detail="Reading the stored PDF, applying metadata definitions, saving provenance, and running deterministic validation."
        eta="large PDFs may take several seconds"
      />

      {status ? <p className="status" role="status">{status}</p> : null}

      <details>
        <summary>Supported extraction definitions</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Year</th><th>Location</th><th>Concept</th><th>Outputs</th><th>Definition source</th></tr>
            </thead>
            <tbody>
              {coverage.map((row) => (
                <tr key={`${String(row.form_year)}-${String(row.schedule_name)}-${String(row.location_reference)}`}>
                  <td>{String(row.form_year)}</td>
                  <td className="mono">{String(row.schedule_name)} / {String(row.part)} / {String(row.location_reference)}</td>
                  <td className="mono">{String(row.canonical_concept)}</td>
                  <td>{String(row.output_field_count)}</td>
                  <td>{String(row.source_reference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
