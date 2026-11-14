# Terralog

Find Earth places that resemble candidate Moon base sites and Mars landing sites. Built for the NASA Space Apps Challenge 2026, Toronto.

The full product spec is in [`docs/Terralog_PRODUCT_GUIDE.md`](docs/Terralog_PRODUCT_GUIDE.md).

## What it does

- A Cesium globe with curated analog sites. Click one to see why it matches a Moon or Mars target, where it falls short, and the per-feature comparison.
- Plain-language search ("cold, dry, flat basaltic plain, no vegetation") turned into feature targets and weights, with a keyword fallback when the language model is unavailable. Scoring runs in the browser over every Earth land cell.
- Fine-tune sliders with importance weights and "must match" filters. Results re-rank live.
- Tour mode: walk or fly over the site on Cesium terrain or Google Photorealistic 3D Tiles, with a Moon or Mars Target View colour grade.
- Target Viewer: a three.js heightmap of the Moon or Mars target with an adjustable sun.
- Side-by-side compare page and a Method page with the formula, features and data provenance.

## Setup

Requires Node 20.19 or newer.

```bash
npm install
cp .env.example .env   # then fill in the values
npm run mock-data      # regenerates public/data (already committed)
npm run dev            # http://localhost:5173
```

### Environment variables

| Name | Where | Purpose |
|---|---|---|
| `CESIUM_ION_TOKEN` | client (public, injected at build time) | Cesium World Terrain, imagery, Photorealistic 3D Tiles. Without it the globe falls back to bundled low-detail imagery. |
| `BACKBOARD_API_KEY` | server only | Plain-language search parser. Without it search uses keyword matching. |
| `LLM_NAME` | server only | Defaults to `claude-sonnet-5-5`. |

The Backboard key is only read by `api/parse.ts` (Vercel function) and the dev middleware in `vite.config.ts`. It never reaches the browser.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, including `/api/parse` |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Vitest unit tests (scoring, keyword parser, schemas, API sanitising, URL state) |
| `npm run mock-data` | Regenerate the synthetic data files in `public/data` |
| `npx tsx --env-file=.env scripts/compareModels.ts [models]` | Benchmark parser models through Backboard |

## Deploying

The app is a static Vite build plus one serverless function, set up for Vercel (`vercel.json`). Set the three environment variables in the Vercel project, then deploy. `CESIUM_ION_TOKEN` must be present at build time.

## Data

All data files live in `public/data/` and are validated with zod at startup. The schema is documented in [`data/README.md`](data/README.md) and in section 9 of the product guide.

The current files are **synthetic mock data** from `scripts/mockData.ts`. Every file is marked `"mock": true` in its provenance block, and the app shows a "Demo data" ribbon until real files replace them. Swapping in real data needs no code changes.

## Language model choice

The parser calls Backboard's stateless message endpoint with Claude, JSON output, low thinking effort, and memory and web search off. We benchmarked `claude-haiku-5-5` against `claude-sonnet-5-5` on 25 test phrases (`scripts/compareModels.ts`) with the 6 s server timeout:

| Model | Correct parses | Timeouts (keyword fallback) | Median latency |
|---|---|---|---|
| `claude-sonnet-5-5` | 24 to 25 of 25 | 0 | 3.0 s |
| `claude-haiku-5-5` | 19 to 20 of 25 | 1 to 2 | 4.3 s |

Haiku was slower in practice because it kept reasoning despite the low effort setting, and it once returned malformed JSON. We kept Sonnet as the default. `LLM_NAME` can switch models without code changes.

## Demo script (60 to 90 seconds)

1. Land on the globe: "Terralog finds Earth places that look like Moon and Mars sites."
2. Click Haughton Crater: read the reasoning, point at the per-feature match and the "Falls short" list.
3. Enter the site, walk a few seconds (W A S D, click to look around), toggle Target View to Moon.
4. Exit, type "cold, dry, flat basaltic plain, no vegetation, remote", show the chips and ranked matches.
5. Open Fine-tune, move a slider to show live re-ranking, mark one feature "Must match".
6. Open Method: show data sources and the scoring formula.

## Project layout

```
api/parse.ts              Vercel function for plain-language search
api/_lib/parseCore.ts     prompt, Backboard call, sanitising, rate limit
src/scoring/              pure scoring engine (no DOM or Cesium)
src/parse/                keyword parser and client with fallback
src/data/                 zod schemas and loaders
src/globe/                Cesium viewer, pins, globe view
src/tour/                 tour controller, Target View, minimap
src/target/               three.js Target Viewer and compare page
src/ui/, src/pages/       panels, search, method page
scripts/mockData.ts       synthetic data generator
```

## Attributions

NASA PDS, LRO LOLA and Diviner, Mars MOLA, THEMIS and CRISM, Copernicus ERA5 and GLO-30, MODIS, Cesium ion, Google Photorealistic 3D Tiles, and Natural Earth. Terralog does not use Google Street View imagery.
