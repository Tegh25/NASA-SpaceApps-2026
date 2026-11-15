#!/usr/bin/env python3
"""Stage 2b: fine terrain scan of the downloaded Copernicus tiles at the Moon's 40 m baseline.

For every tile in results/stage2_tiles.txt: resample 30 m -> 40 m (area average), compute slope + 3x3-plane roughness with
the SAME functions used for the Moon (common.py), slide a 20x20 km window with 10 km step, store each block's fingerprint.
Writes results/fine_blocks.pkl (one row per block, with slope histogram) and results/fine_terrain_scores.csv.
Run: python refine_earth.py
"""
import os, json
import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling
from multiprocessing import Pool
from common import slope_degrees, roughness_plane3, slope_hist, wasserstein_slope

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_M = 40.0
BLOCK_M, STEP_M = 20000.0, 10000.0


def tile_path(code):
    ns, la, ew, lo = code[0], code[1:3], code[4], code[5:8]
    return os.path.join(HERE, f"data/earth/Copernicus_DSM_COG_10_{ns}{la}_00_{ew}{lo}_00_DEM.tif")


def scan(code):
    p = tile_path(code)
    if not os.path.exists(p):
        return []
    with rasterio.open(p) as src:
        lat_mid = (src.bounds.top + src.bounds.bottom) / 2
        h_m = (src.bounds.top - src.bounds.bottom) * 111320.0
        w_m = (src.bounds.right - src.bounds.left) * 111320.0 * np.cos(np.radians(lat_mid))
        oh, ow = int(round(h_m / TARGET_M)), int(round(w_m / TARGET_M))
        dem = src.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
        b = src.bounds
    dem[np.abs(dem) > 1e5] = np.nan
    slope = slope_degrees(dem, TARGET_M, TARGET_M)
    rough = roughness_plane3(dem)
    bp, sp = int(BLOCK_M / TARGET_M), int(STEP_M / TARGET_M)
    rows = []
    for r0 in range(0, oh - bp + 1, sp):
        for c0 in range(0, ow - bp + 1, sp):
            d = dem[r0:r0 + bp, c0:c0 + bp]
            if np.isfinite(d).mean() < 0.98:
                continue
            z = d[np.isfinite(d)]
            relief = float(np.percentile(z, 95) - np.percentile(z, 5))
            if relief < 300:
                continue
            s, rg = slope[r0:r0 + bp, c0:c0 + bp], rough[r0:r0 + bp, c0:c0 + bp]
            sf, rf = s[np.isfinite(s)], rg[np.isfinite(rg)]
            if sf.size < 1000 or rf.size < 1000:
                continue
            lat = b.top - (r0 + bp / 2) / oh * (b.top - b.bottom)
            lon = b.left + (c0 + bp / 2) / ow * (b.right - b.left)
            rows.append({"tile": code, "r0": r0, "c0": c0, "lat": float(lat), "lon": float(lon),
                         "hist": slope_hist(s), "slope_p50": float(np.percentile(sf, 50)), "slope_p90": float(np.percentile(sf, 90)),
                         "rough_p50": float(np.percentile(rf, 50)), "relief_m": relief,
                         "elev_mean_m": float(z.mean())})
    return rows


def main():
    tiles = open(os.path.join(HERE, "results/stage2_tiles.txt")).read().split()
    with Pool(6) as pool:
        res = pool.map(scan, tiles, chunksize=1)
    blocks = [r for t in res for r in t]
    df = pd.DataFrame(blocks)
    print(len(df), "blocks of 20x20 km in", len(tiles), "tiles")
    moon = json.load(open(os.path.join(HERE, "results/moon_regions.json")))
    H = np.stack(df["hist"].values)
    out = []
    for code, m in moon.items():
        mh = np.array(m["slope_hist"])
        w1 = np.abs(np.cumsum(H, 1) - np.cumsum(mh)).sum(1)
        dr = np.abs(df.rough_p50.values - m["rough_p50"])
        dl = np.abs(np.log(df.relief_m.values / max(m["relief_p5_p95_m"], 1)))
        # terrain distance: each term scaled by its median across all Earth blocks, then averaged (lower = closer)
        td = (w1 / np.median(w1) + dr / np.median(dr) + dl / np.median(dl)) / 3
        d = df[["tile", "lat", "lon", "slope_p50", "slope_p90", "rough_p50", "relief_m", "elev_mean_m"]].copy()
        d["moon"], d["w1_deg"], d["d_rough_m"], d["dln_relief"], d["terrain_dist"] = code, w1, dr, dl, td
        out.append(d)
    sc = pd.concat(out, ignore_index=True)
    df.to_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))
    sc.to_csv(os.path.join(HERE, "results/fine_terrain_scores.csv"), index=False)
    print(sc.groupby("moon").terrain_dist.describe()[["min", "50%"]])


if __name__ == "__main__":
    main()
