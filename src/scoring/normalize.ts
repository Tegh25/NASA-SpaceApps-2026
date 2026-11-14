import type { FeatureDef } from '../data/schemas';

type Norm = FeatureDef['norm'];

const f = (v: number, scale: Norm['scale']) => (scale === 'log' ? Math.log1p(Math.max(v, 0)) : v);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function normalize(v: number | null | undefined, norm: Norm): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const lo = f(norm.min, norm.scale);
  const hi = f(norm.max, norm.scale);
  if (hi === lo) return 0;
  return clamp01((f(v, norm.scale) - lo) / (hi - lo));
}

export function denormalize(n: number, norm: Norm): number {
  const lo = f(norm.min, norm.scale);
  const hi = f(norm.max, norm.scale);
  const x = lo + clamp01(n) * (hi - lo);
  return norm.scale === 'log' ? Math.expm1(x) : x;
}

export function normalizeValues(
  values: Record<string, number | null | undefined>,
  features: FeatureDef[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const fd of features) out[fd.key] = normalize(values[fd.key], fd.norm);
  return out;
}
