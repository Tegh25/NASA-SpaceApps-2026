#!/usr/bin/env python3
"""Twin views for v3 finalists: Moon region | Earth block | slope histogram | category table (Moon vs Earth).
Reads results/final_blocks.csv + v3_candidates.csv + v3_cats.pkl. Writes previews/v3_twin_<id>.png and results/v3_finalists.csv"""
import os, json
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import hillshade, slope_degrees, slope_hist, SLOPE_BINS, haversine_km
from make_twin import earth_block
from refine_earth import TARGET_M
from v3_run import CODES, R, composite, WEIGHTS
import v3_rank

HERE = os.path.dirname(os.path.abspath(__file__))
blob = pd.read_pickle(R("v3_cats.pkl")); df, dists, moon = blob["df"], blob["dists"], blob["moon"]
fb = pd.read_pickle(R("fine_blocks.pkl"))
wc = pd.read_csv(R("v3_wc.csv")); sd, gate, wcm = v3_rank.surface_cat(df, wc); dists["surface"] = np.repeat(sd[:, None], 9, 1)
comp = composite(dists, WEIGHTS)
mj = json.load(open(R("moon_regions.json")))
fin = pd.read_csv(R("final_blocks.csv"))
rows = []
for r in fin.itertuples():
    d = haversine_km(r.lat, r.lon, df.lat.values, df.lon.values); i = int(d.argmin())
    if d[i] > 12:
        continue
    j = int(comp[i].argmin()); mc = CODES[j]; m = mj[mc]; b = fb.iloc[i]
    e = earth_block(b); mdem = np.load(os.path.join(HERE, f"data/moon/crops/{mc}.npy")).astype("float64")
    hs_e = hillshade(e, TARGET_M, TARGET_M, alt=15)
    hs_m = np.where(np.isfinite(mdem), hillshade(np.where(np.isfinite(mdem), mdem, np.nanmedian(mdem)), 40.0, 40.0, alt=15), np.nan)
    he = slope_hist(slope_degrees(e, TARGET_M, TARGET_M))
    fig, ax = plt.subplots(1, 3, figsize=(17, 5.4), gridspec_kw={"width_ratios": [1, 1, 1.15]})
    ax[0].imshow(hs_m, cmap="gray", vmin=0, vmax=1); ax[0].axis("off"); ax[0].set_title(f"MOON {m['name']}", fontsize=10)
    ax[1].imshow(hs_e, cmap="gray", vmin=0, vmax=1); ax[1].axis("off"); ax[1].set_title(f"EARTH {r.id}  ({df.lat[i]:.2f}, {df.lon[i]:.2f})  20 km", fontsize=10)
    x = SLOPE_BINS[:-1] + 0.5
    ax[2].fill_between(x, m["slope_hist"], step="mid", alpha=0.45, label="Moon"); ax[2].fill_between(x, he, step="mid", alpha=0.45, label="Earth")
    ax[2].set_xlim(0, 45); ax[2].legend(fontsize=8); ax[2].set_xlabel("slope (deg)")
    mt = moon.loc[mc]
    tab = [("slope p50 (deg)", m["slope_p50"], df.slope_p50[i]), ("roughness p50 (m)", m["rough_p50"], df.rough_p50[i]),
           ("relief (m)", m["relief_p5_p95_m"], df.relief_m[i]), ("Hurst", mt["hurst"], df.hurst[i]),
           ("depress./km2", mt["dep_per_km2"], df.dep_per_km2[i]), ("slope<10 deg frac", mt["frac_slope_lt10"], df.frac_slope_lt10[i]),
           ("lit frac @1.5deg", mt["lit_mean_1.5"], df["lit_mean_1.5"][i]), ("shadow-all-az @1.5deg", mt["psr_frac_1.5"], df["psr_frac_1.5"][i]),
           ("annual mean T (K)", m["temp_avg_K_median"], df.lst_mean_K[i]), ("circling-sun days", 365, df.sun_days[i])]
    ax[2].set_title("  |  ".join(f"{a}: {b:.2f} vs {c:.2f}" if abs(b) < 20 else f"{a}: {b:.0f} vs {c:.0f}" for a, b, c in tab[:4]), fontsize=7)
    fig.text(0.5, 0.01, "   ".join(f"{a}: Moon {b:.2f} / Earth {c:.2f}" if abs(b) < 20 else f"{a}: {b:.0f} / {c:.0f}" for a, b, c in tab[4:]), ha="center", fontsize=8)
    fig.savefig(os.path.join(HERE, f"previews/v3_twin_{r.id}.png"), dpi=100, bbox_inches="tight"); plt.close(fig)
    rows.append(dict(id=r.id, lat=round(df.lat[i], 3), lon=round(df.lon[i], 3), best_moon=m["name"], composite=round(float(comp[i, j]), 3), gate=bool(gate[i]),
                     **{f"d_{c}": round(float(dists[c][i, j]), 2) if np.isfinite(dists[c][i, j]) else np.nan for c in dists},
                     **{a: round(float(c), 2) for a, b, c in tab}, **{f"moon_{a}": round(float(b), 2) for a, b, c in tab}))
    print("done", r.id, mc)
pd.DataFrame(rows).to_csv(R("v3_finalists.csv"), index=False)
