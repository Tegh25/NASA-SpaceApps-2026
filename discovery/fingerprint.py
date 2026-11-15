#!/usr/bin/env python3
"""Terrain fingerprint of a Mars/Moon/Earth DEM: slope distribution + roughness.

Usage:
  python fingerprint.py data/mars/jezero_ctx_dem_20m.tif --name jezero --resample 30
  python fingerprint.py some_dem.tif --name x --window 2000 3000 800 800    # pixel window x0 y0 w h
Writes fingerprints/<name>.json and fingerprints/<name>.png (hillshade + slope histogram).
Always resample to the same pixel size you will use on Earth (30 m for Copernicus GLO-30).
"""
import argparse, json, os
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import meters_per_pixel, slope_degrees, roughness_plane3, hillshade, slope_hist, SLOPE_BINS

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dem")
    ap.add_argument("--name", required=True)
    ap.add_argument("--resample", type=float, default=30.0, help="target pixel size in metres (default 30)")
    ap.add_argument("--window", type=int, nargs=4, metavar=("X0", "Y0", "W", "H"))
    a = ap.parse_args()

    with rasterio.open(a.dem) as src:
        dx0, dy0 = meters_per_pixel(src)
        win = Window(*a.window) if a.window else Window(0, 0, src.width, src.height)
        out_w = max(8, int(round(win.width * dx0 / a.resample)))
        out_h = max(8, int(round(win.height * dy0 / a.resample)))
        method = Resampling.average if out_w < win.width else Resampling.bilinear
        dem = src.read(1, window=win, out_shape=(out_h, out_w), resampling=method).astype("float64")
        nodata = src.nodata
        dx, dy = dx0 * win.width / out_w, dy0 * win.height / out_h
    if nodata is not None:
        dem[dem == nodata] = np.nan
    dem[np.abs(dem) > 1e6] = np.nan
    n_valid = int(np.isfinite(dem).sum())

    slope = slope_degrees(dem, dx, dy)
    rough = roughness_plane3(dem)
    h = slope_hist(slope)
    s = slope[np.isfinite(slope)]
    r = rough[np.isfinite(rough)]
    p5, p95 = np.nanpercentile(dem, [5, 95])
    fp = {
        "name": a.name, "source": os.path.basename(a.dem), "pixel_m": [round(dx, 2), round(dy, 2)],
        "valid_pixels": n_valid, "area_km2": round(n_valid * dx * dy / 1e6, 1),
        "slope_hist": [round(float(x), 6) for x in h],
        "slope_p50": round(float(np.percentile(s, 50)), 3), "slope_p90": round(float(np.percentile(s, 90)), 3),
        "rough_p50": round(float(np.percentile(r, 50)), 3), "rough_p90": round(float(np.percentile(r, 90)), 3),
        "relief_p5_p95_m": round(float(p95 - p5), 1),
    }
    os.makedirs(os.path.join(HERE, "fingerprints"), exist_ok=True)
    jp = os.path.join(HERE, "fingerprints", a.name + ".json")
    json.dump(fp, open(jp, "w"), indent=1)

    fig, ax = plt.subplots(1, 2, figsize=(11, 5))
    ax[0].imshow(hillshade(dem, dx, dy), cmap="gray")
    ax[0].set_title(f"{a.name}: hillshade ({fp['area_km2']} km2 at {dx:.0f} m/px)", fontsize=9)
    ax[0].axis("off")
    ax[1].bar(SLOPE_BINS[:-1] + 0.5, h, width=1.0)
    ax[1].set_xlabel("slope (degrees)")
    ax[1].set_ylabel("fraction of pixels")
    ax[1].set_title(f"slope p50={fp['slope_p50']} deg, p90={fp['slope_p90']} deg, roughness p50={fp['rough_p50']} m", fontsize=9)
    fig.savefig(os.path.join(HERE, "fingerprints", a.name + ".png"), dpi=110, bbox_inches="tight")
    print(json.dumps({k: v for k, v in fp.items() if k != "slope_hist"}, indent=1))
    print("saved", os.path.relpath(jp, HERE), "and the .png next to it")


if __name__ == "__main__":
    main()
