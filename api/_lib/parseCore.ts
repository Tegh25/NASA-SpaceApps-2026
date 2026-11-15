import { z } from 'zod';

const BACKBOARD_URL = 'https://app.backboard.io/api/threads/messages';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MAX_TEXT = 500;
const TIMEOUT_MS = 6000;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

interface FeatureLite {
  key: string;
  label: string;
  unit: string;
  group: string;
  description?: string;
  norm: { min: number; max: number; scale: 'linear' | 'log' };
}

export interface ParseEnv {
  apiKey?: string;
  model?: string;
  fetchFeatures: (signal?: AbortSignal) => Promise<FeatureLite[]>;
}

export interface ParseResult {
  status: number;
  body: Record<string, unknown>;
}

const RequestSchema = z.object({ text: z.string().trim().min(1).max(MAX_TEXT) });

const LlmSchema = z.object({
  body: z.enum(['moon', 'mars', 'either']).catch('either'),
  targets: z.record(z.string(), z.number()).catch({}),
  weights: z.record(z.string(), z.number()).catch({}),
  required: z.array(z.string()).catch([]),
  notes: z.string().catch(''),
});

const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now()): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : Number(v.toPrecision(3)).toString());
const denorm = (n: number, f: FeatureLite) => {
  const t = (v: number) => (f.norm.scale === 'log' ? Math.log1p(Math.max(0, v)) : v);
  const x = t(f.norm.min) + n * (t(f.norm.max) - t(f.norm.min));
  return f.norm.scale === 'log' ? Math.expm1(x) : x;
};

export function buildSystemPrompt(features: FeatureLite[]): string {
  const rows = features
    .map((f) => {
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((n) => `${n}=${fmt(denorm(n, f))}`).join(', ');
      return `- ${f.key} | ${f.label} | ${f.unit} | ${f.group} | ${f.norm.scale} scale | ${ticks}${f.description ? ` | ${f.description}` : ''}`;
    })
    .join('\n');
  return `You convert a plain-language description of a lunar or Martian environment into search parameters for finding Earth analog sites.

Feature registry (key | label | raw unit | group | scale | normalized value to raw value):
${rows}

Return ONLY a JSON object, no prose, no code fences, with exactly this shape:
{"body":"moon"|"mars"|"either","targets":{"<key>":<number 0..1>},"weights":{"<key>":<integer 0..3>},"required":["<key>"],"notes":"<one short sentence>"}

Rules:
- Use only keys from the registry. Never invent keys.
- targets are normalized 0..1 positions on each feature's range above. Map qualitative words onto that range, for example "very cold" sets temp_mean_k near 0.05 with weight 3; "flat" sets slope_deg near 0.1; "no vegetation" sets vegetation_ndvi 0.
- Only set a target when the text implies one. Leave other features out entirely.
- weights: 3 = central to the description, 2 = clearly stated, 1 = implied or minor. Every key in targets needs a weight.
- required: only explicit must-haves ("must have", "needs", "no vegetation at all"). Every required key must also be in targets.
- body: "moon" or "mars" if the text names or clearly implies one, otherwise "either".
- If the text names a lunar or Martian place, infer its typical environment (for example a lunar polar rim implies low temperatures, high sunlit fraction, ice nearby).
- notes: one plain sentence describing how you interpreted the text, Canadian spelling, no em dashes.
- If the text has nothing usable, return {"body":"either","targets":{},"weights":{},"required":[],"notes":"Nothing to interpret"}.`;
}

export function extractJson(s: string): unknown {
  const cleaned = s.replace(/```(?:json)?/gi, '').trim();
  let start = cleaned.indexOf('{');
  let end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  // Models occasionally wrap the object in doubled braces: {{ ... }}.
  while (cleaned[start + 1] === '{' && cleaned[end - 1] === '}') {
    start++;
    end--;
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Drop unknown keys, clamp numbers, and keep the result self-consistent. */
export function sanitize(raw: unknown, keys: Set<string>) {
  const p = LlmSchema.parse(raw);
  const targets: Record<string, number> = {};
  const weights: Record<string, 0 | 1 | 2 | 3> = {};
  for (const [k, v] of Object.entries(p.targets)) {
    if (!keys.has(k) || !Number.isFinite(v)) continue;
    targets[k] = Math.min(1, Math.max(0, v));
  }
  for (const k of Object.keys(targets)) {
    const w = Object.hasOwn(p.weights, k) ? p.weights[k] : undefined;
    weights[k] = (typeof w === 'number' && Number.isFinite(w) ? Math.min(3, Math.max(0, Math.round(w))) : 2) as 0 | 1 | 2 | 3;
  }
  // Object.hasOwn, not `in`: `in` also matches inherited names such as "toString" and "constructor".
  const required = Array.from(new Set(p.required.filter((k) => Object.hasOwn(targets, k))));
  return { body: p.body, targets, weights, required, notes: p.notes.slice(0, 240) };
}

export async function handleParse(input: unknown, ip: string, env: ParseEnv): Promise<ParseResult> {
  const req = RequestSchema.safeParse(input);
  if (!req.success) return { status: 400, body: { error: 'Expected {"text": string} up to 500 characters.' } };
  if (rateLimited(ip)) return { status: 429, body: { fallback: true, reason: 'rate_limited' } };
  if (!env.apiKey) return { status: 200, body: { fallback: true, reason: 'not_configured' } };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const features = await env.fetchFeatures(ctrl.signal);
    const model = env.model || DEFAULT_MODEL;
    const res = await fetch(BACKBOARD_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'X-API-Key': env.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: req.data.text,
        system_prompt: buildSystemPrompt(features),
        llm_provider: 'anthropic',
        model_name: model,
        json_output: true,
        thinking: { effort: 'low' },
        memory: 'off',
        web_search: 'off',
        stream: false,
      }),
    });
    if (!res.ok) return { status: 200, body: { fallback: true, reason: `upstream_${res.status}` } };
    const data = (await res.json()) as { content?: string | null };
    if (!data.content) return { status: 200, body: { fallback: true, reason: 'empty' } };
    const query = sanitize(extractJson(data.content), new Set(features.map((f) => f.key)));
    return { status: 200, body: { query, model } };
  } catch (e) {
    const reason = (e as Error).name === 'AbortError' ? 'timeout' : 'invalid_response';
    return { status: 200, body: { fallback: true, reason } };
  } finally {
    clearTimeout(timer);
  }
}

const FEATURE_TTL_MS = 300_000;
// Keyed by origin so a preview, production and localhost in one warm process never share a list.
const featureCache = new Map<string, { at: number; list: FeatureLite[] }>();

/** Clears the feature cache. Exported for tests. */
export function resetFeatureCache() {
  featureCache.clear();
}

/**
 * Builds a safe self-origin from request headers, or null if they look wrong. The Host header is client
 * controlled, so accept only a plain host[:port] and an http/https scheme. Anything else would let a
 * request make the server fetch an arbitrary URL.
 */
export function resolveOrigin(host: string | undefined, proto: string | undefined): string | null {
  if (!host || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host)) return null;
  const scheme = (proto ?? 'https').split(',')[0].trim().toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  return `${scheme}://${host}`;
}

export function featureFetcher(origin: string) {
  return async (signal?: AbortSignal) => {
    const hit = featureCache.get(origin);
    if (hit && Date.now() - hit.at < FEATURE_TTL_MS) return hit.list;
    const res = await fetch(`${origin}/data/features.json`, { signal });
    if (!res.ok) throw new Error('features.json unavailable');
    const json = (await res.json()) as { features: FeatureLite[] };
    featureCache.set(origin, { at: Date.now(), list: json.features });
    return json.features;
  };
}
