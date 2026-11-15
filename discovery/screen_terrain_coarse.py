#!/usr/bin/env python3
"""Stage 2a: coarse terrain screen of every candidate Earth tile, WITHOUT downloading the tiles.

Copernicus GLO-30 tiles are cloud-optimised GeoTIFFs with built-in overviews, so reading the 1/8 overview (~240 m/px)
fetches ~1.5% of the file over HTTP range requests. For every 20x20 km block we compute the slope distribution and
relief at 240 m and compare with each Moon region downsampled to the SAME 240 m scale (same code, same baseline).
Writes results/coarse_blocks.csv. Run: python screen_terrain_coarse.py
"""
import os, sys, json
import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling
from concurrent.futures import ThreadPoolExecutor, as_completed
from common import slope_degrees, slope_hist, wasserstein_slope, tile_url

HERE = os.path.dirname(os.path.abspath(__file__))
FACTOR = 8
BLOCK_KM = 20.0


def tile_name_from_code(code):  # "N38_E074" -> Copernicus name
    ns, la, ew, lo = code[0], code[1:3], code[4], code[5:8]
    return f"Copernicus_DSM_COG_10_{ns}{la}_00_{ew}{lo}_00_DEM"


def block_stats(dem, dx, dy):
    """Slope hist + relief for a masked/valid DEM block at coarse scale."""
    s = slope_degrees(dem, dx, dy)
    v = s[np.isfinite(s)]
    if v.size < 200:
        return None
    z = dem[np.isfinite(dem)]
    return {"hist": slope_hist(s), "slope_p50": float(np.percentile(v, 50)), "slope_p90": float(np.percentile(v, 90)),
            "relief": float(np.percentile(z, 95) - np.percentile(z, 5))}


def moon_coarse():
    """Moon regions at 240 m: block-average the saved 40 m crops by 6 (NaN-aware), same slope/relief code."""
    out = {}
    mj = json.load(open(os.path.join(HERE, "results/moon_regions.json")))
    for code, info in mj.items():
        a = np.load(os.path.join(HERE, f"data/moon/crops/{code}.npy")).astype("float64")
        h, w = (a.shape[0] // 6) * 6, (a.shape[1] // 6) * 6
        b = a[:h, :w].reshape(h // 6, 6, w // 6, 6)
        cnt = np.isfinite(b).sum((1, 3))
        m = np.where(cnt >= 24, np.nansum(b, (1, 3)) / np.maximum(cnt, 1), np.nan)
        st = block_stats(m, 240.0, 240.0)
        st["name"] = info["name"]
        out[code] = st
    return out


def scan_tile(code):
    name = tile_name_from_code(code)
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3"):
            with rasterio.open(tile_url(name)) as src:
                lat_mid = (src.bounds.top + src.bounds.bottom) / 2
                oh, ow = src.height // FACTOR, max(8, src.width // FACTOR)
                dem = src.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
                dy = (src.bounds.top - src.bounds.bottom) * 111320.0 / oh
                dx = (src.bounds.right - src.bounds.left) * 111320.0 * np.cos(np.radians(lat_mid)) / ow
    except Exception:
        return []
    dem[np.abs(dem) > 1e5] = np.nan
    bx, by = max(8, int(round(BLOCK_KM * 1000 / dx))), int(round(BLOCK_KM * 1000 / dy))
    rows = []
    for r0 in range(0, oh - by + 1, by):
        for c0 in range(0, ow - bx + 1, bx):
            d = dem[r0:r0 + by, c0:c0 + bx]
            if np.isfinite(d).mean() < 0.95 or np.nanmax(d) - np.nanmin(d) < 150:
                continue
            st = block_stats(d, dx, dy)
            if st is None:
                continue
            lon0 = int(code[5:8]) * (1 if code[4] == "E" else -1)
            lat0 = int(code[1:3]) * (1 if code[0] == "N" else -1)
            lat = lat0 + 1 - (r0 + by / 2) / oh
            lon = lon0 + (c0 + bx / 2) / ow
            rows.append({"tile": code, "lat": round(lat, 3), "lon": round(lon, 3), **st})
    return rows


def main():
    s1 = pd.read_csv(os.path.join(HERE, "results/stage1_tiles.csv"))
    cand = s1[(s1.lat0 >= -60) & (s1.lat0 <= 82) & (s1.mat_C <= 5) & (s1.precip_mm <= 500) & (s1.elev_std_m >= 80)]
    print(len(cand), "candidate tiles (cold/cool, dry, rugged, -60..82 lat)", flush=True)
    moon = moon_coarse()
    for k, v in moon.items():
        print(f"  Moon {k} {v['name']:22s} @240m slope p50 {v['slope_p50']:.1f} p90 {v['slope_p90']:.1f} relief {v['relief']:.0f}")
    blocks = []
    with ThreadPoolExecutor(16) as ex:
        futs = [ex.submit(scan_tile, t) for t in cand.tile]
        for i, f in enumerate(as_completed(futs), 1):
            blocks += f.result()
            if i % 200 == 0:
                print(f"  {i}/{len(futs)} tiles, {len(blocks)} blocks", flush=True)
    print(len(blocks), "blocks scored")
    # score every block against every Moon region
    recs = []
    for b in blocks:
        for code, m in moon.items():
            w1 = wasserstein_slope(b["hist"], np.array(m["slope_hist"]) if "slope_hist" in m else m["hist"])
            dr = abs(np.log(max(b["relief"], 1) / max(m["relief"], 1)))
            recs.append((b["tile"], b["lat"], b["lon"], code, w1, dr, b["slope_p50"], b["slope_p90"], b["relief"]))
    df = pd.DataFrame(recs, columns=["tile", "lat", "lon", "moon", "w1_deg", "dlnrelief", "slope_p50", "slope_p90", "relief_m"])
    df["score"] = df.w1_deg / df.w1_deg.median() + df.dlnrelief / df.dlnrelief.median()
    df = df.merge(s1[["tile", "mat_C", "precip_mm"]], on="tile")
    df.sort_values("score").to_csv(os.path.join(HERE, "results/coarse_blocks.csv"), index=False)
    print("saved results/coarse_blocks.csv")


if __name__ == "__main__":
    main()
