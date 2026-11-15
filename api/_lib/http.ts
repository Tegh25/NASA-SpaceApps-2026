/**
 * Request-body reading shared by the `vite dev` middleware, so dev rejects the same bad requests the
 * Vercel runtime does instead of hanging or crashing on them.
 */
export const MAX_BODY_BYTES = 16 * 1024;

export type BodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 413 | 415 | 400; error: string };

/** Reads a JSON body with a size cap. Never throws. */
export async function readJsonBody(
  stream: AsyncIterable<Buffer | string>,
  contentType: string | undefined,
  limit = MAX_BODY_BYTES,
): Promise<BodyResult> {
  if (!/^application\/json\b/i.test(contentType ?? '')) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json.' };
  }
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > limit) return { ok: false, status: 413, error: 'Request body too large.' };
      chunks.push(buf);
    }
  } catch {
    return { ok: false, status: 400, error: 'Could not read the request body.' };
  }
  try {
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400, error: 'Body is not valid JSON.' };
  }
}
