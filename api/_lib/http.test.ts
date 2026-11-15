import { describe, expect, it } from 'vitest';
import { readJsonBody } from './http';

async function* chunks(...parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}

describe('readJsonBody', () => {
  it('parses a JSON body split across chunks', async () => {
    expect(await readJsonBody(chunks('{"text":', '"cold"}'), 'application/json')).toEqual({ ok: true, body: { text: 'cold' } });
  });

  it('accepts a charset suffix on the content type', async () => {
    expect((await readJsonBody(chunks('{}'), 'application/json; charset=utf-8')).ok).toBe(true);
  });

  it('rejects other content types with 415', async () => {
    expect(await readJsonBody(chunks('{}'), 'text/plain')).toMatchObject({ ok: false, status: 415 });
    expect(await readJsonBody(chunks('{}'), undefined)).toMatchObject({ ok: false, status: 415 });
  });

  it('rejects bodies over the limit with 413 without reading them all', async () => {
    expect(await readJsonBody(chunks('x'.repeat(10), 'x'.repeat(10)), 'application/json', 15)).toMatchObject({ ok: false, status: 413 });
  });

  it('returns 400 for invalid JSON and for a failing stream', async () => {
    expect(await readJsonBody(chunks('{nope'), 'application/json')).toMatchObject({ ok: false, status: 400 });
    async function* broken() {
      yield Buffer.from('{');
      throw new Error('socket reset');
    }
    expect(await readJsonBody(broken(), 'application/json')).toMatchObject({ ok: false, status: 400 });
  });
});
