import * as Cesium from 'cesium';
import { prefersReducedMotion } from '../globe/viewer';

export const EYE_HEIGHT = 1.7;
export const TELEPORT_RADIUS_M = 5000;
const R = 6378137;
const WALK_SPEED = 5;
const SPRINT = 3;
const LOOK_SENS = 0.0022;
const SAMPLE_MS = 150;

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
  tileset: Cesium.Cesium3DTileset | null;
  onPointerLock: (locked: boolean) => void;
}

/** First-person walk/fly controller driven from scene.preRender. */
export class TourController {
  pose: TourPose;
  private keys = new Set<string>();
  private last = performance.now();
  private lastSample = 0;
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
  }

  async start() {
    const v = this.viewer;
    const ssc = v.scene.screenSpaceCameraController;
    ssc.enableInputs = false;
    const reduced = prefersReducedMotion();
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
    await this.sampleGround(true);
    if (reduced) {
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

  private async sampleGround(force = false) {
    const now = performance.now();
    if (this.sampling || (!force && now - this.lastSample < SAMPLE_MS)) return;
    this.sampling = true;
    this.lastSample = now;
    const carto = Cesium.Cartographic.fromDegrees(this.pose.lon, this.pose.lat);
    try {
      let h: number | undefined;
      if (this.opts.tileset?.show) {
        const [p] = await this.viewer.scene.sampleHeightMostDetailed([carto], [], 1);
        h = p?.height;
      } else if (this.viewer.terrainProvider.availability) {
        const [p] = await Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, [carto]);
        h = p?.height;
      } else {
        h = this.viewer.scene.globe.getHeight(carto) ?? 0;
      }
      if (h !== undefined && Number.isFinite(h)) this.pose.ground = h;
    } catch {
      const g = this.viewer.scene.globe.getHeight(carto);
      if (g !== undefined) this.pose.ground = g;
    } finally {
      this.sampling = false;
    }
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
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
    if (p.mode === 'walk') {
      const rate = this.dropping ? 2.2 : 10;
      p.height += (floor - p.height) * Math.min(1, dt * rate);
      if (this.levelling) p.pitch += (Cesium.Math.toRadians(-6) - p.pitch) * Math.min(1, dt * 2.2);
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
