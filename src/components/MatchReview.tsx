import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  acceptDocumentMatch,
  listDocumentMatches,
  listMatchableRows,
  saveExtractedValues,
} from '../db/repository';
import type { MatchableEfastRow } from '../matching/matchPdf';
import { readStoredFile } from '../ingest/opfsFiles';
import { extractPdfPages } from '../pdf/extractText';
import { extractScheduleH1c9 } from '../pdf/scheduleH1c9';
import { provenanceUrlText } from '../security/externalUrl';

interface Props {
  refreshToken: number;
  onChanged: () => void;
}

function isUnresolved(status: unknown): boolean {
  return ['AMBIGUOUS', 'UNMATCHED', 'USER_REJECTED'].includes(String(status));
}

function targetLabel(row: MatchableEfastRow): string {
  const year = row.planYear ?? 'year ?';
  const pn = row.planNumber ? `PN ${row.planNumber}` : 'PN ?';
  return `${year} · ${pn} · ${row.planName ?? 'Unnamed plan'}`;
}

export function MatchReview({ refreshToken, onChanged }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [targets, setTargets] = useState<MatchableEfastRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [targetRowId, setTargetRowId] = useState('');
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const [matchRows, targetRows] = await Promise.all([
      listDocumentMatches(),
      listMatchableRows(),
    ]);
    setRows(matchRows);
    setTargets(targetRows);
    setSelectedMatchId((current) => (
      current !== null && matchRows.some((row) => Number(row.document_match_id) === current)
        ? current
        : null
    ));
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const selected = useMemo(
    () => rows.find((row) => Number(row.document_match_id) === selectedMatchId) ?? null,
    [rows, selectedMatchId],
  );

  const beginResolution = (row: Record<string, unknown>) => {
    const matchId = Number(row.document_match_id);
    const suggestedRowId = row.import_row_id == null ? null : Number(row.import_row_id);
    const suggestedAvailable = suggestedRowId !== null && targets.some((target) => target.importRowId === suggestedRowId);
    setSelectedMatchId(matchId);
    setTargetRowId(
      suggestedAvailable
        ? String(suggestedRowId)
        : targets[0]
          ? String(targets[0].importRowId)
          : '',
    );
    setStatus('');
  };

  const resolveMatch = async () => {
    if (selectedMatchId === null || !targetRowId) return;
    setWorking(true);
    setStatus('Saving the reviewed match and re-running local extraction…');

    try {
      const accepted = await acceptDocumentMatch(selectedMatchId, Number(targetRowId));
      const bytes = await readStoredFile(accepted.storageKey);
      const pages = await extractPdfPages(bytes);
      const extracted = extractScheduleH1c9(pages);

      if (accepted.planYear === 2024 && extracted.length === 2) {
        await saveExtractedValues(accepted.filingId, accepted.planYear, extracted);
        setStatus(
          `Match accepted. Extracted H/I/1C9 BOY=${extracted[0].normalizedNumber.toLocaleString()} and EOY=${extracted[1].normalizedNumber.toLocaleString()} from page ${extracted[0].sourcePage}; values remain unverified until source review.`,
        );
      } else if (accepted.planYear === 2024) {
        setStatus('Match accepted. H/I/1C9 could not be extracted deterministically; no value was inferred.');
      } else {
        setStatus('Match accepted. This milestone only extracts Schedule H Part I 1C9 for the 2024 form definition.');
      }

      setSelectedMatchId(null);
      setTargetRowId('');
      await load();
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Document identity</p>
          <h2>PDF matching review</h2>
          <p className="panel-description">
            High-confidence matches are accepted automatically. Ambiguous and unmatched PDFs stay here until you explicitly assign them to an expected eFAST filing.
          </p>
        </div>
      </div>

      {!rows.length ? <div className="empty-state">No imported PDF matches yet. Import an eFAST CSV and local PDFs first.</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>PDF</th><th>Status</th><th>Score</th><th>Plan year</th><th>PN</th><th>Plan</th><th>eFAST provenance URL</th><th>Review</th></tr>
            </thead>
            <tbody>{rows.map((row) => {
              const unresolved = isUnresolved(row.verification_status);
              return <tr key={String(row.document_match_id)}>
                <td>{String(row.filename)}</td>
                <td><span className="data-badge">{String(row.verification_status)}</span></td>
                <td className="mono">{Number(row.match_score).toFixed(3)}</td>
                <td>{String(row.plan_year ?? '')}</td>
                <td>{String(row.plan_number ?? '')}</td>
                <td>{String(row.plan_name ?? '')}</td>
                <td className="mono wrap provenance-url">{provenanceUrlText(row.source_url as string | null)}</td>
                <td>{unresolved
                  ? <button className="button-secondary" type="button" onClick={() => beginResolution(row)}>Resolve</button>
                  : <span className="action-hint">Complete</span>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}

      {selected && isUnresolved(selected.verification_status) ? (
        <div className="match-resolution" aria-labelledby="match-resolution-title">
          <div>
            <p className="eyebrow">Manual review</p>
            <h3 id="match-resolution-title">{String(selected.filename)}</h3>
            <p className="panel-description">
              Choose the expected eFAST filing this local PDF belongs to. The decision is written to the audit log; the original matching evidence remains stored.
            </p>
          </div>
          <label>
            <span>Expected filing</span>
            <select value={targetRowId} onChange={(event) => setTargetRowId(event.target.value)}>
              {!targets.length ? <option value="">No unmatched eFAST filing rows remain</option> : null}
              {targets.map((target) => (
                <option key={target.importRowId} value={target.importRowId}>{targetLabel(target)}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button type="button" disabled={!targetRowId || working} onClick={resolveMatch}>
              {working ? 'Saving locally…' : 'Accept this assignment'}
            </button>
            <button className="button-secondary" type="button" disabled={working} onClick={() => {
              setSelectedMatchId(null);
              setTargetRowId('');
              setStatus('');
            }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}
