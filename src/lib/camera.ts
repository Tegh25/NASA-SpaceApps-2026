import * as Cesium from 'cesium';
import { create } from 'zustand';
import { getViewer, prefersReducedMotion } from '../globe/viewer';
import { getSite } from './sites';
import { useApp } from '../state/store';

export const ORBIT_HEIGHT_M = 1.6e7;
export const SURFACE_HEIGHT_M = 3000;

export interface CameraState {
  lat: number;
  lon: number;
  /** Camera height above the ellipsoid. */
  heightM: number;
  headingDeg: number;
  /** Ground elevation under the view centre, null when unknown (no terrain). */
  terrainHeightM: number | null;
  /** Ground metres represented by one screen pixel at the view centre, null when unknown. */
  metersPerPx: number | null;
  mode: 'orbit' | 'surface';
}

export const useCamera = create<CameraState>(() => ({
  lat: 0,
  lon: 0,
  heightM: ORBIT_HEIGHT_M,
  headingDeg: 0,
  terrainHeightM: null,
  metersPerPx: null,
  mode: 'orbit',
}));

const deg = Cesium.Math.toDegrees;
const rad = Cesium.Math.toRadians;

function sample(v: Cesium.Viewer) {
  const { camera, scene, canvas } = v;
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const ray = camera.getPickRay(center);
  let hit: Cesium.Cartesian3 | undefined;
  if (ray) hit = scene.globe.pick(ray, scene) ?? undefined;
  if (!hit) hit = camera.pickEllipsoid(center, scene.globe.ellipsoid) ?? undefined;
  const camCarto = camera.positionCartographic;
  const heightM = camCarto.height;
  let lat = deg(camCarto.latitude);
  let lon = deg(camCarto.longitude);
  let terrainHeightM: number | null = null;
  let metersPerPx: number | null = null;
  if (hit) {
    const c = Cesium.Cartographic.fromCartesian(hit);
    lat = deg(c.latitude);
    lon = deg(c.longitude);
    const hasTerrain = !!scene.globe.terrainProvider?.availability;
    if (hasTerrain) {
      const h = scene.globe.getHeight(c);
      // getHeight can return junk while tiles stream in; keep only plausible Earth elevations.
      terrainHeightM = h !== undefined && h > -500 && h < 9000 ? h : null;
    }
    const px = camera.getPixelSize(new Cesium.BoundingSphere(hit, 1), scene.drawingBufferWidth, scene.drawingBufferHeight);
    if (Number.isFinite(px)) metersPerPx = px;
  }
  useCamera.setState({
    lat,
    lon,
    heightM,
    headingDeg: (deg(camera.heading) + 360) % 360,
    terrainHeightM,
    metersPerPx,
    mode: heightM > 1e6 ? 'orbit' : 'surface',
  });
}

/** Subscribe the store to a viewer's camera, throttled to about 10 Hz. Returns a disposer. */
export function trackCamera(v: Cesium.Viewer): () => void {
  v.camera.percentageChanged = 0.01;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    last = performance.now();
    if (!v.isDestroyed()) sample(v);
  };
  const onChange = () => {
    const wait = 100 - (performance.now() - last);
    if (wait <= 0) run();
    else if (!timer) timer = setTimeout(run, wait);
  };
  v.camera.changed.addEventListener(onChange);
  v.camera.moveEnd.addEventListener(onChange);
  run();
  return () => {
    v.camera.changed.removeEventListener(onChange);
    v.camera.moveEnd.removeEventListener(onChange);
    if (timer) clearTimeout(timer);
  };
}

const duration = (s: number) => (prefersReducedMotion() ? 0 : s);

function moveAlongView(factor: number) {
  const v = getViewer();
  if (!v) return;
  const cam = v.camera;
  const h = cam.positionCartographic.height;
  const step = Math.max(h * 0.45, 30) * factor; // factor > 0 zooms in
  const dest = Cesium.Cartesian3.add(cam.position, Cesium.Cartesian3.multiplyByScalar(cam.direction, step, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const c = Cesium.Cartographic.fromCartesian(dest);
  if (c.height < 40 || c.height > 4e7) return;
  cam.flyTo({
    destination: dest,
    orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
    duration: duration(0.5),
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

export const zoomIn = () => moveAlongView(1);
export const zoomOut = () => moveAlongView(-1.2);

/** Surface = ~3 km altitude, pitch -15 deg, over the selected site or the current centre. Orbit = 1.6e7 m. */
export function setMode(mode: 'orbit' | 'surface') {
  const v = getViewer();
  if (!v) return;
  const { data, selectedId } = useApp.getState();
  const site = data ? getSite(data, selectedId) : null;
  const cur = useCamera.getState();
  const lat = site?.lat ?? cur.lat;
  const lon = site?.lon ?? cur.lon;
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, cur.terrainHeightM ?? 0);
  const pitch = mode === 'surface' ? rad(-15) : rad(-90);
  const range = mode === 'surface' ? SURFACE_HEIGHT_M / Math.sin(rad(15)) : ORBIT_HEIGHT_M;
  v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
    offset: new Cesium.HeadingPitchRange(v.camera.heading, pitch, range),
    duration: duration(mode === 'surface' ? 2.4 : 2),
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

export function resetNorth() {
  const v = getViewer();
  if (!v) return;
  const cam = v.camera;
  cam.flyTo({
    destination: cam.position.clone(),
    orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
    duration: duration(0.6),
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}
