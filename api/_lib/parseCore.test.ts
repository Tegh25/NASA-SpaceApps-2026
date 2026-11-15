import { describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, extractJson, featureFetcher, handleParse, rateLimited, resetFeatureCache, resolveOrigin, sanitize } from './parseCore';

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

  it('does not treat inherited property names as targets or required keys', () => {
    const q = sanitize(
      { body: 'moon', targets: { slope_deg: 0.5 }, weights: {}, required: ['toString', 'constructor', '__proto__', 'slope_deg'], notes: '' },
      keys,
    );
    expect(q.required).toEqual(['slope_deg']);
    expect(q.weights).toEqual({ slope_deg: 2 });
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

  it('accepts plain hosts and rejects anything that could redirect the features fetch', () => {
    expect(resolveOrigin('terralog.vercel.app', 'https')).toBe('https://terralog.vercel.app');
    expect(resolveOrigin('localhost:5173', 'http')).toBe('http://localhost:5173');
    expect(resolveOrigin('a.example', 'https, http')).toBe('https://a.example');
    expect(resolveOrigin(undefined, 'https')).toBeNull();
    expect(resolveOrigin('evil.example/path', 'https')).toBeNull();
    expect(resolveOrigin('user@evil.example', 'https')).toBeNull();
    expect(resolveOrigin('a.example', 'file')).toBeNull();
  });

  it('caches features per origin and passes the abort signal to fetch', async () => {
    resetFeatureCache();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => new Response(JSON.stringify({ features: [{ key: url }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const a = await featureFetcher('http://a.test')(signal);
    await featureFetcher('http://a.test')(signal);
    const b = await featureFetcher('http://b.test')(signal);
    vi.unstubAllGlobals();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal });
    expect(a).not.toEqual(b);
  });

  it('rate limits at 20 requests per minute per IP', () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimited('ip-x', now + i)).toBe(false);
    expect(rateLimited('ip-x', now + 21)).toBe(true);
    expect(rateLimited('ip-x', now + 61_000)).toBe(false);
  });
});
