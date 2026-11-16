import type { AppData } from '../data/loaders';
import { loadHeightmap } from '../data/loaders';

/**
 * Warm everything the Walk, Side by side and Lab views need for a site, as soon as the site is
 * picked, so clicking those buttons feels instant. Each step is best effort and runs once per site.
 * Cesium work lives in globe/warm.ts and is imported lazily, so this module stays out of the
 * first-paint bundle.
 */
const done = new Set<string>();
let chunksLoaded = false;

/** Wait out the globe's fly-in so the prefetch does not compete with its tiles. */
const CESIUM_WARM_DELAY_MS = 1800;

export function prefetchSite(data: AppData, siteId: string): () => void {
  if (done.has(siteId)) return () => {};
  done.add(siteId);

  if (!chunksLoaded) {
    chunksLoaded = true;
    void import('../tour/TourView');
    void import('../target/ComparePage');
    void import('../lab/LabPage');
  }

  const f = data.featured.find((x) => x.id === siteId);
  const target = data.targets.find((t) => t.id === f?.analogFor[0]);
  const paths = new Set<string>();
  if (target?.heightmap) paths.add(target.heightmap);
  if (f?.twin) {
    paths.add(f.twin.earthHeightmap);
    const other = f.twin.moonHeightmap ?? f.twin.marsHeightmap;
    if (other) paths.add(other);
  }
  for (const p of paths) loadHeightmap(p).catch(() => {});

  const spawn = f?.tour?.spawn ?? (f ? { lat: f.lat, lon: f.lon } : null);
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    import('../globe/warm').then((m) => m.warmTour(siteId, spawn, f?.twin?.earthHeightmap)).catch(() => {});
  }, CESIUM_WARM_DELAY_MS);
  return () => {
    if (fired) return;
    clearTimeout(timer);
    // Not warmed yet: let a later selection try again.
    done.delete(siteId);
  };
}
