import { useEffect, useRef, useState } from 'react';
import { readStoredFile } from '../ingest/opfsFiles';
import { provenanceUrlText } from '../security/externalUrl';

interface Props {
  row: Record<string, unknown>;
}

export function ProvenanceCard({ row }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showPage, setShowPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showPage || !canvasRef.current) return;
    const storageKey = String(row.storage_key ?? '');
    const page = Number(row.source_page ?? 0);
    if (!storageKey || !page) return;
    void (async () => {
      try {
        const bytes = await readStoredFile(storageKey);
        const { renderPdfPage } = await import('../pdf/renderPage');
        if (!canvasRef.current) return;
        await renderPdfPage(bytes, page, canvasRef.current);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
  }, [showPage, row]);

  return (
    <article className="provenance-card" aria-label="Value provenance">
      <div className="provenance-path">
        {String(row.case_name ?? 'Case')} → {String(row.plan_name ?? 'Plan')} → {String(row.plan_year ?? '')}
        {' → '}Schedule {String(row.schedule_name ?? '')} → Part {String(row.part ?? '')}
        {' → '}{String(row.location_reference ?? '')} → {String(row.subfield ?? '')}
      </div>
      <div className="value-large">{row.normalized_number == null ? String(row.normalized_text ?? '') : Number(row.normalized_number).toLocaleString()}</div>
      <dl className="facts-grid">
        <dt>Canonical concept</dt><dd>{String(row.canonical_concept ?? '')}</dd>
        <dt>Source PDF</dt><dd>{String(row.source_filename ?? '')}</dd>
        <dt>Page</dt><dd>{String(row.source_page ?? '')}</dd>
        <dt>SHA-256</dt><dd className="mono wrap">{String(row.source_sha256 ?? '')}</dd>
        <dt>Method</dt><dd>{String(row.extraction_method ?? '')}</dd>
        <dt>Confidence</dt><dd>{row.extraction_confidence == null ? '' : Number(row.extraction_confidence).toFixed(3)}</dd>
        <dt>Status</dt><dd><span className="data-badge">{String(row.verification_status ?? '')}</span></dd>
        <dt>eFAST URL provenance</dt><dd className="mono wrap">{provenanceUrlText(row.source_url as string | null)}</dd>
        <dt>Raw source text</dt><dd className="source-text">{String(row.source_text ?? '')}</dd>
      </dl>
      {row.storage_key && row.source_page ? (
        <button type="button" onClick={() => setShowPage((value) => !value)}>
          {showPage ? 'Hide source page' : 'Show source page'}
        </button>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {showPage ? <div className="pdf-canvas-wrap"><canvas ref={canvasRef} /></div> : null}
    </article>
  );
}
