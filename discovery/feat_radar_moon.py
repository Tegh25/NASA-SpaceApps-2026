#!/usr/bin/env python3
"""LRO Mini-RF S-band features for the 9 Artemis III regions -> results/feat_radar_moon.csv

Source: PDS Geosciences, LRO Mini-RF global mosaics (PDS3, 128 ppd, simple cylindrical, float32, ~4.2 GB each).
We never download the whole file: GDAL /vsicurl/ reads only the window of each region (HTTP range requests).
Products: S1 (first Stokes parameter ~ total S-band echo power, |ERH|+|ERV|, uncalibrated linear units),
          CPR (circular polarisation ratio SC/OC).
No login needed.
"""
import numpy as np, pandas as pd, rasterio, geopandas as gpd
from rasterio.windows import Window
from rasterio.features import geometry_mask
from rasterio.transform import from_origin

B = 'https://pds-geosciences.wustl.edu/lro/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/128ppd/'
PPD = 128.0
g = gpd.read_file('data/moon/regions/A3_9regions-lonlat-simplified.geojson')
rows = []
dsS = rasterio.open('/vsicurl/' + B + 'global_s1_128ppd_simp_0c.lbl')
dsC = rasterio.open('/vsicurl/' + B + 'global_cpr_128ppd_simp_0c.lbl')

def read(ds, r0, r1, c0, c1):
    a = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype('float64')
    a[(~np.isfinite(a)) | (a < -1e30) | (a == 0)] = np.nan
    return a

for _, f in g.iterrows():
    code, name = f['RegionCode'], f['Region']
    minx, miny, maxx, maxy = f.geometry.bounds
    c0 = int(np.floor((minx + 180) * PPD)) - 1; c1 = int(np.ceil((maxx + 180) * PPD)) + 1
    r0 = int(np.floor((90 - maxy) * PPD)) - 1;  r1 = int(np.ceil((90 - miny) * PPD)) + 1
    S = read(dsS, r0, r1, c0, c1); C = read(dsC, r0, r1, c0, c1)
    tr = from_origin(-180 + c0 / PPD, 90 - r0 / PPD, 1 / PPD, 1 / PPD)
    inside = ~geometry_mask([f.geometry], out_shape=S.shape, transform=tr, all_touched=False)
    s = S[inside]; c = C[inside]
    sv = s[np.isfinite(s) & (s > 0)]; cv = c[np.isfinite(c)]
    sdb = 10 * np.log10(sv) if len(sv) else np.array([np.nan])
    rows.append(dict(
        moon=code, name=name, n_px_region=int(inside.sum()),
        s1_valid_frac=len(sv) / max(inside.sum(), 1), cpr_valid_frac=len(cv) / max(inside.sum(), 1),
        s1_mean=float(np.mean(sv)) if len(sv) else np.nan,
        s1_median=float(np.median(sv)) if len(sv) else np.nan,
        s1_db_mean=float(np.mean(sdb)), s1_db_std=float(np.std(sdb)),   # radar texture (dB, relative units)
        cpr_mean=float(np.mean(cv)) if len(cv) else np.nan,
        cpr_median=float(np.median(cv)) if len(cv) else np.nan,
        cpr_p90=float(np.percentile(cv, 90)) if len(cv) else np.nan,
        frac_cpr_gt1=float(np.mean(cv > 1)) if len(cv) else np.nan,
    ))
    print(rows[-1], flush=True)
out = pd.DataFrame(rows)
out.to_csv('results/feat_radar_moon.csv', index=False)
print(out.round(3).to_string())
