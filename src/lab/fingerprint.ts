/** Slope fingerprint maths for the terrain twin lab. Pure functions, no DOM. */

export const BIN_DEG = 2;
export const MAX_DEG = 60;

/** Slope in degrees at every interior cell (central finite differences), row-major (w-2)*(h-2). */
export function slopeField(elev: ArrayLike<number>, w: number, h: number, metersPerPixel: number): Float32Array {
  const out = new Float32Array(Math.max(0, w - 2) * Math.max(0, h - 2));
  const k = 1 / (2 * metersPerPixel);
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dzdx = (elev[i + 1] - elev[i - 1]) * k;
      const dzdy = (elev[i + w] - elev[i - w]) * k;
      out[n++] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return out;
}

/** Fraction of cells per bin; the last bin collects everything steeper than maxDeg. Sums to 1. */
export function slopeHistogram(slopes: ArrayLike<number>, binDeg = BIN_DEG, maxDeg = MAX_DEG): number[] {
  const bins = Math.round(maxDeg / binDeg);
  const out = new Array<number>(bins).fill(0);
  const n = slopes.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) out[Math.min(bins - 1, Math.floor(slopes[i] / binDeg))] += 1;
  for (let b = 0; b < bins; b++) out[b] /= n;
  return out;
}

/** Histogram intersection of two normalised histograms: 0 (disjoint) to 1 (identical). */
export function histogramOverlap(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.min(a[i], b[i]);
  return Math.max(0, Math.min(1, s));
}

/** Percentile (p in 0..100) with linear interpolation. Does not mutate the input. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const sorted = Float32Array.from(values as ArrayLike<number>).sort();
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function relief(elev: ArrayLike<number>): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < lo) lo = elev[i];
    if (elev[i] > hi) hi = elev[i];
  }
  return elev.length ? hi - lo : 0;
}

export interface Fingerprint {
  hist: number[];
  p50: number;
  p90: number;
  reliefM: number;
}

export function fingerprint(elev: ArrayLike<number>, w: number, h: number, metersPerPixel: number): Fingerprint {
  const slopes = slopeField(elev, w, h, metersPerPixel);
  return {
    hist: slopeHistogram(slopes),
    p50: percentile(slopes, 50),
    p90: percentile(slopes, 90),
    reliefM: relief(elev),
  };
}
