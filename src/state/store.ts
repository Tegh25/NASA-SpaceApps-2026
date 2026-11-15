import { create } from 'zustand';
import { loadAppData, type AppData } from '../data/loaders';
import { parseText } from '../parse/client';
import { queryFromTarget, scoreCells } from '../scoring/score';
import type { BodyChoice, ParsedQuery, ScoredCell, Weight } from '../scoring/types';
import { emptyQuery } from '../scoring/types';

export type QuerySource = 'none' | 'text' | 'preset' | 'manual';
export type Fidelity = 'photoreal' | 'terrain' | 'low';
export type TargetViewProfile = 'off' | 'moon' | 'mars';

export interface Result extends ScoredCell {
  id: string;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: AppData | null;

  query: ParsedQuery;
  queryText: string;
  source: QuerySource;
  presetId: string | null;
  parsing: boolean;
  parserMode: 'llm' | 'keyword' | null;
  unknownWords: string[];

  results: Result[];
  scoreMs: number;
  showFeatured: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  drawerOpen: boolean;
  /** Bumped to ask the globe to return to the whole-Earth view. */
  homeNonce: number;

  targetViewProfile: TargetViewProfile;
  fidelity: Fidelity;

  load: () => Promise<void>;
  search: (text: string) => Promise<void>;
  applyPreset: (targetId: string | null) => void;
  setBody: (body: BodyChoice) => void;
  setTarget: (key: string, value: number) => void;
  setWeight: (key: string, w: Weight) => void;
  toggleRequired: (key: string) => void;
  removeFeature: (key: string) => void;
  setQuery: (q: ParsedQuery, source: QuerySource, presetId?: string | null) => void;
  reset: () => void;
  select: (id: string | null) => void;
  goHome: () => void;
  hover: (id: string | null) => void;
  setShowFeatured: (v: boolean) => void;
  setDrawerOpen: (v: boolean) => void;
  setTargetViewProfile: (p: TargetViewProfile) => void;
  setFidelity: (f: Fidelity) => void;
}

export const cellId = (index: number) => `cell-${index}`;

export function isSearchActive(q: ParsedQuery): boolean {
  return Object.entries(q.targets).some(([k, v]) => v !== undefined && (q.weights[k] ?? 0) > 0);
}

let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every query-changing action. A pending text parse that no longer holds the latest value is dropped. */
let querySeq = 0;
let loadInFlight: Promise<void> | null = null;

export const useApp = create<AppState>((set, get) => {
  const recompute = () => {
    const { data, query } = get();
    if (!data) return;
    const t0 = performance.now();
    const scored = isSearchActive(query) ? scoreCells(data.cells, query) : [];
    const scoreMs = performance.now() - t0;
    set({ results: scored.map((s) => ({ ...s, id: cellId(s.index) })), scoreMs });
  };
  const scheduleRecompute = (delay = 80) => {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recompute, delay);
  };
  const editQuery = (fn: (q: ParsedQuery) => void) => {
    const q = structuredClone(get().query);
    fn(q);
    querySeq++;
    set({ query: q, source: 'manual', presetId: get().source === 'preset' ? get().presetId : null, parsing: false });
    scheduleRecompute();
  };

  return {
    status: 'loading',
    error: null,
    data: null,
    query: emptyQuery(),
    queryText: '',
    source: 'none',
    presetId: null,
    parsing: false,
    parserMode: null,
    unknownWords: [],
    results: [],
    scoreMs: 0,
    showFeatured: true,
    selectedId: null,
    hoveredId: null,
    drawerOpen: false,
    homeNonce: 0,
    targetViewProfile: 'off',
    fidelity: 'low',

    load: async () => {
      // StrictMode and remounts call this twice; one fetch is enough.
      if (get().status === 'ready' || loadInFlight) return loadInFlight ?? undefined;
      set({ status: 'loading', error: null });
      loadInFlight = (async () => {
        try {
          const data = await loadAppData();
          set({ data, status: 'ready' });
          recompute();
        } catch (e) {
          console.error(e);
          set({ status: 'error', error: (e as Error).message });
        } finally {
          loadInFlight = null;
        }
      })();
      return loadInFlight;
    },

    search: async (text) => {
      const { data, query } = get();
      if (!data) return;
      const trimmed = text.trim();
      set({ queryText: trimmed });
      if (!trimmed) return get().reset();
      const seq = ++querySeq;
      set({ parsing: true });
      const res = await parseText(trimmed, data.features, query.body);
      // Superseded by a reset, preset, slider edit or newer search while parsing: that action already
      // cleared `parsing` and owns the query, so this result must not overwrite it.
      if (seq !== querySeq) return;
      set({
        parsing: false,
        // The body may have been toggled while the parse was in flight; keep the user's current choice.
        query: { ...res.query, body: get().query.body },
        parserMode: res.mode,
        unknownWords: res.unknown,
        source: 'text',
        presetId: null,
        showFeatured: false,
        selectedId: null,
      });
      recompute();
    },

    applyPreset: (targetId) => {
      const { data } = get();
      if (!data) return;
      if (!targetId) {
        querySeq++;
        set({ presetId: null, source: 'manual', parsing: false });
        return;
      }
      const t = data.targets.find((x) => x.id === targetId);
      if (!t) return;
      querySeq++;
      set({
        parsing: false,
        query: queryFromTarget(t, data.features),
        source: 'preset',
        presetId: t.id,
        parserMode: null,
        unknownWords: [],
        showFeatured: false,
      });
      recompute();
    },

    setBody: (body) => {
      set({ query: { ...get().query, body } });
    },
    setTarget: (key, value) =>
      editQuery((q) => {
        q.targets[key] = value;
        if (!q.weights[key]) q.weights[key] = 2;
      }),
    setWeight: (key, w) =>
      editQuery((q) => {
        q.weights[key] = w;
        if (w > 0 && q.targets[key] === undefined) q.targets[key] = 0.5;
      }),
    toggleRequired: (key) =>
      editQuery((q) => {
        if (q.required.includes(key)) q.required = q.required.filter((k) => k !== key);
        else {
          q.required.push(key);
          if (q.targets[key] === undefined) q.targets[key] = 0.5;
          if (!q.weights[key]) q.weights[key] = 2;
        }
      }),
    removeFeature: (key) =>
      editQuery((q) => {
        delete q.targets[key];
        delete q.weights[key];
        q.required = q.required.filter((k) => k !== key);
      }),
    setQuery: (q, source, presetId = null) => {
      querySeq++;
      set({ query: q, source, presetId, parsing: false });
      recompute();
    },
    reset: () => {
      querySeq++;
      set({
        parsing: false,
        query: { ...emptyQuery(), body: get().query.body },
        queryText: '',
        source: 'none',
        presetId: null,
        parserMode: null,
        unknownWords: [],
        results: [],
        showFeatured: true,
      });
    },
    select: (id) => set({ selectedId: id }),
    goHome: () => set((st) => ({ homeNonce: st.homeNonce + 1 })),
    hover: (id) => set({ hoveredId: id }),
    setShowFeatured: (v) => set({ showFeatured: v }),
    setDrawerOpen: (v) => set({ drawerOpen: v }),
    setTargetViewProfile: (p) => set({ targetViewProfile: p }),
    setFidelity: (f) => set({ fidelity: f }),
  };
});
