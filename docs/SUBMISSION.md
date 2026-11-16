# Space Apps 2026 Project Submission

Team: **SpaceX Hackers**. Challenge: [**Permanent Moon Base Locations and Mars**](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).

---

## Project Name

Terralog

## Summary (196 words, 1,194 characters)

Terralog finds places on Earth whose terrain matches the Moon's south pole and Mars landing sites, so crews can rehearse in the right places. We fingerprinted the nine Artemis III candidate regions with NASA LRO LOLA elevation and LRO Diviner temperature and ice data, then scored 12,362 Earth blocks (20 x 20 km, Copernicus DEM, NASA MODIS and POWER) on ten categories: slopes, multi-scale roughness, craters, landing area, low-sun shadows, thermal, ice and geology. We kept only places at least 150 km from 166 known analog sites and checked their surfaces with Landsat and Sentinel-2. For Mars we screened 68,496 arid blocks against Jezero, Gale, Meridiani and Oxia Planum. Result: six new candidate sites, including Ngari in western Tibet for Slater Plain and the Chagai/Taftan desert for Oxia Planum, each with the gaps stated in numbers. The web app puts it all on an interactive 3D globe: live re-ranking with sliders or plain language, a Twin Terrain Lab that shows real Earth and Moon terrain side by side at the same scale, and a walk-through at eye height. It matters because analog sites are usually picked by experience; Terralog makes the choice measurable, open and reproducible.

## Project Demonstration (link)

https://terralog-three.vercel.app/pitch.html

(7 slides, public, no login. Use arrow keys or scroll.)

## Project (link)

https://terralog-three.vercel.app

(Source code, data and pipeline: https://github.com/Tegh25/NASA-SpaceApps-2026)

---

## Project Details (paste into the rich-text field)

**What it does**
Terralog answers a concrete question for Artemis and Mars mission planning: which places on Earth best match a specific landing region, and how close are they really? It ranks real Earth terrain against nine Artemis III candidate regions at the lunar south pole and four Mars sites (Jezero, Gale, Meridiani Planum, Oxia Planum), explains every match, and states what no Earth site can reproduce.

**How it works**
1. Target fingerprints: for each Moon region we computed slope and roughness distributions, multi-scale roughness, crater-like depressions, flat landing area and shadow structure under a low circling sun from LRO LOLA 40 m elevation, plus temperature and ice stability from LRO Diviner. Mars sites use the USGS HRSC+MOLA 200 m terrain with MGS TES albedo and thermal inertia.
2. Earth search: 12,362 blocks of 20 x 20 km from 235 Copernicus GLO-30 tiles in cold, dry, rugged regions, with NASA MODIS land temperature, snow, NDVI and albedo, NASA POWER climate, lithology and radar. For Mars, 68,496 arid blocks at 200 m.
3. Scoring: the same code runs on both worlds; ten categories are combined, filtered for bare rock, and stress-tested with 1,000 random re-weightings. Validation: the score separates known analog sites from forests and farmland with AUC 0.82.
4. Novelty and verification: we kept only places at least 150 km from 166 catalogued Moon analog sites (251 for Mars) and confirmed bare ground with Landsat 8/9 and Sentinel-2.

**Results**
Moon: Ngari, western Tibet (closest to Slater Plain; 87 % stability, 82 % bare ground), Pamir near Muztagh Ata (Mons Mouton Plateau) and southern Tibet near Tingri (Malapert Massif, conditional). Mars: Chagai/Taftan on the Pakistan-Iran border and the Beishan Gobi, both near-identical to Oxia Planum in slope, relief and albedo and 100 % bare, plus Gerze in northern Tibet for Jezero. Every site lists its gaps in numbers: Earth blocks are about 130 to 170 K warmer than the lunar regions, have no circling-sun days, far fewer craters, and roughly 150 times the air pressure of Mars.

**The app**
An interactive 3D globe (CesiumJS) where all 12,362 blocks glow by live match score. Choose Moon or Mars; location cards show the score, a plain-language "why it matches", match and gap bars, and caveats. Sliders (temperature, precipitation, slope, roughness, ice, vegetation) or a typed description ("cold, dry, flat plain") re-rank every block instantly. The Twin Terrain Lab (three.js) places the real Earth block and the real Moon or Mars region side by side at the same scale, morphs one into the other, and drops the sun to the Moon's 1.5 degree polar angle to show the lighting gap. "Enter site" walks the location at eye height. Works on desktop and phone.

**Benefits and intended impact**
Analog sites are usually chosen by experience. Terralog gives mission planners, analog programs, educators and the public a measurable, reproducible shortlist matched to specific landing regions, with honest limits, and an open pipeline anyone can re-run with new targets.

**Tools and languages**
Python (numpy, pandas, rasterio, scipy) for the research pipeline; TypeScript, React 19, Vite, Tailwind CSS, zustand and zod for the app; CesiumJS for the globe and tours; three.js for the terrain lab and target viewer; Vercel for hosting and serverless functions; Microsoft Planetary Computer and the AWS open data registry for data access.

**Creativity**
The same fingerprinting code runs on Earth, Moon and Mars, so the comparison is like for like. The Twin Terrain Lab lets anyone see and feel the match and the gaps instead of reading a table. The interface pairs a precise mission-control console with hand-drawn annotations inspired by our team's paper sketch.

**Factors we considered**
Honesty first: every number traces to a dataset, unknown values are shown as n/a, place names are marked approximate, "new" is defined and provisional, and prior art is acknowledged. Accessibility: keyboard operable, reduced-motion and reduced-transparency support, works without paid map keys (NASA GIBS fallback imagery). Performance: compressed data, CDN caching and lazy loading.

---

## Use of Super Intelligence (SI): what to select

Code/software development and text/writing. 

Required disclosures: the app's Method page ("Use of AI" section), README ("Use of AI" section), an `ai-disclosure` meta tag in the app and the slides, and the last slide of the demo.

---

## NASA Data (one row per link)

| Link Text | Link Url |
|---|---|
| LRO LOLA lunar elevation (LDEM_80S_40M), NASA PDS | https://pds-geosciences.wustl.edu/missions/lro/lola.htm |
| LRO Diviner lunar temperature and ice stability (Polar Resource Product), NASA PDS | https://pds-geosciences.wustl.edu/missions/lro/diviner.htm |
| LRO Mini-RF radar, NASA PDS | https://pds-geosciences.wustl.edu/missions/lro/mrf.htm |
| NASA Planetary Data System | https://pds.nasa.gov/ |
| MODIS land surface temperature MYD11A2 v061 | https://lpdaac.usgs.gov/products/myd11a2v061/ |
| MODIS reflectance / albedo MCD43A4 v061 | https://lpdaac.usgs.gov/products/mcd43a4v061/ |
| MODIS vegetation index MYD13Q1 v061 | https://lpdaac.usgs.gov/products/myd13q1v061/ |
| MODIS snow cover MYD10A2 v061 | https://nsidc.org/data/myd10a2/versions/61 |
| NASA Earthdata Search | https://search.earthdata.nasa.gov/ |
| NASA POWER climate data | https://power.larc.nasa.gov/ |
| Landsat 8/9 (NASA/USGS) | https://landsat.gsfc.nasa.gov/ |
| NASA GIBS imagery (Blue Marble, MODIS, Black Marble) | https://nasa-gibs.github.io/gibs-api-docs/ |
| MGS TES thermal inertia map (Putzig and Mellon 2007), NASA PDS | https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/ |
| MGS TES albedo, NASA PDS | https://pds-geosciences.wustl.edu/missions/mgs/tes.html |
| NASA SVS CGI Moon Kit (LROC colour map, LOLA displacement) | https://svs.gsfc.nasa.gov/4720 |

## Space Agency Partner & Other Data (one row per link)

| Link Text | Link Url |
|---|---|
| ESA Copernicus DEM GLO-30 (via AWS open data) | https://registry.opendata.aws/copernicus-dem/ |
| ESA Sentinel-2 L2A (via Microsoft Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a |
| ESA WorldCover | https://esa-worldcover.org/ |
| JAXA ALOS PALSAR mosaic (via Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/alos-palsar-mosaic |
| USGS Mars HRSC+MOLA blended DEM 200 m (ESA Mars Express + NASA MGS) | https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m |
| Microsoft Planetary Computer (data access) | https://planetarycomputer.microsoft.com/ |
| WorldClim 2.1 climate | https://www.worldclim.org/data/worldclim21.html |
| Macrostrat geology API | https://macrostrat.org/ |
| Solar System Scope Mars texture (CC BY 4.0) | https://www.solarsystemscope.com/textures/ |
| CesiumJS and Cesium ion (globe, World Terrain and Imagery) | https://cesium.com/platform/cesiumjs/ |
| Google Photorealistic 3D Tiles (via Cesium ion) | https://developers.google.com/maps/documentation/tile/3d-tiles |
| three.js | https://threejs.org/ |
| Anthropic Claude (AI coding and writing assistant) | https://www.anthropic.com/claude |
| Vercel (hosting) | https://vercel.com/ |
| Terralog source code and data (our repository) | https://github.com/Tegh25/NASA-SpaceApps-2026 |
