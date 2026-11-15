import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainSite, type ExplainInput } from './explainClient';

const input: ExplainInput = {
  siteName: 'Test site',
  region: 'Nowhere',
  targetName: 'Test target',
  body: 'moon',
  rows: [],
  curated: 'Curated text.',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('explainSite', () => {
  it('returns curated text when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    expect(await explainSite({ ...input, siteName: 'Offline site' })).toEqual({ text: 'Curated text.', mode: 'curated' });
  });

  it('returns and caches LLM text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: 'LLM text.', mode: 'llm' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const a = await explainSite({ ...input, siteName: 'Cached site' });
    const b = await explainSite({ ...input, siteName: 'Cached site' });
    expect(a).toEqual({ text: 'LLM text.', mode: 'llm' });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
