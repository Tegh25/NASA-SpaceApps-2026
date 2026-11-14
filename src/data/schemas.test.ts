import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EarthCellsFileSchema, FeaturedFileSchema, FeaturesFileSchema, formatZodError, TargetsFileSchema } from './schemas';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));

describe('data contract', () => {
  it('accepts the generated mock files', () => {
    expect(FeaturesFileSchema.safeParse(read('features.json')).success).toBe(true);
    expect(TargetsFileSchema.safeParse(read('targets.json')).success).toBe(true);
    expect(EarthCellsFileSchema.safeParse(read('earth_cells.json')).success).toBe(true);
    expect(FeaturedFileSchema.safeParse(read('featured_analogs.json')).success).toBe(true);
  });

  it('names the file and failing path for bad features', () => {
    const r = FeaturesFileSchema.safeParse({ version: 1, features: [{ key: 'x', label: 'X', unit: '', group: 'G', norm: { min: 0, max: 1, scale: 'cubic' } }] });
    expect(r.success).toBe(false);
    const msg = formatZodError('features.json', r.error!);
    expect(msg).toContain('features.json');
    expect(msg).toContain('features.0.norm.scale');
  });

  it('flags mismatched column lengths in earth_cells', () => {
    const r = EarthCellsFileSchema.safeParse({ cellSizeDeg: 1, count: 2, lat: [0, 1], lon: [0], values: { a: [1, null, 3] } });
    expect(r.success).toBe(false);
    const msg = formatZodError('earth_cells.json', r.error!);
    expect(msg).toContain('lon');
    expect(msg).toContain('values.a');
  });
});
