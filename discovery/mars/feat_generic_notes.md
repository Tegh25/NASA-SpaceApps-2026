# Generic block features (Mars-analog screening)

Two scripts, same input: a CSV with columns `id,lat,lon` (block = 30x30 km square centred there). Run from `mars/`; no logins.

```
../.venv/bin/python feat_geo_generic.py  --blocks results/test_blocks.csv --out results/test_geo.csv  [--threads 4] [--off-km 10] [--max-minutes 0]
../.venv/bin/python feat_nasa_generic.py --blocks results/test_blocks.csv --out results/test_nasa.csv [--workers 8] [--thin 5] [--no-power] [--no-modis]
```
Both are resumable: rerun after an interruption and cached work is skipped. Outputs of the test run: `results/test_geo.csv`, `results/test_nasa.csv`. Join on `id`.

## feat_geo_generic.py (Macrostrat)
- Samples centre + N/S/E/W at 10 km, snapped to a 0.05 deg grid, deduped across all blocks, one API call per unique point. Cache `results/_geo_cache.jsonl` (Moon cache untouched); lithology definitions `results/_macro_liths.json`.
- At each point only the most detailed map scale carrying lithology is used (`best_scale`: large > medium > small > tiny). Each map unit has mass 1, split over the classes it contains; fractions are averaged over points and sum to 1.
- Columns: `lith_main`, `lith_all` (class:frac;...), `lith_text` (raw Macrostrat strings), `frac_<class>`, `age_ma`, `best_scale`, `n_points_ok` (0-5).
- Classes: mafic_volcanic (basalt, scoria, mafite etc. plus gabbro/diabase/dolerite/norite/anorthosite), felsic_volcanic_plutonic (rhyolite, andesite, tuff, granite, diorite; GENERIC volcanic/plutonic/igneous also land here unless the free text says basalt/mafic), ultramafic, clay_rich_sedimentary (shale, mudstone, claystone, clay, mud, argillite, bentonite), evaporite (gypsum, halite, anhydrite, trona; text playa/salar/salt), carbonate, sand_eolian (sand, loess; text dune/eolian), alluvium_unconsolidated (alluvium, colluvium, gravel, till, regolith, soil, peat), siliciclastic_other (sandstone, siltstone, conglomerate, breccia, generic sedimentary), metamorphic, other (chert, ironstone, coal ...).

## feat_nasa_generic.py (MODIS + POWER)
MODIS (Aqua, Collection 6.1, Planetary Computer COGs, same method as `../feat_nasa.py`): window = pixels within +-15 km of centre (~64 pixels of ~3.7 km; 4x-overview reads).
| column | definition |
|---|---|
| lst_day_mean_K / lst_night_mean_K | MYD11A2 LST day (13:30) / night (01:30), 2019-2023, every 5th 8-day composite (~47 dates), mean over window and dates |
| diurnal_range_K | day - night |
| lst_mean_K | (day + night) / 2 |
| lst_annual_amplitude_K | max - min of 12 monthly means of (day+night)/2 (NaN if < 9 months valid) |
| albedo_mean | MCD43A4 NBAR bands 1-5,7 -> Liang 2001 broadband shortwave albedo, 8 dates 2021-22 |
| ndvi_max | MYD13Q1 2021, window mean of per-pixel annual max |
| snow_frac | MYD10A2 snow/(snow+no-snow) composites, 2019-2023 |
| lst_valid_frac, n_pix_window, modis_tile | QC (fraction non-cloud LST obs; pixels in window; sinusoidal tile) |

POWER (point climatology API, community RE, annual mean of the climatology, nearest 0.5 x 0.625 deg MERRA-2 cell; one call per unique cell, cache `results/_power_cache.jsonl`; `power_cell` = cell centre used):
`ps_kpa` (PS), `uv_index` (ALLSKY_SFC_UV_INDEX), `ws10m` (m/s), `rh2m` (%), `t2m_K` (T2M+273.15), `precip_mm_day` (PRECTOTCORR), `sw_dwn_kwh_m2_day` (ALLSKY_SFC_SW_DWN), `ts_K` (skin T), `elev_power_m` (mean cell elevation, returned by API).
-999 fill values are set to NaN.

Caching: per-MODIS-tile summary rasters in `results/_modis_tiles/hXXvYY.npz` (~2.8 MB each); any later block list in an already-read tile is instant. Blocks are grouped by tile; there is no per-block network call for MODIS.

## Test results (13 blocks, `results/test_blocks.csv`; Tibet 35.5N 91.4E added as a high-elevation check)
- Yungay: LST day 319 K / night 281 K (range 38 K), NDVI 0.10, precip 0.02 mm/d, RH 44 %: hot, dry, no vegetation. OK.
- Amazon: lst_mean 298 K, amplitude 2.7 K, NDVI 0.86, precip 6.4 mm/d, RH 88 %, lst_valid_frac 0.71 (cloud). OK.
- Danakil 313.5 K and Dasht-e-Lut 306 K lst_mean (day means 323.5 / 323.9 K): very hot. OK.
- Pressure vs elevation: Tibet (4981 m) 55.2 kPa, Qaidam (3015 m) 70.6, Meteor Crater (1915 m) 80.9, sea-level sites 100-102. OK.
- Wright Valley 246 K, snow_frac 1.0, albedo 0.39, ndvi NaN (ice); Mauna Kea basaltic (mafic 1.00); Wright Valley dolerite/till mix (mafic 0.5); Lake Eyre mixed evaporite/clay/sand/alluvium; Meteor Crater carbonate/sandstone/claystone (large-scale map); Amazon clay/sand/alluvium/peat. Rio Tinto felsic volcanic 0.60 plus clay/siliciclastic.
- Weak: Dubai, Dasht-e-Lut, Qaidam, Tibet, Namib resolve only to 1:5M/1:1M "sedimentary rocks" (siliciclastic_other 1.0); Yungay/Danakil show "granite/volcanic + siliciclastic" (coarse map).

## Timing
- Geo: 65 unique points for 13 blocks in 1.6 s (4 threads) -> ~0.12 s/block uncached (~5 unique pts/block, fewer when blocks cluster). 300 blocks ~40 s, 1000 blocks ~2-3 min.
- NASA: ~19 s per new MODIS tile (183 COG reads, 8 workers) + ~0.3 s per new POWER cell. Test: 13 blocks / 12 tiles = 230 s total (17.7 s/block); a rerun of cached tiles takes 0.8 s. Cost is driven by the NUMBER OF DISTINCT MODIS TILES, not blocks. Spread-out worst case: 300 blocks ~95 min, 1000 blocks ~105 min at most (~330 land tiles exist, 21-30 s each incl. STAC searches). Clustered lists are much faster (e.g. 300 blocks in ~80 tiles ~ 25 min). Disk: ~2.8 MB per tile (<1 GB globally). Can raise `--workers` or run two processes on disjoint block lists (separate tiles) to speed up.

## Caveats
- Macrostrat: most of the world only has 1:5M-1:1M maps (check `best_scale`); lithology is coarse, generic igneous is assumed felsic, "sedimentary rocks" is siliciclastic_other. Blocks over ocean/ice return NaN (`n_points_ok` 0). Mass fractions are by map-unit count, not area.
- LST: clear-sky only (warm / polar-night bias), Aqua only, thinned in time, ~3.7 km pixels (block means are robust, extremes are smoothed). LST amplitude at polar sites inflated by missing winter data. Albedo derived from nadir NBAR, not true albedo; snow-covered blocks biased. `snow_frac` NaN when only polar-night composites exist. Window clipped at MODIS tile edges (`n_pix_window` < ~50 flags coastline/edge). Windows are ~30 km vs the 20 km of the Moon scripts.
- POWER is ~50 km MERRA-2: `ps_kpa`, `t2m_K` and `rh2m` refer to the cell-mean elevation (`elev_power_m`), which can differ by 1 km or more from the block in steep terrain (e.g. Dallol, -125 m real vs 1063 m cell -> ps 89.5 kPa too low; Qaidam cell elevation 3015 m). Use a DEM + hypsometric correction if pressure matters. `uv_index` is the all-sky UV index climatology (can be NaN at high latitudes). Earth values are annual means; Mars comparisons should use ranges/regimes, not absolute matching.
- Longitude in the Macrostrat/POWER requests is wrapped to -180..180; blocks within ~15 km of the antimeridian or the poles are only roughly handled.
