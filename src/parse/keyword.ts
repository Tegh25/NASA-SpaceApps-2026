import type { BodyChoice, ParsedQuery, Weight } from '../scoring/types';
import { emptyQuery } from '../scoring/types';

interface Patch {
  targets?: Record<string, number>;
  weights?: Record<string, Weight>;
  required?: string[];
  body?: BodyChoice;
  tags?: string[];
}

interface Rule {
  phrases: string[];
  patch: Patch;
}

const DEFAULT_WEIGHT: Weight = 2;

/**
 * Phrase dictionary, keyed to the feature registry in docs/DESIGN.md. Phrases are matched longest first.
 * Words with no matching feature (basalt, lava) only add a tag and are not reported as unknown.
 */
export const KEYWORD_RULES: Rule[] = [
  { phrases: ['cold', 'freezing', 'frigid'], patch: { targets: { temp_mean_k: 0.1 }, weights: { temp_mean_k: 3 } } },
  { phrases: ['hot', 'scorching'], patch: { targets: { temp_max_k: 0.9 }, weights: { temp_max_k: 2 } } },
  { phrases: ['steep', 'cliff', 'cliffs', 'rim', 'crater wall'], patch: { targets: { slope_deg: 0.8 }, weights: { slope_deg: 3 } } },
  {
    phrases: ['flat', 'plain', 'plains', 'smooth'],
    patch: { targets: { slope_deg: 0.1, roughness_m: 0.1, flat_frac: 0.9 } },
  },
  { phrases: ['rough', 'rugged', 'rocky', 'boulders', 'boulder'], patch: { targets: { roughness_m: 0.8 } } },
  {
    phrases: ['ice', 'frozen', 'permafrost', 'water'],
    patch: { targets: { ice_proxy: 0.8 }, weights: { ice_proxy: 3 } },
  },
  { phrases: ['dry', 'arid', 'desert'], patch: { targets: { precip_mm_yr: 0 }, weights: { precip_mm_yr: 3 } } },
  {
    phrases: ['no vegetation', 'barren', 'bare'],
    patch: { targets: { vegetation_ndvi: 0 }, weights: { vegetation_ndvi: 3 }, required: ['vegetation_ndvi'] },
  },
  { phrases: ['snow', 'snowy'], patch: { targets: { snow_frac: 0.8 } } },
  { phrases: ['no snow'], patch: { targets: { snow_frac: 0 } } },
  { phrases: ['shadow', 'shadowed', 'dark', 'polar night'], patch: { targets: { shadow_frac: 0.8 } } },
  { phrases: ['sunlit', 'bright', 'sun-drenched'], patch: { targets: { shadow_frac: 0.05 } } },
  { phrases: ['crater', 'cratered'], patch: { targets: { crater_density: 0.8 }, weights: { crater_density: 2 } } },
  {
    phrases: ['mountain', 'mountains', 'highland', 'highlands', 'high relief'],
    patch: { targets: { relief_m: 0.8 } },
  },
  { phrases: ['basalt', 'basaltic', 'volcanic', 'lava'], patch: { tags: ['basalt'] } },
  { phrases: ['lava tube', 'cave'], patch: { tags: ['lava_tube'] } },
  { phrases: ['moon', 'lunar'], patch: { body: 'moon' } },
  { phrases: ['mars', 'martian'], patch: { body: 'mars' } },
];

const STOPWORDS = new Set(
  (
    'a an and the of in on at to with without near nearby by for from or some any very really quite place places site sites ' +
    'area areas region somewhere like similar that this is are be it its ground surface lots lot plenty much few little ' +
    'please find show me i want looking need needs must have has having good great permanent permanently also plus but'
  ).split(' '),
);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface KeywordResult {
  query: ParsedQuery;
  matched: string[];
  unknown: string[];
}

export function applyPatch(q: ParsedQuery, p: Patch, known?: Set<string>): void {
  const ok = (k: string) => !known || known.has(k);
  for (const [k, v] of Object.entries(p.targets ?? {})) {
    if (!ok(k)) continue;
    q.targets[k] = v;
    const w = p.weights?.[k] ?? DEFAULT_WEIGHT;
    q.weights[k] = Math.max(q.weights[k] ?? 0, w) as Weight;
  }
  for (const [k, w] of Object.entries(p.weights ?? {})) {
    if (!ok(k)) continue;
    q.weights[k] = Math.max(q.weights[k] ?? 0, w) as Weight;
  }
  for (const k of p.required ?? []) if (ok(k) && !q.required.includes(k)) q.required.push(k);
  if (p.body) q.body = p.body;
  for (const t of p.tags ?? []) if (!q.tags!.includes(t)) q.tags!.push(t);
}

/** Deterministic, offline parser. `knownKeys` drops patches for features absent from the registry. */
export function keywordParse(text: string, knownKeys?: string[], base?: Partial<ParsedQuery>): KeywordResult {
  const q: ParsedQuery = { ...emptyQuery(), ...base, targets: {}, weights: {}, required: [], tags: [] };
  const known = knownKeys ? new Set(knownKeys) : undefined;
  let s = ` ${norm(text)} `;
  const matched: string[] = [];

  const entries = KEYWORD_RULES.flatMap((r) => r.phrases.map((p) => ({ phrase: p, rule: r }))).sort(
    (a, b) => b.phrase.length - a.phrase.length,
  );
  for (const { phrase, rule } of entries) {
    const needle = ` ${phrase} `;
    if (!s.includes(needle)) continue;
    applyPatch(q, rule.patch, known);
    matched.push(phrase);
    s = s.split(needle).join(' '.repeat(needle.length - 1) + ' ');
  }

  const unknown = Array.from(new Set(s.split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))));
  q.notes = matched.length ? `Understood: ${matched.join(', ')}` : 'No known terms found';
  return { query: q, matched, unknown };
}
