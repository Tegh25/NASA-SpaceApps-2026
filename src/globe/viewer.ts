import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useGlobeHealth } from './health';

declare const __CESIUM_ION_TOKEN__: string;

export const ION_TOKEN: string = __CESIUM_ION_TOKEN__;
export const HAS_ION = ION_TOKEN.length > 0;

let viewer: Cesium.Viewer | null = null;
let creating: Promise<Cesium.Viewer> | null = null;
let resolveReady: (v: Cesium.Viewer) => void;
const ready = new Promise<Cesium.Viewer>((r) => (resolveReady = r));

/** Resolves once the shared viewer exists (it is created by GlobeView). */
export const whenViewer = () => ready;

export function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export const getViewer = () => viewer;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

function gibsProvider(path: string, ext: string, maxLevel: number, credit: string) {
  return new Cesium.UrlTemplateImageryProvider({
    url: `${GIBS}/${path}/{z}/{y}/{x}.${ext}`,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: maxLevel,
    credit,
  });
}

/** NASA GIBS Blue Marble (no key needed). Used as the base layer in every configuration. */
export const blueMarbleProvider = () =>
  gibsProvider('BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8', 'jpeg', 8, 'Imagery: NASA EOSDIS GIBS / Blue Marble');
/** MODIS true colour, fixed date; sharper than Blue Marble when zoomed in (keyless only). */
const modisProvider = () =>
  gibsProvider('MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-08-01/GoogleMapsCompatible_Level9', 'jpg', 9, 'Imagery: NASA EOSDIS GIBS / MODIS Terra');
/** VIIRS Black Marble, shown on the night side only. */
const blackMarbleProvider = () =>
  gibsProvider('VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8', 'png', 8, 'Imagery: NASA EOSDIS GIBS / VIIRS Black Marble');

/** Fixed sun: 06:00 UTC on the March equinox puts the subsolar point near 90 E (Tibet is lit). */
const SUN_TIME = '2026-03-20T06:00:00Z';
export const INITIAL_VIEW = { lon: 70, lat: 24, height: 2.2e7 };

function buildGraticule(): Cesium.PolylineCollection {
  const lines = new Cesium.PolylineCollection();
  const material = Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#9EE7F2').withAlpha(0.1) });
  const H = 6000;
  for (let lon = -180; lon < 180; lon += 15) {
    const pos: number[] = [];
    for (let lat = -90; lat <= 90; lat += 5) pos.push(lon, lat, H);
    lines.add({ positions: Cesium.Cartesian3.fromDegreesArrayHeights(pos), width: 1, material });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const pos: number[] = [];
    for (let lon = -180; lon <= 180; lon += 5) pos.push(lon, lat, H);
    lines.add({ positions: Cesium.Cartesian3.fromDegreesArrayHeights(pos), width: lat === 0 ? 1.5 : 1, material });
  }
  return lines;
}

/**
 * Cesium has no recovery for a lost WebGL context: its render loop keeps running against a 0 x 0 buffer and
 * dies with "Expected width to be greater than 0". Stop the loop, tell the app, and replace Cesium's own error
 * dialog with the app's message (see GlobeFailureNotice).
 */
function watchHealth(v: Cesium.Viewer) {
  v.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    v.useDefaultRenderLoop = false;
    useGlobeHealth.getState().report('context-lost');
  });
  v.scene.renderError.addEventListener(() => {
    v.useDefaultRenderLoop = false;
    useGlobeHealth.getState().report('render-error');
  });
}

export async function createViewer(container: HTMLElement): Promise<Cesium.Viewer> {
  if (viewer) return viewer;
  if (creating) return creating;
  creating = (async () => {
    // Fast keyless first layer in every configuration.
    const baseLayer = new Cesium.ImageryLayer(blueMarbleProvider(), {});
    let terrain: Cesium.Terrain | undefined;
    if (HAS_ION) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN;
      terrain = Cesium.Terrain.fromWorldTerrain();
    } else {
      console.warn('[Terralog] CESIUM_ION_TOKEN is not set. Using NASA GIBS imagery and no terrain.');
    }

    const v = new Cesium.Viewer(container, {
      baseLayer,
      terrain,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      vrButton: false,
      projectionPicker: false,
      msaaSamples: 4,
      // The app shows its own message (GlobeFailureNotice) instead of Cesium's dialog.
      showRenderLoopErrors: false,
    });
    const scene = v.scene;
    const globe = scene.globe;

    // Imagery stack: Blue Marble < (ion World Imagery | MODIS zoom layer) < Black Marble (night only).
    let worldLayer: Cesium.ImageryLayer | null = null;
    let modisLayer: Cesium.ImageryLayer | null = null;
    if (HAS_ION) {
      worldLayer = Cesium.ImageryLayer.fromWorldImagery({});
      v.imageryLayers.add(worldLayer);
    } else {
      modisLayer = new Cesium.ImageryLayer(modisProvider(), { alpha: 1 });
      modisLayer.show = false;
      v.imageryLayers.add(modisLayer);
    }
    const night = new Cesium.ImageryLayer(blackMarbleProvider(), {});
    // Lighting is off, so blend the city lights over the day imagery as a subtle glow.
    night.alpha = 0.35;
    v.imageryLayers.add(night);
    baseLayer.brightness = 1.15;
    baseLayer.saturation = 1.1;
    if (worldLayer) worldLayer.nightAlpha = 0.5;

    // Lighting and atmosphere.
    v.clock.shouldAnimate = false;
    v.clock.currentTime = Cesium.JulianDate.fromIso8601(SUN_TIME);
    // Full sun lighting rendered the whole disc near-black from orbit (night layer + fade
    // distances), so the globe stays evenly lit and the atmosphere carries the look.
    globe.enableLighting = false;
    globe.dynamicAtmosphereLighting = false;
    globe.showGroundAtmosphere = true;
    globe.atmosphereHueShift = -0.04;
    globe.atmosphereSaturationShift = 0.1;
    globe.depthTestAgainstTerrain = false;
    globe.baseColor = Cesium.Color.fromCssColorString('#16243A');
    globe.undergroundColor = Cesium.Color.fromCssColorString('#0B111B');
    globe.nightFadeOutDistance = 4e7;
    globe.lightingFadeOutDistance = 2.5e7;
    globe.lightingFadeInDistance = 1e7;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.hueShift = -0.06;
      scene.skyAtmosphere.saturationShift = 0.1;
      scene.skyAtmosphere.brightnessShift = 0.05;
    }
    scene.fog.enabled = true;
    scene.fog.minimumBrightness = 0.04;
    scene.backgroundColor = Cesium.Color.fromCssColorString('#05070C');
    if (scene.skyBox) scene.skyBox.show = true;
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;
    scene.requestRenderMode = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 50;

    // Subtle graticule, only visible far out.
    const grid = scene.primitives.add(buildGraticule()) as Cesium.PolylineCollection;
    const syncByHeight = () => {
      const h = v.camera.positionCartographic.height;
      grid.show = h > 2.5e6;
      if (modisLayer) modisLayer.show = h < 4e6;
      night.alpha = h > 8e6 ? 0.35 : h > 3e6 ? (0.35 * (h - 3e6)) / 5e6 : 0;
      night.show = night.alpha > 0.01;
    };
    v.camera.changed.addEventListener(syncByHeight);
    v.camera.percentageChanged = 0.01;

    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(INITIAL_VIEW.lon, INITIAL_VIEW.lat, INITIAL_VIEW.height) });
    syncByHeight();
    watchHealth(v);
    viewer = v;
    if (import.meta.env.DEV) (window as unknown as { __viewer: Cesium.Viewer }).__viewer = v;
    resolveReady(v);
    return v;
  })();
  return creating;
}

let photoreal: Cesium.Cesium3DTileset | null = null;
let photorealFailed = false;

/** Google Photorealistic 3D Tiles via Cesium ion. Returns null when unavailable. */
export async function getPhotorealTileset(v: Cesium.Viewer): Promise<Cesium.Cesium3DTileset | null> {
  if (!HAS_ION || photorealFailed) return null;
  if (photoreal) return photoreal;
  try {
    const ts = await Cesium.createGooglePhotorealistic3DTileset();
    ts.show = false;
    v.scene.primitives.add(ts);
    photoreal = ts;
    return ts;
  } catch (e) {
    console.warn('[Terralog] Photorealistic 3D Tiles unavailable, falling back to terrain.', e);
    photorealFailed = true;
    return null;
  }
}
