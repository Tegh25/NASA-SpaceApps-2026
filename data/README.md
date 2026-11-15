# Terralog data contract

The app loads these files from `public/data/` at startup and validates them with the zod schemas in [`src/data/schemas.ts`](../src/data/schemas.ts). If a file fails validation, the app shows the file, the path inside it and the problem, for example `earth_cells.json -> values.slope_deg: length 5391 != count 5392`.

The files in the repo are now **real**: they are built from the discovery run (Copernicus GLO-30, LRO LOLA and Diviner, MODIS via Planetary Computer, NASA POWER, Landsat and Sentinel-2 checks) by `scripts/build_real_data.py`. No provenance block is marked `"mock": true`, so the "Demo data" ribbon is gone. The old synthetic generator (`npm run mock-data`) would overwrite them; do not run it.

## Rebuild

```
cd NASA-SpaceApps-2026
../discovery/.venv/bin/python scripts/build_real_data.py     # 1st: cards, targets, images, heightmaps
../discovery/.venv/bin/python scripts/build_twin_terrain.py  # 2nd, always after the first: Earth twins + `twin` fields
npx vitest run src/data      # validates every file against the zod schemas and physical ranges
```

Order matters: `build_real_data.py` wipes `public/data/heightmaps/*.json` and rewrites `featured_analogs.json` (without `twin`); `build_twin_terrain.py` then writes `heightmaps/earth/*.json`, adds `stats` to the Moon and Mars heightmaps and puts `twin` back on every card that has one. Both are deterministic given the same inputs.

Inputs. The research run is committed in-repo under `discovery/` (results, previews, notes); the scripts prefer it. Override with `TERRALOG_DISC=/path/to/discovery`. Some large raw inputs are not in git and are looked up in this order:
- `TERRALOG_TILES`, else `<DISC>/data/earth`, else `../discovery/data/earth`: Copernicus GLO-30 tiles for the Moon-body Earth twins (40 m). The Mars-scale twins use a local tile if present, otherwise read the same tile remotely from the open AWS bucket (`copernicus-dem-30m.s3.amazonaws.com`) with rasterio; the machine needs network for that.
- `TERRALOG_RAW`, else `<DISC>`, else `../discovery`: the folder that holds `data/moon/crops/*.npy`, `mars/data/*_dem200.npy` (Mars DEM windows), `mars/results/pool_blocks.csv`, and the previews and `results/validation.csv` not copied into the in-repo folder.
Writes `public/data/*.json`, `public/data/heightmaps/*.json` and `public/img/*.webp` (needs `/opt/homebrew/bin/cwebp`). Moon and Earth values are raw, rounded to about 3 significant digits; missing values are `null`.

### What is in the pack

- `features.json`: the 12 shared feature keys (see `docs/DESIGN.md`) with fixed norms that cover both Earth and Moon, e.g. `temp_mean_k` 80 to 320 K linear, `precip_mm_yr` 0 to 3000 log. `ice_proxy` and `temp_max_k` use different statistics on each body; the descriptions say so.
- `earth_cells.json`: 12,362 blocks of 20 by 20 km (`cellSizeDeg` 0.18) from 235 shortlisted Copernicus tiles (cold, dry, rugged areas only, not the whole Earth). `region` is a coarse hand-written bounding-box label.
- `targets.json`: 9 Artemis III Moon regions (computed from LOLA and Diviner) and 4 Mars landing sites (terrain at 200 m scale, so comparisons to 40 m Earth blocks are indicative; TES albedo and thermal inertia are quoted in the text as context; temperature, precipitation, vegetation and snow are null because no site value was sourced).
- `featured_analogs.json`: Moon cards (3 `new`, 2 `known` validation analogs, 3 `reserve`) and Mars cards (3 computed `new`, 6 computed `reserve`, 3 literature `known`).
- `heightmaps/<target-id>.json`: real 256 by 256 LOLA crops (40 m) for the Moon and 150 by 150 HRSC+MOLA windows (200 m, 30 km) for Mars. Moon crops are on the polar stereographic grid, not north-up. `heightmaps/earth/<site-id>.json`: the Earth twin of a card: 256 by 256 at 40 m (10.24 km) for Moon cards, 150 by 150 at 200 m (30 km, GLO-30 averaged to 200 m, north-up) for Mars cards. Both carry `stats` (45-bin slope histogram, p50, p90, relief).

### Optional fields added to `FeaturedSite` and `Target`

`FeaturedSite`: `body`, `kind` (`new`, `known`, `reserve`), `status`, `rank`, `why`, `images` (`twin`, `eo`, `target`, `earth`), `gaps` (label, earth, target, unit, note), `caveats`, `valueSource` (`computed` or `literature`), `stats` (free-form numbers). `Target`: `code`, `valueSource`.

`stats` keys on Moon cards: `composite` (lower is closer), `p_top40` (share of 1,000 random re-weightings in which the block stays in the top 40), `nearest_known`, `nearest_known_km`, `landsat_bare`, `s2_bare`, `landsat_veg`, `s2_veg`, `snow`, `s2_snow` (all shares are 0 to 1), `best_moon`, and `cat_*` category distances (lower is closer). Known validation cards carry `percentile` instead.

### Honesty notes

- "New" means at least 150 km from 166 catalogued analog sites and nothing found in web searches only. Place names are approximate, and prior art exists for ranking Earth sites against lunar terrain, so cards never say "unprecedented".
- No Earth block closes the temperature gap (about 250 to 297 K against 105 to 153 K) or the lighting gap (0 circling-sun days). Every card has `gaps` stating this with numbers.
- Mars computed cards (`valueSource: "computed"`) come from `discovery/mars/results/mars_final_table.csv` (9 finalists; composite over 8 categories against Jezero, Gale, Meridiani and Oxia; lower is closer). `kind: "new"` is the 3 picks named in `discovery/mars/MARS_FINDINGS.md` section 2 (each at least 150 km from 251 catalogued sites, no block-level Mars-analog use found; the Beishan Gobi pick has weak adjacent Gobi-wide use, stated on the card); the other 6 are `reserve`. The 3 literature cards (Atacama, Lake Salda, Rio Tinto) stay `kind: "known"`, `valueSource: "literature"`.
- Mars values are only real numbers: slope, roughness, relief, MODIS temperature and NDVI and snow, NASA POWER precipitation. Mars-side temperature and day-night swing have no sourced site value, so those `gaps` have `target: null` and say so. The Mars surface pressure (0.6 kPa) is a general figure, labelled as such. Mars terrain is the 200 m HRSC+MOLA blend (partly interpolated from 463 m MOLA).
- Mars `stats` keys: `composite`, `stability` (share of 1,000 re-weightings that keep the block in the top 30), `nearest_known`, `nearest_known_km`, `landsat_bare`, `s2_bare`, `landsat_veg`, `s2_veg`, `d_terrain`, `d_geology`, `d_albedo`, `d_swing`, `earth_albedo`, `mars_albedo`, `diurnal_k`, `pressure_kpa`, `elev_m`, `lithology`, `literature`, `best_mars`, `block_id`.
- `twin` on a card: `{ earthHeightmap, moonHeightmap }` (Moon, both 40 m) or `{ earthHeightmap, marsHeightmap }` (Mars, both 200 m). The Twin Terrain Lab takes block size and source labels from each heightmap's `width * metersPerPixel`.

| File | Required | Purpose |
|---|---|---|
| `features.json` | yes | Feature registry: the single source of truth for what is compared |
| `targets.json` | yes | Moon and Mars target sites |
| `earth_cells.json` | yes | Earth land grid, columnar |
| `featured_analogs.json` | yes | Curated analog sites with descriptions and tours |
| `heightmaps/<target-id>.json` | no | Terrain for the Target Viewer |

## General rules

- Values are **raw**, in the unit given in `features.json`. The app normalizes them.
- `null` (or an omitted key in `values` objects) means missing. Missing values lower a result's confidence; they do not count as a mismatch.
- Every feature key used in `targets.json`, `earth_cells.json` and `featured_analogs.json` should exist in `features.json`. Unknown keys are ignored.
- Every file may include a `provenance` block, which the Method page renders:

```json
{
  "mock": false,
  "datasets": [{ "name": "ERA5", "version": "v5", "dateRange": "1991 to 2020", "url": "https://...", "notes": "Monthly normals" }],
  "processing": "How the values were derived.",
  "generatedAt": "2026-11-14"
}
```

## `features.json`

```json
{
  "version": 1,
  "features": [
    {
      "key": "slope_deg",
      "label": "Mean slope",
      "unit": "deg",
      "group": "Terrain",
      "description": "Mean slope at 20 to 100 m baseline.",
      "norm": { "min": 0, "max": 35, "scale": "linear" },
      "higherIs": "steeper",
      "sources": ["LOLA", "MOLA", "Copernicus GLO-30"]
    }
  ],
  "provenance": {}
}
```

- `norm` sets the fixed range mapped to 0 to 1. Values outside it are clamped. `scale` is `linear` or `log` (log uses `log1p`, for skewed values such as precipitation or population).
- `group` controls the sections in the Fine-tune drawer.
- `unit` is shown next to values. `K`, `deg`, `mm/yr` and similar are fine; `index` or an empty string for unitless 0 to 1 values.

## `targets.json`

```json
{
  "targets": [
    {
      "id": "moon-shackleton-rim",
      "body": "moon",
      "name": "Shackleton Crater rim",
      "lat": -89.9,
      "lon": 129.0,
      "summary": "One line.",
      "whyItMatters": "2 to 4 sentences.",
      "values": { "slope_deg": 8.2, "temp_min_k": 40, "ice_signal": 0.7 },
      "heightmap": "heightmaps/moon-shackleton-rim.json",
      "sources": ["LOLA 20 m south polar DEM", "Diviner"]
    }
  ]
}
```

`body` is `moon` or `mars`. `heightmap` is optional and relative to `public/data/`.

## `earth_cells.json`

Columnar arrays, all with length `count`. Land cells only.

```json
{
  "cellSizeDeg": 0.5,
  "count": 3,
  "lat": [75.25, 75.25, 75.75],
  "lon": [-89.75, -89.25, -89.75],
  "values": {
    "slope_deg": [4.1, 5.3, null],
    "temp_min_k": [228, 229, 227]
  },
  "region": ["Nunavut, Canada", "Nunavut, Canada", "Nunavut, Canada"]
}
```

`region` is optional. Keep the file under about 8 MB; the host compresses it.

## `featured_analogs.json`

```json
{
  "featured": [
    {
      "id": "devon-island-haughton",
      "name": "Haughton Crater, Devon Island",
      "region": "Nunavut, Canada",
      "lat": 75.37,
      "lon": -89.68,
      "analogFor": ["moon-shackleton-rim", "mars-arcadia-ice"],
      "score": { "moon-shackleton-rim": 78 },
      "headline": "Polar desert impact crater with ground ice.",
      "description": "Curated paragraph(s).",
      "matches": ["Cold, dry polar desert"],
      "shortfalls": ["Earth gravity"],
      "values": { "slope_deg": 6.1 },
      "tour": {
        "spawn": { "lat": 75.37, "lon": -89.68, "heading": 90, "heightM": 1.7 },
        "waypoints": [{ "name": "Crater rim", "lat": 75.4, "lon": -89.7, "note": "Text." }]
      },
      "references": [{ "title": "Paper or page", "url": "https://..." }]
    }
  ]
}
```

- `analogFor` lists target ids. The first one is used for the comparison when no search is active.
- `score` is informational. The app always computes its own score from `values`.
- `tour` is optional; without it, "Enter site" spawns at `lat`/`lon`.

## Heightmaps

```json
{
  "width": 256,
  "height": 256,
  "metersPerPixel": 40,
  "minElevation": -2500,
  "maxElevation": 1800,
  "encoding": "int16-base64",
  "data": "..."
}
```

- `data` is base64 of little-endian signed 16-bit integers, row by row from the north edge, `width * height` values.
- Each integer `v` maps to elevation `minElevation + (v + 32768) / 65535 * (maxElevation - minElevation)` metres.
- At most 512 by 512.
