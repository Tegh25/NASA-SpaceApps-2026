import * as Cesium from 'cesium';
import { prefersReducedMotion } from '../globe/viewer';

export const BEAM_HEIGHT_M = 400_000;

/**
 * A glowing vertical beam from a site up to ~400 km so a hovered card is visible from orbit.
 * Grows over 350 ms. Returns a disposer that removes it.
 */
export function showBeam(viewer: Cesium.Viewer, lat: number, lon: number, cssColor: string): () => void {
  const color = Cesium.Color.fromCssColorString(cssColor);
  const base = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
  const reduced = prefersReducedMotion();
  const t0 = performance.now();
  const top = new Cesium.Cartesian3();
  const positions = new Cesium.CallbackProperty(() => {
    const k = reduced ? 1 : Math.min(1, (performance.now() - t0) / 350);
    const e = 1 - Math.pow(1 - k, 3);
    Cesium.Cartesian3.fromDegrees(lon, lat, BEAM_HEIGHT_M * e, Cesium.Ellipsoid.WGS84, top);
    return [base, top.clone()];
  }, false);
  const glow = new Cesium.CallbackProperty(() => (reduced ? 0.22 : 0.2 + 0.08 * Math.sin(performance.now() / 260)), false);
  const entity = viewer.entities.add({
    polyline: {
      positions: positions as unknown as Cesium.PositionProperty as never,
      width: 5,
      arcType: Cesium.ArcType.NONE,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: glow as never, taperPower: 0.6, color }),
    },
  });
  return () => {
    if (!viewer.isDestroyed()) viewer.entities.remove(entity);
  };
}
