import { RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { formatValue } from '../lib/geo';
import { denormalize } from '../scoring/normalize';
import type { Weight } from '../scoring/types';
import { useApp } from '../state/store';
import { Segmented } from './common';

const WEIGHTS: { value: Weight; label: string; title: string }[] = [
  { value: 0, label: 'Ignore', title: 'Ignore this feature' },
  { value: 1, label: 'Low', title: 'Low importance' },
  { value: 2, label: 'Normal', title: 'Normal importance' },
  { value: 3, label: 'High', title: 'High importance' },
];

export function FineTuneDrawer() {
  const open = useApp((s) => s.drawerOpen);
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const presetId = useApp((s) => s.presetId);
  const { setDrawerOpen, applyPreset, setTarget, setWeight, toggleRequired, reset } = useApp.getState();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setDrawerOpen]);

  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>['features']>();
    for (const f of data?.features ?? []) {
      if (!m.has(f.group)) m.set(f.group, []);
      m.get(f.group)!.push(f);
    }
    return [...m.entries()];
  }, [data]);

  if (!open || !data) return null;
  const targets = data.targets.filter((t) => query.body === 'either' || t.body === query.body);

  return (
    <aside
      id="finetune"
      aria-label="Fine-tune controls"
      className="panel pointer-events-auto fixed inset-x-2 bottom-2 top-28 z-40 flex flex-col md:bottom-4 md:left-[360px] md:right-4 md:top-[132px] lg:right-auto lg:top-[84px] lg:w-[520px]"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="text-lg font-semibold">Fine-tune</h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-[var(--muted)] hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} aria-hidden /> Reset
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close fine-tune controls"
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>
      <div className="border-b border-white/10 px-4 py-3">
        <label htmlFor="preset" className="mb-1 block text-xs font-medium text-[var(--muted)]">
          Preset
        </label>
        <select
          id="preset"
          value={presetId ?? ''}
          onChange={(e) => applyPreset(e.target.value || null)}
          className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm"
        >
          <option value="">Custom</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.body === 'moon' ? 'Moon' : 'Mars'}: {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4">
        {groups.map(([group, feats]) => (
          <fieldset key={group} className="mt-4">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{group}</legend>
            <div className="space-y-3">
              {feats.map((f) => {
                const t = query.targets[f.key];
                const w = (query.weights[f.key] ?? 0) as Weight;
                const req = query.required.includes(f.key);
                const val = t ?? 0.5;
                return (
                  <div key={f.key} className={`rounded-lg border border-white/8 p-2.5 ${w === 0 ? 'opacity-70' : ''}`}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <label htmlFor={`t-${f.key}`} className="text-sm font-medium" title={f.description}>
                        {f.label}
                      </label>
                      <span className="font-mono text-xs text-[var(--muted)] tabular">
                        {t === undefined ? 'not set' : formatValue(denormalize(t, f.norm), f.unit)}
                      </span>
                    </div>
                    <input
                      id={`t-${f.key}`}
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={val}
                      onChange={(e) => setTarget(f.key, Number(e.target.value))}
                      aria-valuetext={formatValue(denormalize(val, f.norm), f.unit)}
                      className="w-full"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <Segmented<Weight> size="sm" label={`${f.label} importance`} value={w} options={WEIGHTS} onChange={(v) => setWeight(f.key, v)} />
                      <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        <input type="checkbox" checked={req} onChange={() => toggleRequired(f.key)} className="accent-[var(--good)]" />
                        Must match
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </aside>
  );
}
