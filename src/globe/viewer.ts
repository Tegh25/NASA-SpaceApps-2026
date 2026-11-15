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

export { hasWebGL2 } from '../lib/webgl';

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

/**
 * Cesium's bundled Natural Earth II tiles, served from our own origin. Instant, cacheable and never
 * rate limited, so the globe always has a surface even if a remote tile server throttles us.
 */
const localBaseProvider = () => Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'));

/**
 * Remote tile servers (NASA GIBS, ion) can answer 429 or 5xx when a page is reloaded many times.
 * After a handful of failed tiles the layer hides itself instead of retrying forever.
 */
const failedLayers = new WeakSet<Cesium.ImageryLayer>();
const layerFailed = (l: Cesium.ImageryLayer) => failedLayers.has(l);

function guard(layer: Cesium.ImageryLayer, name: string, maxErrors = 6): Cesium.ImageryLayer {
  let errors = 0;
  const hook = (p: Cesium.ImageryProvider) =>
    p.errorEvent.addEventListener((err: Cesium.TileProviderError) => {
      err.retry = false;
      if (++errors === maxErrors) {
        failedLayers.add(layer);
        layer.show = false;
        console.warn(`[Terralog] ${name} tiles are failing (rate limited or offline); hiding that layer.`);
      }
    });
  if (layer.ready) hook(layer.imageryProvider);
  else layer.readyEvent.addEventListener((p) => hook(p));
  return layer;
}

/** NASA GIBS Blue Marble (no key needed). Drawn over the local base when there is no ion token. */
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
    // Local first layer in every configuration: paints immediately, never throttled.
    const baseLayer = Cesium.ImageryLayer.fromProviderAsync(localBaseProvider(), {});
    let terrain: Cesium.Terrain | undefined;
    if (HAS_ION) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN;
      terrain = Cesium.Terrain.fromWorldTerrain();
      // ion can throttle repeated reloads; the globe then stays on the smooth ellipsoid.
      terrain.errorEvent.addEventListener((e) => console.warn('[Terralog] World Terrain unavailable, using a smooth globe.', e));
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
      worldLayer = guard(Cesium.ImageryLayer.fromWorldImagery({}), 'Cesium ion imagery');
      v.imageryLayers.add(worldLayer);
    } else {
      const blueMarble = guard(new Cesium.ImageryLayer(blueMarbleProvider(), {}), 'NASA GIBS Blue Marble');
      blueMarble.brightness = 1.15;
      blueMarble.saturation = 1.1;
      v.imageryLayers.add(blueMarble);
      modisLayer = guard(new Cesium.ImageryLayer(modisProvider(), { alpha: 1 }), 'NASA GIBS MODIS');
      modisLayer.show = false;
      v.imageryLayers.add(modisLayer);
    }
    const night = guard(new Cesium.ImageryLayer(blackMarbleProvider(), {}), 'NASA GIBS Black Marble');
    // Lighting is off, so blend the city lights over the day imagery as a subtle glow.
    night.alpha = 0.35;
    v.imageryLayers.add(night);
    baseLayer.brightness = 1.1;
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
    // Keep tiles from the site fly-in around for Side by side, Walk and the trip back (default 100).
    globe.tileCacheSize = 1000;

    // Subtle graticule, only visible far out.
    const grid = scene.primitives.add(buildGraticule()) as Cesium.PolylineCollection;
    const syncByHeight = () => {
      const h = v.camera.positionCartographic.height;
      grid.show = h > 2.5e6;
      if (modisLayer && !layerFailed(modisLayer)) modisLayer.show = h < 4e6;
      night.alpha = h > 8e6 ? 0.35 : h > 3e6 ? (0.35 * (h - 3e6)) / 5e6 : 0;
      if (!layerFailed(night)) night.show = night.alpha > 0.01;
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

let photoreal: Promise<Cesium.Cesium3DTileset | null> | null = null;

/**
 * Google Photorealistic 3D Tiles via Cesium ion. Returns null when unavailable. The request itself is
 * cached, so the site prefetch and the tour share one tileset even when their calls overlap.
 */
export function getPhotorealTileset(v: Cesium.Viewer): Promise<Cesium.Cesium3DTileset | null> {
  if (!HAS_ION) return Promise.resolve(null);
  photoreal ??= (async () => {
    try {
      const ts = await Cesium.createGooglePhotorealistic3DTileset();
      ts.show = false;
      v.scene.primitives.add(ts);
      return ts;
    } catch (e) {
      console.warn('[Terralog] Photorealistic 3D Tiles unavailable, falling back to terrain.', e);
      // Allow a later tour to try again (the failure may be a dropped connection).
      setTimeout(() => (photoreal = null), 0);
      return null;
    }
  })();
  return photoreal;
}
