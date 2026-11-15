#!/usr/bin/env python3
"""Advanced terrain metrics, IDENTICAL code for Moon (LOLA 40 m) and Earth (Copernicus resampled to 40 m).

One function, terrain_metrics(dem, inside), takes a DEM crop (metres, 40 m px, NaN = void) and a boolean mask of the
pixels that belong to the study area (20x20 km Earth block, or Moon region polygon). Filters run on the whole crop
(which carries a margin), statistics are taken only over `inside`.

Columns
  mds_80/160/320/640   median differential slope (deg), Rosenburg+2011: median over x- and y-direction pairs separated by L
                       of atan(|dz|/L). Both end points must be inside the mask.
  mds_exp              log-log slope of mds vs baseline (= H-1)
  hurst                1 + mds_exp (Hurst exponent H, since median slope ~ L^(H-1))
  rms_80..rms_640      RMS height deviation sqrt(mean(dz^2)) over pairs separated by L (m)
  hurst_rms            log-log slope of rms vs baseline (= H directly)
  dep_per_km2, dep_area_frac, dep_median_depth_m, dep_depth_to_diam, n_dep
                       closed depressions (priority-flood fill, 8-connected, edges/voids drain), depth>=3 m, area>=10 px;
                       depth = max(filled-dem) in the depression, diam = equivalent-circle diameter of its area;
                       depth_to_diam = median over depressions of depth/diam. Depression belongs to the block if its centroid
                       is inside the mask. 0 (not NaN) when a block has no depression (see n_dep).
  frac_slope_lt5/10/15/20, largest_flat_patch_km2 (8-connected patch of slope<8 deg), valid_frac, area_km2
Slope = np.gradient central differences (common.slope_degrees).

Outputs: results/feat_terrain_adv.csv (Earth, all fine_blocks), results/feat_terrain_adv_moon.csv (9 regions),
         results/feat_terrain_adv_moon_mp20.csv (Mons Mouton Plateau central 20x20 km window, optional),
         results/feat_terrain_adv_validation.csv (36 validation sites).
Run: ./.venv/bin/python feat_terrain_adv.py [earth|moon|validation|all]
"""
import os, sys, json, time
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
import numpy as np
import pandas as pd
from scipy import ndimage as ndi
from numba import njit
import heapq  # noqa: F401  (numba heapq support)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import slope_degrees  # noqa: E402

PIX = 40.0
BASE_PX = (2, 4, 8, 16)           # 80, 160, 320, 640 m
BLOCK_PX = 500
MARGIN = 20                       # px of context kept around the block / polygon for filters
DEP_MIN_DEPTH, DEP_MIN_AREA = 3.0, 10
PIX_KM2 = PIX * PIX / 1e6
FEATS = (["mds_80", "mds_160", "mds_320", "mds_640", "mds_exp", "hurst", "rms_80", "rms_160", "rms_320", "rms_640", "hurst_rms",
          "dep_per_km2", "dep_area_frac", "dep_median_depth_m", "dep_depth_to_diam", "n_dep",
          "frac_slope_lt5", "frac_slope_lt10", "frac_slope_lt15", "frac_slope_lt20", "largest_flat_patch_km2",
          "valid_frac", "area_km2"])


@njit(cache=True)
def _priority_flood(z, seed):
    """Fill depressions. `seed` marks outlet cells (crop border and voids). 8-connected. Returns filled surface."""
    n, m = z.shape
    out = z.copy()
    closed = np.zeros((n, m), np.bool_)
    heap = [(-1e30, 0)]
    heap.pop()
    first = True
    for i in range(n):
        for j in range(m):
            if seed[i, j]:
                closed[i, j] = True
                if first:
                    heap = [(z[i, j], i * m + j)]
                    first = False
                else:
                    heapq.heappush(heap, (z[i, j], i * m + j))
    while len(heap) > 0:
        lvl, idx = heapq.heappop(heap)
        i = idx // m
        j = idx % m
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                if di == 0 and dj == 0:
                    continue
                a, b = i + di, j + dj
                if a < 0 or b < 0 or a >= n or b >= m or closed[a, b]:
                    continue
                closed[a, b] = True
                v = z[a, b]
                if v < lvl:
                    v = lvl
                out[a, b] = v
                heapq.heappush(heap, (v, a * m + b))
    return out


def _pair_stats(z, ok, L):
    """abs height differences for pixel pairs separated by L px along x and y (both ends valid & inside)."""
    dx = np.abs(z[:, L:] - z[:, :-L])[ok[:, L:] & ok[:, :-L]]
    dy = np.abs(z[L:, :] - z[:-L, :])[ok[L:, :] & ok[:-L, :]]
    return np.concatenate([dx, dy])


def terrain_metrics(dem, inside):
    """dem: 2-D float array (m, 40 m px, NaN voids); inside: bool mask same shape. Returns dict of FEATS."""
    out = {k: np.nan for k in FEATS}
    dem = np.asarray(dem, dtype="float64")
    finite = np.isfinite(dem)
    ok = inside & finite
    n_ok = int(ok.sum())
    out["valid_frac"] = n_ok / max(int(inside.sum()), 1)
    out["area_km2"] = n_ok * PIX_KM2
    if n_ok < 1000:
        return out
    # ---- 1. multi-scale roughness
    mds, rms = [], []
    for L in BASE_PX:
        d = _pair_stats(dem, ok, L)
        if d.size < 100:
            mds.append(np.nan); rms.append(np.nan); continue
        mds.append(float(np.degrees(np.arctan(np.median(d) / (L * PIX)))))
        rms.append(float(np.sqrt(np.mean(d * d))))
    for L, a, b in zip(BASE_PX, mds, rms):
        out[f"mds_{int(L * PIX)}"], out[f"rms_{int(L * PIX)}"] = a, b
    lb = np.log(np.array(BASE_PX) * PIX)
    mds_a, rms_a = np.array(mds), np.array(rms)
    g = np.isfinite(mds_a) & (mds_a > 0)
    if g.sum() >= 3:
        out["mds_exp"] = float(np.polyfit(lb[g], np.log(mds_a[g]), 1)[0])
        out["hurst"] = 1.0 + out["mds_exp"]
    g = np.isfinite(rms_a) & (rms_a > 0)
    if g.sum() >= 3:
        out["hurst_rms"] = float(np.polyfit(lb[g], np.log(rms_a[g]), 1)[0])
    # ---- 2. closed depressions
    seed = ~finite
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    zf = np.where(finite, dem, -1e9)
    filled = _priority_flood(zf, seed)
    depth = np.where(finite, filled - dem, 0.0)
    lab, nl = ndi.label(depth > 0, structure=np.ones((3, 3)))
    n_dep, dep_area_px, med_depth, med_ratio = 0, 0, 0.0, 0.0
    if nl > 0:
        idx = np.arange(1, nl + 1)
        area = ndi.sum(np.ones_like(depth), lab, idx)
        dmax = ndi.maximum(depth, lab, idx)
        cand = (dmax >= DEP_MIN_DEPTH) & (area >= DEP_MIN_AREA)
        if cand.any():
            com = np.array(ndi.center_of_mass(np.ones_like(depth), lab, idx[cand]))
            ci = np.clip(np.round(com).astype(int), 0, np.array(dem.shape) - 1)
            keep = inside[ci[:, 0], ci[:, 1]]
            a_k, d_k = area[cand][keep], dmax[cand][keep]
            n_dep = int(keep.sum())
            if n_dep:
                diam = np.sqrt(4.0 * a_k / np.pi) * PIX
                dep_area_px = float(a_k.sum())
                med_depth = float(np.median(d_k))
                med_ratio = float(np.median(d_k / diam))
    out["n_dep"] = n_dep
    out["dep_per_km2"] = n_dep / (n_ok * PIX_KM2)
    out["dep_area_frac"] = min(dep_area_px / n_ok, 1.0)
    out["dep_median_depth_m"] = med_depth
    out["dep_depth_to_diam"] = med_ratio
    # ---- 3. landing / mobility
    slope = slope_degrees(np.where(finite, dem, np.nan), PIX, PIX)
    sv = ok & np.isfinite(slope)
    ns = int(sv.sum())
    if ns:
        s = slope[sv]
        for t in (5, 10, 15, 20):
            out[f"frac_slope_lt{t}"] = float((s < t).mean())
        flat = sv & (slope < 8.0)
        lab2, n2 = ndi.label(flat, structure=np.ones((3, 3)))
        out["largest_flat_patch_km2"] = float(np.bincount(lab2.ravel())[1:].max() * PIX_KM2) if n2 else 0.0
    return out


# ------------------------------------------------------------------ Earth
def read_tile_40m(code):
    import rasterio
    from rasterio.enums import Resampling
    from refine_earth import tile_path
    p = tile_path(code)
    if not os.path.exists(p):
        return None
    with rasterio.open(p) as src:
        b = src.bounds
        lat_mid = (b.top + b.bottom) / 2
        h_m = (b.top - b.bottom) * 111320.0
        w_m = (b.right - b.left) * 111320.0 * np.cos(np.radians(lat_mid))
        oh, ow = int(round(h_m / PIX)), int(round(w_m / PIX))
        dem = src.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
    dem[np.abs(dem) > 1e5] = np.nan
    return dem


def earth_block_metrics(dem, r0, c0, bp=BLOCK_PX):
    oh, ow = dem.shape
    rl, rh = max(0, r0 - MARGIN), min(oh, r0 + bp + MARGIN)
    cl, ch = max(0, c0 - MARGIN), min(ow, c0 + bp + MARGIN)
    crop = dem[rl:rh, cl:ch]
    inside = np.zeros(crop.shape, bool)
    inside[r0 - rl:r0 - rl + bp, c0 - cl:c0 - cl + bp] = True
    return terrain_metrics(crop, inside)


CACHE = os.path.join(HERE, "results/_feat_terrain_adv_cache")


def _tile_job(args):
    code, rc = args
    cp = os.path.join(CACHE, code + ".pkl")
    if os.path.exists(cp):
        return pd.read_pickle(cp)
    dem = read_tile_40m(code)
    rows = []
    for r0, c0 in rc:
        d = {"tile": code, "r0": int(r0), "c0": int(c0)}
        d.update(earth_block_metrics(dem, r0, c0) if dem is not None else {k: np.nan for k in FEATS})
        rows.append(d)
    pd.to_pickle(rows, cp)
    return rows


def run_earth(nproc=4):
    import multiprocessing as mp
    os.makedirs(CACHE, exist_ok=True)
    fb = pd.read_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))[["tile", "r0", "c0"]]
    jobs = [(t, list(zip(g.r0, g.c0))) for t, g in fb.groupby("tile")]
    jobs.sort(key=lambda j: -len(j[1]))
    t0 = time.time()
    rows = []
    with mp.get_context("spawn").Pool(nproc, maxtasksperchild=20) as pool:
        for i, r in enumerate(pool.imap_unordered(_tile_job, jobs, chunksize=1)):
            rows += r
            if i % 10 == 0:
                print(f"  tiles {i + 1}/{len(jobs)} blocks {len(rows)} {time.time() - t0:.0f}s", flush=True)
    df = pd.DataFrame(rows)
    df = fb.merge(df, on=["tile", "r0", "c0"], how="left")
    df.to_csv(os.path.join(HERE, "results/feat_terrain_adv.csv"), index=False)
    print(f"Earth: {len(df)} blocks, {time.time() - t0:.0f}s")
    return df


# ------------------------------------------------------------------ validation
def run_validation():
    import rasterio
    from refine_earth import tile_path
    sites = pd.read_csv(os.path.join(HERE, "validation_sites.csv"))
    cache, rows = {}, []
    bp = BLOCK_PX
    for s in sites.itertuples():
        d = {"id": s.id}
        la, lo = int(np.floor(s.lat)), int(np.floor(s.lon))
        code = f"{'N' if la >= 0 else 'S'}{abs(la):02d}_{'E' if lo >= 0 else 'W'}{abs(lo):03d}"
        p = tile_path(code)
        if not os.path.exists(p):
            rows.append({**d, **{k: np.nan for k in FEATS}}); continue
        if code not in cache:
            cache[code] = read_tile_40m(code)
        dem = cache[code]
        with rasterio.open(p) as src:
            b = src.bounds
        oh, ow = dem.shape
        r = int((b.top - s.lat) / (b.top - b.bottom) * oh) - bp // 2     # identical to validate.block_at
        c = int((s.lon - b.left) / (b.right - b.left) * ow) - bp // 2
        r, c = min(max(r, 0), oh - bp), min(max(c, 0), ow - bp)
        m = earth_block_metrics(dem, r, c)
        rows.append({**d, "tile": code, "r0": r, "c0": c, **m})
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "results/feat_terrain_adv_validation.csv"), index=False)
    print("validation:", len(df), "sites")
    return df


# ------------------------------------------------------------------ Moon
def run_moon():
    from matplotlib.path import Path as MPath
    from moon_regions import lonlat_to_px, load_dem
    dem = load_dem()
    gj = json.load(open(os.path.join(HERE, "data/moon/regions/A3_9regions-lonlat-simplified.geojson")))
    rows, mp20 = [], []
    for f in gj["features"]:
        code = f["properties"]["RegionCode"]
        ring = np.array(f["geometry"]["coordinates"][0])
        c, r = lonlat_to_px(ring[:, 0], ring[:, 1])
        poly = np.column_stack([c, r])
        c0, c1 = int(c.min()) - MARGIN, int(c.max()) + MARGIN + 1
        r0, r1 = int(r.min()) - MARGIN, int(r.max()) + MARGIN + 1
        crop = np.asarray(dem[r0:r1, c0:c1], dtype="float64") * 0.5
        rr, cc = np.mgrid[r0:r1, c0:c1]
        inside = MPath(poly).contains_points(np.column_stack([cc.ravel(), rr.ravel()])).reshape(crop.shape)
        t0 = time.time()
        rows.append({"moon": code, **terrain_metrics(crop, inside)})
        print(f"  {code} {time.time() - t0:.1f}s, area {rows[-1]['area_km2']:.0f} km2", flush=True)
        if code == "MP":   # central 20x20 km window (500 px square, axis-aligned in the polar grid) around the polygon centroid
            cr, cc0 = int(round(r.mean())), int(round(c.mean()))
            h = BLOCK_PX // 2
            win = np.zeros(crop.shape, bool)
            win[cr - h - r0:cr + h - r0, cc0 - h - c0:cc0 + h - c0] = True
            mp20.append({"moon": "MP20", **terrain_metrics(crop, inside & win)})
    pd.DataFrame(rows).to_csv(os.path.join(HERE, "results/feat_terrain_adv_moon.csv"), index=False)
    pd.DataFrame(mp20).to_csv(os.path.join(HERE, "results/feat_terrain_adv_moon_mp20.csv"), index=False)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("moon", "all"):
        run_moon()
    if what in ("validation", "all"):
        run_validation()
    if what in ("earth", "all"):
        run_earth()
