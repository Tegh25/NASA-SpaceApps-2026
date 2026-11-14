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
    set({ query: q, source: 'manual', presetId: get().source === 'preset' ? get().presetId : null });
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
    targetViewProfile: 'off',
    fidelity: 'low',

    load: async () => {
      set({ status: 'loading', error: null });
      try {
        const data = await loadAppData();
        set({ data, status: 'ready' });
        recompute();
      } catch (e) {
        console.error(e);
        set({ status: 'error', error: (e as Error).message });
      }
    },

    search: async (text) => {
      const { data, query } = get();
      if (!data) return;
      const trimmed = text.trim();
      set({ queryText: trimmed });
      if (!trimmed) return get().reset();
      set({ parsing: true });
      const res = await parseText(trimmed, data.features, query.body);
      if (get().queryText !== trimmed) return;
      set({
        parsing: false,
        query: res.query,
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
        set({ presetId: null, source: 'manual' });
        return;
      }
      const t = data.targets.find((x) => x.id === targetId);
      if (!t) return;
      set({
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
      set({ query: q, source, presetId });
      recompute();
    },
    reset: () => {
      set({
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
    hover: (id) => set({ hoveredId: id }),
    setShowFeatured: (v) => set({ showFeatured: v }),
    setDrawerOpen: (v) => set({ drawerOpen: v }),
    setTargetViewProfile: (p) => set({ targetViewProfile: p }),
    setFidelity: (f) => set({ fidelity: f }),
  };
});
