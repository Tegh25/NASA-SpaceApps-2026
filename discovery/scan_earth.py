#!/usr/bin/env python3
"""Scan Earth (Copernicus GLO-30, free, no login) for 15x15 km blocks whose TERRAIN matches a target fingerprint.

Usage:
  python scan_earth.py --target fingerprints/jezero.json --tiles N37_E029 S25_W070 N75_W090
  python scan_earth.py --target fingerprints/jezero.json --bbox -72 -28 -66 -18          # W S E N in degrees
Tiles download automatically into data/earth/ (about 10-30 MB each, 1 degree x 1 degree).
Outputs results/scan_<target>.csv and results/top_<target>.png.

This is TERRAIN ONLY (slope + roughness). Forest, snow and water are NOT filtered here:
check the top hits by eye, then add temperature / mineral / vegetation checks.
"""
import argparse, csv, json, os, sys, urllib.request, urllib.error
import numpy as np
import rasterio
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import (meters_per_pixel, slope_degrees, roughness_plane3, hillshade, slope_hist, wasserstein_slope,
                    tile_name, tile_url, haversine_km)

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "data", "earth")


def code_to_name(code):  # "N37_E029" -> tile name
    ns, la, ew, lo = code[0], int(code[1:3]), code[4], int(code[5:8])
    return tile_name((la if ns == "N" else -la), (lo if ew == "E" else -lo))


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + ".tif")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path
    url = tile_url(name)
    print("  downloading", name, "...", flush=True)
    try:
        urllib.request.urlretrieve(url, path + ".part")
        os.replace(path + ".part", path)
        return path
    except urllib.error.HTTPError as e:
        print(f"  (no tile: HTTP {e.code} - probably open ocean)")
    except Exception as e:
        print("  download failed:", e)
    return None


def scan_tile(path, block_km, min_valid):
    rows = []
    with rasterio.open(path) as src:
        dem = src.read(1).astype("float64")
        dx, dy = meters_per_pixel(src)
        tr = src.transform
    dem[np.abs(dem) > 1e5] = np.nan
    slope = slope_degrees(dem, dx, dy)
    rough = roughness_plane3(dem)
    bx, by = int(round(block_km * 1000 / dx)), int(round(block_km * 1000 / dy))
    for r0 in range(0, dem.shape[0] - by + 1, by):
        for c0 in range(0, dem.shape[1] - bx + 1, bx):
            d = dem[r0:r0 + by, c0:c0 + bx]
            if np.isfinite(d).mean() < min_valid:
                continue
            if np.nanmax(d) - np.nanmin(d) < 5:  # flat water / salt flat / sea
                continue
            s, r = slope[r0:r0 + by, c0:c0 + bx], rough[r0:r0 + by, c0:c0 + bx]
            sf, rf = s[np.isfinite(s)], r[np.isfinite(r)]
            if sf.size < 100 or rf.size < 100:
                continue
            lon, lat = tr * (c0 + bx / 2, r0 + by / 2)
            rows.append({
                "lat": round(lat, 4), "lon": round(lon, 4), "hist": slope_hist(s),
                "slope_p50": float(np.percentile(sf, 50)), "slope_p90": float(np.percentile(sf, 90)),
                "rough_p50": float(np.percentile(rf, 50)),
                "relief_m": float(np.nanmax(d) - np.nanmin(d)),
                "thumb": hillshade(d[::6, ::6], dx * 6, dy * 6),
            })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--tiles", nargs="*", default=[])
    ap.add_argument("--bbox", type=float, nargs=4, metavar=("W", "S", "E", "N"))
    ap.add_argument("--block-km", type=float, default=15.0)
    ap.add_argument("--min-valid", type=float, default=0.95)
    ap.add_argument("--known", default=os.path.join(HERE, "known_analogs.csv"))
    ap.add_argument("--exclude-km", type=float, default=50.0)
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--no-download", action="store_true", help="only use tiles already in data/earth/")
    a = ap.parse_args()

    tgt = json.load(open(a.target))
    th = np.array(tgt["slope_hist"])
    if tgt["pixel_m"][0] > 35 or tgt["pixel_m"][0] < 25:
        print(f"WARNING: target pixel size is {tgt['pixel_m']} m; re-run fingerprint.py with --resample 30 to match Earth.")

    names = [code_to_name(c) for c in a.tiles]
    if a.bbox:
        w, s, e, n = a.bbox
        for la in range(int(np.floor(s)), int(np.ceil(n))):
            for lo in range(int(np.floor(w)), int(np.ceil(e))):
                names.append(tile_name(la, lo))
    names = list(dict.fromkeys(names))
    if not names:
        sys.exit("give --tiles or --bbox")
    print(f"{len(names)} tile(s) to scan (target: {tgt['name']})")

    rows = []
    for nm in names:
        p = os.path.join(CACHE, nm + ".tif") if a.no_download else fetch(nm)
        if not p or not os.path.exists(p):
            continue
        print("  scanning", nm, flush=True)
        t = scan_tile(p, a.block_km, a.min_valid)
        rows += t
    if not rows:
        sys.exit("no usable blocks found")

    for r in rows:
        r["w1"] = wasserstein_slope(r["hist"], th)
        r["d_rough"] = abs(r["rough_p50"] - tgt["rough_p50"])
    mw = np.median([r["w1"] for r in rows]) or 1.0
    mr = np.median([r["d_rough"] for r in rows]) or 1.0
    for r in rows:
        r["score"] = r["w1"] / mw + r["d_rough"] / mr  # lower = closer to the target

    known = []
    if os.path.exists(a.known):
        known = list(csv.DictReader(open(a.known)))
    for r in rows:
        near = [(haversine_km(r["lat"], r["lon"], float(k["lat"]), float(k["lon"])), k["name"]) for k in known]
        dmin, nmin = min(near) if near else (1e9, "")
        r["near_known_km"] = round(dmin, 1)
        r["near_known"] = nmin if dmin <= a.exclude_km else ""
    rows.sort(key=lambda r: r["score"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i

    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    out_csv = os.path.join(HERE, "results", f"scan_{tgt['name']}.csv")
    with open(out_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rank", "lat", "lon", "score", "slope_wasserstein_deg", "rough_p50_m", "slope_p50", "slope_p90", "relief_m", "near_known", "near_known_km"])
        for r in rows:
            w.writerow([r["rank"], r["lat"], r["lon"], round(r["score"], 3), round(r["w1"], 3), round(r["rough_p50"], 3),
                        round(r["slope_p50"], 2), round(r["slope_p90"], 2), round(r["relief_m"]), r["near_known"], r["near_known_km"]])

    new = [r for r in rows if not r["near_known"]][:a.top]
    print(f"\n{len(rows)} blocks scored. Target: slope p50 {tgt['slope_p50']} deg, roughness p50 {tgt['rough_p50']} m")
    print("Top NEW candidates (not within %d km of a known analog):" % a.exclude_km)
    for r in new:
        print(f"  #{r['rank']:<4d} lat {r['lat']:9.4f} lon {r['lon']:10.4f}  score {r['score']:.2f}  slope p50 {r['slope_p50']:.1f} deg  rough {r['rough_p50']:.2f} m  relief {r['relief_m']:.0f} m")
    cols = 4
    nr = int(np.ceil(len(new) / cols))
    fig, axs = plt.subplots(nr, cols, figsize=(3.2 * cols, 3.4 * nr))
    for ax in np.atleast_1d(axs).ravel():
        ax.axis("off")
    for ax, r in zip(np.atleast_1d(axs).ravel(), new):
        ax.imshow(r["thumb"], cmap="gray")
        ax.set_title(f"#{r['rank']}  {r['lat']:.2f}, {r['lon']:.2f}\nscore {r['score']:.2f}", fontsize=8)
    out_png = os.path.join(HERE, "results", f"top_{tgt['name']}.png")
    fig.savefig(out_png, dpi=110, bbox_inches="tight")
    print("\nsaved", os.path.relpath(out_csv, HERE), "and", os.path.relpath(out_png, HERE))


if __name__ == "__main__":
    main()
