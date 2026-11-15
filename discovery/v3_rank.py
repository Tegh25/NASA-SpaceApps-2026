#!/usr/bin/env python3
"""Rank v3 candidates: composite over all categories, hard surface gate, novelty vs known_analogs_v2.csv, cluster into regions.
Reads results/v3_cats.pkl + results/v3_wc.csv. Writes results/v3_candidates.csv (blocks) and results/v3_clusters.csv (regions).
Run: python v3_rank.py
"""
import os, json
import numpy as np
import pandas as pd
from common import haversine_km
from rank_candidates import surface_gate
from v3_run import WEIGHTS, CODES, composite, R

HERE = os.path.dirname(os.path.abspath(__file__))


def surface_cat(df, wc):
    """one-sided surface distance (0 = bare rock, 1 = typical) + hard gate; only defined where WorldCover was fetched."""
    m = df[["lat", "lon"]].round(3).merge(wc, on=["lat", "lon"], how="left")
    rock = (m.wc_bare.fillna(0) + m.wc_moss.fillna(0)).values
    ndvi = df["ndvi_max"].fillna(0.3).values
    d = 0.5 * (1 - np.minimum(1, rock / 0.9)) + 0.5 * np.clip(ndvi / 0.3, 0, 2)
    gate = np.array([surface_gate({c: r[c] for c in ("wc_bare", "wc_moss", "wc_snow", "wc_water", "wc_tree", "wc_crop_built")}) if pd.notna(r.wc_bare) else False
                     for _, r in m.iterrows()])
    return d, gate, m


def novelty(lat, lon, cat):
    d = np.array([haversine_km(a, b, cat.lat.values, cat.lon.values) for a, b in zip(lat, lon)])   # n x k
    j = d.argmin(1)
    near = d[np.arange(len(d)), j]
    inside = (d < np.maximum(50.0, cat.radius_km.values[None, :])).any(1)
    return near, cat.name.values[j], inside


def main(weights=None, top=30, verbose=True):
    weights = weights or WEIGHTS
    blob = pd.read_pickle(R("v3_cats.pkl"))
    dists, df = blob["dists"], blob["df"]
    wc = pd.read_csv(R("v3_wc.csv"))
    sd, gate, wcm = surface_cat(df, wc)
    dists["surface"] = np.repeat(sd[:, None], 9, 1)
    comp = composite(dists, weights)                       # n x 9
    best = comp.argmin(1)
    out = df[["tile", "r0", "c0", "lat", "lon", "slope_p50", "rough_p50", "relief_m", "elev_mean_m", "lst_mean_K", "frozen_frac", "sun_days",
              "psr_frac_1.5", "dep_per_km2", "frac_slope_lt10", "ndvi_max", "lunar_like_frac", "ctx_valid_frac"]].copy()
    out["moon"] = [CODES[j] for j in best]
    out["composite"] = comp[np.arange(len(best)), best]
    for c in dists:
        out["d_" + c] = dists[c][np.arange(len(best)), best]
    out["rock_frac"] = (wcm.wc_bare.fillna(0) + wcm.wc_moss.fillna(0)).values
    out["gate"] = gate
    cat = pd.read_csv(os.path.join(HERE, "known_analogs_v2.csv"))
    sel = out.gate.values
    near, nname, inside = np.full(len(out), np.nan), np.array([""] * len(out), dtype=object), np.zeros(len(out), bool)
    n_, nm_, in_ = novelty(out.lat.values[sel], out.lon.values[sel], cat)
    near[sel], nname[sel], inside[sel] = n_, nm_, in_
    out["near_known_km"], out["near_known"], out["inside_known_zone"] = near, nname, inside
    out.to_csv(R("v3_candidates.csv"), index=False)
    ok = out[out.gate & ~out.inside_known_zone].sort_values("composite")
    clusters = []
    for r in ok.itertuples():
        if all(haversine_km(r.lat, r.lon, c.lat, c.lon) > 40 for c in clusters):
            clusters.append(r)
        if len(clusters) == top:
            break
    cl = pd.DataFrame(clusters).drop(columns="Index")
    cl.to_csv(R("v3_clusters.csv"), index=False)
    if verbose:
        pd.set_option("display.width", 280); pd.set_option("display.max_columns", 60)
        print(f"blocks {len(out)}; gate pass {int(out.gate.sum())}; also outside known zones {len(ok)}")
        print(cl[["lat", "lon", "moon", "composite", "d_terrain", "d_multiscale", "d_craters", "d_landing", "d_lighting", "d_thermal", "d_ice", "d_sun", "d_surface",
                  "lst_mean_K", "sun_days", "rock_frac", "near_known_km", "near_known"]].round(2).to_string(index=False))
    return out, cl


if __name__ == "__main__":
    main()
