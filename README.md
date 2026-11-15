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

## Redesign (Survey Console)

The app now runs as a precise survey instrument, with a hand-annotated layer on top. The globe is full-bleed. Solid hairline consoles hold the left rail (Moon and Mars targets, ranked candidate cards) and the right panel (Find, then Explore for a chosen site). Numbers are monospaced and tabular. The grease-pencil annotations, in a warm handwritten face, are used sparingly to point at the gap that matters.

What changed:

- **Layout and tokens.** Design tokens live in `src/index.css`, and `docs/DESIGN.md` documents them. Desktop uses a 320 px left rail, the globe, and a 400 px right panel. Below 768 px the globe is full screen, the cards become a snap carousel, and the right panel becomes a bottom sheet.
- **Feature keys.** Sliders, the parser and scoring share one set of twelve keys: `slope_deg`, `roughness_m`, `relief_m`, `flat_frac`, `crater_density`, `shadow_frac`, `temp_mean_k`, `temp_max_k`, `ice_proxy`, `precip_mm_yr`, `vegetation_ndvi`, `snow_frac`. The keyword parser maps phrases to these keys (for example "cold" sets `temp_mean_k`, "snowy" sets `snow_frac`). Words such as "basalt" and "lava" only add a tag.
- **Explanations.** `POST /api/explain` writes three or four sentences on why a site is an analog for a target, using only the numbers supplied. It falls back to curated text when there is no key, on timeout, or when the rate limit is reached.
- **Tour HUD.** The tour shows the imagery fidelity actually loaded, a Target View toggle, and a clear Exit button. It never calls itself Google Street View.
- **Method page.** Rewritten to describe the pipeline, datasets, the challenge resources used, and the limitations.

### Run it

```bash
npm install
npm run dev        # http://localhost:5173, includes /api/parse and /api/explain
npm test           # Vitest: scoring, keyword parser, API cores, clients
npm run build      # type-check and production build
```

### Environment variables

| Name | Required | Where | Purpose |
|---|---|---|---|
| `CESIUM_ION_TOKEN` | optional | client, build time | Cesium World Terrain, imagery and Photorealistic 3D Tiles. Without it the globe uses NASA GIBS imagery and low-detail terrain. |
| `BACKBOARD_API_KEY` | optional | server only | Powers `/api/parse` and `/api/explain`. Without it, search uses the keyword parser and explanations use the curated text. |
| `LLM_NAME` | optional | server only | Model name for both endpoints. Defaults to `claude-sonnet-5-5`. |

NASA GIBS needs no key. It is the fallback imagery when there is no Cesium token. The server-side key is read only by the Vercel functions and the dev middleware in `vite.config.ts`. It never reaches the browser.

### Rebuild the data

The site data in `public/data/` is generated from the discovery outputs by a Python script. From the app folder, with the discovery virtual environment set up:

```bash
../discovery/.venv/bin/python scripts/build_real_data.py
```

### Demo click path (60 to 90 seconds)

1. **Land.** The globe shows three Moon cards in the left rail. Say: "Terralog finds Earth places that look like Moon and Mars sites."
2. **Switch body.** Toggle to Mars, then back to Moon.
3. **Open a site.** Click Ngari. Read why it matches and the gaps in the explanation and the feature table, especially temperature and lighting.
4. **Re-rank.** Open Find and drag the temperature slider. Watch the cards re-rank.
5. **Enter the site.** Press Enter site, then switch to Target View to see the Moon grade.
6. **Return.** Exit the tour, then go back to the globe.

## Setup

Requires Node 20.19 or newer.

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:5173
```

Environment variables are listed in the Redesign section above. The Backboard key is read only by the Vercel functions and the dev middleware in `vite.config.ts`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server, including `/api/parse` and `/api/explain` |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Vitest unit tests (scoring, keyword parser, schemas, API sanitising, URL state) |
| `npm run mock-data` | Regenerate the synthetic data files in `public/data` |
| `npx tsx --env-file=.env scripts/compareModels.ts [models]` | Benchmark parser models through Backboard |

## Deploying

The app is a static Vite build plus one serverless function, set up for Vercel (`vercel.json`). Set `BACKBOARD_API_KEY` (and optionally `LLM_NAME` and `CESIUM_ION_TOKEN`) in the Vercel project, then deploy. `CESIUM_ION_TOKEN` must be present at build time.

## Data

All data files live in `public/data/` and are validated with zod at startup. The schema is documented in [`data/README.md`](data/README.md) and in section 9 of the product guide.

Files are rebuilt from the discovery outputs with `../discovery/.venv/bin/python scripts/build_real_data.py` (see Redesign above). A file marked `"mock": true` in its provenance block is still synthetic, and the app shows a "Demo data" notice while any such file is loaded.

## Language model choice

The parser calls Backboard's stateless message endpoint with Claude, JSON output, low thinking effort, and memory and web search off. We benchmarked `claude-haiku-5-5` against `claude-sonnet-5-5` on 25 test phrases (`scripts/compareModels.ts`) with the 6 s server timeout:

| Model | Correct parses | Timeouts (keyword fallback) | Median latency |
|---|---|---|---|
| `claude-sonnet-5-5` | 24 to 25 of 25 | 0 | 3.0 s |
| `claude-haiku-5-5` | 19 to 20 of 25 | 1 to 2 | 4.3 s |

Haiku was slower in practice because it kept reasoning despite the low effort setting, and it once returned malformed JSON. We kept Sonnet as the default. `LLM_NAME` can switch models without code changes.

## Project layout

```
api/parse.ts              Vercel function for plain-language search
api/explain.ts            Vercel function for "why it matches" explanations
api/_lib/parseCore.ts     prompt, Backboard call, sanitising, rate limit
api/_lib/explainCore.ts   explanation prompt, validation, rate limit, curated fallback
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
