import { describe, expect, it } from 'vitest';
import { KEYWORD_RULES, keywordParse } from './keyword';

describe('keywordParse', () => {
  it('maps every phrase in the table to its patch', () => {
    for (const rule of KEYWORD_RULES) {
      for (const phrase of rule.phrases) {
        const { query, matched } = keywordParse(phrase);
        expect(matched).toContain(phrase);
        for (const [k, v] of Object.entries(rule.patch.targets ?? {})) expect(query.targets[k]).toBe(v);
        for (const [k, w] of Object.entries(rule.patch.weights ?? {})) expect(query.weights[k]).toBe(w);
        for (const k of rule.patch.required ?? []) expect(query.required).toContain(k);
        if (rule.patch.body) expect(query.body).toBe(rule.patch.body);
        for (const t of rule.patch.tags ?? []) expect(query.tags).toContain(t);
      }
    }
  });

  it('sets the spec examples', () => {
    expect(keywordParse('cold').query).toMatchObject({ targets: { temp_mean_k: 0.1 }, weights: { temp_mean_k: 3 } });
    expect(keywordParse('no snow').query.targets).toEqual({ snow_frac: 0 });
    expect(keywordParse('sunlit').query.targets).toEqual({ shadow_frac: 0.05 });
    expect(keywordParse('no vegetation').query.required).toEqual(['vegetation_ndvi']);
    expect(keywordParse('a lunar crater').query.body).toBe('moon');
    expect(keywordParse('lava tube').query.tags).toContain('lava_tube');
  });

  it('merges multiple phrases additively', () => {
    const { query } = keywordParse('cold dry crater with ice');
    expect(query.targets.temp_mean_k).toBe(0.1);
    expect(query.targets.precip_mm_yr).toBe(0);
    expect(query.targets.ice_proxy).toBe(0.8);
    expect(query.weights.ice_proxy).toBe(3);
    expect(query.targets.crater_density).toBe(0.8);
  });

  it('ignores unknown words and reports them', () => {
    const { query, unknown } = keywordParse('purple zebra cold');
    expect(Object.keys(query.targets)).toEqual(['temp_mean_k']);
    expect(unknown).toEqual(['purple', 'zebra']);
  });

  it('treats basalt and lava as tags, not unknown words', () => {
    const { query, unknown } = keywordParse('basaltic plain');
    expect(query.tags).toContain('basalt');
    expect(query.targets.slope_deg).toBe(0.1);
    expect(unknown).toEqual([]);
  });

  it('drops patches for features not in the registry', () => {
    const { query } = keywordParse('cold dry', ['temp_mean_k']);
    expect(query.targets).toEqual({ temp_mean_k: 0.1 });
  });

  it('does not double count words inside longer phrases', () => {
    const { matched } = keywordParse('lava tube');
    expect(matched).toEqual(['lava tube']);
  });
});
