import { scoreCss } from '../globe/pins';
import { isSearchActive, useApp } from '../state/store';

export function Legend() {
  const query = useApp((s) => s.query);
  const results = useApp((s) => s.results);
  const showFeatured = useApp((s) => s.showFeatured);
  const active = isSearchActive(query);
  const lo = results.length ? Math.round(Math.min(...results.map((r) => r.score))) : 0;
  const hi = results.length ? Math.round(Math.max(...results.map((r) => r.score))) : 100;

  return (
    <div className="panel pointer-events-auto hidden px-3 py-2.5 text-xs md:block" aria-label="Map legend">
      {(!active || showFeatured) && (
        <div className="mb-1.5 flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-[2.5px] border-[var(--moon)]" aria-hidden />
            Moon analog
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-[2.5px] border-[var(--mars)]" aria-hidden />
            Mars analog
          </span>
          <span className="text-[var(--muted)]">Ring = featured finding</span>
        </div>
      )}
      {active && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[var(--muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--good)]" aria-hidden /> Dot = search result, colour = score
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular">{lo}</span>
            <div
              className="h-2 w-32 rounded-full"
              style={{ background: `linear-gradient(90deg, ${scoreCss(0)}, ${scoreCss(0.5)}, ${scoreCss(1)})` }}
              aria-hidden
            />
            <span className="font-mono tabular">{hi}</span>
          </div>
        </div>
      )}
    </div>
  );
}
