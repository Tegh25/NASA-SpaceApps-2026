import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { featuredBodies } from '../globe/GlobeView';
import { cellName } from '../lib/sites';
import { breakdown, cellGetter } from '../scoring/score';
import { isSearchActive, useApp } from '../state/store';
import { Chip, ScoreBar } from './common';
import { InterpretationChips } from './SearchBar';

export function ResultsList() {
  const status = useApp((s) => s.status);
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const results = useApp((s) => s.results);
  const showFeatured = useApp((s) => s.showFeatured);
  const selectedId = useApp((s) => s.selectedId);
  const { hover, setShowFeatured, setDrawerOpen } = useApp.getState();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const active = isSearchActive(query);

  const rows = useMemo(() => {
    if (!data || !active) return [];
    const byKey = new Map(data.features.map((f) => [f.key, f.label]));
    const lo = Math.min(...results.map((r) => r.score));
    const hi = Math.max(...results.map((r) => r.score));
    return results.map((r, i) => {
      const bd = breakdown(cellGetter(data.cells, r.index), query, data.features).filter((b) => b.diff !== null && b.weight > 0);
      const best = [...bd].sort((a, b) => a.diff! - b.diff!).slice(0, 2);
      const worst = [...bd].sort((a, b) => b.diff! - a.diff!)[0];
      return {
        ...r,
        rank: i + 1,
        t: hi > lo ? (r.score - lo) / (hi - lo) : 1,
        ...cellName(data, r.index),
        best: best.map((b) => byKey.get(b.key) ?? b.key),
        worst: worst && worst.diff! > 0.15 ? (byKey.get(worst.key) ?? worst.key) : null,
      };
    });
  }, [data, results, query, active]);

  const open = (id: string) => navigate(`/site/${id}${window.location.search}`);
  const featured = data
    ? data.featured.filter((f) => query.body === 'either' || featuredBodies(f.analogFor, data.targets).includes(query.body))
    : [];

  return (
    <section
      aria-label={active ? 'Search results' : 'Featured findings'}
      className="panel pointer-events-auto flex max-h-full flex-col overflow-hidden"
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="text-[17px] font-semibold">{active ? 'Ranked matches' : 'Featured findings'}</h2>
        {active && <span className="font-mono text-xs text-[var(--muted)]">{results.length}</span>}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand list' : 'Collapse list'}
          className="ml-auto grid h-7 w-7 place-items-center rounded-md hover:bg-white/10"
        >
          {collapsed ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>
      </header>
      {!collapsed && (
        <div className="scroll-thin flex-1 overflow-y-auto">
          <InterpretationChips />
          {status === 'loading' && (
            <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          )}

          {status === 'ready' && active && (
            <>
              <label className="flex items-center gap-2 border-b border-white/5 px-4 py-2 text-xs text-[var(--muted)]">
                <input type="checkbox" checked={showFeatured} onChange={(e) => setShowFeatured(e.target.checked)} />
                Show featured findings on the globe
              </label>
              {rows.length === 0 && (
                <div className="p-4 text-sm text-[var(--muted)]">
                  <p className="mb-2 text-[var(--text)]">No matches.</p>
                  <p>
                    Try relaxing the "must match" constraints or lowering importance in{' '}
                    <button type="button" className="underline hover:text-white" onClick={() => setDrawerOpen(true)}>
                      Fine-tune
                    </button>
                    .
                  </p>
                </div>
              )}
              <ol>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => open(r.id)}
                      onMouseEnter={() => hover(r.id)}
                      onMouseLeave={() => hover(null)}
                      onFocus={() => hover(r.id)}
                      onBlur={() => hover(null)}
                      aria-current={selectedId === r.id ? 'true' : undefined}
                      className={`block w-full border-b border-white/5 px-4 py-2.5 text-left transition-colors hover:bg-white/5 ${
                        selectedId === r.id ? 'bg-white/8' : ''
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="w-5 shrink-0 font-mono text-xs text-[var(--muted)] tabular">{r.rank}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</span>
                        {r.partial && <span className="text-[10px] text-[var(--mid)]">Partial data</span>}
                      </div>
                      <div className="ml-7 font-mono text-[11px] text-[var(--muted)]">{r.region}</div>
                      <div className="ml-7 mt-1">
                        <ScoreBar score={r.score} t={r.t} />
                      </div>
                      <div className="ml-7 mt-1.5 flex flex-wrap gap-1">
                        {r.best.map((b) => (
                          <Chip key={b} tone="good">
                            {b}
                          </Chip>
                        ))}
                        {r.worst && <Chip tone="bad">{r.worst}</Chip>}
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {status === 'ready' && !active && (
            <ul>
              {featured.map((f) => {
                const bodies = featuredBodies(f.analogFor, data!.targets);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => open(f.id)}
                      onMouseEnter={() => hover(f.id)}
                      onMouseLeave={() => hover(null)}
                      onFocus={() => hover(f.id)}
                      onBlur={() => hover(null)}
                      aria-current={selectedId === f.id ? 'true' : undefined}
                      className={`flex w-full gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5 ${
                        selectedId === f.id ? 'bg-white/8' : ''
                      }`}
                    >
                      <MapPin size={16} className="mt-0.5 shrink-0" style={{ color: bodies[0] === 'mars' ? 'var(--mars)' : 'var(--moon)' }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{f.name}</span>
                        <span className="block truncate text-xs text-[var(--muted)]">{f.headline}</span>
                        <span className="mt-1 flex gap-1">
                          {bodies.map((b) => (
                            <span key={b} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `var(--${b})` }}>
                              {b}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
