#!/usr/bin/env python
"""Extra NASA feature set: NASA POWER (MERRA-2 / CERES-derived) climatology at ~0.5 x 0.625 deg, no login.
Regional climatology endpoint, 10x10 deg boxes, one parameter per request, sequential + polite.
Writes results/feat_nasa_power.csv (keyed by tile,r0,c0) and results/feat_nasa_power_validation.csv (id).
"""
import os, time, json, requests
import numpy as np, pandas as pd
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "results")
CACHE = os.path.join(OUT, "feat_nasa_power_cache.json")
PARAMS = {"TS": "power_ts", "T2M": "power_t2m", "ALLSKY_SFC_SW_DWN": "power_sw_dwn", "PRECTOTCORR": "power_prec"}
URL = "https://power.larc.nasa.gov/api/temporal/climatology/regional"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

b = pd.read_pickle(os.path.join(OUT, "fine_blocks.pkl"))[["tile", "r0", "c0", "lat", "lon"]]
v = pd.read_csv(os.path.join(ROOT, "validation_sites.csv"))[["id", "lat", "lon"]]
la = np.r_[b.lat.values, v.lat.values]; lo = np.r_[b.lon.values, v.lon.values]
boxes = sorted(set(zip(np.floor(la / 10).astype(int) * 10, np.floor(lo / 10).astype(int) * 10)))
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
log = open(os.path.join(ROOT, "logs", "feat_nasa_power.log"), "a")
sess = requests.Session()
for p in PARAMS:
    for (la0, lo0) in boxes:
        key = f"{p}|{la0}|{lo0}"
        if key in cache:
            continue
        q = dict(parameters=p, community="RE", format="json", **{"latitude-min": max(la0, -90), "latitude-max": min(la0 + 9.9, 90),
                 "longitude-min": max(lo0, -180), "longitude-max": min(lo0 + 9.9, 180)})
        for attempt in range(4):
            try:
                r = sess.get(URL, params=q, timeout=120)
                if r.status_code == 200:
                    js = r.json()
                    pts = [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0],
                            f["properties"]["parameter"][p]) for f in js["features"]]
                    cache[key] = pts
                    break
                log.write(f"{key} HTTP {r.status_code} {r.text[:150]}\n")
            except Exception as e:
                log.write(f"{key} err {e!r}\n")
            time.sleep(3 * (attempt + 1))
        log.write(f"{key} {len(cache.get(key, []))} pts\n"); log.flush()
        json.dump(cache, open(CACHE, "w"))
        time.sleep(0.5)

feats = {}
for p, name in PARAMS.items():
    rows = []
    for k, pts in cache.items():
        if k.startswith(p + "|"):
            for la_, lo_, d in pts:
                rows.append((la_, lo_, d))
    arr = pd.DataFrame(rows, columns=["lat", "lon", "d"]).drop_duplicates(["lat", "lon"])
    tree = cKDTree(np.c_[arr.lat.values, arr.lon.values * np.cos(np.radians(arr.lat.values))])
    feats[p] = (arr, tree)


def lookup(lat, lon):
    out = {}
    for p, name in PARAMS.items():
        arr, tree = feats[p]
        dist, idx = tree.query(np.c_[lat, lon * np.cos(np.radians(lat))])
        d = arr.d.values[idx]
        ann = np.array([x.get("ANN", np.nan) for x in d], float)
        mm = np.array([[x.get(m, np.nan) for m in MONTHS] for x in d], float)
        mm[mm < -900] = np.nan; ann[ann < -900] = np.nan
        if p in ("TS", "T2M"):
            out[name + "_K"] = ann + 273.15
            out[name + "_amp_K"] = np.nanmax(mm, 1) - np.nanmin(mm, 1)
            out[name + "_min_month_K"] = np.nanmin(mm, 1) + 273.15
        else:
            out[name + ("_kwh_m2_day" if p == "ALLSKY_SFC_SW_DWN" else "_mm_day")] = ann
    return pd.DataFrame(out)


fb = pd.concat([b[["tile", "r0", "c0"]].reset_index(drop=True), lookup(b.lat.values, b.lon.values)], axis=1)
fb.to_csv(os.path.join(OUT, "feat_nasa_power.csv"), index=False)
fv = pd.concat([v[["id"]].reset_index(drop=True), lookup(v.lat.values, v.lon.values)], axis=1)
fv.to_csv(os.path.join(OUT, "feat_nasa_power_validation.csv"), index=False)
print(fb.describe().T[["count", "mean", "min", "max"]])
print(fv.round(2).to_string())
