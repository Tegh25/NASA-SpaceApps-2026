import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BodyChoice, ParsedQuery, Weight } from '../scoring/types';
import { emptyQuery } from '../scoring/types';
import { isSearchActive, useApp, type QuerySource } from '../state/store';

export interface UrlState {
  q: string;
  preset: string | null;
  query: ParsedQuery;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function encodeQuery(text: string, preset: string | null, q: ParsedQuery, source: QuerySource): URLSearchParams {
  const p = new URLSearchParams();
  if (q.body !== 'either') p.set('body', q.body);
  if (!isSearchActive(q)) return p;
  if (text && source === 'text') p.set('q', text);
  if (preset && source === 'preset') {
    p.set('preset', preset);
    return p;
  }
  const keys = Object.keys(q.targets).filter((k) => q.targets[k] !== undefined);
  p.set('t', keys.map((k) => `${k}:${r2(q.targets[k]!)}`).join(','));
  p.set('w', keys.map((k) => `${k}:${q.weights[k] ?? 0}`).join(','));
  if (q.required.length) p.set('r', q.required.join(','));
  return p;
}

export function decodeQuery(p: URLSearchParams, knownKeys: Set<string>): UrlState | null {
  const body = (['moon', 'mars'].includes(p.get('body') ?? '') ? p.get('body') : 'either') as BodyChoice;
  const q = { ...emptyQuery(), body };
  const preset = p.get('preset');
  const pairs = (s: string | null) =>
    (s ?? '')
      .split(',')
      .map((x) => x.split(':'))
      .filter(([k, v]) => k && knownKeys.has(k) && v !== undefined && Number.isFinite(Number(v)));
  for (const [k, v] of pairs(p.get('t'))) q.targets[k] = Math.min(1, Math.max(0, Number(v)));
  for (const [k, v] of pairs(p.get('w'))) q.weights[k] = Math.min(3, Math.max(0, Math.round(Number(v)))) as Weight;
  q.required = (p.get('r') ?? '').split(',').filter((k) => knownKeys.has(k) && q.targets[k] !== undefined);
  if (!preset && !isSearchActive(q) && body === 'either') return null;
  return { q: p.get('q') ?? '', preset, query: q };
}

/** Two-way sync between the store's query and the URL search params. */
export function useUrlSync() {
  const [params, setParams] = useSearchParams();
  const status = useApp((s) => s.status);
  const query = useApp((s) => s.query);
  const queryText = useApp((s) => s.queryText);
  const presetId = useApp((s) => s.presetId);
  const source = useApp((s) => s.source);
  const hydrated = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || hydrated.current) return;
    hydrated.current = true;
    const data = useApp.getState().data!;
    const st = decodeQuery(params, new Set(data.features.map((f) => f.key)));
    if (!st) return;
    const app = useApp.getState();
    if (st.preset && data.targets.some((t) => t.id === st.preset)) {
      app.applyPreset(st.preset);
      app.setBody(st.query.body);
    } else if (isSearchActive(st.query)) {
      useApp.setState({ queryText: st.q, showFeatured: false, parserMode: null });
      app.setQuery(st.query, st.q ? 'text' : 'manual');
    } else {
      app.setBody(st.query.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      const next = encodeQuery(queryText, presetId, query, source).toString();
      if (next !== params.toString()) setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, queryText, presetId, source]);
}
