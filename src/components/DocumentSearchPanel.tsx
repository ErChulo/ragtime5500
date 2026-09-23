import { useEffect, useRef, useState } from 'react';
import { searchDocumentText } from '../db/repository';
import { readStoredFile } from '../ingest/opfsFiles';

function EvidencePage({ row }: { row: Record<string, unknown> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let active = true;
    const run = async () => {
      try {
        const bytes = await readStoredFile(String(row.storage_key ?? ''));
        const { renderPdfPage } = await import('../pdf/renderPage');
        if (!active || !canvasRef.current) return;
        await renderPdfPage(bytes, Number(row.page_number), canvasRef.current);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void run();
    return () => { active = false; };
  }, [open, row]);

  return (
    <article className="evidence-card">
      <div className="evidence-meta">
        <span className="data-badge">Page {String(row.page_number ?? '')}</span>
        <span>{String(row.plan_year ?? 'Unmatched year')}</span>
        <span>{String(row.source_filename ?? '')}</span>
      </div>
      <strong>{String(row.plan_name ?? row.case_name ?? 'Local document')}</strong>
      <p className="source-text">{String(row.snippet ?? '')}</p>
      <div className="provenance-path">
        {String(row.case_name ?? 'Unmatched')} → {String(row.plan_name ?? 'Unmatched plan')} → {String(row.plan_year ?? '—')}
        {' → '}{String(row.source_filename ?? '')} → page {String(row.page_number ?? '')}
      </div>
      <button className="button-secondary" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide source page' : 'Show source page'}
      </button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {open ? <div className="pdf-canvas-wrap"><canvas ref={canvasRef} /></div> : null}
    </article>
  );
}

export function DocumentSearchPanel() {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');

  const run = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRows([]);
      setStatus('Enter one or more terms to search locally indexed PDF text.');
      return;
    }

    try {
      const yearNumber = year.trim() ? Number(year) : undefined;
      if (yearNumber !== undefined && !Number.isInteger(yearNumber)) {
        setStatus('Plan year must be an integer.');
        return;
      }
      const result = await searchDocumentText(trimmed, yearNumber);
      setRows(result);
      setStatus(result.length ? `${result.length} local text match${result.length === 1 ? '' : 'es'} found.` : 'No local text match found.');
    } catch (error) {
      setRows([]);
      setStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Local full-text retrieval</p>
          <h2>Search imported PDF text</h2>
          <p className="panel-description">
            SQLite FTS5 searches only locally extracted text. Results cite the local source document and page; no model or network service is involved.
          </p>
        </div>
      </div>

      <div className="search-row">
        <label>
          <span>Search terms</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') void run();
          }} placeholder='Example: "common collective trust"' />
        </label>
        <label>
          <span>Plan year (optional)</span>
          <input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} placeholder="Any year" />
        </label>
        <button type="button" onClick={run}>Search local text</button>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
      <div className="evidence-list">{rows.map((row) => <EvidencePage key={String(row.chunk_id)} row={row} />)}</div>
    </section>
  );
}
