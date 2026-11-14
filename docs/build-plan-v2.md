# Build Plan v2: what each resource actually gives us, and what we build

Written Fri Nov 13, 2026 (evening) after opening and testing every resource on the challenge's Resources tab in Chrome, plus the data services they lead to, then checking the plan's numbers. Replaces the scope and hour-plan sections of `hackathon-weekend-playbook.md`; the rules, logistics and judging sections there still stand.

---

## 0. TL;DR

- **Biggest change:** the Moon side no longer needs literature numbers. LRO already publishes **ready-made, per-pixel south-pole data**: Diviner's Polar Resource Product (annual mean temperature, annual max temperature, water-ice stability depth) and LOLA's polar slope/roughness/elevation grids. We can compute real feature values for every Artemis III region.
- **Earth side:** the Earth layers we need are in **Google Earth Engine**, including partner data (ESA Copernicus DEM, Sentinel-1, JAXA GCOM-C land temperature, JAXA ALOS PALSAR radar). Terrain boxes are pulled out of GEE and processed by **the same Python code as the Moon**.
- **The twin view is free:** NASA GIBS (Worldview's tiles) and NASA Trek (Moon/Mars tiles) both serve map tiles with no login and open cross-origin access. Earth and Moon can sit side by side, live, with zero hosting.
- **Concepts:** keep 1 (Mission Control) as the shell. Promote 6 (Validation) to core. Keep 3 (Hidden Twin) as two-stage discovery. Shrink 2 (Stability) to a panel. Keep 4 (Portfolio) as tier 2. Fold 5 (Seasonal) into a per-site "best test window." Add two new dimensions found in the data: **ice stability** and **circling-sun lighting**.
- **What makes it unique:** comparisons are **physics-matched** (the same physical quantity on both bodies, computed by the same code, at the same baseline, over the same 15×15 km footprint), every number carries a **comparability badge** and **provenance**, and the engine **proves itself** by rediscovering known analogs blind.

---

## 1. Resource-by-resource findings

| # | Resource | What I tried | What's actually useful | Verdict | Access |
|---|---|---|---|---|---|
| 1 | **NASA Earthdata Search** | Searched; inventoried collections in the catalog behind it | MOD11A2 v061 land temp 8-day 1 km (2000–now); MOD21A2; **ASTER GED AG100 v003** (5 TIR emissivity bands + NDVI, 100 m); **NASADEM** 30 m; **EMIT L2B MIN v002** (60 m, NetCDF, *not orthorectified*); EMIT L2A reflectance v002; ECOSTRESS LST v003; SMAP L3 9 km; MCD43A3 albedo 500 m; MOD13A3 NDVI; MOD10A2 snow; VIIRS VNP46A4 night lights; ICESat-2 ATL06; MERRA-2 aerosols. All LP DAAC items are cloud-hosted. | **Core (as catalog + citations)**; do the computing in GEE | Free Earthdata Login to download |
| 2 | **NASA Worldview** | Loaded Mistastin crater with ASTER GDEM relief + MODIS land temp | Behind it is **GIBS** (thousands of layers): MODIS/VIIRS land temp day & night, ASTER GDEM shaded relief, SRTM color, MODIS albedo, MERRA-2 dust, VIIRS Black Marble. Mistastin is crisp in relief. **Daily temperature tiles are cloud-patchy, so the scoring must use multi-year composites.** | **Core for the UI** (live Earth tiles) + slide visuals | No login |
| 3 | **NASA PDS** | Home + Geosciences node | Umbrella archive; the useful parts are the node pages below. A beta site now also searches ESA's Planetary Science Archive. | Gateway | No login |
| 4 | **LRO (PDS Geosciences)** | Opened LOLA, Mini-RF; browsed the LOLA data node; read the labels | **LOLA polar grids** (polar stereographic, int16, little-endian): `LDSM_85S_40M` slope (7584×7584; degrees = DN × 0.0015 + 45, so DN −30000 = 0°), `LDRM_85S_40M` **roughness** in metres (DN × 0.001; residual height scatter after a plane fit, 30–120 m baseline), `LDEM_85S/80S/75S_*` elevation (5–400 m; `LDEM_80S_40M` is 15200×15200). **Mini-RF** polar radar mosaics exist (CDR-MOSAIC). | **Core** (terrain); Mini-RF = stretch | No login |
| 5 | **LRO Diviner** | Opened the Polar Resource Product (PRP) and read its label + first rows | `dlre_prp_south.tab` (605 MB, comma-separated with a header row, 2.88 M mesh triangles from 75.9°S to the pole): `tri_clon, tri_clat, tri_calt, temp_avg` (annual mean, 2 cm depth, K), `temp_max` (annual max, surface, K), **`ice_depth`** (m; 0 = ice stable at surface; −999 = not stable within 2.87 m). Server supports range requests. Also GDR/PCP/RCP/GHRM products. | **Core** (thermal + ice) | No login |
| 6 | **CSA RCM** | Read dataset page | Some RCM products are open via EODMS (account + licence); oriented to maritime/disaster/ecosystem. | Skip for scoring | EODMS account |
| 7 | **CSA RADARSAT-1** | Dataset page → AWS registry → listed the bucket | 1995–2013 archive as **cloud-optimized GeoTIFFs** on AWS (`s3://radarsat-r1-l1-cog`, organized by year, **no AWS account needed**). Open Government Licence. NRCan opened a free processing service in Dec 2025. | Stretch: hero radar image of a Canadian site | None for AWS |
| 8 | **CSA SAR Python tutorial** | Read repo | Beginner plotting guide (GDAL + cartopy + QGIS; BC wildfire RCM example). Companion repo `asc-csa/radarsat1-scripts` = S3 access + lake-ice detection. | Use only if we add RADARSAT; attend the 11:00 CSA talk regardless | GitHub |
| 9 | **ESA Copernicus Data Space** | Home + its open catalog (428 collections) | `cop-dem-glo-30-dged-cog` (Copernicus DEM 30 m), **`sentinel-1-global-mosaics`** (monthly, terrain-corrected backscatter, VV/VH, 20 m, 2020→), Sentinel-1 GRD/SLC. Has openEO, JupyterLab; an MCP for openEO is on its roadmap. | **Core via GEE** (Copernicus DEM); S1 = stretch | Free account to download (same data in GEE) |
| 10 | **ESA Open Science Catalog** | UI list (no working text search) → scanned its metadata repo (366 products) | **ESA CCI Permafrost** (annual ground temperature + freeze/thaw, 2000–2019, north of ~16°N, built from MODIS LST; public Zarr on S3). Also CALIPSO dust optical depth, snow/ice products. | Tier 2: permafrost cross-check | Public |
| 11 | **JAXA G-Portal** | Browsed physical-quantity and spacecraft trees | GCOM-C/SGLI (land temp, snow, vegetation), GCOM-W/AMSR2 (soil moisture, snow), ALOS / **ALOS-2 PALSAR-2** (L-band radar). | **Use via GEE:** `JAXA/GCOM-C/L3/LAND/LST/V3`, `JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH` (HH/HV, 25 m, 2015–2024) | JAXA account to download (GEE avoids it) |
| + | **NASA Moon/Mars Trek** (not on the tab; NASA) | Hit three tile services | `LRO_WAC_Mosaic_Global_303ppd_v02`, `Mars_Viking_MDIM21_ClrMosaic_global_232m`, **`LRO_LOLA_Shade_SPole875_5mp_v04`** all respond (200) with open cross-origin access. | **Core for the UI** (live Moon/Mars tiles) | No login |
| + | **ASU Mars global data** | Browsed | THEMIS day/night IR, MOLA, TES thermal inertia/albedo/dust/minerals, Viking IRTM rock abundance. **Most downloads are colorized images, not raw values.** | Mars side: cite literature values instead of parsing color | No login |
| + | **GEE catalog check** | Queried catalog entries | Present: AG100 (`emissivity_band10–14`, `ndvi`), MOD11A2 (`LST_Day_1km`, `LST_Night_1km`, scale 0.02), NASADEM, Copernicus GLO30, EMIT L2A RFL, S1 GRD, PALSAR yearly, MCD43A3, MOD13A3, MOD10A2, VIIRS DNB annual, SMAP L4, SRTM landforms, WDPA, ESA WorldCover, GHSL pop, GCOM-C LST, MERRA-2 aer. EMIT L2B MIN wasn't under the ID I checked; assume it isn't there. | **The Earth engine** | GEE noncommercial project |

---

## 2. Verdict on the six concepts

| Concept | Verdict | Why |
|---|---|---|
| 1. Analog Mission Control | **Keep: it is the product shell** | Leaderboard re-rank + twin view is the core demo moment |
| 2. Rank Stability Lab | **Shrink to a panel** | Monte Carlo over weights is ~30 lines of TS; show win probability + rank spread per site; skip the particle extravaganza |
| 3. Hidden Twin Scanner | **Keep, as two-stage discovery** | It is the "surprise us" answer. Coarse global screen → fine features on the top ~1,000 cells, like real site selection |
| 4. Mission Portfolio Builder | **Tier 2** | Cheap once scores exist; produces the punchline "3-site campaign + what still needs a vacuum chamber" |
| 5. Seasonal re-rank | **Fold into site cards** as "best test window" | Monthly temperature/snow/circling-sun days per top site, not a full re-rank mode |
| 6. Validation Benchmark | **Promote to core** | Judges score Validity; blind rediscovery of known analogs is the strongest evidence we can show |
| Scale zoom | **Built in by default** (scale-matched at 40 m); multi-scale toggle = tier 3 | LOLA also has 120/240 m grids |
| **New A: real Artemis-region data** | **Core** | Diviner PRP + LOLA grids per region |
| **New B: ice-stability dimension** | **Core** | Diviner `ice_depth` ↔ Earth dry permafrost |
| **New C: circling-sun lighting** | **Core (cheap)** | Pure solar geometry; ties to rover vision/lighting tests (see 4.2) |

---

## 3. The project

**Working name:** Analog Mission Control (your call).
**One-liner:** a physics-matched search engine that ranks any place on Earth against real Artemis III region data, says exactly what matches and what breaks, proves itself by rediscovering known analogs blind, and surfaces new ones.

**Problem (from the analog catalog research):** analogs are picked one site at a time, by expert judgment, to match one finding (Río Tinto ↔ Opportunity, Dry Valleys ↔ Phoenix, Mistastin ↔ Artemis anorthosite). Limits are acknowledged per site, but there is no shared, quantitative, multi-dimensional, mission-specific way to compare sites. That is the gap the challenge points at.

**Five differentiators (say these in the pitch):**
1. **Physics-matched, not look-alike.** Each dimension compares the same physical quantity, computed with the same code, at the same baseline (40 m) over the same footprint (15×15 km, the size of an Artemis III region).
2. **Real Moon data, not literature values.** Every Artemis III region gets features from LRO Diviner and LOLA pixels.
3. **Comparability badges + provenance on every number:** A = same quantity & scale; B = same physics, different instrument; C = curated/literature. Judges can see how much to trust each match.
4. **It proves itself.** Hold-out test: do known analogs (e.g., Mistastin for lunar highlands) rank near the top when the engine doesn't know they're famous? Negative controls (forest, farmland) must rank at the bottom.
5. **Honest breakdowns with numbers.** Gravity, vacuum and radiation are always red; any dimension Earth can't reach is flagged with the gap size (e.g., "coldest Earth candidate is still X K warmer than the region's annual mean"; "even at 78°N the sun peaks ~20× higher than at the lunar pole").

---

## 4. Science design

### 4.1 Targets
- **Moon (tier 1):** the 9 current Artemis III regions (Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain), each ~15×15 km.
  - **Getting region boxes (Saturday, don't guess):** our earlier dataset brief lists PGDA product 104 (shape-from-shading DEMs for the original 13 regions). If its tile extents load, they give boxes for Haworth, Malapert, Nobile 1/2 and de Gerlache Rim 2. For the newer four, center a 15×15 km box on the named feature from the IAU Gazetteer of Planetary Nomenclature (Mons Mouton, Slater, Cabeus B) and label it "approximate."
  - **Grid choice:** regions sit within ~6° of the pole (to ~84°S), beyond the 85°S grids, so use `LDEM_80S_40M` (to 80°S) and compute slope and roughness ourselves. Use `LDSM_85S_40M` / `LDRM_85S_40M` as a cross-check where they overlap.
- **Mars (tier 2):** Jezero crater, with literature values (TES thermal inertia, TES/CRISM mineralogy: olivine, carbonates, clays) labeled class C. Hold-out validation: Lake Salda (Türkiye) and the Pilbara are known Jezero analogs.

### 4.2 Dimensions

| Dimension | Moon source | Earth source | Class | How matched | Breaks down when… |
|---|---|---|---|---|---|
| **Slope distribution** | LOLA `LDEM_80S_40M` box → `terrain.py` | Copernicus GLO-30 (ESA) box pulled from GEE at 40 m (375×375 px via `sampleRectangle`, under its 262,144-px limit) → **the same `terrain.py`** | A | Wasserstein distance between 0–45° histograms over the 15×15 km box | distance > threshold |
| **Roughness** | Same LOLA box → residual std after a 3×3 plane fit (`terrain.py`); `LDRM` only as sanity check | Same function on the Copernicus box | A | median + p90 difference | Earth too smooth / vegetated |
| **Thermal extremes** | Diviner PRP `temp_avg`, `temp_max` (region medians) | MOD11A2 2003–2023: mean annual LST, p95 day LST; cross-check JAXA GCOM-C LST | A (same unit, K) | Two scores: absolute fidelity (honest, often low) + "best achievable on Earth" percentile | Almost always for cold: report the K gap |
| **Ice stability** | Diviner `ice_depth` → fraction of region with ice stable ≤ 1 m | Permafrost proxy: mean annual LST < 0 °C; dryness via SMAP; ESA CCI Permafrost ground temp where available | B | "Buried stable ice under dry regolith" ↔ dry permafrost | Wet/active-layer permafrost, snow cover |
| **Circling-sun lighting** | Sun stays within ~±1.5° of the horizon at the lunar poles (axial tilt ~1.5°) and circles the sky | **Days/year with the sun up ≥ 20 h and peaking ≤ 35°** (solar geometry by latitude). Checked tonight: 0 days below 70°, ~50 at 75°, ~106 at 78°, ~138 at 80°, ~178 at 89° | A (geometry) | Days/yr + best months | Always partial: Earth's sun still peaks far higher; blue sky and scattered light |
| **Mineralogy (TIR)** | Highlands anorthosite: plagioclase-rich, quartz-poor, mafic-poor (literature) | ASTER GED AG100 bands 10–14 → Ninomiya indices: Quartz QI = b11²/(b10·b12), Carbonate CI = b13/b14, Mafic MI = b12/b13 (*check exact forms against Ninomiya et al. 2005*) + curated anorthosite-complex list | B/C | Ordinal match (low MI, low QI, no CI) + geology flag | Vegetation/soil cover masks rock |
| **Barrenness** (penalty) | 0 | MOD13A3 annual max NDVI; ESA WorldCover; MOD10A2 snow fraction | — | Penalty | NDVI high, water, permanent snow |
| **Logistics** | — | VIIRS night lights, GHSL population within 50 km, WDPA protected-area flag | — | Separate "Access" preset (not fidelity) | Protected / Indigenous lands → manual-permission note |
| *Radar (stretch)* | Mini-RF polar mosaic | JAXA PALSAR L-band HH/HV (GEE) or Sentinel-1 mosaics | B | Relative roughness class only | Different bands; flagged |
| *Mars thermal inertia (tier 2)* | TES TI (lit.) | Apparent thermal inertia = (1 − albedo)/(T_day − T_night) from MCD43A3 + MOD11A2 | B | Ordinal | — |

> Why the lighting metric changed: a first version ("hours with sun 0–5°") ranked the equator above 80°N because every sunrise counts. The circling-sun definition fixes that, and it yields a real finding: lunar-pole lighting is only approachable on Earth above ~75° latitude (High Arctic, Antarctica).

### 4.3 Scoring
1. Per dimension, a similarity score of 0–100 (from the distance metric above, scaled by a per-dimension σ taken from the spread across all candidates).
2. **TOPSIS** over dimensions with mission presets:
   - **Rover mobility:** slope, roughness
   - **Lighting / vision:** circling sun, roughness
   - **Ice & ISRU:** ice stability, thermal, barrenness
   - **Geology / sampling:** mineralogy, barrenness
   - **Construction:** low slope, low roughness
   - **Access:** logistics (shown separately so fidelity isn't mixed with convenience)
3. **Stability panel:** 10k weight samples (Dirichlet around the preset) → P(#1) and rank spread per site.
4. All scoring runs **client-side in TypeScript** from precomputed JSON, so sliders re-rank instantly.

### 4.4 Validation protocol (run it, report whatever happens)
- **Hold-out:** remove the "known analog" label from the 25 catalog sites, score them as ordinary cells among ~1,000 screened cells, and report each one's rank percentile for its natural target/preset (e.g., Mistastin under Moon + Geology; Haughton under Ice; Salda/Pilbara under Jezero).
- **Negative controls:** 10 boxes in rainforest, farmland, cities. These must land in the bottom decile.
- **Ablation:** drop one dimension at a time and show which one moves the ranking most (a tornado chart; this replaces the big Stability Lab).
- If a known analog ranks low, show it and explain why (e.g., "Mistastin's lake and vegetation penalize it"). That honesty scores on Validity.

### 4.5 Discovery (two stages)
- **Stage 1 (coarse, GEE):** 0.25° grid over land; mask out water, dense vegetation (NDVI max > 0.3) and ice-sheet interior. Cheap features: elevation std, mean annual LST, LST amplitude, NDVI, ASTER indices, circling-sun days. Score vs. each target → keep the top ~1,000 cells.
- **Stage 2 (fine):** full feature vector on a 15×15 km box at each surviving cell center (the `sampleRectangle` pulls run in the background; parallelize).
- **Novelty:** distance to the nearest known analog (catalog + PAAD). Show "Known" vs **"New candidate"** badges; the top-10 new candidates per target become cards.
- **A hypothesis worth testing, not a claim:** ice-free Arctic anorthosite exposures (e.g., Greenland/Labrador anorthosite complexes) could combine lunar-highland mineralogy with cold, permafrost and circling sun. Let the engine confirm or reject it.

### 4.6 Honesty layer
- Always red: gravity (1 g vs 0.166 g), atmosphere/vacuum, radiation.
- Data-driven red: any dimension below its threshold, with the numeric gap.
- Provenance tooltip on every value: dataset, version, date range, resolution.

---

## 5. Data pipeline (concrete)

```
pipeline/
  terrain.py           # ONE function: dem (2-D array, 40 m) → slope histogram (0–45°), roughness stats
                       #   used for BOTH Moon and Earth boxes, so the algorithm is identical
  01_moon_regions.py   # region boxes → regions.geojson (polar-stereographic + lat/lon)
  02_moon_lola.py      # read LDEM_80S_40M.IMG (np.fromfile '<i2', reshape 15200×15200,
                       #   apply SCALING_FACTOR/OFFSET from .LBL) → crop each box → terrain.py
  03_moon_diviner.py   # pandas.read_csv(dlre_prp_south.tab, chunksize=...) — header row is present
                       #   keep rows inside each region → medians of temp_avg/temp_max, ice fraction
  04_earth_gee.py      # per 15×15 km box: CopDEM @40 m via sampleRectangle → terrain.py;
                       #   GEE reducers for MOD11A2 stats, AG100 indices, NDVI, snow, VIIRS, GHSL, WDPA,
                       #   (GCOM-C LST cross-check); run on 25 catalog sites + 10 negative controls + stage-2 cells
  05_discovery_gee.py  # stage-1 grid export (Table → Drive/Cloud Storage)
  06_build_json.py     # merge → public/data/{targets,sites,cells}.json with provenance fields
```

- **Polar stereographic note:** use the projection offsets/scale in each `.LBL` (e.g., `LINE_PROJECTION_OFFSET=3791.5` for the 85S grid; radius 1737.4 km). Verify by checking that Shackleton's rim lands where Moon Trek shows it.
- **Footprint match:** Earth boxes are 15×15 km, exactly like the Moon regions.
- **Downloads (~1.3 GB):** `dlre_prp_south.tab` (605 MB), `LDEM_80S_40M.IMG` (462 MB), `LDSM_85S_40M` + `LDRM_85S_40M` (115 MB each). Start them Saturday at 10:00 so they finish during the CSA talk.

**JSON shape (per site):**
```json
{"id":"mistastin","name":"Mistastin Lake crater","lat":55.88,"lon":-63.31,"known":true,
 "features":{"slope_hist":[...],"rough_p50":0.0,"lst_mean_K":0.0,"lst_p95_K":0.0,
             "ice_proxy":0.0,"circling_sun_days":0,"QI":0.0,"CI":0.0,"MI":0.0,"ndvi_max":0.0,
             "night_lights":0.0,"pop50km":0.0,"protected":false},
 "provenance":{"lst":"MOD11A2 v061 2003–2023, 1 km", "dem":"Copernicus GLO-30 → 40 m"}}
```
(The feature numbers above are placeholders, not data.)

---

## 6. App (Next.js + TypeScript, static export to Vercel)

| Screen | What it shows | Libraries |
|---|---|---|
| **Mission select** | Target (Artemis region / Jezero) + preset → leaderboard animates into order | Framer Motion `layout` |
| **Leaderboard** | Rank, ▲▼ change, fidelity bar, A/B/C badges, Known/New badge, stability % | — |
| **Twin view** | Left: Earth box on GIBS (ASTER relief / true color). Right: Moon region on Trek LOLA shade. Below: overlaid slope histograms (Earth vs Moon) + radar chart | Leaflet / react-leaflet, Recharts |
| **Breaks-down strip** | Red/amber/green per dimension, with the gap | — |
| **Discovery globe** | Stage-1 heat cells + top-10 new candidates | react-globe.gl |
| **Validation panel** | Rank percentiles of hold-out analogs + negative controls + ablation tornado | Recharts |
| *Campaign builder (tier 2)* | Greedy set cover → 2–4 sites + "needs chamber" list | — |

**Tile endpoints verified tonight:** GIBS layers such as `ASTER_GDEM_Greyscale_Shaded_Relief`, `MODIS_Terra_Land_Surface_Temp_Day`; Trek `LRO_LOLA_Shade_SPole875_5mp_v04`, `LRO_WAC_Mosaic_Global_303ppd_v02`, `Mars_Viking_MDIM21_ClrMosaic_global_232m`. Read each layer's zoom levels and tile matrix from its WMTSCapabilities before wiring it.

---

## 7. Tiers (cut from the bottom if late)

- **Tier 1, must ship:** Moon regions with real LOLA + Diviner features · Earth features for 25 catalog sites + 10 negative controls · scoring + presets · animated leaderboard · twin view · breaks-down strip · validation panel · deployed URL.
- **Tier 2, should:** stage-1/2 discovery + top-10 new candidates · stability panel · campaign builder · Jezero target · GCOM-C/permafrost cross-checks.
- **Tier 3, stretch:** best-test-window cards · multi-scale toggle (40/120/240 m) · radar dimension · RADARSAT-1 hero image · LLM-written site narratives (disclose as AI).

---

## 8. Hour plan (venue 8:00–18:00 both days, evenings at home)

**Saturday**
- 08:00 Check-in. In the foyer, consider recruiting one teammate (front-end/design or storytelling); the judging guide recommends mixed skills.
- 09:00 Opening. Create the team project page the moment submission opens.
- 10:00 Repo + Vercel hello-world. Start the four PDS downloads. GEE auth test: pull one 15×15 km Copernicus box over Mistastin.
- 11:00 **CSA tutorial** (downloads run meanwhile). Ask CSA staff one question about RADARSAT/PALSAR comparisons; local judges may appreciate it.
- 12:00 Lunch. Build `regions.geojson` (PGDA 104 extents if available + Gazetteer centers).
- 13:00–15:30 `terrain.py`, `02_moon_lola.py`, `03_moon_diviner.py` → `targets.json`. **Checkpoint: one region's slope histogram plotted.**
- 15:30–18:00 `04_earth_gee.py` on catalog + negative controls → `sites.json`. Kick off the stage-1 export (runs while you travel).
- Evening: scoring engine + presets + leaderboard animation. **Checkpoint: re-rank works with real JSON.**

**Sunday**
- 08:00–10:00 Twin view (tiles + histograms + radar) and breaks-down strip.
- 10:00–11:00 Validation panel (hold-out + negative controls + ablation).
- 11:00–12:00 Stage-2 discovery cards (tier 2) **or** polish if behind.
- 12:00 **Feature freeze.** Deck: 7 slides (title & intro count toward 7). Record a GIF of the re-rank for slide 4.
- 13:00 **Sign up early** for local judging and present.
- 16:00 Awards. 18:00 leave.
- Evening: project page (summary, detailed description, NASA data list, partner data list, references, AI disclosure), FortiGuard classification for the Vercel URL, test every link in a private window, **submit by ~21:00** (deadline 23:59).

**Deck outline (7 slides):** 1 Title / team / challenge · 2 Problem (analogs picked one at a time) · 3 Method (physics-matched dimensions, A/B/C badges) · 4 Product (re-rank GIF + twin view) · 5 Validation results · 6 New candidates + where analogies break · 7 Impact + data used (NASA + ESA + JAXA + CSA).

---

## 9. How this maps to judging

| Criterion | What earns it |
|---|---|
| Impact | A reusable, open tool for any agency or analog program; campaign builder shows the real-world use |
| Creativity | Physics-matched comparability badges; ice-stability ↔ dry permafrost; circling-sun lighting; two-stage discovery |
| Validity | Real LRO data, same-code/same-scale metrics, hold-out validation, negative controls, ablation, explicit numeric breakdowns |
| Relevance | NASA data is the engine on both sides (LRO LOLA, Diviner, MODIS, ASTER GED, GIBS/Trek); targets are the actual Artemis III regions |
| Presentation | One clear demo moment (pick mission → sites slide into order → twin view proves the match) |

**For the submission form, NASA data used:** LRO LOLA polar GDRs, LRO Diviner PRP, MODIS MOD11A2 / MOD13A3 / MOD10A2 / MCD43A3, ASTER GED AG100, NASADEM (if used), SMAP, VIIRS night lights, GIBS/Worldview, Moon/Mars Trek, EMIT (if used). **Partner data:** ESA Copernicus DEM GLO-30, ESA CCI Permafrost, Sentinel-1 (if used), JAXA GCOM-C LST, JAXA ALOS PALSAR (if used), CSA RADARSAT-1 (if used).

---

## 10. Risks and fallbacks

| Risk | Fallback |
|---|---|
| GEE access not ready Saturday | AppEEARS requests for MOD11A2 + AG100 (slower); Copernicus DEM COGs read directly with rasterio |
| PDS download slow | The Diviner server supports range requests: fetch only the needed latitude band; use the 85S LOLA grids (115 MB) for regions south of 85° |
| Polar-stereographic math off | Validate against Moon Trek before trusting any region |
| Region boxes uncertain | Label "approximate"; show the box on the Trek tile so judges see it |
| Thermal never matches | Expected: show the K gap; it's part of the honesty story |
| Stage-2 pulls slow | Run in parallel batches; if needed, cap stage 2 at 300 cells |
| Time | Cut tiers 3 → 2; never cut validation |

---

## 11. Tonight (setup only, no project code)

- [ ] Toronto registration confirmed, Participant Agreement done, QR received
- [ ] Earthdata Login created
- [ ] Google Earth Engine: noncommercial Cloud project registered; `earthengine authenticate` works on your laptop
- [ ] Python env ready: `earthengine-api numpy pandas scipy matplotlib` (+ `rasterio` if reading COGs)
- [ ] Node + Next.js toolchain, Vercel account linked to GitHub
- [ ] Optional: Copernicus Data Space account (only if downloading S1 mosaics outside GEE)
- [ ] Bookmark: Diviner PRP folder, LOLA polar IMG folder, PGDA product 104, IAU Gazetteer, GIBS capabilities, Trek tile services
