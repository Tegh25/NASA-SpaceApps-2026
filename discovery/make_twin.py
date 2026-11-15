#!/usr/bin/env python3
"""Twin views + final table for the chosen Earth analog blocks.

For each pick: Moon region hillshade (LOLA 40 m) | Earth block hillshade (Copernicus resampled to 40 m, 20x20 km) |
slope-histogram overlay. Identical lighting (azimuth 315, altitude 15 deg) and no vertical exaggeration on both.
Writes previews/twin_<id>.png and results/final_picks.csv. Run: python make_twin.py
"""
import os, json
import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import slope_degrees, hillshade, slope_hist, SLOPE_BINS, haversine_km
from refine_earth import tile_path, TARGET_M, BLOCK_M

HERE = os.path.dirname(os.path.abspath(__file__))
# id, label, earth lat, lon, Moon region code (best terrain match for that block)
PICKS = [
    ("andes_plateau", "High Andes plateau (Chile/Argentina)", -28.81, -69.28, "SP"),
    ("andes_massif", "High Andes massif (Chile/Argentina)", -29.63, -69.38, "MA"),
    ("kunlun_east", "Kunlun / Hoh Xil margin (Qinghai)", 36.73, 91.34, "SP"),
    ("greenland", "East Greenland, Scoresby Sund area", 73.82, -23.68, "SP"),
    ("kunlun_basin_v1", "Kunlun / Altyn-Tagh margin (Xinjiang), v1 pick", 36.64, 84.67, "MM"),
    ("changtang_validation", "Changtang, W. Tibet/Ladakh (validation)", 33.37, 78.86, "N1"),
]


def earth_block(row):
    p = tile_path(row.tile)
    with rasterio.open(p) as src:
        lat_mid = (src.bounds.top + src.bounds.bottom) / 2
        h_m = (src.bounds.top - src.bounds.bottom) * 111320.0
        w_m = (src.bounds.right - src.bounds.left) * 111320.0 * np.cos(np.radians(lat_mid))
        dem = src.read(1, out_shape=(int(round(h_m / TARGET_M)), int(round(w_m / TARGET_M))), resampling=Resampling.average).astype("float64")
    bp = int(BLOCK_M / TARGET_M)
    return dem[row.r0:row.r0 + bp, row.c0:row.c0 + bp]


def main():
    fb = pd.read_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))
    cand = pd.read_csv(os.path.join(HERE, "results/candidates_all.csv"))
    moon = json.load(open(os.path.join(HERE, "results/moon_regions.json")))
    out_rows = []
    for pid, label, lat, lon, mcode in PICKS:
        d = haversine_km(lat, lon, fb.lat.values, fb.lon.values)
        row = fb.iloc[int(d.argmin())]
        cd = cand[(cand.moon == mcode) & (np.abs(cand.lat - row.lat) < 0.01) & (np.abs(cand.lon - row.lon) < 0.01)]
        c = cd.iloc[0] if len(cd) else None
        e = earth_block(row)
        m = moon[mcode]
        mdem = np.load(os.path.join(HERE, f"data/moon/crops/{mcode}.npy")).astype("float64")
        hs_e = hillshade(e, TARGET_M, TARGET_M, alt=15)
        hs_m = hillshade(np.where(np.isfinite(mdem), mdem, np.nanmedian(mdem)), 40.0, 40.0, alt=15)
        hs_m = np.where(np.isfinite(mdem), hs_m, np.nan)
        se = slope_degrees(e, TARGET_M, TARGET_M)
        he = slope_hist(se)
        fig, ax = plt.subplots(1, 3, figsize=(16, 5.2), gridspec_kw={"width_ratios": [1, 1, 1.05]})
        ax[0].imshow(hs_m, cmap="gray", vmin=0, vmax=1); ax[0].axis("off")
        ax[0].set_title(f"MOON  {m['name']}\n({m['center_lat']:.1f}, {m['center_lon']:.1f})  ~{np.sqrt(m['area_km2']):.0f} km across", fontsize=10)
        ax[1].imshow(hs_e, cmap="gray", vmin=0, vmax=1); ax[1].axis("off")
        ax[1].set_title(f"EARTH  {label}\n({row.lat:.2f}, {row.lon:.2f})  20 x 20 km", fontsize=10)
        x = SLOPE_BINS[:-1] + 0.5
        ax[2].fill_between(x, np.array(m["slope_hist"]), step="mid", alpha=0.45, label="Moon (LOLA 40 m)")
        ax[2].fill_between(x, he, step="mid", alpha=0.45, label="Earth (Copernicus @ 40 m)")
        ax[2].set_xlabel("slope (deg)"); ax[2].set_ylabel("fraction of pixels"); ax[2].legend(fontsize=8)
        ax[2].set_xlim(0, 45)
        ax[2].set_title(f"slope p50 {m['slope_p50']:.1f} vs {np.percentile(se[np.isfinite(se)], 50):.1f} deg   "
                        f"rough {m['rough_p50']:.2f} vs {row.rough_p50:.2f} m   relief {m['relief_p5_p95_m']:.0f} vs {row.relief_m:.0f} m", fontsize=8)
        fig.suptitle("Same code, same 40 m baseline, same lighting on both bodies", fontsize=9, y=0.02)
        fig.savefig(os.path.join(HERE, f"previews/twin_{pid}.png"), dpi=110, bbox_inches="tight")
        plt.close(fig)
        rec = {"id": pid, "label": label, "earth_lat": round(row.lat, 3), "earth_lon": round(row.lon, 3), "moon_region": m["name"],
               "moon_slope_p50": m["slope_p50"], "earth_slope_p50": round(float(row.slope_p50), 2),
               "moon_slope_p90": m["slope_p90"], "earth_slope_p90": round(float(row.slope_p90), 2),
               "moon_rough_p50_m": m["rough_p50"], "earth_rough_p50_m": round(float(row.rough_p50), 2),
               "moon_relief_m": m["relief_p5_p95_m"], "earth_relief_m": round(float(row.relief_m), 0),
               "earth_elev_mean_m": round(float(row.elev_mean_m), 0),
               "slope_hist_W1_deg": round(float(np.abs(np.cumsum(he) - np.cumsum(m["slope_hist"])).sum()), 2)}
        if c is not None:
            rec.update({"terrain_dist": round(float(c.terrain_dist), 3), "mat_C": round(float(c.mat), 1), "precip_mm": round(float(c.precip), 0),
                        "annual_T_range_C": round(float(c.trange), 1), "bare_frac": round(float(c.wc_bare), 2), "moss_lichen_frac": round(float(c.wc_moss), 2), "grass_frac": round(float(c.wc_grass), 2), "snow_frac": round(float(c.wc_snow), 2),
                        "moon_T_avg_K": m["temp_avg_K_median"], "thermal_gap_K": round(float(c.thermal_gap_K), 0),
                        "moon_ice_stable_le1m": m["ice_stable_le1m_frac"], "sun_days": int(c.sun_days),
                        "near_known_km": c.near_known_km, "near_known": c.near_known})
        out_rows.append(rec)
        print(pid, "->", {k: rec[k] for k in ("earth_lat", "earth_lon", "moon_region", "terrain_dist", "slope_hist_W1_deg") if k in rec})
    pd.DataFrame(out_rows).to_csv(os.path.join(HERE, "results/final_picks.csv"), index=False)
    print("saved results/final_picks.csv and previews/twin_*.png")


if __name__ == "__main__":
    main()
