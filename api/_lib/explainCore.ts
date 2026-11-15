import { z } from 'zod';

const BACKBOARD_URL = 'https://app.backboard.io/api/threads/messages';
export const EXPLAIN_MODEL = 'claude-sonnet-5-5';
const TIMEOUT_MS = 8000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_TEXT = 1200;

export const SYSTEM_PROMPT =
  'Write 3 to 4 plain sentences explaining why <site> is a terrain analog for <target>, using only the numbers given. ' +
  'State the biggest gaps with numbers (temperature, lighting). Do not claim it is unprecedented or new beyond what is given. No lists.';

const RowSchema = z.object({
  label: z.string().max(80),
  unit: z.string().max(20),
  earth: z.number().finite().nullable(),
  target: z.number().finite().nullable(),
  level: z.enum(['strong', 'partial', 'weak']).nullable(),
});

export const ExplainSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120),
  targetName: z.string().trim().min(1).max(120),
  body: z.enum(['moon', 'mars']),
  rows: z.array(RowSchema).max(30),
  curated: z.string().trim().min(1).max(2000),
});

export type ExplainRequest = z.infer<typeof ExplainSchema>;

export interface ExplainEnv {
  apiKey?: string;
  model?: string;
}

export interface ExplainResult {
  status: number;
  body: { text?: string; mode?: 'llm' | 'curated'; error?: string; reason?: string };
}

const hits = new Map<string, number[]>();
export function explainRateLimited(ip: string, now = Date.now()): boolean {
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

const fmt = (v: number | null) => (v == null ? 'no value' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Number(v.toPrecision(3))));

/** Plain facts only: the model is asked to use these numbers and nothing else. */
export function buildUserContent(input: ExplainRequest): string {
  const lines = input.rows.map(
    (r) => `- ${r.label}: site ${fmt(r.earth)} ${r.unit}, target ${fmt(r.target)} ${r.unit}${r.level ? ` (${r.level} match)` : ''}`,
  );
  return [
    `Site: ${input.siteName}${input.region ? ` (${input.region})` : ''}`,
    `Target: ${input.targetName} (${input.body === 'moon' ? 'Moon' : 'Mars'})`,
    'Feature values:',
    ...lines,
    `Curated note for reference: ${input.curated}`,
  ].join('\n');
}

export async function handleExplain(input: unknown, ip: string, env: ExplainEnv): Promise<ExplainResult> {
  const parsed = ExplainSchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid explain request.' } };
  const curated = { text: parsed.data.curated, mode: 'curated' as const };

  if (!env.apiKey) return { status: 200, body: { ...curated, reason: 'not_configured' } };
  if (explainRateLimited(ip)) return { status: 200, body: { ...curated, reason: 'rate_limited' } };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BACKBOARD_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'X-API-Key': env.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: buildUserContent(parsed.data),
        system_prompt: SYSTEM_PROMPT,
        llm_provider: 'anthropic',
        model_name: env.model || EXPLAIN_MODEL,
        json_output: false,
        thinking: { effort: 'low' },
        memory: 'off',
        web_search: 'off',
        stream: false,
      }),
    });
    if (!res.ok) return { status: 200, body: { ...curated, reason: `upstream_${res.status}` } };
    const data = (await res.json()) as { content?: string | null };
    const text = (data.content ?? '').trim();
    if (!text) return { status: 200, body: { ...curated, reason: 'empty' } };
    return { status: 200, body: { text: text.slice(0, MAX_TEXT), mode: 'llm' } };
  } catch (e) {
    const reason = (e as Error).name === 'AbortError' ? 'timeout' : 'invalid_response';
    return { status: 200, body: { ...curated, reason } };
  } finally {
    clearTimeout(timer);
  }
}
