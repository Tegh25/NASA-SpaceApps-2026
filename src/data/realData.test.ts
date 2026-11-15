import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EarthCellsFileSchema,
  FeaturedFileSchema,
  FeaturesFileSchema,
  HeightmapSchema,
  TargetsFileSchema,
  formatZodError,
} from './schemas';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const KEYS = [
  'slope_deg', 'roughness_m', 'relief_m', 'flat_frac', 'crater_density', 'shadow_frac',
  'temp_mean_k', 'temp_max_k', 'ice_proxy', 'precip_mm_yr', 'vegetation_ndvi', 'snow_frac',
];

// Plausible physical ranges, inclusive.
const RANGE: Record<string, [number, number]> = {
  slope_deg: [0, 90],
  roughness_m: [0, 50],
  relief_m: [0, 12000],
  flat_frac: [0, 1],
  crater_density: [0, 5],
  shadow_frac: [0, 1],
  temp_mean_k: [30, 350],
  temp_max_k: [30, 350],
  ice_proxy: [0, 1],
  precip_mm_yr: [0, 12000],
  vegetation_ndvi: [-0.2, 1],
  snow_frac: [0, 1],
};

function parse<T>(file: string, schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: any } }) {
  const r = schema.safeParse(read(file));
  if (!r.success) throw new Error(formatZodError(file, r.error));
  return r.data as T;
}

const features = parse('features.json', FeaturesFileSchema) as ReturnType<typeof FeaturesFileSchema.parse>;
const targets = parse('targets.json', TargetsFileSchema) as ReturnType<typeof TargetsFileSchema.parse>;
const cells = parse('earth_cells.json', EarthCellsFileSchema) as ReturnType<typeof EarthCellsFileSchema.parse>;
const featured = parse('featured_analogs.json', FeaturedFileSchema) as ReturnType<typeof FeaturedFileSchema.parse>;
const featureKeys = new Set(features.features.map((f) => f.key));

function checkValues(label: string, values: Record<string, number | null>) {
  for (const [k, v] of Object.entries(values)) {
    expect(featureKeys.has(k), `${label}: unknown feature ${k}`).toBe(true);
    if (v == null) continue;
    const [lo, hi] = RANGE[k];
    expect(v, `${label}.${k}=${v}`).toBeGreaterThanOrEqual(lo);
    expect(v, `${label}.${k}=${v}`).toBeLessThanOrEqual(hi);
  }
}

describe('real data pack', () => {
  it('has exactly the 12 feature keys, with sane norms', () => {
    expect(features.features.map((f) => f.key).sort()).toEqual([...KEYS].sort());
    for (const f of features.features) {
      expect(f.norm.max).toBeGreaterThan(f.norm.min);
      expect(f.description.length).toBeGreaterThan(20);
    }
    const t = features.features.find((f) => f.key === 'temp_mean_k')!;
    expect(t.norm.min).toBeLessThanOrEqual(105);
    expect(t.norm.max).toBeGreaterThanOrEqual(290);
    expect(features.features.find((f) => f.key === 'precip_mm_yr')!.norm.scale).toBe('log');
  });

  it('is not marked mock anywhere', () => {
    expect(features.provenance?.mock).toBe(false);
    expect(targets.provenance?.mock).toBe(false);
    expect(cells.provenance?.mock).toBe(false);
    expect(featured.provenance?.mock).toBe(false);
    for (const f of readdirSync('public/data/heightmaps')) {
      expect(read(`heightmaps/${f}`).provenance?.mock, f).toBe(false);
    }
  });

  it('earth_cells: 12,362 blocks, consistent columns, plausible values', () => {
    expect(cells.count).toBe(12362);
    expect(cells.lat).toHaveLength(cells.count);
    expect(cells.lon).toHaveLength(cells.count);
    expect(cells.region).toHaveLength(cells.count);
    expect(Object.keys(cells.values).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) {
      const arr = cells.values[k];
      expect(arr).toHaveLength(cells.count);
      const [lo, hi] = RANGE[k];
      let nulls = 0;
      for (const v of arr) {
        if (v == null) { nulls++; continue; }
        if (v < lo || v > hi) throw new Error(`earth_cells.values.${k}: ${v} outside ${lo}..${hi}`);
      }
      expect(nulls / arr.length, `${k} nulls`).toBeLessThan(0.01);
    }
    for (let i = 0; i < cells.count; i++) {
      if (cells.lat[i] < -90 || cells.lat[i] > 90 || cells.lon[i] < -180 || cells.lon[i] > 180) throw new Error(`bad lat/lon at ${i}`);
    }
  });

  it('targets: 9 Moon regions and the Mars sites, values in range', () => {
    const moon = targets.targets.filter((t) => t.body === 'moon');
    const mars = targets.targets.filter((t) => t.body === 'mars');
    expect(moon).toHaveLength(9);
    expect(mars.length).toBeGreaterThanOrEqual(4);
    expect(new Set(targets.targets.map((t) => t.id)).size).toBe(targets.targets.length);
    for (const t of targets.targets) {
      checkValues(t.id, t.values);
      expect(t.valueSource, t.id).toBe('computed');
      expect(t.code, t.id).toBeTruthy();
    }
    for (const t of moon) {
      expect(t.values.precip_mm_yr).toBe(0);
      expect(t.values.temp_mean_k).toBeGreaterThan(90);
      expect(t.values.temp_mean_k).toBeLessThan(160);
    }
  });

  it('every target image and heightmap exists and is valid', () => {
    for (const t of targets.targets) {
      if (t.imagery) expect(existsSync(`public${t.imagery}`), `${t.id} imagery ${t.imagery}`).toBe(true);
      if (t.heightmap) {
        const p = `public/data/${t.heightmap}`;
        expect(existsSync(p), p).toBe(true);
        const r = HeightmapSchema.safeParse(read(t.heightmap));
        expect(r.success, p).toBe(true);
        const h = r.data!;
        expect(Buffer.from(h.data, 'base64').length).toBe(h.width * h.height * 2);
        expect(h.maxElevation).toBeGreaterThan(h.minElevation);
      }
    }
  });

  it('every heightmap file on disk is referenced (no stale mock files)', () => {
    const refs = new Set(targets.targets.map((t) => t.heightmap).filter(Boolean));
    for (const f of readdirSync('public/data/heightmaps')) expect(refs.has(`heightmaps/${f}`), f).toBe(true);
  });

  it('featured: ids resolve, images exist, values in range, >= 3 new Moon cards', () => {
    const ids = new Set(targets.targets.map((t) => t.id));
    expect(new Set(featured.featured.map((f) => f.id)).size).toBe(featured.featured.length);
    for (const f of featured.featured) {
      expect(f.analogFor.length, f.id).toBeGreaterThan(0);
      for (const id of f.analogFor) expect(ids.has(id), `${f.id} -> ${id}`).toBe(true);
      checkValues(f.id, f.values);
      for (const [k, p] of Object.entries(f.images ?? {})) {
        if (p) expect(existsSync(`public${p}`), `${f.id}.images.${k} ${p}`).toBe(true);
      }
      expect(f.body, f.id).toBeTruthy();
      expect(f.kind, f.id).toBeTruthy();
      expect(f.valueSource, f.id).toBeTruthy();
      expect(f.caveats.length, f.id).toBeGreaterThan(0);
      for (const r of f.references) expect(r.url).toMatch(/^https?:\/\//);
      if (f.tour) for (const w of f.tour.waypoints) expect(Math.abs(w.lat - f.tour.spawn.lat)).toBeLessThan(0.2);
    }
    const newMoon = featured.featured.filter((f) => f.body === 'moon' && f.kind === 'new');
    expect(newMoon.length).toBeGreaterThanOrEqual(3);
    for (const f of newMoon) {
      expect(f.stats?.nearest_known_km as number).toBeGreaterThanOrEqual(150);
      expect(f.why?.length).toBeGreaterThan(100);
      expect(f.description + (f.why ?? '')).not.toMatch(/unprecedented/i);
    }
    const mars = featured.featured.filter((f) => f.body === 'mars');
    expect(mars.length).toBeGreaterThanOrEqual(1);
    for (const f of mars) expect(f.valueSource === 'literature' || f.valueSource === 'computed').toBe(true);
  });

  it('featured Earth values equal the nearest earth_cells block for new and reserve Moon cards', () => {
    for (const f of featured.featured.filter((x) => x.body === 'moon' && (x.kind === 'new' || x.kind === 'reserve'))) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < cells.count; i++) {
        const d = (cells.lat[i] - f.lat) ** 2 + (cells.lon[i] - f.lon) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      expect(Math.sqrt(bd), `${f.id} nearest block distance (deg)`).toBeLessThan(0.01);
      for (const k of KEYS) expect(f.values[k], `${f.id}.${k}`).toBe(cells.values[k][best]);
    }
  });
});
