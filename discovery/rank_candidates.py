#!/usr/bin/env python3
"""Stage 3: add environment to the best terrain matches, apply gates, produce the ranked candidate tables.

For the top terrain blocks per Moon region we attach:
  climate   WorldClim 2.1 (10 arc-min): mean annual temp (C), annual precip (mm), annual temp range (C)
  surface   ESA WorldCover 2021 (10 m, read remotely, windowed): fraction bare/sparse, snow-ice, water, trees, crop/built
  lighting  'circling-sun' days/yr from solar geometry (sun up >= 20 h, peak elevation <= 35 deg)
  novelty   distance to nearest known analog (known_analogs.csv + a few extra well-known ones)
Gate v2 (rock-like surface): bare+moss/lichen >= 45 %, snow/ice <= 10 %, water <= 5 %, trees+crop+built <= 5 %.
Writes results/candidates_all.csv and results/candidates_gated.csv. Run: python rank_candidates.py
"""
import os, json
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import from_bounds, Window
from rasterio.enums import Resampling
from concurrent.futures import ThreadPoolExecutor
from common import haversine_km

HERE = os.path.dirname(os.path.abspath(__file__))
WC = os.path.join(HERE, "data/earth/worldclim")
EXTRA_KNOWN = [("qaidam_dalangtan", 38.3, 90.8), ("qaidam_basin", 37.4, 94.5), ("lejia_atacama", -23.5, -67.7),
               ("kamchatka_tolbachik", 55.8, 160.4), ("erebus", -77.5, 167.2), ("svalbard_longyearbyen", 78.2, 15.6),
               # added after a literature check (web search, Nov 2026): published Mars/Moon analog activity
               ("ojos_del_salado", -27.11, -68.54), ("tres_cruces_maricunga", -27.0, -68.8), ("salar_maricunga", -26.3, -69.1),
               ("tso_kar_ISRO_HOPE", 33.3, 78.0), ("leh_ISRO_analog", 34.15, 77.58), ("hanle_changthang", 32.78, 78.96)]


def circling_sun_days(lat):
    d = np.arange(365)
    dec = np.radians(23.44) * np.sin(2 * np.pi * (d - 80) / 365.25)
    phi = np.radians(lat)
    cosH = -np.tan(phi) * np.tan(dec)
    hours = np.where(cosH <= -1, 24.0, np.where(cosH >= 1, 0.0, 2 * np.degrees(np.arccos(np.clip(cosH, -1, 1))) / 15.0))
    peak = 90 - np.abs(lat - np.degrees(dec))
    return int(((hours >= 20) & (peak <= 35)).sum())


class Clim:
    def __init__(self):
        self.a = {}
        for k, f in {"mat": "bio_1", "precip": "bio_12", "trange": "bio_7"}.items():
            with rasterio.open(os.path.join(WC, f"wc2.1_10m_{f}.tif")) as s:
                x = s.read(1).astype("float64"); x[x < -1e30] = np.nan; self.a[k] = x

    def at(self, lat, lon):
        i, j = int((90 - lat) * 6), int((lon + 180) * 6)
        sl = (slice(max(i - 1, 0), i + 2), slice(max(j - 1, 0), j + 2))
        return {k: float(np.nanmean(v[sl])) for k, v in self.a.items()}


def worldcover(lat, lon, half_km=10.0):
    la3, lo3 = int(np.floor(lat / 3) * 3), int(np.floor(lon / 3) * 3)
    code = f"{'N' if la3 >= 0 else 'S'}{abs(la3):02d}{'E' if lo3 >= 0 else 'W'}{abs(lo3):03d}"
    url = f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{code}_Map.tif"
    dlat = half_km / 111.32
    dlon = half_km / (111.32 * np.cos(np.radians(lat)))
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3"):
            with rasterio.open(url) as s:
                w = from_bounds(lon - dlon, lat - dlat, lon + dlon, lat + dlat, s.transform)
                w = w.intersection(Window(0, 0, s.width, s.height))
                a = s.read(1, window=w, out_shape=(200, 200), resampling=Resampling.nearest)
    except Exception:
        return {}
    f = lambda *c: float(np.isin(a, c).mean())
    return {"wc_bare": f(60), "wc_snow": f(70), "wc_water": f(80), "wc_tree": f(10), "wc_shrub": f(20), "wc_grass": f(30),
            "wc_crop_built": f(40, 50), "wc_wet": f(90, 95), "wc_moss": f(100)}


GATE = {"rock_min": 0.45, "snow_max": 0.10, "water_max": 0.05, "veg_max": 0.05}   # v2 (v1 was bare>=0.60 and ignored moss/lichen)
TOPN = 150


def surface_gate(wc):
    """Rock-like surface = bare/sparse (60) + moss/lichen (100). No glacier, lake, forest, crop or built-up land."""
    if not wc:
        return False
    return (wc["wc_bare"] + wc["wc_moss"] >= GATE["rock_min"] and wc["wc_snow"] <= GATE["snow_max"]
            and wc["wc_water"] <= GATE["water_max"] and (wc["wc_tree"] + wc["wc_crop_built"]) <= GATE["veg_max"])


def pick(g, n, sep_km=20.0):
    chosen = []
    for r in g.sort_values("terrain_dist").itertuples():
        if all(haversine_km(r.lat, r.lon, c.lat, c.lon) > sep_km for c in chosen):
            chosen.append(r)
        if len(chosen) == n:
            break
    return chosen


def main():
    sc = pd.read_csv(os.path.join(HERE, "results/fine_terrain_scores.csv"))
    known = pd.read_csv(os.path.join(HERE, "known_analogs.csv"))
    kl = list(zip(known.lat, known.lon, known.name)) + [(a, b, n) for n, a, b in EXTRA_KNOWN]
    kla, klo = np.array([k[0] for k in kl]), np.array([k[1] for k in kl])
    moon = json.load(open(os.path.join(HERE, "results/moon_regions.json")))
    rows = []
    for code, g in sc.groupby("moon"):
        for r in pick(g, TOPN):
            rows.append(r._asdict())
    df = pd.DataFrame(rows).drop(columns="Index")
    print(len(df), "candidate (moon region, block) pairs; fetching environment ...", flush=True)
    clim = Clim()
    uniq = df[["lat", "lon"]].round(3).drop_duplicates()
    with ThreadPoolExecutor(8) as ex:
        wcs = list(ex.map(lambda t: worldcover(*t), zip(uniq.lat, uniq.lon)))
    env = {(a, b): {**clim.at(a, b), **w, "sun_days": circling_sun_days(a)} for (a, b), w in zip(zip(uniq.lat, uniq.lon), wcs)}
    for c in ["mat", "precip", "trange", "sun_days", "wc_bare", "wc_snow", "wc_water", "wc_tree", "wc_shrub", "wc_grass", "wc_crop_built", "wc_wet", "wc_moss"]:
        df[c] = [env[(round(a, 3), round(b, 3))].get(c, np.nan) for a, b in zip(df.lat, df.lon)]
    dk = [haversine_km(a, b, kla, klo) for a, b in zip(df.lat, df.lon)]
    df["near_known_km"] = [round(float(d.min()), 0) for d in dk]
    df["near_known"] = [kl[int(d.argmin())][2] for d in dk]
    df["moon_name"] = df.moon.map(lambda c: moon[c]["name"])
    df["thermal_gap_K"] = [(m + 273.15) - moon[c]["temp_avg_K_median"] for m, c in zip(df.mat, df.moon)]
    df["gate_pass"] = [surface_gate({c: r[c] for c in ("wc_bare", "wc_moss", "wc_snow", "wc_water", "wc_tree", "wc_crop_built")}) if pd.notna(r["wc_bare"]) else False
                       for _, r in df.iterrows()]
    df.to_csv(os.path.join(HERE, "results/candidates_all.csv"), index=False)
    g = df[df.gate_pass & (df.near_known_km > 50)].copy()
    g.to_csv(os.path.join(HERE, "results/candidates_gated.csv"), index=False)
    print(f"gate pass (bare rock/soil, no ice/water/forest): {int(df.gate_pass.sum())}/{len(df)};  also >50 km from known analogs: {len(g)}")
    pd.set_option("display.width", 250)
    cols = ["moon", "lat", "lon", "terrain_dist", "w1_deg", "slope_p50", "rough_p50", "relief_m", "mat", "precip", "wc_bare", "sun_days", "near_known_km", "near_known"]
    for code, gg in g.groupby("moon"):
        print(f"\n== {code} {moon[code]['name']} (slope p50 {moon[code]['slope_p50']}, rough {moon[code]['rough_p50']}, relief {moon[code]['relief_p5_p95_m']:.0f})")
        print(gg.sort_values("terrain_dist").head(6)[cols].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
