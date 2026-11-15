import * as Cesium from 'cesium';
import { prefersReducedMotion } from '../globe/viewer';

export const EYE_HEIGHT = 1.7;
export const TELEPORT_RADIUS_M = 5000;
const R = 6378137;
const WALK_SPEED = 5;
const SPRINT = 3;
const LOOK_SENS = 0.0022;
const SAMPLE_MS = 150;
/** Full-detail height samples force tile loads under the camera, so they run rarely; cheap samples fill in. */
const DETAILED_SAMPLE_MS = 2000;
/** No land surface is below about -430 m (Dead Sea); lower samples are bad reads and are ignored. */
const MIN_GROUND_M = -500;
const plausible = (h: number | undefined): h is number => h !== undefined && Number.isFinite(h) && h > MIN_GROUND_M;
/** Flight end height above the pre-sampled ground: close enough that the final drop is short. */
const ARRIVE_ABOVE_GROUND_M = 150;
/** With no height known at all, arrive above the highest analog sites (Tibetan plateau, ~5.5 km). */
const ARRIVE_BLIND_M = 6000;
/** Quick globe readings further than this from the last full-detail sample are ignored. */
const QUICK_TRUST_M = 150;

export interface TourPose {
  lat: number;
  lon: number;
  height: number;
  ground: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  flySpeed: number;
}

export interface TourOptions {
  spawn: { lat: number; lon: number; heading: number };
  /** Photoreal tiles. May arrive after the tour started; see setTileset. */
  tileset: Cesium.Cesium3DTileset | null;
  onPointerLock: (locked: boolean) => void;
  /** Terrain height at the spawn point, sampled ahead of time (globe/warm.ts). Lets the tour start without waiting. */
  groundHint?: number;
}

/** First-person walk/fly controller driven from scene.preRender. */
export class TourController {
  pose: TourPose;
  private keys = new Set<string>();
  private last = performance.now();
  private lastSample = 0;
  private lastDetailed = 0;
  /** Detailed height minus globe height at the last detailed sample, so cheap samples line up with it. */
  private groundOffset = 0;
  /** False until a trusted height exists (pre-sampled or full detail); the landing holds altitude until then. */
  private groundKnown = false;
  /** Height from the last full-detail sample; quick globe readings must stay near it. */
  private lastDetailedH: number | null = null;
  private sampling = false;
  private removePreRender: (() => void) | null = null;
  private cleanup: (() => void)[] = [];
  private dropping = true;
  private levelling = true;
  private savedView: { destination: Cesium.Cartesian3; heading: number; pitch: number; roll: number };
  private readonly spawnLat: number;
  private readonly spawnLon: number;

  constructor(
    private viewer: Cesium.Viewer,
    private opts: TourOptions,
  ) {
    const cam = viewer.camera;
    this.savedView = { destination: Cesium.Cartesian3.clone(cam.positionWC), heading: cam.heading, pitch: cam.pitch, roll: cam.roll };
    this.spawnLat = opts.spawn.lat;
    this.spawnLon = opts.spawn.lon;
    this.pose = {
      lat: opts.spawn.lat,
      lon: opts.spawn.lon,
      height: 2500,
      ground: 0,
      heading: Cesium.Math.toRadians(opts.spawn.heading),
      pitch: Cesium.Math.toRadians(-8),
      mode: 'walk',
      flySpeed: 60,
    };
    if (opts.groundHint !== undefined) {
      this.pose.ground = opts.groundHint;
      this.lastDetailedH = opts.groundHint;
      this.groundKnown = true;
      // Arrive just above the real ground instead of at a fixed 2.5 km: a short drop, fewer tiles to load.
      this.pose.height = opts.groundHint + ARRIVE_ABOVE_GROUND_M;
    }
  }

  /** Attach the photoreal tileset once it has loaded; the flight does not wait for it. */
  setTileset(ts: Cesium.Cesium3DTileset | null) {
    this.opts.tileset = ts;
    this.lastDetailed = 0;
  }

  async start() {
    const v = this.viewer;
    const ssc = v.scene.screenSpaceCameraController;
    ssc.enableInputs = false;
    const reduced = prefersReducedMotion();
    // Cold start (deep link): no trusted height yet, so arrive above the highest sites, never into the
    // ground. Globe tiles seen from orbit are too coarse to aim with (they read 2.5 km low in Tibet).
    if (this.opts.groundHint === undefined) this.pose.height = ARRIVE_BLIND_M;
    await new Promise<void>((resolve) => {
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(this.pose.lon, this.pose.lat, this.pose.height),
        orientation: { heading: this.pose.heading, pitch: Cesium.Math.toRadians(-25), roll: 0 },
        duration: reduced ? 0 : 2.2,
        complete: resolve,
        cancel: resolve,
      });
    });
    this.pose.pitch = Cesium.Math.toRadians(-25);
    // Start at once and refine in the background. With no trusted height yet the camera hovers (see
    // tick) until the first full-detail sample lands, so nothing here has to wait.
    void this.sampleGround(true);
    if (reduced && this.groundKnown) {
      this.pose.height = this.pose.ground + EYE_HEIGHT;
      this.dropping = false;
    }
    this.bindInput();
    this.last = performance.now();
    this.removePreRender = v.scene.preRender.addEventListener(() => this.tick());
  }

  private bindInput() {
    const canvas = this.viewer.canvas;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
      const k = e.code;
      if (k === 'Space') {
        e.preventDefault();
        this.pose.mode = this.pose.mode === 'walk' ? 'fly' : 'walk';
        if (this.pose.mode === 'walk') this.dropping = true;
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (e.shiftKey) this.keys.add('Shift');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (!e.shiftKey) this.keys.delete('Shift');
    };
    const onClick = () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    };
    const onLockChange = () => this.opts.onPointerLock(document.pointerLockElement === canvas);
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      this.levelling = false;
      this.pose.heading = Cesium.Math.zeroToTwoPi(this.pose.heading + e.movementX * LOOK_SENS);
      this.pose.pitch = Cesium.Math.clamp(this.pose.pitch - e.movementY * LOOK_SENS, -1.45, 1.45);
    };
    const onWheel = (e: WheelEvent) => {
      if (this.pose.mode !== 'fly') return;
      e.preventDefault();
      this.pose.flySpeed = Cesium.Math.clamp(this.pose.flySpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 5, 3000);
    };
    const onBlur = () => this.keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    this.cleanup.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });
  }

  private setGround(h: number) {
    this.pose.ground = h;
    this.groundKnown = true;
  }

  private async sampleGround(force = false) {
    const now = performance.now();
    if (!force && now - this.lastSample < SAMPLE_MS) return;
    this.lastSample = now;
    const carto = Cesium.Cartographic.fromDegrees(this.pose.lon, this.pose.lat);
    const scene = this.viewer.scene;
    const photoreal = !!this.opts.tileset?.show;

    // Cheap path every 150 ms (also while a detailed sample is pending): the globe's already-loaded
    // terrain, shifted by the offset measured at the last detailed sample. (scene.sampleHeight is not
    // usable here: it measures from the current view and returned -11 km at eye level.)
    if (this.sampling || (!force && now - this.lastDetailed < DETAILED_SAMPLE_MS)) {
      const g = scene.globe.getHeight(carto);
      // Coarse tiles can be kilometres off: only accept readings close to the last trusted sample.
      if (plausible(g) && this.lastDetailedH !== null && Math.abs(g + this.groundOffset - this.lastDetailedH) < QUICK_TRUST_M) {
        this.setGround(g + this.groundOffset);
      }
      return;
    }

    // Full-detail path at start, after teleports and every 2 s: may wait for tiles.
    this.sampling = true;
    this.lastDetailed = now;
    try {
      let h: number | undefined;
      if (photoreal) {
        const [p] = await scene.sampleHeightMostDetailed([carto], [], 1);
        h = p?.height;
      } else if (this.viewer.terrainProvider.availability) {
        const [p] = await Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, [carto]);
        h = p?.height;
      } else {
        h = scene.globe.getHeight(carto) ?? 0;
      }
      if (plausible(h)) {
        this.setGround(h);
        this.lastDetailedH = h;
        const g = scene.globe.getHeight(carto);
        // Bound the offset: a coarse globe tile can be far off while it is still loading.
        this.groundOffset = plausible(g) ? Cesium.Math.clamp(h - g, -50, 50) : 0;
      }
    } catch {
      /* keep the last trusted height; the next detailed sample retries */
    } finally {
      this.sampling = false;
    }
  }

  private tick() {
    const now = performance.now();
    const realDt = Math.min(1, (now - this.last) / 1000);
    const dt = Math.min(0.1, realDt);
    this.last = now;
    const p = this.pose;
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    if (turn) p.heading = Cesium.Math.zeroToTwoPi(p.heading + turn * 1.6 * dt);

    const speed = (p.mode === 'walk' ? WALK_SPEED : p.flySpeed) * (k.has('Shift') ? SPRINT : 1);
    const horiz = p.mode === 'fly' ? Math.cos(p.pitch) : 1;
    let dN = (Math.cos(p.heading) * fwd * horiz - Math.sin(p.heading) * side) * speed * dt;
    let dE = (Math.sin(p.heading) * fwd * horiz + Math.cos(p.heading) * side) * speed * dt;
    if (!Number.isFinite(dN)) dN = 0;
    if (!Number.isFinite(dE)) dE = 0;
    p.lat = Cesium.Math.clamp(p.lat + Cesium.Math.toDegrees(dN / R), -89.9, 89.9);
    p.lon = p.lon + Cesium.Math.toDegrees(dE / (R * Math.max(0.02, Math.cos(Cesium.Math.toRadians(p.lat)))));
    if (p.lon > 180) p.lon -= 360;
    if (p.lon < -180) p.lon += 360;

    this.sampleGround();
    const floor = p.ground + EYE_HEIGHT;
    if (p.mode === 'walk' && !this.groundKnown) {
      // No height yet (cold deep link, tiles still loading): hover instead of dropping toward sea level.
    } else if (p.mode === 'walk') {
      // Exponential approach on real time, so a slow frame rate does not stretch the landing.
      const rate = this.dropping ? 2.2 : 10;
      p.height += (floor - p.height) * (1 - Math.exp(-rate * realDt));
      if (this.levelling) p.pitch += (Cesium.Math.toRadians(-6) - p.pitch) * (1 - Math.exp(-2.2 * realDt));
      if (this.dropping && Math.abs(p.height - floor) < 0.5) {
        this.dropping = false;
        this.levelling = false;
      }
    } else {
      const up = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
      p.height += (Math.sin(p.pitch) * fwd + up) * speed * dt;
      p.height = Math.max(p.height, floor);
    }

    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      orientation: { heading: p.heading, pitch: p.pitch, roll: 0 },
    });
  }

  distanceFromSpawn(lat: number, lon: number): { n: number; e: number } {
    const n = Cesium.Math.toRadians(lat - this.spawnLat) * R;
    const e = Cesium.Math.toRadians(lon - this.spawnLon) * R * Math.cos(Cesium.Math.toRadians(this.spawnLat));
    return { n, e };
  }

  /** Teleport to an offset (metres north/east of spawn), clamped to the teleport radius. */
  teleportOffset(n: number, e: number) {
    const d = Math.hypot(n, e);
    if (d > TELEPORT_RADIUS_M) {
      n *= TELEPORT_RADIUS_M / d;
      e *= TELEPORT_RADIUS_M / d;
    }
    this.pose.lat = this.spawnLat + Cesium.Math.toDegrees(n / R);
    this.pose.lon = this.spawnLon + Cesium.Math.toDegrees(e / (R * Math.cos(Cesium.Math.toRadians(this.spawnLat))));
    this.pose.height = Math.max(this.pose.height, this.pose.ground + 200);
    this.dropping = true;
    this.lastSample = 0;
    this.lastDetailed = 0;
    // Up to 5 km away: the old reference height may not apply, so trust only the next detailed sample.
    this.lastDetailedH = null;
    this.groundKnown = false;
  }

  teleportTo(lat: number, lon: number) {
    const { n, e } = this.distanceFromSpawn(lat, lon);
    this.teleportOffset(n, e);
  }

  get spawn() {
    return { lat: this.spawnLat, lon: this.spawnLon };
  }

  stop(restoreView = true) {
    this.removePreRender?.();
    this.removePreRender = null;
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    this.viewer.scene.screenSpaceCameraController.enableInputs = true;
    if (restoreView) {
      this.viewer.camera.setView({
        destination: this.savedView.destination,
        orientation: { heading: this.savedView.heading, pitch: this.savedView.pitch, roll: this.savedView.roll },
      });
    }
  }
}
