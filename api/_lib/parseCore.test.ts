import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, extractJson, handleParse, rateLimited, sanitize } from './parseCore';

const keys = new Set(['slope_deg', 'temp_mean_k']);

describe('parseCore', () => {
  it('extracts JSON from fenced or double-braced output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('{{"a": 2}}')).toEqual({ a: 2 });
    expect(() => extractJson('no json here')).toThrow();
  });

  it('drops unknown keys, clamps numbers and keeps required consistent', () => {
    const q = sanitize(
      {
        body: 'moon',
        targets: { slope_deg: 1.4, bogus: 0.5, temp_mean_k: -1 },
        weights: { slope_deg: 7, temp_mean_k: 1.6 },
        required: ['slope_deg', 'bogus', 'ice_proxy'],
        notes: 'x',
      },
      keys,
    );
    expect(q.targets).toEqual({ slope_deg: 1, temp_mean_k: 0 });
    expect(q.weights).toEqual({ slope_deg: 3, temp_mean_k: 2 });
    expect(q.required).toEqual(['slope_deg']);
  });

  it('tolerates a malformed body field', () => {
    expect(sanitize({ body: 'venus', targets: {}, weights: {}, required: [], notes: '' }, keys).body).toBe('either');
  });

  it('includes every feature key in the system prompt', () => {
    const p = buildSystemPrompt([
      { key: 'slope_deg', label: 'Slope', unit: 'deg', group: 'Terrain', norm: { min: 0, max: 30, scale: 'linear' } },
    ]);
    expect(p).toContain('slope_deg');
    expect(p).toContain('0.5=15');
  });

  it('rejects oversized input and falls back without a key', async () => {
    const env = { apiKey: undefined, fetchFeatures: async () => [] };
    expect((await handleParse({ text: 'x'.repeat(501) }, 'a', env)).status).toBe(400);
    expect((await handleParse({ text: 'cold' }, 'b', env)).body).toMatchObject({ fallback: true });
  });

  it('rate limits at 20 requests per minute per IP', () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimited('ip-x', now + i)).toBe(false);
    expect(rateLimited('ip-x', now + 21)).toBe(true);
    expect(rateLimited('ip-x', now + 61_000)).toBe(false);
  });
});
