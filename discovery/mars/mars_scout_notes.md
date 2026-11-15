# Mars scout notes

## Datasets used (all open, no login)
- DEM: USGS Astrogeology HRSC+MOLA blended DEM global 200 m v2, https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif (11.4 GB, int16, geographic, sphere R=3396190 m, 296.37 px/deg). The old guessed path (mosaic/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif) 404s; real files live in subfolder mosaic/Mars/HRSC_MOLA_Blend/. Directory listing is only available via the S3 API: https://asc-pds-services.s3.us-west-2.amazonaws.com/?list-type=2&prefix=mosaic/Mars/ . Windowed vsicurl reads work; nothing downloaded.
- Windows resampled (bilinear) onto a local 150x150 grid at exactly 200 m (30x30 km), using cos(lat) for lon spacing. Script: terrain.py. Outputs data/<site>_dem200.npy, previews/mars_<site>.png, results/terrain_200m.json.
- Jezero 20 m: USGS/JPL M20_JezeroCrater_CTXDEM_20m.tif (reachable via vsicurl, 1500x1500 px window). Script: ctx.py. data/jezero_dem20.npy, results/jezero_20m.json. Note 20 m roughness p50 (0.14 m) is not comparable with 200 m roughness (scale dependent).
- TES albedo: https://planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif (8 ppd, sampled by albedo.py -> results/albedo_sampled.json).
- Thermal inertia (numeric, Putzig & Mellon 2007, PDS MGS-M-TES-5-TIMAP-V1.0): https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_{day,night}_2007.img (+ global_ti_msk_*_2007.img interpolation masks). 16-bit MSB, 7200x3600, 20 ppd. Read rows with HTTP Range requests (server supports it), no full download. Script ti.py -> results/ti_sampled.json. Interpolated pixels excluded.
- ASU TES TI / DCI / rock maps (mars.asu.edu/data) are COLORIZED RGB images only (DBmap2007.tif etc. are 3-band uint8 with no georeference); not used for values.

## Final product
results/mars_sites.json (build.py). Per site: terrain (200 m fingerprint) + context. Jezero also has terrain_20m_ctx.

## Not found / null
- Dust cover index (Ruff & Christensen 2002): only colorized image open; null.
- Rock abundance: no open numeric TES raster found (Viking IRTM colorized only); null.
- T_mean_K, T_diurnal_K: no open raster and no site value I could verify; null. Candidate sources for follow-up: Mars Climate Database, Gomez-Elvira 2014 (REMS, Gale), Martinez 2023 / Munguira 2023 (MEDA, Jezero).
- pressure_mbar: value null; the note holds a crude barometric ESTIMATE from DEM elevation (assumed P0 6.1 mbar, H 10.8 km) clearly labelled as not sourced. Do not use as data.
- Mineral lists and literature TI are search-result/abstract level (full papers not retrieved; several publisher pages blocked: PMC captcha, INTA connection refused, core.ac.uk 403). Meridiani TI 200/190 attribution to the NTRS URL is unverified; Gale 265-375 attribution is from an abstract snippet.

## Caveats
- Fingerprints are 200 m resampled products of a blend (HRSC where available, else MOLA-interpolated, ~463 m effective), so roughness at 200 m partly reflects DEM noise/interpolation (esp. Meridiani, Oxia).
- TES albedo 7.4 km pixels: only 25-30 px per 30 km window.
- TI is apparent TI at 3 km (heterogeneity averaged).
- Elevations are w.r.t. MOLA datum.
