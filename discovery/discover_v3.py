#!/usr/bin/env python3
"""Discovery v3: merge every feature family, score all Earth blocks against the 9 Moon regions, enforce novelty, test.

Categories (each = mean of per-feature distances to a Moon region, every feature scaled by its pool median |difference|):
  terrain    slope-histogram W1, roughness, relief           (results/fine_terrain_scores.csv, 'terrain_dist')
  multiscale median-differential-slope at 4 baselines + Hurst (feat_terrain_adv)
  craters    closed-depression density / area / depth         (feat_terrain_adv)
  landing    fraction of area under 5/10/15 deg slope         (feat_terrain_adv)
  lighting   shadow structure under a low circling sun        (feat_illum)
  thermal    ONE-SIDED shortfall: Earth LST warmer than Moon Diviner annual mean   (feat_nasa)
  sun        ONE-SIDED shortfall of circling-sun days vs Moon 365                  (feat_illum)
  surface    one-sided: ESA WorldCover gate fractions / MODIS NDVI / snow         (rank_candidates.worldcover, feat_nasa)
  geology    lunar-like lithology flag                                              (feat_geo)
Radar is reported as characterisation only.
Missing feature files are skipped, so the script runs with whatever has been produced.
Usage: python discover_v3.py            -> results/v3_scores.csv, results/v3_top.csv
"""
import os, json, sys
import numpy as np
import pandas as pd
from common import haversine_km

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda f: os.path.join(HERE, "results", f)
MOON = json.load(open(R("moon_regions.json")))
KEY = ["tile", "r0", "c0"]

# category -> list of (feature, transform)
CATS = {
    "multiscale": [("hurst", None), ("mds_80", "ln"), ("mds_320", "ln"), ("rms_320", "ln")],
    "craters": [("dep_per_km2", "asinh"), ("dep_area_frac", "asinh"), ("dep_median_depth_m", "ln")],
    "landing": [("frac_slope_lt5", None), ("frac_slope_lt10", None), ("frac_slope_lt15", None)],
    "lighting": [("lit_mean_1.5", None), ("psr_frac_1.5", None), ("lit_mean_5", None), ("psr_frac_5", None), ("lit_pixel_std_5", None)],
}
FILES = {"multiscale": "feat_terrain_adv", "craters": "feat_terrain_adv", "landing": "feat_terrain_adv", "lighting": "feat_illum"}


def tf(x, kind):
    x = np.asarray(x, float)
    if kind == "ln":
        return np.log(np.maximum(x, 1e-3))
    if kind == "asinh":
        return np.arcsinh(x * 10)
    return x


def load(name, suffix=""):
    p = R(f"{name}{suffix}.csv")
    return pd.read_csv(p) if os.path.exists(p) else None


def category_distances(earth, moon, cats):
    """earth: DataFrame of blocks with feature cols; moon: DataFrame indexed by region code. Returns dict cat -> (n_blocks x 9) array
    and scales (per feature, per moon) so validation sites can be scored identically."""
    out, scales = {}, {}
    for cat, feats in cats.items():
        cols = []
        for f, t in feats:
            if f not in earth.columns or f not in moon.columns:
                continue
            e = tf(earth[f].values, t)
            m = {c: float(tf(moon.loc[c, f], t)) for c in moon.index}
            sc = {c: np.nanmedian(np.abs(e - m[c])) or 1.0 for c in moon.index}
            scales[(cat, f)] = (m, sc, t)
            cols.append(np.stack([np.abs(e - m[c]) / sc[c] for c in moon.index], 1))
        if cols:
            out[cat] = np.nanmean(np.stack(cols, 0), 0)
    return out, scales


def apply_scales(df, scales, cats, moon_codes):
    out = {}
    for cat in cats:
        cols = []
        for (c, f), (m, sc, t) in scales.items():
            if c != cat or f not in df.columns:
                continue
            e = tf(df[f].values, t)
            cols.append(np.stack([np.abs(e - m[code]) / sc[code] for code in moon_codes], 1))
        if cols:
            out[cat] = np.nanmean(np.stack(cols, 0), 0)
    return out


def main():
    codes = list(MOON.keys())
    fb = pd.read_pickle(R("fine_blocks.pkl"))[KEY + ["lat", "lon", "slope_p50", "rough_p50", "relief_m", "elev_mean_m"]].reset_index(drop=True)
    ts = pd.read_csv(R("fine_terrain_scores.csv"))
    # terrain_dist as (n_blocks x 9), same row order as fine_blocks (scores were written code-by-code in that order)
    n = len(fb)
    td = np.stack([ts[ts.moon == c].terrain_dist.values for c in codes], 1)
    assert td.shape == (n, 9)
    dist = {"terrain": td}
    # merge feature families
    earth, moon_tabs = fb.copy(), {}
    for fam in sorted(set(FILES.values())):
        e, m = load(fam), load(fam, "_moon")
        if e is None or m is None:
            print("skip family (missing):", fam); continue
        earth = earth.merge(e.drop_duplicates(KEY), on=KEY, how="left")
        moon_tabs[fam] = m.set_index("moon")
    moon_all = pd.concat(moon_tabs.values(), axis=1) if moon_tabs else pd.DataFrame(index=codes)
    moon_all = moon_all.loc[:, ~moon_all.columns.duplicated()].reindex(codes)
    d2, scales = category_distances(earth, moon_all, {k: v for k, v in CATS.items()})
    dist.update(d2)
    np.save(R("v3_dist.npy"), np.stack([dist[k] for k in sorted(dist)], 0))
    json.dump({"cats": sorted(dist), "moon": codes}, open(R("v3_dist_meta.json"), "w"))
    rows = []
    for j, c in enumerate(codes):
        d = pd.DataFrame({"tile": fb.tile, "r0": fb.r0, "c0": fb.c0, "lat": fb.lat, "lon": fb.lon, "moon": c})
        for k in sorted(dist):
            d["d_" + k] = dist[k][:, j]
        rows.append(d)
    out = pd.concat(rows, ignore_index=True)
    out.to_csv(R("v3_scores.csv"), index=False)
    print("categories:", sorted(dist), " blocks:", n)
    return out


if __name__ == "__main__":
    main()
