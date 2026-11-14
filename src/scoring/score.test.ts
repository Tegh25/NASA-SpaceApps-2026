import { describe, expect, it } from 'vitest';
import type { EarthCellsFile, FeatureDef } from '../data/schemas';
import { haversineKm } from '../lib/geo';
import { denormalize, normalize } from './normalize';
import { breakdown, buildNormCells, cellGetter, matchLevel, nonMaxSuppress, scoreCells, scoreVector } from './score';
import type { ParsedQuery } from './types';

const feat = (key: string, min = 0, max = 1, scale: 'linear' | 'log' = 'linear'): FeatureDef => ({
  key,
  label: key,
  unit: '',
  group: 'Test',
  description: '',
  norm: { min, max, scale },
  sources: [],
});

const FEATURES = [feat('a'), feat('b'), feat('c')];

const q = (targets: Record<string, number>, weights: Record<string, 0 | 1 | 2 | 3>, required: string[] = []): ParsedQuery => ({
  body: 'either',
  targets,
  weights,
  required,
  notes: '',
});

function cellsFrom(rows: { lat: number; lon: number; v: Record<string, number | null> }[]) {
  const file: EarthCellsFile = {
    cellSizeDeg: 1,
    count: rows.length,
    lat: rows.map((r) => r.lat),
    lon: rows.map((r) => r.lon),
    values: Object.fromEntries(FEATURES.map((f) => [f.key, rows.map((r) => r.v[f.key] ?? null)])),
  };
  return buildNormCells(file, FEATURES);
}

describe('normalize', () => {
  it('maps linear values into 0..1', () => {
    expect(normalize(5, { min: 0, max: 10, scale: 'linear' })).toBeCloseTo(0.5);
  });
  it('clips out-of-range values', () => {
    expect(normalize(-3, { min: 0, max: 10, scale: 'linear' })).toBe(0);
    expect(normalize(30, { min: 0, max: 10, scale: 'linear' })).toBe(1);
  });
  it('uses ln(1+v) for log scale', () => {
    const n = normalize(Math.expm1(1), { min: 0, max: Math.expm1(2), scale: 'log' });
    expect(n).toBeCloseTo(0.5);
  });
  it('returns null for missing values', () => {
    expect(normalize(null, { min: 0, max: 1, scale: 'linear' })).toBeNull();
    expect(normalize(undefined, { min: 0, max: 1, scale: 'linear' })).toBeNull();
    expect(normalize(NaN, { min: 0, max: 1, scale: 'linear' })).toBeNull();
  });
  it('round-trips through denormalize', () => {
    const n = { min: 0, max: 3000, scale: 'log' as const };
    expect(denormalize(normalize(250, n)!, n)).toBeCloseTo(250, 3);
  });
});

describe('scoreVector', () => {
  const all = { a: 2, b: 2, c: 2 } as const;
  it('gives 100 for identical vectors', () => {
    const s = scoreVector((k) => ({ a: 0.2, b: 0.5, c: 0.9 })[k] ?? null, q({ a: 0.2, b: 0.5, c: 0.9 }, all));
    expect(Math.round(s!.score)).toBe(100);
  });
  it('gives 0 for opposite extremes on all features', () => {
    const s = scoreVector((k) => ({ a: 1, b: 1, c: 0 })[k] ?? null, q({ a: 0, b: 0, c: 1 }, all));
    expect(Math.round(s!.score)).toBe(0);
  });
  it('reduces confidence, not score, when values are missing', () => {
    const s = scoreVector((k) => ({ a: 0.5, b: null, c: 0.5 })[k] ?? null, q({ a: 0.5, b: 0.0, c: 0.5 }, all));
    expect(Math.round(s!.score)).toBe(100);
    expect(s!.confidence).toBeCloseTo(2 / 3);
    expect(s!.partial).toBe(true);
  });
  it('ignores features with weight 0', () => {
    const s = scoreVector((k) => ({ a: 0.5, b: 1, c: 0.5 })[k] ?? null, q({ a: 0.5, b: 0, c: 0.5 }, { a: 2, b: 0, c: 2 }));
    expect(Math.round(s!.score)).toBe(100);
  });
});

describe('scoreCells', () => {
  const cells = cellsFrom([
    { lat: 0, lon: 0, v: { a: 0.1, b: 0.9, c: 0.5 } },
    { lat: 0, lon: 20, v: { a: 0.9, b: 0.1, c: 0.5 } },
    { lat: 0, lon: 40, v: { a: 0.5, b: 0.5, c: 0.0 } },
  ]);

  it('weights change ranking as expected', () => {
    const targets = { a: 0.1, b: 0.1 };
    const favourA = scoreCells(cells, q(targets, { a: 3, b: 1 }));
    const favourB = scoreCells(cells, q(targets, { a: 1, b: 3 }));
    expect(favourA[0].index).toBe(0);
    expect(favourB[0].index).toBe(1);
  });

  it('required filter excludes cells outside tolerance', () => {
    const res = scoreCells(cells, q({ c: 0.5, a: 0.5 }, { c: 2, a: 2 }, ['c']));
    expect(res.map((r) => r.index).sort()).toEqual([0, 1]);
  });

  it('returns nothing for an empty query', () => {
    expect(scoreCells(cells, q({}, {}))).toEqual([]);
  });

  it('required filter excludes cells with missing values', () => {
    const c2 = cellsFrom([
      { lat: 0, lon: 0, v: { a: 0.5, c: null } },
      { lat: 0, lon: 20, v: { a: 0.5, c: 0.5 } },
    ]);
    const res = scoreCells(c2, q({ a: 0.5, c: 0.5 }, { a: 2, c: 2 }, ['c']));
    expect(res.map((r) => r.index)).toEqual([1]);
  });
});

describe('non-max suppression', () => {
  it('keeps no two results within 300 km', () => {
    const rows = [];
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) rows.push({ lat: -20 + i * 1, lon: j * 1, v: { a: Math.random() } });
    const cells = cellsFrom(rows);
    const res = scoreCells(cells, q({ a: 0.5 }, { a: 2 }), { limit: 25, nmsKm: 300 });
    expect(res.length).toBeGreaterThan(5);
    for (let i = 0; i < res.length; i++)
      for (let j = i + 1; j < res.length; j++) {
        const d = haversineKm(cells.lat[res[i].index], cells.lon[res[i].index], cells.lat[res[j].index], cells.lon[res[j].index]);
        expect(d).toBeGreaterThanOrEqual(300);
      }
  });

  it('respects the limit', () => {
    const cells = cellsFrom([
      { lat: 0, lon: 0, v: {} },
      { lat: 0, lon: 90, v: {} },
    ]);
    const sorted = [
      { index: 0, score: 90, confidence: 1, partial: false, strongMean: 0 },
      { index: 1, score: 80, confidence: 1, partial: false, strongMean: 0 },
    ];
    expect(nonMaxSuppress(sorted, cells, 300, 1)).toHaveLength(1);
  });
});

describe('breakdown', () => {
  it('sorts by weight then match and assigns levels', () => {
    const cells = cellsFrom([{ lat: 0, lon: 0, v: { a: 0.5, b: 0.1, c: 0.0 } }]);
    const rows = breakdown(cellGetter(cells, 0), q({ a: 0.5, b: 0.6, c: 0.2 }, { a: 1, b: 3, c: 3 }), FEATURES);
    expect(rows.map((r) => r.key)).toEqual(['c', 'b', 'a']);
    expect(rows[0].level).toBe('partial');
    expect(rows[1].level).toBe('weak');
    expect(rows[2].level).toBe('strong');
  });
  it('match level thresholds', () => {
    expect(matchLevel(0.1)).toBe('strong');
    expect(matchLevel(0.2)).toBe('partial');
    expect(matchLevel(0.5)).toBe('weak');
  });
});
