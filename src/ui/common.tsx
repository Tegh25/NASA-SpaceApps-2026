import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MatchLevel } from '../scoring/types';

export function levelWord(n: number): string {
  if (n < 0.15) return 'very low';
  if (n < 0.35) return 'low';
  if (n < 0.65) return 'medium';
  if (n < 0.85) return 'high';
  return 'very high';
}

const LEVEL_STYLE: Record<MatchLevel, { label: string; color: string }> = {
  strong: { label: 'Strong', color: 'var(--good)' },
  partial: { label: 'Partial', color: 'var(--mid)' },
  weak: { label: 'Weak', color: 'var(--bad)' },
};

export function MatchBadge({ level }: { level: MatchLevel | null }) {
  if (!level) return <span className="text-xs text-[var(--muted)]">No data</span>;
  const s = LEVEL_STYLE[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 45%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function Chip({
  children,
  tone = 'default',
  onRemove,
  onClick,
  removeLabel,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'moon' | 'mars';
  onRemove?: () => void;
  onClick?: () => void;
  removeLabel?: string;
  title?: string;
}) {
  const color = {
    default: 'var(--text)',
    good: 'var(--good)',
    bad: 'var(--bad)',
    moon: 'var(--moon)',
    mars: 'var(--mars)',
  }[tone];
  const Inner = onClick ? 'button' : 'span';
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full border border-white/12 bg-white/5 text-xs"
      style={{ color }}
      title={title}
    >
      <Inner
        className={`truncate px-2.5 py-1 ${onClick ? 'hover:text-white' : ''}`}
        {...(onClick ? { type: 'button' as const, onClick } : {})}
      >
        {children}
      </Inner>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="-ml-1 mr-1 grid h-5 w-5 place-items-center rounded-full text-[var(--muted)] hover:bg-white/10 hover:text-white"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </span>
  );
}

export function ScoreGauge({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const t = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 75 ? 'var(--good)' : score >= 55 ? 'var(--mid)' : 'var(--bad)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Score ${Math.round(score)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="5" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - t)}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-lg font-medium tabular">{Math.round(score)}</div>
    </div>
  );
}

export function ScoreBar({ score, t }: { score: number; t: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, score)}%`, background: t > 0.5 ? 'var(--good)' : t > 0.15 ? 'var(--mid)' : '#7A8597' }}
        />
      </div>
      <span className="w-7 text-right font-mono text-sm tabular">{Math.round(score)}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{children}</h3>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`rounded-md font-medium transition-colors duration-150 ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-sm'} ${
              active ? 'bg-white/15 text-white' : 'text-[var(--muted)] hover:text-white'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
