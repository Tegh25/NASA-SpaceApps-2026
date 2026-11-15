# Terralog: full handoff for the next agent

Written 2026-11-15 at the end of a long build session. Read this first, then `docs/DESIGN.md`, `data/README.md`, `discovery/HANDOFF.md` and `discovery/mars/MARS_FINDINGS.md`.

## 1. What this project is

**Terralog** is our NASA Space Apps Challenge 2026 entry for the challenge "Permanent Moon Base Locations and Mars". It finds **places on Earth that are terrain analogs for Moon and Mars sites**, shows them on a 3D globe, explains why each one matches and where it falls short (in numbers), and lets you explore them in 3D.

Two halves live in one repo:

1. **`discovery/`**: the research pipeline (Python). It scored real satellite data and produced the candidate sites.
2. **The web app** (everything else): Vite + React 19 + TypeScript + Tailwind 4 + zustand + react-router 7 + Cesium (globe) + three.js (3D terrain) + zod (data validation). It reads the research outputs as static JSON in `public/data/`.

Repo: `https://github.com/Tegh25/NASA-SpaceApps-2026`.

## 2. Branches (state at handoff)

| Branch | Content | Status |
|---|---|---|
| `main` | Original first version of the app (synthetic demo data) plus Tegh25's "return to whole-Earth view" commit | Untouched by this session |
| `data/discovery-pipeline` | Adds `discovery/` (Moon and Mars research, 72 commits). No app code | Pushed |
| `redesign` | "Survey Console" redesign on real data + Liquid Glass UI | Pushed, kept as a backup |
| `experiment` | `redesign` + Twin Terrain Lab, heat field, Moon/Mars inset, cinematic intro | Pushed, kept as a backup |
| **`integration`** | **Everything above merged + computed Mars results + fixes. This is the branch to build on.** | Pushed. **PR #2 into `main` is open**: https://github.com/Tegh25/NASA-SpaceApps-2026/pull/2 (CI check passed, mergeable) |

Local note: a second git worktree exists at `../NASA-SpaceApps-2026-experiment`, currently checked out on `data/discovery-pipeline`. It shares the same `.git`.

## 3. How to run the app

```bash
cd NASA-SpaceApps-2026
git checkout integration
npm install
npm run dev            # http://localhost:5173
```

Checks (all must stay green; they were at handoff: typecheck clean, 62 tests pass, build succeeds):

```bash
npm run typecheck
npm test
npm run build
```

### Environment (`.env`, copy from `.env.example`)

| Variable | Needed? | What happens without it |
|---|---|---|
| `CESIUM_ION_TOKEN` | Optional, public (bundled into the client) | Globe uses keyless **NASA GIBS** imagery (Blue Marble + MODIS when zoomed). With it: Cesium World Imagery + World Terrain, and Google Photorealistic 3D Tiles in the tour |
| `BACKBOARD_API_KEY` | Optional, server-only | Text search falls back to a keyword parser; "Ask AI" keeps the curated explanation |
| `LLM_NAME` | Optional, server-only | Model name for `/api/parse` and `/api/explain` (Backboard.io Messages API) |

To test the no-token path: `CESIUM_ION_TOKEN= npx vite --port 5174` (an empty process env var overrides `.env`).

**Do not commit `.env.example` as it is on the owner's machine**: it currently contains a real token locally. It was deliberately left uncommitted. `package-lock.json` local changes were also left uncommitted.

Deployment target is Vercel (`vercel.json`, serverless functions in `api/`). Nothing has been deployed by this session.

## 4. Routes

| Route | What it is |
|---|---|
| `/` | Home: left rail (Moon/Mars toggle, location cards), globe, right panel in **Find** mode |
| `/site/:id` | Same layout, right panel in **Explore** mode for a site (`earth-ngari-tibet`, `cell-123` for engine results, ...) |
| `/lab/:siteId` | **Twin Terrain Lab** (three.js): real Earth block next to / morphing into its real Moon or Mars region at the same scale |
| `/tour/:id` | Ground-level walk ("Enter site"): Cesium first-person camera, fidelity badge, Target View colour grade (Moon/Mars look) |
| `/target/:id` | Target Viewer: 3D heightmap of a Moon/Mars target |
| `/compare/:siteId/:targetId` | Split view globe vs target |
| `/method` | Method, datasets, the 11 challenge resources, limitations, credits |

URL search params carry the body and the active query (`?body=moon&t=temp_mean_k:0.85&w=temp_mean_k:2`), so deep links reproduce a search.

## 5. App architecture (file map)

```
src/
  App.tsx                 routes, globe mount, boot skeleton, GlassFilters mount
  index.css               design tokens + Liquid Glass classes (component classes are inside @layer components!)
  state/store.ts          zustand store: data, query, results, selectedId, hoveredId, body, goHome/homeNonce
  data/schemas.ts         zod schemas = the data contract (FeaturedSite has body, kind, status, rank, why, images, gaps, caveats, valueSource, stats, twin)
  data/loaders.ts         fetch + validate public/data/*.json, loadHeightmap()
  scoring/                score.ts (weighted closeness 0-100, non-max suppression), normalize.ts
  parse/                  keyword.ts (text -> query fallback), client.ts (/api/parse), explainClient.ts (/api/explain)
  lib/cards.ts            useCards(): left-rail cards (featured by rank, or re-ranked live against the active query + engine cells)
  lib/sites.ts            getSite, comparisonFor, analyse, autoDescription, GLOBAL_LIMITS
  lib/camera.ts           camera store for the HUD (lat/lon/alt/terrain height), zoom/orbit/surface actions
  lib/urlState.ts         two-way URL <-> query sync
  globe/viewer.ts         Cesium viewer singleton; imagery stack (GIBS Blue Marble base, ion or MODIS, Black Marble night glow 35 %), atmosphere, graticule
  globe/GlobeView.tsx     pins, fly-to, selection, heat field wiring, hover beams, logo-click home flight
  globe/heatField.ts      all 12,362 Earth blocks as glowing points coloured by live score, ripple on re-rank
  globe/GlobeHud.tsx      Orbit/Surface, zoom, compass, readout, scale bar, reticle
  fx/Intro.tsx            once-per-session fly-in + typed "mission boot" log with real counts
  fx/BodyInset.tsx        small three.js Moon/Mars globe marking the active target
  fx/HeatLegend.tsx       legend: only searched blocks glow; show/hide toggle
  fx/beam.ts              hover beam over a site
  ui/left/                LeftRail, BodyToggle (liquid blob), LocationCard, CardList, BottomSheet (phone), Logo, GlobeNotes (pencil notes), useBreakpoint
  ui/right/               RightPanel -> FindPanel (sliders with target ticks, text box, Advanced) / ExplorePanel (hero, score, why, match bars, gaps, caveats, Enter site, Twin terrain lab link)
  ui/kit/                 Glass (SVG-refraction panel), GlassFilters, glassMap, ScoreRing, Badge, HandNote
  lab/                    LabPage.tsx, labScene.ts (two height textures, GPU morph, shadows, contours, scan intro), shaders.ts, fingerprint.ts (+test)
  tour/                   TourView, controller (WASD walk), targetViewProfile, Minimap
  target/                 TargetPage/TargetScene (three.js), ComparePage
  pages/                  Home.tsx (layout per breakpoint), Method.tsx
api/
  parse.ts, explain.ts    Vercel functions; logic in api/_lib/*Core.ts (zod-validated, rate-limited, timeout, curated fallback). vite.config.ts serves them in dev
scripts/
  build_real_data.py      discovery/ -> public/data/*.json + public/img/*.webp
  build_twin_terrain.py   Earth/Moon/Mars heightmaps + slope stats + `twin` fields for the Lab
  mockData.ts             old synthetic generator (unused now)
public/
  data/                   features.json, targets.json, earth_cells.json (12,362 blocks, ~1.3 MB), featured_analogs.json, heightmaps/ (moon-*, mars-*, earth/<site-id>.json)
  img/                    WebP hero images (eo_*, twin_*, moon_*, mars_*, img/mars/, img/twin/)
  textures/               Moon (NASA SVS LROC, public domain) and Mars (Solar System Scope, CC BY 4.0) maps; CREDITS.md
docs/
  DESIGN.md               design system + Liquid Glass + feature-key table
  screenshots/            verification screenshots
discovery/                research pipeline (section 7)
```

Responsive layout: **desktop >= 1280 px** = three columns (glass rails float over a full-bleed globe); **768-1279 px** = left rail + globe, right panel is a drawer (Find button top-left of the globe); **< 768 px** = full-screen globe, card carousel, bottom sheet (opens automatically when a site is selected).

## 6. The data in the app (`public/data/`)

**Features** (12 keys, the contract for sliders, parser and scoring; see `docs/DESIGN.md`):
`slope_deg, roughness_m, relief_m, flat_frac, crater_density, shadow_frac, temp_mean_k, temp_max_k, ice_proxy, precip_mm_yr, vegetation_ndvi, snow_frac`.
Earth sources: Copernicus GLO-30 terrain (40 m), MODIS C6.1 via Planetary Computer, NASA POWER. Moon sources: LRO LOLA LDEM_80S_40M, Diviner PRP.

**Targets** (13): 9 Artemis III Moon regions (Slater Plain, Haworth, Mons Mouton, Mons Mouton Plateau, Nobile Rim 1 and 2, Malapert Massif, de Gerlache Rim 2, Peak near Cabeus B) and 4 Mars sites (Jezero, Gale, Meridiani, Oxia Planum; terrain from the USGS HRSC+MOLA 200 m blend).

**Featured sites (cards)**:

| Body | New candidates (computed) | Known | Reserve |
|---|---|---|---|
| Moon | Ngari W. Tibet (vs Slater Plain), Pamir near Muztagh Ata (vs Mons Mouton Plateau), S. Tibet Tingri/Dinggye (vs Malapert Massif, conditional) | Mauna Kea, Wright Valley (validation analogs) | Altyn-Tagh, Zanda, S. Tibet 2 |
| Mars | Chagai/Taftan Pakistan-Iran (vs Oxia), Mazongshan/Beishan Gobi (vs Oxia), Gerze N. Tibet (vs Jezero, wildcard) | Atacama/Yungay, Lake Salda, Rio Tinto (literature values, no score shown) | Ejin/Heihe, Bafq/Yazd, Kavir margin, Tibesti, Hejaz harrat, Ica/Nazca |

Every computed card has `why` (curated from real numbers), numeric `gaps`, `caveats`, `stats` and a `twin` (Lab heightmaps). Moon twins: 256 x 256 at 40 m (10.24 km). Mars twins: 150 x 150 at 200 m (30 km).

**Rebuild the data** (only needed if discovery outputs change). Use the discovery venv (pandas, numpy, rasterio, Pillow) and `cwebp`:

```bash
../discovery/.venv/bin/python scripts/build_real_data.py     # ALWAYS first: rewrites featured_analogs.json and the heightmaps folder
../discovery/.venv/bin/python scripts/build_twin_terrain.py  # ALWAYS second: re-adds twin heightmaps and `twin` fields
```

The scripts read the in-repo `discovery/` first. Some raw inputs are **not in git** (about 9 GB of DEM tiles, Moon crops, Mars `.npy` windows, a few previews); they come from the sibling checkout `../discovery/` or the env vars `TERRALOG_DISC`, `TERRALOG_TILES`, `TERRALOG_RAW` (see `data/README.md`). The committed `public/data` is complete, so the app itself runs from a fresh clone.

## 7. What is in `discovery/`

**Moon phase** (top level of `discovery/`; summary in `HANDOFF.md`, full method in `FINDINGS.md`):
- 12,362 Earth blocks of 20 x 20 km from 235 Copernicus GLO-30 tiles (pre-screened as cold, dry and rugged; not the whole Earth) were scored on 10 categories (terrain, multi-scale roughness, craters, landing slopes, shadow structure under a low circling sun, thermal, ice, circling-sun days, surface type, geology) against the 9 Artemis III Moon regions, gated for bare rock, and checked for novelty (>= 150 km from 166 catalogued analog sites + web searches). Surface confirmed with Landsat 8/9 and Sentinel-2.
- Key files: `results/v3_final_table.csv` (finalists), `results/moon_regions.json` (Moon fingerprints), `results/feat_*.csv` (feature families per block), `results/eo_verify.csv`, `previews/` (twin images, EO checks, Moon hillshades). Scripts: `refine_earth.py`, `feat_*.py`, `v3_run.py`, `v3_rank.py`, `v3_test.py`, `feat_eo_verify.py`.
- Findings: Ngari, Pamir, S. Tibet (conditional). Validation: the composite separates known analogs from forests/farms as well as terrain alone (AUC 0.82); only Mauna Kea (98th pct) and Wright Valley (85th) rank high among known analogs.

**Mars phase** (`discovery/mars/`; summary in `MARS_FINDINGS.md`, plus `README.md`, `mars_scout_notes.md`, `novelty_mars.md`):
- 68,496 arid-land blocks (30 km at 200 m) screened worldwide against Jezero, Gale, Meridiani and Oxia Planum (HRSC+MOLA terrain, TES albedo, TES thermal inertia); 251-site known-analog catalog; Landsat/Sentinel-2 checks.
- Main file: `results/mars_final_table.csv`. Picks: Chagai/Taftan and Mazongshan/Beishan (both near-identical to Oxia Planum in slope, relief and albedo, 100 % bare), Gerze wildcard (vs Jezero).
- Limits: cannot match Mars temperature, pressure, thermal inertia or clay mineralogy; Mars validation is weak.

**Of the 11 challenge resources**: used directly PDS, LRO (LOLA, Mini-RF), Diviner, Copernicus DEM; indirectly Earthdata's MODIS and JAXA PALSAR (via Planetary Computer); not used Worldview/GIBS for analysis (only for globe imagery), CSA RCM, RADARSAT-1, the SAR tutorial, ESA Open Science Catalog. Details in `discovery/HANDOFF.md` section 3 and the Method page.

## 8. Design system ("Survey Console" + Liquid Glass)

- Dark space palette; accent follows the body via `data-body="moon|mars"`: Moon `#9EE7F2` silver-cyan, Mars `#FF7A3D` ember. Tokens in `src/index.css` (`--void`, `--hull`, `--ink`, `--dim`, `--accent`, `--pencil`, `--good/--mid/--bad`).
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (`.num`, every number), Caveat (`.hand`, the yellow "grease pencil" annotations echoing the team's hand sketch).
- Liquid Glass: `.glass` (big panels, SVG `feDisplacementMap` refraction via `<Glass>` on Chromium; blur fallback in Safari/Firefox), `.glass-thin`, `.glass-capsule`, `.glass-drop` (round Go/Enter buttons), `.liquid-blob` (Moon/Mars toggle). Respects `prefers-reduced-transparency` and `prefers-reduced-motion`.
- Copy rules: sentence case, no ALL-CAPS eyebrows, no "->" in button text.

## 9. Honesty rules (do not break these)

- Every number shown must trace to `discovery/` outputs or a cited source. Unknown = `null` / "n/a", never invented.
- Place names are approximate. "New" is provisional (>= 150 km from catalogued sites, web searches only). Prior art exists: never say "unprecedented".
- No Earth block closes the **temperature gap** (Earth ~271-278 K vs Moon 105-153 K) or the **lighting gap** (0 circling-sun days); these are shown as numbers.
- Mars comparisons use 3 terrain features at 200 m, so Mars scores can read near 100 (e.g. Chagai vs Oxia); the UI labels them indicative. Mars temperature/diurnal swing are n/a (no sourced site value).
- The heat field covers only the searched blocks; the legend says dark land was not searched.
- The tour is "simulated look, not a physical render"; never call it Google Street View.

## 10. Known issues and gotchas

- **CSS layers:** custom component classes must live in `@layer components` in `index.css`; unlayered CSS overrides Tailwind utilities (this once collapsed the right panel).
- **Globe lighting:** `enableLighting` is off on purpose (with the night layer it rendered the disc near-black from orbit).
- **Photoreal tiles** are sparse in remote areas (Tibet); the tour keeps terrain + satellite under them, and the badge says "Photoreal 3D tiles where covered, terrain elsewhere".
- **Screenshots in the Claude desktop browser pane** can be stale or black when the pane is hidden (rAF throttled). In dev, `window.__viewer` (Cesium) and `window.__lab` (Lab scene) are exposed for debugging; call `__lab.tick(performance.now())` or `__viewer.render()` before capturing.
- `HeightmapSchema` passes through `stats`; Moon heightmaps are polar-stereographic (not north-up), noted in the Lab.
- `scripts/mockData.ts` and `src/ui/SiteDetailPanel.tsx`, `FeatureTable.tsx`, `RadarChart.tsx` are legacy and mostly unused.
- Pushing large commits over HTTPS needed `git -c http.postBuffer=524288000 push`.

## 11. Verification status at handoff

Checked in a browser at 1440 x 900, 1024 x 768 and 390 x 844: home (Moon and Mars), Explore, Find sliders re-ranking cards live with URL sync, Moon and Mars Twin Lab (side by side, morph, 1.5 deg lunar sun), heat field + legend, Moon/Mars inset, intro, tour (Ngari), Method page, with and without a Cesium token. No console errors.

**Not yet done:** walking the README demo path on the actual demo laptop; checking the Lab on a phone; a live `/api/explain` call (no Backboard key was set, so only the curated fallback was exercised); deployment.

## 12. Demo path (60-90 s)

Land (intro, glowing globe, 3 Moon cards) -> click **Ngari** -> read "Why it matches" and the gaps -> **Twin terrain lab** -> Lunar south pole sun 1.5 deg -> Morph -> back -> drag the temperature slider in Find and watch the heat field ripple and cards re-rank -> toggle **Mars** -> Chagai/Taftan -> its Twin Lab vs Oxia Planum -> **Enter site** for the ground-level tour.

## 13. How this session got here (chronological)

1. Read the app (initial version on `main` with synthetic data) and the discovery handoff; created branch `redesign`.
2. Wrote shared design tokens (`index.css`), `docs/DESIGN.md`, schema extensions; delegated in parallel: real-data build script, globe fix (NASA GIBS keyless imagery, pins, HUD), shell + left rail, right Find/Explore panel, backend (`/api/explain`, parser remap, Method page, tour styling).
3. Fixed integration bugs (dark globe, CSS layer collapse, camera crash, tour black void, literature-card scores); committed and pushed `redesign`.
4. Added Liquid Glass to `redesign`; created `experiment` (worktree) with Twin Terrain Lab, Earth twin heightmaps, Moon/Mars textures, heat field, intro, inset; pushed both.
5. Integration: new branch `integration` from `main`, merged `data/discovery-pipeline` and `experiment`, resolved the two conflicts (kept logo-click home flight), pointed scripts at the in-repo `discovery/`, added computed Mars cards + Mars twins + scale-aware Lab, heat legend, phone and 1024-1279 px layout fixes. Opened PR #2.

## 14. Sensible next steps

1. Merge PR #2 after a teammate review; deploy to Vercel with `CESIUM_ION_TOKEN` (and optionally `BACKBOARD_API_KEY`) set in the project env.
2. Walk the demo path on the demo machine; check performance with the heat field + Lab.
3. Optional: a sourced Mars temperature per site (Mars Climate Database / REMS / MEDA) to fill the Mars "n/a" gaps; Lab polish on phones; prune legacy files.
