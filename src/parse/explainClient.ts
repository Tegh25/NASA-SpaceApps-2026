/**
 * "Why it matches" explanation client. Contract shared by the right panel (caller) and
 * the backend (/api/explain). The UI must never block on this: it shows `curated` first
 * and swaps in the LLM text only if it arrives.
 */
export interface ExplainRow {
  label: string;
  unit: string;
  earth: number | null;
  target: number | null;
  level: 'strong' | 'partial' | 'weak' | null;
}

export interface ExplainInput {
  siteName: string;
  region: string;
  targetName: string;
  body: 'moon' | 'mars';
  rows: ExplainRow[];
  /** Curated or template text; returned as-is on any failure. */
  curated: string;
}

export interface ExplainResult {
  text: string;
  mode: 'llm' | 'curated';
}

const CLIENT_TIMEOUT_MS = 9000;
const cache = new Map<string, ExplainResult>();

/**
 * Asks /api/explain for a short LLM explanation. Successful responses are cached per
 * site and target for the session. Any network, timeout or parse error returns the curated text.
 */
export async function explainSite(input: ExplainInput): Promise<ExplainResult> {
  const curated: ExplainResult = { text: input.curated, mode: 'curated' };
  const key = `${input.siteName}::${input.targetName}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) return curated;
    const json = (await res.json()) as { text?: unknown; mode?: unknown };
    if (typeof json.text !== 'string' || !json.text.trim()) return curated;
    const result: ExplainResult = json.mode === 'llm' ? { text: json.text.trim(), mode: 'llm' } : { text: json.text, mode: 'curated' };
    // Only cache real LLM text. A curated reply means the server fell back (rate limit, timeout, no key),
    // and caching it would pin the fallback for the whole session even after the server recovers.
    if (result.mode === 'llm') cache.set(key, result);
    return result;
  } catch {
    return curated;
  } finally {
    clearTimeout(timer);
  }
}
