import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { percentile } from './fingerprint';
import {
  CELL,
  FRAG_COLOR,
  FRAG_OUT,
  FRAG_PARS,
  GRID,
  SIZE,
  SKY_FRAG,
  SKY_VERT,
  VERT_BEGIN_COLOR,
  VERT_BEGIN_DEPTH,
  VERT_NORMAL,
  VERT_PARS_COLOR,
  VERT_PARS_DEPTH,
} from './shaders';

export type Layout = 'side' | 'morph';
export type OtherBody = 'moon' | 'mars';

export interface LabParams {
  layout: Layout;
  t: number;
  exag: number;
  sunEl: number;
  sunAz: number;
  contours: boolean;
  autoOrbit: boolean;
  morphAnim: boolean;
}

export interface Prepared {
  /** Heights in km relative to the block median, GRID x GRID row-major from the north edge. */
  h: Float32Array;
  lo: number;
  hi: number;
  snowLine: number;
  min: number;
  max: number;
  /** Heights are scaled by vScale so the block keeps true proportions when its real width differs from SIZE km. */
  vScale: number;
}

/**
 * Resample to GRID x GRID (bilinear) if needed, centre on the median, convert metres to world units.
 * The scene draws every block SIZE (10.24) units wide. A block that is really widthKm wide (10.24 for the 256 x 40 m Moon and Earth
 * grids, 30 for the 150 x 200 m Mars grids) gets its heights scaled by SIZE / widthKm, so slopes keep their true angle.
 */
export function prepareHeights(elev: Float32Array, w: number, h: number, widthKm: number = SIZE): Prepared {
  const vScale = SIZE / Math.max(0.1, widthKm);
  let src = elev;
  if (w !== GRID || h !== GRID) {
    src = new Float32Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      const fy = (y / (GRID - 1)) * (h - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(h - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < GRID; x++) {
        const fx = (x / (GRID - 1)) * (w - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(w - 1, x0 + 1);
        const tx = fx - x0;
        const a = elev[y0 * w + x0] * (1 - tx) + elev[y0 * w + x1] * tx;
        const b = elev[y1 * w + x0] * (1 - tx) + elev[y1 * w + x1] * tx;
        src[y * GRID + x] = a * (1 - ty) + b * ty;
      }
    }
  }
  const median = percentile(src, 50);
  const out = new Float32Array(GRID * GRID);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < out.length; i++) {
    const v = ((src[i] - median) / 1000) * vScale;
    out[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { h: out, lo: percentile(out, 3), hi: percentile(out, 97), snowLine: 0, min, max, vScale };
}

interface BodyLook {
  base: [number, number, number]; // sRGB
  amb: [number, number, number];
  zen: [number, number, number];
  hor: [number, number, number];
  haze: number;
  hazeCol: [number, number, number];
  stars: number;
  sun: number;
}

const LOOKS: Record<OtherBody, BodyLook> = {
  moon: { base: [0.56, 0.56, 0.55], amb: [0.008, 0.008, 0.009], zen: [0, 0, 0], hor: [0, 0, 0], haze: 0, hazeCol: [0, 0, 0], stars: 1, sun: 3.3 },
  mars: {
    base: [0.69, 0.4, 0.26],
    amb: [0.11, 0.07, 0.05],
    zen: [0.33, 0.2, 0.17],
    hor: [0.82, 0.58, 0.43],
    haze: 0.55,
    hazeCol: [0.5, 0.3, 0.2],
    stars: 0,
    sun: 2.4,
  },
};

const EARTH_SUN = 3.0;
const EARTH_HAZE_COL: [number, number, number] = [0.1, 0.1, 0.28];
const ACCENT = new THREE.Color('#9EE7F2');
const GAP = 1.5;
const HALF = SIZE / 2;
const SIDE_X = HALF + GAP / 2;

function ease(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function heightTexture(h: Float32Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(h, GRID, GRID, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** One geometry for all blocks: the 256x256 grid plus a skirt that makes it read as a cut block. */
function buildBlockGeometry(): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(SIZE, SIZE, GRID - 1, GRID - 1);
  plane.rotateX(-Math.PI / 2);
  const gp = plane.getAttribute('position').array as Float32Array;
  const guv = plane.getAttribute('uv').array as Float32Array;
  const gIdx = plane.getIndex()!.array;
  const gridCount = GRID * GRID;

  // Skirt: four edges, each GRID top verts + GRID bottom verts.
  const edges: { x: (i: number) => number; z: (i: number) => number; u: (i: number) => number; v: (i: number) => number; nx: number; nz: number; flip: boolean }[] = [
    { x: (i) => -HALF + i * CELL, z: () => -HALF, u: (i) => i / (GRID - 1), v: () => 1, nx: 0, nz: -1, flip: false },
    { x: (i) => -HALF + i * CELL, z: () => HALF, u: (i) => i / (GRID - 1), v: () => 0, nx: 0, nz: 1, flip: true },
    { x: () => -HALF, z: (i) => -HALF + i * CELL, u: () => 0, v: (i) => 1 - i / (GRID - 1), nx: -1, nz: 0, flip: true },
    { x: () => HALF, z: (i) => -HALF + i * CELL, u: () => 1, v: (i) => 1 - i / (GRID - 1), nx: 1, nz: 0, flip: false },
  ];
  const skirtVerts = edges.length * GRID * 2;
  const pos = new Float32Array((gridCount + skirtVerts) * 3);
  const uv = new Float32Array((gridCount + skirtVerts) * 2);
  const aEdge = new Float32Array((gridCount + skirtVerts) * 3);
  pos.set(gp);
  uv.set(guv);
  const idx: number[] = Array.from(gIdx as ArrayLike<number>);
  let vi = gridCount;
  for (const e of edges) {
    const start = vi;
    for (let i = 0; i < GRID; i++) {
      for (let b = 0; b < 2; b++) {
        pos.set([e.x(i), 0, e.z(i)], vi * 3);
        uv.set([e.u(i), e.v(i)], vi * 2);
        aEdge.set([e.nx, e.nz, b], vi * 3);
        vi++;
      }
    }
    for (let i = 0; i < GRID - 1; i++) {
      const t0 = start + i * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      if (e.flip) idx.push(t0, b0, t1, t1, b0, b1);
      else idx.push(t0, t1, b0, t1, b1, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(aEdge, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF, -10, -HALF), new THREE.Vector3(HALF, 10, HALF));
  plane.dispose();
  return geo;
}

interface Shared {
  uExag: { value: number };
  uScan: { value: number };
  uShim: { value: number };
  uContour: { value: number };
  uBottom: { value: number };
  uHazeK: { value: number };
}

interface Block {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  u: Record<string, { value: unknown }>;
}

export interface LabSceneOptions {
  host: HTMLElement;
  earth: Prepared | null;
  other: Prepared | null;
  body: OtherBody;
  /** 0..1 share of Earth block that is snow-capped, from catalogue values. */
  snowFrac: number;
  reducedMotion: boolean;
  /** performance.now() time at which the intro scan may begin (the page waits 1 s after opening). */
  scanAt?: number;
  onInteract: () => void;
  onT: (t: number) => void;
}

export class LabScene {
  private renderer: THREE.WebGLRenderer;
  private sceneA = new THREE.Scene();
  private sceneB = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 3000);
  private controls: OrbitControls;
  private shared: Shared;
  private blocks: Block[] = [];
  private geo = buildBlockGeometry();
  private textures: THREE.DataTexture[] = [];
  private earthBlock: Block | null = null;
  private otherBlock: Block | null = null;
  private morphBlock: Block | null = null;
  private sky: THREE.Mesh;
  private lightA!: THREE.DirectionalLight;
  private lightB: THREE.DirectionalLight | null = null;
  private morphOn = false;
  private skyU: { uSky: { value: number }; uSunDir: { value: THREE.Vector3 } };
  private stars: THREE.Points;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private p: LabParams = { layout: 'side', t: 0, exag: 1.5, sunEl: 28, sunAz: 135, contours: false, autoOrbit: true, morphAnim: false };
  private look: BodyLook;
  private lastTick = 0;
  private lastEmit = 0;
  private phase = 0;
  private scanStart = -1;
  private flyFrom = 0;
  private flyTo = 0;
  private flyStart = -1;
  private blocksMinY = 0;
  private minDistance = 2;

  constructor(private o: LabSceneOptions) {
    this.look = LOOKS[o.body];
    const host = o.host;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.shared = {
      uExag: { value: 1.5 },
      uScan: { value: o.reducedMotion ? 2 : -0.2 },
      uShim: { value: o.reducedMotion ? 0 : 1 },
      uContour: { value: 0 },
      uBottom: { value: -1 },
      uHazeK: { value: 1 },
    };

    // Sky dome and stars live in sceneA only; sceneB draws its block over it without clearing.
    this.skyU = { uSky: { value: 0.85 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) } };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uSky: this.skyU.uSky,
          uSunDir: this.skyU.uSunDir,
          uZenO: { value: new THREE.Vector3(...this.look.zen) },
          uHorO: { value: new THREE.Vector3(...this.look.hor) },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -2;
    this.sceneA.add(this.sky);

    const n = 3200;
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      // keep most stars above the horizon
      sp.set([r * Math.cos(th) * 180, Math.abs(u) * 180, r * Math.sin(th) * 180], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.sceneA.add(this.stars);

    // Blocks
    const earthTex = o.earth ? heightTexture(o.earth.h) : null;
    const otherTex = o.other ? heightTexture(o.other.h) : null;
    this.textures = [earthTex, otherTex].filter(Boolean) as THREE.DataTexture[];
    const snowOn = o.snowFrac > 0.02 && o.earth;
    const snowLine = o.earth && snowOn ? this.snowNorm(o.earth, o.snowFrac) : 9;
    const earthLo = o.earth?.lo ?? 0;
    const earthHi = o.earth?.hi ?? 1;
    const otherLo = o.other?.lo ?? 0;
    const otherHi = o.other?.hi ?? 1;

    if (earthTex && o.earth) {
      this.earthBlock = this.makeBlock(this.sceneA, earthTex, earthTex, 0, 0, earthLo, earthHi, snowLine, o.earth.vScale);
    }
    if (otherTex && o.other) {
      this.otherBlock = this.makeBlock(o.earth ? this.sceneB : this.sceneA, otherTex, otherTex, 0, 1, otherLo, otherHi, 9, o.other.vScale);
    }
    if (earthTex && otherTex) {
      this.morphBlock = this.makeBlock(this.sceneA, earthTex, otherTex, 0, 0, earthLo, earthHi, snowLine, o.earth?.vScale ?? 1);
    }
    this.lightA = this.makeLight(this.sceneA);
    this.lightB = o.earth && o.other ? this.makeLight(this.sceneB) : null;
    const minH = Math.min(o.earth?.min ?? 0, o.other?.min ?? 0);
    this.blocksMinY = minH;

    this.camera.position.set(0, 14, 24);
    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = this.minDistance;
    controls.maxDistance = 70;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      this.o.onInteract();
    });
    this.controls = controls;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.onVis);
    this.applyAll();
    this.frameCamera(true);
    this.raf = requestAnimationFrame(this.tick);
    if (import.meta.env.DEV) (window as unknown as { __lab: unknown }).__lab = this;
  }

  /** Normalised height (same scale as uLo/uHi) where snow starts. */
  private snowNorm(e: Prepared, frac: number): number {
    const f = Math.min(0.25, Math.max(0.02, frac));
    const q = percentile(e.h, 100 * (1 - f));
    return (q - e.lo) / Math.max(1e-4, e.hi - e.lo);
  }

  private makeBlock(scene: THREE.Scene, a: THREE.DataTexture, b: THREE.DataTexture, t: number, pal: number, lo: number, hi: number, snow: number, vScale = 1): Block {
    const s = this.shared;
    const look = this.look;
    const u: Record<string, { value: unknown }> = {
      uTexA: { value: a },
      uTexB: { value: b },
      uT: { value: t },
      uCell: { value: CELL },
      uExag: s.uExag,
      uScan: s.uScan,
      uBottom: s.uBottom,
      uShim: s.uShim,
      uContour: s.uContour,
      uInvV: { value: 1 / vScale },
      uHazeK: s.uHazeK,
      uPal: { value: pal },
      uLo: { value: lo },
      uHi: { value: hi },
      uSnow: { value: snow },
      uHazeO: { value: look.haze },
      uHazeColE: { value: new THREE.Vector3(...EARTH_HAZE_COL) },
      uHazeColO: { value: new THREE.Vector3(...look.hazeCol) },
      uBase: { value: new THREE.Vector3(...look.base) },
      uAmbO: { value: new THREE.Vector3(...look.amb) },
      uAccent: { value: new THREE.Vector3(ACCENT.r, ACCENT.g, ACCENT.b) },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', VERT_PARS_COLOR)
        .replace('#include <beginnormal_vertex>', VERT_NORMAL)
        .replace('#include <begin_vertex>', VERT_BEGIN_COLOR);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', FRAG_PARS)
        .replace('#include <color_fragment>', FRAG_COLOR)
        .replace('#include <opaque_fragment>', FRAG_OUT);
    };
    mat.customProgramCacheKey = () => 'terralog-lab-terrain';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_PARS_DEPTH).replace('#include <begin_vertex>', VERT_BEGIN_DEPTH);
    };
    depth.customProgramCacheKey = () => 'terralog-lab-depth';

    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);

    const block = { mesh, mat, depth, u };
    this.blocks.push(block);
    return block;
  }

  /** One shadow-casting sun per scene, so a block never shadows its neighbour. */
  private makeLight(scene: THREE.Scene): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    const sc = light.shadow.camera;
    sc.left = sc.bottom = -8.2;
    sc.right = sc.top = 8.2;
    sc.near = 1;
    sc.far = 34;
    sc.updateProjectionMatrix();
    scene.add(light, light.target);
    return light;
  }

  private placeLight(light: THREE.DirectionalLight, centre: THREE.Vector3, k: number, dir: THREE.Vector3) {
    light.target.position.copy(centre);
    light.position.copy(centre).addScaledVector(dir, 16);
    light.target.updateMatrixWorld();
    light.intensity = lerp(EARTH_SUN, this.look.sun, k);
    light.color.setRGB(1, lerp(0.96, 0.97, k), lerp(0.9, 0.94, k));
  }

  // ---- public API -------------------------------------------------------------------------

  get hasEarth() {
    return !!this.earthBlock;
  }

  set(patch: Partial<LabParams>) {
    const prev = this.p;
    const next = { ...prev, ...patch };
    if (next.morphAnim && prev.morphAnim) next.t = prev.t;
    this.p = next;
    if (next.morphAnim && !prev.morphAnim) this.phase = Math.acos(1 - 2 * Math.min(1, Math.max(0, next.t)));
    if (patch.layout && patch.layout !== prev.layout) this.frameCamera(false);
    if (patch.autoOrbit !== undefined) this.controls.autoRotate = patch.autoOrbit;
    this.applyAll();
  }

  replayScan() {
    if (this.o.reducedMotion) return;
    this.shared.uScan.value = -0.2;
    this.shared.uShim.value = 1;
    this.scanStart = -1;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro.disconnect();
    this.controls.dispose();
    this.geo.dispose();
    for (const b of this.blocks) {
      b.mat.dispose();
      b.depth.dispose();
    }
    this.lightA.shadow.map?.dispose();
    this.lightB?.shadow.map?.dispose();
    for (const t of this.textures) t.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---- internals --------------------------------------------------------------------------

  private onVis = () => {
    if (this.disposed) return;
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (!this.raf) {
      this.lastTick = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private resize() {
    const w = this.o.host.clientWidth;
    const h = this.o.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // On desktop the fingerprint panel covers ~380 px on the right: shift the view centre
    // into the free area so both blocks stay visible.
    const pad = w >= 900 ? 380 : 0;
    if (pad) this.camera.setViewOffset(w + pad, h, pad, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private sunDir(): THREE.Vector3 {
    const el = (this.p.sunEl * Math.PI) / 180;
    const az = (this.p.sunAz * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  }

  private frameCamera(instant: boolean) {
    const morph = this.p.layout === 'morph' || !(this.earthBlock && this.otherBlock);
    const dist = morph ? 23 : 38;
    if (instant) {
      const a = (35 * Math.PI) / 180;
      this.camera.position.set(dist * 0.18, Math.sin(a) * dist, Math.cos(a) * dist);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      this.flyStart = -1;
      return;
    }
    this.flyFrom = this.camera.position.distanceTo(this.controls.target);
    this.flyTo = dist;
    this.flyStart = performance.now();
  }

  private applyAll() {
    const { layout, t, exag, sunEl, contours } = this.p;
    const both = !!(this.earthBlock && this.otherBlock);
    const morph = layout === 'morph' && both;
    this.shared.uExag.value = exag;
    this.shared.uContour.value = contours ? 1 : 0;
    this.shared.uBottom.value = this.blocksMinY * exag - 0.55;
    this.shared.uHazeK.value = morph ? 1 : 0.7;

    // visibility and placement
    if (this.earthBlock) {
      this.earthBlock.mesh.visible = !morph;
      this.earthBlock.mesh.position.x = both ? -SIDE_X : 0;
    }
    if (this.otherBlock) {
      this.otherBlock.mesh.visible = !morph;
      this.otherBlock.mesh.position.x = both ? SIDE_X : 0;
    }
    if (this.morphBlock) {
      this.morphBlock.mesh.visible = morph;
      this.morphBlock.mesh.position.x = 0;
      this.morphBlock.u.uT.value = t;
      this.morphBlock.u.uPal.value = t;
      this.morphBlock.u.uLo.value = lerp(this.o.earth!.lo, this.o.other!.lo, t);
      this.morphBlock.u.uHi.value = lerp(this.o.earth!.hi, this.o.other!.hi, t);
      const sn = this.earthBlock!.u.uSnow.value as number;
      this.morphBlock.u.uSnow.value = sn >= 5 ? 9 : lerp(sn, 9, smooth(0.0, 0.5, t));
    }

    // sky and stars follow t in morph, a dark space backdrop otherwise
    const skyT = morph ? t : this.earthBlock ? 0.85 : 1;
    this.skyU.uSky.value = skyT;
    this.skyU.uSunDir.value.copy(this.sunDir());
    (this.stars.material as THREE.PointsMaterial).opacity = this.look.stars * smooth(0.25, 1, skyT) * (skyT > 0.8 ? 1 : 0.9);

    // sun and exposure
    const dir = this.sunDir();
    const lowSun = 1 - smooth(1.5, 32, sunEl);
    this.renderer.toneMappingExposure = 1 + 1.6 * lowSun;
    this.morphOn = morph;
    const aBlock = morph ? this.morphBlock : (this.earthBlock ?? this.otherBlock);
    if (aBlock) this.placeLight(this.lightA, aBlock.mesh.position, morph ? t : this.earthBlock ? 0 : 1, dir);
    if (this.lightB && this.otherBlock) this.placeLight(this.lightB, this.otherBlock.mesh.position, 1, dir);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0.016;
    this.lastTick = now;

    // intro scan
    const s = this.shared;
    if (!this.o.reducedMotion && s.uScan.value < 1.4) {
      if (this.scanStart < 0) this.scanStart = Math.max(now, this.o.scanAt ?? now);
      const k = (now - this.scanStart) / 1800;
      s.uScan.value = lerp(-0.2, 1.3, ease(Math.min(1, Math.max(0, k))));
      if (k >= 1) s.uScan.value = 2;
      const after = (now - this.scanStart - 1800) / 900;
      s.uShim.value = k < 1 ? 1 : Math.max(0, 1 - after);
    } else if (s.uShim.value > 0 && s.uScan.value >= 1.4) {
      s.uShim.value = Math.max(0, s.uShim.value - dt * 1.2);
    }

    // morph ping-pong
    if (this.p.morphAnim && this.morphBlock) {
      this.phase += dt * ((Math.PI * 2) / 9);
      const t = 0.5 - 0.5 * Math.cos(this.phase);
      this.p = { ...this.p, t };
      this.applyAll();
      if (now - this.lastEmit > 70) {
        this.lastEmit = now;
        this.o.onT(t);
      }
    }

    // camera fly
    if (this.flyStart >= 0) {
      const k = Math.min(1, (now - this.flyStart) / 700);
      const d = lerp(this.flyFrom, this.flyTo, ease(k));
      const off = this.camera.position.clone().sub(this.controls.target);
      off.setLength(d);
      this.camera.position.copy(this.controls.target).add(off);
      if (k >= 1) this.flyStart = -1;
    }

    this.controls.update();
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);

    const r = this.renderer;
    r.clear();
    r.render(this.sceneA, this.camera);
    if (this.lightB && !this.morphOn) r.render(this.sceneB, this.camera);
  };
}
