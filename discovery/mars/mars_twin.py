#!/usr/bin/env python3
"""Mars | Earth twin views at 200 m (same hillshade lighting) + histogram + context table. Writes previews/mars_twin_<id>.png"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, pandas as pd, rasterio
from rasterio.enums import Resampling
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import slope_degrees, slope_hist, hillshade, SLOPE_BINS, tile_url
from mars_scan import name as tname, PIX, BLOCK
HERE = os.path.dirname(os.path.abspath(__file__))
S = pd.read_csv(os.path.join(HERE, "results/mars_candidates.csv")).set_index("id")
M = json.load(open(os.path.join(HERE, "results/mars_sites.json")))
ids = sys.argv[1:] or ["B28302", "B20913", "B7719", "B17168", "B58488", "B19394", "B42587", "B37030"]
for i in ids:
    r = S.loc[i]; site = r.best_site; lat, lon = r.lat, r.lon
    code = f"{'N' if lat >= 0 else 'S'}{abs(int(np.floor(lat))):02d}_{'E' if lon >= 0 else 'W'}{abs(int(np.floor(lon))):03d}"
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(tile_url(tname(code))) as s:
            b = s.bounds; lm = (b.top + b.bottom) / 2
            oh = int(round((b.top - b.bottom) * 111320 / PIX)); ow = int(round((b.right - b.left) * 111320 * np.cos(np.radians(lm)) / PIX))
            dem = s.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
    bp = int(BLOCK / PIX); rr = int((b.top - lat) / (b.top - b.bottom) * oh) - bp // 2; cc = int((lon - b.left) / (b.right - b.left) * ow) - bp // 2
    rr, cc = min(max(rr, 0), oh - bp), min(max(cc, 0), ow - bp); e = dem[rr:rr + bp, cc:cc + bp]
    m = np.load(os.path.join(HERE, f"data/{site}_dem200.npy")).astype("float64")
    he = slope_hist(slope_degrees(e, PIX, PIX)); mh = M[site]["terrain"]["slope_hist"]
    fig, ax = plt.subplots(1, 3, figsize=(16, 5.2), gridspec_kw={"width_ratios": [1, 1, 1.1]})
    ax[0].imshow(hillshade(m, PIX, PIX, alt=25), cmap="gray", vmin=0, vmax=1); ax[0].axis("off"); ax[0].set_title(f"MARS {site} ({M[site]['terrain']['slope_p50']:.1f} deg p50, relief {M[site]['terrain']['relief_m']:.0f} m)", fontsize=10)
    ax[1].imshow(hillshade(e, PIX, PIX, alt=25), cmap="gray", vmin=0, vmax=1); ax[1].axis("off"); ax[1].set_title(f"EARTH {i} ({lat:.2f}, {lon:.2f}) ({r.slope_p50:.1f} deg p50, relief {r.relief_m:.0f} m)", fontsize=10)
    x = SLOPE_BINS[:-1] + .5; ax[2].fill_between(x, mh, step="mid", alpha=.45, label="Mars"); ax[2].fill_between(x, he, step="mid", alpha=.45, label="Earth"); ax[2].set_xlim(0, 30); ax[2].legend(); ax[2].set_xlabel("slope (deg), 200 m")
    ctx = M[site]["context"]; alb_m = ctx["albedo"]["value"]["mean"]
    fig.text(0.5, 0.01, f"albedo Mars {alb_m:.2f} / Earth {r.albedo_mean:.2f}   mean LST Earth {r.lst_mean_K:.0f} K (Mars ~210-220 K)   diurnal LST range Earth {r.diurnal_range_K:.0f} K   pressure Earth {r.ps_kpa:.0f} kPa (Mars ~0.6-0.9)   "
             f"elev {r.elev_mean_m:.0f} m   lithology {r.lith_main}", ha="center", fontsize=8)
    fig.savefig(os.path.join(HERE, f"previews/mars_twin_{i}.png"), dpi=100, bbox_inches="tight"); plt.close(fig); print("done", i, site)
