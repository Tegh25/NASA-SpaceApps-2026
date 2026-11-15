import { X } from 'lucide-react';
import { useId, type CSSProperties } from 'react';
import type { FeatureDef } from '../../data/schemas';
import { denormalize } from '../../scoring/normalize';
import { formatValue, formatWithAside } from './format';

export interface Tick {
  norm: number;
  label: string;
}

interface Props {
  fd: FeatureDef;
  /** Normalized 0..1 target, or undefined when the feature is off. */
  value: number | undefined;
  tick: Tick | null;
  onChange: (v: number) => void;
  onClear: () => void;
}

/** Slider in real units; the store holds the normalized 0..1 target. */
export function MetricSlider({ fd, value, tick, onChange, onClear }: Props) {
  const id = useId();
  const active = value !== undefined;
  const shown = value ?? tick?.norm ?? 0.5;
  const real = denormalize(shown, fd.norm);
  const { main, aside } = formatWithAside(fd.key, fd.unit, real);

  const tickLeft = tick ? `calc(7px + (100% - 14px) * ${tick.norm})` : undefined;
  const labelShift = tick ? (tick.norm < 0.18 ? '-6px' : tick.norm > 0.82 ? 'calc(-100% + 6px)' : '-50%') : '0';

  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="truncate text-[13px] text-[var(--ink)]">
          {fd.label}
        </label>
        <div className="flex shrink-0 items-baseline gap-1.5">
          {active ? (
            <span className="num text-[13px] text-[var(--ink)]">
              {main}
              {aside && <span className="ml-1.5 text-[11px] text-[var(--faint)]">{aside}</span>}
            </span>
          ) : (
            <span className="text-xs text-[var(--faint)]">off</span>
          )}
          {active && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear ${fd.label}`}
              className="-mr-1 grid h-5 w-5 place-items-center rounded-sm text-[var(--faint)] transition-colors hover:bg-[var(--deck)] hover:text-[var(--ink)]"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-0.5 pt-3.5">
        {tick && (
          <>
            <span
              aria-hidden
              className="hand pointer-events-none absolute top-0 whitespace-nowrap text-[14px]"
              style={{ left: tickLeft, transform: `translateX(${labelShift})` }}
            >
              {tick.label}
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[3px] w-px bg-[var(--accent)]"
              style={{ left: tickLeft, height: 16, opacity: 0.9 }}
            />
          </>
        )}
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={shown}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={active ? formatValue(fd.key, fd.unit, real) : 'off'}
          title={fd.description || undefined}
          className={`metric relative block transition-opacity duration-200 ${active ? '' : 'opacity-45 grayscale hover:opacity-80'}`}
          style={{ '--fill': active ? `${(shown * 100).toFixed(1)}%` : '0%' } as CSSProperties}
        />
      </div>
    </div>
  );
}
