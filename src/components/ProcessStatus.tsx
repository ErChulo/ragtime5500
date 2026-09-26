import { useEffect, useMemo, useState } from 'react';

interface Props {
  active: boolean;
  label: string;
  detail?: string;
  eta?: string;
  current?: number;
  total?: number;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function ProcessStatus({ active, label, detail, eta, current, total }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setStartedAt(null);
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setStartedAt(start);
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active, label]);

  const remaining = useMemo(() => {
    if (!active || !startedAt || !total || !current || current <= 0 || current >= total) return null;
    const elapsedMs = Date.now() - startedAt;
    const perItem = elapsedMs / current;
    return Math.max(0, Math.round((perItem * (total - current)) / 1000));
  }, [active, startedAt, current, total, elapsed]);

  if (!active) return null;

  return (
    <div className="process-status" role="status" aria-live="polite" aria-busy="true">
      <span className="process-spinner" aria-hidden="true" />
      <div className="process-copy">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
        <small>
          {current !== undefined && total !== undefined ? `${current} of ${total} · ` : ''}
          Elapsed {formatSeconds(elapsed)}
          {remaining !== null ? ` · about ${formatSeconds(remaining)} remaining` : eta ? ` · ${eta}` : ''}
        </small>
      </div>
    </div>
  );
}
