#!/usr/bin/env python3
"""Build the Earth terrain twins for the Twin Terrain Lab.

Run from the app root:
    DISC/.venv/bin/python scripts/build_twin_terrain.py

For every featured Moon-body site whose Copernicus GLO-30 tile exists in ../discovery/data/earth:
  * crops a 256 x 256 grid at exactly 40 m per pixel (10.24 km square), north-up, centred on the site
    (local equirectangular projection, bilinear resampling of the 30 m geographic grid),
  * writes public/data/heightmaps/earth/<site-id>.json (same format as the Moon heightmaps + provenance + stats),
  * crops the central 10.24 km of public/img/eo_<code>.webp to public/img/twin/<site-id>_earth.webp (512 px),
  * adds `stats` to every public/data/heightmaps/moon-*.json (in place),
  * adds `twin` to featured_analogs.json for each processed site.

IMPORTANT: scripts/build_real_data.py wipes public/data/heightmaps and rewrites featured_analogs.json.
Run this script AFTER it, every time.
"""
from __future__ import annotations

import base64
import glob
import json
import math
import os

import numpy as np
import rasterio
from scipy import ndimage as ndi

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Prefer the discovery/ folder committed in this repo; fall back to a sibling checkout.
_IN_REPO = os.path.join(APP, "discovery")
DISC = os.environ.get("TERRALOG_DISC") or (
    _IN_REPO if os.path.isdir(os.path.join(_IN_REPO, "results")) else os.path.abspath(os.path.join(APP, "..", "discovery"))
)
# Raw DEM tiles (~9 GB) are not in git: TERRALOG_TILES, else <DISC>/data/earth, else ../discovery/data/earth.
_tile_candidates = [os.environ.get("TERRALOG_TILES"), os.path.join(DISC, "data", "earth"),
                    os.path.abspath(os.path.join(APP, "..", "discovery", "data", "earth"))]
TILES = next((t for t in _tile_candidates if t and os.path.isdir(t)), _tile_candidates[1])
DATA = os.path.join(APP, "public", "data")
IMG = os.path.join(APP, "public", "img")
N, MPP = 256, 40.0
TODAY = "2026-11-15"
M_LAT, M_LON = 110540.0, 111320.0
EO_PX_M = 20000.0 / 256  # eo_*.webp: 256 px over a 20 km block centred on the site


def tile_path(lat_f, lon_f):
    ns = "N" if lat_f >= 0 else "S"
    ew = "E" if lon_f >= 0 else "W"
    return os.path.join(TILES, f"Copernicus_DSM_COG_10_{ns}{abs(lat_f):02d}_00_{ew}{abs(lon_f):03d}_00_DEM.tif")


def has_tile(lat_f, lon_f):
    return os.path.exists(tile_path(lat_f, lon_f))


def extent(lat, lon):
    hl = (N / 2 + 1) * MPP / M_LAT
    hn = (N / 2 + 1) * MPP / (M_LON * math.cos(math.radians(lat)))
    return lat - hl, lat + hl, lon - hn, lon + hn


def fit_centre(lat, lon):
    """Shift the centre inward if the window needs a tile that is not available. Returns lat, lon, (dlat_m, dlon_m)."""
    lat0, lon0 = lat, lon
    for _ in range(6):
        s, n, w, e = extent(lat, lon)
        moved = False
        for la in range(math.floor(s), math.floor(n) + 1):
            for lo in range(math.floor(w), math.floor(e) + 1):
                if has_tile(la, lo):
                    continue
                moved = True
                # push away from the missing tile, to its neighbour side
                if la < math.floor(lat):
                    lat = math.floor(lat) + (n - s) / 2 + 1e-4
                elif la > math.floor(lat):
                    lat = math.floor(lat) + 1 - (n - s) / 2 - 1e-4
                if lo < math.floor(lon):
                    lon = math.floor(lon) + (e - w) / 2 + 1e-4
                elif lo > math.floor(lon):
                    lon = math.floor(lon) + 1 - (e - w) / 2 - 1e-4
        if not moved:
            break
    return lat, lon, ((lat - lat0) * M_LAT, (lon - lon0) * M_LON * math.cos(math.radians(lat0)))


def sample(lat, lon):
    """256 x 256 float array, row 0 = north."""
    i = np.arange(N) - (N - 1) / 2
    lats = lat - i * MPP / M_LAT
    lons = lon + i * MPP / (M_LON * math.cos(math.radians(lat)))
    LAT, LON = np.meshgrid(lats, lons, indexing="ij")
    out = np.full((N, N), np.nan)
    la_f, lo_f = np.floor(LAT).astype(int), np.floor(LON).astype(int)
    for la in np.unique(la_f):
        for lo in np.unique(lo_f):
            m = (la_f == la) & (lo_f == lo)
            if not m.any():
                continue
            with rasterio.open(tile_path(int(la), int(lo))) as ds:
                t = ds.transform
                a = ds.read(1).astype("float64")
                if ds.nodata is not None:
                    a[a == ds.nodata] = np.nan
                col = (LON[m] - t.c) / t.a - 0.5
                row = (LAT[m] - t.f) / t.e - 0.5
                out[m] = ndi.map_coordinates(a, [row, col], order=1, mode="nearest")
    return out


def stats_for(a):
    """Same simple finite-difference slope for Earth and Moon: central differences at 40 m, degrees."""
    a = np.asarray(a, dtype="float64")
    gy, gx = np.gradient(a, MPP)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    hist, _ = np.histogram(np.clip(slope, 0, 44.9999), bins=45, range=(0, 45))
    p5, p95 = np.percentile(a, [5, 95])
    return dict(
        slopeHist=[round(float(x), 5) for x in hist / hist.sum()],
        slopeBinDeg=1, slopeMaxDeg=45,
        slopeP50=round(float(np.percentile(slope, 50)), 2),
        slopeP90=round(float(np.percentile(slope, 90)), 2),
        reliefP5=round(float(p5), 1), reliefP95=round(float(p95), 1), reliefM=round(float(p95 - p5), 1),
        method="Central finite differences (numpy.gradient) at 40 m spacing, slope = atan(|grad|) in degrees; "
               "histogram has 45 bins of 1 deg from 0 to 45 (steeper pixels counted in the last bin), values are fractions summing to 1. "
               "Relief = 95th minus 5th percentile of elevation. Same code for Earth and Moon.",
    )


def encode(a):
    lo, hi = float(np.floor(a.min())), float(np.ceil(a.max()))
    if hi - lo < 1:
        hi = lo + 1
    v = np.clip(np.round((a - lo) / (hi - lo) * 65535.0) - 32768, -32768, 32767).astype("<i2")
    return lo, hi, base64.b64encode(v.tobytes()).decode("ascii")


def decode(hm):
    v = np.frombuffer(base64.b64decode(hm["data"]), dtype="<i2").astype("float64").reshape(hm["height"], hm["width"])
    return hm["minElevation"] + (v + 32768) / 65535.0 * (hm["maxElevation"] - hm["minElevation"])


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), allow_nan=False)
    return os.path.getsize(path)


def texture(site, lat, lon):
    from PIL import Image
    eo = (site.get("images") or {}).get("eo")
    if not eo:
        return None
    src = os.path.join(APP, "public", eo.lstrip("/"))
    if not os.path.exists(src):
        return None
    im = Image.open(src).convert("RGB")
    s = im.size[0] / 20000.0  # px per metre
    # eo block centre = the featured lat/lon (final_blocks.csv centres agree to 0.01 deg)
    dx = (lon - site["lon"]) * M_LON * math.cos(math.radians(site["lat"]))
    dy = -(lat - site["lat"]) * M_LAT
    half = 5120.0 * s
    cx, cy = im.size[0] / 2 + dx * s, im.size[1] / 2 + dy * s
    box = (cx - half, cy - half, cx + half, cy + half)
    out = im.resize((512, 512), Image.LANCZOS, box=box)
    dst = os.path.join(IMG, "twin", f"{site['id']}_earth.webp")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst, "WEBP", quality=82, method=6)
    return os.path.relpath(dst, APP), os.path.getsize(dst)


def main():
    fpath = os.path.join(DATA, "featured_analogs.json")
    feat = json.load(open(fpath))
    for s in feat["featured"]:
        body = s.get("body") or ("moon" if s["analogFor"] and s["analogFor"][0].startswith("moon") else "mars")
        if body != "moon":
            continue
        la, lo, shift = fit_centre(s["lat"], s["lon"])
        s0, n0, w0, e0 = extent(la, lo)
        if not all(has_tile(a, b) for a in range(math.floor(s0), math.floor(n0) + 1) for b in range(math.floor(w0), math.floor(e0) + 1)):
            print(f"skip {s['id']}: Copernicus tile missing")
            s.pop("twin", None)
            continue
        a = sample(la, lo)
        assert np.isfinite(a).all()
        lo_e, hi_e, data = encode(a)
        st = stats_for(a)
        target = s["analogFor"][0]
        hm = dict(
            width=N, height=N, metersPerPixel=40, minElevation=lo_e, maxElevation=hi_e, encoding="int16-base64", data=data,
            provenance=dict(
                mock=False, generatedAt=TODAY,
                datasets=[dict(name="Copernicus DEM GLO-30", version="2021 release", url="https://registry.opendata.aws/copernicus-dem/",
                               notes="Copernicus DEM GLO-30, produced by ESA/Airbus from TanDEM-X; free and open licence (COPERNICUS DEM, (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the EU and ESA).")],
                processing="Copernicus DEM GLO-30 (30 m geographic grid) resampled bilinearly to 40 m per pixel on a local equirectangular grid "
                           "(dx = 40 m / (111320 cos lat), dy = 40 m / 110540), 256 by 256 pixels = 10.24 km square, north-up, elevation in metres above EGM2008. "
                           "The Moon twin (" + target + ") is on a polar stereographic grid, not north-up, at the same 40 m per pixel.",
                centre=dict(lat=round(la, 5), lon=round(lo, 5)), requestedCentre=dict(lat=s["lat"], lon=s["lon"]),
                centreShiftM=dict(north=round(shift[0], 1), east=round(shift[1], 1)),
                siteId=s["id"]),
            stats=st)
        size = dump(os.path.join(DATA, "heightmaps", "earth", f"{s['id']}.json"), hm)
        tex = texture(s, la, lo)
        s["twin"] = dict(earthHeightmap=f"heightmaps/earth/{s['id']}.json", moonHeightmap=f"heightmaps/{target}.json")
        print(f"{s['id']:22s} {size/1024:.0f} KB shift={shift[0]:.0f}N/{shift[1]:.0f}E m p50={st['slopeP50']} p90={st['slopeP90']} relief={st['reliefM']} tex={tex}")
    with open(fpath, "w") as f:
        json.dump(feat, f, indent=1, allow_nan=False)

    for p in sorted(glob.glob(os.path.join(DATA, "heightmaps", "moon-*.json"))):
        hm = json.load(open(p))
        hm["stats"] = stats_for(decode(hm))
        dump(p, hm)
        print(f"{os.path.basename(p):36s} p50={hm['stats']['slopeP50']} p90={hm['stats']['slopeP90']} relief={hm['stats']['reliefM']}")


if __name__ == "__main__":
    main()
