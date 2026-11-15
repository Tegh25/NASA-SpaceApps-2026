import { describe, expect, it } from 'vitest';
import { fingerprint, histogramOverlap, percentile, slopeField, slopeHistogram } from './fingerprint';

function ramp(w: number, h: number, rise: number): Float32Array {
  const e = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) e[y * w + x] = x * rise;
  return e;
}

describe('slope fingerprint', () => {
  it('measures a 45 degree ramp', () => {
    const s = slopeField(ramp(16, 16, 40), 16, 16, 40);
    expect(s.length).toBe(14 * 14);
    for (const v of s) expect(v).toBeCloseTo(45, 4);
  });

  it('flat ground is all in the first bin', () => {
    const h = slopeHistogram(slopeField(new Float32Array(100), 10, 10, 40));
    expect(h[0]).toBe(1);
    expect(h.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('overlap is 1 for identical and 0 for disjoint histograms', () => {
    const a = slopeHistogram([1, 1, 3, 5]);
    expect(histogramOverlap(a, a)).toBeCloseTo(1, 10);
    expect(histogramOverlap(slopeHistogram([0.5]), slopeHistogram([40]))).toBe(0);
  });

  it('percentile interpolates', () => {
    expect(percentile([0, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6, 5);
  });

  it('fingerprint reports relief and slope percentiles', () => {
    const fp = fingerprint(ramp(16, 16, 20), 16, 16, 40);
    expect(fp.reliefM).toBeCloseTo(300, 4);
    expect(fp.p50).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 3);
  });
});
