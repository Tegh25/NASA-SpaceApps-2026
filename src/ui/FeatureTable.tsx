import type { FeatureDef, Target } from '../data/schemas';
import { formatValue } from '../lib/geo';
import { targetRaw } from '../lib/sites';
import type { BreakdownRow } from '../scoring/types';
import { MatchBadge } from './common';

interface Props {
  rows: BreakdownRow[];
  features: FeatureDef[];
  siteRaw: (key: string) => number | null;
  target: Target | null;
  targetLabel: string;
  limit?: number;
  compact?: boolean;
}

export function DualBar({ site, target }: { site: number | null; target: number | null }) {
  return (
    <div className="relative h-4 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
      {site !== null && target !== null && (
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-white/15"
          style={{ left: `${Math.min(site, target) * 100}%`, width: `${Math.abs(site - target) * 100}%` }}
        />
      )}
      {target !== null && (
        <div
          className="absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded bg-[var(--moon)]"
          style={{ left: `${target * 100}%` }}
          title="Target"
        />
      )}
      {site !== null && (
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#070A10] bg-[var(--good)]"
          style={{ left: `${site * 100}%` }}
          title="Site"
        />
      )}
    </div>
  );
}

export function FeatureTable({ rows, features, siteRaw, target, targetLabel, limit, compact }: Props) {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const shown = (limit ? rows.filter((r) => r.weight > 0 || r.target !== null).slice(0, limit) : rows).filter((r) => byKey.has(r.key));
  return (
    <div>
      {!compact && (
        <div className="mb-2 flex items-center gap-4 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--good)]" aria-hidden /> This site
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-[var(--moon)]" aria-hidden /> {targetLabel}
          </span>
        </div>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Feature comparison between this site and {targetLabel}</caption>
        <thead className="sr-only">
          <tr>
            <th>Feature</th>
            <th>Site value</th>
            <th>Target value</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const fd = byKey.get(r.key)!;
            const tRaw = targetRaw(r, fd, target);
            return (
              <tr key={r.key} className={`border-t border-white/5 align-top ${r.weight === 0 ? 'opacity-60' : ''}`}>
                <td className="py-2 pr-2">
                  <div className="font-medium" title={fd.description}>
                    {fd.label}
                  </div>
                  <div className="mt-1 pr-1">
                    <DualBar site={r.site} target={r.target} />
                  </div>
                </td>
                <td className="whitespace-nowrap py-2 pr-2 text-right font-mono text-xs tabular">
                  <div>{formatValue(siteRaw(r.key), fd.unit)}</div>
                  <div className="text-[var(--muted)]">{formatValue(tRaw, fd.unit)}</div>
                </td>
                <td className="py-2 text-right">
                  {r.target === null ? (
                    <span className="text-xs text-[var(--muted)]">Not compared</span>
                  ) : (
                    <MatchBadge level={r.level} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
