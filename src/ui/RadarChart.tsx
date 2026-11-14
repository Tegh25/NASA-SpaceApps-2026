import type { FeatureDef } from '../data/schemas';
import type { BreakdownRow } from '../scoring/types';

/** Per-feature match (1 - diff) for weighted features. */
export function RadarChart({ rows, features, size = 220 }: { rows: BreakdownRow[]; features: FeatureDef[]; size?: number }) {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const pts = rows.filter((r) => r.weight > 0 && r.diff !== null).slice(0, 10);
  if (pts.length < 3) return null;
  const c = size / 2;
  const R = c - 34;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / pts.length;
  const xy = (i: number, v: number) => [c + Math.cos(angle(i)) * R * v, c + Math.sin(angle(i)) * R * v];
  const poly = pts.map((r, i) => xy(i, 1 - r.diff!).join(',')).join(' ');
  return (
    <svg width={size} height={size} role="img" aria-label="Radar chart of feature match" className="mx-auto block">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon
          key={g}
          points={pts.map((_, i) => xy(i, g).join(',')).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
        />
      ))}
      {pts.map((_, i) => {
        const [x, y] = xy(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" />;
      })}
      <polygon points={poly} fill="rgba(60,200,160,0.22)" stroke="var(--good)" strokeWidth={1.5} />
      {pts.map((r, i) => {
        const [x, y] = xy(i, 1.18);
        const label = byKey.get(r.key)?.label ?? r.key;
        return (
          <text key={r.key} x={x} y={y} fill="var(--muted)" fontSize={9.5} textAnchor="middle" dominantBaseline="middle">
            {label.length > 14 ? `${label.slice(0, 13)}…` : label}
          </text>
        );
      })}
    </svg>
  );
}
