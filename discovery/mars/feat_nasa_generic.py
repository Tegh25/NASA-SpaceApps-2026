#!/usr/bin/env python
"""Generic NASA Earth-observation features (MODIS via Planetary Computer + NASA POWER) for ANY list of blocks.

Usage (run from mars/):
  ../.venv/bin/python feat_nasa_generic.py --blocks results/test_blocks.csv --out results/test_nasa.csv
                                          [--workers 8] [--thin 5] [--no-power] [--no-modis] [--half-km 15]

Input CSV: id,lat,lon (a block = 30x30 km square centred there; window = pixel centres within +-15 km).
No login. Everything is cached under results/ and resumable:
  results/_modis_tiles/hXXvYY.npz   per-MODIS-tile summary rasters (300x300, ~3.7 km pixels), reused by any later run
  results/_power_cache.jsonl        NASA POWER point climatology per 0.5 x 0.625 deg cell
MODIS blocks are grouped by sinusoidal tile (h,v): one set of COG reads per tile, NOT per block.

MODIS (NASA LP DAAC Collection 6.1, Aqua) -- identical method to ../feat_nasa.py
  lst_day_mean_K, lst_night_mean_K   MYD11A2 LST_Day_1km / LST_Night_1km (13:30 / 01:30 LT), 2019-2023,
                                     every `thin`-th 8-day composite (~47 dates), window and date mean
  diurnal_range_K                    day - night
  lst_mean_K                         (day + night) / 2
  lst_annual_amplitude_K             max - min of the 12 monthly means of (day+night)/2 (NaN if < 9 months valid)
  albedo_mean                        MCD43A4 NBAR bands 1-5,7 -> Liang (2001) broadband shortwave albedo, 8 dates 2021-22
  ndvi_max                           MYD13Q1 NDVI 2021: window mean of per-pixel annual max
  snow_frac                          MYD10A2 max snow extent, snow / (snow + no-snow) composites, 2019-2023
  lst_valid_frac, n_pix_window, modis_tile   QC / bookkeeping
  Blocks straddling a tile edge are clipped to the tile of their centre (n_pix_window small flags it).
  LST is clear-sky only (cloud/polar-night bias) -- see feat_generic_notes.md.

NASA POWER climatology (point API, community RE, nearest 0.5 x 0.625 deg MERRA-2/CERES cell, ANN values)
  ps_kpa              PS surface pressure at the cell mean elevation (kPa)
  uv_index            ALLSKY_SFC_UV_INDEX
  ws10m               WS10M wind speed at 10 m (m/s)
  rh2m                RH2M relative humidity at 2 m (%)
  t2m_K               T2M air temperature at 2 m (K)
  precip_mm_day       PRECTOTCORR (mm/day)
  sw_dwn_kwh_m2_day   ALLSKY_SFC_SW_DWN
  ts_K                TS skin temperature (K)
  elev_power_m        mean elevation of the POWER cell (m), as returned by the API
"""
import os, sys, time, json, argparse, warnings, threading
import numpy as np, pandas as pd, requests
from concurrent.futures import ThreadPoolExecutor

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "results")
TDIR = os.path.join(R, "_modis_tiles")
PCACHE = os.path.join(R, "_power_cache.jsonl")
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
T = 1111950.5196666666
X0, Y0 = -20015109.354, 10007554.677
NOUT = 300
PARAMS = ["PS", "ALLSKY_SFC_UV_INDEX", "WS10M", "RH2M", "T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "TS"]
POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
LAYERS = (["lst_day", "lst_night", "lst_valid", "snow_n", "nosnow_n", "ndvi_max", "ndvi_mean", "albedo"]
          + [f"lstm{m:02d}" for m in range(1, 13)])


# ----------------------------------------------------------------------------- MODIS
def modis_imports():
    global rasterio, pc, pystac_client, Transformer, CRS, SIN, TR
    import rasterio, planetary_computer as pc, pystac_client
    from pyproj import CRS, Transformer
    SIN = CRS.from_proj4("+proj=sinu +R=6371007.181 +units=m +no_defs")
    TR = Transformer.from_crs("EPSG:4326", SIN, always_xy=True)


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
    for k in range(3):
        try:
            s = cat.search(collections=[coll], query={"modis:horizontal-tile": {"eq": int(h)},
                                                      "modis:vertical-tile": {"eq": int(v)}}, datetime=dt, limit=500)
            its = [i for i in s.items() if prefix is None or i.id.startswith(prefix)]
            its.sort(key=idt)
            return its
        except Exception:
            time.sleep(2 + 2 * k)
    raise RuntimeError(f"STAC search failed {coll} h{h}v{v}")


def tile_summary(h, v, workers, thin_k, log):
    """read the COGs of one MODIS tile and reduce to per-pixel summary layers (dict of 300x300 float32)."""
    cat = pystac_client.Client.open(STAC, modifier=pc.sign_inplace)
    t0 = time.time()
    lst_items = search(cat, "modis-11A2-061", h, v, "2019-01-01/2023-12-31", "MYD")[::thin_k]
    snow_items = search(cat, "modis-10A2-061", h, v, "2019-01-01/2023-12-31", "MYD")[::8]
    ndvi_items = search(cat, "modis-13Q1-061", h, v, "2021-01-01/2021-12-31", "MYD")[::2]
    alb_all = search(cat, "modis-43A4-061", h, v, "2021-01-01/2022-12-31")
    alb_items = [alb_all[i] for i in np.linspace(0, len(alb_all) - 1, 8).astype(int)] if alb_all else []
    jobs = []
    for i, it in enumerate(lst_items):
        jobs.append(("lstd", i, it.assets["LST_Day_1km"].href)); jobs.append(("lstn", i, it.assets["LST_Night_1km"].href))
    for i, it in enumerate(snow_items): jobs.append(("snow", i, it.assets["Maximum_Snow_Extent"].href))
    for i, it in enumerate(ndvi_items): jobs.append(("ndvi", i, it.assets["250m_16_days_NDVI"].href))
    for i, it in enumerate(alb_items):
        for b in (1, 2, 3, 4, 5, 7): jobs.append((f"alb{b}", i, it.assets[f"Nadir_Reflectance_Band{b}"].href))
    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(lambda j: read_href(j[2]), jobs))
    fails = sum(r is None for r in res)
    log(f"  h{h:02d}v{v:02d}: items lst={len(lst_items)} snow={len(snow_items)} ndvi={len(ndvi_items)} alb={len(alb_items)}; "
        f"{len(jobs)} reads, {fails} failed, {time.time()-t0:.0f}s")
    if jobs and fails > 0.3 * len(jobs):
        raise RuntimeError("too many failed reads")
    S = {}
    for (k, i, _), r in zip(jobs, res): S.setdefault(k, {})[i] = r

    def stack(key, n):
        a = np.full((n, NOUT, NOUT), np.nan, dtype=np.float32)
        for i in range(n):
            r = S.get(key, {}).get(i)
            if r is not None: a[i] = r
        return a

    nan = np.full((NOUT, NOUT), np.nan, np.float32)
    out = {k: nan.copy() for k in LAYERS}
    nl = len(lst_items)
    with np.errstate(all="ignore"):
        if nl:
            D = stack("lstd", nl); N = stack("lstn", nl)
            D[D == 0] = np.nan; N[N == 0] = np.nan
            D *= 0.02; N *= 0.02
            out["lst_day"] = np.nanmean(D, 0); out["lst_night"] = np.nanmean(N, 0)
            out["lst_valid"] = 0.5 * (np.isfinite(D).mean(0) + np.isfinite(N).mean(0))
            months = np.array([idt(it).month for it in lst_items])
            ts = 0.5 * (D + N)
            for m in range(1, 13):
                sel = months == m
                if sel.any(): out[f"lstm{m:02d}"] = np.nanmean(ts[sel], 0)
            del D, N, ts
        if snow_items:
            SN = stack("snow", len(snow_items))
            out["snow_n"] = (SN == 200).sum(0).astype(np.float32); out["nosnow_n"] = (SN == 25).sum(0).astype(np.float32)
        if ndvi_items:
            ND = stack("ndvi", len(ndvi_items))
            ND[(ND < -2000) | (ND > 10000)] = np.nan
            ND *= 1e-4
            out["ndvi_max"] = np.nanmax(ND, 0); out["ndvi_mean"] = np.nanmean(ND, 0)
        if alb_items:
            na = len(alb_items)
            B = {b: stack(f"alb{b}", na) for b in (1, 2, 3, 4, 5, 7)}
            bad = np.zeros(B[1].shape, dtype=bool)
            for b in B: bad |= ~np.isfinite(B[b]) | (B[b] < 0) | (B[b] > 10000)
            w = {1: 0.160, 2: 0.291, 3: 0.243, 4: 0.116, 5: 0.112, 7: 0.081}
            A = sum(w[b] * B[b] * 1e-4 for b in B) - 0.0015
            A[bad] = np.nan
            out["albedo"] = np.nanmean(np.clip(A, 0, 1), 0)
    return {k: v.astype(np.float32) for k, v in out.items()}


def window_idx(xc, yc, h, v, half_m, n=NOUT):
    dx = T / n
    x0 = X0 + h * T; y0 = Y0 - v * T
    cj = (xc - x0) / dx - 0.5; ri = (y0 - yc) / dx - 0.5
    rad = half_m / dx
    j0, j1 = int(np.ceil(cj - rad)), int(np.floor(cj + rad))
    i0, i1 = int(np.ceil(ri - rad)), int(np.floor(ri + rad))
    if j1 < j0: j0 = j1 = int(round(cj))
    if i1 < i0: i0 = i1 = int(round(ri))
    j0, j1 = max(j0, 0), min(j1, n - 1); i0, i1 = max(i0, 0), min(i1, n - 1)
    if j1 < j0 or i1 < i0: return None
    return i0, i1 + 1, j0, j1 + 1


def nm(a):
    a = a[np.isfinite(a)]
    return float(a.mean()) if a.size else np.nan


def modis_features(blocks, workers, thin_k, half_km, log):
    modis_imports()
    os.makedirs(TDIR, exist_ok=True)
    x, y = TR.transform(blocks.lon.values, blocks.lat.values)
    b = blocks.copy(); b["x"], b["y"] = x, y
    b["h"] = np.floor((x - X0) / T).astype(int); b["v"] = np.floor((Y0 - y) / T).astype(int)
    keys = sorted(set(zip(b.h, b.v)))
    log(f"MODIS: {len(b)} blocks in {len(keys)} tiles")
    rows = []
    for h, v in keys:
        fn = os.path.join(TDIR, f"h{h:02d}v{v:02d}.npz")
        if os.path.exists(fn):
            Z = dict(np.load(fn))
        else:
            try:
                Z = tile_summary(h, v, workers, thin_k, log)
                np.savez_compressed(fn + ".tmp.npz", **Z); os.replace(fn + ".tmp.npz", fn)
            except Exception as e:
                log(f"  FAILED h{h:02d}v{v:02d}: {e!r}")
                for _, r in b[(b.h == h) & (b.v == v)].iterrows():
                    rows.append({"id": r["id"], "modis_tile": f"h{h:02d}v{v:02d}"})
                continue
        for _, r in b[(b.h == h) & (b.v == v)].iterrows():
            o = {"id": r["id"], "modis_tile": f"h{h:02d}v{v:02d}"}
            w_ = window_idx(r.x, r.y, h, v, half_km * 1000.0)
            if w_ is None:
                rows.append(o); continue
            i0, i1, j0, j1 = w_
            sl = (slice(i0, i1), slice(j0, j1))
            g = lambda k: Z[k][sl]
            o["n_pix_window"] = (i1 - i0) * (j1 - j0)
            o["lst_day_mean_K"] = nm(g("lst_day")); o["lst_night_mean_K"] = nm(g("lst_night"))
            o["lst_valid_frac"] = nm(g("lst_valid"))
            mm = np.array([nm(g(f"lstm{m:02d}")) for m in range(1, 13)])
            ok = np.isfinite(mm).sum() >= 9
            o["lst_annual_amplitude_K"] = float(np.nanmax(mm) - np.nanmin(mm)) if ok else np.nan
            sn, ns = g("snow_n").sum(), g("nosnow_n").sum()
            o["snow_frac"] = float(sn / (sn + ns)) if (sn + ns) > 0 else np.nan
            o["ndvi_max"] = nm(g("ndvi_max"))
            o["albedo_mean"] = nm(g("albedo"))
            rows.append(o)
    df = pd.DataFrame(rows)
    df["diurnal_range_K"] = df["lst_day_mean_K"] - df["lst_night_mean_K"]
    df["lst_mean_K"] = 0.5 * (df["lst_day_mean_K"] + df["lst_night_mean_K"])
    return df


# ----------------------------------------------------------------------------- POWER
def cell(lat, lon):
    la = float(np.clip(round(lat / 0.5) * 0.5, -90, 90))
    lo = round(lon / 0.625) * 0.625
    lo = ((lo + 180) % 360) - 180
    return (round(la, 3), round(lo, 3))


def power_fetch(key, sess):
    lat, lon = key
    for attempt in range(5):
        try:
            r = sess.get(POWER_URL, params=dict(parameters=",".join(PARAMS), community="RE", longitude=lon,
                                                latitude=lat, format="JSON"), timeout=60)
            if r.status_code == 200:
                js = r.json()
                par = js["properties"]["parameter"]
                d = {p: par.get(p, {}).get("ANN") for p in PARAMS}
                d["elev"] = js["geometry"]["coordinates"][2] if len(js["geometry"]["coordinates"]) > 2 else None
                return key, d
            time.sleep(2 * (attempt + 1) if r.status_code == 429 else 1 + attempt)
        except Exception:
            time.sleep(1 + attempt)
    return key, None


def power_features(blocks, threads, log):
    cache = {}
    if os.path.exists(PCACHE):
        for ln in open(PCACHE):
            try:
                k, d = json.loads(ln); cache[tuple(k)] = d
            except Exception:
                pass
    cells = [cell(a, b) for a, b in zip(blocks.lat, blocks.lon)]
    need = sorted({c for c in cells if c not in cache})
    log(f"POWER: {len(set(cells))} cells, {len(need)} to fetch")
    sess = requests.Session(); sess.headers["User-Agent"] = "generic-nasa-feature-script/1.0"
    lock = threading.Lock()

    def f(k):
        out = power_fetch(k, sess); time.sleep(0.2); return out
    fails = 0
    with open(PCACHE, "a") as fh, ThreadPoolExecutor(threads) as ex:
        for k, d in ex.map(f, need):
            if d is None: fails += 1; continue
            cache[k] = d; fh.write(json.dumps([list(k), d]) + "\n"); fh.flush()
    if fails: log(f"  POWER failed cells: {fails} (rerun to retry)")

    def val(d, p, scale=1.0, add=0.0):
        x = None if d is None else d.get(p)
        return np.nan if x is None or x < -900 else x * scale + add
    rows = []
    for (_, r), c in zip(blocks.iterrows(), cells):
        d = cache.get(c)
        rows.append({"id": r["id"], "power_cell": f"{c[0]},{c[1]}",
                     "ps_kpa": val(d, "PS"), "uv_index": val(d, "ALLSKY_SFC_UV_INDEX"), "ws10m": val(d, "WS10M"),
                     "rh2m": val(d, "RH2M"), "t2m_K": val(d, "T2M", add=273.15), "precip_mm_day": val(d, "PRECTOTCORR"),
                     "sw_dwn_kwh_m2_day": val(d, "ALLSKY_SFC_SW_DWN"), "ts_K": val(d, "TS", add=273.15),
                     "elev_power_m": np.nan if d is None or d.get("elev") is None else d["elev"]})
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--blocks", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8, help="parallel COG reads per MODIS tile")
    ap.add_argument("--thin", type=int, default=5, help="use every k-th LST composite (default 5)")
    ap.add_argument("--half-km", type=float, default=15.0, help="half window size (km), 15 = 30 km block")
    ap.add_argument("--power-threads", type=int, default=3)
    ap.add_argument("--no-modis", action="store_true"); ap.add_argument("--no-power", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    os.makedirs(R, exist_ok=True)

    def log(m): print(f"[{time.time()-t0:6.0f}s] {m}", flush=True)
    blocks = pd.read_csv(a.blocks)[["id", "lat", "lon"]]
    out = blocks.copy()
    if not a.no_modis:
        out = out.merge(modis_features(blocks, a.workers, a.thin, a.half_km, log), on="id", how="left")
    if not a.no_power:
        out = out.merge(power_features(blocks, a.power_threads, log), on="id", how="left")
    out.to_csv(a.out, index=False)
    log(f"wrote {a.out}: {len(out)} rows, {(time.time()-t0)/max(len(out),1):.1f} s/block")


if __name__ == "__main__":
    main()
