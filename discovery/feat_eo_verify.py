#!/usr/bin/env python3
"""Independent satellite verification of the finalist blocks (results/final_blocks.csv, 20 blocks incl. 4 controls).

Landsat 8/9 Collection 2 Level-2 (NASA/USGS) is primary, Sentinel-2 L2A (ESA) a cross-check; both via Microsoft Planetary Computer
(anonymous read, needs network). For each 20x20 km block: cloud-masked warm/snow-free-season median composite over the last 3 years,
fractions bare / vegetated / snow-ice / water, snow persistence, bright-salt and dark-volcanic fractions, mineral ratios on bare pixels.
Writes results/eo_verify.csv, previews/eo_<id>.png and previews/eo_contact_sheet.png.   Run: python feat_eo_verify.py
"""
import os, sys, warnings
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling
import planetary_computer as pc
from pystac_client import Client
from concurrent.futures import ThreadPoolExecutor
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
N = 256                      # output pixels per side (20 km -> ~78 m)
DATES = "2023-11-01/2026-10-31"
MAXSC = 8


def season_months(lat):
    return {6, 7, 8, 9} if lat >= 0 else {12, 1, 2, 3}


def read(href, bbox, resampling=Resampling.bilinear):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF", GDAL_HTTP_MAX_RETRY="3"):
        with rasterio.open(href) as s:
            b = transform_bounds("EPSG:4326", s.crs, *bbox)
            w = from_bounds(*b, transform=s.transform)
            return s.read(1, window=w, out_shape=(N, N), resampling=resampling, boundless=True, fill_value=0).astype("float64")


def landsat_scene(item, bbox):
    a = item.assets
    bands = {k: read(a[v].href, bbox) for k, v in dict(blue="blue", green="green", red="red", nir="nir08", swir1="swir16", swir2="swir22").items()}
    qa = read(a["qa_pixel"].href, bbox, Resampling.nearest).astype("int64")
    refl = {k: v * 0.0000275 - 0.2 for k, v in bands.items()}
    fill = (qa & 1) > 0
    cloud = ((qa >> 1) & 1) | ((qa >> 2) & 1) | ((qa >> 3) & 1) | ((qa >> 4) & 1)
    snow = (qa >> 5) & 1
    bad = fill | (cloud > 0) | (bands["red"] == 0)
    for k in refl:
        refl[k] = np.where(bad, np.nan, refl[k])
    return refl, np.where(bad, np.nan, snow.astype(float))


def s2_scene(item, bbox):
    a = item.assets
    off = -0.1 if str(item.properties.get("s2:processing_baseline", "04.00")) >= "04.00" else 0.0
    bands = {k: read(a[v].href, bbox) for k, v in dict(blue="B02", green="B03", red="B04", nir="B08", swir1="B11", swir2="B12").items()}
    scl = read(a["SCL"].href, bbox, Resampling.nearest).astype("int64")
    bad = np.isin(scl, [0, 1, 3, 8, 9, 10]) | (bands["red"] == 0)
    refl = {k: np.where(bad, np.nan, v / 10000.0 + off) for k, v in bands.items()}
    snow = np.where(bad, np.nan, (scl == 11).astype(float))
    return refl, snow


def composite(client, lat, lon, collection, reader, platforms=None):
    dlat = 10.0 / 111.32; dlon = 10.0 / (111.32 * np.cos(np.radians(lat)))
    bbox = (lon - dlon, lat - dlat, lon + dlon, lat + dlat)
    q = {"eo:cloud_cover": {"lt": 40}} if collection == "sentinel-2-l2a" else {"eo:cloud_cover": {"lt": 40}, "platform": {"in": platforms}}
    items = list(client.search(collections=[collection], bbox=bbox, datetime=DATES, query=q, max_items=400).items())
    months = season_months(lat)
    sel = [i for i in items if i.datetime.month in months]
    widen = False
    if len(sel) < 5:                       # widen the season month by month
        sel, widen = items, True
    sel = sorted(sel, key=lambda i: i.properties.get("eo:cloud_cover", 100))[:MAXSC]
    stack, snows = [], []
    for it in sel:
        try:
            r, s = reader(pc.sign(it), bbox)
            stack.append(r); snows.append(s)
        except Exception as e:
            print("  scene failed", it.id, str(e)[:60], flush=True)
    if not stack:
        return None
    comp = {k: np.nanmedian(np.stack([s[k] for s in stack]), 0) for k in stack[0]}
    snow_persist = np.nanmean(np.stack(snows), 0)           # fraction of clear scenes in which the pixel is snow
    return comp, snow_persist, len(stack), widen


def classify(comp, snow_persist):
    b, g, r, n, s1, s2 = (comp[k] for k in ("blue", "green", "red", "nir", "swir1", "swir2"))
    ndvi = (n - r) / (n + r + 1e-9)
    ndsi = (g - s1) / (g + s1 + 1e-9)
    vis = (b + g + r) / 3
    valid = np.isfinite(ndvi) & np.isfinite(ndsi)
    snow = valid & (((ndsi > 0.4) & (g > 0.25)) | (snow_persist > 0.5))
    water = valid & ~snow & (ndsi > 0.2) & (n < 0.12) & (vis < 0.15)
    veg = valid & ~snow & ~water & (ndvi >= 0.15)
    bare = valid & ~snow & ~water & ~veg
    f = lambda m: float(m.sum() / max(valid.sum(), 1))
    out = {"valid_frac": float(valid.mean()), "bare_frac": f(bare), "veg_frac": f(veg), "snow_frac": f(snow), "water_frac": f(water),
           "ndvi_mean": float(np.nanmean(ndvi)), "snow_persist_mean": float(np.nanmean(snow_persist))}
    if bare.sum() > 50:
        out.update({"salt_bright_frac": float(((vis > 0.35) & bare).sum() / bare.sum()), "dark_volcanic_frac": float(((vis < 0.10) & bare).sum() / bare.sum()),
                    "clay_idx": float(np.nanmedian((s1 / s2)[bare])), "iron_idx": float(np.nanmedian((r / b)[bare])),
                    "ferrous_idx": float(np.nanmedian((s1 / n)[bare])), "vis_albedo_bare": float(np.nanmedian(vis[bare]))})
    return out


def rgb(comp):
    img = np.stack([comp["red"], comp["green"], comp["blue"]], -1)
    lo, hi = np.nanpercentile(img, 2), np.nanpercentile(img, 98)
    return np.clip(np.nan_to_num((img - lo) / (hi - lo + 1e-9)), 0, 1)


def process(row):
    client = Client.open(STAC)
    res = {"id": row.id, "lat": row.lat, "lon": row.lon}
    img = None
    for tag, coll, rd, plat in [("landsat", "landsat-c2-l2", landsat_scene, ["landsat-8", "landsat-9"]), ("s2", "sentinel-2-l2a", s2_scene, None)]:
        try:
            c = composite(client, row.lat, row.lon, coll, rd, plat)
        except Exception as e:
            print(f"  {row.id} {tag} search/read failed: {str(e)[:80]}", flush=True); c = None
        if c is None:
            res[f"n_scenes_{tag}"] = 0; continue
        comp, sp, n, widen = c
        cl = classify(comp, sp)
        res[f"n_scenes_{tag}"] = n; res[f"season_widened_{tag}"] = widen
        for k, v in cl.items():
            res[f"{k}" if tag == "landsat" else f"s2_{k}"] = v
        if tag == "landsat":
            img = rgb(comp)
        elif img is None:
            img = rgb(comp)
    print("done", row.id, {k: round(v, 2) if isinstance(v, float) else v for k, v in res.items() if k in ("n_scenes_landsat", "bare_frac", "veg_frac", "snow_frac", "water_frac")}, flush=True)
    if img is not None:
        plt.imsave(os.path.join(HERE, f"previews/eo_{row.id}.png"), img)
    return res, img


def main():
    fin = pd.read_csv(os.path.join(HERE, "results/final_blocks.csv"))
    rows = list(fin.itertuples())
    with ThreadPoolExecutor(4) as ex:
        out = list(ex.map(process, rows))
    df = pd.DataFrame([o[0] for o in out])
    flags = []
    for r in df.itertuples():
        f = []
        if getattr(r, "n_scenes_landsat", 0) == 0 and getattr(r, "n_scenes_s2", 0) == 0: f.append("no imagery")
        if getattr(r, "snow_frac", 0) and r.snow_frac > 0.10: f.append("snow/glacier>10%")
        if getattr(r, "water_frac", 0) and r.water_frac > 0.05: f.append("water>5%")
        if getattr(r, "veg_frac", 0) and r.veg_frac > 0.40: f.append("vegetated>40%")
        if getattr(r, "salt_bright_frac", 0) and r.salt_bright_frac > 0.2: f.append("bright salt?")
        if getattr(r, "n_scenes_landsat", 0) and r.n_scenes_landsat < 3: f.append("few scenes")
        flags.append("; ".join(f))
    df["flags"] = flags
    df = fin[["id", "best_moon", "source"]].merge(df, on="id")
    df.to_csv(os.path.join(HERE, "results/eo_verify.csv"), index=False)
    ims = [(o[0]["id"], o[1]) for o in out if o[1] is not None]
    cols = 5; rws = int(np.ceil(len(ims) / cols))
    fig, axs = plt.subplots(rws, cols, figsize=(3.2 * cols, 3.4 * rws))
    for ax in np.atleast_1d(axs).ravel():
        ax.axis("off")
    for ax, (i, im) in zip(np.atleast_1d(axs).ravel(), ims):
        ax.imshow(im); ax.set_title(i[:24], fontsize=7)
    fig.savefig(os.path.join(HERE, "previews/eo_contact_sheet.png"), dpi=110, bbox_inches="tight")
    print("saved results/eo_verify.csv and previews/eo_contact_sheet.png")


if __name__ == "__main__":
    main()
