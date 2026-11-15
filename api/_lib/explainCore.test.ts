import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleExplain } from './explainCore';

const valid = {
  siteName: 'Ngari',
  region: 'Western Tibet',
  targetName: 'Slater Plain',
  body: 'moon',
  rows: [
    { label: 'Mean temperature', unit: 'K', earth: 271, target: 105, level: 'weak' },
    { label: 'Median slope', unit: 'deg', earth: 2.1, target: 1.8, level: 'strong' },
  ],
  curated: 'Ngari matches Slater Plain on slope and roughness but is far too warm.',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleExplain', () => {
  it('returns the curated text when no key is configured', async () => {
    const r = await handleExplain(valid, 'explain-nokey', { apiKey: undefined });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ text: valid.curated, mode: 'curated' });
  });

  it('rejects an invalid body with 400', async () => {
    expect((await handleExplain({ siteName: '' }, 'explain-bad', { apiKey: 'k' })).status).toBe(400);
    expect((await handleExplain({ ...valid, body: 'venus' }, 'explain-bad2', { apiKey: 'k' })).status).toBe(400);
  });

  it('returns the LLM text when the upstream call succeeds', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: 'Ngari is a cold, flat analog.' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await handleExplain(valid, 'explain-ok', { apiKey: 'test-key', model: 'claude-sonnet-5-5' });
    expect(r.body).toEqual({ text: 'Ngari is a cold, flat analog.', mode: 'llm' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back to curated when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const r = await handleExplain(valid, 'explain-fail', { apiKey: 'test-key' });
    expect(r.body).toMatchObject({ text: valid.curated, mode: 'curated' });
  });

  it('rate limits LLM calls at 10 requests per minute per IP', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { apiKey: 'test-key' };
    for (let i = 0; i < 10; i++) await handleExplain(valid, 'explain-rl', env);
    const r = await handleExplain(valid, 'explain-rl', env);
    expect(r.body).toMatchObject({ mode: 'curated', reason: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('never counts toward the limit when no key is set (curated text is free)', async () => {
    for (let i = 0; i < 15; i++) await handleExplain(valid, 'explain-nokey-rl', { apiKey: undefined });
    const r = await handleExplain(valid, 'explain-nokey-rl', { apiKey: undefined });
    expect(r.body).toMatchObject({ mode: 'curated', reason: 'not_configured' });
  });
});
