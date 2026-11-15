#!/usr/bin/env python3
"""Mars stage A: terrain distance of every pool block (30 km, 200 m) to each Mars site, novelty prefilter, shortlist + validation set.
Needs results/pool_blocks.pkl, results/mars_sites.json, catalogs. Writes results/stageA_scores.csv (all blocks x sites, long),
results/stageA_shortlist.csv (blocks to enrich with geology/MODIS), results/validation_sites.csv (known Mars analogs + negatives).
Run: ../.venv/bin/python mars_stageA.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, pandas as pd, rasterio
from rasterio.enums import Resampling
from common import slope_degrees, roughness_plane3, slope_hist, haversine_km, tile_url
from mars_scan import name as tname, PIX, BLOCK

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda f: os.path.join(HERE, "results", f)
SITES = json.load(open(R("mars_sites.json")))
CODES = [k for k in SITES if not k.startswith("_")]
TOPN, SEP_KM, MIN_KNOWN_KM = 120, 30, 100.0


def catalog():
    p = [os.path.join(HERE, "../known_analogs_v2.csv"), os.path.join(HERE, "../known_analogs_v3_additions.csv"), os.path.join(HERE, "known_mars_analogs_additions.csv")]
    return pd.concat([pd.read_csv(x) for x in p if os.path.exists(x)], ignore_index=True)


def terrain_dist(df, H, norm=None):
    out, nm = np.zeros((len(df), len(CODES))), {} if norm is None else norm
    for j, c in enumerate(CODES):
        m = SITES[c]["terrain"] if "terrain" in SITES[c] else SITES[c]
        mh = np.array(m["slope_hist"])
        w1 = np.abs(np.cumsum(H, 1) - np.cumsum(mh)).sum(1)
        dr = np.abs(df.rough_p50.values - m["rough_p50"])
        dl = np.abs(np.log(np.maximum(df.relief_m.values, 1) / max(m["relief_m"], 1)))
        if norm is None:
            nm[c] = (np.median(w1), np.median(dr), np.median(dl))
        out[:, j] = (w1 / nm[c][0] + dr / nm[c][1] + dl / nm[c][2]) / 3
    return out, nm


def block_at(lat, lon):
    code = f"{'N' if lat >= 0 else 'S'}{abs(int(np.floor(lat))):02d}_{'E' if lon >= 0 else 'W'}{abs(int(np.floor(lon))):03d}"
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3"):
            with rasterio.open(tile_url(tname(code))) as s:
                b = s.bounds; lat_mid = (b.top + b.bottom) / 2
                oh = int(round((b.top - b.bottom) * 111320.0 / PIX)); ow = int(round((b.right - b.left) * 111320.0 * np.cos(np.radians(lat_mid)) / PIX))
                dem = s.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
    except Exception:
        return None
    dem[np.abs(dem) > 1e5] = np.nan
    bp = int(BLOCK / PIX)
    r = int((b.top - lat) / (b.top - b.bottom) * oh) - bp // 2; c = int((lon - b.left) / (b.right - b.left) * ow) - bp // 2
    r, c = min(max(r, 0), oh - bp), min(max(c, 0), ow - bp)
    d = dem[r:r + bp, c:c + bp]
    if np.isfinite(d).mean() < 0.5:
        return None
    sl, rg = slope_degrees(d, PIX, PIX), roughness_plane3(d); z = d[np.isfinite(d)]
    sv = sl[np.isfinite(sl)]
    return dict(hist=slope_hist(sl), slope_p50=float(np.percentile(sv, 50)), slope_p90=float(np.percentile(sv, 90)), rough_p50=float(np.nanpercentile(rg, 50)),
                relief_m=float(np.percentile(z, 95) - np.percentile(z, 5)), elev_mean_m=float(z.mean()))


def main():
    df = pd.read_pickle(R("pool_blocks.pkl")).reset_index(drop=True)
    H = np.stack(df["hist"].values)
    td, norm = terrain_dist(df, H)
    json.dump({c: list(map(float, v)) for c, v in norm.items()}, open(R("stageA_norm.json"), "w"))
    cat = catalog()
    d = np.array([haversine_km(a, b, cat.lat.values, cat.lon.values) for a, b in zip(df.lat, df.lon)])
    near = d.min(1); nname = cat.name.values[d.argmin(1)]
    inside = (d < np.maximum(MIN_KNOWN_KM, cat.radius_km.values[None, :])).any(1)
    df["near_known_km"], df["near_known"], df["inside_known"] = near, nname, inside
    for j, c in enumerate(CODES):
        df["td_" + c] = td[:, j]
    df["td_best"] = td.min(1); df["best_site"] = [CODES[k] for k in td.argmin(1)]
    df.drop(columns="hist").to_csv(R("stageA_scores.csv"), index=False)
    print(f"pool {len(df)}; inside known zones (<{MIN_KNOWN_KM:.0f} km or radius): {int(inside.sum())}; novel: {int((~inside).sum())}")
    keep = []
    for j, c in enumerate(CODES):
        s = df[~df.inside_known].assign(td=td[~df.inside_known.values, j]).sort_values("td")
        ch = []
        for r in s.itertuples():
            if all(haversine_km(r.lat, r.lon, df.lat[k], df.lon[k]) > SEP_KM for k in ch):
                ch.append(r.Index)
            if len(ch) == TOPN:
                break
        keep += ch
        print(f"  {c}: best novel terrain_dist {td[ch[0], j]:.2f} at ({df.lat[ch[0]]:.2f}, {df.lon[ch[0]]:.2f}); {TOPN}th {td[ch[-1], j]:.2f}")
    keep = sorted(set(keep))
    sl = df.loc[keep, ["tile", "r0", "c0", "lat", "lon"]].copy(); sl.insert(0, "id", [f"B{i:04d}" for i in keep])
    sl.to_csv(R("stageA_shortlist.csv"), index=False)
    print("shortlist blocks:", len(sl))


if __name__ == "__main__":
    main()
