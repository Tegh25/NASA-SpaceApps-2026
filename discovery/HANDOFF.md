# Handoff: Earth analogs for the Artemis III Moon regions (discovery phase only)

Written 2026-11-15. This is the cover note. The full method, tables and caveats are in `FINDINGS.md`. The candidate list is `results/v3_final_table.csv`.

## 1. One-paragraph summary
We searched 12,362 blocks of 20×20 km (235 Copernicus tiles, chosen from cold/dry/rugged areas, not the whole Earth) for terrain that matches the nine **Moon** south-pole regions of NASA's Artemis III landing candidates. (Mars was **not** run.) Each block was scored on 10 categories (terrain, multi-scale roughness, craters, landing slopes, shadow structure under a low circling sun, thermal, ice, circling-sun days, surface type, geology), filtered for bare-rock surface, and checked against 166 known analog sites so that only places ≥150 km from any of them count as "new". Three places survived, plus reserves. Their surface was then confirmed with Landsat 8/9 and Sentinel-2 imagery.

## 2. The sites we found

| # | Place (approximate, verify before presenting) | Block centre | Best Moon match | Composite (lower = closer) | Stability* | Nearest known site | Surface check (Landsat bare / S2 bare / snow) | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Ngari, western Tibet (Zanda–Gerze area) | 32.46°N, 81.53°E | Slater Plain (also Haworth) | 0.53 | 0.87 | Hanle, Ladakh, 243 km | 82 % / 83 % / ~0 % | **Confirmed** |
| 2 | Pamir, near Muztagh Ata | 38.19°N, 74.80°E | Mons Mouton Plateau (also Nobile Rim 2, Haworth) | 0.53 | 0.87 | Leh, Ladakh, 514 km | 67 % / 78 % / 0 % | Confirmed, with 22-33 % sparse vegetation |
| 3 | Southern Tibet, north of the Himalaya (Tingri / Dinggye) | 28.10°N, 87.82°E | **Malapert Massif** (steep; also Cabeus B, Nobile Rim 1) | 0.57 | 0.20 | Lower Mustang, Nepal, 405 km | 68 % / 78 % / 20 % (Landsat), 10 % (S2) | **Conditional**: glacier in one corner; ranking is sensitive to weights |
| R1 | Altyn-Tagh / south Taklimakan margin | 36.64°N, 84.67°E | Mons Mouton Plateau | 0.58 | 0.13 | Ruoqiang, 405 km | **96 %** / 95 % / 3 % | Reserve: cleanest surface, weaker match |
| R2 | Zanda, western Tibet | 31.55°N, 80.63°E | Mons Mouton Plateau | 0.54 | 0.86 | Hanle, 208 km | 77 % / 65 % / 0 % | Reserve: 23-34 % vegetated |
| R3 | Southern Tibet, second block | 28.82°N, 86.51°E | Mons Mouton Plateau, Nobile Rim 2 | 0.56 | 0.31 | Lower Mustang, 269 km | 78 % / 76 % / 0-4 % | Reserve: not steep |

*Stability = share of 1,000 random re-weightings of the categories in which the block stays in the top 40.

**Found but not counted as new (do not present as new regions):**
- High Andes, Chile/Argentina (~28.5°S, 69.3°W): best score and most stable, but 42-63 km from Laguna Brava and Paso de Pircas Negras and in a cordillera with Mars/Moon analog programs. Claim only "a new quantified lunar-terrain match".
- Kunlun / Hoh Xil (36.73°N, 91.11°E): 187 km from Dalangtan, and Landsat shows 66-78 % vegetated alpine meadow. Rejected.
- East Greenland (73.82°N, 23.68°W): the only block with circling-sun days (34/yr), but 20-49 % snow and glacier. Rejected. (An earlier label "Scoresby Sund" was wrong.)
- Central Tibet (31.6°N 83.3°E, 31.5°N 86.5°E) and western Mongolia (46.9°N 91.8°E): about half vegetated. Rejected.
- Changtang/Ladakh (33.4°N, 78.9°E): the engine found it independently, but ISRO already runs analog missions there. Not new.

## 3. The 11 challenge resources: what we used, how, and what we got

I never saw the Resources tab itself (it rendered blank in the browser). The 11 below are the list from `build-plan-v2.md`.

| # | Resource | Used? | What we took, and how | Where it is in the results |
|---|---|---|---|---|
| 1 | **NASA Earthdata Search** | **Indirectly** | Needs a login we cannot create. The same NASA MODIS Collection 6.1 products (MYD11A2 land surface temperature, MCD43A4 reflectance→albedo, MYD13Q1 NDVI, MYD10A2 snow, 2019-2023) were read anonymously through **Microsoft Planetary Computer**. NASA POWER climatology was also used. **Not used:** ASTER GED, EMIT, SMAP, NASADEM, ECOSTRESS, ICESat-2. | Earth thermal, ice proxy, albedo, snow, NDVI for every block: `results/feat_nasa.csv` |
| 2 | **NASA Worldview / GIBS** | **No** | Image tiles only; we needed numbers. Not used. | - |
| 3 | **NASA PDS** | **Yes (as the archive)** | Gateway to the LRO products below. LOLA came from the MIT mirror of the PDS archive, Diviner from the PDS Geosciences node, Mini-RF read remotely by range request. | see 4 and 5 |
| 4 | **LRO (LOLA, Mini-RF)** | **Yes, core** | **LOLA** `LDEM_80S_40M` (40 m elevation, 80-90°S): slope histogram, roughness, relief, multi-scale roughness (Hurst), crater-like depressions, landing fractions, and shadow structure for all 9 regions. The ready-made slope/roughness grids (LDSM/LDRM) were not used; we computed our own with the same code on Earth. **Mini-RF** S-band backscatter and CPR per region, **characterisation only** (different wavelength from Earth radar, uncalibrated). Region outlines: USGS Artemis III navigational grids. | `results/moon_regions.json`, `feat_terrain_adv_moon.csv`, `feat_illum_moon.csv`, `feat_radar_moon.csv` |
| 5 | **LRO Diviner (Polar Resource Product)** | **Yes, core** | `dlre_prp_south.tab` (605 MB): annual mean temperature, max temperature and water-ice stable depth for each region. Used as the thermal and ice targets (one-sided: Earth only loses points for being warmer than the Moon). | `results/moon_regions.json` (temp_avg, temp_max, ice fractions) |
| 6 | **CSA RCM** | **No** | Account/licence needed; oriented to maritime/disaster use. | - |
| 7 | **CSA RADARSAT-1** | **No** | Not needed for the ranking. | - |
| 8 | **CSA SAR Python tutorial** | **No** | Not needed. | - |
| 9 | **ESA Copernicus Data Space** | **Yes, core (partner data)** | **Copernicus DEM GLO-30** (30 m, resampled to 40 m), read from the open AWS bucket, not the portal. This is the whole Earth terrain side (235 tiles, ~8 GB). **Sentinel-2** was used via Planetary Computer for the surface verification. **Not used:** Sentinel-1 mosaics. | `results/fine_blocks.pkl`, terrain/illumination feature files |
| 10 | **ESA Open Science Catalog** | **No** | The ESA CCI Permafrost layer was not used. Ice/permafrost is a proxy from MODIS (fraction of observations below freezing). | - |
| 11 | **JAXA G-Portal** | **Indirectly** | JAXA **ALOS PALSAR-2** L-band radar (HH/HV, 2020 mosaic) read through Planetary Computer, **characterisation only**. **Not used:** GCOM-C land temperature. | `results/feat_radar.csv` |

**Used but not on the list of 11:** NASA/USGS **Landsat 8/9** (surface verification, via Planetary Computer); **ESA WorldCover** (surface gate); **WorldClim 2.1** (first global screen; a university product, not NASA); **Macrostrat** geology API (weak signal); the **USGS Artemis III** region outlines; **Google/web searches** for the 166-site known-analog catalog and the literature checks.

**What a teammate should say about NASA data:** the Moon side is entirely NASA (LRO LOLA, Diviner, Mini-RF). The Earth side is mostly ESA/JAXA/other (Copernicus DEM, WorldCover, PALSAR) plus NASA MODIS and Landsat. Of the 11 resources, 4 were used directly (PDS, LRO, Diviner, Copernicus DEM), 2 through another route (Earthdata's MODIS and JAXA's PALSAR, both read via Planetary Computer), and 5 not at all (Worldview, RCM, RADARSAT-1, the SAR tutorial, the ESA Open Science Catalog).

## 4. What we learned (including the awkward parts)
- **The extra categories did not improve validation.** Known analogs vs forests/farmland/cities: the 10-category composite separates them exactly as well as terrain alone (AUC 0.82 both). Lighting was the one new category that clearly helped (dropping it lowers the AUC to 0.78). The ice and crater categories have no validation support (AUC 0.44 and 0.50).
- **Most known analogs are not recognised by terrain statistics.** Only Mauna Kea (98th percentile) and Wright Valley (85th) rank high. The engine finds terrain look-alikes, not the established analog list.
- **No Earth block closes the temperature gap** (finalists ~271-278 K annual mean vs 105-153 K for the Moon regions) **or the lighting gap** (0 circling-sun days). Earth blocks also have far fewer craters (0.0-0.02 vs 0.1-0.2 per km²).
- **"New" is provisional.** It means ≥150 km from 166 catalogued sites and "nothing found" in web searches only (no Google Scholar/ADS/CNKI; page fetching was blocked, so only search summaries were read). Place names are approximate.
- **Prior art exists** for ranking Earth sites against Moon/Mars terrain (a 2026 NHSJS student paper; arXiv 2501.08584). We could not read them. Do not call the approach unprecedented.
- **Pool limits:** the 235 tiles were shortlisted by terrain, cold/dry climate and ruggedness, so hot deserts, Antarctica and the far north (WorldCover stops at ±82.75°, −60°) were not covered.

## 5. What to send
1. **`HANDOFF.md`** (this file) and **`FINDINGS.md`** (full method and tables).
2. **`results/v3_final_table.csv`**: the main result file (16 finalist blocks with every category score, stability, novelty distance and surface check).
3. **`results/eo_verify.csv`** + `previews/eo_contact_sheet.png`: the Landsat/Sentinel-2 verification.
4. **`results/moon_regions.json`**: the nine Moon fingerprints (the reference everything is compared to).
5. **`previews/v3_twin_*.png`**: Moon-vs-Earth side-by-side views for the finalists.
6. Optional, for reuse: `results/v3_candidates.csv` (every gated block with scores) and the five `feat_*.csv` files (12,362 blocks each), `results/v3_test_*.csv` (validation tests), `known_analogs_v2.csv` + `known_analogs_v3_additions.csv` (166-site catalog), `novelty_round2.md`.
7. **Do not send** `data/` (8 GB of downloaded tiles), `.venv/`, or the `.pkl` caches; they can be rebuilt with `download_moon.sh`, `download_tiles.sh` and the scripts.

A ready zip of items 1-6 is `discovery_handoff.zip` (next to the `discovery` folder).

## 6. How to reproduce
```
cd discovery && bash setup.sh && source .venv/bin/activate     # Python 3.13 venv
bash download_moon.sh                                          # LOLA, Diviner, region outlines, WorldClim (~1.3 GB)
python moon_regions.py                                         # Moon fingerprints
python screen_climate.py && python screen_terrain_coarse.py    # coarse global screen
bash download_tiles.sh results/stage2_tiles.txt && python refine_earth.py   # 235 tiles → 12,362 blocks
python feat_terrain_adv.py all; python feat_illum.py all; python feat_nasa.py run; python feat_geo.py; python feat_radar.py   # feature families (need network)
python v3_run.py && python v3_rank.py && python v3_test.py     # score, rank, test
python feat_eo_verify.py                                       # Landsat/Sentinel-2 check (needs network)
```
Run scripts normally (not with `python -I`; they import `common.py` from the same folder). Command names for the feature scripts follow the agents' reports; check each script's header if a flag differs.

## 7. Next steps if the team continues
1. Add **Mars** (Jezero DEM is already in `download_data.sh`) and re-score with the same categories.
2. Look at the three sites in Google Earth / Worldview before presenting, and verify place names.
3. Get real MODIS LST/ASTER/EMIT via Earthdata or Earth Engine for temperature and mineralogy.
4. Test other gate thresholds and re-screen tiles outside the current 235.
5. Read the prior-art papers and rewrite novelty claims accordingly.
