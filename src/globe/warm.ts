import * as Cesium from 'cesium';
import { getPhotorealTileset, whenViewer } from './viewer';

/** Ground height (m) at each site's tour spawn point, filled before the user clicks Walk. */
const groundBySite = new Map<string, number>();

export function cachedGround(siteId: string): number | undefined {
  return groundBySite.get(siteId);
}

/**
 * Create the Google photoreal tileset (hidden, so only its metadata loads) and sample the
 * terrain height at the spawn point. The tour can then start walking without waiting.
 */
export async function warmTour(siteId: string, spawn: { lat: number; lon: number } | null): Promise<void> {
  const v = await whenViewer();
  if (v.isDestroyed()) return;
  void getPhotorealTileset(v);
  if (!spawn || groundBySite.has(siteId) || !v.terrainProvider.availability) return;
  try {
    const [p] = await Cesium.sampleTerrainMostDetailed(v.terrainProvider, [Cesium.Cartographic.fromDegrees(spawn.lon, spawn.lat)]);
    if (p && Number.isFinite(p.height)) groundBySite.set(siteId, p.height);
  } catch {
    /* the tour samples again on its own */
  }
}
