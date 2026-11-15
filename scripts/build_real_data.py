#!/usr/bin/env python3
"""Build Terralog's real data pack from the discovery run.

Run from the app root:
    DISC/.venv/bin/python scripts/build_real_data.py

Reads (never writes) ../discovery, writes public/data/*.json and public/img/*.webp.
Needs: pandas, numpy, scipy, Pillow (all in the discovery venv) and /opt/homebrew/bin/cwebp.
"""
from __future__ import annotations

import base64
import glob
import json
import math
import os
import subprocess
import sys

import numpy as np
import pandas as pd

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Prefer the discovery/ folder committed in this repo; fall back to a sibling checkout.
_IN_REPO = os.path.join(APP, "discovery")
DISC = os.environ.get("TERRALOG_DISC") or (
    _IN_REPO if os.path.isdir(os.path.join(_IN_REPO, "results")) else os.path.abspath(os.path.join(APP, "..", "discovery"))
)
RES = os.path.join(DISC, "results")
MARS = os.path.join(DISC, "mars")
OUT = os.path.join(APP, "public", "data")
IMG = os.path.join(APP, "public", "img")
CWEBP = "/opt/homebrew/bin/cwebp"
TODAY = "2026-11-15"
RUN_LABEL = "Terralog discovery run, 2026-11-14/15"


# --------------------------------------------------------------------------- helpers
def sig(x, n=3):
    """Round to n significant digits; NaN/None -> None."""
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x):
        return None
    if x == 0:
        return 0
    return round(x, n - 1 - int(math.floor(math.log10(abs(x)))))


def rnd(x, d=2):
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x):
        return None
    return round(x, d)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(a))


def write_json(name, obj, indent=None):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":") if indent is None else None, indent=indent, allow_nan=False)
    print(f"  wrote {os.path.relpath(path, APP)}  {os.path.getsize(path) / 1024:.0f} KB")


# --------------------------------------------------------------------------- features
FEATURES = [
    dict(key="slope_deg", label="Median slope", unit="deg", group="Terrain",
         description="Median slope of the 20 km block (Earth) or region (Moon) at a 40 m baseline. Same slope code on Copernicus GLO-30 and LRO LOLA.",
         norm=dict(min=0, max=40, scale="linear"), higherIs="steeper", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="roughness_m", label="Roughness", unit="m", group="Terrain",
         description="Median residual height after fitting a plane in each 3 by 3 window (about 120 m wide), same code on both bodies.",
         norm=dict(min=0, max=3, scale="linear"), higherIs="rougher", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="relief_m", label="Relief", unit="m", group="Terrain",
         description="Elevation range inside the block: 5th to 95th percentile. Moon regions range from 1.2 to 5.1 km.",
         norm=dict(min=0, max=5000, scale="linear"), higherIs="more relief", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="flat_frac", label="Landing-flat share (< 10 deg)", unit="", group="Terrain",
         description="Share of the block with slope under 10 degrees at 40 m, a rough proxy for landable ground.",
         norm=dict(min=0, max=1, scale="linear"), higherIs="flatter", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="crater_density", label="Crater-like pits", unit="per km2", group="Terrain",
         description="Closed depressions per km2 found by the same detector on both bodies. Earth blocks have few (0 to 0.03 typical), Moon regions 0.04 to 0.21.",
         norm=dict(min=0, max=0.25, scale="linear"), higherIs="more pits", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="shadow_frac", label="Shadowed share, sun 1.5 deg", unit="", group="Lighting",
         description="Share of the block that never sees a sun 1.5 degrees above the horizon in any direction, a proxy for permanent shadow under the low polar sun.",
         norm=dict(min=0, max=0.5, scale="linear"), higherIs="more shadow", sources=["Copernicus GLO-30", "LRO LOLA LDEM_80S_40M"]),
    dict(key="temp_mean_k", label="Mean surface temperature", unit="K", group="Climate",
         description="Annual mean land surface temperature. Earth: MODIS MYD11A2 (2019 to 2023). Moon: Diviner annual average, median over the region. The gap is large: Moon 105 to 153 K, Earth blocks about 250 to 297 K.",
         norm=dict(min=80, max=320, scale="linear"), higherIs="warmer", sources=["MODIS MYD11A2 C6.1", "LRO Diviner"]),
    dict(key="temp_max_k", label="Max surface temperature", unit="K", group="Climate",
         description="Earth: 95th percentile of MODIS daytime land surface temperature. Moon: median of the Diviner maximum over the region. Different statistics, so compare loosely.",
         norm=dict(min=180, max=340, scale="linear"), higherIs="hotter", sources=["MODIS MYD11A2 C6.1", "LRO Diviner"]),
    dict(key="ice_proxy", label="Ice / frozen-ground proxy", unit="", group="Ice and surface",
         description="Not the same quantity on both bodies. Earth: share of MODIS observations that are frozen. Moon: share of the region where Diviner temperatures allow ice to be stable within the top metre or so. Read it as 'how ice-friendly', not as ice amount.",
         norm=dict(min=0, max=1, scale="linear"), higherIs="more ice-friendly", sources=["MODIS MYD11A2 C6.1", "LRO Diviner PRP"]),
    dict(key="precip_mm_yr", label="Precipitation", unit="mm/yr", group="Climate",
         description="Earth: NASA POWER climatology (mm per day times 365). Moon: 0.",
         norm=dict(min=0, max=3000, scale="log"), higherIs="wetter", sources=["NASA POWER"]),
    dict(key="vegetation_ndvi", label="Vegetation (NDVI max)", unit="index", group="Ice and surface",
         description="Peak NDVI in 2019 to 2023 from MODIS MYD13Q1 on Earth; 0 on the Moon. Values above about 0.2 mean sparse to dense plant cover.",
         norm=dict(min=0, max=1, scale="linear"), higherIs="greener", sources=["MODIS MYD13Q1 C6.1"]),
    dict(key="snow_frac", label="Snow cover share", unit="", group="Ice and surface",
         description="Share of valid MODIS MYD10A2 observations with snow (Earth); 0 on the Moon.",
         norm=dict(min=0, max=1, scale="linear"), higherIs="snowier", sources=["MODIS MYD10A2 C6.1"]),
]
FEATURE_KEYS = [f["key"] for f in FEATURES]

PROV_DATASETS = {
    "cop": dict(name="Copernicus GLO-30 DEM", version="2021 release", dateRange="2011 to 2015 acquisition",
                url="https://registry.opendata.aws/copernicus-dem/",
                notes="235 tiles shortlisted for cold, dry, rugged terrain; resampled to 40 m, cut into 20 by 20 km blocks."),
    "modis_lst": dict(name="MODIS MYD11A2 land surface temperature", version="Collection 6.1", dateRange="2019 to 2023",
                      url="https://planetarycomputer.microsoft.com/dataset/modis-11A2-061",
                      notes="Read anonymously via Microsoft Planetary Computer. Annual mean, daytime 95th percentile, frozen-observation share."),
    "modis_ndvi": dict(name="MODIS MYD13Q1 NDVI", version="Collection 6.1", dateRange="2019 to 2023",
                       url="https://planetarycomputer.microsoft.com/dataset/modis-13Q1-061", notes="Peak NDVI per block."),
    "modis_snow": dict(name="MODIS MYD10A2 snow cover", version="Collection 6.1", dateRange="2019 to 2023",
                       url="https://planetarycomputer.microsoft.com/dataset/modis-10A2-061", notes="Share of valid observations with snow."),
    "power": dict(name="NASA POWER climatology", version="monthly climatology", dateRange="long-term mean",
                  url="https://power.larc.nasa.gov/", notes="Precipitation in mm per day, multiplied by 365."),
    "lola": dict(name="LRO LOLA LDEM_80S_40M", version="40 m south polar DEM", url="https://pds-geosciences.wustl.edu/missions/lro/lola.htm",
                 notes="Moon slope, roughness, relief, crater-like pits, landing share, shadow structure."),
    "diviner": dict(name="LRO Diviner polar resource products (PRP)", version="south polar", url="https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
                    notes="Annual mean and maximum temperature, ice-stability fractions per region."),
    "landsat": dict(name="Landsat 8/9 and Sentinel-2 surface check", version="Level-2", url="https://planetarycomputer.microsoft.com/",
                    notes="Bare, vegetated, snow shares for the featured blocks (eo_verify.csv)."),
    "worldcover": dict(name="ESA WorldCover (surface gate)", version="v200", url="https://esa-worldcover.org/",
                       notes="Used to gate out forest, farmland, water and snow-covered blocks before ranking."),
    "mola": dict(name="HRSC+MOLA blended DEM, 200 m", version="v2", url="https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m",
                 notes="Mars terrain fingerprints at 200 m, so comparisons to 40 m Earth blocks are indicative only."),
}


def features_file():
    d = PROV_DATASETS
    return dict(
        version=2,
        features=FEATURES,
        provenance=dict(
            mock=False,
            datasets=[d["cop"], d["lola"], d["diviner"], d["modis_lst"], d["modis_ndvi"], d["modis_snow"], d["power"]],
            processing=("Twelve features shared by Earth blocks and Moon regions. Terrain features come from the same slope, roughness and "
                        "depression code run on Copernicus GLO-30 (resampled to 40 m) and on LOLA 40 m. Climate features are MODIS and NASA POWER "
                        "on Earth and Diviner on the Moon. ice_proxy and temp_max_k use different statistics on each body (see descriptions). "
                        "Norm ranges are fixed so that Moon and Earth values both fall on-scale."),
            generatedAt=TODAY,
            run=RUN_LABEL,
        ),
    )


# --------------------------------------------------------------------------- regions
# (name, lat_min, lat_max, lon_min, lon_max); first match wins, so specific boxes come first.
REGIONS = [
    ("Southern Tibet", 27.0, 30.5, 84.0, 93.5),
    ("Ngari, western Tibet", 30.0, 34.0, 79.5, 84.0),
    ("Central Tibet", 30.5, 34.0, 84.0, 90.0),
    ("Ladakh and Changtang", 32.0, 36.0, 77.0, 79.5),
    ("Karakoram and Aksai Chin", 34.0, 37.0, 76.0, 81.0),
    ("Pamir", 37.0, 40.0, 71.0, 76.0),
    ("Hindu Kush and Karakoram", 35.0, 37.0, 71.0, 76.0),
    ("Hindu Kush, Afghanistan", 32.0, 36.0, 64.0, 70.0),
    ("Kyrgyz Tien Shan", 39.0, 43.5, 71.0, 80.0),
    ("Eastern Tien Shan", 41.0, 45.5, 80.0, 92.0),
    ("Altyn-Tagh and Kunlun", 34.0, 38.5, 80.0, 89.0),
    ("Hoh Xil and eastern Kunlun", 33.0, 38.5, 89.0, 97.0),
    ("Qilian Shan and Qaidam", 36.5, 40.5, 92.0, 103.0),
    ("Qinghai plateau", 33.0, 37.0, 97.0, 103.0),
    ("Tarim and Gobi margin", 38.5, 44.0, 84.0, 100.0),
    ("Mongolian Altai", 44.0, 50.5, 84.0, 93.0),
    ("Dzungaria and Saur Range", 43.5, 49.0, 78.0, 86.0),
    ("Western Mongolia", 43.0, 50.0, 93.0, 101.0),
    ("Sayan and Tuva", 50.0, 54.5, 86.0, 103.0),
    ("Baikal and Stanovoy highlands", 52.0, 58.5, 106.0, 122.0),
    ("Patagonian Andes", -56.0, -45.0, -76.0, -68.0),
    ("High Andes", -36.0, -22.0, -72.0, -65.0),
    ("Colorado Rockies", 37.0, 41.5, -110.0, -104.0),
    ("Wyoming and Idaho Rockies", 41.5, 46.0, -116.0, -107.0),
    ("Oregon high desert", 42.5, 46.0, -122.0, -116.0),
    ("British Columbia ranges", 48.0, 54.0, -126.0, -119.0),
    ("Mackenzie Mountains", 60.0, 66.0, -126.0, -118.0),
    ("Yukon and Alaska Range", 59.0, 66.0, -156.0, -125.0),
    ("Arctic Alaska", 66.0, 72.0, -160.0, -140.0),
    ("Baffin Island", 65.5, 71.5, -75.0, -60.0),
    ("Ellesmere Island", 75.0, 82.0, -95.0, -70.0),
    ("West Greenland", 68.0, 72.0, -58.0, -48.0),
    ("East Greenland", 70.0, 76.0, -30.0, -18.0),
    ("Putorana and Taymyr", 66.0, 72.0, 90.0, 100.0),
    ("Verkhoyansk and Kolyma", 60.0, 70.0, 130.0, 165.0),
]


def region_for(lat, lon, tile):
    for name, a, b, c, d in REGIONS:
        if a <= lat <= b and c <= lon <= d:
            return name
    t = tile.replace("_", " ")
    return f"Copernicus tile {t}"


# --------------------------------------------------------------------------- Earth cells
def build_earth():
    key = ["tile", "r0", "c0"]
    v3 = pd.read_csv(os.path.join(RES, "v3_candidates.csv"))
    adv = pd.read_csv(os.path.join(RES, "feat_terrain_adv.csv"))
    ill = pd.read_csv(os.path.join(RES, "feat_illum.csv"))
    nasa = pd.read_csv(os.path.join(RES, "feat_nasa.csv"))
    pw = pd.read_csv(os.path.join(RES, "feat_nasa_power.csv"))
    df = v3[key + ["lat", "lon", "slope_p50", "rough_p50", "relief_m", "sun_days"]]
    df = df.merge(adv[key + ["frac_slope_lt10", "dep_per_km2"]], on=key, how="left", validate="1:1")
    df = df.merge(ill[key + ["psr_frac_1.5"]], on=key, how="left", validate="1:1")
    df = df.merge(nasa[key + ["lst_mean_K", "lst_day_p95_K", "frozen_frac", "snow_frac", "ndvi_max"]], on=key, how="left", validate="1:1")
    df = df.merge(pw[key + ["power_prec_mm_day"]], on=key, how="left", validate="1:1")
    assert len(df) == 12362, len(df)
    cols = {
        "slope_deg": (df.slope_p50, lambda x: rnd(x, 2)),
        "roughness_m": (df.rough_p50, lambda x: sig(x, 3)),
        "relief_m": (df.relief_m, lambda x: rnd(x, 0)),
        "flat_frac": (df.frac_slope_lt10, lambda x: rnd(x, 3)),
        "crater_density": (df.dep_per_km2, lambda x: sig(x, 3)),
        "shadow_frac": (df["psr_frac_1.5"], lambda x: rnd(x, 3)),
        "temp_mean_k": (df.lst_mean_K, lambda x: rnd(x, 1)),
        "temp_max_k": (df.lst_day_p95_K, lambda x: rnd(x, 1)),
        "ice_proxy": (df.frozen_frac, lambda x: rnd(x, 3)),
        "precip_mm_yr": (df.power_prec_mm_day * 365.0, lambda x: rnd(x, 0)),
        "vegetation_ndvi": (df.ndvi_max, lambda x: rnd(x, 3)),
        "snow_frac": (df.snow_frac, lambda x: rnd(x, 3)),
    }
    values = {k: [f(x) for x in s.tolist()] for k, (s, f) in cols.items()}
    assert set(values) == set(FEATURE_KEYS)
    lat = [rnd(x, 3) for x in df.lat]
    lon = [rnd(x, 3) for x in df.lon]
    region = [region_for(a, b, t) for a, b, t in zip(df.lat, df.lon, df.tile)]
    d = PROV_DATASETS
    out = dict(
        cellSizeDeg=0.18,
        count=len(df),
        lat=lat,
        lon=lon,
        values=values,
        region=region,
        provenance=dict(
            mock=False,
            datasets=[d["cop"], d["modis_lst"], d["modis_ndvi"], d["modis_snow"], d["power"], d["worldcover"]],
            processing=("12,362 overlapping 20 by 20 km blocks from 235 Copernicus GLO-30 tiles, chosen from a global WorldClim screen for "
                        "cold, dry and rugged terrain (so hot deserts, Antarctica and the far north are not covered). Terrain features at 40 m, "
                        "joined on (tile, r0, c0) from v3_candidates, feat_terrain_adv, feat_illum, feat_nasa and feat_nasa_power. "
                        "Precipitation = POWER mm/day x 365. Missing values are null. Region labels are hand-written bounding boxes, "
                        "approximate; blocks outside them are labelled with their Copernicus tile."),
            generatedAt=TODAY,
            run=RUN_LABEL,
        ),
    )
    return out, df


# --------------------------------------------------------------------------- Moon targets
MOON_DESC = {
    "SP": ("Gentle, cratered terrain near the south pole with the flattest ground of the nine regions.",
           "Slater Plain has the highest landing-flat share of the nine Artemis III candidate regions (62 % of the area under 10 degrees), the coldest-after-Haworth annual mean (110 K) and ice stable in 56 % of the area in Diviner data."),
    "HW": ("Floor of Haworth crater, a permanently shadowed basin with the coldest average temperature.",
           "Haworth has the lowest annual mean temperature of the nine regions (105 K) and the most crater-like pits (0.21 per km2). Ice is stable within the top metre over about 64 % of it."),
    "MM": ("Rugged massif with a mix of gentle and steep ground and about 2.2 km of relief.",
           "Mons Mouton (256 km2 here) has a median slope of 11.4 degrees, 2.2 km of relief and ice-stable ground over about 46 % of it. Mauna Kea scored closest to it on terrain in our validation run."),
    "N2": ("Rim of Nobile crater, moderate slopes and 2.3 km of relief.",
           "Nobile Rim 2 has a median slope of 11 degrees, a mean temperature of 126 K and 2.3 km of relief. Ice is stable over about a third of it."),
    "G2": ("Rim of de Gerlache crater, moderate slope with 2.8 km of relief, close to the pole.",
           "de Gerlache Rim 2 sits near 88 degrees south, with a median slope of 12.5 degrees, 2.8 km of relief and a 135 K annual mean."),
    "MA": ("Steep isolated massif, the roughest relief outside the plateau region.",
           "Malapert Massif has a median slope of 17.7 degrees, 3.1 km of relief and few shadowed pixels at 1.5 degrees sun elevation (0.7 %), because the summit sees the Sun for long periods."),
    "CB": ("Steep peak next to Cabeus B, the steepest and warmest of the nine regions.",
           "The peak near Cabeus B has the steepest median slope (19.2 degrees), only 8 % of the area flatter than 10 degrees and the warmest annual mean of the set (153 K)."),
    "N1": ("Steep rim of Nobile crater with 4.4 km of relief.",
           "Nobile Rim 1 has a median slope of 17.7 degrees and the largest relief of the single-block regions (4.4 km). Annual mean temperature is 128 K."),
    "MP": ("Large plateau region of about 4,450 km2 covering the Mons Mouton plateau.",
           "Mons Mouton Plateau is the only broad region (about 4,450 km2). Median slope is 11 degrees, relief 5.1 km, annual mean 141 K and 0.18 crater-like pits per km2."),
}
MOON_SLUG = {"SP": "slater-plain", "HW": "haworth", "MM": "mons-mouton", "N2": "nobile-rim-2", "G2": "de-gerlache-rim-2",
             "MA": "malapert-massif", "CB": "cabeus-b", "N1": "nobile-rim-1", "MP": "mons-mouton-plateau"}
MOON_SOURCES = ["LRO LOLA LDEM_80S_40M (40 m south polar DEM)", "LRO Diviner polar resource products (PRP)",
                "USGS Artemis III candidate region outlines"]
MOON_TOKENS = {}


def build_moon_targets():
    regions = json.load(open(os.path.join(RES, "moon_regions.json")))
    adv = pd.read_csv(os.path.join(RES, "feat_terrain_adv_moon.csv")).set_index("moon")
    ill = pd.read_csv(os.path.join(RES, "feat_illum_moon.csv")).set_index("moon")
    targets = []
    for code, r in regions.items():
        tid = f"moon-{MOON_SLUG[code]}"
        name = r["name"].replace("Peak Near Cabeus B", "Peak near Cabeus B")
        values = {
            "slope_deg": rnd(r["slope_p50"], 2),
            "roughness_m": sig(r["rough_p50"], 3),
            "relief_m": rnd(r["relief_p5_p95_m"], 0),
            "flat_frac": rnd(adv.loc[code, "frac_slope_lt10"], 3),
            "crater_density": sig(adv.loc[code, "dep_per_km2"], 3),
            "shadow_frac": rnd(ill.loc[code, "psr_frac_1.5"], 3),
            "temp_mean_k": rnd(r["temp_avg_K_median"], 1),
            "temp_max_k": rnd(r["temp_max_K_median"], 1),
            "ice_proxy": rnd(r["ice_stable_any_frac"], 3),
            "precip_mm_yr": 0,
            "vegetation_ndvi": 0,
            "snow_frac": 0,
        }
        summ, why = MOON_DESC[code]
        targets.append(dict(
            id=tid, body="moon", name=name, code=code,
            lat=rnd(r["center_lat"], 3), lon=rnd(r["center_lon"], 3),
            summary=summ,
            whyItMatters=why + " One of the nine Artemis III candidate landing regions near the lunar south pole.",
            values=values,
            imagery=f"/img/moon_{code}.webp",
            sources=MOON_SOURCES,
            valueSource="computed",
        ))
        MOON_TOKENS[code] = tid
    order = ["SP", "HW", "MM", "N2", "G2", "MA", "CB", "N1", "MP"]
    targets.sort(key=lambda t: order.index(t["code"]))
    return targets


# --------------------------------------------------------------------------- Mars targets
MARS_SITES = {
    # code, id, name, lat, lon (east positive), summary, why
    "jezero": ("JZ", "mars-jezero", "Jezero crater", 18.44, 77.45,
               "Ancient river-delta lake basin, landing site of Perseverance.",
               "Jezero held a lake with a delta around 3.5 billion years ago. Orbital spectra show Mg-rich carbonate, olivine and clays. Perseverance landed here in 2021."),
    "gale": ("GL", "mars-gale", "Gale crater", -5.4, 137.8,
             "Crater with a 5 km layered mound, landing site of Curiosity.",
             "Gale contains Mount Sharp, with clay and sulfate layers recording a wetter-to-drier transition. Curiosity landed here in 2012. The 30 km window includes the steep mound, so slope and relief are high."),
    "meridiani": ("MR", "mars-meridiani", "Meridiani Planum", -1.95, -5.53,
                  "Very flat plain with hematite and sulfate-rich rock, landing site of Opportunity.",
                  "Meridiani is a very flat plain (median slope about 1 degree). Opportunity found sulfate-rich sedimentary rock and hematite spherules here in 2004."),
    "oxia": ("OX", "mars-oxia", "Oxia Planum", 18.28, -24.63,
             "Flat clay-bearing plain, chosen landing site for the Rosalind Franklin rover.",
             "Oxia Planum has Fe/Mg-rich clays over a very flat plain (median slope under 1 degree), which is why it was chosen for ESA's ExoMars rover."),
}
MARS_NOTE = ("Mars terrain is measured on a 200 m grid from the HRSC+MOLA blend (a 30 by 30 km window), so slope and roughness are not directly "
             "comparable with the 40 m Earth blocks. Treat comparisons as indicative. Temperature, precipitation, vegetation and snow are left blank: "
             "no sourced values in the data pack.")


def build_mars_targets():
    sites = json.load(open(os.path.join(MARS, "results", "mars_sites.json")))
    targets = []
    for key, (code, tid, name, lat, lon, summ, why) in MARS_SITES.items():
        t = sites.get(key, {}).get("terrain")
        if not t:
            print(f"  ! mars site {key} missing terrain, skipped")
            continue
        hist = t.get("slope_hist") or []
        flat = float(sum(hist[:10])) if hist else None  # 1-degree bins: share under 10 degrees
        values = {k: None for k in FEATURE_KEYS}
        values.update(slope_deg=rnd(t["slope_p50"], 2), roughness_m=sig(t["rough_p50"], 3), relief_m=rnd(t["relief_m"], 0),
                      flat_frac=rnd(flat, 3))
        targets.append(dict(
            id=tid, body="mars", name=name, code=code, lat=lat, lon=lon,
            summary=summ + " Terrain at 200 m scale.",
            whyItMatters=why + " " + MARS_NOTE,
            values=values,
            imagery=f"/img/mars_{key}.webp",
            sources=["USGS HRSC+MOLA blended DEM 200 m (v2)", "MGS TES thermal inertia and albedo (context, not scored)"],
            valueSource="computed",
        ))
    return targets, sites


def targets_file(moon, mars):
    d = PROV_DATASETS
    return dict(
        targets=moon + mars,
        provenance=dict(
            mock=False,
            datasets=[d["lola"], d["diviner"], d["mola"]],
            processing=("Moon: nine Artemis III south-polar candidate regions; terrain from LOLA 40 m with the same code as the Earth blocks, "
                        "temperature and ice from Diviner region medians, precipitation, NDVI and snow set to 0 by definition. "
                        "Mars: four rover landing sites, terrain only, at 200 m (slope, roughness, relief, share under 10 degrees); "
                        "everything else is null. Coordinates are the well-known landing locations."),
            generatedAt=TODAY,
            run=RUN_LABEL,
        ),
    )


# --------------------------------------------------------------------------- featured analogs
CAT_LABEL = dict(terr="terrain statistics", multi="multi-scale roughness", crater="crater-like pits",
                 landing="landing-slope share", light="shadow structure under a low sun", ice="ice proxy")

REFS_MOON = [
    dict(title="LRO LOLA data archive (PDS Geosciences Node)", url="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"),
    dict(title="LRO Diviner data archive (PDS Geosciences Node)", url="https://pds-geosciences.wustl.edu/missions/lro/diviner.htm"),
    dict(title="Copernicus GLO-30 DEM (AWS Open Data)", url="https://registry.opendata.aws/copernicus-dem/"),
]

NEW_SPEC = [
    # id, final_table id, kind, rank, name, region, status, targets(best, secondary), descriptive text
    dict(id="earth-ngari-tibet", ft="D1_ngari_w_tibet", kind="new", rank=1, name="Ngari, western Tibet (approx.)",
         region="Ngari, western Tibet", status="Confirmed", best="SP", second="HW",
         headline="Cold, dry Tibetan plateau block whose slopes and relief match Slater Plain.",
         desc=("A 20 by 20 km block on the high plateau of western Tibet (Zanda to Gerze area), at 5,100 m elevation. Its slope histogram and relief "
               "track Slater Plain, and Landsat and Sentinel-2 imagery confirm the ground is mostly bare rock and sand. The place name is approximate: "
               "the block was found by terrain statistics, not by name, so check it on a map before quoting it."),
         extra_caveats=[], tour_names=("Block centre", "3 km north", "4 km east")),
    dict(id="earth-pamir-muztagh", ft="C1_pamir", kind="new", rank=2, name="Pamir, near Muztagh Ata (approx.)",
         region="Pamir", status="Confirmed, 22 to 33 % sparse vegetation", best="MP", second="N2",
         headline="High Pamir block that resembles the Mons Mouton Plateau region.",
         desc=("A 20 by 20 km block in the Pamir, near Muztagh Ata, at about 4,300 m. Terrain statistics resemble the Mons Mouton Plateau, and it "
               "also scores close to Nobile Rim 2 and Haworth. About a fifth to a third of the surface is sparsely vegetated in satellite imagery, "
               "so it is not pure bare rock. Place name approximate."),
         extra_caveats=["22 to 33 % of the block is sparse vegetation (Sentinel-2 and Landsat), which the Moon does not have."],
         tour_names=("Block centre", "3 km north", "4 km east")),
    dict(id="earth-s-tibet-tingri", ft="B1_s_tibet_tingri", kind="new", rank=3, name="Southern Tibet, Tingri and Dinggye (approx.)",
         region="Southern Tibet", status="Conditional: glacier in one corner; ranking is weight-sensitive", best="MA", second="CB",
         headline="Steep block north of the Himalaya that matches Malapert Massif's relief.",
         desc=("A 20 by 20 km block north of the Himalaya near Tingri and Dinggye, at 5,100 m. It is the best steep match we found for Malapert "
               "Massif, but it stays in the top 40 in only 20 % of random re-weightings, so its rank depends on how the categories are weighted. "
               "Landsat shows a glacier in one corner (20 % snow), Sentinel-2 10 %. Place name approximate."),
         extra_caveats=["A glacier covers part of one corner: 20 % snow in Landsat, 10 % in Sentinel-2.",
                        "Ranking is sensitive to category weights: top-40 in only 20 % of 1,000 re-weightings."],
         tour_names=("Block centre", "3 km north", "4 km east")),
    dict(id="earth-altyn-tagh", ft="G1_altyn_tagh_v1", kind="reserve", rank=6, name="Altyn-Tagh margin (approx.)",
         region="Altyn-Tagh, south Taklimakan margin", status="Reserve: cleanest surface, weaker match", best="MP", second=None,
         headline="Cleanest bare-rock surface of any candidate, but a weaker terrain match.",
         desc=("A block on the Altyn-Tagh and southern Taklimakan margin with 96 % bare ground in Landsat, the cleanest of all candidates. "
               "It ranks lower on terrain match and stays in the top 40 in only 13 % of re-weightings, so it is kept in reserve."),
         extra_caveats=[], tour_names=("Block centre", "3 km north", "4 km east")),
    dict(id="earth-zanda", ft="D2_ngari_zanda", kind="reserve", rank=7, name="Zanda, western Tibet (approx.)",
         region="Ngari, western Tibet", status="Reserve: 23 to 34 % vegetated", best="MP", second=None,
         headline="Close to the Ngari block, but sparsely vegetated.",
         desc=("A neighbouring block near Zanda in western Tibet, with a similar terrain score to the lead Ngari candidate, but 23 to 34 % of "
               "the surface is vegetated in satellite imagery."),
         extra_caveats=["23 to 34 % of the block is vegetated."], tour_names=("Block centre", "3 km north", "4 km east")),
    dict(id="earth-s-tibet-2", ft="B2_s_tibet", kind="reserve", rank=8, name="Southern Tibet, second block (approx.)",
         region="Southern Tibet", status="Reserve: not steep", best="MP", second="N2",
         headline="Second southern Tibet block, flatter than the lead candidate.",
         desc=("A second block north of the Himalaya, about 150 km from the Tingri block. It resembles the Mons Mouton Plateau but is not steep, and "
               "stays in the top 40 in 31 % of re-weightings."),
         extra_caveats=["Vegetation 20 to 21 % in imagery."], tour_names=("Block centre", "3 km north", "4 km east")),
]


def nearest_cell(df, lat, lon):
    d = haversine_km(lat, lon, df.lat.values, df.lon.values)
    i = int(np.argmin(d))
    return i, float(d[i])


def offset(lat, lon, dn_km, de_km):
    return rnd(lat + dn_km / 111.2, 4), rnd(lon + de_km / (111.2 * math.cos(math.radians(lat))), 4)


def pct(x, nd=0):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else (round(100 * float(x)) if nd == 0 else round(100 * float(x), nd))


def build_featured_moon(earth, moon_targets, cells):
    ft = pd.read_csv(os.path.join(RES, "v3_final_table.csv")).set_index("id")
    eo = pd.read_csv(os.path.join(RES, "eo_verify.csv")).set_index("id")
    tmap = {t["code"]: t for t in moon_targets}
    out = []
    for s in NEW_SPEC:
        f, e = ft.loc[s["ft"]], eo.loc[s["ft"]]
        i, dkm = nearest_cell(cells, float(f.lat), float(f.lon))
        if dkm > 5:
            print(f"  ! {s['id']}: nearest cell {dkm:.1f} km away")
        vals = {k: earth["values"][k][i] for k in FEATURE_KEYS}
        sun_days = int(cells.sun_days.iloc[i])
        tgt = tmap[s["best"]]
        tv = tgt["values"]
        sec = tmap[s["second"]] if s["second"] else None
        cats = {c: float(f[c]) for c in CAT_LABEL if pd.notna(f[c])}
        close = [c for c, v in sorted(cats.items(), key=lambda kv: kv[1]) if v <= 0.45]
        weak = [c for c, v in sorted(cats.items(), key=lambda kv: -kv[1]) if v >= 0.7]
        lbare, sbare = pct(e.bare_frac), pct(e.s2_bare_frac)
        lveg = pct(e.veg_frac)
        lsnow, ssnow = pct(e.snow_frac), pct(e.s2_snow_frac)
        mat = []
        mat.append(f"Median slope {vals['slope_deg']:.1f} deg vs {tv['slope_deg']:.1f} deg at {tgt['name']}")
        mat.append(f"Relief {vals['relief_m']:.0f} m vs {tv['relief_m']:.0f} m")
        mat.append(f"Roughness {vals['roughness_m']:.2f} m vs {tv['roughness_m']:.2f} m")
        mat.append(f"Landing-flat share {pct(vals['flat_frac'])} % vs {pct(tv['flat_frac'])} %")
        mat.append("Close on: " + ", ".join(CAT_LABEL[c] for c in close) if close else "No category closer than 0.45")
        short = []
        short.append(f"Mean surface temperature {vals['temp_mean_k']:.0f} K vs {tv['temp_mean_k']:.0f} K, about {vals['temp_mean_k'] - tv['temp_mean_k']:.0f} K warmer")
        short.append(f"No circling-sun days ({sun_days} per year) vs the polar Moon's near-continuous low Sun")
        short.append(f"Crater-like pits {vals['crater_density']:.3f} per km2 vs {tv['crater_density']:.3f}")
        short.append("Earth gravity, atmosphere, and no regolith")
        if weak:
            short.append("Weak on: " + ", ".join(CAT_LABEL[c] for c in weak))
        why = (f"Composite score {float(f.composite):.2f} (lower is closer) against {tgt['name']}; the block stays in the top 40 in "
               f"{pct(f.p_top40)} % of 1,000 random re-weightings of the categories. Landsat 8/9 and Sentinel-2 find it {lbare} % and {sbare} % bare ground"
               f"{'' if lveg is None else f' (vegetation {lveg} % and {pct(e.s2_veg_frac)} %)'}. "
               f"The nearest of 166 catalogued analog sites is {f.nearest_known.strip()}, {int(f.nearest_known_km)} km away, so this counts as new on our list. "
               + ("Matches are strongest on " + ", ".join(CAT_LABEL[c] for c in close[:3]) + "." if close else ""))
        caveats = [
            "Place name is approximate: the block was found by terrain statistics, so verify the location before presenting.",
            f"'New' means at least 150 km from 166 catalogued analog sites and no hits in web searches only (no Scholar, ADS or CNKI); nearest known is {int(f.nearest_known_km)} km.",
            "Prior art exists for ranking Earth sites against lunar terrain (e.g. arXiv 2501.08584), so this is not unprecedented; the new part is a quantified south-polar terrain match.",
        ] + s["extra_caveats"]
        stats = dict(composite=rnd(f.composite, 3), p_top40=rnd(f.p_top40, 2), nearest_known=f.nearest_known.strip(),
                     nearest_known_km=int(f.nearest_known_km), landsat_bare=rnd(e.bare_frac, 2), s2_bare=rnd(e.s2_bare_frac, 2),
                     landsat_veg=rnd(e.veg_frac, 2), s2_veg=rnd(e.s2_veg_frac, 2),
                     snow=rnd(e.snow_frac, 2), s2_snow=rnd(e.s2_snow_frac, 2), best_moon=str(f.moon))
        for c in cats:
            stats[f"cat_{c}"] = rnd(cats[c], 2)
        gaps = [
            dict(label="Mean surface temperature", earth=vals["temp_mean_k"], target=tv["temp_mean_k"], unit="K",
                 note="Earth: MODIS annual mean. Moon: Diviner region median."),
            dict(label="Circling-sun days per year", earth=sun_days, target=365, unit="days",
                 note="Days per year the Sun stays low and circles the horizon. Only latitudes above about 70 degrees get any on Earth. Moon value is the polar constant used in scoring."),
            dict(label="Shadowed share at 1.5 deg sun", earth=vals["shadow_frac"], target=tv["shadow_frac"], unit="",
                 note="Terrain shadowing from the same horizon-scan code on both bodies."),
            dict(label="Crater-like pits", earth=vals["crater_density"], target=tv["crater_density"], unit="per km2",
                 note="Earth is cut by water and ice, the Moon by impacts."),
        ]
        lat0, lon0 = float(f.lat), float(f.lon)
        w1 = offset(lat0, lon0, 3, 0)
        w2 = offset(lat0, lon0, 0, 4)
        w3 = offset(lat0, lon0, 3, 4)
        n1, n2, n3 = s["tour_names"][0], s["tour_names"][1], s["tour_names"][2]
        tour = dict(
            spawn=dict(lat=rnd(lat0, 4), lon=rnd(lon0, 4), heading=90, heightM=1.7),
            waypoints=[
                dict(name=n2, lat=w1[0], lon=w1[1], note="Waypoints are offsets of a few km from the block centre, not surveyed landmarks."),
                dict(name=n3, lat=w2[0], lon=w2[1], note=f"Landsat sees about {lbare} % bare ground over the block; expect sparse cover in places."),
                dict(name="3 km north-east", lat=w3[0], lon=w3[1], note=f"Block median slope {vals['slope_deg']:.1f} deg, relief about {vals['relief_m']:.0f} m."),
            ],
        )
        code = s["ft"].split("_")[0]
        images = dict(twin=f"/img/twin_{code}.webp", eo=f"/img/eo_{code}.webp", target=tgt["imagery"], earth=f"/img/eo_{code}.webp")
        out.append(dict(
            id=s["id"], name=s["name"], region=s["region"], lat=rnd(lat0, 3), lon=rnd(lon0, 3),
            analogFor=[tgt["id"]] + ([sec["id"]] if sec else []),
            headline=s["headline"], description=s["desc"],
            matches=mat, shortfalls=short, values=vals,
            tour=tour, references=REFS_MOON,
            body="moon", kind=s["kind"], status=s["status"], rank=s["rank"], why=why,
            images=images, gaps=gaps, caveats=caveats, valueSource="computed", stats=stats,
        ))
        # keep the 'code' for image lists
        out[-1]["_code"] = code
        out[-1]["_ft"] = s["ft"]
    return out


def build_featured_known(moon_targets):
    """Mauna Kea and Wright Valley: validation analogs (percentile from v3_test_T1_sites)."""
    t1 = pd.read_csv(os.path.join(RES, "v3_test_T1_sites.csv")).set_index("id")
    val = pd.read_csv(os.path.join(RES, "validation.csv")).set_index("id")
    eo = pd.read_csv(os.path.join(RES, "eo_verify.csv")).set_index("id")
    tmap = {t["code"]: t for t in moon_targets}
    mm = tmap["MM"]
    spec = [
        ("earth-mauna-kea", "mauna_kea", "CTRL_known_mauna_kea", "Mauna Kea, Hawaii (PISCES analog site)", "Mauna Kea, Hawaii", 4, "MM", "MP",
         "Established lunar analog: basaltic volcano whose terrain scored 98th percentile against Mons Mouton.",
         ("Mauna Kea hosts the PISCES lunar analog facility. We did not search for it: it is a validation check. Run through the same 40 m "
          "terrain pipeline, its 20 km block ranks in the 98th percentile of the discovery pool for match to Mons Mouton, which shows the engine "
          "can recognise a site people already use. Landsat classes 57 % of the block as vegetated, so the surface is far from bare.")),
        ("earth-wright-valley", "wright_valley", "CTRL_known_dry_valleys", "Wright Valley, McMurdo Dry Valleys, Antarctica", "McMurdo Dry Valleys, Antarctica", 5, "MM", "N2",
         "Established Mars and ice analog: cold desert valley that scored 85th percentile for terrain.",
         ("The McMurdo Dry Valleys are a long-used cold-desert analog for Mars. Run through the same pipeline as a validation check, the Wright Valley "
          "block ranks in the 85th percentile of the discovery pool for match. It could not be fully assessed on surface cover because WorldCover stops at 60 degrees south.")),
    ]
    out = []
    for fid, vid, eid, name, region, rank, best, second, headline, desc in spec:
        v = val.loc[vid]
        t = t1.loc[vid]
        e = eo.loc[eid] if eid in eo.index else None
        tgt = tmap[best]
        tv = tgt["values"]
        vals = {k: None for k in FEATURE_KEYS}
        vals.update(slope_deg=rnd(v.slope_p50, 2), roughness_m=sig(v.rough_p50, 3), relief_m=rnd(v.relief_m, 0), precip_mm_yr=rnd(v.precip_mm, 0))
        stats = dict(composite=rnd(t.composite, 2), percentile=rnd(t.pctile, 1), nearest_known=None, nearest_known_km=0,
                     landsat_bare=rnd(e.bare_frac, 2) if e is not None else None,
                     s2_bare=rnd(e.s2_bare_frac, 2) if e is not None else None,
                     snow=rnd(e.snow_frac, 2) if e is not None else None, role="validation analog", best_moon=str(t.best_moon))
        why = (f"Run through the same pipeline as the new candidates: composite {float(t.composite):.2f} (lower is closer), "
               f"{float(t.pctile):.0f}th percentile of the discovery pool for match to Mons Mouton. Block terrain: median slope {float(v.slope_p50):.1f} deg, "
               f"roughness {float(v.rough_p50):.2f} m, relief {float(v.relief_m):.0f} m, against {tv['slope_deg']:.1f} deg, {tv['roughness_m']:.2f} m, "
               f"{tv['relief_m']:.0f} m at {tgt['name']}. This is a validation result: the engine recognises these sites, but most other known analogs rank low on terrain alone.")
        gaps = [
            dict(label="Mean surface temperature", earth=None, target=tv["temp_mean_k"], unit="K", note="Not computed for validation sites."),
            dict(label="Circling-sun days per year", earth=0 if fid == "earth-mauna-kea" else None, target=365, unit="days",
                 note="Mauna Kea is at 20 degrees north: no circling sun. Not computed for Wright Valley."),
            dict(label="Crater-like pits", earth=None, target=tv["crater_density"], unit="per km2", note="Not computed for validation sites."),
        ]
        out.append(dict(
            id=fid, name=name, region=region, lat=rnd(v.lat, 3), lon=rnd(v.lon, 3),
            analogFor=[tgt["id"], tmap[second]["id"]], headline=headline, description=desc,
            matches=[f"Terrain match percentile {float(t.pctile):.0f}", f"Relief {float(v.relief_m):.0f} m vs {tv['relief_m']:.0f} m at {tgt['name']}"],
            shortfalls=["Temperature, lighting and crater values were not computed for validation sites", "Earth gravity, atmosphere, and no regolith"],
            values=vals, references=REFS_MOON, body="moon", kind="known", status="Known analog, used as validation", rank=rank, why=why,
            images=dict(eo=f"/img/eo_{'mauna_kea' if vid == 'mauna_kea' else 'dry_valleys'}.webp", target=tgt["imagery"],
                        earth=f"/img/eo_{'mauna_kea' if vid == 'mauna_kea' else 'dry_valleys'}.webp"),
            gaps=gaps,
            caveats=["Validation site shown for context, not a new find.", "Percentile is a rank among the discovery pool (validation test T1), using the composite of all categories."],
            valueSource="computed", stats=stats,
        ))
    return out


# --------------------------------------------------------------------------- Mars featured
MARS_LIT = [
    dict(id="earth-atacama-yungay", name="Atacama Desert, Yungay (Chile)", region="Atacama Desert, Chile", lat=-24.08, lon=-69.95,
         rank=1, analogFor=["mars-gale", "mars-oxia"], status="Known analog, literature",
         headline="Hyperarid desert whose oxidising soils are a classic analog for Mars surface chemistry.",
         desc=("The hyperarid core of the Atacama, around Yungay, is one of the driest places on Earth. Its soils have extremely low organic content and "
               "microbial activity, and are used as an analog for Mars's oxidising, dry regolith. The match is about surface chemistry and aridity rather "
               "than terrain: Yungay is flat, so it does not match the steep ground at Gale."),
         matches=["Hyperarid: very little rain", "Oxidising, organic-poor soils (Navarro-Gonzalez et al. 2003)"],
         shortfalls=["Much warmer and thicker air than Mars", "Terrain is flatter than most Mars landing-site windows"],
         refs=[dict(title="Navarro-Gonzalez et al. 2003, Mars-like soils in the Atacama Desert, Chile, and the dry limit of microbial life. Science",
                    url="https://doi.org/10.1126/science.1089143")]),
    dict(id="earth-lake-salda", name="Lake Salda, Turkey", region="Lake Salda, Turkey", lat=37.55, lon=29.68,
         rank=2, analogFor=["mars-jezero"], status="Known analog, literature",
         headline="Alkaline lake with hydromagnesite shorelines, studied as an analog for Jezero's carbonates.",
         desc=("Lake Salda in southwest Turkey is an alkaline lake with Mg-carbonate (hydromagnesite) deposits. It has been proposed as an analog for the "
               "Mg-rich carbonate seen from orbit at Jezero crater, the Perseverance landing site. The match is mineralogical and about a lake margin "
               "environment, not about terrain."),
         matches=["Mg-carbonate shoreline deposits", "Lake margin setting like a Jezero delta lake"],
         shortfalls=["Wet, vegetated catchment unlike Mars", "Not a terrain match"],
         refs=[]),
    dict(id="earth-rio-tinto", name="Rio Tinto, Spain", region="Rio Tinto, Huelva, Spain", lat=37.72, lon=-6.56,
         rank=3, analogFor=["mars-meridiani"], status="Known analog, literature",
         headline="Acidic, iron- and sulfate-rich river used as an analog for Meridiani's jarosite and hematite.",
         desc=("The Rio Tinto in southwest Spain is an acidic, iron-rich river with sulfate minerals such as jarosite. It is used as an analog for the "
               "sulfate and hematite-bearing rocks that Opportunity found at Meridiani Planum. The match is about water chemistry and minerals, not terrain."),
         matches=["Acid, iron-rich waters", "Iron sulfates and oxides as at Meridiani"],
         shortfalls=["Biologically active; Mars is not known to be", "Hillier than Meridiani's very flat plain"],
         refs=[dict(title="Fernandez-Remolar et al. 2005, The Rio Tinto Basin, Spain: mineralogy, sedimentary geobiology, and implications for interpretation of outcrop on Mars. Earth and Planetary Science Letters",
                    url="https://doi.org/10.1016/j.epsl.2005.09.010")]),
]


def find_mars_match_file():
    pats = ["*final*", "*featured*", "*rank*", "*match*"]
    skip = {"pool_blocks.csv", "test_blocks.csv", "test_geo.csv", "mars_sites.json"}
    for p in pats:
        for fpath in sorted(glob.glob(os.path.join(MARS, "results", p + ".csv"))):
            if os.path.basename(fpath) not in skip and "pool" not in os.path.basename(fpath):
                return fpath
    return None


def build_featured_mars(mars_targets):
    pool = pd.read_csv(os.path.join(MARS, "results", "pool_blocks.csv"), usecols=["lat", "lon", "slope_p50", "rough_p50", "relief_m",
                                                                                  "precip_mm", "frac_lt10", "tile"])
    out = []
    tmap = {t["id"]: t for t in mars_targets}
    mf = find_mars_match_file()
    if mf:
        print(f"  note: found Mars match file {os.path.relpath(mf, DISC)}; see data/README.md for the columns it needs")
        out.extend(cards_from_mars_csv(mf, pool, mars_targets))
    if out:
        return out
    for s in MARS_LIT:
        d = haversine_km(s["lat"], s["lon"], pool.lat.values, pool.lon.values)
        i = int(np.argmin(d))
        near = pool.iloc[i]
        within = float(d[i]) <= 50
        vals = {k: None for k in FEATURE_KEYS}
        if within:
            vals.update(slope_deg=rnd(near.slope_p50, 2), roughness_m=sig(near.rough_p50, 3), relief_m=rnd(near.relief_m, 0),
                        precip_mm_yr=rnd(near.precip_mm, 0), flat_frac=rnd(near.frac_lt10, 3))
        tgt = tmap.get(s["analogFor"][0])
        tv = tgt["values"] if tgt else {}
        gaps = [dict(label="Annual precipitation", earth=vals["precip_mm_yr"], target=None, unit="mm/yr",
                     note="No liquid precipitation on present-day Mars; no sourced Mars figure in the data pack."),
                dict(label="Median slope", earth=vals["slope_deg"], target=tv.get("slope_deg"), unit="deg",
                     note="Earth value is a 200 m-scale pool block; Mars value is a 200 m window, so indicative only.")]
        caveats = ["Mars targets use literature values / indicative 200 m terrain, not a full computed match.",
                   "Place name approximate; coordinates are the well-known site location." ]
        if not within:
            caveats.append(f"No 200 m pool block within 50 km (nearest {float(d[i]):.0f} km), so terrain values are blank.")
        if not s["refs"]:
            caveats.append("No reference attached: verify a citation before presenting.")
        out.append(dict(
            id=s["id"], name=s["name"], region=s["region"], lat=s["lat"], lon=s["lon"], analogFor=s["analogFor"],
            headline=s["headline"], description=s["desc"], matches=s["matches"], shortfalls=s["shortfalls"], values=vals,
            references=s["refs"], body="mars", kind="known", status=s["status"], rank=s["rank"],
            why=(s["desc"] + (f" Terrain values are from the nearest 200 m block of the Mars pool ({float(d[i]):.0f} km away): median slope {float(near.slope_p50):.1f} deg, relief {float(near.relief_m):.0f} m."
                              if within else " No terrain values were computed for this site.")),
            images=dict(target=tgt["imagery"]) if tgt else None,
            gaps=gaps, caveats=caveats, valueSource="literature",
            stats=dict(role="literature analog", nearest_pool_block_km=rnd(float(d[i]), 1)),
        ))
    return out


def cards_from_mars_csv(path, pool, mars_targets):
    """Expected columns: id,name,lat,lon,best_mars (jezero|gale|meridiani|oxia),kind (new|known),composite[,region,status,nearest_known,nearest_known_km]."""
    df = pd.read_csv(path)
    need = {"id", "name", "lat", "lon", "best_mars"}
    if not need <= set(df.columns):
        print(f"  ! {os.path.basename(path)} lacks columns {sorted(need - set(df.columns))}; ignoring, using literature cards")
        return []
    tmap = {t["id"]: t for t in mars_targets}
    out = []
    for n, r in enumerate(df.itertuples(index=False), 1):
        r = r._asdict()
        tid = f"mars-{str(r['best_mars']).strip().lower()}"
        if tid not in tmap:
            continue
        d = haversine_km(float(r["lat"]), float(r["lon"]), pool.lat.values, pool.lon.values)
        i = int(np.argmin(d))
        near = pool.iloc[i]
        ok = float(d[i]) <= 50
        vals = {k: None for k in FEATURE_KEYS}
        if ok:
            vals.update(slope_deg=rnd(near.slope_p50, 2), roughness_m=sig(near.rough_p50, 3), relief_m=rnd(near.relief_m, 0),
                        precip_mm_yr=rnd(near.precip_mm, 0), flat_frac=rnd(near.frac_lt10, 3))
        comp = rnd(r.get("composite"), 3) if r.get("composite") is not None else None
        out.append(dict(
            id=f"earth-{r['id']}", name=str(r["name"]), region=str(r.get("region") or ""), lat=rnd(r["lat"], 3), lon=rnd(r["lon"], 3),
            analogFor=[tid], headline=f"Earth block matched to {tmap[tid]['name']} by the Mars run.",
            description="Candidate from the Mars Earth-match run. Terrain is at 200 m scale.", values=vals, references=[], body="mars",
            kind=str(r.get("kind") or "new") if str(r.get("kind")) in ("new", "known", "reserve") else "new",
            status=str(r.get("status") or "Mars run candidate"), rank=n,
            why=f"Composite {comp} against {tmap[tid]['name']} (lower is closer)." if comp is not None else "",
            images=dict(target=tmap[tid]["imagery"]), gaps=[],
            caveats=["Mars terrain is at 200 m scale; comparison with 40 m Earth blocks is indicative."],
            valueSource="computed", stats=dict(composite=comp, nearest_known=str(r.get("nearest_known") or ""),
                                                 nearest_known_km=rnd(r.get("nearest_known_km"), 0)),
        ))
    return out


def featured_file(cards):
    d = PROV_DATASETS
    for c in cards:
        for k in ("_code", "_ft"):
            c.pop(k, None)
        if c.get("images") is None:
            c.pop("images", None)
    return dict(
        featured=cards,
        provenance=dict(
            mock=False,
            datasets=[d["cop"], d["lola"], d["diviner"], d["modis_lst"], d["landsat"], d["worldcover"]],
            processing=("Moon cards: three 'new' blocks and three reserves from results/v3_final_table.csv (composite across 10 categories, stability "
                        "over 1,000 random re-weightings, distance to 166 catalogued sites, Landsat 8/9 and Sentinel-2 surface check). Values are the "
                        "block's own values from earth_cells.json. 'Known' Moon cards (Mauna Kea, Wright Valley) are validation analogs. "
                        "Mars cards are literature analogs unless a Mars Earth-match file was found. Place names are approximate; 'new' means at least 150 km from "
                        "catalogued sites and nothing found in web searches only."),
            generatedAt=TODAY,
            run=RUN_LABEL,
        ),
    )


# --------------------------------------------------------------------------- images
def cwebp(src, dst, maxw=1200, q=78):
    from PIL import Image
    if not os.path.exists(src):
        print(f"  ! missing image {src}")
        return False
    w, h = Image.open(src).size
    cmd = [CWEBP, "-quiet", "-q", str(q), "-m", "6"]
    if w > maxw:
        cmd += ["-resize", str(maxw), "0"]
    cmd += [src, "-o", dst]
    subprocess.run(cmd, check=True)
    return True


def build_images():
    os.makedirs(IMG, exist_ok=True)
    P = os.path.join(DISC, "previews")
    jobs = []
    for s in NEW_SPEC:
        code = s["ft"].split("_")[0]
        jobs.append((f"{P}/v3_twin_{s['ft']}.png", f"twin_{code}.webp"))
        jobs.append((f"{P}/eo_{s['ft']}.png", f"eo_{code}.webp"))
    for code in MOON_SLUG:
        jobs.append((f"{P}/moon_{code}.png", f"moon_{code}.webp"))
    jobs.append((f"{P}/eo_CTRL_known_mauna_kea.png", "eo_mauna_kea.webp"))
    jobs.append((f"{P}/eo_CTRL_known_dry_valleys.png", "eo_dry_valleys.webp"))
    for key in MARS_SITES:
        jobs.append((f"{MARS}/previews/mars_{key}.png", f"mars_{key}.webp"))
    total = 0
    for src, name in jobs:
        dst = os.path.join(IMG, name)
        if cwebp(src, dst):
            total += os.path.getsize(dst)
    keep = {n for _, n in jobs}
    for f in os.listdir(IMG):
        if f.endswith(".webp") and f not in keep:
            os.remove(os.path.join(IMG, f))
    print(f"  wrote {len(jobs)} images, {total / 1024:.0f} KB total")


# --------------------------------------------------------------------------- heightmaps
def encode_height(a, mpp, note):
    from scipy import ndimage as ndi
    a = np.asarray(a, dtype="float64")
    bad = ~np.isfinite(a)
    if bad.all():
        return None
    if bad.any():
        idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
        a = a[tuple(idx)]
    lo, hi = float(np.floor(a.min())), float(np.ceil(a.max()))
    if hi - lo < 1:
        hi = lo + 1
    v = np.round((a - lo) / (hi - lo) * 65535.0) - 32768
    v = np.clip(v, -32768, 32767).astype("<i2")
    return dict(width=int(a.shape[1]), height=int(a.shape[0]), metersPerPixel=mpp, minElevation=lo, maxElevation=hi,
                encoding="int16-base64", data=base64.b64encode(v.tobytes()).decode("ascii"),
                provenance=dict(mock=False, processing=note, generatedAt=TODAY))


def center_crop(a, n):
    h, w = a.shape
    r0, c0 = max(0, (h - n) // 2), max(0, (w - n) // 2)
    return a[r0:r0 + n, c0:c0 + n]


def build_heightmaps(moon, mars):
    hd = os.path.join(OUT, "heightmaps")
    os.makedirs(hd, exist_ok=True)
    for f in os.listdir(hd):
        os.remove(os.path.join(hd, f))
    done = set()
    for t in moon:
        p = os.path.join(DISC, "data", "moon", "crops", f"{t['code']}.npy")
        if not os.path.exists(p):
            continue
        a = center_crop(np.load(p), 256)
        hm = encode_height(a, 40, "LRO LOLA LDEM_80S_40M, 256 by 256 pixel crop at the region centre, 40 m per pixel, elevation in metres relative "
                                  "to the 1,737.4 km reference sphere. Polar stereographic grid (not north-up). Pixels outside the region outline filled from nearest valid pixel.")
        if hm:
            write_json(f"heightmaps/{t['id']}.json", hm)
            done.add(t["id"])
    for t in mars:
        key = t["id"].replace("mars-", "")
        p = os.path.join(MARS, "data", f"{key}_dem200.npy")
        if not os.path.exists(p):
            continue
        a = np.load(p)
        hm = encode_height(a, 200, "USGS HRSC+MOLA blended DEM 200 m, 150 by 150 window (30 km) at the site centre, elevation in metres relative to the MOLA datum.")
        if hm:
            write_json(f"heightmaps/{t['id']}.json", hm)
            done.add(t["id"])
    for t in moon + mars:
        if t["id"] in done:
            t["heightmap"] = f"heightmaps/{t['id']}.json"
        else:
            t.pop("heightmap", None)


# --------------------------------------------------------------------------- main
def main():
    print(f"APP  = {APP}\nDISC = {DISC}")
    os.makedirs(OUT, exist_ok=True)
    print("features.json")
    write_json("features.json", features_file(), indent=1)
    print("earth_cells.json")
    earth, cells = build_earth()
    write_json("earth_cells.json", earth)
    print("targets.json")
    moon = build_moon_targets()
    mars, _ = build_mars_targets()
    print("heightmaps")
    build_heightmaps(moon, mars)
    write_json("targets.json", targets_file(moon, mars), indent=1)
    print("featured_analogs.json")
    cards = build_featured_moon(earth, moon, cells) + build_featured_known(moon) + build_featured_mars(mars)
    write_json("featured_analogs.json", featured_file(cards), indent=1)
    print("images")
    build_images()
    print("done")


if __name__ == "__main__":
    sys.exit(main())
