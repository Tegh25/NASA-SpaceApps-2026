#!/usr/bin/env python3
"""Stage 1 (coarse, global): which 1-degree Earth tiles are cold, dry and rugged?

Uses WorldClim 2.1 (10 arc-min): bio1 mean annual temp (C), bio12 annual precip (mm), bio7 annual T range,
plus its elevation grid. Each 1x1 degree tile = 6x6 cells. Writes results/stage1_tiles.csv.
The Moon's polar regions are cold, airless, dry, rugged: Earth tiles that are cold + dry + rugged are where a
terrain scan is worth the download (a 1-degree Copernicus tile is ~10-30 MB).
Run: python screen_climate.py
"""
import os
import numpy as np
import pandas as pd
import rasterio

HERE = os.path.dirname(os.path.abspath(__file__))
WC = os.path.join(HERE, "data/earth/worldclim")


def load(name):
    with rasterio.open(os.path.join(WC, name)) as s:
        a = s.read(1).astype("float64")
        nd = s.nodata
    if nd is not None:
        a[a == nd] = np.nan
    a[a < -1e30] = np.nan
    return a  # 1080 rows (lat 90..-90) x 2160 cols (lon -180..180)


def tiles(a):
    """Reshape to (180, 6, 360, 6) => per 1-degree tile stats."""
    return a.reshape(180, 6, 360, 6).transpose(0, 2, 1, 3).reshape(180, 360, 36)


def main():
    bio1, bio12, bio7, elev = (load(f) for f in ["wc2.1_10m_bio_1.tif", "wc2.1_10m_bio_12.tif", "wc2.1_10m_bio_7.tif", "wc2.1_10m_elev.tif"])
    t1, t12, t7, te = tiles(bio1), tiles(bio12), tiles(bio7), tiles(elev)
    valid = np.isfinite(t1).mean(-1)
    mat = np.nanmean(t1, -1); pre = np.nanmean(t12, -1); rng = np.nanmean(t7, -1)
    estd = np.nanstd(te, -1); emax = np.nanmax(te, -1); emean = np.nanmean(te, -1)
    rows = []
    for i in range(180):
        for j in range(360):
            if valid[i, j] < 0.5:
                continue
            lat0 = 90 - (i + 1)   # south edge of the tile
            lon0 = -180 + j       # west edge
            code = f"{'N' if lat0 >= 0 else 'S'}{abs(lat0):02d}_{'E' if lon0 >= 0 else 'W'}{abs(lon0):03d}"
            rows.append((code, lat0, lon0, mat[i, j], pre[i, j], rng[i, j], estd[i, j], emean[i, j], emax[i, j]))
    df = pd.DataFrame(rows, columns=["tile", "lat0", "lon0", "mat_C", "precip_mm", "trange_C", "elev_std_m", "elev_mean_m", "elev_max_m"])
    df.to_csv(os.path.join(HERE, "results/stage1_tiles.csv"), index=False)
    print(len(df), "land tiles with climate data")
    for label, m in {
        "cold (MAT<=0C)": df.mat_C <= 0,
        "cold+dry (precip<=350)": (df.mat_C <= 0) & (df.precip_mm <= 350),
        "cold+dry+rugged (elev std>=100 m)": (df.mat_C <= 0) & (df.precip_mm <= 350) & (df.elev_std_m >= 100),
        "dry any temp, rugged": (df.precip_mm <= 150) & (df.elev_std_m >= 150),
    }.items():
        print(f"{label:38s} {int(m.sum()):5d} tiles")


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    main()
