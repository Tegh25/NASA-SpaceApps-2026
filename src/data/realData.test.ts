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
    for (const f of readdirSync('public/data/heightmaps').filter((x) => x.endsWith('.json'))) {
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
    for (const f of readdirSync('public/data/heightmaps').filter((x) => x.endsWith('.json'))) expect(refs.has(`heightmaps/${f}`), f).toBe(true);
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

  it('Twin Terrain Lab (Moon): every twin path exists, Earth heightmaps are 256 x 256 at 40 m', () => {
    const twins = featured.featured.filter((f) => f.twin && f.body === 'moon');
    expect(twins.length).toBeGreaterThanOrEqual(6);
    for (const f of twins) {
      const { earthHeightmap, moonHeightmap } = f.twin!;
      expect(moonHeightmap, f.id).toBeTruthy();
      expect(existsSync(`public/data/${earthHeightmap}`), `${f.id} ${earthHeightmap}`).toBe(true);
      expect(existsSync(`public/data/${moonHeightmap}`), `${f.id} ${moonHeightmap}`).toBe(true);
      const e = HeightmapSchema.parse(read(earthHeightmap));
      expect(e.width).toBe(256);
      expect(e.height).toBe(256);
      expect(e.metersPerPixel).toBe(40);
      const m = HeightmapSchema.parse(read(moonHeightmap!));
      expect(m.metersPerPixel).toBe(40);
      for (const hm of [e, m]) {
        const st = hm.stats as { slopeHist: number[]; slopeP50: number; slopeP90: number; reliefM: number };
        expect(st.slopeHist.length, f.id).toBe(45);
        expect(st.slopeHist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
        expect(st.slopeP90).toBeGreaterThanOrEqual(st.slopeP50);
        expect(st.reliefM).toBeGreaterThan(0);
      }
      expect(read(earthHeightmap).provenance.datasets[0].name).toMatch(/Copernicus/);
    }
  });

  describe('Mars featured cards', () => {
    const mars = featured.featured.filter((f) => f.body === 'mars');
    const computed = mars.filter((f) => f.valueSource === 'computed');
    const marsTargetIds = new Set(targets.targets.filter((t) => t.body === 'mars').map((t) => t.id));

    it('has >= 3 new computed cards ranked ahead of the literature analogs', () => {
      const news = computed.filter((f) => f.kind === 'new');
      expect(news.length).toBeGreaterThanOrEqual(3);
      for (const f of news) {
        expect(f.stats?.nearest_known_km as number, f.id).toBeGreaterThanOrEqual(150);
        expect(f.why?.length, f.id).toBeGreaterThan(100);
        expect(f.description + (f.why ?? ''), f.id).not.toMatch(/unprecedented/i);
        expect(f.caveats.join(' '), f.id).toMatch(/provisional/);
      }
      const lit = mars.filter((f) => f.valueSource === 'literature');
      expect(lit.length).toBeGreaterThanOrEqual(3);
      for (const f of lit) expect(f.kind, f.id).toBe('known');
      const maxNewRank = Math.max(...news.map((f) => f.rank ?? 99));
      for (const f of lit) expect(f.rank ?? 0, f.id).toBeGreaterThan(maxNewRank);
    });

    it('every analogFor id is a Mars target, every image and twin path exists', () => {
      for (const f of mars) {
        for (const id of f.analogFor) expect(marsTargetIds.has(id), `${f.id} -> ${id}`).toBe(true);
        for (const [k, p] of Object.entries(f.images ?? {})) {
          if (p) expect(existsSync(`public${p}`), `${f.id}.images.${k} ${p}`).toBe(true);
        }
        if (f.twin) {
          expect(existsSync(`public/data/${f.twin.earthHeightmap}`), `${f.id} earth twin`).toBe(true);
          expect(f.twin.marsHeightmap, f.id).toBeTruthy();
          expect(existsSync(`public/data/${f.twin.marsHeightmap}`), `${f.id} mars twin`).toBe(true);
        }
      }
    });

    it('no computed card has a null composite, and values stay honest', () => {
      expect(computed.length).toBeGreaterThanOrEqual(3);
      for (const f of computed) {
        expect(typeof f.stats?.composite, `${f.id} composite`).toBe('number');
        expect(f.stats?.composite as number, f.id).toBeGreaterThan(0);
        expect(f.stats?.nearest_known_km, f.id).not.toBeNull();
        expect(f.values.slope_deg, f.id).not.toBeNull();
        expect(f.values.temp_mean_k, f.id).not.toBeNull();
        // Mars-side temperature and diurnal swing have no sourced site value: they must stay blank
        for (const g of f.gaps.filter((x) => /temperature/i.test(x.label))) expect(g.target, `${f.id} ${g.label}`).toBeNull();
      }
    });

    it('Mars twins: Earth block is 150 x 150 at 200 m, the Mars window matches, stats present', () => {
      const twins = computed.filter((f) => f.twin);
      expect(twins.length).toBeGreaterThanOrEqual(3);
      for (const f of twins) {
        const e = HeightmapSchema.parse(read(f.twin!.earthHeightmap));
        const m = HeightmapSchema.parse(read(f.twin!.marsHeightmap!));
        for (const hm of [e, m]) {
          expect(hm.width, f.id).toBe(150);
          expect(hm.height, f.id).toBe(150);
          expect(hm.metersPerPixel, f.id).toBe(200);
          expect(Buffer.from(hm.data, 'base64').length).toBe(150 * 150 * 2);
          const st = hm.stats as { slopeHist: number[]; slopeP50: number; slopeP90: number; reliefM: number };
          expect(st.slopeHist.length, f.id).toBe(45);
          expect(st.slopeHist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
          expect(st.reliefM).toBeGreaterThan(0);
        }
        const prov = read(f.twin!.earthHeightmap).provenance;
        expect(prov.mock).toBe(false);
        expect(prov.datasets[0].name).toMatch(/Copernicus/);
        // Earth slope from the twin grid agrees with the run's value for the block (same 200 m scale)
        expect(Math.abs((e.stats as { slopeP50: number }).slopeP50 - (f.values.slope_deg as number)), f.id).toBeLessThan(0.15);
      }
    });
  });
});
