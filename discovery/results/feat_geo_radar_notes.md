# Geology + radar feature notes (no Earthdata login anywhere)

## A) Geology / lithology  (feat_geo.py -> results/feat_geo.csv, feat_geo_validation.csv)
- Source: Macrostrat API v2 `https://macrostrat.org/api/v2/geologic_units/map?lat=&lng=&response=long` (CC-BY 4.0, anonymous).
  Lith ids -> names/class from `/api/v2/defs/lithologies?all=true` (cached in results/_macro_liths.json).
  `mobile/map_query` returned empty for test points, not used. The `scale=` parameter returns empty for many places; omitting it returns
  units from all map scales (tiny 1:5M .. large), and we keep the most detailed scale that carries lithology info (column `best_scale`).
- Sampling: block centre + N/S/E/W at 7 km, rounded to a 0.05 deg grid, deduped: 43,142 API calls, 0 failures (cache results/_geo_cache.jsonl, resumable).
- Columns: frac_<cat> (share of units at the point(s) containing that category, mean over points), lith_main (category with the largest
  mass-weighted share; each unit's mass is split over its categories), lith_all (weights, sum to 1), lith_text (raw Macrostrat lith strings),
  is_* flags (1 if frac >= 0.25), lunar_like_frac / lunar_like_lith (= mafic volcanic [basalt, scoria, mafite, hawaiite...] + anorthosite/gabbro/norite/troctolite/
  diabase/dolerite/mafic plutonic; flag if >=0.25), age_ma (mean of unit mid-ages), n_points_ok, best_scale, priority_block.
  Categories also include other_volcanic (rhyolite/andesite/ash/generic volcanic), igneous_unspecified (generic "igneous/plutonic"), sedimentary_other.
  Text keyword fallback adds basalt/anorthosite/gabbro/granit* from the free-text field.
- Coverage: 12,344 / 12,362 blocks have lithology (18 = NaN, ocean/ice/no map). Priority set (best 400 per moon region by terrain_dist, union = 1,403 blocks): 1,403 / 1,403.
  Resolution of best available map: tiny(1:5M) 8,370 blocks (68 %), small 1,598, medium 2,020, large 356. **Most of the Earth set only has continental-scale
  lithology**, e.g. "intrusive igneous rocks" with no anorthosite/granite distinction -> treat is_* as coarse; anorthosite is rarely resolved.
- Block-level share with lunar_like_lith = 1: 7.1 % overall, 6.0 % of priority blocks.

Sanity (feat_geo_validation.csv): Mauna Kea mafic_volcanic (basalt/scoria) OK; Craters of the Moon mafic_volcanic (basalt) OK; HI-SEAS basalt OK;
Lambahraun basalt OK; Lanzarote basalt OK; Mistastin igneous_unspecified 0.8 / felsic_plutonic 0.2 ("undivided granitic rocks" - anorthosite NOT resolved by 1:5M map,
so not flagged lunar-like); Yungay felsic_plutonic (Granite, small-scale map; real site is mostly sedimentary/volcanic/salt - map resolution issue);
Rio Tinto sedimentary_clastic 0.33 / other_volcanic 0.25 / felsic 0.15 (mixed volcano-sedimentary, qualitatively right); Wright Valley dolerite (Ferrar) correct;
Dome C (Antarctic ice) NaN. Negatives (forest/farmland) = unconsolidated/sedimentary as expected.

## B) Radar
### Earth, L-band (feat_radar.py -> results/feat_radar.csv, feat_radar_validation.csv)
- Source: Planetary Computer STAC (anonymous, `planetary_computer.sign`), collection `alos-palsar-mosaic` (JAXA ALOS-2 PALSAR-2 annual mosaics,
  25 m, HH+HV, L-band, 1x1 deg COGs). Year 2020 (fallback 2021/2019/2018). Sentinel-1 RTC (C-band) NOT used (time-box; per-scene mosaicking heavy).
- Method: per 1x1 deg tile, HH and HV read once with out_shape 562x562 (~200 m; average resampling of DN amplitude via COG overviews), sigma0 dB = 10log10(DN^2) - 83;
  per block (20x20 km, clipped at tile edge) mean dB HH/HV, hv_hh_db (=HV-HH in dB), hh_db_std/hv_db_std (texture of 200 m pixels), hh_db_p10/p90, n_px, valid_frac, palsar_year.
- Coverage: 268 tiles, 266 OK (2 no_item); 12,245 / 12,362 blocks (priority 1,393 / 1,403); the rest NaN (tile with no item, or <25 valid px). Validation: 34/36 (Wright Valley -77.5 and Dome C -75.1 are outside mosaic).
- Sanity: forests HH -6.4 dB / HV -11 dB (as expected); farmland/deserts HH -12..-18, HV -20..-31; Craters of the Moon HH -10.7, HV -20.9.
- Caveat: Earth L-band (24 cm) quantities are not directly comparable with Moon S-band (12.6 cm) Mini-RF.

### Moon, S-band (feat_radar_moon.py -> results/feat_radar_moon.csv)  FEASIBLE
- Source: PDS Geosciences LRO Mini-RF global mosaics `https://pds-geosciences.wustl.edu/lro/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/128ppd/`
  (global_s1_128ppd_simp_0c.img, global_cpr_128ppd_simp_0c.img, PDS3, simple cylindrical, float32, 4.2 GB each - too large to download).
  Read only the window of each region through GDAL `/vsicurl/...lbl` (HTTP range requests, no login). Polygons from data/moon/regions/A3_9regions-lonlat-simplified.geojson (lon/lat).
- Columns: s1_mean/median (first Stokes parameter, uncalibrated linear power-like), s1_db_mean, s1_db_std (texture, 10log10 of S1), cpr_mean/median/p90, frac_cpr_gt1, valid fractions.
  All 9 regions have >=98.7 % valid pixels. Values: CPR mean 0.45 (HW) .. 0.63 (MA); frac CPR>1: 3 % (HW) .. 12.5 % (MA).
- S1 is NOT absolutely calibrated sigma0 -> no direct dB comparison with PALSAR; only relative radar texture/roughness (CPR, s1_db_std) is usable. Earth CPR can be formed from
  quad-pol only (not available in these mosaics) so Earth/Moon radar comparison is "characterisation only", class B at best.

## Files
feat_geo.py, feat_radar.py, feat_radar_moon.py; results/feat_geo.csv, feat_geo_validation.csv, feat_radar.csv, feat_radar_validation.csv, feat_radar_moon.csv;
helper/caches: results/_macro_liths.json, results/_geo_cache.jsonl, results/_feat_*.log.
