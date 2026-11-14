# Terralog: Product & Build Guide

Working title: **Terralog**
Audience: a coding agent that will build the app, plus teammates who supply data.
Event context: NASA Space Apps Challenge 2026, challenge "Permanent Moon Base Locations and Mars". Hackathon runs Nov 14 to 15, judging begins Nov 16.

---

## 1. Product summary

Terralog is a browser-based search and simulation platform that helps people find places on Earth that resemble a candidate Moon base site or Mars landing and exploration site, then explore those places in a street-view-style 3D experience.

The challenge objective is to "identify and characterize one or more locations on Earth that could serve as useful analogs for candidate permanent Moon-base locations or future Mars landing and exploration sites." The app delivers that in two ways:

1. **Curated findings** from our own analysis, shown on the homepage globe, each with written reasoning.
2. **A live search tool** where anyone can describe a lunar or Martian environment (plain text, sliders, or by picking a known target site) and get ranked Earth matches.

### Goals
- Make the analog finding obvious and explorable within 10 seconds of landing on the site.
- Make every match **explainable**: per-factor comparison, plus an honest "where this analog falls short" section.
- Give a convincing immersive tour of Earth analog sites in the browser, with an optional "Target View" that re-skins the scene to look like the Moon or Mars.
- Run entirely from precomputed data so it is fast, reliable and demo-safe.

### Non-goals
- No live heavy geospatial computation. All analysis is precomputed by the data team.
- No user accounts, no database, no payments.
- No claims that an Earth site is a perfect analog. Gravity, vacuum, radiation and regolith behaviour cannot be matched on Earth, and the UI says so.

---

## 2. Users and key flows

**Primary users:** hackathon judges, students, educators, mission-curious public. Secondary: engineers wanting a quick analog shortlist.

**Flow A, Explore findings (default).**
Land on homepage, see the globe with featured analog pins, click a pin, read the description and reasoning, click "Enter site", tour it.

**Flow B, Describe an environment.**
Type "cold, airless, steep crater rim with permanent shadow nearby and ice in the ground", press Search. The globe re-colours/re-pins with ranked matches. Click one, read why it matches, tour it.

**Flow C, Tune with controls.**
Open the "Fine-tune" panel, pick a preset (for example "Lunar south pole rim"), adjust sliders (target level and importance per feature), optionally mark features "must match". Results update live.

**Flow D, Start from a target.**
Choose a Moon or Mars target (for example Shackleton rim, Jezero). View it in the Target Viewer, then see its best Earth analogs.

---

## 3. Scope and priorities

### P0 (must ship, in this order)
1. Homepage with 3D globe, featured analog pins, search box, and fine-tune controls.
2. Scoring engine (client-side) over the precomputed data.
3. Ranked results on the globe and in a sidebar list.
4. Site detail panel: description, reasoning, per-feature comparison, limitations.
5. Tour mode: first-person walk and fly at ground level on Earth terrain with imagery.
6. Method/About page with data sources, scoring method and attributions.
7. Mock data so everything works before the data team delivers.

### P1 (if time allows)
8. Natural-language parsing through a serverless Claude call, with deterministic keyword fallback (the fallback is actually P0, the LLM is P1).
9. Target View toggle in tour (Moon/Mars sky, colour grade, hidden atmosphere).
10. Target Viewer (three.js terrain of the Moon/Mars site from a heightmap) with sun-angle slider.
11. Split-screen compare: Earth site vs target site.
12. Shareable URL state.

### P2 (stretch)
13. Guided tour narration cards at waypoints.
14. Radar chart of feature match.
15. Export a one-page analog brief (print stylesheet).

### Suggested timeline (hackathon)
| Block | Deliverable |
|---|---|
| M0 (hours 0 to 2) | Project scaffold, mock data generator, data contract validation |
| M1 (2 to 6) | Globe, pins, scoring engine, results list |
| M2 (6 to 10) | Detail panel, fine-tune controls, text search (keyword parser) |
| M3 (10 to 16) | Tour mode (walk and fly) |
| M4 (16 to 22) | Swap in real data from the data teammate, curated descriptions, Method page |
| M5 (22 to 30) | P1 items: LLM parsing, Target View, Target Viewer |
| M6 (30 to end) | Polish, bugs, README, deployment, demo script |

Each milestone must leave the app in a deployable, working state.

---

## 4. Information architecture

Routes (use hash or path routing, whichever deploys simpler):

| Route | Screen |
|---|---|
| `/` | Home: globe, search, results, detail panel |
| `/site/:id` | Home with site detail panel open for that site (deep link) |
| `/tour/:id` | Tour mode for site `:id` |
| `/target/:id` | Target Viewer for a Moon/Mars target (P1) |
| `/method` | Method, data sources, limitations, credits |

Search state lives in the URL query (P1): `/?q=...&body=moon&w=slope:2,ice:3&t=slope:0.8`.

---

## 5. Screen specifications

### 5.1 Home

**Layout (desktop):**
- Full-bleed 3D globe as the background (CesiumJS). Slow auto-rotation until first user interaction.
- Top-left: logo and one-line tagline ("Find Earth's Moon and Mars lookalikes.").
- Top-center: search bar (large). Placeholder cycles through example prompts. A "Fine-tune" button opens the controls drawer. A segmented control sets the body: **Moon | Mars | Either**.
- Left sidebar (collapsible): results list (or, before any search, "Featured findings").
- Right panel: site detail (opens on pin/list click).
- Bottom-left: legend (pin colour = score, shape = featured vs search result).
- Top-right: link to Method page.

**Layout (mobile):** globe full screen, search bar on top, results as a bottom sheet, detail as a full-screen sheet.

**Initial state:** Featured findings loaded from `featured_analogs.json`. Pins are rings coloured by body the site is an analog for (Moon: silver-blue, Mars: rust). Selecting a featured pin shows the curated reasoning.

**States:** loading (skeleton globe and shimmering sidebar), empty results (suggest relaxing "must match" constraints), error (data failed to load: show retry and the offline fallback message).

### 5.2 Search and fine-tune controls

**Search bar behaviour:**
- Enter or click Search sends text to the parser (section 7). Show a "Reading your description..." state, then show the **interpretation chips** (for example `Cold: very high`, `Vegetation: none`, `Ice: required`) so the user can see and remove how their text was understood. Chips are editable and sync with the sliders.
- If the parser fails, silently fall back to the keyword parser and show a small "Using basic matching" note.

**Fine-tune drawer:**
- **Preset dropdown:** "Custom", then each target from `targets.json` (for example "Moon: Shackleton rim", "Mars: Jezero"). Selecting a preset fills all target values.
- For each feature (grouped: Terrain, Thermal, Light, Volatiles and Geology, Surface and Climate, Hazards and Access):
  - **Target slider** 0 to 1 over the feature's normalized range. Show the real-unit value next to it (for example "slope 12 deg").
  - **Importance control** with 4 steps: Ignore (0), Low (1), Normal (2), High (3).
  - **Must match** toggle that applies a hard filter within a tolerance (default 0.15 normalized units).
- "Reset" button. Changes re-score live (debounced 80 ms).

### 5.3 Results

- Globe: top N results (default 25) shown as pins, colour ramp by score (low to high: dim grey, amber, teal). Featured findings are not shown while search results are active, but a toggle "Show featured" restores them.
- Sidebar list: rank, place name (reverse-labelled from nearest curated site or region name in data), score as a bar and number, top 2 matching features and top 1 mismatch as small chips.
- Hover list item highlights pin. Click flies the camera to the site (1.2 s) and opens the detail panel.

**Clustering:** raw grid cells are suppressed with greedy non-max suppression. Take the best cell, discard cells within 300 km, repeat. This avoids 25 pins in one desert.

### 5.4 Site detail panel

Sections, in order:
1. **Header:** site name, region/country, score gauge (0 to 100), "Analog for" chips (for example "Shackleton rim", "Jezero").
2. **Why it matches:** 2 to 4 sentence description. Curated text if present, else auto-generated from the feature breakdown using a template (section 8.5).
3. **Feature comparison:** table with one row per feature: label, site value, target value, a dual bar (site vs target), and a match badge: Strong (diff under 0.15), Partial (0.15 to 0.35), Weak (over 0.35). Rows sorted by importance weight then by match.
4. **Where this analog falls short:** bullet list, mixing curated items and the global limits (gravity, vacuum, radiation, regolith chemistry and dust, communication delay). Always shown, never collapsed by default.
5. **Data quality:** terrain resolution, imagery source, tour fidelity indicator (see 5.5).
6. **Actions:** `Enter site` (primary), `Compare with target` (if P1 built), `Copy link`.
7. **Sources:** the datasets behind the numbers shown, with links.

### 5.5 Tour mode (street-view-esque)

**Engine:** CesiumJS, same viewer instance as the globe, camera transitions from the globe to the site spawn point (fly-to, then drop to ground height).

**Controls (must work on desktop; touch is P2):**
- **Walk mode (default):** camera 1.7 m above terrain. Click the canvas to engage pointer lock for mouse look. `W A S D` move, `Shift` sprint (3x), `Space` toggles Fly mode. `Esc` releases pointer lock. Terrain clamping: sample terrain height at the next position with `sampleTerrainMostDetailed` (throttled), and lerp camera height to terrain + 1.7 m to avoid jitter.
- **Fly mode:** free camera, `Q`/`E` for down/up, scroll to change speed.
- **Teleport:** a minimap (small 2D map, bottom-left) lets the user click to teleport within 5 km of the spawn point.

**HUD (minimal, bottom and corners):**
- Top-left: site name, "Analog for: ..." chips, `Exit tour`.
- Bottom-left: minimap with heading arrow.
- Bottom-center: coordinates, elevation, compass heading.
- Right: collapsible "Match card" showing the top 5 features site vs target (re-uses detail panel data).
- Top-right: **Target View** toggle (P1), and a fidelity badge.

**Imagery and fidelity ladder** (use best available, show badge):
1. Google Photorealistic 3D Tiles via Cesium ion, where coverage exists: badge "Photorealistic".
2. Cesium World Terrain plus satellite imagery: badge "Terrain and satellite".
3. Fallback: global terrain plus basemap: badge "Low detail".
Never promise street-level photos. Say "street-view style", not "Street View".

**Target View (P1):** applies a scene profile:
- **Moon:** hide sky atmosphere and ground atmosphere, black sky with stars, desaturate imagery to greyscale, hard directional light, high contrast, no fog, optional low sun elevation.
- **Mars:** keep the sky but tint to butterscotch with a post-process colour grade, add mild haze, desaturate greens (vegetation looks wrong on Mars), warm shift overall.
- Implementation via `scene.skyAtmosphere.show`, `scene.globe.showGroundAtmosphere`, `scene.skyBox`, `scene.light`, and a `PostProcessStage` with a small fragment shader (grade, saturation, tint). Transition in 600 ms. Toggle is reversible instantly.
- Always show a small disclaimer: "Simulated look. Not a physical render of the target."

**Waypoints (P2):** `tour.waypoints` array in data; the user can step through narration cards that fly the camera to each.

### 5.6 Target Viewer (P1)

For each Moon/Mars target, a three.js scene:
- Terrain mesh from heightmap (section 8.3), optional imagery texture.
- Black sky with stars, one directional light = the sun.
- **Sun controls:** azimuth (0 to 360) and elevation (0 to 30 degrees, default 1.5 for polar targets) sliders. Long shadows illustrate why the site matters.
- Orbit camera plus a "ground view" button that drops to 2 m above the surface at the target centre.
- Vertical exaggeration slider (1x to 3x), scale bar, north arrow.
- Metadata card: coordinates, body, why it matters, datasets used.
- "Find Earth analogs" button loads the home screen with that target preset applied.

### 5.7 Compare (P1)

Split screen: Earth site (Cesium, left) and target (three.js, right). Shared scale bar. Under each, 3 to 4 matching and mismatching facts. No camera syncing required.

### 5.8 Method page

Static page with: how the score works (plain language and formula), feature definitions table (from `features.json`), data sources and dates (section 8.6), what analogs can and cannot replicate, how to cite, team credits, and licence/attribution notices for Cesium, Google tiles, NASA PDS, Copernicus.

---

## 6. Feature model

All three bodies (Moon, Mars, Earth) are described by the **same canonical feature keys**, so they can be compared. Definitions below are the contract between the app and the data team. Units given are raw units; the app uses normalized values in the range 0 to 1.

| Key | Label | Raw unit | Group | Notes |
|---|---|---|---|---|
| `elevation_m` | Elevation | m (relative to body datum) | Terrain | Earth: above sea level. Moon/Mars: relative to reference sphere/geoid. |
| `slope_deg` | Mean slope | deg | Terrain | Mean slope at the working scale (state baseline, for example 20 to 100 m). |
| `roughness_m` | Surface roughness | m RMS | Terrain | Height deviation at about 100 m baseline. |
| `rock_fraction` | Rock abundance | 0 to 1 | Terrain | Fraction of surface covered by rocks. Earth: proxy from roughness or land cover. |
| `temp_max_k` | Max surface temp | K | Thermal | Annual max. |
| `temp_min_k` | Min surface temp | K | Thermal | Annual min. |
| `temp_range_k` | Diurnal temp range | K | Thermal | Mean daily max minus min. |
| `illum_fraction` | Sunlit fraction | 0 to 1 | Light | Fraction of year the sun is above the local horizon. Earth: geometric, ignoring atmosphere and cloud. |
| `ice_signal` | Volatile/ground ice | 0 to 1 | Volatiles and Geology | Composite likelihood index. Document the method. |
| `basalt_fraction` | Basaltic composition | 0 to 1 | Volatiles and Geology | Fraction basaltic or volcanic terrain. |
| `albedo` | Albedo | 0 to 1 | Surface and Climate | Visible albedo. |
| `vegetation_ndvi` | Vegetation | 0 to 1 | Surface and Climate | Moon and Mars are 0. Lower matches better. |
| `precip_mm_yr` | Precipitation | mm/yr | Surface and Climate | Moon and Mars are 0. |
| `radiation_index` | Radiation exposure | 0 to 1 | Hazards and Access | Relative index. State the basis. |
| `isolation_index` | Isolation | 0 to 1 | Hazards and Access | Earth: from population density and road distance. Moon/Mars: derived from line of sight to Earth or distance to nearest hazard, as the data team defines. |

The data team may adjust this list. If features are added or removed, only `features.json` should change; the UI must render features dynamically from that file and never hard-code the list.

---

## 7. Search and parsing

### 7.1 Parsed query shape

```ts
type FeatureKey = string; // keys from features.json

interface ParsedQuery {
  body: 'moon' | 'mars' | 'either';
  targets: Partial<Record<FeatureKey, number>>;   // normalized 0..1
  weights: Partial<Record<FeatureKey, 0|1|2|3>>;  // importance
  required: FeatureKey[];                         // hard filters
  notes: string;                                  // one-line interpretation, shown to user
}
```

### 7.2 LLM parser (P1)

- Serverless endpoint `POST /api/parse` with body `{ "text": string }`. Never call the model from the browser, and never expose the API key client-side.
- Server calls the Backboard.io Messages API with model from env `LLM_NAME` (default `claude-sonnet-5-5`), a system prompt containing the feature registry (keys, labels, units, normalization ranges), and a strict instruction to return JSON only matching `ParsedQuery`.
- Validate the response with zod. Drop unknown keys. Clamp numbers. On any failure or a 6 second timeout, return `{ "fallback": true }` and the client uses the keyword parser.
- Rate-limit by IP in memory (for example 20 requests per minute). Cap input text at 500 characters.
- System prompt rules: map qualitative words to normalized levels using the feature's range (for example "very cold" sets `temp_min_k` target near 0.05 and importance 3); only set a target when the text implies one; set `required` only for explicit must-haves ("must have", "needs", "no vegetation at all"); never invent keys.

### 7.3 Keyword fallback parser (P0)

Deterministic, client-side, no network. A dictionary of phrases to partial `ParsedQuery` patches, merged additively:

| Phrases | Effect |
|---|---|
| cold, freezing, frigid | `temp_min_k` target 0.1, weight 3 |
| hot, scorching | `temp_max_k` target 0.9, weight 2 |
| steep, cliff, rim, crater wall | `slope_deg` target 0.8, weight 3 |
| flat, plain, plains, smooth | `slope_deg` target 0.1, `roughness_m` target 0.1 |
| rocky, boulders | `rock_fraction` target 0.8 |
| ice, frozen, permafrost, water | `ice_signal` target 0.8, weight 3 |
| dry, arid, desert | `precip_mm_yr` target 0, weight 3 |
| no vegetation, barren, bare | `vegetation_ndvi` target 0, weight 3, required |
| volcanic, basalt, lava | `basalt_fraction` target 0.8, weight 2 |
| remote, isolated | `isolation_index` target 0.9 |
| shadow, dark, polar night | `illum_fraction` target 0.1 |
| sunlit, bright, sun-drenched | `illum_fraction` target 0.9 |
| lava tube, cave | `basalt_fraction` target 0.8, add tag `lava_tube` (surface-only score, note in UI) |
| moon, lunar | `body: moon`. mars, martian: `body: mars` |

Unknown words are ignored. Show chips for what was understood and a line "Didn't understand: ...".

### 7.4 Target-first flow

Selecting a target preset sets `targets` to that target's normalized feature values, weights to 2 for all features with data, and `required` to empty. The user may then adjust.

---

## 8. Scoring engine

### 8.1 Normalization

Each feature has `norm: { min, max, scale: "linear" | "log" }` in `features.json`. For a raw value $v$:

$$n(v) = \text{clip}\left(\frac{f(v) - f(\text{min})}{f(\text{max}) - f(\text{min})},\ 0,\ 1\right)$$

where $f$ is identity for linear scale and $\ln(1+v)$ for log scale. The data team should set `min` and `max` to roughly the 2nd and 98th percentile across Earth cells and the Moon/Mars targets combined, so that one outlier does not flatten everything. Normalization is applied in the app at load time, using the registry, so raw values are always kept for display.

### 8.2 Similarity

For a target vector $t$ (normalized), a cell vector $c$ (normalized), importance weights $w_i \in \{0,1,2,3\}$, and the set $I$ of features where both values exist and $w_i > 0$:

$$S = 1 - \frac{\sum_{i \in I} w_i \, |t_i - c_i|}{\sum_{i \in I} w_i}$$

Report as $100 \times S$, rounded to an integer.

- **Missing values:** if a cell value is `null`, drop that feature from $I$ for that cell and reduce that cell's **confidence** by the dropped weight share. Show a "Partial data" note if more than 25% of weight is missing.
- **Hard filters:** for each feature in `required`, exclude cells with $|t_i - c_i| > \tau$, default $\tau = 0.15$.
- **Tie-break:** higher confidence, then higher mean match across weight-3 features.

### 8.3 Performance

Hold cell feature data as one `Float32Array` per feature (columnar). Scoring about 60,000 cells across 14 features takes a few milliseconds, so run it on the main thread; move to a Web Worker only if profiling shows a problem. Debounce slider input at 80 ms.

### 8.4 Result post-processing

1. Score all cells. 2. Apply filters. 3. Sort. 4. Non-max suppression at 300 km (haversine distance). 5. Take top N. 6. For each, compute the per-feature diff breakdown for the detail panel.

### 8.5 Auto-generated description (template)

For results with no curated text:

> "{Place} scores {score}/100 against {target name or 'your description'}. It is a strong match on {top 2 features, labelled}. It differs most in {worst feature, labelled}. {Global limitation sentence}."

Feature labels come from the registry. Keep it factual; no invented claims.

---

## 9. Data contract

All files live in `public/data/` and are loaded at startup, validated with zod, and cached. The data teammate produces these; until then, the agent builds a mock generator (section 12.2). Provide a `data/README.md` explaining the schema.

### 9.1 `features.json`

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
  ]
}
```

### 9.2 `targets.json` (Moon and Mars)

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
      "whyItMatters": "2 to 4 sentences on why this is a candidate site.",
      "values": { "slope_deg": 8.2, "temp_min_k": 40, "ice_signal": 0.7 },
      "heightmap": "heightmaps/moon-shackleton-rim.json",
      "imagery": "imagery/moon-shackleton-rim.jpg",
      "sources": ["LOLA 20 m south polar DEM", "Diviner"]
    }
  ]
}
```

`values` may omit features with no data (treated as missing).

### 9.3 `earth_cells.json` (columnar)

```json
{
  "cellSizeDeg": 0.5,
  "count": 60000,
  "lat": [ ... ],
  "lon": [ ... ],
  "values": {
    "slope_deg": [ ... ],
    "temp_min_k": [ ... ]
  },
  "region": [ "Nunavut, Canada", "..." ]
}
```

Arrays have identical length. `null` = missing. Land cells only. Raw (not normalized) values. Keep under about 8 MB; gzip is fine since the host will compress. `region` is optional (human-readable label per cell).

### 9.4 `featured_analogs.json` (our findings)

```json
{
  "featured": [
    {
      "id": "devon-island-haughton",
      "name": "Haughton Crater, Devon Island",
      "region": "Nunavut, Canada",
      "lat": 75.37,
      "lon": -89.68,
      "analogFor": ["moon-shackleton-rim", "mars-deuteronilus"],
      "score": { "moon-shackleton-rim": 78 },
      "headline": "Polar desert impact crater with ground ice.",
      "description": "Curated paragraph(s), plain text or limited markdown.",
      "matches": ["Cold, dry polar desert", "Impact crater morphology", "Ground ice"],
      "shortfalls": ["Earth gravity", "Presence of thin vegetation in summer"],
      "values": { "slope_deg": 6.1 },
      "tour": {
        "spawn": { "lat": 75.37, "lon": -89.68, "heading": 90, "heightM": 1.7 },
        "waypoints": [ { "name": "Crater rim", "lat": 75.4, "lon": -89.7, "note": "Text." } ]
      },
      "references": [ { "title": "Paper or page", "url": "https://..." } ]
    }
  ]
}
```

### 9.5 Optional `analogs_precomputed.json`

Per target, a precomputed top-N list with per-feature diffs, used as a cross-check against the client-side scoring and as the source for the homepage "Featured" ranking if the data team prefers to own the ranking. The client-side engine remains the source of truth for live search.

### 9.6 Heightmaps (P1)

```json
{ "width": 256, "height": 256, "metersPerPixel": 40, "minElevation": -2500, "maxElevation": 1800, "encoding": "int16-base64", "data": "..." }
```

Provide at most 512 by 512 per target. The agent decodes to a `Float32Array` and builds a `PlaneGeometry` with displaced vertices.

### 9.7 Data provenance (for the Method page)

Each file includes a `provenance` block listing datasets, versions, date ranges and processing notes. The Method page renders it. Suggested ranges: Earth climate 1991 to 2020 normals, satellite products 2000 to 2025, lunar illumination over a full year from 2030, Mars over one full Mars year (flag global dust storm years).

---

## 10. Technical architecture

### 10.1 Stack
- **Vite + React + TypeScript**
- **CesiumJS** (globe and tour) via `vite-plugin-cesium`
- **three.js** (Target Viewer), lazy loaded
- **Zustand** for state
- **Tailwind CSS** for styling
- **zod** for data and API validation
- **Vitest** for unit tests
- **Vercel** (or Netlify) for static hosting and the one serverless function

### 10.2 Environment variables
| Name | Where | Purpose |
|---|---|---|
| `CESIUM_ION_TOKEN` | client (public) | Cesium World Terrain, imagery, Photorealistic 3D Tiles |
| `BACKBOARD_API_KEY` | server only | LLM parser |
| `LLM_NAME` | server only | Defaults to `claude-sonnet-5-5` |

Provide `.env.example`. If the Cesium token is missing, the app must still render with default imagery and show a console warning and a visible low-detail badge.

### 10.3 Folder structure

```
/
  public/data/                 data files (section 9)
  api/parse.ts                 serverless LLM parser
  src/
    main.tsx, App.tsx, routes
    state/store.ts             zustand: query, results, selection, mode
    data/loaders.ts            fetch + zod validate + normalize
    data/schemas.ts
    scoring/normalize.ts
    scoring/score.ts           similarity, filters, NMS, breakdown
    scoring/score.test.ts
    parse/keyword.ts           fallback parser
    parse/client.ts            calls /api/parse, falls back
    globe/GlobeView.tsx        Cesium viewer, pins, camera moves
    globe/pins.ts
    tour/TourView.tsx          walk/fly controller, HUD, minimap
    tour/targetViewProfile.ts  moon/mars scene profiles + post process
    target/TargetViewer.tsx    three.js heightmap scene (lazy)
    ui/                        SearchBar, FineTuneDrawer, ResultsList,
                               SiteDetailPanel, FeatureTable, Legend, Badges
    pages/Method.tsx
    lib/geo.ts                 haversine, clamp, format
  scripts/mockData.ts          generates synthetic data files
  README.md
```

### 10.4 State shape (zustand)

```ts
interface AppState {
  features: FeatureDef[];
  targets: Target[];
  cells: EarthCells;
  featured: FeaturedSite[];
  query: ParsedQuery;               // current interpretation
  results: Result[];                // after NMS
  selectedId: string | null;
  mode: 'home' | 'tour' | 'target';
  targetViewProfile: 'off' | 'moon' | 'mars';
}
```

### 10.4 Cesium notes for the agent
- One `Viewer` instance for the whole app. Hide default UI widgets (timeline, animation, base layer picker, geocoder, home button, navigation help).
- Pins: use `PointPrimitiveCollection` or `BillboardCollection` for performance, not Entities, for result sets. Use Entities only for the selected site highlight.
- Camera moves: `camera.flyTo` with duration 1.2 s, offset so the site is centred with a roughly 600 km range for globe selection.
- Tour: set `scene.screenSpaceCameraController` inputs disabled and drive the camera yourself in a `scene.preRender` handler. Re-enable on exit. Use `Cesium.sampleTerrainMostDetailed` throttled to about every 150 ms.
- Photorealistic 3D Tiles: `Cesium.createGooglePhotorealistic3DTileset()` (ion asset); if it fails to load for a location, fall back and set the fidelity badge. Respect the data attribution requirement: keep the Cesium credit display visible.
- Never use Google Street View panoramas or scrape any imagery.

---

## 11. Design system

**Mood:** dark, calm, scientific, slightly cinematic. Data first, no clutter.

**Colour tokens (CSS variables):**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#070A10` | App background |
| `--panel` | `rgba(14,20,32,0.78)` with backdrop blur | Panels |
| `--text` | `#E8EDF5` | Primary text |
| `--muted` | `#93A0B5` | Secondary text |
| `--moon` | `#9FB4C7` | Moon-related accents |
| `--mars` | `#D1603D` | Mars-related accents |
| `--good` | `#3CC8A0` | Strong match |
| `--mid` | `#E3B23C` | Partial match |
| `--bad` | `#E0605E` | Weak match |

**Type:** Inter for UI, JetBrains Mono for numbers, coordinates and units. Base 15 px, panel headings 18 to 20 px.
**Shape:** 12 px radius panels, 1 px translucent borders, soft shadows.
**Motion:** 150 to 250 ms ease-out for UI, 1.2 s camera flights. Honour `prefers-reduced-motion` (no auto-rotate, instant camera moves).
**Iconography:** simple line icons (lucide-react).
**Colour is never the only signal.** Match badges also carry text ("Strong", "Partial", "Weak") and score pins also show numbers on hover.

---

## 12. Mock data and dev experience

### 12.1 Why mock data
The data team's output arrives later. The agent must build and test everything against synthetic data that obeys the exact same schemas, so swapping in real files requires no code changes.

### 12.2 `scripts/mockData.ts`
Generates:
- `features.json` with the 14 features and plausible ranges.
- `targets.json` with 6 targets (3 Moon: Shackleton rim, Malapert massif, a mare site; 3 Mars: Jezero, Gale, an ice-rich mid-latitude site) with plausible values.
- `earth_cells.json` at 2 degree resolution (about 6,000 land cells) using simple latitude/elevation heuristics so that polar and high-desert regions plausibly look cold and dry.
- `featured_analogs.json` with these seed sites (coordinates approximate, verify before publishing): Haughton Crater, Devon Island (75.37, -89.68); Yungay, Atacama (-24.1, -70.0); Wright Valley, Antarctic Dry Valleys (-77.5, 161.8); Askja, Iceland (65.03, -16.75); Kilauea, Hawaii (19.42, -155.29); Mars Desert Research Station, Utah (38.41, -110.79); Cueva de los Verdes lava tube, Lanzarote (29.16, -13.43); Danakil Depression, Ethiopia (14.24, 40.30).
- Marks the mock files with `"provenance": { "mock": true }`. If mock data is loaded, show a visible "Demo data" ribbon so it is never mistaken for findings.

### 12.3 Contract validation
On load, validate all files with zod. On failure, show a developer-readable error naming the file and the failing path. Print a console table of loaded feature keys, cell counts and target ids.

---

## 13. Content requirements

### 13.1 Always-visible limitations (detail panel, Method page)
A fixed block stating that Earth analogs cannot reproduce: reduced gravity (Moon about 1/6 g, Mars about 0.38 g), vacuum or near-vacuum, the radiation environment (no magnetosphere/thick atmosphere), regolith chemistry and electrostatic dust behaviour, and communication delay. Add site-specific shortfalls from data.

### 13.2 Microcopy
- Tagline: "Find Earth's Moon and Mars lookalikes."
- Search placeholder examples (rotate): "Cold, dry, steep crater rim with ice below", "Flat basaltic plain, no vegetation, very remote", "Sunlit ridge near permanently dark terrain".
- Tour disclaimer (Target View): "Simulated look. Not a physical render of the target."
- Keep language plain, direct, Canadian spelling (colour, metre, kilometre). No filler.

### 13.3 Attributions (footer on Method page, and Cesium credits on globe)
NASA PDS and LRO/LOLA/Diviner teams, Mars MOLA/THEMIS/CRISM teams, Copernicus ERA5 and DEM, MODIS, Cesium ion and Google Photorealistic 3D Tiles attribution, OpenStreetMap contributors where used. The data team supplies the final list in `provenance`.

---

## 14. Non-functional requirements

- **Performance:** first meaningful render under 3 s on broadband. Lazy load three.js and Cesium sub-modules. Scoring re-run under 50 ms.
- **Reliability:** works with no backend (keyword parser). Works with no Cesium token (degraded). Every network call has a timeout and a visible failure state.
- **Accessibility:** full keyboard operation of search, drawer, list and detail panel; visible focus rings; ARIA labels on controls; contrast at least 4.5:1 for text; tour mode documents its keys in a help overlay (`?`).
- **Responsiveness:** usable at 360 px width for everything except tour mode, which shows a "Best on desktop" notice on touch devices.
- **Security:** no keys in the client bundle other than the Cesium public token; sanitize any markdown from data files; cap and validate API input.
- **Browser support:** current Chrome, Edge, Firefox, Safari. WebGL2 required; show a friendly message if unavailable.

---

## 15. Testing and acceptance criteria

### 15.1 Unit tests (Vitest)
- `normalize`: linear and log, clipping, missing values.
- `score`: identical vectors give 100; opposite extremes on all features give 0; weights change ranking as expected; missing values reduce confidence not score; required filter excludes correctly.
- NMS: no two results within 300 km.
- `keyword` parser: each phrase in the table maps to the expected patch; unknown words ignored.
- Schema validation: bad files produce readable errors.

### 15.2 Acceptance criteria (P0)
1. Opening `/` shows the globe with featured pins in under 3 s, search bar visible.
2. Clicking a featured pin opens the detail panel with headline, description, feature table, shortfalls and sources.
3. Typing "cold dry crater with ice" and pressing Search shows interpretation chips and at least 10 ranked pins and list items.
4. Changing a slider or importance updates the results live without page reload.
5. Marking "Vegetation" as must match removes vegetated cells from results.
6. Clicking "Enter site" transitions to tour; WASD and mouse look work; Esc releases the mouse; `Exit tour` returns to the globe with prior state intact.
7. Fidelity badge reflects what actually loaded.
8. `/method` renders feature definitions and provenance from the data files.
9. With mock data loaded, a "Demo data" ribbon is visible. With real data it is not.
10. No console errors on the happy path; failed LLM call falls back silently to the keyword parser.

### 15.3 Manual QA script
Run flows A to D from section 2 on desktop Chrome and one mobile viewport. Check keyboard-only operation of search and results.

---

## 16. Instructions for the building agent

**Build order:** follow milestones M0 to M6 in section 3. After each milestone, run tests, run the dev server and verify the acceptance criteria that apply, then commit.

**Rules:**
1. Render features, groups, labels and units from `features.json`. Never hard-code the feature list.
2. All analysis numbers shown in the UI come from the data files. Do not invent scientific values, coordinates or claims in code. Placeholder text in mock data must be clearly marked as mock.
3. Keep scoring pure and testable (no DOM or Cesium imports in `src/scoring`).
4. Keep the API key server-side only.
5. Prefer simple and robust over clever. If a P1 item threatens a P0 item, drop the P1 item.
6. Keep the app deployable at all times. Maintain a `README.md` with setup, env vars, data contract pointer and the demo script.
7. Do not use Google Street View imagery or scrape any imagery. Use Cesium ion tilesets only.
8. Write copy in plain, direct language with Canadian spelling. No em dashes, no marketing filler.

**Definition of done:** all P0 acceptance criteria pass, deployed URL works, README complete, demo script (below) can be run end to end.

---

## 17. Demo script (60 to 90 seconds)

1. Land on the globe: "Terralog finds Earth places that look like Moon and Mars sites."
2. Click Haughton Crater: read the reasoning, point at the per-feature match and the "falls short" list.
3. Enter the site, walk a few seconds, toggle Target View to Moon.
4. Exit, type "cold, dry, flat basaltic plain, no vegetation, remote", show the chips and ranked matches.
5. Tune a slider and show live re-ranking, mark one feature "must match".
6. Open Method: show data sources and scoring formula.

---

## 18. Open questions (to confirm with the data teammate)

1. Final feature list and units (can be changed in `features.json` without code changes).
2. Earth grid resolution (0.5 degree recommended, 2 degree acceptable for a first pass).
3. Which Moon and Mars targets are in the first release.
4. Whether the data team or the app owns the featured ranking (`analogs_precomputed.json`).
5. Slope baseline and the radiation and ice index definitions, for the Method page.
6. Whether heightmaps and imagery for targets will be available (otherwise Target Viewer is skipped).
