/**
 * Benchmarks the /api/parse prompt against several models through Backboard.
 * Usage: npx tsx --env-file=.env scripts/compareModels.ts [model ...]
 */
import { readFileSync } from 'node:fs';
import { handleParse } from '../api/_lib/parseCore';

const features = JSON.parse(readFileSync('public/data/features.json', 'utf8')).features;
const models = process.argv.slice(2).length ? process.argv.slice(2) : ['claude-haiku-5-5', 'claude-sonnet-5-5'];

interface Case {
  text: string;
  expect: Record<string, 'low' | 'high' | 'set'>;
  required?: string[];
  body?: 'moon' | 'mars' | 'either';
}

const CASES: Case[] = [
  {
    text: 'cold, airless, steep crater rim with permanent shadow nearby and ice in the ground',
    expect: { temp_min_k: 'low', slope_deg: 'high', ice_signal: 'high' },
  },
  { text: 'cold dry crater with ice', expect: { temp_min_k: 'low', precip_mm_yr: 'low', ice_signal: 'high' } },
  {
    text: 'Flat basaltic plain, no vegetation, very remote',
    expect: { slope_deg: 'low', basalt_fraction: 'high', vegetation_ndvi: 'low', isolation_index: 'high' },
  },
  { text: 'Sunlit ridge near permanently dark terrain', expect: { illum_fraction: 'high' } },
  {
    text: 'Somewhere like Jezero crater on Mars: an old dry lake bed, must have no vegetation at all',
    expect: { precip_mm_yr: 'low', vegetation_ndvi: 'low' },
    required: ['vegetation_ndvi'],
    body: 'mars',
  },
  { text: 'hot salty volcanic desert below sea level', expect: { temp_max_k: 'high', basalt_fraction: 'high', elevation_m: 'low' } },
  { text: 'lunar south pole, high and rocky, lots of sunlight', expect: { illum_fraction: 'high', rock_fraction: 'high' }, body: 'moon' },
  { text: 'icy mid-latitude plains on Mars good for landing', expect: { ice_signal: 'high', slope_deg: 'low' }, body: 'mars' },
  { text: 'banana', expect: {} },
];

function grade(c: Case, q: { targets: Record<string, number>; required: string[]; body: string }) {
  let ok = 0;
  let total = 0;
  for (const [k, dir] of Object.entries(c.expect)) {
    total++;
    const v = q.targets[k];
    if (v === undefined) continue;
    if (dir === 'set' || (dir === 'low' && v <= 0.35) || (dir === 'high' && v >= 0.65)) ok++;
  }
  for (const k of c.required ?? []) {
    total++;
    if (q.required.includes(k)) ok++;
  }
  if (c.body) {
    total++;
    if (q.body === c.body) ok++;
  }
  if (!total) {
    total = 1;
    if (Object.keys(q.targets).length <= 1) ok = 1;
  }
  return { ok, total };
}

async function main() {
  for (const model of models) {
    let ok = 0;
    let total = 0;
    let fallbacks = 0;
    const times: number[] = [];
    console.log(`\n=== ${model}`);
    for (const c of CASES) {
      const t0 = performance.now();
      const r = await handleParse({ text: c.text }, `bench-${model}-${Math.random()}`, {
        apiKey: process.env.BACKBOARD_API_KEY,
        model,
        fetchFeatures: async () => features,
      });
      const ms = Math.round(performance.now() - t0);
      times.push(ms);
      if (r.body.fallback) {
        fallbacks++;
        total += Math.max(1, Object.keys(c.expect).length + (c.required?.length ?? 0) + (c.body ? 1 : 0));
        console.log(`  ${ms}ms FALLBACK (${r.body.reason}) :: ${c.text}`);
        continue;
      }
      const q = r.body.query as { targets: Record<string, number>; required: string[]; body: string; notes: string };
      const g = grade(c, q);
      ok += g.ok;
      total += g.total;
      console.log(`  ${ms}ms ${g.ok}/${g.total} keys=${Object.keys(q.targets).length} :: ${c.text}\n      ${q.notes}`);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)];
    const max = times[times.length - 1];
    console.log(`  SUMMARY ${model}: accuracy ${ok}/${total}, fallbacks ${fallbacks}, p50 ${p50}ms, max ${max}ms`);
  }
}

main();
