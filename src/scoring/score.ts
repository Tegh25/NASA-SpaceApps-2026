import type { EarthCellsFile, FeatureDef, Target } from '../data/schemas';
import { haversineKm } from '../lib/geo';
import { normalize } from './normalize';
import type { BreakdownRow, MatchLevel, NormCells, ParsedQuery, ScoredCell, Weight } from './types';

export const DEFAULT_TAU = 0.15;
export const DEFAULT_LIMIT = 25;
export const DEFAULT_NMS_KM = 300;
export const PARTIAL_DATA_THRESHOLD = 0.25;

export function matchLevel(diff: number): MatchLevel {
  if (diff < 0.15) return 'strong';
  if (diff <= 0.35) return 'partial';
  return 'weak';
}

export function buildNormCells(file: EarthCellsFile, features: FeatureDef[]): NormCells {
  const n = file.count;
  const lat = Float32Array.from(file.lat);
  const lon = Float32Array.from(file.lon);
  const norm: Record<string, Float32Array> = {};
  const raw: Record<string, Float32Array> = {};
  for (const fd of features) {
    const src = file.values[fd.key];
    const r = new Float32Array(n).fill(NaN);
    const c = new Float32Array(n).fill(NaN);
    if (src) {
      for (let i = 0; i < n; i++) {
        const v = src[i];
        if (v === null || v === undefined) continue;
        r[i] = v;
        c[i] = normalize(v, fd.norm) as number;
      }
    }
    norm[fd.key] = c;
    raw[fd.key] = r;
  }
  return { count: n, cellSizeDeg: file.cellSizeDeg, lat, lon, norm, raw, region: file.region };
}

interface ActiveFeature {
  key: string;
  t: number;
  w: number;
}

function activeFeatures(query: ParsedQuery): ActiveFeature[] {
  const out: ActiveFeature[] = [];
  for (const [key, t] of Object.entries(query.targets)) {
    if (t === undefined || t === null || Number.isNaN(t)) continue;
    const w = query.weights[key] ?? 0;
    if (w > 0) out.push({ key, t, w });
  }
  return out;
}

export interface VectorScore {
  score: number;
  confidence: number;
  partial: boolean;
  strongMean: number;
}

/** Score one normalized vector against a query. Returns null if no comparable features. */
export function scoreVector(
  get: (key: string) => number | null,
  query: ParsedQuery,
  tau = DEFAULT_TAU,
): VectorScore | null {
  const active = activeFeatures(query);
  if (!active.length) return null;
  for (const key of query.required) {
    const t = query.targets[key];
    if (t === undefined) continue;
    const c = get(key);
    if (c === null || Math.abs(t - c) > tau) return null;
  }
  let num = 0;
  let den = 0;
  let total = 0;
  let strongSum = 0;
  let strongN = 0;
  for (const { key, t, w } of active) {
    total += w;
    const c = get(key);
    if (c === null) continue;
    const d = Math.abs(t - c);
    num += w * d;
    den += w;
    if (w === 3) {
      strongSum += 1 - d;
      strongN++;
    }
  }
  if (den === 0) return null;
  const coverage = query.coverage ?? 1;
  // Features the target has no value for are not in `active`, so fold their share in here.
  const missingShare = 1 - (den / total) * coverage;
  return {
    score: 100 * (1 - num / den),
    confidence: 1 - missingShare,
    partial: missingShare > PARTIAL_DATA_THRESHOLD,
    strongMean: strongN ? strongSum / strongN : 0,
  };
}

export interface ScoreOptions {
  tau?: number;
  limit?: number;
  nmsKm?: number;
}

export function compareScored(a: ScoredCell, b: ScoredCell): number {
  return (
    Math.round(b.score) - Math.round(a.score) ||
    b.confidence - a.confidence ||
    b.strongMean - a.strongMean ||
    b.score - a.score
  );
}

/** Score all cells, apply hard filters, sort, and apply non-max suppression. */
export function scoreCells(cells: NormCells, query: ParsedQuery, opts: ScoreOptions = {}): ScoredCell[] {
  const tau = opts.tau ?? DEFAULT_TAU;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const nmsKm = opts.nmsKm ?? DEFAULT_NMS_KM;

  const active = activeFeatures(query);
  if (!active.length) return [];
  const req = query.required
    .filter((k) => query.targets[k] !== undefined && cells.norm[k])
    .map((k) => ({ col: cells.norm[k], t: query.targets[k] as number }));

  const totalW = active.reduce((s, a) => s + a.w, 0);
  const scored: ScoredCell[] = [];

  outer: for (let i = 0; i < cells.count; i++) {
    for (const r of req) {
      const c = r.col[i];
      if (Number.isNaN(c) || Math.abs(r.t - c) > tau) continue outer;
    }
    let num = 0;
    let den = 0;
    let strongSum = 0;
    let strongN = 0;
    for (let j = 0; j < active.length; j++) {
      const col = cells.norm[active[j].key];
      if (!col) continue;
      const c = col[i];
      if (Number.isNaN(c)) continue;
      const { t, w } = active[j];
      const d = Math.abs(t - c);
      num += w * d;
      den += w;
      if (w === 3) {
        strongSum += 1 - d;
        strongN++;
      }
    }
    if (den === 0) continue;
    const missingShare = 1 - den / totalW;
    scored.push({
      index: i,
      score: 100 * (1 - num / den),
      confidence: 1 - missingShare,
      partial: missingShare > PARTIAL_DATA_THRESHOLD,
      strongMean: strongN ? strongSum / strongN : 0,
    });
  }

  scored.sort(compareScored);
  return nonMaxSuppress(scored, cells, nmsKm, limit);
}

export function nonMaxSuppress(sorted: ScoredCell[], cells: NormCells, km: number, limit: number): ScoredCell[] {
  const kept: ScoredCell[] = [];
  for (const s of sorted) {
    if (kept.length >= limit) break;
    const lat = cells.lat[s.index];
    const lon = cells.lon[s.index];
    let ok = true;
    for (const k of kept) {
      if (haversineKm(lat, lon, cells.lat[k.index], cells.lon[k.index]) < km) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(s);
  }
  return kept;
}

/** Per-feature comparison, sorted by importance then by match quality. */
export function breakdown(
  get: (key: string) => number | null,
  query: ParsedQuery,
  features: FeatureDef[],
): BreakdownRow[] {
  const rows: BreakdownRow[] = features.map((fd) => {
    const site = get(fd.key);
    const target = query.targets[fd.key] ?? null;
    const diff = site !== null && target !== null ? Math.abs(site - target) : null;
    return {
      key: fd.key,
      weight: (query.weights[fd.key] ?? 0) as Weight,
      site,
      target,
      diff,
      level: diff === null ? null : matchLevel(diff),
    };
  });
  return rows.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const da = a.diff ?? 2;
    const db = b.diff ?? 2;
    return da - db;
  });
}

/** Target-first flow: all features with data get weight 2, nothing required. */
export function queryFromTarget(target: Target, features: FeatureDef[]): ParsedQuery {
  const targets: Record<string, number> = {};
  const weights: Record<string, Weight> = {};
  for (const fd of features) {
    const n = normalize(target.values[fd.key], fd.norm);
    if (n === null) continue;
    targets[fd.key] = n;
    weights[fd.key] = 2;
  }
  const used = Object.keys(targets).length;
  const query: ParsedQuery = { body: target.body, targets, weights, required: [], notes: `Matching ${target.name}`, tags: [] };
  // Only record coverage when something was dropped, so complete targets are unchanged.
  if (features.length > 0 && used < features.length) query.coverage = used / features.length;
  return query;
}

export const cellGetter = (cells: NormCells, index: number) => (key: string) => {
  const col = cells.norm[key];
  if (!col) return null;
  const v = col[index];
  return Number.isNaN(v) ? null : v;
};

export const valuesGetter = (norm: Record<string, number | null>) => (key: string) => norm[key] ?? null;
