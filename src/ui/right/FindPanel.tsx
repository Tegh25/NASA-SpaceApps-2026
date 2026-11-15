import { ArrowRight, Loader2, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { FeatureDef, Target } from '../../data/schemas';
import { normalize } from '../../scoring/normalize';
import type { Weight } from '../../scoring/types';
import { isSearchActive, useApp } from '../../state/store';
import { levelWord } from '../common';
import { MetricSlider, type Tick } from './MetricSlider';

const PRIMARY = ['temp_mean_k', 'precip_mm_yr', 'slope_deg', 'roughness_m', 'ice_proxy', 'vegetation_ndvi'];

function useReferenceTarget(): Target | null {
  const data = useApp((s) => s.data);
  const body = useApp((s) => s.query.body);
  const presetId = useApp((s) => s.presetId);
  return useMemo(() => {
    if (!data) return null;
    const b = body === 'mars' ? 'mars' : 'moon';
    const byId = (id?: string) => data.targets.find((t) => t.id === id);
    const preset = byId(presetId ?? undefined);
    if (preset) return preset;
    const sorted = [...data.featured].sort((a, b2) => (a.rank ?? 99) - (b2.rank ?? 99));
    for (const f of sorted) {
      const t = byId(f.analogFor[0]);
      if (t && (f.body ?? t.body) === b && t.body === b) return t;
    }
    return data.targets.find((t) => t.body === b) ?? null;
  }, [data, body, presetId]);
}

export function FindPanel() {
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const source = useApp((s) => s.source);
  const presetId = useApp((s) => s.presetId);
  const queryText = useApp((s) => s.queryText);
  const parsing = useApp((s) => s.parsing);
  const parserMode = useApp((s) => s.parserMode);
  const unknown = useApp((s) => s.unknownWords);
  const scoreMs = useApp((s) => s.scoreMs);
  const resultCount = useApp((s) => s.results.length);
  const { search, applyPreset, setTarget, setWeight, toggleRequired, removeFeature, reset } = useApp.getState();
  const ref = useReferenceTarget();

  const [text, setText] = useState(queryText);
  useEffect(() => setText(queryText), [queryText]);

  const featByKey = useMemo(() => new Map((data?.features ?? []).map((f) => [f.key, f])), [data]);
  const primary = PRIMARY.map((k) => featByKey.get(k)).filter((f): f is FeatureDef => !!f);
  const advanced = (data?.features ?? []).filter((f) => !PRIMARY.includes(f.key));

  if (!data) {
    return (
      <div className="flex h-full flex-col gap-3 p-5" aria-busy="true">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-64" />
        <div className="skeleton mt-4 h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  const bodyKey = query.body === 'mars' ? 'mars' : 'moon';
  const bodyName = bodyKey === 'mars' ? 'Mars' : 'Moon';
  const chips = data.targets.filter((t) => t.body === bodyKey);
  const active = isSearchActive(query);
  const activeKeys = data.features.filter((f) => query.targets[f.key] !== undefined && (query.weights[f.key] ?? 0) > 0);

  const tickFor = (fd: FeatureDef): Tick | null => {
    if (!ref) return null;
    const n = normalize(ref.values[fd.key], fd.norm);
    return n === null ? null : { norm: n, label: ref.name };
  };

  const submit = () => search(text);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-5 pb-3 pt-5">
        <h2 className="font-display text-[22px] leading-tight">Find a match</h2>
        <p className="mt-1 text-[13px] leading-snug text-[var(--dim)]">Tune the conditions and the location cards re-rank live.</p>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <section aria-labelledby="start-from" className="rise-in" style={{ '--i': 0 } as React.CSSProperties}>
          <h3 id="start-from" className="mb-2 text-[13px] font-medium text-[var(--dim)]">
            Start from a {bodyName} target
          </h3>
          <div className="scroll-thin -mx-5 flex gap-2 overflow-x-auto px-5 pb-2" role="group" aria-label={`${bodyName} targets`}>
            {chips.map((t) => {
              const on = presetId === t.id && source === 'preset';
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => applyPreset(t.id)}
                  className={`glass-capsule shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13px] ${on ? 'text-[var(--ink)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}`}
                >
                  {t.name}
                </button>
              );
            })}
            {chips.length === 0 && <span className="text-xs text-[var(--faint)]">No {bodyName} targets loaded.</span>}
          </div>
          {bodyKey === 'mars' && chips.length > 0 && (
            <p className="mt-1 text-xs text-[var(--faint)]">Indicative: Mars targets use 200 m terrain, coarser than the Moon.</p>
          )}
        </section>

        <section aria-label="Conditions" className="rise-in mt-5 space-y-3.5" style={{ '--i': 1 } as React.CSSProperties}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-medium text-[var(--dim)]">Conditions</h3>
            {ref && <span className="text-xs text-[var(--faint)]">Ticks mark {ref.name}</span>}
          </div>
          {primary.map((fd) => (
            <MetricSlider
              key={fd.key}
              fd={fd}
              value={query.targets[fd.key]}
              tick={tickFor(fd)}
              onChange={(v) => setTarget(fd.key, v)}
              onClear={() => removeFeature(fd.key)}
            />
          ))}
          {primary.length === 0 && <p className="text-xs text-[var(--faint)]">No tunable conditions in the loaded data.</p>}
        </section>

        <section aria-label="Describe a place" className="rise-in mt-6" style={{ '--i': 2 } as React.CSSProperties}>
          <label htmlFor="find-text" className="mb-2 block text-[13px] font-medium text-[var(--dim)]">
            Or describe it
          </label>
          <div className="flex items-end gap-3">
            <textarea
              id="find-text"
              rows={2}
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder="cold, dry, flat basaltic plain"
              className="min-h-[56px] flex-1 resize-none rounded-[16px] border border-white/20 bg-black/30 px-3.5 py-2 text-sm text-[var(--ink)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={parsing}
              aria-label="Search"
              title="Search (Enter)"
              className="glass-drop grid h-12 w-12 shrink-0 place-items-center disabled:opacity-70"
            >
              {parsing ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ArrowRight size={20} aria-hidden />}
            </button>
          </div>

          <div aria-live="polite" className="mt-3">
            {parsing && <p className="text-xs text-[var(--dim)]" role="status">Reading your description</p>}
            {!parsing && source === 'text' && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {activeKeys.map((f) => (
                    <span key={f.key} className="glass-capsule inline-flex items-center text-xs">
                      <span className="px-2 py-1">
                        {f.label} <span className="num text-[var(--accent)]">{levelWord(query.targets[f.key]!)}</span>
                        {query.required.includes(f.key) ? <span className="text-[var(--good)]">, must match</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFeature(f.key)}
                        aria-label={`Remove ${f.label}`}
                        className="grid h-6 w-6 place-items-center rounded-full text-[var(--faint)] hover:text-[var(--ink)]"
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  ))}
                  {activeKeys.length === 0 && <span className="text-xs text-[var(--faint)]">No measurable conditions found in that text.</span>}
                </div>
                <p className="mt-1.5 text-xs text-[var(--faint)]">
                  {parserMode === 'llm' ? 'AI parser' : parserMode === 'keyword' ? 'Keyword parser' : ''}
                  {parserMode === 'llm' && query.notes ? `: ${query.notes}` : ''}
                </p>
                {unknown.length > 0 && <p className="text-xs text-[var(--mid)]">Did not understand: {unknown.slice(0, 8).join(', ')}</p>}
              </>
            )}
          </div>
        </section>

        <details className="rise-in group mt-5 border-t border-[var(--rule)] pt-3" style={{ '--i': 3 } as React.CSSProperties}>
          <summary className="flex list-none items-center justify-between text-[13px] font-medium text-[var(--dim)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            Advanced
            <span aria-hidden className="num text-[var(--faint)] transition-transform group-open:rotate-90">
              {'>'}
            </span>
          </summary>
          <div className="mt-3 space-y-4">
            {advanced.map((fd) => {
              const on = query.targets[fd.key] !== undefined;
              const w = (query.weights[fd.key] ?? 0) as Weight;
              const req = query.required.includes(fd.key);
              return (
                <div key={fd.key}>
                  <MetricSlider
                    fd={fd}
                    value={query.targets[fd.key]}
                    tick={tickFor(fd)}
                    onChange={(v) => setTarget(fd.key, v)}
                    onClear={() => removeFeature(fd.key)}
                  />
                  {on && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div role="radiogroup" aria-label={`Importance of ${fd.label}`} className="glass-capsule inline-flex overflow-hidden">
                        {([1, 2, 3] as Weight[]).map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={w === n}
                            aria-label={`Importance ${n}`}
                            onClick={() => setWeight(fd.key, n)}
                            className={`num h-6 w-7 text-xs transition-colors ${w === n ? 'bg-[var(--accent)] font-medium text-[var(--void)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--dim)]">
                        <input type="checkbox" checked={req} onChange={() => toggleRequired(fd.key)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                        Must match
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            {advanced.length === 0 && <p className="text-xs text-[var(--faint)]">No extra conditions in the loaded data.</p>}
            <button
              type="button"
              onClick={reset}
              className="glass-capsule flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-[var(--dim)] hover:text-[var(--ink)]"
            >
              <RotateCcw size={12} aria-hidden /> Reset all
            </button>
          </div>
        </details>
      </div>

      <footer className="num shrink-0 border-t border-[var(--rule)] px-5 py-3 text-xs text-[var(--dim)]" role="status">
        {active
          ? `${data.cells.count.toLocaleString('en-US')} blocks scored in ${Math.max(1, Math.round(scoreMs))} ms, ${resultCount} ranked`
          : `${data.cells.count.toLocaleString('en-US')} Earth blocks ready to score`}
      </footer>
    </div>
  );
}
