# Terralog redesign: "Survey Console"

The brief (REDESIGN_PROMPT.md) asks for futuristic mission control. Our twist, so it is not another dark SaaS dashboard: the app is an **instrument with a hand-annotated layer**. Precise hairline consoles, mono numbers and a living globe, and on top of that a "grease-pencil" layer in a warm chalk-yellow handwritten face (Caveat) that circles the selected site, scribbles the gap ("still 130 K too warm"), and arrows to the Enter button. It is our teammate's hand sketch, made real. Use the pencil layer sparingly: one or two notes per screen, never for core data.

## Tokens (defined in `src/index.css`, use the CSS variables)

| Token | Value | Use |
|---|---|---|
| `--void` | #05070C | page background, behind the globe |
| `--hull` | #0B111B | solid panels (`.console`) |
| `--deck` | #101A28 | raised rows, hover |
| `--rule` / `--rule-hi` | #1C2A3D / #2B3D56 | 1 px hairlines, slider track |
| `--ink` / `--dim` / `--faint` | #E6EEF6 / #8B9BB0 / #56657A | text scale |
| `--moon` | #9EE7F2 | Moon accent (silver-cyan) |
| `--mars` | #FF7A3D | Mars accent (ember) |
| `--accent` | follows `data-body="moon|mars"` on any ancestor | rings, pins, slider fill, focus, active glow |
| `--pencil` | #F3E3A2 | hand annotations only (`.hand`) |
| `--good` / `--mid` / `--bad` | #4FE0B0 / #F2C14E / #FF5D73 | match, partial, gap |

Type: `font-display` (Space Grotesk) for headings and logo; Inter body; `.num` (JetBrains Mono, tabular, slashed zero) for **every** number and coordinate; `.hand` (Caveat) for annotations. Sentence case everywhere. No ALL-CAPS eyebrow labels, no "→" on buttons, no middle-dot meta strings.

Utility classes: `.console` (solid panel with two accent corner brackets), `.notch` (cut top-right corner, use on the right panel and hero only), `.panel` (glass, only where it floats over the globe), `.texture`, `.grid-paper`, `.glow-active`, `.rise-in` (set `style={{'--i': n}}` for stagger), `.draw` (SVG stroke draw-on, set `--len`), `input.metric` (themed range; set `style={{'--fill': '40%'}}`).

Radius: 2 to 4 px on panels, full round only for the score ring, pins and the Go/Enter button. Motion: 200 to 300 ms `var(--ease-out-quint)`; one orchestrated entrance (cards stagger in, rings count up). All motion is disabled under `prefers-reduced-motion` by the global rule.

## Layout (desktop >= 1024 px)

```
| 320 px left rail | globe (flex) | 400 px right panel |
```
- The globe is full-bleed behind everything (`App.tsx` already mounts it). The rails sit on top with a solid `.console` background, so the globe is visible only in the middle column. The HUD lives in the middle column.
- Left rail: logo, Moon/Mars segmented toggle, 2 to 5 location cards, "More candidates" link, footer link to Method.
- Right panel: Find (no site selected) or Explore (`/site/:id`), one panel with a back arrow.
- Mobile (< 768 px): globe full screen, cards become a horizontal snap carousel pinned at the bottom, right panel becomes a bottom sheet with a drag handle (collapsed 30 %, expanded 85 %).

## File ownership during the build (parallel agents; do not edit others' files)
- Data: `scripts/build_real_data.py`, `public/data/*`, `public/img/*`, `src/data/realData.test.ts`, `data/README.md`.
- Globe: `src/globe/*` (incl. new `GlobeHud.tsx`), `src/lib/camera.ts`.
- Shell + left rail: `src/App.tsx`, `src/pages/Home.tsx`, `src/ui/left/*`, `src/ui/kit/*`, `src/lib/cards.ts`, `src/state/store.ts` (additive only).
- Right panel: `src/ui/right/*`.
- Backend + parser + method + tour: `api/*`, `vite.config.ts`, `src/parse/*`, `src/pages/Method.tsx`, `src/tour/*`, `README.md`.
- Shared, already written: `src/index.css`, `index.html`, `src/data/schemas.ts` (FeaturedSite gained `body, kind, status, rank, why, images, gaps, caveats, valueSource, stats`; Target gained `code, valueSource`).

## Feature keys (the data contract for sliders, parser and scoring)

| key | label | unit | Earth source | Moon source |
|---|---|---|---|---|
| `slope_deg` | Median slope | deg | `v3_candidates.slope_p50` (40 m) | `slope_p50` |
| `roughness_m` | Roughness | m | `rough_p50` | `rough_p50` |
| `relief_m` | Relief | m | `relief_m` | `relief_p5_p95_m` |
| `flat_frac` | Landing-flat share (< 10 deg) | 0 to 1 | `feat_terrain_adv.frac_slope_lt10` | `feat_terrain_adv_moon.frac_slope_lt10` |
| `crater_density` | Crater-like pits | per km² | `dep_per_km2` | `dep_per_km2` |
| `shadow_frac` | Shadowed share, sun 1.5 deg | 0 to 1 | `feat_illum.psr_frac_1.5` | `feat_illum_moon.psr_frac_1.5` |
| `temp_mean_k` | Mean surface temperature | K | MODIS `lst_mean_K` | Diviner `temp_avg_K_median` |
| `temp_max_k` | Max surface temperature | K | MODIS `lst_day_p95_K` | Diviner `temp_max_K_median` |
| `ice_proxy` | Ice / frozen-ground proxy | 0 to 1 | MODIS `frozen_frac` | Diviner `ice_stable_any_frac` |
| `precip_mm_yr` | Precipitation | mm/yr | POWER `power_prec_mm_day` × 365 | 0 |
| `vegetation_ndvi` | Vegetation (NDVI max) | index | MODIS `ndvi_max` | 0 |
| `snow_frac` | Snow cover share | 0 to 1 | MODIS `snow_frac` | 0 |

Find-panel sliders (default visible): `temp_mean_k`, `precip_mm_yr`, `slope_deg`, `roughness_m`, `ice_proxy`, `vegetation_ndvi`. The rest live under "Advanced".
