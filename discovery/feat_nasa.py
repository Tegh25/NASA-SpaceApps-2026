#!/usr/bin/env python
"""NASA Earth-observation feature family (MODIS via Microsoft Planetary Computer, anonymous).

Usage (from discovery/):
  ./.venv/bin/python feat_nasa.py run [--tiles h24v04,h11v11] [--thin 3] [--workers 8]
  ./.venv/bin/python feat_nasa.py merge

Sources (all NASA LP DAAC MODIS Collection 6.1, read as COGs from the PC blob store, no login):
  modis-11A2-061  MYD11A2 (Aqua) 8-day LST day/night 1 km     2019-2023, every `thin`-th (default 5th) composite
  modis-43A4-061  MCD43A4 NBAR reflectance 500 m -> Liang(2001) broadband SW albedo, 8 dates 2021-2022
  modis-13Q1-061  MYD13Q1 (Aqua) 16-day NDVI 250 m              2021 (every other composite)
  modis-10A2-061  MYD10A2 (Aqua) 8-day max snow extent 500 m    2019-2023, every 8th composite
Rasters are read through COG overviews (4x decimation, ~4 km LST pixels) and averaged over the
20x20 km block window (pixel centres within +-10 km of the block centre in sinusoidal metres).
"""
import sys, os, time, json, argparse, warnings
import numpy as np, pandas as pd
from concurrent.futures import ThreadPoolExecutor
from pyproj import CRS, Transformer
import rasterio, planetary_computer as pc, pystac_client

warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "results")
TDIR = os.path.join(OUT, "feat_nasa_tiles")
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
T = 1111950.5196666666
X0, Y0 = -20015109.354, 10007554.677
SIN = CRS.from_proj4("+proj=sinu +R=6371007.181 +units=m +no_defs")
TR = Transformer.from_crs("EPSG:4326", SIN, always_xy=True)
HALF = 10000.0  # half block size (m)
NOUT = 300      # decimated tile size for LST (4x overview), snow/albedo/ndvi also 300


def targets():
    b = pd.read_pickle(os.path.join(OUT, "fine_blocks.pkl"))[["tile", "r0", "c0", "lat", "lon"]].copy()
    b["uid"] = "B|" + b.tile.astype(str) + "|" + b.r0.astype(str) + "|" + b.c0.astype(str)
    v = pd.read_csv(os.path.join(ROOT, "validation_sites.csv"))[["id", "lat", "lon"]].copy()
    v["uid"] = "V|" + v["id"]
    t = pd.concat([b[["uid", "lat", "lon"]], v[["uid", "lat", "lon"]]], ignore_index=True)
    x, y = TR.transform(t.lon.values, t.lat.values)
    t["x"], t["y"] = x, y
    t["h"] = np.floor((x - X0) / T).astype(int)
    t["v"] = np.floor((Y0 - y) / T).astype(int)
    return t


def env():
    return rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                        GDAL_HTTP_MULTIPLEX="YES", GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="1",
                        GDAL_HTTP_TIMEOUT="60")


def read_href(href, n=NOUT):
    for k in range(3):
        try:
            with env(), rasterio.open(href) as d:
                return d.read(1, out_shape=(n, n))
        except Exception:
            time.sleep(1 + k)
    return None


def idt(i):
    if i.datetime is not None:
        return i.datetime
    a = pd.Timestamp(i.properties["start_datetime"]); b = pd.Timestamp(i.properties["end_datetime"])
    return (a + (b - a) / 2).to_pydatetime()


def search(cat, coll, h, v, dt, prefix=None):
    s = cat.search(collections=[coll], query={"modis:horizontal-tile": {"eq": int(h)},
                                              "modis:vertical-tile": {"eq": int(v)}}, datetime=dt, limit=500)
    its = [i for i in s.items() if prefix is None or i.id.startswith(prefix)]
    its.sort(key=idt)
    return its


def thin(lst, k, off=0):
    return lst[off::k]


def window_idx(xc, yc, h, v, n=NOUT):
    dx = T / n
    x0 = X0 + h * T
    y0 = Y0 - v * T
    cj = (xc - x0) / dx - 0.5  # fractional column index of the block centre
    ri = (y0 - yc) / dx - 0.5
    rad = HALF / dx
    j0, j1 = int(np.ceil(cj - rad)), int(np.floor(cj + rad))
    i0, i1 = int(np.ceil(ri - rad)), int(np.floor(ri + rad))
    if j1 < j0:
        j0 = j1 = int(round(cj))
    if i1 < i0:
        i0 = i1 = int(round(ri))
    j0, j1 = max(j0, 0), min(j1, n - 1)
    i0, i1 = max(i0, 0), min(i1, n - 1)
    if j1 < j0 or i1 < i0:
        return None
    return i0, i1 + 1, j0, j1 + 1


def nanp(a, q):
    a = a[np.isfinite(a)]
    return float(np.percentile(a, q)) if a.size else np.nan


def process_tile(h, v, tt, workers, thin_k, log):
    cat = pystac_client.Client.open(STAC, modifier=pc.sign_inplace)
    t0 = time.time()
    lst_items = thin(search(cat, "modis-11A2-061", h, v, "2019-01-01/2023-12-31", "MYD"), thin_k)
    snow_items = thin(search(cat, "modis-10A2-061", h, v, "2019-01-01/2023-12-31", "MYD"), 8)
    ndvi_items = thin(search(cat, "modis-13Q1-061", h, v, "2021-01-01/2021-12-31", "MYD"), 2)
    alb_all = search(cat, "modis-43A4-061", h, v, "2021-01-01/2022-12-31")
    alb_items = [alb_all[i] for i in np.linspace(0, len(alb_all) - 1, 8).astype(int)] if alb_all else []
    log(f"  h{h:02d}v{v:02d}: items lst={len(lst_items)} snow={len(snow_items)} ndvi={len(ndvi_items)} alb={len(alb_items)}")
    jobs = []
    for i, it in enumerate(lst_items):
        jobs.append(("lstd", i, it.assets["LST_Day_1km"].href))
        jobs.append(("lstn", i, it.assets["LST_Night_1km"].href))
    for i, it in enumerate(snow_items):
        jobs.append(("snow", i, it.assets["Maximum_Snow_Extent"].href))
    for i, it in enumerate(ndvi_items):
        jobs.append(("ndvi", i, it.assets["250m_16_days_NDVI"].href))
    for i, it in enumerate(alb_items):
        for b in (1, 2, 3, 4, 5, 7):
            jobs.append((f"alb{b}", i, it.assets[f"Nadir_Reflectance_Band{b}"].href))
    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda j: read_href(j[2]), jobs))
    fails = sum(r is None for r in res)
    log(f"  h{h:02d}v{v:02d}: {len(jobs)} reads, {fails} failed, {time.time()-t0:.0f}s")
    S = {}
    for (k, i, _), r in zip(jobs, res):
        S.setdefault(k, {})[i] = r

    def stack(key, n_items):
        a = np.full((n_items, NOUT, NOUT), np.nan, dtype=np.float32)
        for i in range(n_items):
            r = S.get(key, {}).get(i)
            if r is not None:
                a[i] = r
        return a

    nl = len(lst_items)
    D = stack("lstd", nl); N = stack("lstn", nl)
    D[D == 0] = np.nan; N[N == 0] = np.nan
    D *= 0.02; N *= 0.02
    months = np.array([idt(it).month for it in lst_items]) if nl else np.array([])
    ns = len(snow_items)
    SN = stack("snow", ns) if ns else None
    nn = len(ndvi_items)
    ND = stack("ndvi", nn) if nn else None
    if ND is not None:
        ND[(ND < -2000) | (ND > 10000)] = np.nan
        ND *= 1e-4
    na = len(alb_items)
    ALB = None
    if na:
        B = {b: stack(f"alb{b}", na) for b in (1, 2, 3, 4, 5, 7)}
        bad = np.zeros(B[1].shape, dtype=bool)
        for b in B:
            bad |= ~np.isfinite(B[b]) | (B[b] < 0) | (B[b] > 10000)
        w = {1: 0.160, 2: 0.291, 3: 0.243, 4: 0.116, 5: 0.112, 7: 0.081}
        ALB = sum(w[b] * B[b] * 1e-4 for b in B) - 0.0015
        ALB[bad] = np.nan
        ALB = np.clip(ALB, 0, 1)

    rows = []
    for _, r in tt.iterrows():
        w_ = window_idx(r.x, r.y, h, v)
        out = {"uid": r.uid, "modis_tile": f"h{h:02d}v{v:02d}"}
        if w_ is None:
            rows.append(out); continue
        i0, i1, j0, j1 = w_
        out["n_pix_window"] = (i1 - i0) * (j1 - j0)
        if nl:
            d = D[:, i0:i1, j0:j1].reshape(nl, -1)
            n_ = N[:, i0:i1, j0:j1].reshape(nl, -1)
            out["lst_day_mean_K"] = np.nanmean(d) if np.isfinite(d).any() else np.nan
            out["lst_night_mean_K"] = np.nanmean(n_) if np.isfinite(n_).any() else np.nan
            out["lst_day_p95_K"] = nanp(d, 95)
            out["lst_night_p05_K"] = nanp(n_, 5)
            out["lst_day_max_K"] = nanp(d, 100)
            out["lst_night_min_K"] = nanp(n_, 0)
            out["lst_valid_frac"] = float(np.isfinite(np.concatenate([d, n_])).mean())
            allv = np.concatenate([d.ravel(), n_.ravel()])
            allv = allv[np.isfinite(allv)]
            out["frozen_frac"] = float((allv < 273.15).mean()) if allv.size else np.nan
            dv = d[np.isfinite(d)]; nv = n_[np.isfinite(n_)]
            out["frozen_day_frac"] = float((dv < 273.15).mean()) if dv.size else np.nan
            out["frozen_night_frac"] = float((nv < 273.15).mean()) if nv.size else np.nan
            with np.errstate(all="ignore"):
                ts = 0.5 * (np.nanmean(d, 1) + np.nanmean(n_, 1))
            mm = np.array([np.nanmean(ts[months == m]) if np.isfinite(ts[months == m]).any() else np.nan
                           for m in range(1, 13)])
            ok = np.isfinite(mm).sum() >= 9
            out["lst_annual_amplitude_K"] = float(np.nanmax(mm) - np.nanmin(mm)) if ok else np.nan
            out["lst_warmest_month_K"] = float(np.nanmax(mm)) if ok else np.nan
            out["lst_coldest_month_K"] = float(np.nanmin(mm)) if ok else np.nan
        if ns:
            s = SN[:, i0:i1, j0:j1]
            snow = np.sum(s == 200); nos = np.sum(s == 25)
            out["snow_frac"] = float(snow / (snow + nos)) if (snow + nos) > 0 else np.nan
            out["snow_valid_frac"] = float((snow + nos) / s.size) if s.size else np.nan
        if nn:
            nd = ND[:, i0:i1, j0:j1]
            with np.errstate(all="ignore"):
                pm = np.nanmax(nd, axis=0)
            out["ndvi_max"] = float(np.nanmean(pm)) if np.isfinite(pm).any() else np.nan
            out["ndvi_mean"] = float(np.nanmean(nd)) if np.isfinite(nd).any() else np.nan
        if ALB is not None:
            a = ALB[:, i0:i1, j0:j1]
            out["albedo_mean"] = float(np.nanmean(a)) if np.isfinite(a).any() else np.nan
        rows.append(out)
    df = pd.DataFrame(rows)
    df["diurnal_range_K"] = df["lst_day_mean_K"] - df["lst_night_mean_K"]
    df["lst_mean_K"] = 0.5 * (df["lst_day_mean_K"] + df["lst_night_mean_K"])
    dr = df["diurnal_range_K"].where(df["diurnal_range_K"] > 1.0)
    df["thermal_inertia_proxy"] = (1 - df["albedo_mean"]) / dr
    return df


def run(args):
    os.makedirs(TDIR, exist_ok=True)
    os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
    t = targets()
    grp = t.groupby(["h", "v"])
    keys = sorted(grp.groups.keys(), key=lambda k: -len(grp.get_group(k)))
    if args.tiles:
        want = {tuple(int(x) for x in s[1:].split("v")) for s in args.tiles.split(",")}
        keys = [k for k in keys if k in want]
    logf = open(os.path.join(ROOT, "logs", "feat_nasa.log"), "a")

    def log(m):
        print(m, flush=True); logf.write(m + "\n"); logf.flush()
    log(f"=== run {time.ctime()} tiles={len(keys)} thin={args.thin} workers={args.workers}")
    for h, v in keys:
        fn = os.path.join(TDIR, f"h{h:02d}v{v:02d}.csv")
        if os.path.exists(fn) and not args.force:
            continue
        tt = grp.get_group((h, v))
        log(f"tile h{h:02d}v{v:02d}: {len(tt)} targets")
        try:
            df = process_tile(h, v, tt, args.workers, args.thin, log)
            df.to_csv(fn, index=False)
        except Exception as e:
            log(f"  FAILED h{h:02d}v{v:02d}: {e!r}")


def merge(args):
    fs = sorted(f for f in os.listdir(TDIR) if f.endswith(".csv"))
    df = pd.concat([pd.read_csv(os.path.join(TDIR, f)) for f in fs], ignore_index=True)
    b = pd.read_pickle(os.path.join(OUT, "fine_blocks.pkl"))[["tile", "r0", "c0"]].copy()
    b["uid"] = "B|" + b.tile.astype(str) + "|" + b.r0.astype(str) + "|" + b.c0.astype(str)
    # lst_day_max_K / lst_night_min_K are raw extremes polluted by ~1e-5 fill-value outliers -> not exported
    df = df.drop(columns=["lst_day_max_K", "lst_night_min_K"], errors="ignore")
    m = b.merge(df, on="uid", how="left").drop(columns="uid")
    pw = os.path.join(OUT, "feat_nasa_power.csv"); pwv = os.path.join(OUT, "feat_nasa_power_validation.csv")
    if os.path.exists(pw):  # extra NASA POWER (MERRA-2) climatology columns from feat_nasa_power.py
        m = m.merge(pd.read_csv(pw), on=["tile", "r0", "c0"], how="left")
    m.to_csv(os.path.join(OUT, "feat_nasa.csv"), index=False)
    v = pd.read_csv(os.path.join(ROOT, "validation_sites.csv"))[["id"]].copy()
    v["uid"] = "V|" + v["id"]
    mv = v.merge(df, on="uid", how="left").drop(columns="uid")
    if os.path.exists(pwv):
        mv = mv.merge(pd.read_csv(pwv), on="id", how="left")
    mv.to_csv(os.path.join(OUT, "feat_nasa_validation.csv"), index=False)
    print("blocks", len(m), "with lst_mean", int(m.lst_mean_K.notna().sum()), "| validation", len(mv),
          int(mv.lst_mean_K.notna().sum()))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "merge"])
    ap.add_argument("--tiles"); ap.add_argument("--thin", type=int, default=5)
    ap.add_argument("--workers", type=int, default=8); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    run(a) if a.cmd == "run" else merge(a)
