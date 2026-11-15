#!/usr/bin/env python3
"""Validation: push the 26 known analogs + 10 negative controls through the same terrain scoring as the discovery blocks.

For each site: 20x20 km block centred on the site (shifted inside its tile if needed), resampled to 40 m, same
slope/roughness/relief fingerprint, same distance to each Moon region (normalised by the discovery pool's medians).
Reports (a) best terrain distance and best Moon region, (b) its percentile among the 5,108 discovery blocks
(lower distance = better; percentile = share of pool blocks that are WORSE), (c) whether the surface gate passes.
Writes results/validation.csv. Run: python validate.py
"""
import os, json
import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling
from common import slope_degrees, roughness_plane3, slope_hist, haversine_km
from refine_earth import TARGET_M, BLOCK_M
from rank_candidates import worldcover, Clim, circling_sun_days, surface_gate

HERE = os.path.dirname(os.path.abspath(__file__))


def tile_for(lat, lon):
    la, lo = int(np.floor(lat)), int(np.floor(lon))
    n = f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM"
    return os.path.join(HERE, "data/earth", n + ".tif")


def block_at(lat, lon):
    p = tile_for(lat, lon)
    if not os.path.exists(p):
        return None
    with rasterio.open(p) as src:
        b = src.bounds
        lat_mid = (b.top + b.bottom) / 2
        h_m = (b.top - b.bottom) * 111320.0
        w_m = (b.right - b.left) * 111320.0 * np.cos(np.radians(lat_mid))
        oh, ow = int(round(h_m / TARGET_M)), int(round(w_m / TARGET_M))
        dem = src.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
    dem[np.abs(dem) > 1e5] = np.nan
    bp = int(BLOCK_M / TARGET_M)
    r = int((b.top - lat) / (b.top - b.bottom) * oh) - bp // 2
    c = int((lon - b.left) / (b.right - b.left) * ow) - bp // 2
    r, c = min(max(r, 0), oh - bp), min(max(c, 0), ow - bp)
    d = dem[r:r + bp, c:c + bp]
    if d.shape != (bp, bp) or np.isfinite(d).mean() < 0.5:
        return None
    # slope/roughness on the whole tile edge-safe: recompute on the block with a 1-px margin handled by nan-fill
    s, rg = slope_degrees(d, TARGET_M, TARGET_M), roughness_plane3(d)
    z = d[np.isfinite(d)]
    return {"hist": slope_hist(s), "slope_p50": float(np.nanpercentile(s, 50)), "rough_p50": float(np.nanpercentile(rg, 50)),
            "relief_m": float(np.percentile(z, 95) - np.percentile(z, 5)), "valid": float(np.isfinite(d).mean())}


def main():
    moon = json.load(open(os.path.join(HERE, "results/moon_regions.json")))
    fb = pd.read_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))
    H = np.stack(fb["hist"].values)
    # pool medians per Moon region (same normalisation as refine_earth.py)
    norm, pool, allpool = {}, {}, []
    for code, m in moon.items():
        mh = np.array(m["slope_hist"])
        w1 = np.abs(np.cumsum(H, 1) - np.cumsum(mh)).sum(1)
        dr = np.abs(fb.rough_p50.values - m["rough_p50"])
        dl = np.abs(np.log(fb.relief_m.values / max(m["relief_p5_p95_m"], 1)))
        norm[code] = (np.median(w1), np.median(dr), np.median(dl))
        pool[code] = np.sort((w1 / norm[code][0] + dr / norm[code][1] + dl / norm[code][2]) / 3)
        allpool.append((w1 / norm[code][0] + dr / norm[code][1] + dl / norm[code][2]) / 3)
    best9 = np.sort(np.min(np.stack(allpool), 0))   # each discovery block's best-of-9 distance
    clim = Clim()
    rows = []
    for s in pd.read_csv(os.path.join(HERE, "validation_sites.csv")).itertuples():
        b = block_at(s.lat, s.lon)
        if b is None:
            rows.append({"id": s.id, "name": s.name, "kind": s.kind, "note": "no DEM block (tile missing / ocean / edge)"})
            continue
        best = None
        for code, m in moon.items():
            w1 = float(np.abs(np.cumsum(b["hist"]) - np.cumsum(m["slope_hist"])).sum())
            td = (w1 / norm[code][0] + abs(b["rough_p50"] - m["rough_p50"]) / norm[code][1]
                  + abs(np.log(max(b["relief_m"], 1) / max(m["relief_p5_p95_m"], 1))) / norm[code][2]) / 3
            if best is None or td < best[1]:
                best = (code, td, w1)
        code, td, w1 = best
        pct = 100.0 * float((best9 > td).mean())      # % of discovery-pool blocks whose best-of-9 match is WORSE (like-for-like)
        wc = worldcover(s.lat, s.lon)
        cl = clim.at(s.lat, s.lon)
        gate = surface_gate(wc)
        rows.append({"id": s.id, "name": s.name, "kind": s.kind, "lat": s.lat, "lon": s.lon, "best_moon": moon[code]["name"],
                     "terrain_dist": round(td, 3), "pctile_vs_pool": round(pct, 1), "slope_p50": round(b["slope_p50"], 1),
                     "rough_p50": round(b["rough_p50"], 2), "relief_m": round(b["relief_m"]), "passes_relief_300": b["relief_m"] >= 300,
                     "mat_C": round(cl["mat"], 1), "precip_mm": round(cl["precip"]), "bare": round(wc.get("wc_bare", np.nan), 2),
                     "snow": round(wc.get("wc_snow", np.nan), 2), "trees_crops_built": round(wc.get("wc_tree", np.nan) + wc.get("wc_crop_built", np.nan), 2),
                     "gate_pass": gate})
    df = pd.DataFrame(rows)
    grp = {"haughton": "mars/ice", "yungay": "mars", "wright_valley": "mars/ice", "rio_tinto": "mars", "bockfjorden": "mars", "lost_hammer": "mars/ice",
           "pilbara": "mars", "dallol": "mars", "lonar": "mars", "lambahraun": "mars", "dumont": "mars", "mdrs": "mars", "ramon": "mars",
           "lava_beds": "moon/mars", "mistastin": "moon", "sudbury": "moon", "ries": "moon", "lanzarote": "moon/mars", "black_point": "moon",
           "cinder_lake": "moon", "meteor": "moon", "mauna_kea": "moon", "craters_moon": "moon", "hiseas": "ops", "dome_c": "ops/ice", "salda": "mars-jezero"}
    df["group"] = df["id"].map(grp).fillna("negative")
    df["would_surface"] = (df.passes_relief_300 == True) & (df.gate_pass == True) & (df.pctile_vs_pool >= 75)
    df.to_csv(os.path.join(HERE, "results/validation.csv"), index=False)
    pd.set_option("display.width", 250); pd.set_option("display.max_columns", 30)
    cols = ["id", "group", "best_moon", "terrain_dist", "pctile_vs_pool", "slope_p50", "rough_p50", "relief_m", "mat_C", "precip_mm", "bare", "trees_crops_built", "gate_pass", "would_surface"]
    print(df[[c for c in cols if c in df.columns]].to_string(index=False))
    print("\npool best-case terrain_dist ~", {k: round(float(v[0]), 2) for k, v in pool.items()})


if __name__ == "__main__":
    main()
