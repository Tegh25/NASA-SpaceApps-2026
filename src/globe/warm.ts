import * as Cesium from 'cesium';
import { loadHeightmap } from '../data/loaders';
import { getPhotorealTileset, HAS_ION, whenViewer } from './viewer';

/** Ground height (m) at each site's tour spawn point, filled before the user clicks Walk. */
const groundBySite = new Map<string, number>();
const pending = new Map<string, Promise<void>>();

/**
 * The Earth twin heightmaps are Copernicus GLO-30 heights above the geoid; Cesium wants heights above
 * the ellipsoid. The difference is tens of metres, so the fallback lands a little high on purpose and
 * the tour's own terrain sample then settles the camera onto the real ground.
 */
const GEOID_MARGIN_M = 60;
const SAMPLE_TIMEOUT_MS = 5000;

export function cachedGround(siteId: string): number | undefined {
  return groundBySite.get(siteId);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Centre elevation of the site's shipped Earth twin heightmap (real Copernicus DEM), if any. */
async function groundFromHeightmap(path: string | undefined): Promise<number | undefined> {
  if (!path) return undefined;
  try {
    const { hm, elev } = await loadHeightmap(path);
    const c = Math.floor(hm.height / 2) * hm.width + Math.floor(hm.width / 2);
    const h = elev[c];
    return Number.isFinite(h) && h > -500 ? h + GEOID_MARGIN_M : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create the Google photoreal tileset (hidden, so only its metadata loads) and find the ground height
 * at the spawn point: Cesium World Terrain when it is ready, else the shipped Earth twin heightmap.
 * Never throws. Safe to call repeatedly; concurrent calls share one run.
 */
export function warmTour(siteId: string, spawn: { lat: number; lon: number } | null, heightmapPath?: string): Promise<void> {
  if (groundBySite.has(siteId)) return Promise.resolve();
  const running = pending.get(siteId);
  if (running) return running;
  const run = (async () => {
    try {
      const v = await whenViewer();
      if (v.isDestroyed()) return;
      void getPhotorealTileset(v);
      if (!spawn) return;
      // No ion token: no 3D terrain, the imagery lies flat on the ellipsoid, so the ground is 0 m.
      if (!HAS_ION) {
        groundBySite.set(siteId, 0);
        return;
      }
      // The terrain provider is undefined until World Terrain finishes loading: guard it.
      const tp = v.scene.globe.terrainProvider;
      if (tp && tp.availability) {
        try {
          const [p] = await withTimeout(
            Cesium.sampleTerrainMostDetailed(tp, [Cesium.Cartographic.fromDegrees(spawn.lon, spawn.lat)]),
            SAMPLE_TIMEOUT_MS,
          );
          if (p && Number.isFinite(p.height) && p.height > -500) {
            groundBySite.set(siteId, p.height);
            return;
          }
        } catch {
          /* fall through to the heightmap */
        }
      }
      const h = await groundFromHeightmap(heightmapPath);
      if (h !== undefined) groundBySite.set(siteId, h);
    } catch {
      /* best effort: the tour samples again on its own */
    } finally {
      pending.delete(siteId);
    }
  })();
  pending.set(siteId, run);
  return run;
}
