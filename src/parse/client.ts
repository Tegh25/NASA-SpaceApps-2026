import type { FeatureDef } from '../data/schemas';
import type { BodyChoice, ParsedQuery, Weight } from '../scoring/types';
import { keywordParse } from './keyword';

export interface ParseOutcome {
  query: ParsedQuery;
  mode: 'llm' | 'keyword';
  unknown: string[];
}

const CLIENT_TIMEOUT_MS = 7000;

/** Calls the serverless LLM parser and silently falls back to the keyword parser on any failure. */
export async function parseText(text: string, features: FeatureDef[], body: BodyChoice): Promise<ParseOutcome> {
  const keys = features.map((f) => f.key);
  const capped = text.slice(0, 500);
  const fallback = (): ParseOutcome => {
    const r = keywordParse(capped, keys, { body });
    if (r.query.body === 'either') r.query.body = body;
    return { query: r.query, mode: 'keyword', unknown: r.unknown };
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: capped }),
      signal: ctrl.signal,
    });
    if (!res.ok) return fallback();
    const json = (await res.json()) as { fallback?: boolean; query?: ParsedQuery };
    if (json.fallback || !json.query) return fallback();
    const q = json.query;
    const known = new Set(keys);
    const targets: Record<string, number> = {};
    const weights: Record<string, Weight> = {};
    for (const [k, v] of Object.entries(q.targets ?? {})) {
      if (!known.has(k) || typeof v !== 'number') continue;
      targets[k] = Math.min(1, Math.max(0, v));
      weights[k] = (q.weights?.[k] ?? 2) as Weight;
    }
    if (!Object.keys(targets).length) return fallback();
    const kw = keywordParse(capped, keys);
    return {
      query: {
        body: q.body === 'either' ? body : q.body,
        targets,
        weights,
        required: (q.required ?? []).filter((k) => k in targets),
        notes: q.notes ?? '',
        tags: kw.query.tags,
      },
      mode: 'llm',
      unknown: [],
    };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
