#!/usr/bin/env python
"""Sanity checks + Moon comparison for the NASA feature family (prints; paste into notes)."""
import os, json
import numpy as np, pandas as pd
ROOT = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(ROOT, "results")
f = pd.read_csv(os.path.join(OUT, "feat_nasa.csv"))
fv = pd.read_csv(os.path.join(OUT, "feat_nasa_validation.csv"))
vs = pd.read_csv(os.path.join(ROOT, "validation_sites.csv"))
fb = pd.read_pickle(os.path.join(OUT, "fine_blocks.pkl"))[["tile", "r0", "c0", "lat", "lon"]]
f = f.merge(fb, on=["tile", "r0", "c0"])
print("blocks:", len(f))
cols = [c for c in f.columns if c not in ("tile", "r0", "c0", "modis_tile", "lat", "lon")]
print((f[cols].notna().sum()).to_string())
print("\nQuantiles Earth blocks:")
print(f[cols].quantile([0, .01, .05, .5, .95, .99, 1]).T.round(3).to_string())
moon = json.load(open(os.path.join(OUT, "moon_regions.json")))
mt = np.array([m["temp_avg_K_median"] for m in moon.values()])
print("\nMoon Diviner temp_avg_K_median over %d regions: %.1f - %.1f" % (len(mt), mt.min(), mt.max()))
x = f.lst_mean_K.dropna()
print("Earth lst_mean_K: min %.1f  p1 %.1f  p5 %.1f  median %.1f  max %.1f ; blocks <=153K: %d ; <=200K: %d ; <=250K: %d" % (
    x.min(), x.quantile(.01), x.quantile(.05), x.median(), x.max(), (x <= 153).sum(), (x <= 200).sum(), (x <= 250).sum()))
print("Moon temp_max_K_median %.0f-%.0f  p95 %.0f-%.0f ; Earth lst_day_p95_K median %.0f max %.0f" % (
    min(m["temp_max_K_median"] for m in moon.values()), max(m["temp_max_K_median"] for m in moon.values()),
    min(m["temp_max_K_p95"] for m in moon.values()), max(m["temp_max_K_p95"] for m in moon.values()),
    f.lst_day_p95_K.median(), f.lst_day_p95_K.max()))
print("\n10 coldest Earth blocks by lst_mean_K:")
print(f.sort_values("lst_mean_K").head(10)[["tile", "r0", "c0", "lat", "lon", "lst_mean_K", "lst_night_p05_K", "lst_day_p95_K", "snow_frac", "frozen_frac", "albedo_mean"]].round(2).to_string())
print("\nValidation sites:")
m = vs.merge(fv, on="id")
show = ["id", "kind", "lst_day_mean_K", "lst_night_mean_K", "lst_mean_K", "lst_annual_amplitude_K", "diurnal_range_K",
        "albedo_mean", "thermal_inertia_proxy", "ndvi_max", "snow_frac", "frozen_frac"]
print(m[show].round(3).to_string())
neg = m[m.kind == "negative"]; kn = m[m.kind == "known"]
for c in ["ndvi_max", "diurnal_range_K", "lst_annual_amplitude_K", "albedo_mean", "thermal_inertia_proxy", "frozen_frac"]:
    print("%-24s negatives mean %.3f | known mean %.3f" % (c, neg[c].mean(), kn[c].mean()))
