import * as Cesium from 'cesium';
import { create } from 'zustand';
import type { AppData } from '../data/loaders';
import { queryFromTarget } from '../scoring/score';
import type { NormCells, ParsedQuery } from '../scoring/types';
import { prefersReducedMotion } from './viewer';

/** UI flag for the live heat field. A HUD toggle can bind to this later. Default on. */
export const useHeat = create<{
  on: boolean;
  /** 'search' = coloured by the active query, 'target' = by closeness to the body's default target. */
  mode: 'search' | 'target';
  targetName: string | null;
  setOn: (v: boolean) => void;
}>((set) => ({ on: true, mode: 'target', targetName: null, setOn: (on) => set({ on }) }));

export const HEAT_MIN_SCORE = 40;
const WAVE_MS = 1200;
const WAVE_SPREAD = 0.72; // share of the wave spent on the outward delay
const POINT_HEIGHT_M = 9000;

type Body = 'moon' | 'mars';
const bodyOf = (b: ParsedQuery['body']): Body => (b === 'either' ? 'moon' : b);

/** The body's default analog target: first non-reserve featured site's analogFor[0] of that body, else Slater Plain / first target. */
export function defaultTarget(data: AppData, body: Body) {
  const sites = data.featured
    .filter((f) => f.kind !== 'reserve' && (f.body ?? data.targets.find((t) => t.id === f.analogFor[0])?.body) === body)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  for (const f of sites) {
    const t = f.analogFor.map((id) => data.targets.find((x) => x.id === id)).find((x) => x && x.body === body);
    if (t) return t;
  }
  return data.targets.find((t) => t.id === 'moon-slater-plain' && body === 'moon') ?? data.targets.find((t) => t.body === body) ?? null;
}

interface Active {
  col: Float32Array;
  t: number;
  w: number;
}

/**
 * One-pass score of every cell: 100 * (1 - weighted mean |t - c|) over active features with data.
 * Same maths as scoring/score.ts scoreCells, minus sort and non-max suppression.
 * Returns NaN where a cell has no comparable features or fails a required filter.
 */
export function scoreField(cells: NormCells, query: ParsedQuery, out?: Float32Array, tau = 0.15): Float32Array {
  const n = cells.count;
  const res = out && out.length === n ? out : new Float32Array(n);
  const act: Active[] = [];
  for (const [key, t] of Object.entries(query.targets)) {
    if (t === undefined || t === null || Number.isNaN(t)) continue;
    const w = query.weights[key] ?? 0;
    const col = cells.norm[key];
    if (w > 0 && col) act.push({ col, t, w });
  }
  const req = query.required.filter((k) => query.targets[k] !== undefined && cells.norm[k]).map((k) => ({ col: cells.norm[k], t: query.targets[k] as number }));
  const m = act.length;
  for (let i = 0; i < n; i++) {
    let ok = true;
    for (let r = 0; r < req.length; r++) {
      const c = req[r].col[i];
      if (c !== c || Math.abs(req[r].t - c) > tau) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      res[i] = NaN;
      continue;
    }
    let num = 0;
    let den = 0;
    for (let j = 0; j < m; j++) {
      const a = act[j];
      const c = a.col[i];
      if (c !== c) continue;
      num += a.w * Math.abs(a.t - c);
      den += a.w;
    }
    res[i] = den === 0 ? NaN : 100 * (1 - num / den);
  }
  return res;
}

// Ramp: --faint #56657A -> --mid #F2C14E -> --good #4FE0B0
const RAMP: [number, number, number][] = [
  [0x56 / 255, 0x65 / 255, 0x7a / 255],
  [0xf2 / 255, 0xc1 / 255, 0x4e / 255],
  [0x4f / 255, 0xe0 / 255, 0xb0 / 255],
];
function ramp(t: number, o: number[], k: number) {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const s = x * 2;
  const i = s >= 1 ? 1 : 0;
  const f = s - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  o[k] = a[0] + (b[0] - a[0]) * f;
  o[k + 1] = a[1] + (b[1] - a[1]) * f;
  o[k + 2] = a[2] + (b[2] - a[2]) * f;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/** Renders every Earth block as a glowing point coloured by match score. */
export class HeatField {
  private pc: Cesium.PointPrimitiveCollection;
  private points: Cesium.PointPrimitive[] = [];
  private n = 0;
  private cells: NormCells | null = null;
  private scores = new Float32Array(0);
  // Per point: current and target rgba + size, for the wave.
  private cur = new Float32Array(0);
  private tgt = new Float32Array(0);
  private curSize = new Float32Array(0);
  private tgtSize = new Float32Array(0);
  private delay = new Float32Array(0);
  private animStart = 0;
  private animating = false;
  private lastWave = -1e9;
  private pending: number | null = null;
  private pendingKind: 'idle' | 'raf' | null = null;
  private tickRemove: (() => void) | null = null;
  private visible = true;
  private tmp = [0, 0, 0];
  private scratch = new Cesium.Color();
  private scratchOut = new Cesium.Color();
  private job = 0;
  reduced = false;

  constructor(private viewer: Cesium.Viewer) {
    // Added first so featured/result pins draw on top.
    this.pc = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    const onTick = () => this.tick();
    viewer.clock.onTick.addEventListener(onTick);
    this.tickRemove = () => viewer.clock.onTick.removeEventListener(onTick);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.pc.show = v;
  }

  /** Build the 12,362 points once per cell set. */
  setCells(cells: NormCells) {
    if (this.cells === cells) return;
    this.cells = cells;
    this.pc.removeAll();
    this.points = [];
    const n = (this.n = cells.count);
    this.scores = new Float32Array(n).fill(NaN);
    this.cur = new Float32Array(n * 4);
    this.tgt = new Float32Array(n * 4);
    this.curSize = new Float32Array(n);
    this.tgtSize = new Float32Array(n);
    this.delay = new Float32Array(n);
    const scale = new Cesium.NearFarScalar(1.2e6, 2.6, 2.6e7, 0.8);
    const trans = new Cesium.NearFarScalar(2.5e5, 0, 1.4e6, 1);
    for (let i = 0; i < n; i++) {
      this.points.push(
        this.pc.add({
          position: Cesium.Cartesian3.fromDegrees(cells.lon[i], cells.lat[i], POINT_HEIGHT_M),
          pixelSize: 4.5,
          color: Cesium.Color.TRANSPARENT,
          outlineColor: Cesium.Color.TRANSPARENT,
          outlineWidth: 1.2,
          scaleByDistance: scale,
          translucencyByDistance: trans,
          show: false,
        }),
      );
    }
  }

  /**
   * Re-score and recolour. `query` null clears. `immediate` skips the wave.
   * Work is deferred to idle time (or a frame) and coalesced.
   */
  update(query: ParsedQuery | null, immediate = false) {
    if (!this.cells) return;
    const id = ++this.job;
    this.cancelPending();
    const run = () => {
      this.pending = null;
      this.pendingKind = null;
      if (id !== this.job) return;
      this.apply(query, immediate);
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) {
      this.pendingKind = 'idle';
      this.pending = ric(run, { timeout: 120 });
    } else {
      this.pendingKind = 'raf';
      this.pending = requestAnimationFrame(run);
    }
  }

  private cancelPending() {
    if (this.pending === null) return;
    if (this.pendingKind === 'idle') (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(this.pending);
    else cancelAnimationFrame(this.pending);
    this.pending = null;
  }

  private apply(query: ParsedQuery | null, immediate: boolean) {
    const cells = this.cells;
    if (!cells) return;
    this.reduced = prefersReducedMotion();
    const n = this.n;
    const scores = this.scores;
    if (query) scoreField(cells, query, scores);
    else scores.fill(NaN);

    let hi = HEAT_MIN_SCORE + 20;
    let best = -1;
    for (let i = 0; i < n; i++) {
      const s = scores[i];
      if (s === s && s > hi) {
        hi = s;
        best = i;
      }
    }
    const span = Math.max(10, hi - HEAT_MIN_SCORE);
    const tgt = this.tgt;
    const tgtSize = this.tgtSize;
    const tmp = this.tmp;
    for (let i = 0; i < n; i++) {
      const s = scores[i];
      const k = i * 4;
      if (s !== s || s < HEAT_MIN_SCORE) {
        tgt[k + 3] = 0;
        tgtSize[i] = 2;
        continue;
      }
      const t = Math.pow(Math.min(1, (s - HEAT_MIN_SCORE) / span), 1.35);
      ramp(t, tmp, 0);
      tgt[k] = tmp[0];
      tgt[k + 1] = tmp[1];
      tgt[k + 2] = tmp[2];
      tgt[k + 3] = 0.22 + 0.68 * t;
      tgtSize[i] = 2.2 + 2.2 * t;
    }

    const now = performance.now();
    const wave = !immediate && !this.reduced && best >= 0 && now - this.lastWave > WAVE_MS + 300;
    if (wave) {
      // Delay ~ angular distance from the best block, computed once per scoring.
      const lat0 = (cells.lat[best] * Math.PI) / 180;
      const lon0 = (cells.lon[best] * Math.PI) / 180;
      const sl = Math.sin(lat0);
      const cl = Math.cos(lat0);
      const d = this.delay;
      for (let i = 0; i < n; i++) {
        const la = (cells.lat[i] * Math.PI) / 180;
        const dot = sl * Math.sin(la) + cl * Math.cos(la) * Math.cos(((cells.lon[i] * Math.PI) / 180) - lon0);
        d[i] = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot) / Math.PI; // 0..1
      }
      this.animStart = now;
      this.lastWave = now;
      this.animating = true;
    } else {
      this.writeAll();
      this.animating = false;
    }
  }

  /** Copy target state into the cesium points, optionally blending with the wave. */
  private writeAll() {
    const n = this.n;
    const { cur, tgt, curSize, tgtSize, points } = this;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      cur[k] = tgt[k];
      cur[k + 1] = tgt[k + 1];
      cur[k + 2] = tgt[k + 2];
      cur[k + 3] = tgt[k + 3];
      curSize[i] = tgtSize[i];
      this.paint(points[i], tgt[k], tgt[k + 1], tgt[k + 2], tgt[k + 3], tgtSize[i]);
    }
  }

  private paint(p: Cesium.PointPrimitive, r: number, g: number, b: number, a: number, size: number) {
    if (a <= 0.004) {
      if (p.show) p.show = false;
      return;
    }
    if (!p.show) p.show = true;
    const c = this.scratch;
    c.red = r;
    c.green = g;
    c.blue = b;
    c.alpha = a;
    p.color = c;
    const o = this.scratchOut;
    o.red = r;
    o.green = g;
    o.blue = b;
    o.alpha = a * 0.28;
    p.outlineColor = o;
    p.pixelSize = size;
  }

  private tick() {
    if (!this.animating || !this.visible) return;
    const e = (performance.now() - this.animStart) / WAVE_MS;
    const n = this.n;
    const { cur, tgt, curSize, tgtSize, points, delay } = this;
    const inDur = 1 - WAVE_SPREAD;
    let done = true;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      const raw = (e - delay[i] * WAVE_SPREAD) / inDur;
      if (raw <= 0) {
        done = false;
        continue; // not reached by the wave yet: keep old look
      }
      const p = raw >= 1 ? 1 : easeOutCubic(raw);
      if (raw < 1) done = false;
      const r = cur[k] + (tgt[k] - cur[k]) * p;
      const g = cur[k + 1] + (tgt[k + 1] - cur[k + 1]) * p;
      const b = cur[k + 2] + (tgt[k + 2] - cur[k + 2]) * p;
      const a = cur[k + 3] + (tgt[k + 3] - cur[k + 3]) * p;
      // Wavefront flare: size swells then settles.
      const bump = raw < 1 ? Math.sin(Math.PI * raw) * 0.9 : 0;
      const size = (curSize[i] + (tgtSize[i] - curSize[i]) * p) * (1 + bump);
      this.paint(points[i], r, g, b, Math.min(1, a * (1 + bump * 0.6)), size);
    }
    if (done || e > 1.05) {
      this.writeAll(); // settle exactly on target, then stop updating
      this.animating = false;
    }
  }

  dispose() {
    this.job++;
    this.cancelPending();
    this.tickRemove?.();
    if (!this.viewer.isDestroyed()) this.viewer.scene.primitives.remove(this.pc);
    this.points = [];
  }
}

/** Query the field should be coloured by right now, plus its mode and label. */
export function heatQuery(data: AppData, query: ParsedQuery, searchActive: boolean): { q: ParsedQuery | null; mode: 'search' | 'target'; name: string | null } {
  if (searchActive) return { q: query, mode: 'search', name: null };
  const t = defaultTarget(data, bodyOf(query.body));
  if (!t) return { q: null, mode: 'target', name: null };
  return { q: queryFromTarget(t, data.features), mode: 'target', name: t.name };
}
