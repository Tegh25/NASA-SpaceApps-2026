# NASA Earth-observation feature family (no Earthdata login)

Script: `feat_nasa.py` (MODIS, `run` then `merge`), `feat_nasa_power.py` (NASA POWER extra), `feat_nasa_report.py` (sanity/Moon comparison; output in `logs/feat_nasa_report.txt`).
Outputs: `results/feat_nasa.csv` (12,362 blocks, key tile,r0,c0), `results/feat_nasa_validation.csv` (36 sites, key id). Per-MODIS-tile intermediates: `results/feat_nasa_tiles/`.

## Access (what worked / failed)
- Microsoft Planetary Computer STAC (`https://planetarycomputer.microsoft.com/api/stac/v1`), anonymous, `planetary_computer.sign_inplace`, COGs read with rasterio. WORKS, no login.
- NASA POWER climatology regional API (`power.larc.nasa.gov/api/temporal/climatology/regional`) WORKS, no login; limits: 10x10 deg box, 1 parameter per request (252 requests total).
- Failed/absent: `modis-MCD43A3-061` (true albedo) is not in PC -> albedo derived from MCD43A4 NBAR instead. Not tried (not needed): Earthdata/LP DAAC direct, GIBS.
- 52 MODIS sinusoidal tiles (31 for blocks + 21 extra for validation sites). 0 failed reads (52 x 183 = 9,516 COG reads).

## Datasets (all NASA MODIS Collection 6.1)
| feature(s) | PC collection | product | period / sampling | resolution |
|---|---|---|---|---|
| lst_day/night_*, lst_mean, p95/p05, amplitude, diurnal range, frozen_* | modis-11A2-061 | MYD11A2 (Aqua, 13:30/01:30 LT) LST_Day_1km, LST_Night_1km, scale 0.02 K | 2019-01..2023-12, every 5th 8-day composite (~47 dates) | 1 km, read at 4x overview (~3.7 km) |
| albedo_mean | modis-43A4-061 | MCD43A4 NBAR bands 1-5,7 -> Liang (2001) broadband shortwave albedo = .160b1+.291b2+.243b3+.116b4+.112b5+.081b7-.0015 | 8 dates evenly spread 2021-2022 | 500 m, 4x-overview |
| ndvi_max, ndvi_mean | modis-13Q1-061 | MYD13Q1 250m 16-day NDVI (x1e-4) | 2021, every other composite (12); ndvi_max = block mean of per-pixel max over the year | 250 m, decimated to 300x300 |
| snow_frac | modis-10A2-061 | MYD10A2 Maximum_Snow_Extent (200=snow / 25=no snow; others ignored) | 2019-2023, every 8th composite (~29) | 500 m, 4x-overview |
| power_ts_K, power_ts_amp_K, power_ts_min_month_K, power_t2m_K, power_t2m_amp_K, power_t2m_min_month_K, power_sw_dwn_kwh_m2_day, power_prec_mm_day | NASA POWER | TS (skin T), T2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR monthly/annual climatology (MERRA-2/CERES based, POWER default climatology period) | nearest ~0.5 x 0.625 deg grid point | coarse |

Block window: pixel centres within +-10 km (sinusoidal metres) of block centre (>=15, median 30 pixels). Blocks straddling a MODIS tile edge are clipped to the tile of their centre (n_pix_window < 25 flags this).

## Feature definitions
lst_day_mean_K / lst_night_mean_K: mean over window and dates. lst_mean_K = (day+night)/2. lst_day_p95_K / lst_night_p05_K: pooled pixel x date percentiles. lst_annual_amplitude_K: max-min of the 12 monthly means of ((day+night)/2) (needs >=9 months). lst_warmest/coldest_month_K likewise. diurnal_range_K = day - night mean. thermal_inertia_proxy = (1-albedo)/diurnal_range (NaN if range <=1 K). frozen_frac = fraction of valid (day+night) LST obs < 273.15 K (also _day, _night). snow_frac = snow/(snow+no-snow) valid composites. lst_valid_frac = fraction of non-cloud LST obs (QC). Raw extremes lst_day_max/night_min were dropped from the CSV (fill-value outliers ~1e-5 of pixels).

## Earth vs Moon (Diviner)
Moon regions temp_avg_K_median = 105-153 K; Earth lst_mean_K: min 249.1, p1 258.5, median 274.3, max 297.0 K. No Earth block is within 95 K of the Moon's mean temperature; 7 blocks <=250 K. Coldest 10 blocks are all Canadian Arctic (Ellesmere Is., ~78.5N, -79.5E; snow_frac 1.0, frozen_frac ~0.99, albedo ~0.7). Dome C validation site (not in block set) = 218 K. Moon temp_max p95 285-322 K overlaps Earth lst_day_p95_K (median 307, max 332 K), so only maxima/amplitudes/regime, not mean T, are Moon-comparable; use within-Earth rank/z-scores, not absolute matching of lst_mean.

## Sanity checks
- Yungay: day 319.8 K, night 280.9, amplitude 9.8 K, NDVI 0.10, snow 0, diurnal 39 K (hot, dry, huge diurnal range) OK. Dallol 314 K annual mean (hottest of validation set), Pilbara 307 K OK.
- Cold: Wright Valley 246 K, Haughton 252 K, Lost Hammer 256 K, Dome C 218 K (literature annual ~ -54 C = 219 K) OK; frozen_frac 0.87-1.0, snow 0.95-1.
- Wet/warm: Amazon 298 K, amplitude 3 K, NDVI 0.86, diurnal 6.5 K; Congo/Borneo similar OK. Negatives vs known sites: ndvi_max 0.70 vs 0.31, diurnal range 10 vs 18.5 K, albedo 0.145 vs 0.248.
- MODIS lst_mean vs POWER TS across blocks: r = 0.88, median diff +1.5 K (MODIS clear-sky warm bias); amplitude r = 0.85. POWER Dome C 217.4 vs MODIS 218.0 K.

## Caveats
- Aqua only (no Terra), temporal thinning, 4x-overview spatial decimation (~3.7 km LST pixels): block means robust, p95/p05 slightly smoothed; no per-pixel QC bit filtering (MODIS-flagged cloud = fill 0 only).
- LST is clear-sky only (warm/high-latitude winter bias); polar night composites in snow_frac are 'night' class and ignored (snow_valid_frac low at high latitude; 4 blocks NaN). ndvi_max is NaN only at the two fully ice-covered validation sites (Wright Valley, Dome C).
- Albedo is NBAR-reflectance-derived (nadir, not true black/white-sky albedo); snow-covered sites may be biased.
- thermal_inertia_proxy has weak discriminating power (explodes where diurnal range is tiny, e.g. snow/ice/humid); better use diurnal_range_K and albedo separately.
- Fine_blocks cover 51S-80N and are apparently pre-screened (no hot Sahara etc.), so absolute coverage of extremes is limited.
