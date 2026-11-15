# Earth analogs for the Artemis III Moon regions: first experiment

Run on 2026-11-14. Everything here was computed from real downloaded data (no synthetic inputs).
Scripts run in this order: `moon_regions.py` → `screen_climate.py` → `screen_terrain_coarse.py` → `download_tiles.sh` →
`refine_earth.py` → `rank_candidates.py` → `make_twin.py` → `validate.py` (data: `download_moon.sh`).

## What was done

| Step | Data (all open, no login) | Result |
|---|---|---|
| Moon fingerprints | LRO **LOLA** `LDEM_80S_40M` (40 m), **Diviner PRP** (temp, ice depth), USGS Artemis III region outlines | slope histogram, roughness, relief, mean temp, ice-stable fraction for all 9 regions (`results/moon_regions.json`) |
| Projection check | LOLA polar-stereographic formula from the build plan | Malapert massif median +4.4 km, Haworth floor −3.4 km, so not mirrored |
| Stage 1 (global climate) | **WorldClim 2.1** (not NASA): temp, precip, elevation | 22,444 land tiles → 2,316 cold/cool, dry, rugged tiles (−60° to 82°) |
| Stage 2a (coarse terrain) | **Copernicus GLO-30** overviews read remotely (~240 m) | 22,015 blocks of 20 km scored against each Moon region at the same scale |
| Stage 2b (fine terrain) | 102 full Copernicus tiles (3 GB), resampled to **40 m** | 5,108 overlapping 20×20 km blocks, same `common.py` slope/roughness code as the Moon |
| Stage 3 (environment gates) | **ESA WorldCover** 10 m, WorldClim, solar geometry | top 150 terrain blocks per Moon region; **gate v2**: bare + moss/lichen ≥45 %, snow/ice ≤10 %, water ≤5 %, trees/crops/built ≤5 % (470 of 1,350 pass; 320 are also >50 km from known sites). v1 (bare ≥60 %, top 50) is saved in `results/v1_strict_gate/` |
| Novelty | known-analog list: 26 from the project plan + 12 more (6 well-known extras, 6 added after a literature search) | picks must be >50 km from any listed site |

Terrain distance = mean of three terms, each divided by its median over all Earth blocks: slope-histogram Wasserstein distance,
|Δ median roughness|, |Δ ln relief|. Lower is closer (median block ≈ 1.1; best blocks 0.14–0.45). It is a relative score, not a percentage.

## The Moon side (real data)

| Region | slope p50 / p90 (°) | roughness p50 (m) | relief p5–p95 (m) | annual mean T (K) | max T median (K) | ice stable ≤1 m |
|---|---|---|---|---|---|---|
| Slater Plain | 8.3 / 16.7 | 0.76 | 1,180 | 110 | 232 | 56 % |
| Haworth | 10.0 / 17.9 | 0.90 | 2,250 | 105 | 245 | 64 % |
| Mons Mouton | 11.4 / 22.3 | 0.96 | 2,158 | 118 | 255 | 46 % |
| Nobile Rim 2 | 11.1 / 21.6 | 0.73 | 2,296 | 126 | 250 | 34 % |
| de Gerlache Rim 2 | 12.5 / 20.2 | 0.90 | 2,811 | 135 | 262 | 23 % |
| Malapert Massif | 17.7 / 25.8 | 1.11 | 3,130 | 142 | 277 | 22 % |
| Nobile Rim 1 | 17.7 / 26.5 | 1.21 | 4,419 | 128 | 270 | 35 % |
| Peak near Cabeus B | 19.2 / 25.8 | 0.94 | 3,238 | 153 | 288 | 30 % |
| Mons Mouton Plateau (4,452 km²) | 11.0 / 22.1 | 0.89 | 5,122 | 141 | 261 | 20 % |

## Three Earth regions that match (≥50 km from every site on my known list; gate v2)

Previews: `previews/twin_*.png` (Moon | Earth | slope-histogram overlay, same code, same 40 m baseline, same lighting). Numbers: `results/final_picks.csv`.

| | **1a. High Andes plateau** | **1b. High Andes massif** | **2. Kunlun / Hoh Xil margin** | **3. East Greenland (73.8°N 23.7°W; round-2 check: Hudson Land / Kejser Franz Joseph Fjord area, NOT Scoresby Sund)** |
|---|---|---|---|---|
| Block centre | −28.81°, −69.28° (Chile/Argentina) | −29.63°, −69.38° (~100 km south) | 36.73°N, 91.34°E (Qinghai) | 73.82°N, 23.68°W |
| Best Moon match | **Slater Plain** | **Malapert Massif** | **Slater Plain** | Slater Plain (weak) |
| Terrain distance | 0.16 | 0.22 (best block for Malapert) | **0.16** | 0.34 |
| Median slope (Moon / Earth) | 8.3° / 8.3° | 17.7° / 18.3° | 8.3° / 7.6° | 8.3° / 11.5° |
| Roughness p50 (m) | 0.76 / 0.72 | 1.11 / 1.12 | 0.76 / 0.67 | 0.76 / 0.87 |
| Relief (m) | 1,180 / 1,238 | 3,130 / 2,483 | 1,180 / **1,179** | 1,180 / 1,202 |
| Slope-histogram distance | 1.6° | 2.9° | 2.0° | 4.8° (p90 28° vs 17°) |
| Mean annual temp / precip | 3.2 °C / 108 mm | 2.3 °C / 138 mm | **−4.8 °C** / 150 mm | **−12.2 °C** / 456 mm |
| Surface (WorldCover) | 80 % bare, 20 % grass | 92 % bare | 50 % bare, **46 % alpine grass** | 22 % bare, **65 % moss/lichen**, 8 % snow |
| Circling-sun days/yr | 0 | 0 | 0 | **34** |
| Nearest site I know of | 203 km (Ojos del Salado) | 292 km (Ojos del Salado) | 181 km (Dalangtan, Qaidam) | 1,051 km (Lambahraun, Iceland) |
| What it is good for | closest terrain statistics to a Moon region found | the best Earth match for a steep massif | cold, dry, Moon-like relief at 4.3 km elevation | only candidate with both permafrost climate *and* some low circling-sun lighting |

Each pick has a different strength: **1** for terrain fidelity, **2** for cold with matching relief, **3** for high-latitude lighting. The v1 Kunlun/Altyn-Tagh block (36.64°N, 84.67°E, terrain distance 0.36, flat basin floor) is kept as a runner-up.

**Where the analogy breaks (numbers, not adjectives):**
- **Temperature:** the Moon regions have annual means of 105–153 K; the Earth blocks are 133–166 K warmer. Even Greenland (−12 °C) is 151 K warmer than Slater Plain.
- **Lighting:** circling-sun days are 0 at all Andes and Kunlun blocks. Greenland has 34, against about 365 on the Moon. Only latitudes above ~70° give any.
- **Surface:** blocks 2 and 3 are not barren. Block 2 is half grass, and block 3 is two-thirds lichen/moss tundra, which brings biology that the Moon lacks. The Andes blocks are the barrenest but the warmest.
- **Slope tails:** Earth has more flat ground and steeper slopes than the Moon (p90 19–31° vs 17–26°). The Moon is cratered; Earth is cut by water and ice.
- Always missing on Earth: 1/6 gravity, vacuum, radiation, regolith.

## Validation (`validate.py`, `results/validation.csv`)

The 26 known analogs and the plan's 10 negative controls went through the same pipeline: a 20×20 km block centred on each site, 40 m, same distance to
each Moon region. A site's percentile = share of the 5,108 discovery blocks whose best-of-9 Moon match is *worse*. "Would surface" = relief ≥ 300 m, passes the
surface gate, and ≥ 75th percentile. Run twice: strict gate (v1) and loosened gate (v2).

| | n | median percentile | ≥ 75th | pass gate v1 → v2 | would surface v1 → v2 |
|---|---|---|---|---|---|
| Negative controls (forest, farmland, cities) | 10 | **5** (max 38) | 0 | 0 → 0 | **0 → 0** |
| Known analogs, all | 26 | 25 | 4 | 7 → 11 | 1 → **2** |
| ...tagged "moon" in the plan | 10 | 17 | 1 | | |
| ...tagged "mars" | 13 | 27 | 2 | | |

- **Negative controls work:** all 10 are rejected under both gates. Known-vs-negative separation on the percentile is AUC 0.81.
- **Known analogs mostly do not rank high.** Only Mauna Kea (100th, terrain nearly identical to Mons Mouton), Wright Valley (93rd), Lost Hammer (78th) and HI-SEAS (76th) clear 75.
  Under gate v2 Mauna Kea and HI-SEAS surface. Lost Hammer still fails on 11 % snow (limit 10 %), and Wright Valley/Dome C cannot be assessed (WorldCover stops at −60°).
  The rest are flat or small-scale sites picked for geochemistry, craters under 1 km, or lava textures, which 20 km slope/roughness statistics cannot see.
  So this engine finds *terrain* analogs; it does not rediscover the existing set, and I should not claim it does.
- **Loosening the gate was worth it:** it recovered a validated site (Mauna Kea) at no cost on negatives, and produced the Kunlun-east and Greenland candidates.
  The cost is that blocks 2 and 3 are partly vegetated. A stricter or looser threshold would change which sites appear; I did not test other values.
- Ojos del Salado and Ladakh were not in the 26; the earlier 40/45 near-published-sites figure (v1) is post-hoc and weaker evidence than this table.

**Novelty claims are limited to my searches** (3 quick web searches plus a 38-site list). Regions 1, 2 and 3 are 181–1,051 km from the nearest site I know of; that does not mean nobody studied them.
Region 1 is in the same cordillera as Ojos del Salado, which is studied as a Mars analog. What's new is the quantified *lunar-terrain* match.
The Changtang block lies within ~66 km of ISRO's Hanle/Tso Kar sites, so it is a validation of the search (it found where ISRO already went), not a discovery.

## Limits of this first pass
- WorldCover covers only −60° to 82.75°, so **Antarctica and the far north** were excluded (ice sheets would otherwise look like rugged terrain).
- Climate is WorldClim air temperature and rainfall, not surface temperature (MODIS/ECOSTRESS need an Earthdata login). Mineralogy (ASTER) and ice proxies were not scored.
- The 102 downloaded tiles were chosen by terrain alone (top coarse blocks per Moon region, plus extra high-latitude and very cold picks), and the gate was applied afterwards. Tiles outside that shortlist were never fine-scored, so better blocks may exist.
- Terrain-first shortlist: the 102 tiles came from cold/dry/rugged screening, so a rugged hot-desert analog (e.g. Tibesti) was never scored.
- Moon roughness from 40 m LOLA is partly interpolated; Copernicus is a radar surface model (canopy/noise). Roughness values are comparable, not identical.
- Mars (Jezero) was not run. `download_data.sh` already fetches its DEM.

## Next steps worth doing
1. Test gate thresholds (e.g. ≥35 / 45 / 60 % rock-like) and report how the candidate list changes. Only 45 % was tried.
2. Add MODIS land-surface temperature and ASTER emissivity (Earthdata login or GEE) to score cold and mineralogy properly.
3. Re-run with Jezero as the target, and with Antarctic/Arctic rock masks (e.g. Landsat/Sentinel-2) to bring lighting into the match.
4. Inspect the three regions in Google Earth/Worldview before presenting them. Their bare fractions came from a 10 m map, not from my eyes.


---

# Round 3: more data, more categories, new places only (2026-11-14, evening)

## What was added
| Category | Data (no login) | Compared to the Moon with |
|---|---|---|
| terrain (slope histogram, roughness, relief) | Copernicus GLO-30 at 40 m vs LRO LOLA | same code (as before) |
| multi-scale roughness, Hurst exponent | same DEMs | LOLA-team "median differential slope" at 80-640 m |
| crater-like closed depressions | same DEMs | depression density / area / depth, same algorithm |
| landing / mobility | same DEMs | fraction of area under 5/10/15° slope |
| lighting under a low circling sun | same DEMs, horizon ray-marching | lit fraction, fraction in shadow at all azimuths, at sun 1.5/5/10° |
| circling-sun days (real latitude) | solar geometry | shortfall vs the Moon's ~365 |
| thermal + ice proxy | **NASA MODIS** Aqua LST/albedo/NDVI/snow (Planetary Computer), NASA POWER | shortfall vs LRO Diviner annual mean, ice-stable fraction |
| surface gate | ESA WorldCover (+ MODIS NDVI) | hard gate, bare+moss ≥45 % etc. |
| geology | Macrostrat lithology | "lunar-like" (anorthosite/gabbro/basalt) fraction, weak (68 % of blocks only have 1:5M map units) |
| radar | JAXA ALOS PALSAR L-band (Earth), LRO Mini-RF S-band (Moon) | characterisation only (different band, uncalibrated) |

Pool: 12,362 blocks (20×20 km, 235 Copernicus tiles). Per category, distance to a Moon region = |Earth−Moon| / pool median; one-sided categories count only the shortfall.
Composite = weighted mean (terrain 2, geology 0.5, rest 1). **Novelty:** a block counts as new only if ≥150 km from every site in `known_analogs_v2.csv` (155 rows) plus `known_analogs_v3_additions.csv` (11 rows).
Scripts: `feat_terrain_adv.py`, `feat_illum.py`, `feat_nasa.py`, `feat_geo.py`, `feat_radar.py` (built by parallel agents), `v3_run.py`, `v3_rank.py`, `v3_test.py`, `v3_twin.py`.

## Tests (`v3_test.py`, `results/v3_test_*.csv`)
- **Known vs negative controls (26 vs 10):** composite AUC 0.82, **the same as terrain alone (0.82)**. Negatives are easy. The new categories did not improve this separation.
- **Per category:** lighting 0.77, multi-scale roughness 0.75, terrain 0.82; craters 0.50, thermal 0.52, ice 0.44 (no validation support); geology 0.64, sun 0.60.
- **Ablation:** dropping lighting hurts most (AUC 0.82→0.78). Dropping the ice proxy changes 71 of the top 100 blocks, so rankings depend on a category that is not validated.
- **Catalog test:** only 9 pool blocks lie inside known Moon/both analog zones (too few to conclude); multi-scale roughness separates them best (AUC 0.85), terrain 0.77, composite 0.82.
- **Stability:** 1,000 random re-weightings; `p_top40` = share of draws in which a block is in the top 40.
- **Few known analogs rank high:** by composite percentile Mauna Kea (98th) and Wright Valley (85th) lead, then Salda (70th); most known analogs are not recognised by terrain statistics.

## Final shortlist (new only: ≥150 km from every known site; literature: nothing found by web search)
| Rank | Place (approximate; verify) | Block centre | Best Moon match | Composite | Stability | Nearest known site | Surface (WorldCover rock / MODIS NDVI / SAR HV) |
|---|---|---|---|---|---|---|---|
| 1 | **Ngari / western Tibet** (Zanda–Gerze area) | 32.46°N, 81.53°E | Slater Plain (also Haworth) | 0.53 | 0.87 | 243 km (Hanle, Ladakh) | 90 % / 0.12 / −26 dB |
| 2 | **Pamir, near Muztagh Ata** | 38.19°N, 74.80°E | Mons Mouton Plateau (also Nobile Rim 2, Haworth) | 0.53 | 0.87 | 514 km (Leh) | 91 % / 0.17 / −26 dB |
| 3 | **Southern Tibet north of the Himalaya** (Tingri / Dinggye / Sakya) | 28.10°N, 87.82°E | **Malapert Massif** (steep; also Cabeus B, Nobile Rim 1) | 0.57 | 0.20 | 405 km (Lower Mustang, Nepal) | 90 % / 0.15 / −21 dB |
Reserves: Zanda block (31.55°N, 80.63°E; composite 0.54, stability 0.86, but 70 % rock), southern Tibet (28.82°N, 86.51°E; 0.56).
Region 3 is the only new candidate that matches a *steep massif* Moon region, but its rank is sensitive to the weights (stability 0.20), so treat it as lower confidence.

## Dropped, and why
- **High Andes blocks (−28.5°, −69.3°)**: best composite (0.50, stability 1.00), but 42–63 km from Laguna Brava and Paso de Pircas Negras (added after the round-2 search) and in a cordillera with Mars/Moon analog programmes. **Not new**; the defensible claim is a new quantified lunar-terrain match.
- **Kunlun / Hoh Xil (36.73°N, 91.11°E)**: Dalangtan 187 km, adjacent analog use; only 55 % rock (rest alpine grass); stability 0.55.
- **East Greenland (73.82°N, 23.68°W)**: composite 0.75; snow in 96 % of MODIS composites; it is the only block with circling-sun days (34), but fails as a barren surface.
- **Central Tibet, Mongolia (D3, D4, F1)**: ~50 % grassland; weaker matches.

## Honest limits
- **Composite ≈ terrain at separating known analogs** (AUC 0.82 both). The extra categories add physical context and rule out surfaces, but I could not show that they improve the ranking. Craters and ice have no validation support.
- **Craters:** every Earth block has far fewer craters than the Moon (0.0–0.02 vs 0.1–0.2 per km²). Earth terrain is eroded, so that category always breaks.
- **Temperature and lighting:** the finalists average 271–278 K vs 105–153 K for the Moon and have 0 circling-sun days. No block closes either gap.
- **Illumination metrics:** shadow context is complete for the Ngari block (100 %) but only 62 % for the Pamir block and 64 % for southern Tibet, so their lighting scores are less reliable (76 % of all pool blocks are truncated). Horizons were computed on a 200 m grid.
- **Novelty is unproven:** "nothing found" rests on web searches only (no Google Scholar/ADS/CNKI; WebFetch was blocked in round 2, so no pages were opened, only search summaries). Place names are approximate. Prior art exists for terrain-similarity ranking of Earth sites against Moon/Mars (NHSJS 2026, arXiv 2501.08584); I could not read either.
- MODIS is Aqua only, thinned in time, at ~3.7 km; Landsat/Sentinel-2 verification (below) was added afterwards.
- Offline cross-check (MODIS NDVI ≤ 0.26, SAR HV −20 to −27 dB for all finalists) supports the surface gate. `results/v3_final_table.csv` and `results/v3_offline_surface_check.csv` hold the numbers; twin views are `previews/v3_twin_*.png`.


## Independent satellite verification (`feat_eo_verify.py`, `results/eo_verify.csv`, `previews/eo_*.png`)
Run after you approved network access. NASA/USGS **Landsat 8/9 Collection 2 Level-2** (primary) and ESA **Sentinel-2 L2A** (cross-check), both via Microsoft Planetary Computer:
cloud-masked median of the 8 clearest scenes per block from Nov 2023-Oct 2026, warm/snow-free season of each hemisphere, ~78 m pixels over each 20×20 km block.
Bare = not snow, not water, NDVI < 0.15. **Controls pass:** Amazon 100 % vegetated, Iowa 100 % vegetated, Dry Valleys rock + 35 % snow/ice + 7 % water, Mauna Kea 43 % bare dark volcanic (vegetation on the lower slopes).

| Block | Landsat bare | Sentinel-2 bare | Snow/ice (L / S2) | Verdict |
|---|---|---|---|---|
| D1 Ngari (32.46°N 81.53°E) | 82 % | 83 % | 0 / 1 % | **confirmed**, tan sparse-steppe desert |
| C1 Pamir (38.19°N 74.80°E) | 67 % | 78 % | 0 / 0 % | **confirmed with caveat**: WorldCover's 91 % rock overstated; 22-33 % sparse vegetation |
| B1 S. Tibet (28.10°N 87.82°E) | 68 % | 78 % | **20 / 10 %** | **conditional**: glacier in the SE corner, snow above the 10 % gate on Landsat |
| D2 Zanda (31.55°N 80.63°E) | 77 % | 65 % | 0 / 0 % | reserve, 23-34 % vegetated |
| B2 S. Tibet (28.82°N 86.51°E) | 78 % | 76 % | 0 / 4 % | reserve, 20 % vegetated, not steep |
| G1 Altyn-Tagh (36.64°N 84.67°E) | **96 %** | 95 % | 3 / 4 % | **cleanest surface**, but composite 0.58 and stability only 0.13 |
| A1-A3 High Andes | 93-96 % | 95-98 % | 0-3 % | barest of all (not new) |
| E1 Kunlun-Hoh Xil | **17 %** | 29 % | 5 / 5 % | **rejected**, 66-78 % vegetated alpine meadow |
| D3, D4 central Tibet; F1 W. Mongolia | 42-46 % | 34-79 % | 0-7 / 1-55 % | **rejected** (vegetated or snow) |
| H1 East Greenland | 26 % | 43 % | **49 / 20 %** | **rejected**, snow and glacier |

Mineral ratios (clay SWIR1/SWIR2 1.05-1.18, iron red/blue 1.7-2.1) barely differ between candidates, so they do not discriminate; only the Andes (19-41 % dark volcanic pixels) and Mauna Kea (100 %) look volcanic.
Landsat's NDVI ≥ 0.15 cut-off labels sparse alpine steppe as "vegetated", so its veg fractions are higher than Sentinel-2's for most Tibetan blocks (e.g. F1: 52 % vs 19 %).

**Final shortlist after verification:** 1 Ngari (D1), 2 Pamir (C1, with caveat), 3 southern Tibet (B1, conditional on its glacier corner). Reserves: Altyn-Tagh (G1), Zanda (D2), southern Tibet (B2).
