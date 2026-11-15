import { useMemo } from 'react';
import type { AppData } from '../data/loaders';
import type { FeaturedSite } from '../data/schemas';
import { queryFromTarget, scoreVector, valuesGetter } from '../scoring/score';
import type { ParsedQuery } from '../scoring/types';
import { isSearchActive, useApp } from '../state/store';
import { cellName, nearestFeatured } from './sites';

export type CardKind = 'new' | 'known' | 'reserve' | 'engine';

export interface CardModel {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  body: 'moon' | 'mars';
  kind: CardKind;
  score: number | null;
  headline: string;
  shortfall: string | null;
  thumb: string | null;
  status?: string;
  valueSource?: 'computed' | 'literature';
}

export type ActiveBody = 'moon' | 'mars';
export const activeBody = (b: 'moon' | 'mars' | 'either'): ActiveBody => (b === 'either' ? 'moon' : b);

type Gap = FeaturedSite['gaps'][number];

export interface GapPhrase {
  sign: '+' | '-';
  abs: number;
  unit: string;
  word: string;
}

function round3(n: number): number {
  return Number(n.toPrecision(3));
}

/** Break a gap into sign, size, unit and a plain word ("warmer", "higher"). */
export function gapPhrase(g: Gap): GapPhrase | null {
  if (g.earth === null || g.target === null) return null;
  const d = g.earth - g.target;
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  const unit = g.unit.trim();
  const temp = unit === 'K' || /temp/i.test(g.label);
  const up = d > 0;
  const word = temp ? (up ? 'warmer' : 'colder') : up ? 'higher' : 'lower';
  return { sign: up ? '+' : '-', abs: round3(Math.abs(d)), unit, word };
}

export function formatGap(g: Gap): string | null {
  const p = gapPhrase(g);
  if (!p) return null;
  return `${p.sign === '-' ? '−' : '+'}${p.abs}${p.unit ? ' ' + p.unit : ''} ${p.word}`;
}

function shortfallOf(f: FeaturedSite): string | null {
  for (const g of f.gaps) {
    const t = formatGap(g);
    if (t) return t;
  }
  return f.shortfalls[0] ?? null;
}

function siteBody(f: FeaturedSite, data: AppData): ActiveBody | null {
  if (f.body) return f.body;
  const t = data.targets.find((x) => x.id === f.analogFor[0]);
  return t ? t.body : null;
}

function targetFor(f: FeaturedSite, data: AppData, body: ActiveBody) {
  const own = f.analogFor.map((id) => data.targets.find((t) => t.id === id)).filter((t) => !!t);
  return own.find((t) => t!.body === body) ?? own[0] ?? null;
}

function toCard(f: FeaturedSite, body: ActiveBody, score: number | null): CardModel {
  const kind: CardKind = f.kind ?? 'known';
  return {
    id: f.id,
    name: f.name,
    region: f.region,
    lat: f.lat,
    lon: f.lon,
    body,
    kind,
    score,
    headline: f.headline,
    shortfall: shortfallOf(f),
    thumb: f.images?.eo ?? f.images?.twin ?? f.images?.target ?? null,
    status: f.status,
    valueSource: f.valueSource,
  };
}

const rankOf = (f: FeaturedSite) => f.rank ?? 999;

function buildCards(data: AppData, body: ActiveBody, query: ParsedQuery, searching: boolean, results: { id: string; index: number; score: number }[]) {
  const sites = data.featured.filter((f) => siteBody(f, data) === body);
  const scored = sites.map((f) => {
    const get = valuesGetter(data.featuredNorm[f.id] ?? {});
    let q: ParsedQuery | null = query;
    if (!searching) {
      const t = targetFor(f, data, body);
      q = t ? queryFromTarget(t, data.features) : null;
    }
    const s = q ? scoreVector(get, searching ? query : { ...q, required: [] }) : null;
    return { f, score: s ? Math.round(s.score) : null };
  });

  const byRank = (a: { f: FeaturedSite; score: number | null }, b: { f: FeaturedSite; score: number | null }) =>
    rankOf(a.f) - rankOf(b.f) || (b.score ?? -1) - (a.score ?? -1);

  if (!searching) {
    const cards = scored
      .filter((x) => x.f.kind !== 'reserve')
      .sort(byRank)
      .slice(0, 5)
      .map((x) => toCard(x.f, body, x.score));
    const reserves = scored
      .filter((x) => x.f.kind === 'reserve')
      .sort(byRank)
      .map((x) => toCard(x.f, body, x.score));
    return { cards, reserves, mode: 'featured' as const };
  }

  const featuredCards = scored.filter((x) => x.score !== null && x.f.kind !== 'reserve').map((x) => toCard(x.f, body, x.score));
  const listed = featuredCards.map((c) => data.featured.find((f) => f.id === c.id)!);
  const engine: CardModel[] = [];
  for (const r of results) {
    if (engine.length >= 5) break;
    const lat = data.cells.lat[r.index];
    const lon = data.cells.lon[r.index];
    const near = nearestFeatured(data, lat, lon, 200);
    if (near && listed.some((f) => f.id === near.id)) continue;
    const { name, region } = cellName(data, r.index);
    engine.push({
      id: r.id,
      name,
      region,
      lat,
      lon,
      body,
      kind: 'engine',
      score: Math.round(r.score),
      headline: 'Matches your description. Found by the search engine, not curated.',
      shortfall: null,
      thumb: null,
    });
  }
  const cards = [...featuredCards, ...engine].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const reserves = scored
    .filter((x) => x.score !== null && x.f.kind === 'reserve')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((x) => toCard(x.f, body, x.score));
  return { cards, reserves, mode: 'search' as const };
}

/** Cards for the left rail. Re-ranks live while the query changes. */
export function useCards(): { cards: CardModel[]; reserves: CardModel[]; mode: 'featured' | 'search' } {
  const data = useApp((s) => s.data);
  const query = useApp((s) => s.query);
  const results = useApp((s) => s.results);
  return useMemo(() => {
    if (!data) return { cards: [], reserves: [], mode: 'featured' as const };
    return buildCards(data, activeBody(query.body), query, isSearchActive(query), results);
  }, [data, query, results]);
}
