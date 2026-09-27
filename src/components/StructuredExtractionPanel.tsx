import { useEffect, useState } from 'react';
import {
  listExtractionCoverage,
  listExtractionIssues,
  listMatchedFilingsForExtraction,
  markExtractionIssueReviewed,
} from '../db/repository';
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
  const [issues, setIssues] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [reviewingIssueId, setReviewingIssueId] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [nextFilings, nextCoverage, nextIssues] = await Promise.all([
        listMatchedFilingsForExtraction(),
        listExtractionCoverage(),
        listExtractionIssues(),
      ]);
      setFilings(nextFilings);
      setCoverage(nextCoverage);
      setIssues(nextIssues);
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

  const reviewIssue = async (issueId: number) => {
    setReviewingIssueId(issueId);
    setStatus('');
    try {
      await markExtractionIssueReviewed(issueId);
      setStatus('Extraction issue marked reviewed. No source value was invented or changed.');
      await load();
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewingIssueId(null);
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
            Re-run supported Form 5500 extraction against an already stored local PDF. Definitions come from SQLite metadata; ambiguous or unlocatable lines enter an explicit review queue rather than being inferred.
          </p>
        </div>
      </div>

      <ProcessStatus
        active={loading}
        label="Loading extraction coverage"
        detail="Reading supported form definitions, matched local filings, and open extraction issues from SQLite."
        eta="usually under 2 seconds"
      />

      <div className="pdf-preflight" aria-label="Extraction coverage summary">
        <div><span>Supported line rules</span><strong>{coverage.length}</strong></div>
        <div><span>Output fields</span><strong>{outputFields}</strong></div>
        <div><span>Matched filings available</span><strong>{filings.length}</strong></div>
        <div><span>Open review items</span><strong>{issues.length}</strong></div>
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
        detail="Reading the stored PDF, applying metadata definitions, saving provenance, updating the review queue, and running deterministic validation."
        eta="large PDFs may take several seconds"
      />

      {status ? <p className="status" role="status">{status}</p> : null}

      {issues.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Year</th><th>Source</th><th>Location</th><th>Issue</th><th>Page</th><th>Source text</th><th>Review</th></tr>
            </thead>
            <tbody>
              {issues.map((row) => {
                const issueId = Number(row.extraction_issue_id);
                return (
                  <tr key={String(issueId)}>
                    <td>{String(row.plan_year)}</td>
                    <td>{String(row.source_filename ?? '')}</td>
                    <td className="mono">{String(row.schedule_name)} / {String(row.part)} / {String(row.location_reference)}</td>
                    <td><span className="data-badge">{String(row.issue_code)}</span></td>
                    <td>{row.source_page == null ? '—' : String(row.source_page)}</td>
                    <td className="source-text">{String(row.source_text ?? 'No matching source line found.')}</td>
                    <td>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={reviewingIssueId !== null || working}
                        onClick={() => void reviewIssue(issueId)}
                      >
                        {reviewingIssueId === issueId ? 'Saving…' : 'Mark reviewed'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        !loading ? <div className="empty-state">No open extraction review items.</div> : null
      )}

      <ProcessStatus
        active={reviewingIssueId !== null}
        label="Saving extraction issue review"
        detail="Recording the user review in SQLite without changing any extracted source value."
        eta="usually under 2 seconds"
      />

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
