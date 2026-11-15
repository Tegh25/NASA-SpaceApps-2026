#!/usr/bin/env python3
"""Mars phase, stage 1+2a: global arid-terrain pool at the Mars global-DEM scale (200 m).
Tiles: WorldClim-screened arid land (precip <= 250 mm, |lat| <= 60) from ../results/stage1_tiles.csv.
Each Copernicus GLO-30 tile is read remotely (range reads of the COG overview) at 200 m/px; 30 km blocks with 15 km stride are
fingerprinted with the SAME functions used for Mars (../common.py). Writes results/pool_blocks.pkl (with slope histograms) and .csv.
Run: ../.venv/bin/python mars_scan.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, pandas as pd, rasterio
from rasterio.enums import Resampling
from multiprocessing import Pool
from common import slope_degrees, roughness_plane3, slope_hist, tile_url

HERE = os.path.dirname(os.path.abspath(__file__))
PIX, BLOCK, STEP = 200.0, 30000.0, 15000.0


def name(code):
    ns, la, ew, lo = code[0], code[1:3], code[4], code[5:8]
    return f"Copernicus_DSM_COG_10_{ns}{la}_00_{ew}{lo}_00_DEM"


def scan(code):
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3"):
            with rasterio.open(tile_url(name(code))) as s:
                b = s.bounds; lat_mid = (b.top + b.bottom) / 2
                h_m = (b.top - b.bottom) * 111320.0; w_m = (b.right - b.left) * 111320.0 * np.cos(np.radians(lat_mid))
                oh, ow = int(round(h_m / PIX)), int(round(w_m / PIX))
                dem = s.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
    except Exception:
        return []
    dem[np.abs(dem) > 1e5] = np.nan
    slope, rough = slope_degrees(dem, PIX, PIX), roughness_plane3(dem)
    bp, sp = int(BLOCK / PIX), int(STEP / PIX)
    rows = []
    for r0 in range(0, oh - bp + 1, sp):
        for c0 in range(0, ow - bp + 1, sp):
            d = dem[r0:r0 + bp, c0:c0 + bp]
            if np.isfinite(d).mean() < 0.95:
                continue
            z = d[np.isfinite(d)]
            relief = float(np.percentile(z, 95) - np.percentile(z, 5))
            if relief < 15:     # sea / lake / dead flat
                continue
            sf, rf = slope[r0:r0 + bp, c0:c0 + bp], rough[r0:r0 + bp, c0:c0 + bp]
            sv, rv = sf[np.isfinite(sf)], rf[np.isfinite(rf)]
            if sv.size < 1000 or rv.size < 1000:
                continue
            lat = b.top - (r0 + bp / 2) / oh * (b.top - b.bottom); lon = b.left + (c0 + bp / 2) / ow * (b.right - b.left)
            rows.append(dict(tile=code, r0=r0, c0=c0, lat=float(lat), lon=float(lon), hist=slope_hist(sf), slope_p50=float(np.percentile(sv, 50)),
                             slope_p90=float(np.percentile(sv, 90)), rough_p50=float(np.percentile(rv, 50)), relief_m=relief, elev_mean_m=float(z.mean()),
                             frac_lt5=float((sv < 5).mean()), frac_lt10=float((sv < 10).mean())))
    return rows


if __name__ == "__main__":
    s1 = pd.read_csv(os.path.join(HERE, "../results/stage1_tiles.csv"))
    t = s1[(s1.lat0 >= -60) & (s1.lat0 <= 60) & (s1.precip_mm <= 250)]
    print(len(t), "arid tiles", flush=True)
    with Pool(8) as p:
        res = p.map(scan, list(t.tile), chunksize=4)
    df = pd.DataFrame([r for x in res for r in x])
    df = df.merge(t[["tile", "mat_C", "precip_mm", "trange_C"]], on="tile", how="left")
    df.to_pickle(os.path.join(HERE, "results/pool_blocks.pkl"))
    df.drop(columns="hist").to_csv(os.path.join(HERE, "results/pool_blocks.csv"), index=False)
    print(len(df), "blocks (30 km, 200 m) in", df.tile.nunique(), "tiles")
