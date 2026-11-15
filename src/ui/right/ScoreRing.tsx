import { useEffect, useState } from 'react';

/** Thin instrument ring with the score in mono. Animates once on mount. */
export function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const [t, setT] = useState(0);
  const target = Math.max(0, Math.min(100, score)) / 100;
  useEffect(() => {
    const id = requestAnimationFrame(() => setT(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const sw = 4;
  const r = size / 2 - sw;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? 'var(--good)' : score >= 55 ? 'var(--mid)' : 'var(--bad)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${Math.round(score)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--rule)" strokeWidth={sw} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - t)}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease-out-quint)', filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div className="num absolute inset-0 grid place-items-center text-[22px] font-medium">{Math.round(score)}</div>
    </div>
  );
}
