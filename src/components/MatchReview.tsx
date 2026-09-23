import { useEffect, useState } from 'react';
import { listDocumentMatches } from '../db/repository';
import { provenanceUrlText } from '../security/externalUrl';

export function MatchReview({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => { void listDocumentMatches().then(setRows); }, [refreshToken]);

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Document identity</p>
          <h2>PDF matching review</h2>
          <p className="panel-description">Confirm which local PDF belongs to each expected eFAST filing. Low-confidence matches stay visible instead of being silently accepted.</p>
        </div>
      </div>
      {!rows.length ? <div className="empty-state">No imported PDF matches yet. Import an eFAST CSV and local PDFs first.</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>PDF</th><th>Status</th><th>Score</th><th>Plan year</th><th>PN</th><th>Plan</th><th>eFAST provenance URL</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={String(row.document_match_id)}>
              <td>{String(row.filename)}</td>
              <td><span className="data-badge">{String(row.verification_status)}</span></td>
              <td className="mono">{Number(row.match_score).toFixed(3)}</td>
              <td>{String(row.plan_year ?? '')}</td>
              <td>{String(row.plan_number ?? '')}</td>
              <td>{String(row.plan_name ?? '')}</td>
              <td className="mono wrap provenance-url">{provenanceUrlText(row.source_url as string | null)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
