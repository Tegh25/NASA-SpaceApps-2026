import { Eye, EyeOff } from 'lucide-react';
import { useHeat } from '../globe/heatField';
import { useApp } from '../state/store';

/**
 * Legend for the globe heat field. It states plainly that the glow covers only the
 * blocks our pipeline searched (235 cold, dry, rugged Copernicus tiles), so gaps in the
 * glow are "not searched", not "no match".
 */
export function HeatLegend({ className = '' }: { className?: string }) {
  const on = useHeat((s) => s.on);
  const mode = useHeat((s) => s.mode);
  const targetName = useHeat((s) => s.targetName);
  const setOn = useHeat((s) => s.setOn);
  const count = useApp((s) => s.data?.cells.count ?? 0);

  const subject = mode === 'search' ? 'your conditions' : targetName ?? 'the target';

  return (
    <div className={`glass-capsule pointer-events-auto flex max-w-[300px] items-start gap-3 !rounded-[16px] px-3.5 py-2.5 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-snug text-[var(--ink)]">
          Glow: match to <span className="text-[var(--accent)]">{subject}</span>
        </div>
        {on && (
          <>
            <div
              className="mt-1.5 h-1.5 w-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #56657A, #F2C14E 55%, #4FE0B0)' }}
              aria-hidden
            />
            <div className="num mt-1 flex justify-between text-[10px] text-[var(--dim)]">
              <span>40</span>
              <span>100</span>
            </div>
          </>
        )}
        <p className="mt-1 text-[11px] leading-snug text-[var(--dim)]">
          Only the <span className="num">{count.toLocaleString('en')}</span> blocks our pipeline searched glow. Dark land was not searched.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOn(!on)}
        aria-pressed={on}
        aria-label={on ? 'Hide match glow' : 'Show match glow'}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--dim)] hover:text-[var(--ink)]"
      >
        {on ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
      </button>
    </div>
  );
}
