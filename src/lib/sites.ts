import type { AppData } from '../data/loaders';
import type { FeatureDef, FeaturedSite, Target } from '../data/schemas';
import { denormalize } from '../scoring/normalize';
import { breakdown, cellGetter, queryFromTarget, scoreVector, valuesGetter, type VectorScore } from '../scoring/score';
import type { BreakdownRow, ParsedQuery } from '../scoring/types';
import { formatLatLon, haversineKm } from './geo';

export interface SiteView {
  id: string;
  kind: 'featured' | 'cell';
  name: string;
  region: string;
  lat: number;
  lon: number;
  norm: (key: string) => number | null;
  raw: (key: string) => number | null;
  featured?: FeaturedSite;
  index?: number;
}

export const GLOBAL_LIMITS = [
  'Gravity: Earth is 1 g. The Moon is about 1/6 g and Mars about 0.38 g.',
  'Atmosphere: the Moon is a near vacuum and Mars has under 1% of Earth sea-level pressure.',
  'Radiation: no Earth site lacks the protection of a magnetosphere and thick atmosphere.',
  'Regolith: lunar and Martian dust chemistry, grain shape and electrostatic behaviour differ from any Earth soil.',
  'Communication delay: about 1.3 s each way to the Moon and 3 to 22 minutes to Mars.',
];

export function nearestFeatured(data: AppData, lat: number, lon: number, maxKm = 200): FeaturedSite | null {
  let best: FeaturedSite | null = null;
  let bestD = maxKm;
  for (const f of data.featured) {
    const d = haversineKm(lat, lon, f.lat, f.lon);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

export function cellName(data: AppData, index: number): { name: string; region: string } {
  const lat = data.cells.lat[index];
  const lon = data.cells.lon[index];
  const region = data.cells.region?.[index] ?? '';
  const near = nearestFeatured(data, lat, lon);
  if (near) return { name: `Near ${near.name}`, region: region || near.region };
  return { name: region || formatLatLon(lat, lon, 1), region: formatLatLon(lat, lon, 1) };
}

export function getSite(data: AppData, id: string | null | undefined): SiteView | null {
  if (!id) return null;
  if (id.startsWith('cell-')) {
    const index = Number(id.slice(5));
    if (!Number.isInteger(index) || index < 0 || index >= data.cells.count) return null;
    const { name, region } = cellName(data, index);
    return {
      id,
      kind: 'cell',
      name,
      region,
      lat: data.cells.lat[index],
      lon: data.cells.lon[index],
      norm: cellGetter(data.cells, index),
      raw: (k) => {
        const col = data.cells.raw[k];
        const v = col?.[index];
        return v === undefined || Number.isNaN(v) ? null : v;
      },
      index,
    };
  }
  const f = data.featured.find((x) => x.id === id);
  if (!f) return null;
  const norm = data.featuredNorm[f.id] ?? {};
  return {
    id,
    kind: 'featured',
    name: f.name,
    region: f.region,
    lat: f.lat,
    lon: f.lon,
    norm: valuesGetter(norm),
    raw: (k) => f.values[k] ?? null,
    featured: f,
  };
}

export interface Comparison {
  query: ParsedQuery;
  label: string;
  target: Target | null;
}

/** What the detail panel compares a site against: the active search, else the site's first target. */
export function comparisonFor(
  data: AppData,
  site: SiteView,
  query: ParsedQuery,
  searchActive: boolean,
  presetId: string | null,
): Comparison | null {
  if (searchActive) {
    const target = presetId ? (data.targets.find((t) => t.id === presetId) ?? null) : null;
    return { query, label: target ? target.name : 'your description', target };
  }
  const tid = site.featured?.analogFor[0];
  const target = tid ? data.targets.find((t) => t.id === tid) : undefined;
  if (!target) return null;
  return { query: queryFromTarget(target, data.features), label: target.name, target };
}

export interface SiteAnalysis {
  score: VectorScore | null;
  rows: BreakdownRow[];
}

export function analyse(site: SiteView, cmp: Comparison, features: FeatureDef[]): SiteAnalysis {
  // Score without hard filters so a featured site that fails "must match" still shows its numbers.
  const score = scoreVector(site.norm, { ...cmp.query, required: [] });
  return { score, rows: breakdown(site.norm, cmp.query, features) };
}

export function targetRaw(row: BreakdownRow, fd: FeatureDef, target: Target | null): number | null {
  if (target) {
    const v = target.values[fd.key];
    if (v !== undefined && v !== null) return v;
  }
  return row.target === null ? null : denormalize(row.target, fd.norm);
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Template from product guide section 8.5. Facts only, all derived from data. */
export function autoDescription(site: SiteView, analysis: SiteAnalysis, features: FeatureDef[], label: string): string {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const scored = analysis.rows.filter((r) => r.diff !== null && r.weight > 0);
  if (!analysis.score || !scored.length) return `${site.name} has no comparable data for ${label}.`;
  const best = [...scored].sort((a, b) => a.diff! - b.diff! || b.weight - a.weight).slice(0, 2);
  const worst = [...scored].sort((a, b) => b.diff! - a.diff! || b.weight - a.weight)[0];
  const names = best.map((r) => lower(byKey.get(r.key)?.label ?? r.key));
  const strong = names.length > 1 ? `${names[0]} and ${names[1]}` : names[0];
  const worstName = lower(byKey.get(worst.key)?.label ?? worst.key);
  return `${site.name} scores ${Math.round(analysis.score.score)}/100 against ${label}. It is a strong match on ${strong}. It differs most in ${worstName}. Like every Earth analog, it cannot reproduce reduced gravity, vacuum or the space radiation environment.`;
}
