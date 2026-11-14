import { describe, expect, it } from 'vitest';
import { decodeQuery, encodeQuery } from './urlState';

const keys = new Set(['slope_deg', 'ice_signal']);

describe('url state', () => {
  it('round-trips a manual query', () => {
    const q = { body: 'moon' as const, targets: { slope_deg: 0.8, ice_signal: 0.123 }, weights: { slope_deg: 2 as const, ice_signal: 3 as const }, required: ['ice_signal'], notes: '' };
    const p = encodeQuery('steep icy', null, q, 'text');
    const st = decodeQuery(p, keys)!;
    expect(st.q).toBe('steep icy');
    expect(st.query.body).toBe('moon');
    expect(st.query.targets).toEqual({ slope_deg: 0.8, ice_signal: 0.12 });
    expect(st.query.weights).toEqual({ slope_deg: 2, ice_signal: 3 });
    expect(st.query.required).toEqual(['ice_signal']);
  });

  it('encodes presets compactly', () => {
    const q = { body: 'either' as const, targets: { slope_deg: 0.5 }, weights: { slope_deg: 2 as const }, required: [], notes: '' };
    expect(encodeQuery('', 'moon-shackleton-rim', q, 'preset').toString()).toBe('preset=moon-shackleton-rim');
  });

  it('ignores unknown keys and junk values', () => {
    const st = decodeQuery(new URLSearchParams('t=slope_deg:0.4,evil:1,ice_signal:abc&w=slope_deg:9'), keys)!;
    expect(st.query.targets).toEqual({ slope_deg: 0.4 });
    expect(st.query.weights).toEqual({ slope_deg: 3 });
  });

  it('returns null for an empty URL', () => {
    expect(decodeQuery(new URLSearchParams(''), keys)).toBeNull();
  });
});
