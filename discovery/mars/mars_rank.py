#!/usr/bin/env python3
"""Mars composite ranking + tests. Inputs: results/stageA_scores.csv (terrain), enrich_geo.csv, enrich_nasa.csv, validation_sites.csv, mars_sites.json.
Categories (distance to each Mars site, lower = closer; each divided by its median over the enriched set):
  terrain   200 m slope histogram / roughness / relief (stage A)
  geology   Macrostrat lithology mix vs the site's CRISM/OMEGA-based mix (class C targets below)
  albedo    MODIS shortwave albedo vs TES albedo (class B: different instruments)
  swing     ONE-SIDED shortfall of the diurnal LST range vs the 95th percentile of Earth blocks (Mars swings are huge)
  dryness   ONE-SIDED POWER precipitation;  vegetation  ONE-SIDED MODIS NDVI;  pressure  ONE-SIDED surface pressure;  cold  ONE-SIDED mean LST above 215 K
Gate: MODIS NDVI max <= 0.20 and snow fraction <= 0.10.   Writes results/mars_candidates.csv, mars_clusters.csv, mars_test_*.csv
Run: ../.venv/bin/python mars_rank.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import numpy as np, pandas as pd
from common import haversine_km

HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda f: os.path.join(HERE, "results", f)
SITES = json.load(open(R("mars_sites.json")))
CODES = [k for k in SITES if not k.startswith("_")]
W = {"terrain": 2.0, "geology": 2.0, "albedo": 1.0, "swing": 0.5, "dryness": 1.0, "vegetation": 1.0, "pressure": 0.5, "cold": 0.5}
CLASSES = ["mafic", "clay", "evaporite", "carbonate", "sand", "alluvium", "other"]
# class C: dominant surface lithologies at each site from CRISM/OMEGA detections and site papers (see mars_scout_notes.md)
LITH_T = {"jezero": dict(mafic=.35, clay=.25, carbonate=.25, sand=.15), "oxia": dict(clay=.5, mafic=.4, sand=.1),
          "gale": dict(clay=.45, evaporite=.25, sand=.15, mafic=.15), "meridiani": dict(evaporite=.35, other=.3, mafic=.25, alluvium=.1)}
ALB = {c: SITES[c]["context"]["albedo"]["value"]["mean"] for c in CODES}


def lith_vec(g):
    v = np.stack([g.frac_mafic_volcanic, g.frac_clay_rich_sedimentary, g.frac_evaporite, g.frac_carbonate, g.frac_sand_eolian, g.frac_alluvium_unconsolidated,
                  g.frac_felsic_volcanic_plutonic + g.frac_ultramafic + g.frac_metamorphic + g.frac_siliciclastic_other + g.frac_other], 1).astype(float)
    v = np.nan_to_num(v); s = v.sum(1, keepdims=True)
    return np.where(s > 0, v / np.maximum(s, 1e-9), np.array([0, 0, 0, 0, 0, 0, 1.0]))


def cat_distances(df, ref=None):
    """df rows: id + terrain td_<site> + geo + nasa columns. ref = scaling medians (so validation uses the same scales)."""
    L = lith_vec(df)
    d, sc = {}, {} if ref is None else ref
    d["terrain"] = np.stack([df["td_" + c].values for c in CODES], 1)
    d["geology"] = np.stack([0.5 * np.abs(L - np.array([LITH_T[c].get(k, 0) for k in CLASSES])).sum(1) for c in CODES], 1)
    d["albedo"] = np.stack([np.abs(df.albedo_mean.values - ALB[c]) for c in CODES], 1)
    sw = np.maximum(0, (sc.get("swing_ref") if ref else np.nanpercentile(df.diurnal_range_K, 95)) - df.diurnal_range_K.values)
    d["swing"] = np.repeat(sw[:, None], len(CODES), 1)
    d["dryness"] = np.repeat(df.precip_mm_day.values[:, None], len(CODES), 1)
    d["vegetation"] = np.repeat(np.clip(df.ndvi_max.values, 0, 1)[:, None], len(CODES), 1)
    d["pressure"] = np.repeat(df.ps_kpa.values[:, None], len(CODES), 1)
    d["cold"] = np.repeat(np.maximum(0, df.lst_mean_K.values - 215.0)[:, None], len(CODES), 1)
    out = {}
    for k, v in d.items():
        if ref is None:
            sc[k] = np.nanmedian(v, 0) + 1e-9
        out[k] = v / sc[k][None, :]
    if ref is None:
        sc["swing_ref"] = np.nanpercentile(df.diurnal_range_K, 95)
    return out, sc


def comp(dd, w):
    num = sum(w[c] * np.where(np.isfinite(dd[c]), dd[c], 1.0) for c in w if w[c] > 0); return num / sum(v for v in w.values() if v > 0)


def auc(p, n):
    return float(np.mean([(a < b) + 0.5 * (a == b) for a in p for b in n]))


def main():
    A = pd.read_csv(R("stageA_scores.csv"))
    sl = pd.read_csv(R("stageA_shortlist.csv"))
    sl["pi"] = sl.id.str[1:].astype(int)
    tdcols = ["td_" + c for c in CODES]
    S = sl.merge(A[tdcols + ["near_known_km", "near_known", "slope_p50", "rough_p50", "relief_m", "elev_mean_m", "precip_mm", "mat_C"]].reset_index().rename(columns={"index": "pi"}), on="pi")
    geo, nas = pd.read_csv(R("enrich_geo.csv")), pd.read_csv(R("enrich_nasa.csv"))
    S = S.merge(geo.drop(columns=["lat", "lon", "lith_text", "lith_all"]), on="id").merge(nas.drop(columns=["lat", "lon", "modis_tile", "power_cell"]), on="id")
    V = pd.read_csv(R("validation_sites.csv")).merge(geo.drop(columns=["lat", "lon", "lith_text", "lith_all"]), on="id").merge(nas.drop(columns=["lat", "lon", "modis_tile", "power_cell"]), on="id")
    dd, sc = cat_distances(S)
    vd, _ = cat_distances(V, sc)
    c = comp(dd, W); best = c.argmin(1)
    S["composite"] = c[np.arange(len(S)), best]; S["best_site"] = [CODES[i] for i in best]
    for k in dd:
        S["d_" + k] = dd[k][np.arange(len(S)), best]
    S["gate"] = (S.ndvi_max <= 0.20) & (S.snow_frac.fillna(0) <= 0.10)
    S.to_csv(R("mars_candidates.csv"), index=False)
    # ---------- clusters (gate, novelty already applied in stage A)
    ok = S[S.gate].sort_values("composite"); ch = []
    for r in ok.itertuples():
        if all(haversine_km(r.lat, r.lon, q.lat, q.lon) > 60 for q in ch):
            ch.append(r)
        if len(ch) == 25:
            break
    cl = pd.DataFrame(ch).drop(columns="Index")
    # ---------- T1 validation
    vc = comp(vd, W); V["composite"] = vc.min(1); V["best_site"] = [CODES[i] for i in vc.argmin(1)]
    V["gate"] = (V.ndvi_max <= 0.20) & (V.snow_frac.fillna(0) <= 0.10)
    kn, ng = V[V.kind == "known"], V[V.kind == "negative"]
    sh_c = c.min(1)
    pct = lambda v: 100.0 * np.mean(sh_c > v)
    V["pctile_vs_shortlist"] = [pct(v) for v in V.composite]
    rows = []
    for k in list(W) + ["COMPOSITE"]:
        s = V.composite.values if k == "COMPOSITE" else vd[k].min(1)
        s = pd.Series(s, index=V.index)
        rows.append(dict(category=k, AUC_known_vs_negative=round(auc(s[kn.index].dropna(), s[ng.index].dropna()), 2)))
    t1 = pd.DataFrame(rows); t1.to_csv(R("mars_test_T1.csv"), index=False)
    V[["id", "kind", "best_site", "composite", "pctile_vs_shortlist", "gate", "ndvi_max", "albedo_mean", "diurnal_range_K", "precip_mm_day"]].to_csv(R("mars_test_T1_sites.csv"), index=False)
    # ---------- T2 ablation
    rows = []; base = set(np.argsort(sh_c)[:100])
    for drop in [None] + list(W):
        w = {k: v for k, v in W.items() if k != drop}
        vs, ss = comp(vd, w).min(1), comp(dd, w).min(1)
        rows.append(dict(dropped=drop or "(none)", AUC=round(auc(vs[kn.index], vs[ng.index]), 2), top100_overlap=round(len(base & set(np.argsort(ss)[:100])) / 100, 2)))
    pd.DataFrame(rows).to_csv(R("mars_test_T2.csv"), index=False)
    # ---------- T4 stability
    rng = np.random.default_rng(3); keys = list(W); base_w = np.array([W[k] for k in keys]); gi = np.where(S.gate.values)[0]
    hits = np.zeros(len(gi))
    for _ in range(1000):
        w = dict(zip(keys, rng.dirichlet(base_w * 4 + 0.2) * base_w.sum()))
        hits[np.argsort(comp({k: dd[k][gi] for k in dd}, w).min(1))[:30]] += 1
    S.loc[gi, "p_top30"] = hits / 1000
    cl["p_top30"] = [S[(haversine_km(r.lat, r.lon, S.lat.values, S.lon.values) < 25)].p_top30.max() for r in cl.itertuples()]
    cl.to_csv(R("mars_clusters.csv"), index=False); S.to_csv(R("mars_candidates.csv"), index=False)
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 40)
    print("T1 AUC known vs negative:"); print(t1.to_string(index=False))
    print("\nT2 ablation:"); print(pd.DataFrame(rows).to_string(index=False))
    print(f"\nknown analogs: median percentile vs shortlist {V[V.kind=='known'].pctile_vs_shortlist.median():.0f}; negatives {V[V.kind=='negative'].pctile_vs_shortlist.median():.0f}")
    print("\nTop clusters (gate pass, novel):")
    print(cl[["lat", "lon", "best_site", "composite", "p_top30", "d_terrain", "d_geology", "d_albedo", "d_swing", "d_dryness", "d_pressure", "d_cold", "near_known_km", "near_known", "lith_main"]].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
