# Phase-by-phase build plan (from Sat Nov 14, 13:20)

Companion to `build-plan-v2.md` (the *what* and *why*). This doc is the *how and when*: for each phase, what data to get, which technologies, the steps, how you know you're done, and what to do if it goes wrong. Re-timed from now: venue until 18:00 today, evening at home, venue 8:00–18:00 Sunday, submission by 23:59 Sunday.

---

## New facts found while planning (they change the plan)

1. **Official Artemis III region outlines exist.** USGS data release *Down Selected Artemis III Candidate Landing Site Navigational Grids* (DOI **10.5066/P1MEQ6UK**, sourced from LROC QuickMap) has shapefiles for all 9 regions. Use the **1 km grid shapefile** per region (Slater Plain's 1 km grid comes as 4 quadrant files). No guessing region boxes.
2. **LOLA map-formula trap.** In the LOLA catalog file (`DSMAP_POLAR.CAT`), the lat/lon → pixel formula, taken literally for the south pole, puts 90°E on the **left**. The catalog's own text and its pixel → lat/lon formula put 90°E on the **right**, and standard polar stereographic agrees. Use:
   `ρ = 2·1737400·tan((90−|lat|)/2)`, `sample = ρ·sin(lon)/40 + N/2 + 0.5`, `line = −ρ·cos(lon)/40 + N/2 + 0.5` (N = 15200 for `LDEM_80S_40M`).
   Then **verify visually**: crop around a known crater and compare with Moon Trek.
3. **Ice and temperature must be scored one-sided.** If "distance to the Moon value" is scored symmetrically, a hot desert (ice 0) beats a dry polar valley (ice 0.9). Rule: *slope & roughness* = match the value; *thermal, ice, circling sun, mineralogy, barrenness, access* = measure only the shortfall from the Moon requirement.
4. **Twin view: matched hillshades beat live map tiles.** Moon south-pole tiles are polar stereographic, which needs extra projection plugins in Leaflet. Instead, render a hillshade PNG of the **exact DEM box that was scored**, on both bodies, with identical lighting and stretch. It's simpler and more honest.

---

## Repo layout (create in Phase 0)

```
analog-mission-control/
  pipeline/                 # Python: data → JSON + PNGs
    lunar_ps.py             # LOLA polar-stereographic math + IMG reader
    terrain.py              # ONE function for both bodies: slope hist, roughness, hillshade
    diviner.py              # stream Diviner PRP, summarise per region
    sun.py                  # circling-sun days by latitude
    moon_targets.py         # → web/public/data/targets.json
    earth_gee.py            # GEE features for one 15×15 km box
    build_sites.py          # sites.csv → web/public/data/sites.json
    sites.csv               # id,name,lat,lon,known,group
    data/raw/  data/cache/  # gitignored
  web/                      # Next.js app (static export)
    lib/scoring.ts          # similarity, TOPSIS, Monte Carlo
    public/data/*.json  public/img/*.png
  README.md                 # method, data credits, AI-use disclosure
```

**Technologies (whole project)**

| Layer | Tech |
|---|---|
| Data processing | Python 3.11+, numpy, pandas, scipy, matplotlib, geopandas, pyproj |
| Earth data | Google Earth Engine Python API (`earthengine-api`) |
| Moon data | Direct downloads from PDS (LOLA, Diviner) + USGS shapefiles |
| Frontend | Next.js (App Router, `output: "export"`), TypeScript, Tailwind CSS |
| Animation | Framer Motion (`layout` for the re-ranking leaderboard) |
| Charts | Recharts (slope-histogram overlay, radar, validation bars) |
| Globe (tier 2) | react-globe.gl |
| Hosting | Vercel (static) + GitHub repo (public, for the "Final Project" link) |
| Slides | Your choice; export to PDF and host on Google Drive/GitHub with a public link |

---

## Phase 0 · Setup and kick off downloads · 13:20–13:50

**Goal:** everything that runs slowly in the background is started; repo and deploy pipeline exist.

**Data to start downloading now (≈1.3 GB total):**

| File | From | Size | Why |
|---|---|---|---|
| `LDEM_80S_40M.IMG` + `.LBL` | imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ | 462 MB | Moon elevation, 80–90°S, 40 m |
| `dlre_prp_south.tab` + `.xml` | pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/ | 605 MB | Moon temperature + ice stability |
| `LDSM_85S_40M.IMG`, `LDRM_85S_40M.IMG` (optional) | same LOLA folder | 115 MB each | Cross-check slope/roughness |
| USGS Artemis III navigational grids (1 km shapefiles, 9 regions) | DOI 10.5066/P1MEQ6UK (USGS / ScienceBase) | small | Exact region outlines |

**Steps**
1. `git init`, create the layout above, push to a public GitHub repo.
2. `npx create-next-app@latest web --ts --tailwind --app` → set `output: "export"` → deploy the empty app to Vercel (proves the deploy path now, not Sunday night).
3. `pip install earthengine-api numpy pandas scipy matplotlib geopandas pyproj`; run `earthengine authenticate`; set your GEE Cloud project ID.

**Done when:** downloads are running, Vercel shows a live URL, and `ee.Initialize(project=...)` succeeds.
**Fallback:** if GEE auth is blocked, do Phase 1 first (it needs no GEE) and fix auth in parallel.

---

## Phase 1 · Moon targets (real LRO data) · 13:50–16:00

**Goal:** `targets.json` with real features for all 9 Artemis III regions + 9 Moon hillshade PNGs.

**Data used:** LOLA `LDEM_80S_40M`, Diviner PRP south, USGS region shapefiles.
**Tech:** numpy (`np.fromfile(path, '<i2').reshape(15200, 15200) * 0.5` → metres), geopandas + pyproj (shapefile `.prj` → lunar lat/lon on a 1737.4 km sphere), pandas `read_csv(chunksize=...)` (Diviner file has a header row; use `skipinitialspace=True`), matplotlib `Path.contains_points` (point-in-region).

**Steps**
1. **Regions:** for each region, read its 1 km grid shapefile(s), dissolve the cells into one outline, convert outline vertices to lat/lon, then to LOLA polar-stereographic X/Y with the formula above.
2. **Orientation check (15 min, don't skip):** crop the LOLA DEM around one region, save a hillshade PNG, and compare it with the same area in Moon Trek. If it's mirrored, your X sign is wrong.
3. **Terrain:** crop each region's bounding box from the DEM → `terrain.py`:
   - slope via `np.gradient(dem, 40)` → degrees → 45 one-degree bins (normalised histogram), p50, p90
   - roughness = residual std of a plane fitted to each 3×3 window (median, p90)
   - hillshade PNG (sun azimuth 315°, altitude 30°, 2–98 % stretch)
4. **Thermal + ice:** stream the Diviner table in 500k-row chunks, keep rows with `tri_clat ≤ −83.5`, convert to X/Y, assign to regions. Per region: median `temp_avg` (K), median & p95 `temp_max`, fraction of triangles with `0 ≤ ice_depth ≤ 1 m`, fraction with `ice_depth == 0`. (`−999` = not stable within 2.87 m.)
5. Write `targets.json`. Per region: `f = {slope_hist, rough_p50, temp_K, ice, sun_days: 365, mineral: 1, barren: 1, access: 1}` plus provenance strings.

**Done when:** one region's slope histogram is plotted, and all 9 have temperature and ice numbers. Sanity check: temperatures should be far below Earth's (tens to ~200 K).
**Fallback:** if a shapefile won't parse, use a 15×15 km box at its centroid and mark it "approximate." If the Diviner stream is slow, start with 3 regions.

---

## Phase 2 · Earth sites · 16:00–18:00 (+ ~1 h at home)

**Goal:** `sites.json` for ~26 known analogs + 10 negative controls, each with the same features + an Earth hillshade PNG.

**Data used (all through GEE):**

| Feature | GEE dataset | Band / rule |
|---|---|---|
| Terrain (same code as Moon) | `COPERNICUS/DEM/GLO30` (ESA, partner) | `DEM`, `.mosaic()`, bilinear resample, reproject to local UTM at 40 m, `sampleRectangle` on a 15×15 km box (375×375 px, under the 262,144-px limit) → numpy → `terrain.py` |
| Temperature | `MODIS/061/MOD11A2` 2003–2023 | `LST_Day_1km`, `LST_Night_1km` × 0.02 → mean annual (avg of day & night means), p95 day |
| Mineralogy | `NASA/ASTER_GED/AG100_003` | `emissivity_band10–14` × 0.001 → QI = b11²/(b10·b12), CI = b13/b14, MI = b12/b13 (check vs Ninomiya 2005) |
| Vegetation | `MODIS/061/MOD13A3` 2019–2023 | `NDVI` × 0.0001, max |
| Snow | `MODIS/061/MOD10A2` 2019–2023 | fraction of composites with `Maximum_Snow_Extent == 200` |
| Water / bare | `ESA/WorldCover/v200` | `Map`: 80 = water; 60 + 100 = bare/sparse |
| Access | `JRC/GHSL/P2023A/GHS_POP`, `NOAA/VIIRS/DNB/ANNUAL_V22`, `WCMC/WDPA/current/polygons` | population within 50 km, night lights, protected-area count (*confirm band names in the catalog*) |
| Optional cross-check | `JAXA/GCOM-C/L3/LAND/LST/V3` (JAXA, partner) | compare with MODIS temperature |

**Derived 0–1 features:**
- `ice` = clip((273.15 − mean LST)/10, 0, 1) × (1 − snow fraction), a dry-permafrost proxy
- `barren` = (1 − clip(NDVI max / 0.5)) × (1 − water fraction)
- `access` = clip(log10(pop50km + 1)/5)
- `sun_days` = circling-sun days from latitude. Checked: 0 below 70°, ~50 at 75°, ~106 at 78°, ~138 at 80°, ~178 at 89°.
- `mineral` = 1 − mean percentile rank of (QI, CI, MI) across all sites, i.e., anorthosite-like = low quartz, carbonate and mafic.

**Starter `sites.csv`.** Coordinates are approximate. **Check each in Worldview before running** (about 1 min each); ⚠ = I'm least sure.

| id | name | lat | lon | known | group |
|---|---|---|---|---|---|
| haughton | Haughton crater, Devon Is. | 75.38 | −89.67 | 1 | mars/ice |
| yungay | Yungay, Atacama | −24.08 | −69.95 | 1 | mars |
| wright_valley | Wright Valley, Dry Valleys | −77.52 | 161.85 | 1 | mars/ice |
| rio_tinto | Río Tinto (Peña de Hierro) | 37.72 | −6.56 | 1 | mars |
| bockfjorden ⚠ | Bockfjorden, Svalbard | 79.43 | 13.33 | 1 | mars |
| lost_hammer ⚠ | Lost Hammer, Axel Heiberg | 79.08 | −90.21 | 1 | mars/ice |
| pilbara ⚠ | Dresser Fm, Pilbara | −21.15 | 119.43 | 1 | mars |
| dallol | Dallol, Danakil | 14.24 | 40.30 | 1 | mars |
| lonar | Lonar crater | 19.98 | 76.51 | 1 | mars |
| lambahraun ⚠ | Lambahraun, Iceland | 64.43 | −20.55 | 1 | mars |
| dumont | Dumont Dunes | 35.68 | −116.22 | 1 | mars |
| mdrs | MDRS, Hanksville | 38.41 | −110.79 | 1 | mars |
| ramon | Makhtesh Ramon | 30.60 | 34.80 | 1 | mars |
| lava_beds | Lava Beds NM | 41.71 | −121.51 | 1 | moon/mars |
| mistastin | Mistastin crater | 55.88 | −63.31 | 1 | moon |
| sudbury | Sudbury | 46.60 | −81.18 | 1 | moon |
| ries | Nördlinger Ries | 48.88 | 10.57 | 1 | moon |
| lanzarote ⚠ | La Corona, Lanzarote | 29.17 | −13.45 | 1 | moon/mars |
| black_point ⚠ | Black Point lava flow | 35.69 | −111.44 | 1 | moon |
| cinder_lake ⚠ | Cinder Lake crater field | 35.29 | −111.48 | 1 | moon |
| meteor | Meteor Crater | 35.03 | −111.02 | 1 | moon |
| mauna_kea | Mauna Kea (PISCES) | 19.82 | −155.47 | 1 | moon |
| craters_moon | Craters of the Moon | 43.42 | −113.52 | 1 | moon |
| hiseas | HI-SEAS, Mauna Loa | 19.60 | −155.51 | 1 | ops |
| dome_c | Concordia, Dome C | −75.10 | 123.33 | 1 | ops/ice |
| salda | Lake Salda (Jezero analog) | 37.55 | 29.68 | 1 | mars-jezero |
| neg_amazon | Amazon forest | −3.50 | −62.00 | 0 | negative |
| neg_congo | Congo forest | 0.50 | 20.00 | 0 | negative |
| neg_borneo | Borneo forest | 0.50 | 114.50 | 0 | negative |
| neg_paris | Paris | 48.86 | 2.35 | 0 | negative |
| neg_toronto | Toronto | 43.70 | −79.40 | 0 | negative |
| neg_iowa | Iowa farmland | 42.00 | −93.50 | 0 | negative |
| neg_nl | Netherlands farmland | 52.30 | 5.50 | 0 | negative |
| neg_ganges | Ganges plain | 26.50 | 82.00 | 0 | negative |
| neg_ukraine | Ukraine farmland | 49.50 | 32.00 | 0 | negative |
| neg_olympic | Olympic Peninsula forest | 47.80 | −123.60 | 0 | negative |

**Steps**
1. Get one site working end to end (Mistastin): DEM box shape, terrain numbers, scalars.
2. Cache every site's result to `data/cache/<id>.json` so re-runs skip finished sites.
3. Run all 36 sites, compute `mineral` across them, write `sites.json`.
4. (Tier 2, kick off before leaving the venue) a stage-1 discovery grid export in GEE: 0.25° cells over land, masked to NDVI max < 0.3 and no water, with cheap features only. It runs as a batch task while you travel.

**Done when:** 36 sites in `sites.json`, 36 Earth hillshade PNGs, no NaN in key features.
**Fallback:** if `sampleRectangle` errors near the poles (>84°N / <80°S), use EPSG:3413 / 3031 instead of UTM; if a band name fails, look it up in the GEE catalog and move on.

---

## Phase 3 · Scoring engine · Sat evening, ~1.5 h

**Goal:** `web/lib/scoring.ts` ranks sites for any target + preset, instantly, in the browser.
**Tech:** plain TypeScript, no libraries.

**Logic**
- **Distance per dimension**
  - slope = Wasserstein distance between the two histograms (cumulative difference × 1°)
  - roughness = |Earth − Moon|
  - thermal = max(0, Earth K − Moon K)
  - ice = shortfall from 1 if the region has > 5 % stable ice, else 0
  - sun = 365 − Earth days
  - mineral, barren, access = shortfall from 1
- **Similarity** = exp(−distance / scale), scale = max(median distance, 25 % of the range) per dimension.
- **TOPSIS** with preset weights. Presets:
  - **Rover mobility:** slope, roughness
  - **Lighting/vision:** circling sun, roughness, barren
  - **Ice & ISRU:** ice, thermal
  - **Geology/sampling:** mineral, barren
  - **Construction:** slope, roughness, some access
  - **Access:** access-heavy
- **Flags:** similarity ≥ 0.6 green, ≥ 0.35 amber, else red. Gravity, vacuum and radiation are always red.
- **Stability (tier 2):** 2,000 Dirichlet weight samples around the preset → P(#1) and the 10th–90th percentile rank range.

**Done when:** with real JSON, the negative controls rank at the bottom under every preset. If they don't, fix the features before building UI.

---

## Phase 4 · Core UI · Sat evening, ~2 h

**Goal:** the demo moment works on the live Vercel URL.

**Build**
1. **Mission select:** dropdown of the 9 regions + preset chips.
2. **Leaderboard:** each row shows rank, ▲▼ change since the last re-rank, site name, fidelity bar (TOPSIS score), 8 small colored dots (one per dimension flag), and a Known/New badge. Wrap rows in Framer Motion `<motion.li layout>` so they slide when the order changes.
3. **Weight sliders** (collapsible) that re-rank live.
4. Dark "mission control" theme: monospace numbers, thin grid lines, one accent color.

**Done when:** you pick Malapert → Rover mobility, rows animate into order, and moving a slider visibly reorders them. Deployed.

---

## Phase 5 · Twin view + breaks-down strip · Sun 08:00–10:00

**Goal:** clicking a site proves the match.

**Build**
- Side by side: `moon_<region>.png` and `earth_<site>.png`, the same 15 km scale bar under both.
- **Slope-histogram overlay** (Recharts area chart, Moon vs Earth) with the Wasserstein distance printed.
- **Radar chart** of the 8 similarities.
- **Breaks-down strip:** gravity / vacuum / radiation always red, plus every red/amber dimension with its gap in real units ("128 K warmer", "259 fewer circling-sun days").
- **Provenance tooltip** on each number (dataset, version, years, resolution) and its A/B/C comparability badge.

**Done when:** for the top 3 sites of any target, the twin view tells a story you can say out loud in 20 seconds.

---

## Phase 6 · Validation panel · Sun 10:00–11:00

**Goal:** evidence that the engine works (Validity score).

**Build**
- **Hold-out ranks:** for each known analog, its rank percentile under its natural preset (Moon sites under Geology/Rover; ice sites under Ice; Salda under the Jezero target if you built it). Show as a bar chart.
- **Negative controls:** where all 10 rank (they should sit in the bottom block).
- **Ablation:** drop one dimension at a time and show how much the top-5 changes (tornado chart).
- **Write one honest sentence** for any surprise (e.g., "Mistastin is penalised by its lake and vegetation").

**Done when:** the panel shows real numbers and you can explain one success and one failure.

---

## Phase 7 · Discovery (tier 2) · Sun 11:00–12:00, only if Phases 1–6 are done

**Goal:** the "surprise us" answer: new, unrecognised analog candidates.

**Build:** load the stage-1 grid results → keep the top ~50 cells for one target and one preset → run the full Phase 2 features on them (cached, in parallel) → rank → drop cells within ~50 km of a known analog → top 5 cards with "New candidate" badges on a globe (react-globe.gl) or a simple map.

**Fallback:** if time is short, skip the grid and hand-pick 5 to 10 under-studied candidates to test (e.g., ice-free Arctic anorthosite areas in Greenland/Labrador). Present them as "hypotheses the engine tested," with their real scores.

---

## Phase 8 · Freeze, deck and demo · Sun 12:00–13:00

- **12:00 feature freeze.** Only bug fixes after this.
- Record a ~10 s GIF/screen capture of the re-rank (for slide 4 and the README).
- **7 slides max (title and intro count toward the 7):**
  1. Title, team, challenge
  2. Problem: analogs are picked one at a time
  3. Method: physics-matched dimensions, A/B/C badges
  4. Product: re-rank + twin view
  5. Validation
  6. New candidates + where analogies break (numbers)
  7. Impact + data used (NASA, ESA, JAXA)
- Host the deck PDF publicly (no login) and test the link in a private window.

---

## Phase 9 · Local judging · Sun 13:00–16:00

- **Sign up early at 13:00.** Rehearse a 2-minute walkthrough: problem (15 s) → pick a region (15 s) → re-rank (15 s) → twin view (30 s) → validation (20 s) → breakdowns + new candidates (25 s).
- Note judges' questions; you can still change the project page until 23:59.

---

## Phase 10 · Submission · Sun evening (target 21:00, hard deadline 23:59)

Fill in every field on the project page:
- **High-level summary:** what it is, how it answers the challenge, why it matters.
- **Demo link:** the 7-slide deck (or a ≤ 30 s video).
- **Final project link:** the Vercel URL + GitHub repo.
- **Detailed description:** what it does, how it works (method + data + validation), benefits, tools and languages.
- **NASA data:** LRO LOLA polar GDR, LRO Diviner PRP, MODIS MOD11A2/MOD13A3/MOD10A2, ASTER GED AG100, VIIRS night lights, USGS Artemis III navigational grids, plus Moon Trek/Worldview if shown.
- **Partner data & references:** ESA Copernicus DEM GLO-30, ESA WorldCover, JAXA GCOM-C LST (if used), GHSL, WDPA; every library and paper used.
- **AI use (SI field):** say exactly where AI helped (planning research, code assistance) and mark AI-assisted code in the README.

Then:
- Submit the FortiGuard web-filter classification for the Vercel URL.
- Test all links in a private window.
- Click **Submit for Judging**.
- Download your participant certificate.

---

## Cut list (if you fall behind, cut in this order)

1. Phase 7 discovery → hand-picked hypotheses instead
2. Stability panel
3. Ablation chart (keep hold-out + negatives)
4. Radar chart (keep histogram overlay)
5. Weight sliders (keep presets)

**Never cut:** real Moon data, same-code terrain, the re-rank animation, the twin view, hold-out + negative-control validation, the breaks-down strip.
