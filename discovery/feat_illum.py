#!/usr/bin/env python3
"""Illumination / shadow-structure features under a low CIRCLING sun, identical code for Moon and Earth DEMs.

Per pixel: horizon elevation angle along NAZ azimuths (ray-march to MAXD_M, geometric stride, body curvature included).
Sun = disc (radius SUN_R deg) at fixed elevation e in {1.5, 5, 10} deg visiting every azimuth.
Per block / region (all aggregated over valid pixels on a STRIDE-px grid):
  lit_mean_e        mean over pixels & azimuths of the visible fraction of the sun disc
  psr_frac_e        fraction of pixels whose sun CENTRE is below the horizon at EVERY azimuth (permanent shadow)
  always_lit_frac_e fraction of pixels whose sun centre is above the horizon at EVERY azimuth (never shadowed)
  lit_pixel_std_e   spatial std of per-pixel (azimuth-mean) lit fraction
  occl_km_e         mean over pixels & azimuths of the distance (km) to the first terrain point that blocks the sun centre
                    (capped at MAXD_M if unobstructed) = azimuth-averaged shadow-casting-distance proxy
plus sun_days / max_summer_noon_elev (real latitude lighting; Earth only) and ctx_valid_frac (fraction of the +-MAXD context
window around the block that has DEM data; <1 => truncated context at tile edges with no neighbour tile downloaded).

Usage: python feat_illum.py all | moon | earth | validation | preview
"""
import os, sys, json, time
import numpy as np
import pandas as pd
import numba as nb
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from matplotlib.path import Path as MPath
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refine_earth import tile_path, TARGET_M, BLOCK_M

NAZ = 24
ELEVS = (1.5, 5.0, 10.0)
SUN_R = 0.265            # sun angular radius, deg
MAXD_M = 30000.0
STRIDE = 5               # pixel grid step (40 m px => 200 m) at which horizons are evaluated (250 and M are multiples of 5)
R_EARTH, R_MOON = 6371000.0, 1737400.0
BP = int(BLOCK_M / TARGET_M)       # 500
M = int(MAXD_M / TARGET_M)         # 375 px context margin
TOPCAP = np.tan(np.radians(max(ELEVS) + SUN_R + 0.2))   # beyond this the pixel is fully shadowed for every e


def make_steps(maxpx, first=1.0, lin_until=10, ratio=1.08):
    d, out = 1.0, []
    while d <= maxpx:
        out.append(d)
        d = d + 1.0 if d < lin_until else d * ratio
    return np.array(out, dtype=np.float64)


STEPS = make_steps(M)


@nb.njit(cache=True, fastmath=True)
def _kernel(dem, ii, jj, steps, pix, R, naz, tanE, sunr, topcap, zmax):
    n = ii.shape[0]
    ne = tanE.shape[0]
    H, W = dem.shape
    L = np.full((n, ne), np.nan, dtype=np.float32)
    PSR = np.zeros((n, ne), dtype=np.uint8)
    AL = np.zeros((n, ne), dtype=np.uint8)
    OC = np.full((n, ne), np.nan, dtype=np.float32)
    elev = np.empty(ne)
    for e in range(ne):
        elev[e] = np.degrees(np.arctan(tanE[e]))
    maxd = steps[steps.shape[0] - 1] * pix
    for p in range(n):
        i, j = ii[p], jj[p]
        z0 = dem[i, j]
        if not np.isfinite(z0):
            continue
        sumL = np.zeros(ne)
        anyvis = np.zeros(ne, dtype=np.uint8)
        allfull = np.ones(ne, dtype=np.uint8)
        sumoc = np.zeros(ne)
        for k in range(naz):
            a = 2.0 * np.pi * k / naz
            dy, dx = -np.cos(a), np.sin(a)
            tmax = -1e9
            first = np.full(ne, maxd)
            for s in range(steps.shape[0]):
                d = steps[s]
                fi = int(np.floor(i + dy * d + 0.5))
                fj = int(np.floor(j + dx * d + 0.5))
                if fi < 0 or fj < 0 or fi >= H or fj >= W:
                    break
                dist = d * pix
                if tmax > 0.0 and (zmax - z0) / dist < tmax:
                    break   # no farther terrain can exceed the current horizon (upper bound (zmax-z0)/d)
                z = dem[fi, fj]
                if not np.isfinite(z):
                    continue
                t = (z - z0 - dist * dist / (2.0 * R)) / dist
                if t > tmax:
                    tmax = t
                    for e in range(ne):
                        if first[e] == maxd and t > tanE[e]:
                            first[e] = dist
                    if t > topcap:
                        break
            h = np.degrees(np.arctan(tmax)) if tmax > -1e8 else -90.0
            for e in range(ne):
                f = (elev[e] + sunr - h) / (2.0 * sunr)
                if f < 0.0:
                    f = 0.0
                elif f > 1.0:
                    f = 1.0
                sumL[e] += f
                if f >= 0.5:          # sun CENTRE above the horizon at this azimuth
                    anyvis[e] = 1
                else:
                    allfull[e] = 0
                sumoc[e] += first[e]
        for e in range(ne):
            L[p, e] = sumL[e] / naz
            PSR[p, e] = 1 - anyvis[e]
            AL[p, e] = allfull[e]
            OC[p, e] = sumoc[e] / naz / 1000.0
    return L, PSR, AL, OC


def horizon_maps(canvas, ii, jj, R, pix=TARGET_M):
    """canvas float32 (nan = no data); ii,jj int pixel indices into canvas. Returns L,PSR,AL,OC arrays (n,3)."""
    zmax = float(np.nanmax(canvas)) if np.isfinite(canvas).any() else 0.0
    tanE = np.tan(np.radians(np.array(ELEVS)))
    return _kernel(canvas, ii.astype(np.int64), jj.astype(np.int64), STEPS, pix, R, NAZ, tanE, SUN_R, TOPCAP, zmax)


def agg(L, PSR, AL, OC):
    """Block statistics from per-pixel outputs (n,3) restricted to the block's pixels."""
    ok = np.isfinite(L[:, 0])
    out = {"n_pix": int(ok.sum())}
    for k, e in enumerate(ELEVS):
        tag = f"{e:g}"
        if ok.sum() == 0:
            for c in ("lit_mean", "psr_frac", "always_lit_frac", "lit_pixel_std", "occl_km"):
                out[f"{c}_{tag}"] = np.nan
            continue
        l = L[ok, k]
        out[f"lit_mean_{tag}"] = float(l.mean())
        out[f"psr_frac_{tag}"] = float(PSR[ok, k].mean())
        out[f"always_lit_frac_{tag}"] = float(AL[ok, k].mean())
        out[f"lit_pixel_std_{tag}"] = float(l.std())
        out[f"occl_km_{tag}"] = float(OC[ok, k].mean())
    return out


# ------------------------------------------------------------------ Earth
def parse_code(code):
    ns, la, ew, lo = code[0], int(code[1:3]), code[4], int(code[5:8])
    return (la if ns == "N" else -la), (lo if ew == "E" else -lo)   # SW corner lat/lon (Copernicus naming = lower-left)


def make_code(lat, lon):
    lon = (lon + 180) % 360 - 180
    return f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_{'E' if lon >= 0 else 'W'}{abs(lon):03d}"


def load_canvas(code):
    """Tile resampled to 40 m exactly as refine_earth.scan, padded by M px on all sides from neighbour tiles (NaN if absent).
    Returns canvas float32 (oh+2M, ow+2M), oh, ow, lat_top, lat_bottom."""
    with rasterio.open(tile_path(code)) as src:
        b = src.bounds
        lat_mid = (b.top + b.bottom) / 2
        h_m = (b.top - b.bottom) * 111320.0
        w_m = (b.right - b.left) * 111320.0 * np.cos(np.radians(lat_mid))
        oh, ow = int(round(h_m / TARGET_M)), int(round(w_m / TARGET_M))
        dem = src.read(1, out_shape=(oh, ow), resampling=Resampling.average).astype("float32")
        top, bottom = b.top, b.bottom
    dem[np.abs(dem) > 1e5] = np.nan
    cv = np.full((oh + 2 * M, ow + 2 * M), np.nan, dtype=np.float32)
    cv[M:M + oh, M:M + ow] = dem
    la, lo = parse_code(code)
    dydeg, dxdeg = (top - bottom) / oh, (b.right - b.left) / ow
    for di in (-1, 0, 1):          # -1 = north neighbour
        for dj in (-1, 0, 1):      # -1 = west
            if di == 0 and dj == 0:
                continue
            nc = make_code(la - di, lo + dj)
            p = tile_path(nc)
            if not os.path.exists(p):
                continue
            try:
                with rasterio.open(p) as s:
                    nb_ = s.bounds
                    if di == -1:   rows, oh_b, rs = (0, M), M, (nb_.bottom, nb_.bottom + M * dydeg)
                    elif di == 1:  rows, rs, oh_b = (M + oh, 2 * M + oh), (nb_.top - M * dydeg, nb_.top), M
                    else:          rows, rs, oh_b = (M, M + oh), (nb_.bottom, nb_.top), oh
                    if dj == -1:   cols, cs, ow_b = (0, M), (nb_.right - M * dxdeg, nb_.right), M
                    elif dj == 1:  cols, cs, ow_b = (M + ow, 2 * M + ow), (nb_.left, nb_.left + M * dxdeg), M
                    else:          cols, cs, ow_b = (M, M + ow), (nb_.left, nb_.right), ow
                    win = from_bounds(cs[0], rs[0], cs[1], rs[1], transform=s.transform)
                    a = s.read(1, window=win, out_shape=(oh_b, ow_b), resampling=Resampling.average, boundless=True,
                               fill_value=np.nan).astype("float32")
                a[np.abs(a) > 1e5] = np.nan
                cv[rows[0]:rows[1], cols[0]:cols[1]] = a
            except Exception as ex:   # neighbour unreadable -> truncated context
                print("neighbour fail", nc, ex, flush=True)
    return cv, oh, ow, top, bottom


def block_features(cv, blocks, R, stride=STRIDE):
    """blocks: list of (r0,c0) in tile pixel coords (canvas offset M). One kernel run over the union of block pixels."""
    hh, ww = cv.shape
    cover = np.zeros((hh, ww), dtype=bool)
    for r0, c0 in blocks:
        cover[M + r0:M + r0 + BP:stride, M + c0:M + c0 + BP:stride] = True     # tile r0,c0 are multiples of 250 (even)
    ii, jj = np.nonzero(cover)
    L, P, A, O = horizon_maps(cv, ii, jj, R)
    hs_, ws_ = hh // stride + 1, ww // stride + 1
    gi, gj = ii // stride, jj // stride
    mapL = np.full((hs_, ws_, 3), np.nan, np.float32); mapP = np.zeros((hs_, ws_, 3), np.uint8)
    mapA = np.zeros((hs_, ws_, 3), np.uint8); mapO = np.full((hs_, ws_, 3), np.nan, np.float32)
    mapL[gi, gj], mapP[gi, gj], mapA[gi, gj], mapO[gi, gj] = L, P, A, O
    res = []
    for r0, c0 in blocks:
        sl = (slice((M + r0) // stride, (M + r0 + BP) // stride), slice((M + c0) // stride, (M + c0 + BP) // stride))
        d = agg(mapL[sl].reshape(-1, 3), mapP[sl].reshape(-1, 3), mapA[sl].reshape(-1, 3), mapO[sl].reshape(-1, 3))
        ctx = cv[max(M + r0 - M, 0):M + r0 + BP + M:8, max(M + c0 - M, 0):M + c0 + BP + M:8]
        d["ctx_valid_frac"] = float(np.isfinite(ctx).mean())
        res.append(d)
    return res, (mapL, mapP, mapA, mapO)


def sun_cols(lat):
    from rank_candidates import circling_sun_days
    return {"sun_days": circling_sun_days(lat), "max_summer_noon_elev": float(max(0.0, 90 - abs(lat) + 23.44))}


def earth_tile(args):
    code, rows = args          # rows: list of (r0,c0,lat)
    t = time.time()
    cv, oh, ow, top, bottom = load_canvas(code)
    res, _ = block_features(cv, [(r, c) for r, c, _ in rows], R_EARTH)
    out = []
    for (r0, c0, lat), d in zip(rows, res):
        out.append({"tile": code, "r0": r0, "c0": c0, **d, **sun_cols(lat)})
    print(f"{code}: {len(rows)} blocks {time.time() - t:.1f}s", flush=True)
    return out


def run_earth(nproc=4):
    fb = pd.read_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))
    jobs = [(t, list(zip(g.r0.astype(int), g.c0.astype(int), g.lat))) for t, g in fb.groupby("tile")]
    jobs.sort(key=lambda j: -len(j[1]))
    t0 = time.time()
    with Pool(nproc) as pool:
        res = pool.map(earth_tile, jobs, chunksize=1)
    df = pd.DataFrame([r for t in res for r in t])
    df = fb[["tile", "r0", "c0", "lat", "lon"]].merge(df, on=["tile", "r0", "c0"], how="left")
    df.to_csv(os.path.join(HERE, "results/feat_illum.csv"), index=False)
    print(f"earth done: {len(df)} blocks, {time.time() - t0:.0f}s")
    return df


# ------------------------------------------------------------------ Validation
def run_validation():
    sites = pd.read_csv(os.path.join(HERE, "validation_sites.csv"))
    rows = []
    for s in sites.itertuples():
        la, lo = int(np.floor(s.lat)), int(np.floor(s.lon))
        code = make_code(la, lo)
        if not os.path.exists(tile_path(code)):
            rows.append({"id": s.id, "note": "tile missing"}); continue
        cv, oh, ow, top, bottom = load_canvas(code)
        lon_l = lo
        r = int((top - s.lat) / (top - bottom) * oh) - BP // 2
        c = int((s.lon - lon_l) / 1.0 * ow) - BP // 2
        r, c = min(max(r, 0), oh - BP), min(max(c, 0), ow - BP)
        r, c = r - r % STRIDE, c - c % STRIDE          # keep the stride grid aligned
        res, _ = block_features(cv, [(r, c)], R_EARTH)
        rows.append({"id": s.id, "tile": code, "r0": r, "c0": c, "lat": s.lat, "lon": s.lon, **res[0], **sun_cols(s.lat)})
        print(s.id, "ok", flush=True)
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "results/feat_illum_validation.csv"), index=False)
    return df


# ------------------------------------------------------------------ Moon
def moon_regions(stride=STRIDE, keep_maps=False):
    from moon_regions import lonlat_to_px, load_dem
    dem = load_dem()
    gj = json.load(open(os.path.join(HERE, "data/moon/regions/A3_9regions-lonlat-simplified.geojson")))
    out, maps = [], {}
    for f in gj["features"]:
        code = f["properties"]["RegionCode"]
        ring = np.array(f["geometry"]["coordinates"][0])
        c, r = lonlat_to_px(ring[:, 0], ring[:, 1])
        r0, r1 = max(int(r.min()) - M, 0), min(int(r.max()) + M + 2, dem.shape[0])
        c0, c1 = max(int(c.min()) - M, 0), min(int(c.max()) + M + 2, dem.shape[1])
        cv = np.asarray(dem[r0:r1, c0:c1], dtype="float32") * 0.5
        rr, cc = np.mgrid[r0:r1:1, c0:c1:1]
        # pixel grid: even absolute indices (same stride rule as Earth); pixel inside polygon
        rr, cc = rr[::1, ::1], cc[::1, ::1]
        sel = (rr % stride == 0) & (cc % stride == 0)
        poly = MPath(np.column_stack([c, r]))
        pts = np.column_stack([cc[sel], rr[sel]])
        inside = poly.contains_points(pts)
        ii, jj = (pts[inside, 1] - r0), (pts[inside, 0] - c0)
        t = time.time()
        L, P, A, O = horizon_maps(cv, ii, jj, R_MOON)
        d = agg(L, P, A, O)
        full = cv.shape[0] >= (int(r.max()) - int(r.min())) + 2 * M and cv.shape[1] >= (int(c.max()) - int(c.min())) + 2 * M
        d["ctx_valid_frac"] = 1.0 if full else np.nan
        out.append({"moon": code, **d})
        if keep_maps:
            maps[code] = (cv, ii, jj, L, P, A, O)
        print(f"moon {code}: {d['n_pix']} px {time.time() - t:.1f}s", flush=True)
    df = pd.DataFrame(out)
    df.to_csv(os.path.join(HERE, "results/feat_illum_moon.csv"), index=False)
    return (df, maps) if keep_maps else df


# ------------------------------------------------------------------ self-test & preview
def selftest():
    z = np.zeros((600, 1200), np.float32)
    z[:, 600:] = 100.0                      # 100 m wall; terrain east of x=600 is a plateau
    ii = np.array([300, 300]); jj = np.array([400, 599])
    L, P, A, O = horizon_maps(z, ii, jj, R_MOON, 40.0)   # pixel 1: 200 px = 8 km west of wall; pixel 2: 1 px (40 m) from wall
    print("flat+wall: L at 8km W of wall (e=1.5,5,10):", L[0], "(horizon toward E = atan(100/8000)=0.72deg -> lit at all e except partially at 1.5)")
    print("                      at 40 m from wall:", L[1], "(horizon toward E ~68 deg -> E-looking azimuths shadowed)")
    zz = np.zeros((300, 300), np.float32)
    L, *_ = horizon_maps(zz, np.array([150]), np.array([150]), R_MOON, 40.0)
    print("flat plane (Moon curvature):", L[0])


def preview():
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from common import hillshade
    # Moon Haworth
    mdf, maps = moon_regions(keep_maps=True)
    cv, ii, jj, L, P, A, O = maps["HW"]
    # Earth block: highest-relief block in the Alps region
    fb = pd.read_pickle(os.path.join(HERE, "results/fine_blocks.pkl"))
    fe = fb[fb.lat.between(25, 50)].sort_values("relief_m", ascending=False).iloc[40]   # a strongly sculpted mid-latitude block
    code, r0, c0 = fe.tile, int(fe.r0), int(fe.c0)
    ecv, oh, ow, _, _ = load_canvas(code)
    res, (mL, mP, mA, mO) = block_features(ecv, [(r0, c0)], R_EARTH)
    print("preview earth block", code, r0, c0, res[0])
    fig, axs = plt.subplots(2, 4, figsize=(20, 10))
    sl = (slice(M + r0, M + r0 + BP), slice(M + c0, M + c0 + BP))
    slg = (slice((M + r0) // STRIDE, (M + r0 + BP) // STRIDE), slice((M + c0) // STRIDE, (M + c0 + BP) // STRIDE))
    hs = hillshade(ecv[sl], 40, 40)
    axs[0, 0].imshow(hs, cmap="gray"); axs[0, 0].set_title(f"Earth {code} r0={r0} c0={c0} hillshade")
    for k, e in enumerate(ELEVS):
        im = mL[slg][:, :, k]
        axs[0, k + 1].imshow(np.nan_to_num(im, nan=0), interpolation='nearest', cmap="viridis", vmin=0, vmax=1); axs[0, k + 1].set_title(f"Earth lit fraction, sun {e} deg")
    # moon: scatter into image
    r_lo, r_hi, c_lo, c_hi = ii.min(), ii.max() + 1, jj.min(), jj.max() + 1
    hs = hillshade(cv[r_lo:r_hi, c_lo:c_hi], 40, 40, alt=1.5)
    axs[1, 0].imshow(hs, cmap="gray"); axs[1, 0].set_title("Moon Haworth region hillshade (sun at 1.5 deg, az 315)")
    for k, e in enumerate(ELEVS):
        img = np.full(((r_hi - r_lo) // STRIDE + 1, (c_hi - c_lo) // STRIDE + 1), np.nan)
        img[(ii - r_lo) // STRIDE, (jj - c_lo) // STRIDE] = L[:, k]
        axs[1, k + 1].imshow(img, interpolation='nearest', cmap="viridis", vmin=0, vmax=1); axs[1, k + 1].set_title(f"Moon HW lit fraction, sun {e} deg")
    for a in axs.ravel(): a.axis("off")
    fig.savefig(os.path.join(HERE, "results/feat_illum_preview.png"), dpi=70, bbox_inches="tight")
    print("saved results/feat_illum_preview.png")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what == "selftest": selftest()
    if what in ("moon", "all"):
        pd.set_option("display.width", 250); pd.set_option("display.max_columns", 40)
        print(moon_regions().round(3).to_string(index=False))
    if what in ("validation", "all"): run_validation()
    if what in ("earth", "all"): run_earth()
    if what == "preview": preview()
    if what == "moonspot":
        from moon_regions import lonlat_to_px, load_dem
        dem = load_dem()
        for nm, lo, la, rad in [("Shackleton floor", 129.0, -89.66, 3), ("Haworth floor", -5.0, -87.5, 8), ("Malapert summit", 0.0, -85.9, 3), ("Cabeus floor", -35.5, -84.9, 6)]:
            c, r = lonlat_to_px(lo, la); c, r = int(c), int(r)
            cv = np.asarray(dem[r - 900:r + 900, c - 900:c + 900], dtype="float32") * 0.5
            k = int(rad * 1000 / 40); g = np.mgrid[-k:k + 1:2, -k:k + 1:2]
            ii, jj = (900 + g[0].ravel()), (900 + g[1].ravel()); ok = g[0].ravel() ** 2 + g[1].ravel() ** 2 <= k * k
            L, P, A, O = horizon_maps(cv, ii[ok], jj[ok], R_MOON)
            print(nm, "median elev", np.median(cv[ii[ok], jj[ok]]), {k_: round(v, 3) for k_, v in agg(L, P, A, O).items()})
