# Texture credits

| File | Source (exact URL) | Licence / credit |
|---|---|---|
| `moon_color_2k.jpg` | https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_2k.tif (NASA SVS 4720, CGI Moon Kit; converted to JPEG quality 62 with `sips`, 2048x1024) | Public domain. NASA/Goddard Space Flight Center Scientific Visualization Studio; LROC colour data: NASA/GSFC/Arizona State University. (The `.../lroc_color_poles_2k.jpg` URL returns 404; the 2k poles map is published as TIFF.) |
| `moon_ldem_1k.jpg` | https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg (1024x512, 8-bit, unchanged) | Public domain. NASA/GSFC Scientific Visualization Studio; LRO LOLA elevation data (NASA/GSFC/MIT). |
| `mars_color_2k.jpg` | https://www.solarsystemscope.com/textures/download/2k_mars.jpg (2048x1024, re-encoded to JPEG quality 60 with `sips` to fit 600 KB) | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . Attribution: "Solar System Scope" (https://www.solarsystemscope.com/textures/). Based on NASA elevation and imagery data. |

Why not a NASA/USGS Mars map: the USGS Viking MDIM 2.1 colourised mosaic (12.7 GB) and the MOLA colour-shaded mosaic (3.2 GB) are published only as single full-resolution GeoTIFFs without overviews, so a 2048x1024 version was not reachable quickly. Swap `mars_color_2k.jpg` for a downsampled USGS map later if wanted (https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m).

Earth twin textures in `public/img/twin/` are crops of the Landsat 8/9 and Sentinel-2 L2A previews in `public/img/eo_*.webp` (Planetary Computer, Copernicus Sentinel data / USGS Landsat, public).
