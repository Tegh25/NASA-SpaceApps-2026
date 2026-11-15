import { useEffect, useRef, useState } from 'react';

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates toward `target` (from the last shown value) with ease-out. */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(() => (prefersReduced() ? target : 0));
  const from = useRef(v);
  useEffect(() => {
    if (prefersReduced()) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const cur = a + (target - a) * e;
      from.current = cur;
      setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export const scoreColor = (s: number) => (s >= 70 ? 'var(--good)' : s >= 50 ? 'var(--mid)' : 'var(--dim)');

interface Props {
  score: number | null;
  size?: number;
  className?: string;
}

export function ScoreRing({ score, size = 44, className = '' }: Props) {
  const target = score ?? 0;
  const shown = useCountUp(target);
  const stroke = 3;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const color = score === null ? 'var(--faint)' : scoreColor(target);
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? 'No score' : `Match score ${Math.round(target)} out of 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule-hi)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, shown)) / 100)}
        />
      </svg>
      <span className="num absolute text-[13px] font-medium leading-none" style={{ color: score === null ? 'var(--faint)' : 'var(--ink)' }}>
        {score === null ? '--' : Math.round(shown)}
      </span>
    </span>
  );
}
