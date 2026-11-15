#!/usr/bin/env python3
"""Discovery v3 core: merge all feature families, score every Earth block against the 9 Artemis III regions, apply gate + novelty.

Per category, distance to a Moon region = mean over its features of |Earth - Moon| / (pool median |Earth - Moon|), so a typical block scores ~1
and a close match scores well below 1. One-sided categories (thermal, ice, sun, surface) only count the SHORTFALL relative to the Moon.
Writes: results/v3_cats.pkl (blocks x moons x categories), results/v3_wc.csv (WorldCover for the top-N blocks), results/v3_candidates.csv
Run:  python v3_run.py
"""
import os, json
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
from common import haversine_km
from rank_candidates import worldcover, surface_gate

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda f: os.path.join(HERE, "results", f)
KEY = ["tile", "r0", "c0"]
MOON = json.load(open(R("moon_regions.json")))
CODES = list(MOON.keys())

WEIGHTS = {"terrain": 2.0, "multiscale": 1.0, "craters": 1.0, "landing": 1.0, "lighting": 1.0,
           "thermal": 1.0, "ice": 1.0, "sun": 1.0, "surface": 1.0, "geology": 0.5}
TWO_SIDED = {  # category -> [(feature, transform)]
    "multiscale": [("hurst", "h"), ("mds_80", "ln"), ("mds_320", "ln"), ("rms_320", "ln")],
    "craters": [("dep_per_km2", "asinh"), ("dep_area_frac", "asinh"), ("dep_median_depth_m", "ln")],
    "landing": [("frac_slope_lt5", None), ("frac_slope_lt10", None), ("frac_slope_lt15", None)],
    "lighting": [("lit_mean_1.5", None), ("psr_frac_1.5", None), ("lit_mean_5", None), ("psr_frac_5", None), ("lit_pixel_std_5", None)],
}


def tf(x, kind):
    x = np.asarray(x, float)
    if kind == "ln":
        return np.log(np.maximum(x, 1e-2))
    if kind == "asinh":
        return np.arcsinh(x * 10)
    if kind == "h":
        return np.clip(x, 0.3, 1.3)
    return x


def moon_table():
    t = pd.read_csv(R("feat_terrain_adv_moon.csv")).set_index("moon")
    i = pd.read_csv(R("feat_illum_moon.csv")).set_index("moon")
    m = t.join(i, rsuffix="_ill")
    m["temp_avg_K"] = [MOON[c]["temp_avg_K_median"] for c in m.index]
    m["ice_frac"] = [MOON[c]["ice_stable_le1m_frac"] for c in m.index]
    return m.reindex(CODES)


def earth_ice_proxy(df):
    return (df["frozen_frac"] * (1 - df["snow_frac"].fillna(0))).clip(0, 1)


def cat_dist(df, moon, scales=None):
    """df: block/site features. Returns dict cat -> (n x 9) distances, and the scales used (so sites reuse the pool's scales)."""
    out, sc_out = {}, {} if scales is None else scales
    for cat, feats in TWO_SIDED.items():
        cols = []
        for f, t in feats:
            if f not in df.columns or f not in moon.columns:
                continue
            e = tf(df[f].values, t)
            m = tf(moon[f].values, t)
            diff = np.abs(e[:, None] - m[None, :])
            if scales is None:
                sc_out[(cat, f)] = np.nanmedian(diff, 0)
            cols.append(diff / sc_out[(cat, f)][None, :])
        if cols:
            d = np.nanmean(np.stack(cols, 0), 0)
            if cat == "lighting":   # truncated shadow context -> neutral
                d = np.where((df["ctx_valid_frac"].values >= 0.5)[:, None], d, np.nan)
            out[cat] = d
    # one-sided
    gap = np.maximum(0, df["lst_mean_K"].values[:, None] - moon["temp_avg_K"].values[None, :])
    if scales is None:
        sc_out["thermal"] = np.nanmedian(gap, 0)
    out["thermal"] = gap / sc_out["thermal"][None, :]
    ice = np.maximum(0, moon["ice_frac"].values[None, :] - earth_ice_proxy(df).values[:, None])
    if scales is None:
        sc_out["ice"] = np.maximum(np.nanmedian(ice, 0), 1e-3)
    out["ice"] = ice / sc_out["ice"][None, :]
    sun = (365 - df["sun_days"].values)[:, None] * np.ones((1, len(CODES)))
    if scales is None:
        sc_out["sun"] = np.nanmedian(sun, 0)
    out["sun"] = sun / sc_out["sun"][None, :]
    gl = (1 - df["lunar_like_frac"].fillna(0).clip(0, 1).values)[:, None] * np.ones((1, len(CODES)))
    out["geology"] = gl
    return out, sc_out


def composite(dists, weights, nan_fill=1.0):
    num = 0.0; den = 0.0
    for c, w in weights.items():
        if c not in dists or w == 0:
            continue
        d = np.where(np.isfinite(dists[c]), dists[c], nan_fill)
        num = num + w * d; den += w
    return num / den


def main():
    fb = pd.read_pickle(R("fine_blocks.pkl"))[KEY + ["lat", "lon", "slope_p50", "rough_p50", "relief_m", "elev_mean_m"]].reset_index(drop=True)
    ts = pd.read_csv(R("fine_terrain_scores.csv"))
    n = len(fb)
    td = np.stack([ts[ts.moon == c].terrain_dist.values for c in CODES], 1)
    assert td.shape == (n, 9)
    df = fb
    for name in ["feat_terrain_adv", "feat_illum", "feat_nasa", "feat_geo"]:
        e = pd.read_csv(R(name + ".csv"))
        e = e[[c for c in e.columns if c in KEY or (c not in df.columns and c not in ("lith_main", "lith_all", "lith_text", "priority_block", "modis_tile"))]]
        df = df.merge(e.drop_duplicates(KEY), on=KEY, how="left", suffixes=("", "_dup"))
    assert len(df) == n
    moon = moon_table()
    dists, scales = cat_dist(df, moon)
    dists["terrain"] = td
    pd.to_pickle({"dists": dists, "scales": scales, "moon": moon, "df": df}, R("v3_cats.pkl"))
    # preliminary composite WITHOUT surface (needs WorldCover) to choose which blocks to fetch WorldCover for
    w0 = {k: v for k, v in WEIGHTS.items() if k not in ("surface", "geology")}
    c0 = composite(dists, w0)
    best0 = c0.min(1)
    cover = (df.lat > -60) & (df.lat < 82.5)
    order = np.argsort(np.where(cover, best0, np.inf))[:4500]
    sel = df.iloc[order][["lat", "lon"]].round(3).drop_duplicates()
    print(f"fetching WorldCover for {len(sel)} blocks ...", flush=True)
    with ThreadPoolExecutor(16) as ex:
        wcs = list(ex.map(lambda t: worldcover(*t), zip(sel.lat, sel.lon)))
    wc = pd.DataFrame([w for w in wcs], index=range(len(sel)))
    wc["lat"], wc["lon"] = sel.lat.values, sel.lon.values
    wc.to_csv(R("v3_wc.csv"), index=False)
    print("WorldCover rows with data:", int(wc.wc_bare.notna().sum()))


if __name__ == "__main__":
    main()
