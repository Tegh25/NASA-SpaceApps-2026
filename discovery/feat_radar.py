#!/usr/bin/env python3
"""Earth L-band radar features from JAXA ALOS PALSAR/PALSAR-2 annual mosaics (Planetary Computer STAC, anonymous).

Collection alos-palsar-mosaic: 25 m, HH/HV, EPSG:4326 1x1 deg COGs (with overviews). One year (2020, fallback 2021/2019...).
For each 1x1 deg tile we read HH and HV once at ~1/8 decimation (average resampling of DN amplitude -> ~200-250 m pixels),
convert DN -> sigma0[dB] = 10 log10(DN^2) - 83, then every 20x20 km block (centre in tile, clipped at tile edge) gets:
  hh_db, hv_db (mean of dB), hv_hh_db (cross-pol ratio in dB = HV-HH), hh_db_std / hv_db_std (radar texture),
  hh_db_p10/p90, n_px, valid_frac.   Blocks not covered -> NaN.
Outputs: results/feat_radar.csv (tile,r0,c0,...) and results/feat_radar_validation.csv (id,...).
Usage: ./.venv/bin/python feat_radar.py [--max-minutes 20] [--threads 4]
"""
import time, argparse, math, warnings
import numpy as np, pandas as pd, rasterio
from rasterio.enums import Resampling
import planetary_computer as pc, pystac_client
from concurrent.futures import ThreadPoolExecutor
warnings.filterwarnings('ignore')

R = 'results/'
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
DEC = 562   # 4500 px -> 562 px (~ 200 m at 25 m native... 1 deg = 111 km -> 198 m N-S)
cat = pystac_client.Client.open(STAC, modifier=pc.sign_inplace)

def find_item(la, lo):
    for _ in range(3):
        try:
            its = list(cat.search(collections=['alos-palsar-mosaic'], bbox=[lo + .5, la + .5, lo + .5, la + .5],
                                  datetime='2018-01-01/2021-12-31').items())
            break
        except Exception:
            time.sleep(2); its = None
    if not its:
        return None
    its.sort(key=lambda i: (abs(i.datetime.year - 2020), -i.datetime.year))
    return its[0]

def read_tile(args):
    la, lo, blocks = args          # blocks: list of (key, lat, lon)
    try:
        it = find_item(la, lo)
        if it is None:
            return la, lo, {}, 'no_item'
        arr = {}
        for pol in ('HH', 'HV'):
            for _ in range(3):
                try:
                    with rasterio.open(pc.sign(it.assets[pol].href)) as ds:
                        a = ds.read(1, out_shape=(DEC, DEC), resampling=Resampling.average).astype('float64')
                    break
                except Exception:
                    a = None; time.sleep(2)
            if a is None:
                return la, lo, {}, 'read_fail'
            a[a <= 1] = np.nan
            arr[pol] = 10 * np.log10(a ** 2) - 83.0
        pix = 1.0 / DEC
        lat_c = la + 1 - (np.arange(DEC) + .5) * pix       # row centres (top = la+1)
        lon_c = lo + (np.arange(DEC) + .5) * pix
        out = {}
        for key, lat, lon in blocks:
            dlat = 10 / 111.2; dlon = 10 / (111.2 * max(math.cos(math.radians(lat)), .05))
            ri = np.where((lat_c >= lat - dlat) & (lat_c <= lat + dlat))[0]
            ci = np.where((lon_c >= lon - dlon) & (lon_c <= lon + dlon))[0]
            if len(ri) < 5 or len(ci) < 5:
                continue
            hh = arr['HH'][np.ix_(ri, ci)]; hv = arr['HV'][np.ix_(ri, ci)]
            m = np.isfinite(hh) & np.isfinite(hv)
            n = int(m.sum())
            if n < 25:
                continue
            h, v = hh[m], hv[m]
            out[key] = dict(hh_db=h.mean(), hv_db=v.mean(), hv_hh_db=v.mean() - h.mean(),
                            hh_db_std=h.std(), hv_db_std=v.std(), hh_db_p10=np.percentile(h, 10),
                            hh_db_p90=np.percentile(h, 90), n_px=n, valid_frac=n / hh.size,
                            palsar_year=it.datetime.year)
        return la, lo, out, 'ok'
    except Exception as e:
        return la, lo, {}, 'err:' + str(e)[:80]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max-minutes', type=float, default=20)
    ap.add_argument('--threads', type=int, default=4)
    a = ap.parse_args()
    t0 = time.time()
    blocks = pd.read_pickle(R + 'fine_blocks.pkl')[['tile', 'r0', 'c0', 'lat', 'lon']].reset_index(drop=True)
    ts = pd.read_csv(R + 'fine_terrain_scores.csv', usecols=['tile', 'lat', 'lon', 'moon', 'terrain_dist'])
    top = ts.sort_values('terrain_dist').groupby('moon').head(400)
    topkeys = set(zip(top.tile, top.lat.round(5), top.lon.round(5)))
    blocks['prio'] = [(t, round(la, 5), round(lo, 5)) in topkeys for t, la, lo in zip(blocks.tile, blocks.lat, blocks.lon)]
    val = pd.read_csv('validation_sites.csv')

    groups = {}
    for i, r in blocks.iterrows():
        k = (int(math.floor(r.lat)), int(math.floor(r.lon)))
        groups.setdefault(k, []).append((('b', i), r.lat, r.lon))
    for i, r in val.iterrows():
        k = (int(math.floor(r.lat)), int(math.floor(r.lon)))
        groups.setdefault(k, []).append((('v', i), r.lat, r.lon))
    prio_tiles = set()
    for i in blocks.index[blocks.prio]:
        r = blocks.loc[i]; prio_tiles.add((int(math.floor(r.lat)), int(math.floor(r.lon))))
    for i, r in val.iterrows(): prio_tiles.add((int(math.floor(r.lat)), int(math.floor(r.lon))))
    order = sorted(groups, key=lambda k: (k not in prio_tiles, k))
    print('tiles', len(groups), 'priority tiles', len(prio_tiles), flush=True)

    res = {}; status = {}
    jobs = [(la, lo, groups[(la, lo)]) for la, lo in order]
    with ThreadPoolExecutor(a.threads) as ex:
        for i in range(0, len(jobs), 24):
            if time.time() - t0 > a.max_minutes * 60:
                print('time box reached', flush=True); break
            for la, lo, out, st in ex.map(read_tile, jobs[i:i + 24]):
                res.update(out); status[(la, lo)] = st
            ok = sum(v == 'ok' for v in status.values())
            print(f'tiles done {len(status)}/{len(jobs)} ok {ok} blocks with data {len(res)} t={time.time()-t0:.0f}s', flush=True)
    st = pd.Series(status).value_counts(); print(st.to_string())

    cols = ['hh_db', 'hv_db', 'hv_hh_db', 'hh_db_std', 'hv_db_std', 'hh_db_p10', 'hh_db_p90', 'n_px', 'valid_frac', 'palsar_year']
    def table(df, tag, keycols):
        rows = []
        for i, r in df.iterrows():
            d = res.get((tag, i), {})
            rows.append({**{c: r[c] for c in keycols}, **{c: d.get(c, np.nan) for c in cols}})
        return pd.DataFrame(rows)
    table(val, 'v', ['id']).to_csv(R + 'feat_radar_validation.csv', index=False)
    tb = table(blocks, 'b', ['tile', 'r0', 'c0']); tb['priority_block'] = blocks.prio.values
    tb.to_csv(R + 'feat_radar.csv', index=False)
    ok = tb.hh_db.notna()
    print('blocks covered', int(ok.sum()), '/', len(tb), ' priority covered', int((ok & tb.priority_block).sum()), '/', int(tb.priority_block.sum()))

if __name__ == '__main__':
    main()
