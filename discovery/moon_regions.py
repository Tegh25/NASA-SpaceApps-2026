#!/usr/bin/env python3
"""Moon side: real LRO features for the 9 Artemis III candidate regions.

Inputs  (download_moon.sh / already in data/moon/):
  LDEM_80S_40M.IMG     LOLA south-polar DEM, 40 m/px, int16 LE, height = DN*0.5 m (relative to 1737.4 km)
  dlre_prp_south.tab   Diviner Polar Resource Product: temp_avg (K), temp_max (K), ice_depth (m; -999 = not stable)
  regions/A3_9regions-lonlat-simplified.geojson   USGS outlines (Moon_2000 lon/lat)
Outputs:
  results/moon_regions.json                 per-region fingerprint (slope hist, roughness, relief, thermal, ice)
  results/moon_orientation_check.png        sanity check that the projection is not mirrored
  previews/moon_<code>.png, data/moon/crops/<code>.npy    hillshade + DEM crop (reused for the twin view)
Run:  python -I moon_regions.py
"""
import json, os
import numpy as np
import pandas as pd
from matplotlib.path import Path as MPath
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import slope_degrees, roughness_plane3, hillshade, slope_hist, SLOPE_BINS

HERE = os.path.dirname(os.path.abspath(__file__))
R = 1737400.0   # metres, LOLA reference sphere
N = 15200       # LDEM_80S_40M is 15200 x 15200 at 40 m
PIX = 40.0
CTR = 7599.5    # 0-based pixel coordinate of the pole (LBL: PROJECTION_OFFSET 7599.5)


def lonlat_to_px(lon, lat):
    """South polar stereographic (spherical, true at pole). 90E to the right, 0E up. Returns (col,row), 0-based."""
    lon, lat = np.radians(np.asarray(lon, float)), np.asarray(lat, float)
    rho = 2 * R * np.tan(np.radians(90 - np.abs(lat)) / 2)
    return rho * np.sin(lon) / PIX + CTR, -rho * np.cos(lon) / PIX + CTR


def px_to_lonlat(col, row):
    x, y = (np.asarray(col) - CTR) * PIX, -(np.asarray(row) - CTR) * PIX
    rho = np.hypot(x, y)
    lat = -(90 - np.degrees(2 * np.arctan(rho / (2 * R))))
    return np.degrees(np.arctan2(x, y)), lat


def load_dem():
    raw = np.memmap(os.path.join(HERE, "data/moon/LDEM_80S_40M.IMG"), dtype="<i2", mode="r", shape=(N, N))
    return raw  # metres = raw * 0.5


def orientation_check(dem):
    """Plot the whole 80S-90S cap with named craters; Malapert (a big massif) must sit at 0E ~86S and be HIGH."""
    step = 8
    small = np.asarray(dem[::step, ::step], dtype="float32") * 0.5
    marks = {"Shackleton": (0, -89.9), "Malapert": (0.0, -85.9), "Cabeus": (-35.5, -84.9), "Haworth": (-5.0, -87.5),
             "de Gerlache": (-87.1, -88.5), "Faustini": (77.0, -87.3), "Shoemaker": (44.9, -88.1)}
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.imshow(small, cmap="gray", vmin=-4000, vmax=5000)
    for k, (lo, la) in marks.items():
        c, r = lonlat_to_px(lo, la)
        ax.plot(c / step, r / step, "r+")
        ax.text(c / step + 6, r / step, k, color="yellow", fontsize=7)
    ax.set_title("LOLA 80S-90S, 0E up / 90E right. Craters should sit on matching depressions", fontsize=9)
    fig.savefig(os.path.join(HERE, "results/moon_orientation_check.png"), dpi=100, bbox_inches="tight")
    plt.close(fig)
    # numeric test: Malapert massif summit must be far above Shackleton rim region
    def med(lo, la, rad_km=5):
        c, r = lonlat_to_px(lo, la); k = int(rad_km * 1000 / PIX)
        return float(np.median(np.asarray(dem[int(r) - k:int(r) + k, int(c) - k:int(c) + k], dtype="float32") * 0.5))
    return {"malapert_median_m": med(0.0, -85.9), "haworth_median_m": med(-5.0, -87.5), "cabeus_median_m": med(-35.5, -84.9)}


def main():
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "previews"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "data/moon/crops"), exist_ok=True)
    dem = load_dem()
    print("orientation check:", orientation_check(dem))
    gj = json.load(open(os.path.join(HERE, "data/moon/regions/A3_9regions-lonlat-simplified.geojson")))

    out = {}
    polys = {}
    for f in gj["features"]:
        code, name = f["properties"]["RegionCode"], f["properties"]["Region"]
        ring = np.array(f["geometry"]["coordinates"][0])
        c, r = lonlat_to_px(ring[:, 0], ring[:, 1])
        polys[code] = np.column_stack([c, r])
        c0, c1, r0, r1 = int(c.min()) - 4, int(c.max()) + 5, int(r.min()) - 4, int(r.max()) + 5
        crop = np.asarray(dem[r0:r1, c0:c1], dtype="float64") * 0.5
        rr, cc = np.mgrid[r0:r1, c0:c1]
        inside = MPath(polys[code]).contains_points(np.column_stack([cc.ravel(), rr.ravel()])).reshape(crop.shape)
        slope = slope_degrees(crop, PIX, PIX)
        rough = roughness_plane3(crop)
        m = inside & np.isfinite(slope)
        s, rg, z = slope[m], rough[m], crop[m]
        clon, clat = px_to_lonlat(c.mean(), r.mean())
        out[code] = {
            "name": name, "code": code, "area_km2": round(float(m.sum()) * PIX * PIX / 1e6, 1),
            "center_lat": round(float(clat), 3), "center_lon": round(float(clon), 3),
            "slope_hist": [round(float(x), 6) for x in slope_hist(slope[m])],
            "slope_p50": round(float(np.percentile(s, 50)), 2), "slope_p90": round(float(np.percentile(s, 90)), 2),
            "rough_p50": round(float(np.percentile(rg[np.isfinite(rg)], 50)), 3),
            "rough_p90": round(float(np.percentile(rg[np.isfinite(rg)], 90)), 3),
            "relief_p5_p95_m": round(float(np.percentile(z, 95) - np.percentile(z, 5)), 0),
            "elev_median_m": round(float(np.median(z)), 0),
            "pixel_m": [PIX, PIX],
        }
        np.save(os.path.join(HERE, f"data/moon/crops/{code}.npy"), np.where(inside, crop, np.nan).astype("float32"))
        hs = hillshade(crop, PIX, PIX)
        plt.imsave(os.path.join(HERE, f"previews/moon_{code}.png"), hs, cmap="gray", vmin=0, vmax=1)
        print(f"{code:2s} {name:22s} slope p50 {out[code]['slope_p50']:5.1f} p90 {out[code]['slope_p90']:5.1f} "
              f"rough {out[code]['rough_p50']:.2f} m relief {out[code]['relief_p5_p95_m']:.0f} m elev {out[code]['elev_median_m']:.0f} m")

    # ---- Diviner PRP: stream the 600 MB table, keep south of -82.5 deg ----
    cols = ["tri_clon", "tri_clat", "temp_avg", "temp_max", "ice_depth"]
    parts = []
    for ch in pd.read_csv(os.path.join(HERE, "data/moon/dlre_prp_south.tab"), skipinitialspace=True, usecols=cols,
                          chunksize=500_000):
        parts.append(ch[ch.tri_clat <= -82.5])
    d = pd.concat(parts, ignore_index=True)
    print("Diviner triangles south of -82.5:", len(d))
    c, r = lonlat_to_px(d.tri_clon.values, d.tri_clat.values)
    pts = np.column_stack([c, r])
    for code, poly in polys.items():
        sel = d[MPath(poly).contains_points(pts)]
        if len(sel) == 0:
            continue
        ice = sel.ice_depth.values
        stable = (ice >= 0)
        out[code].update({
            "diviner_triangles": int(len(sel)),
            "temp_avg_K_median": round(float(sel.temp_avg.median()), 1),
            "temp_max_K_median": round(float(sel.temp_max.median()), 1),
            "temp_max_K_p95": round(float(sel.temp_max.quantile(0.95)), 1),
            "temp_avg_K_min": round(float(sel.temp_avg.min()), 1),
            "ice_stable_any_frac": round(float(stable.mean()), 3),         # stable within 2.87 m
            "ice_stable_le1m_frac": round(float(((ice >= 0) & (ice <= 1)).mean()), 3),
            "ice_stable_surface_frac": round(float((ice == 0).mean()), 3),
        })
        o = out[code]
        print(f"{code:2s} {o['name']:22s} T_avg {o['temp_avg_K_median']:6.1f} K  Tmax med {o['temp_max_K_median']:6.1f} K  "
              f"ice<=1m {o['ice_stable_le1m_frac']:.2f}  ice any {o['ice_stable_any_frac']:.2f}  (n={o['diviner_triangles']})")
    json.dump(out, open(os.path.join(HERE, "results/moon_regions.json"), "w"), indent=1)
    print("saved results/moon_regions.json")


if __name__ == "__main__":
    main()
