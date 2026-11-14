import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { prefersReducedMotion } from '../globe/viewer';
import type { BodyChoice } from '../scoring/types';
import { isSearchActive, useApp } from '../state/store';
import { Chip, levelWord, Segmented } from './common';

const EXAMPLES = [
  'Cold, dry, steep crater rim with ice below',
  'Flat basaltic plain, no vegetation, very remote',
  'Sunlit ridge near permanently dark terrain',
];

export function SearchBar() {
  const queryText = useApp((s) => s.queryText);
  const parsing = useApp((s) => s.parsing);
  const body = useApp((s) => s.query.body);
  const drawerOpen = useApp((s) => s.drawerOpen);
  const { search, setBody, setDrawerOpen, reset } = useApp.getState();
  const [text, setText] = useState(queryText);
  const [ph, setPh] = useState(0);

  useEffect(() => setText(queryText), [queryText]);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setPh((p) => (p + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search(text);
  };

  return (
    <div className="w-full">
      <form onSubmit={submit} role="search" className="panel flex items-center gap-1 p-1.5">
        <label htmlFor="q" className="sr-only">
          Describe a lunar or Martian environment
        </label>
        <Search size={18} className="ml-2 shrink-0 text-[var(--muted)]" aria-hidden />
        <input
          id="q"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={EXAMPLES[ph]}
          maxLength={500}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] text-[var(--text)] placeholder:text-[var(--muted)]/80 focus:outline-none"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText('');
              reset();
            }}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-white/10 hover:text-white"
            aria-label="Clear search"
          >
            <X size={16} aria-hidden />
          </button>
        )}
        <div className="hidden lg:block">
          <BodyToggle body={body} setBody={setBody} />
        </div>
        <button
          type="submit"
          disabled={parsing}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--moon)] px-3.5 py-2 text-sm font-semibold text-[#0b1220] transition-colors hover:bg-white disabled:opacity-70"
        >
          {parsing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} aria-hidden />}
          <span className="hidden sm:inline">Search</span>
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-expanded={drawerOpen}
          aria-controls="finetune"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            drawerOpen ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 text-[var(--text)] hover:bg-white/10'
          }`}
        >
          <SlidersHorizontal size={16} aria-hidden />
          <span className="hidden sm:inline">Fine-tune</span>
        </button>
      </form>
      <div className="mt-2 flex justify-center lg:hidden">
        <BodyToggle body={body} setBody={setBody} />
      </div>
    </div>
  );
}

function BodyToggle({ body, setBody }: { body: BodyChoice; setBody: (b: BodyChoice) => void }) {
  return (
    <Segmented<BodyChoice>
      label="Analog for"
      size="sm"
      value={body}
      onChange={setBody}
      options={[
        { value: 'moon', label: 'Moon' },
        { value: 'mars', label: 'Mars' },
        { value: 'either', label: 'Either' },
      ]}
    />
  );
}

export function InterpretationChips() {
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const parsing = useApp((s) => s.parsing);
  const parserMode = useApp((s) => s.parserMode);
  const unknown = useApp((s) => s.unknownWords);
  const source = useApp((s) => s.source);
  const presetId = useApp((s) => s.presetId);
  const { removeFeature, setDrawerOpen } = useApp.getState();

  if (parsing)
    return (
      <p className="border-b border-white/10 px-4 py-2.5 text-sm text-[var(--muted)]" role="status">
        Reading your description...
      </p>
    );
  if (!data || !isSearchActive(query)) return null;

  const byKey = new Map(data.features.map((f) => [f.key, f]));
  const keys = data.features.map((f) => f.key).filter((k) => query.targets[k] !== undefined && (query.weights[k] ?? 0) > 0);
  const preset = presetId ? data.targets.find((t) => t.id === presetId) : null;
  const shown = source === 'preset' ? [] : keys;

  return (
    <div className="border-b border-white/10 px-4 py-2.5" aria-live="polite">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">How we read it</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {preset && (
          <Chip tone={preset.body} onClick={() => setDrawerOpen(true)} title="Open fine-tune controls">
            Preset: {preset.name} ({keys.length} features)
          </Chip>
        )}
        {shown.map((k) => (
          <Chip
            key={k}
            tone={query.required.includes(k) ? 'good' : 'default'}
            onClick={() => setDrawerOpen(true)}
            onRemove={() => removeFeature(k)}
            removeLabel={`Remove ${byKey.get(k)?.label ?? k}`}
            title="Open fine-tune controls"
          >
            {byKey.get(k)?.label ?? k}: {levelWord(query.targets[k]!)}
            {query.required.includes(k) ? ', required' : ''}
          </Chip>
        ))}
        {query.tags?.includes('lava_tube') && (
          <Chip tone="mars" title="Lava tubes are scored from surface data only">
            Lava tube: surface score only
          </Chip>
        )}
      </div>
      {(query.notes || parserMode === 'keyword' || unknown.length > 0) && source === 'text' && (
        <div className="mt-1.5 space-y-0.5 text-xs text-[var(--muted)]">
          {parserMode === 'llm' && query.notes && <p>{query.notes}</p>}
          {parserMode === 'keyword' && <p>Using basic matching.</p>}
          {unknown.length > 0 && <p>Didn't understand: {unknown.slice(0, 8).join(', ')}</p>}
        </div>
      )}
    </div>
  );
}
