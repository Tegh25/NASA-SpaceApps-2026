import type { z } from 'zod';
import { buildNormCells } from '../scoring/score';
import { normalizeValues } from '../scoring/normalize';
import type { NormCells } from '../scoring/types';
import {
  EarthCellsFileSchema,
  FeaturedFileSchema,
  FeaturesFileSchema,
  formatZodError,
  HeightmapSchema,
  TargetsFileSchema,
  type FeatureDef,
  type FeaturedSite,
  type Heightmap,
  type Provenance,
  type Target,
} from './schemas';

const BASE = `${import.meta.env.BASE_URL}data/`;
const TIMEOUT_MS = 20000;

export interface AppData {
  features: FeatureDef[];
  targets: Target[];
  cells: NormCells;
  featured: FeaturedSite[];
  /** Normalized values per featured site id. */
  featuredNorm: Record<string, Record<string, number | null>>;
  provenance: Record<string, Provenance | undefined>;
  isMock: boolean;
}

export class DataError extends Error {}

async function fetchJson(file: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + file, { signal: ctrl.signal });
    if (!res.ok) throw new DataError(`Could not load ${file} (HTTP ${res.status}).`);
    return await res.json();
  } catch (e) {
    if (e instanceof DataError) throw e;
    if ((e as Error).name === 'AbortError') throw new DataError(`Timed out loading ${file}.`);
    throw new DataError(`Could not load ${file}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function validate<T extends z.ZodTypeAny>(file: string, schema: T, json: unknown): z.infer<T> {
  const r = schema.safeParse(json);
  if (!r.success) throw new DataError(formatZodError(file, r.error));
  return r.data;
}

export async function loadAppData(): Promise<AppData> {
  const [fj, tj, cj, ej] = await Promise.all([
    fetchJson('features.json'),
    fetchJson('targets.json'),
    fetchJson('earth_cells.json'),
    fetchJson('featured_analogs.json'),
  ]);
  const features = validate('features.json', FeaturesFileSchema, fj);
  const targets = validate('targets.json', TargetsFileSchema, tj);
  const cellsFile = validate('earth_cells.json', EarthCellsFileSchema, cj);
  const featured = validate('featured_analogs.json', FeaturedFileSchema, ej);

  const cells = buildNormCells(cellsFile, features.features);
  const featuredNorm = Object.fromEntries(featured.featured.map((s) => [s.id, normalizeValues(s.values, features.features)]));
  const provenance = {
    'features.json': features.provenance,
    'targets.json': targets.provenance,
    'earth_cells.json': cellsFile.provenance,
    'featured_analogs.json': featured.provenance,
  };
  const isMock = Object.values(provenance).some((p) => p?.mock);

  console.groupCollapsed(`[Terralog] data loaded${isMock ? ' (MOCK)' : ''}`);
  console.table({
    features: { value: features.features.map((x) => x.key).join(', ') },
    cells: { value: cells.count },
    targets: { value: targets.targets.map((t) => t.id).join(', ') },
    featured: { value: featured.featured.length },
  });
  console.groupEnd();

  return {
    features: features.features,
    targets: targets.targets,
    cells,
    featured: featured.featured,
    featuredNorm,
    provenance,
    isMock,
  };
}

/**
 * Decodes the base64 little-endian int16 payload into metres. A payload of the wrong length would otherwise
 * give NaN elevations (too short) or an obscure RangeError (odd length), so it is rejected with a clear message.
 */
export function decodeHeightmap(path: string, hm: Heightmap): Float32Array {
  if (hm.maxElevation < hm.minElevation) {
    throw new DataError(`${path}: maxElevation ${hm.maxElevation} is below minElevation ${hm.minElevation}.`);
  }
  const bin = atob(hm.data);
  const expected = hm.width * hm.height * 2;
  if (bin.length !== expected) {
    throw new DataError(`${path}: data is ${bin.length} bytes but ${hm.width} x ${hm.height} int16 values need ${expected}.`);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const elev = new Float32Array(hm.width * hm.height);
  const span = hm.maxElevation - hm.minElevation;
  for (let i = 0; i < elev.length; i++) elev[i] = hm.minElevation + ((i16[i] + 32768) / 65535) * span;
  return elev;
}

export type LoadedHeightmap = { hm: Heightmap; elev: Float32Array; isMock: boolean };

/**
 * Decoded heightmaps by path. Prefetching on site select fills this, so the Lab and Side by side
 * open without a download. Callers treat the arrays as read-only. Failures are not kept.
 */
const heightmapCache = new Map<string, Promise<LoadedHeightmap>>();

export function loadHeightmap(path: string): Promise<LoadedHeightmap> {
  let p = heightmapCache.get(path);
  if (!p) {
    p = (async () => {
      const json = (await fetchJson(path)) as { provenance?: Provenance };
      const hm = validate(path, HeightmapSchema, json);
      return { hm, elev: decodeHeightmap(path, hm), isMock: !!json.provenance?.mock };
    })();
    p.catch(() => heightmapCache.delete(path));
    heightmapCache.set(path, p);
  }
  return p;
}
