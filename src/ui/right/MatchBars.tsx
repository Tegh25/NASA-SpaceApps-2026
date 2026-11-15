import type { FeatureDef, Target } from '../../data/schemas';
import { featureSources, sourceLine } from '../../lib/provenance';
import { targetRaw } from '../../lib/sites';
import type { BreakdownRow } from '../../scoring/types';
import { formatValue } from './format';

const COLOR = { strong: 'var(--good)', partial: 'var(--mid)', weak: 'var(--bad)' } as const;

interface Props {
  rows: BreakdownRow[];
  features: FeatureDef[];
  siteRaw: (key: string) => number | null;
  target: Target | null;
  targetLabel: string;
  body: 'moon' | 'mars';
}

/** Per-feature closeness bars: matches first, then differences. */
export function MatchBars({ rows, features, siteRaw, target, targetLabel, body }: Props) {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const usable = rows
    .filter((r) => r.diff !== null && r.level && (r.weight > 0 || r.target !== null) && byKey.has(r.key))
    .sort((a, b) => a.diff! - b.diff!);
  const matches = usable.filter((r) => r.level === 'strong');
  const gaps = usable.filter((r) => r.level !== 'strong');

  const Row = ({ r }: { r: BreakdownRow }) => {
    const fd = byKey.get(r.key)!;
    const color = COLOR[r.level!];
    const close = Math.max(0, Math.min(1, 1 - r.diff!));
    const src = sourceLine(featureSources(fd, body, target));
    return (
      <li className="py-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13px] text-[var(--ink)]">{fd.label}</span>
          <span className="num shrink-0 text-[11.5px] text-[var(--dim)]">
            {formatValue(fd.key, fd.unit, siteRaw(fd.key))}
            <span className="mx-1 text-[var(--faint)]">vs</span>
            {formatValue(fd.key, fd.unit, targetRaw(r, fd, target))}
          </span>
        </div>
        <div
          role="img"
          aria-label={`${fd.label} closeness ${Math.round(close * 100)} percent, ${r.level}`}
          className="mt-1 h-[3px] w-full bg-[var(--rule)]"
        >
          <div className="h-full" style={{ width: `${Math.max(3, close * 100)}%`, background: color, boxShadow: `0 0 8px -1px ${color}`, transition: 'width 600ms var(--ease-out-quint)' }} />
        </div>
        {src && <p className="mt-1 truncate text-[10.5px] leading-3 text-[var(--dim)]" title={src}>Source: {src}</p>}
      </li>
    );
  };

  if (!usable.length) return <p className="text-xs text-[var(--faint)]">No overlapping measurements to compare against {targetLabel}.</p>;
  return (
    <div>
      <div className="num mb-1 flex gap-3 text-[11px] text-[var(--faint)]">
        <span>This site</span>
        <span>vs {targetLabel}</span>
      </div>
      {matches.length > 0 && (
        <>
          <h4 className="mt-2 text-xs font-medium text-[var(--good)]">Matches</h4>
          <ul className="divide-y divide-[var(--rule)]/60">{matches.map((r) => <Row key={r.key} r={r} />)}</ul>
        </>
      )}
      {gaps.length > 0 && (
        <>
          <h4 className="mt-3 text-xs font-medium text-[var(--bad)]">Differences</h4>
          <ul className="divide-y divide-[var(--rule)]/60">{gaps.map((r) => <Row key={r.key} r={r} />)}</ul>
        </>
      )}
    </div>
  );
}
