#!/usr/bin/env python3
"""Geology / lithology features from the Macrostrat API (no login needed).

Per block: centre + 4 points (N,S,E,W) 7 km away, rounded to a 0.05 deg grid
(deduped + cached in results/_geo_cache.jsonl, resumable).
Outputs: results/feat_geo.csv (tile,r0,c0,...) and results/feat_geo_validation.csv (id,...).
Usage: ./.venv/bin/python feat_geo.py [--max-minutes 25] [--threads 6]
"""
import sys, os, json, time, argparse, math
import numpy as np, pandas as pd, requests
from concurrent.futures import ThreadPoolExecutor

R = 'results/'
API = 'https://macrostrat.org/api/v2/geologic_units/map'
CACHE = R + '_geo_cache.jsonl'
LITHDEF = R + '_macro_liths.json'
GRID = 0.05
OFF_KM = 7.0
SCALE_RANK = {'large': 4, 'medium': 3, 'small': 2, 'tiny': 1}

# ---- lithology id -> category -------------------------------------------------
L = {x['lith_id']: x for x in json.load(open(LITHDEF))}
NAME = {i: x['name'] for i, x in L.items()}

def ids(*names):
    return {i for i, n in NAME.items() if n in names}

MAFIC_VOLC = ids('basalt', 'mafite', 'scoria', 'basanite', 'hawaiite', 'mugearite', 'ankaramite',
                 'hyaloclastite', 'spilite', 'tephrite')
ANORTH_GABBRO = ids('anorthosite', 'gabbro', 'norite', 'troctolite', 'diabase', 'dolerite', 'mafic',
                    'metagabbro', 'hornblendite')
FELSIC_PLUT = ids('granite', 'monzonite', 'granodiorite', 'syenite', 'diorite', 'tonalite', 'quartz monzonite',
                  'trondhjemite', 'monzogranite', 'syenogranite', 'leucogranite', 'aplite', 'pegmatite',
                  'alaskite', 'granophyre', 'charnockite')
ULTRAMAFIC = ids('peridotite', 'pyroxenite', 'dunite', 'komatiite', 'lherzolite', 'harzburgite', 'wehrlite',
                 'websterite', 'orthopyroxenite', 'clinopyroxenite', 'serpentinite', 'kimberlite', 'picrite')
UNCONS = ids('gravel', 'sand', 'silt', 'mud', 'clay', 'till', 'drift', 'loess', 'diamicton', 'alluvium',
             'colluvium', 'regolith', 'soil', 'paleosol', 'eluvium', 'laterite', 'peat', 'calcareous ooze',
             'siliceous ooze', 'gyttja', 'greensand')
VOLC_OTHER = {i for i, x in L.items() if x['type'] == 'volcanic'} - MAFIC_VOLC   # felsic/intermediate/generic volcanic
PLUT_GENERIC = ids('plutonic', 'igneous')

def categorise(lith_ids):
    """set of category names for one unit"""
    cats = set()
    for i in lith_ids:
        x = L.get(i)
        if x is None:
            continue
        n = x['name']
        if i in MAFIC_VOLC: cats.add('mafic_volcanic')
        elif i in ANORTH_GABBRO: cats.add('anorth_gabbro_mafic_plutonic')
        elif i in FELSIC_PLUT: cats.add('felsic_plutonic')
        elif i in ULTRAMAFIC: cats.add('ultramafic')
        elif i in UNCONS: cats.add('unconsolidated')
        elif x['type'] in ('carbonate', 'evaporite'): cats.add('carbonate_evaporite')
        elif x['class'] == 'metamorphic': cats.add('metamorphic')
        elif x['type'] == 'volcanic' or n == 'volcanic': cats.add('other_volcanic')   # rhyolite/andesite/ash/generic volcanic
        elif x['type'] == 'siliciclastic' or n in ('sedimentary',): cats.add('sedimentary_clastic')
        elif x['class'] == 'sedimentary': cats.add('sedimentary_other')   # chert, coal, ironstone ...
        elif x['type'] in ('plutonic', 'igneous'): cats.add('igneous_unspecified')
    return cats

def text_cats(txt):
    """keyword fallback on free-text lith string when ids are missing/generic"""
    t = (txt or '').lower(); c = set()
    if 'basalt' in t or 'mafic volc' in t: c.add('mafic_volcanic')
    if any(k in t for k in ('anorthosit', 'gabbro', 'norite', 'diabase', 'dolerite')): c.add('anorth_gabbro_mafic_plutonic')
    if any(k in t for k in ('granit', 'granodior', 'syenit', 'tonalit')): c.add('felsic_plutonic')
    return c

CATS = ['mafic_volcanic', 'anorth_gabbro_mafic_plutonic', 'felsic_plutonic', 'ultramafic', 'carbonate_evaporite',
        'sedimentary_clastic', 'metamorphic', 'unconsolidated', 'other_volcanic', 'igneous_unspecified', 'sedimentary_other']

# ---- API ----------------------------------------------------------------------
sess = requests.Session()

def fetch(key):
    lat, lng = key
    for attempt in range(4):
        try:
            r = sess.get(API, params=dict(lat=lat, lng=lng, response='long'), timeout=60)
            if r.status_code == 200:
                data = r.json()['success']['data']
                units = []
                for u in data:
                    units.append(dict(liths=u.get('liths') or [], lith=u.get('lith', ''), name=u.get('name', ''),
                                      scale=u.get('scale', ''), t=u.get('t_age'), b=u.get('b_age')))
                return key, units
            time.sleep(1 + attempt * 2)
        except Exception:
            time.sleep(1 + attempt * 2)
    return key, None   # failure -> not cached

def load_cache():
    c = {}
    if os.path.exists(CACHE):
        for ln in open(CACHE):
            try:
                k, u = json.loads(ln); c[tuple(k)] = u
            except Exception:
                pass
    return c

def pts(lat, lon):
    dlat = OFF_KM / 111.2
    dlon = OFF_KM / (111.2 * max(math.cos(math.radians(lat)), 0.05))
    P = [(lat, lon), (lat + dlat, lon), (lat - dlat, lon), (lat, lon + dlon), (lat, lon - dlon)]
    out = []
    for a, b in P:
        k = (round(round(a / GRID) * GRID, 3), round(round(b / GRID) * GRID, 3))
        if -90 < k[0] < 90 and k not in out:
            out.append(k)
    return out

def point_summary(units):
    """best (most detailed) scale only -> category fractions, ages, scale, lith text"""
    if not units:
        return None
    # only units that carry lithology info; then use the most detailed map scale that has any
    units = [u for u in units if (categorise(u['liths']) | text_cats(u['lith']))]
    if not units:
        return None
    best = max(SCALE_RANK.get(u['scale'], 0) for u in units)
    us = [u for u in units if SCALE_RANK.get(u['scale'], 0) == best]
    cnt = {c: 0 for c in CATS}; wt = {c: 0.0 for c in CATS}; texts = []; ages = []
    for u in us:
        cs = categorise(u['liths']) | text_cats(u['lith'])
        for c in cs: cnt[c] += 1; wt[c] += 1.0 / len(cs)
        t = u['lith'] or ', '.join(NAME.get(i, str(i)) for i in u['liths'])
        if t: texts.append(t)
        if u['t'] is not None and u['b'] is not None: ages.append((u['t'] + u['b']) / 2)
    # specific mafic/felsic categories override generic ones for the same unit set
    n = max(len(us), 1)
    return dict(frac={c: cnt[c] / n for c in CATS}, w={c: wt[c] / n for c in CATS}, texts=texts, age=float(np.mean(ages)) if ages else np.nan,
                scale=[k for k, v in SCALE_RANK.items() if v == best][0], n_units=len(us))

def block_features(keys, cache):
    S = [point_summary(cache.get(k)) for k in keys]
    S = [s for s in S if s]
    if not S:
        return None
    f = {c: float(np.mean([s['frac'][c] for s in S])) for c in CATS}
    w = {c: float(np.mean([s['w'][c] for s in S])) for c in CATS}   # unit mass split among its categories
    texts = {}
    for s in S:
        for t in s['texts']: texts[t] = texts.get(t, 0) + 1
    main = max(w, key=w.get)
    ages = [s['age'] for s in S if not np.isnan(s['age'])]
    scales = [s['scale'] for s in S]
    row = {}
    for c in CATS: row['frac_' + c] = f[c]
    row['lith_main'] = main
    row['lith_all'] = ';'.join(f'{c}:{w[c]:.2f}' for c in sorted(CATS, key=lambda c: -w[c]) if w[c] > 0)   # weights sum to 1
    row['lith_text'] = ' | '.join(sorted(texts, key=lambda t: -texts[t])[:6])
    T = 0.25   # a category "is present" when it covers >=25 % of the sampled units
    row['is_volcanic_basalt_mafic'] = int(f['mafic_volcanic'] >= T)
    row['is_anorthosite_gabbro_plutonic_mafic'] = int(f['anorth_gabbro_mafic_plutonic'] >= T)
    row['is_felsic_plutonic'] = int(f['felsic_plutonic'] >= T)
    row['is_ultramafic'] = int(f['ultramafic'] >= T)
    row['is_carbonate_evaporite'] = int(f['carbonate_evaporite'] >= T)
    row['is_sedimentary_clastic'] = int(f['sedimentary_clastic'] >= T)
    row['is_metamorphic'] = int(f['metamorphic'] >= T)
    row['is_unconsolidated'] = int(f['unconsolidated'] >= T)
    row['lunar_like_frac'] = min(1.0, f['mafic_volcanic'] + f['anorth_gabbro_mafic_plutonic'])
    row['lunar_like_lith'] = int(row['lunar_like_frac'] >= T)
    row['age_ma'] = float(np.mean(ages)) if ages else np.nan
    row['n_points_ok'] = len(S)
    row['best_scale'] = max(set(scales), key=lambda s: SCALE_RANK[s])
    return row

NUMCOLS = None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--max-minutes', type=float, default=25)
    ap.add_argument('--threads', type=int, default=6)
    ap.add_argument('--priority-only', action='store_true')
    a = ap.parse_args()
    t0 = time.time()
    blocks = pd.read_pickle(R + 'fine_blocks.pkl')[['tile', 'r0', 'c0', 'lat', 'lon']].reset_index(drop=True)
    ts = pd.read_csv(R + 'fine_terrain_scores.csv', usecols=['tile', 'lat', 'lon', 'moon', 'terrain_dist'])
    top = ts.sort_values('terrain_dist').groupby('moon').head(400)
    topkeys = set(zip(top.tile, top.lat.round(5), top.lon.round(5)))
    blocks['prio'] = [(t, round(la, 5), round(lo, 5)) in topkeys for t, la, lo in zip(blocks.tile, blocks.lat, blocks.lon)]
    print('priority blocks', int(blocks.prio.sum()), flush=True)
    val = pd.read_csv('validation_sites.csv')

    cache = load_cache()
    print('cache', len(cache), flush=True)
    need_keys = []
    seen = set()
    def add(lat, lon):
        for k in pts(lat, lon):
            if k not in cache and k not in seen:
                seen.add(k); need_keys.append(k)
    for _, r in val.iterrows(): add(r.lat, r.lon)
    order = pd.concat([blocks[blocks.prio], blocks[~blocks.prio]]) if not a.priority_only else blocks[blocks.prio]
    # sort non-priority by best terrain rank so partial runs favour better blocks
    best = ts.groupby(['tile', 'lat', 'lon']).terrain_dist.min().reset_index()
    best['k'] = list(zip(best.tile, best.lat.round(5), best.lon.round(5)))
    bd = dict(zip(best.k, best.terrain_dist))
    blocks['best_td'] = [bd.get((t, round(la, 5), round(lo, 5)), 9) for t, la, lo in zip(blocks.tile, blocks.lat, blocks.lon)]
    rest = blocks[~blocks.prio].sort_values('best_td')
    order = pd.concat([blocks[blocks.prio], rest]) if not a.priority_only else blocks[blocks.prio]
    for _, r in order.iterrows(): add(r.lat, r.lon)
    print('API points to fetch', len(need_keys), flush=True)

    fh = open(CACHE, 'a')
    done = 0; fails = 0
    chunk = 600
    with ThreadPoolExecutor(a.threads) as ex:
        for i in range(0, len(need_keys), chunk):
            if time.time() - t0 > a.max_minutes * 60:
                print('time box reached', flush=True); break
            for k, u in ex.map(fetch, need_keys[i:i + chunk]):
                if u is None: fails += 1; continue
                cache[k] = u; fh.write(json.dumps([list(k), u]) + '\n'); done += 1
            fh.flush()
            print(f'fetched {done} fails {fails} / {len(need_keys)}  t={time.time()-t0:.0f}s', flush=True)
    fh.close()

    def build(df, keycols):
        rows = []
        for _, r in df.iterrows():
            f = block_features(pts(r.lat, r.lon), cache)
            base = {c: r[c] for c in keycols}
            rows.append({**base, **(f if f else {})})
        out = pd.DataFrame(rows)
        return out

    gv = build(val, ['id'])
    gv.to_csv(R + 'feat_geo_validation.csv', index=False)
    gb = build(blocks, ['tile', 'r0', 'c0'])
    gb['priority_block'] = blocks.prio.values
    gb.to_csv(R + 'feat_geo.csv', index=False)
    ok = gb.lith_main.notna()
    print('blocks covered', int(ok.sum()), '/', len(gb), ' priority covered', int((ok & gb.priority_block).sum()), '/', int(gb.priority_block.sum()))
    print(gb.lith_main.value_counts().to_string())

if __name__ == '__main__':
    main()
