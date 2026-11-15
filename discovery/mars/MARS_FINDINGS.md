# Mars discovery: new Earth analogs for Mars exploration sites (separate from the Moon phase)

Run 2026-11-15. Everything for Mars lives in `discovery/mars/`. Moon data and results are in `discovery/` (not mixed). Main result file: `results/mars_final_table.csv`.

## 1. Result in one paragraph
Of 68,496 arid-land blocks (30 km, 200 m scale) screened worldwide, two places are our best **new** Mars analogs. Both match the ExoMars landing site **Oxia Planum** almost exactly in terrain (slope, relief) and albedo, are bare desert in Landsat/Sentinel-2 imagery, are 339-392 km from every one of the 251 catalogued analog sites, and have no block-level Mars-analog use in the web searches we ran.
Honest limits: our engine matches terrain, albedo, aridity, diurnal swing, pressure and lithology. It **cannot** match Mars temperature, pressure, thermal inertia or clay mineralogy, and its validation on known Mars analogs is weak for terrain and geology (see 6).

## 2. Final picks (approximate place names; verify on a map before presenting)

| | **1. Chagai / Taftan area, Pakistan–Iran border** | **2. Mazongshan / Beishan Gobi, Gansu–Mongolia border** | Wildcard: **Gerze, Ngari, northern Tibet** |
|---|---|---|---|
| Block id and centre | B28302, 28.46°N 62.31°E | B7719, 42.46°N 98.55°E | B19394, 32.87°N 83.32°E |
| Best Mars match | **Oxia Planum** | **Oxia Planum** | Jezero |
| Composite score (lower = closer) | **0.50** (best of the 269 gated candidates ≥150 km from known sites) | 0.52 | 0.61 |
| Stability* | 0.99 | 0.99 | 0.29 |
| Terrain distance (0 = identical) | 0.05 | 0.06 | 0.14 |
| Median slope at 200 m (Mars / Earth) | 0.49° / 0.42° | 0.49° / 0.52° | Jezero 1.95° / 2.33° |
| Relief p5-p95 (Mars / Earth) | 117 m / 117 m | 117 m / 142 m | Jezero 832 m / 611 m |
| Albedo (TES vs MODIS) | 0.195 / 0.20 | 0.195 / 0.20 | 0.178 / 0.20 |
| Earth mean surface T, diurnal range | 305 K, 32 K | 287 K, 29 K | 279 K, 32 K |
| Surface pressure (Mars ~0.7 kPa) | 93 kPa | 88 kPa | **57 kPa** (4,700 m) |
| Landsat / Sentinel-2 bare fraction | 100 % / 100 % | 100 % / 100 % | 84 % / 90 % (15 % veg.) |
| Nearest known analog site | 392 km (Dasht-e Lut kaluts, Iran) | 339 km (Valley of the Gobi Lakes, Mongolia; Hami/Dunhuang 330-410 km) | 407 km (Hanle, Ladakh) |
| Literature check | **nothing found** | weak adjacent (Gobi-wide tourism-grade use) | **nothing found** |
| Imagery | alluvial fans and a bright dry-lake playa | alluvial fans converging on a bright playa | red volcanic cone, dark lava |
*Stability = share of 1,000 random re-weightings of the categories in which the block stays in the top 30 candidates.

**Other candidates, not picked:** B8964 Ejin/Heihe Gobi (41.46°N 101.72°E; nothing found, dune field, albedo mismatch 0.23 vs Meridiani 0.13, stability 0.36); B58488 Ica/Nazca Peru (-14.40, -75.58; flat plain, 11 % vegetation, adjacent to the Atacama system); Iran Lut/Kavir margin blocks (adjacent to known Mars analogs); Tibesti and Saudi harrats (adjacent). Rejected after imagery: B9987 Gobi (irrigated oasis with an airfield, 18 % vegetation) and B58739 Peru coast (field/urban grid).

## 3. The four Mars sites we matched against (real data)
Source for terrain: USGS **HRSC+MOLA blended global DEM, 200 m** (ESA Mars Express HRSC + NASA MGS MOLA), read by HTTP range requests (nothing downloaded), 30×30 km window per site, same slope/roughness code as Earth.

| Site (window centre) | Slope p50 / p90 (°) | Roughness p50 (m) | Relief p5-p95 (m) | Mean elevation (m) | TES albedo | Night thermal inertia (tiu) | Key minerals (literature, class C) |
|---|---|---|---|---|---|---|---|
| Jezero (18.45°N 77.50°E) | 1.95 / 8.4 | 1.75 | 832 | -2,436 | 0.178 | 308 | Mg carbonate, olivine, Fe/Mg smectite, pyroxene |
| Oxia Planum (18.28°N 335.37°E) | 0.49 / 1.4 | 0.29 | 117 | -3,095 | 0.195 | 424 | Fe/Mg clays |
| Gale (-4.90°N 137.60°E) | 10.2 / 17.8 | 2.56 | 4,371 | -1,785 | 0.228 | 234 | clays, then sulfates |
| Meridiani (-1.95°N 354.47°E) | 1.07 / 3.1 | 1.01 | 91 | -1,397 | 0.132 | 190 | hematite, sulfates |

Jezero at 20 m (USGS CTX DEM): slope p50/p90 2.8° / 11.2°, roughness 0.14 m (not comparable with the 200 m values). Context rows with no open data stayed empty: dust cover index, rock abundance, annual mean and diurnal Mars temperature, a sourced surface pressure.

## 4. Data used, per source, and what we got
| Source | What we took | Used for |
|---|---|---|
| **USGS Astrogeology / NASA PDS** (MGS MOLA + ESA HRSC blend) | 200 m global Mars DEM windows | Mars terrain fingerprints |
| **NASA PDS** (Putzig & Mellon 2007 thermal inertia, via range reads) | thermal inertia, day and night, per site | Mars context (not matched to Earth: no equivalent measurement) |
| **USGS mosaic of NASA MGS TES albedo** (7.4 km) | albedo per site | albedo category |
| **Literature** (CRISM/OMEGA, site papers) | mineral lists, in-situ thermal inertia | lithology targets (class C) |
| **ESA Copernicus DEM GLO-30** | whole Earth arid terrain, 2,519 tiles read remotely at 200 m | Earth terrain, 68,496 blocks |
| **WorldClim 2.1** | precipitation/temperature screen | choose 2,583 arid tiles |
| **NASA MODIS (Aqua) via Planetary Computer** | land surface temperature day/night, albedo (MCD43A4), NDVI, snow | diurnal swing, albedo, vegetation gate, cold |
| **NASA POWER** | surface pressure, UV index, wind, humidity, precipitation | pressure, dryness |
| **Macrostrat** | lithology at 5 points per block | geology category (coarse) |
| **NASA/USGS Landsat 8/9 + ESA Sentinel-2** | cloud-masked median composites, 8 scenes each | independent surface check, mineral ratios, thumbnails |
| Catalogs and web searches | 251 known analog sites (166 Moon-phase + 80 Mars + 5 more) | novelty exclusion |

Of the 11 challenge resources, the Mars phase used NASA PDS (thermal-inertia data) and ESA Copernicus (the Earth DEM) directly, and reached NASA MODIS (an Earthdata product) through Planetary Computer. Not used: Worldview, the CSA resources, the ESA Open Science Catalog, JAXA G-Portal, and LRO/Diviner (Moon only). Mars DEM and albedo came from USGS Astrogeology mosaics of NASA (MOLA, TES) and ESA (HRSC) data, which are not on the list of 11.

## 5. Method (stages)
1. **Pool:** arid tiles (WorldClim precipitation ≤250 mm, |lat| ≤ 60°) → 2,583; remote 200 m read; 30 km blocks, 15 km stride, ≥95 % valid, relief ≥15 m → **68,496 blocks** (`mars_scan.py`).
2. **Stage A:** terrain distance (slope-histogram Wasserstein + roughness + ln relief, each ÷ pool median) to each Mars site; blocks within 100 km (or the catalog radius) of any known analog dropped (60,989 remain); top 120 blocks per site, ≥30 km apart → **480 shortlist** (`mars_stageA.py`).
3. **Enrich** shortlist + 64 validation sites: Macrostrat geology, MODIS/POWER (`feat_geo_generic.py`, `feat_nasa_generic.py`, built and tested by a helper agent).
4. **Composite** (`mars_rank.py`): terrain 2, geology 2, albedo 1, diurnal swing 0.5, dryness 1, vegetation 1, pressure 0.5, cold 0.5; one-sided categories count only the shortfall. Gate: MODIS NDVI ≤0.20 and snow ≤0.10 → 314 of 480 pass; 269 are ≥150 km from every known site.
5. **Verification:** Landsat/Sentinel-2 on the top 30 clusters + 4 controls; literature agent on 10 regions (`novelty_mars.md`).

## 6. Tests and what they say (`results/mars_test_*.csv`)
- **Known Mars analogs (54) vs negative controls (10):** composite AUC **0.85**. By category: diurnal swing 0.91, dryness 0.89, vegetation 0.89, pressure 0.85, albedo 0.43, cold 0.40, **terrain 0.33, geology 0.34**. The composite works because it recognises arid land; terrain and geology do **not** separate known Mars analogs from forests and farmland (they were chosen for salts, dunes and minerals, not 200 m slope).
- **Ablation:** dropping terrain raises AUC to 0.90; dropping dryness lowers it to 0.77; dropping albedo changes half of the top 100 blocks.
- **Known analogs rank low among the shortlist** (median 4th percentile), because the shortlist was built from terrain.
- **Stability:** the two picks stay in the top 30 in 99 % of 1,000 random weightings; the wildcard in 29 %.

## 7. Where the analogy breaks (numbers)
- **Pressure:** Mars ~0.6-0.9 kPa; our blocks are 88-93 kPa (wildcard 57 kPa). No Earth block is close.
- **Temperature:** Earth blocks average 279-305 K; Mars sites ~210-220 K. Diurnal LST range ~30 K vs a much larger Mars swing (Mars value not available in our data).
- **Thermal inertia:** Mars TI 190-424 tiu was sampled but cannot be compared with MODIS directly; not matched.
- **Mineralogy:** Macrostrat only resolves "siliciclastic" in these deserts, so Oxia's clay signal is unconfirmed; Sentinel-2 clay index ≈1.05 does not show a strong clay signature.
- **Craters and scale:** the 200 m DEM hides small-scale surface; Earth has no impact-crater population like Mars; Mars DEM at 200 m is partly interpolated from MOLA (463 m), so roughness is partly DEM noise.
- **Access:** both picks are remote border regions (Pakistan–Iran, Gansu–Mongolia); security/permit constraints were not assessed.

## 8. Limits of the novelty claim
"Nothing found" = web searches only (web searches by two helper agents; no Google Scholar/ADS/CNKI/Persian databases; some pages blocked). Block-level checks are weak: for Mazongshan the Gobi-wide tourism-grade Mars use and Hami/Dunhuang (330-410 km) are adjacent. Prior art for data-driven ranking of Earth sites against Mars exists (Flahaut et al. 2017 on Chilean salars; a Qaidam CNN paper; an NHSJS 2026 student paper); we could not read the last two.

## 9. Reproduce
```
cd discovery/mars
../.venv/bin/python mars_scan.py            # global arid pool (~4 min, network)
../.venv/bin/python mars_stageA.py          # needs results/mars_sites.json (Mars scout output)
../.venv/bin/python feat_geo_generic.py --blocks results/enrich_blocks.csv --out results/enrich_geo.csv
../.venv/bin/python feat_nasa_generic.py --blocks results/enrich_blocks.csv --out results/enrich_nasa.csv   # ~25 min
../.venv/bin/python mars_rank.py            # composite, tests, clusters
../.venv/bin/python feat_eo_verify_mars.py results/mars_final_blocks.csv    # Landsat/S2 (network)
../.venv/bin/python mars_twin.py            # twin views
```
Scripts import `../common.py`; run normally, not with `python -I`.

## 10. Next steps
Look at the picks in Google Earth; get Mars temperature/TES/THEMIS and CRISM summary maps for a real mineral match; add ASTER/EMIT mineral maps for the Earth blocks (needs an Earthdata login); rerun with more Mars sites (Mawrth Vallis, Holden, Nili Fossae); verify place names and the literature claims in the Persian and Chinese sources.
