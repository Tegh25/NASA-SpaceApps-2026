import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

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

export async function createViewer(container: HTMLElement): Promise<Cesium.Viewer> {
  if (viewer) return viewer;
  if (creating) return creating;
  creating = (async () => {
    let baseLayer: Cesium.ImageryLayer;
    let terrain: Cesium.Terrain | undefined;
    if (HAS_ION) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN;
      baseLayer = Cesium.ImageryLayer.fromWorldImagery({});
      terrain = Cesium.Terrain.fromWorldTerrain();
    } else {
      console.warn('[Terralog] CESIUM_ION_TOKEN is not set. Using bundled low-detail imagery and no terrain.');
      baseLayer = Cesium.ImageryLayer.fromProviderAsync(
        Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')),
        {},
      );
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
    });
    v.scene.globe.enableLighting = false;
    v.scene.globe.depthTestAgainstTerrain = false;
    v.scene.backgroundColor = Cesium.Color.fromCssColorString('#070A10');
    v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0E1420');
    v.scene.screenSpaceCameraController.minimumZoomDistance = 50;
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(-40, 25, 2.2e7) });
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
