#!/usr/bin/env python3
"""Tests for the v3 multi-category engine.
 T1  validation sites (26 known analogs + 10 negatives): per-category and composite separation (AUC) and percentile vs the 12k-block pool
 T2  leave-one-category-out ablation (AUC, median known percentile, top-100 overlap)
 T3  catalog test: do pool blocks inside known-analog zones (known_analogs_v2.csv, moon/both, high+medium) score better than blocks outside?
 T4  weight-stability: 1,000 Dirichlet weight draws -> how often each candidate region stays in the top set
Run: python v3_test.py     (writes results/v3_test_*.csv and prints the tables)
"""
import os, json
import numpy as np
import pandas as pd
from common import haversine_km
from rank_candidates import worldcover, surface_gate
from validate import block_at
from v3_run import WEIGHTS, CODES, MOON, cat_dist, composite, moon_table, R
import v3_rank

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)


def auc(pos, neg):
    """P(score_pos better (lower) than score_neg)."""
    pos, neg = np.asarray(pos, float), np.asarray(neg, float)
    return float(np.mean([(p < n) + 0.5 * (p == n) for p in pos for n in neg]))


def site_frame():
    sites = pd.read_csv(os.path.join(HERE, "validation_sites.csv"))
    df = sites.copy()
    for f in ["feat_terrain_adv", "feat_illum", "feat_nasa", "feat_geo"]:
        e = pd.read_csv(R(f + "_validation.csv"))
        e = e[[c for c in e.columns if c == "id" or c not in df.columns]]
        df = df.merge(e, on="id", how="left")
    return df


def terrain_site(df, fb):
    """terrain_dist per Moon region for each site block (same normalisation as the pool)."""
    moon = json.load(open(R("moon_regions.json")))
    H = np.stack(fb["hist"].values)
    out = np.full((len(df), 9), np.nan)
    for j, c in enumerate(CODES):
        m = moon[c]; mh = np.array(m["slope_hist"])
        w1p = np.abs(np.cumsum(H, 1) - np.cumsum(mh)).sum(1)
        drp = np.abs(fb.rough_p50.values - m["rough_p50"])
        dlp = np.abs(np.log(fb.relief_m.values / max(m["relief_p5_p95_m"], 1)))
        nm = (np.median(w1p), np.median(drp), np.median(dlp))
        for i, s in enumerate(df.itertuples()):
            b = block_at(s.lat, s.lon)
            if b is None:
                continue
            w1 = float(np.abs(np.cumsum(b["hist"]) - np.cumsum(m["slope_hist"])).sum())
            out[i, j] = (w1 / nm[0] + abs(b["rough_p50"] - m["rough_p50"]) / nm[1]
                         + abs(np.log(max(b["relief_m"], 1) / max(m["relief_p5_p95_m"], 1))) / nm[2]) / 3
    return out


def main():
    blob = pd.read_pickle(R("v3_cats.pkl"))
    pd_, df_pool, scales, moon = blob["dists"], blob["df"], blob["scales"], blob["moon"]
    fb = pd.read_pickle(R("fine_blocks.pkl"))
    W0 = {k: v for k, v in WEIGHTS.items() if k not in ("surface",)}     # surface handled by the gate for the percentile tests
    pool_best = composite(pd_, W0).min(1)
    # ---- site categories
    sdf = site_frame()
    sd, _ = cat_dist(sdf, moon, scales)
    sd["terrain"] = terrain_site(sdf, fb)
    ok = np.isfinite(sd["terrain"]).any(1)
    kind = sdf.kind.values
    res = {"id": sdf.id.values}
    # ---- T1
    rows = []
    cats = [c for c in W0 if c in sd]
    for c in cats + ["COMPOSITE"]:
        if c == "COMPOSITE":
            s_best = composite(sd, W0).min(1)
            p_best = pool_best
        else:
            s_best = np.nanmin(np.where(np.isfinite(sd[c]), sd[c], np.nan), 1) if c in sd else np.full(len(sdf), np.nan)
            p_best = np.nanmin(pd_[c], 1) if c in pd_ else None
        m = ok & np.isfinite(s_best)
        a = auc(s_best[m & (kind == "known")], s_best[m & (kind == "negative")])
        pct = np.array([100.0 * np.mean(p_best[np.isfinite(p_best)] > v) if np.isfinite(v) else np.nan for v in s_best])
        rows.append({"category": c, "AUC_known_vs_negative": round(a, 2), "median_pctile_known": round(float(np.nanmedian(pct[kind == "known"])), 1),
                     "median_pctile_negative": round(float(np.nanmedian(pct[kind == "negative"])), 1),
                     "known_ge75th": int(np.nansum(pct[kind == "known"] >= 75))})
    t1 = pd.DataFrame(rows)
    t1.to_csv(R("v3_test_T1_categories.csv"), index=False)
    print("== T1  separation of 26 known analogs vs 10 negative controls (lower distance = more Moon-like)")
    print(t1.to_string(index=False))
    comp_s = composite(sd, W0).min(1)
    pct_c = np.array([100.0 * np.mean(pool_best > v) for v in comp_s])
    det = sdf[["id", "kind"]].assign(composite=comp_s.round(2), pctile=pct_c.round(1), best_moon=[CODES[j] for j in np.nanargmin(composite(sd, W0), 1)])
    det.to_csv(R("v3_test_T1_sites.csv"), index=False)
    print("\nTop known analogs by composite percentile:")
    print(det[det.kind == "known"].sort_values("pctile", ascending=False).head(10).to_string(index=False))
    print("Negatives (max):", det[det.kind == "negative"].pctile.max())
    # ---- T2 ablation
    rows = []
    base_top = set(np.argsort(pool_best)[:100])
    for drop in [None] + cats:
        w = {k: v for k, v in W0.items() if k != drop}
        sb = composite(sd, w).min(1); pb = composite(pd_, w).min(1)
        pct = np.array([100.0 * np.mean(pb > v) for v in sb])
        rows.append({"dropped": drop or "(none)", "AUC": round(auc(sb[ok & (kind == "known")], sb[ok & (kind == "negative")]), 2),
                     "median_pctile_known": round(float(np.nanmedian(pct[kind == "known"])), 1),
                     "top100_overlap_with_full": round(len(base_top & set(np.argsort(pb)[:100])) / 100, 2)})
    t2 = pd.DataFrame(rows); t2.to_csv(R("v3_test_T2_ablation.csv"), index=False)
    print("\n== T2  leave-one-category-out"); print(t2.to_string(index=False))
    # ---- T3 catalog
    cat = pd.read_csv(os.path.join(HERE, "known_analogs_v2.csv"))
    cat = cat[cat.body.isin(["moon", "both"]) & cat.confidence.isin(["high", "medium"])]
    dd = np.array([haversine_km(a, b, cat.lat.values, cat.lon.values) for a, b in zip(df_pool.lat, df_pool.lon)])
    inzone = (dd < np.maximum(30.0, cat.radius_km.values[None, :])).any(1)
    terr_only = np.nanmin(pd_["terrain"], 1)
    rows = []
    for nm, sc in [("terrain only", terr_only), ("composite (no surface)", pool_best)] + [(c, np.nanmin(pd_[c], 1)) for c in cats if c != "terrain"]:
        m = np.isfinite(sc)
        rows.append({"score": nm, "blocks_in_known_zones": int(inzone[m].sum()), "AUC_inzone_vs_outside": round(auc(sc[m & inzone][:600], sc[m & ~inzone][::10][:900]), 3)})
    t3 = pd.DataFrame(rows); t3.to_csv(R("v3_test_T3_catalog.csv"), index=False)
    print("\n== T3  pool blocks inside known moon/both analog zones (high+medium) vs outside; AUC > 0.5 = known zones score as more Moon-like")
    print(t3.to_string(index=False))
    # ---- T4 stability
    out, cl = v3_rank.main(verbose=False)
    gate = out.gate.values & ~out.inside_known_zone.values
    idx = np.where(gate)[0]
    keys = list(WEIGHTS)
    dsub = {c: pd_[c][idx] for c in pd_}
    srf = np.repeat(v3_rank.surface_cat(df_pool, pd.read_csv(R("v3_wc.csv")))[0][idx][:, None], 9, 1)
    dsub["surface"] = srf
    base = np.array([WEIGHTS[k] for k in keys])
    hits = np.zeros(len(idx))
    N = 1000
    for _ in range(N):
        w = rng.dirichlet(base * 4 + 0.2) * base.sum()
        c = composite(dsub, dict(zip(keys, w))).min(1)
        hits[np.argsort(c)[:40]] += 1
    out_g = out.iloc[idx].copy(); out_g["p_top40"] = hits / N
    out_g.to_csv(R("v3_test_T4_stability.csv"), index=False)
    cl["p_top40"] = [out_g[(haversine_km(r.lat, r.lon, out_g.lat.values, out_g.lon.values) < 25)].p_top40.max() for r in cl.itertuples()]
    cl.to_csv(R("v3_clusters.csv"), index=False)
    print("\n== T4  stability of the top clusters under 1,000 random weightings (share of draws in which the block is in the top 40)")
    print(cl[["lat", "lon", "moon", "composite", "p_top40", "near_known_km", "near_known"]].head(20).round(2).to_string(index=False))


if __name__ == "__main__":
    main()
