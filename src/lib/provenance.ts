import type { FeatureDef, FeaturedSite, Target } from '../data/schemas';

/** Terrain features that the Mars run measured at 200 m on both bodies. */
const MARS_TERRAIN = new Set(['slope_deg', 'roughness_m', 'relief_m', 'flat_frac']);

export interface SourcePair {
  earth: string | null;
  target: string | null;
}

/** Which dataset each side of a feature comparison came from. Never invents a source. */
export function featureSources(fd: FeatureDef, body: 'moon' | 'mars', target: Target | null): SourcePair {
  if (body === 'mars') {
    if (MARS_TERRAIN.has(fd.key)) {
      return { earth: 'Copernicus GLO-30 at 200 m', target: target?.sources[0] ?? 'USGS HRSC+MOLA 200 m' };
    }
    return { earth: fd.sources[0] ?? null, target: null };
  }
  return { earth: fd.sources[0] ?? null, target: fd.sources[1] ?? null };
}

/** Short source line for a feature row, e.g. "Copernicus GLO-30 vs LRO LOLA". */
export function sourceLine(p: SourcePair): string | null {
  if (p.earth && p.target) return `${p.earth} vs ${p.target}`;
  return p.earth ?? p.target;
}

/** Dataset names behind a site's write-up, for the "Based on" line. */
export function siteDatasets(f: FeaturedSite | undefined, features: FeatureDef[], body: 'moon' | 'mars', target: Target | null): string[] {
  if (!f) return [];
  if (f.valueSource === 'literature') return ['Published literature (see references)'];
  const out = new Set<string>();
  for (const fd of features) {
    if (f.values[fd.key] == null) continue;
    const p = featureSources(fd, body, target);
    if (p.earth) out.add(short(p.earth));
    if (p.target && target && target.values[fd.key] != null) out.add(short(p.target));
  }
  const st = f.stats ?? {};
  if (st.landsat_bare != null) out.add('Landsat 8/9');
  if (st.s2_bare != null) out.add('Sentinel-2');
  if (body === 'mars' && st.earth_albedo != null) out.add('MGS TES albedo');
  return [...out];
}

/** Trim version noise so the chips stay short. */
function short(name: string): string {
  return name
    .replace(/ C6\.1$/, '')
    .replace(/ LDEM_80S_40M$/, '')
    .replace(/ at 200 m$/, '')
    .replace(/^USGS HRSC\+MOLA blended DEM 200 m.*$/, 'HRSC+MOLA DEM')
    .replace(/^MGS TES albedo.*$/, 'MGS TES albedo');
}

/** Gap rows carry a label, not a feature key. Match it back to a feature when the label is one of ours. */
const GAP_ALIASES: Record<string, string> = {
  'shadowed share at 1.5 deg sun': 'shadow_frac',
  'annual precipitation': 'precip_mm_yr',
  'day-night temperature swing': 'temp_mean_k',
};

export function gapSource(label: string, features: FeatureDef[], body: 'moon' | 'mars', target: Target | null): string | null {
  const l = label.trim().toLowerCase();
  const fd = features.find((f) => f.label.toLowerCase() === l || f.key === GAP_ALIASES[l]);
  return fd ? sourceLine(featureSources(fd, body, target)) : null;
}
