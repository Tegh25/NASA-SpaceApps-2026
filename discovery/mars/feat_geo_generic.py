#!/usr/bin/env python3
"""Generic Macrostrat geology / lithology features for ANY list of Earth blocks (Mars-analog oriented).

Usage (run from mars/):
  ../.venv/bin/python feat_geo_generic.py --blocks results/test_blocks.csv --out results/test_geo.csv
                                         [--threads 4] [--off-km 10] [--max-minutes 0]

Input CSV: columns id,lat,lon  (block = 30x30 km square centred on lat,lon).
Sampling: block centre + 4 points (N,S,E,W) --off-km (default 10 km) from the centre. Every point is snapped
to a 0.05 deg grid, de-duplicated across ALL blocks, and queried once against the Macrostrat API
(https://macrostrat.org/api/v2/geologic_units/map, anonymous, CC-BY 4.0). Resumable cache:
results/_geo_cache.jsonl (separate from the Moon cache). Failed calls are not cached, just re-run.

Per sampled point only the most detailed map scale that carries any lithology is used
(best_scale: large > medium > small > tiny). Each map unit has unit mass 1 that is split equally over
the lithology classes it contains; masses are averaged over the sampled points, so the class
fractions of a block sum to 1 (when n_points_ok > 0).

Output columns
  id, lat, lon
  lith_main   class with the largest fraction
  lith_all    "class:fraction;..." sorted descending, only fractions > 0
  lith_text   raw Macrostrat lithology strings of the most frequent units (up to 6)
  frac_<class> for the 11 classes below
  age_ma      mean of unit mid-ages (Ma) over sampled units
  best_scale  best map scale found over the points
  n_points_ok number of distinct snapped points (of max 5) that returned lithology

Classes
  mafic_volcanic            basalt, scoria, mafite, basanite, hawaiite, hyaloclastite, spilite ... plus mafic
                            intrusives (gabbro, diabase/dolerite, norite, troctolite, anorthosite, generic 'mafic')
  felsic_volcanic_plutonic  rhyolite, dacite, andesite, trachyte, tuff, ignimbrite, ash, obsidian, granite,
                            granodiorite, diorite, syenite ..., and the GENERIC 'volcanic' / 'plutonic' / 'igneous'
                            (generic igneous is assumed felsic-intermediate, the usual case at 1:5M scale)
  ultramafic                peridotite, dunite, pyroxenite, komatiite, kimberlite, serpentinite ...
  clay_rich_sedimentary     shale, mudstone, claystone, clay, mud, argillite, pelite, bentonite
  evaporite                 gypsum, halite, anhydrite, trona, 'evaporite' (+ text: playa, salar, salt)
  carbonate                 limestone, dolomite, marl, chalk, travertine, carbonatite ...
  sand_eolian               sand, loess (+ text: dune, eolian/aeolian)
  alluvium_unconsolidated   alluvium, colluvium, gravel, till, drift, diamicton, regolith, soil, peat, ooze
  siliciclastic_other       sandstone, siltstone, conglomerate, greywacke, arkose, breccia, volcaniclastic,
                            generic 'siliciclastic' / 'sedimentary'
  metamorphic               gneiss, schist, quartzite, marble, slate, amphibolite, greenstone, metabasalt ...
  other                     chert, ironstone, coal, phosphorite, diatomite, anything not recognised
"""
import os, sys, json, time, math, argparse
import numpy as np, pandas as pd, requests
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, 'results')
os.makedirs(R, exist_ok=True)
API = 'https://macrostrat.org/api/v2/geologic_units/map'
LITH_API = 'https://macrostrat.org/api/v2/defs/lithologies?all=true'
CACHE = os.path.join(R, '_geo_cache.jsonl')
LITHDEF = os.path.join(R, '_macro_liths.json')
GRID = 0.05
SCALE_RANK = {'large': 4, 'medium': 3, 'small': 2, 'tiny': 1}
CLASSES = ['mafic_volcanic', 'felsic_volcanic_plutonic', 'ultramafic', 'clay_rich_sedimentary', 'evaporite',
           'carbonate', 'sand_eolian', 'alluvium_unconsolidated', 'siliciclastic_other', 'metamorphic', 'other']

sess = requests.Session()
sess.headers['User-Agent'] = 'generic-geo-feature-script/1.0'


def load_liths():
    if not os.path.exists(LITHDEF):
        js = sess.get(LITH_API, timeout=60).json()['success']['data']
        json.dump(js, open(LITHDEF, 'w'))
    return {x['lith_id']: x for x in json.load(open(LITHDEF))}


L = load_liths()
NAME = {i: x['name'] for i, x in L.items()}


def ids(*names):
    return {i for i, n in NAME.items() if n in names}


MAFIC = ids('basalt', 'mafite', 'scoria', 'basanite', 'hawaiite', 'mugearite', 'ankaramite', 'hyaloclastite', 'spilite',
            'tephrite', 'anorthosite', 'gabbro', 'norite', 'troctolite', 'diabase', 'dolerite', 'mafic', 'hornblendite')
ULTRA = ids('peridotite', 'pyroxenite', 'dunite', 'komatiite', 'lherzolite', 'harzburgite', 'wehrlite', 'websterite',
            'orthopyroxenite', 'clinopyroxenite', 'serpentinite', 'kimberlite', 'picrite')
CLAY = ids('shale', 'mudstone', 'claystone', 'clay', 'mud', 'argillite', 'pelite', 'bentonite')
SAND = ids('sand', 'loess')
ALLUV = ids('gravel', 'till', 'drift', 'diamicton', 'alluvium', 'colluvium', 'regolith', 'soil', 'paleosol', 'eluvium',
            'laterite', 'peat', 'calcareous ooze', 'siliceous ooze', 'gyttja', 'greensand')
CARB_EXTRA = ids('carbonatite')
OTHER_NAMES = ids('chert', 'phosphorite', 'ironstone', 'iron formation', 'diatomite', 'bauxite', 'flint', 'novaculite',
                  'radiolarite', 'porcellanite', 'coal', 'lignite', 'anthracite', 'tar', 'lamprophyre', 'foidolite')


GENERIC_IGN = ids('volcanic', 'plutonic', 'igneous')


def classify_ids(lith_ids):
    cats = set()
    for i in lith_ids:
        x = L.get(i)
        if x is None:
            continue
        if i in MAFIC: cats.add('mafic_volcanic')
        elif i in ULTRA: cats.add('ultramafic')
        elif i in CLAY: cats.add('clay_rich_sedimentary')
        elif i in SAND: cats.add('sand_eolian')
        elif i in ALLUV: cats.add('alluvium_unconsolidated')
        elif i in CARB_EXTRA or x['type'] == 'carbonate': cats.add('carbonate')
        elif x['type'] == 'evaporite': cats.add('evaporite')
        elif i in OTHER_NAMES: cats.add('other')
        elif x['class'] == 'metamorphic': cats.add('metamorphic')
        elif i in GENERIC_IGN: cats.add('_generic_igneous')   # resolved in unit_classes()
        elif x['type'] in ('volcanic', 'plutonic', 'igneous'): cats.add('felsic_volcanic_plutonic')
        elif x['type'] in ('siliciclastic', 'sedimentary'): cats.add('siliciclastic_other')
        elif x['class'] == 'sedimentary': cats.add('other')
    return cats


def classify_text(txt):
    """keyword add-ons (dune/playa/salar have no lith id) and fallback when ids are missing."""
    t = (txt or '').lower(); c = set()
    if any(k in t for k in ('dune', 'eolian', 'aeolian', 'loess')): c.add('sand_eolian')
    if any(k in t for k in ('playa', 'salar', 'salt ', 'saline', 'evaporit', 'gypsum', 'halite')): c.add('evaporite')
    if any(k in t for k in ('alluv', 'colluv', 'unconsolidated')): c.add('alluvium_unconsolidated')
    return c


def classify_text_fallback(txt):
    t = (txt or '').lower(); c = set()
    if any(k in t for k in ('basalt', 'gabbro', 'diabase', 'dolerite', 'mafic', 'lava flow')): c.add('mafic_volcanic')
    if any(k in t for k in ('granit', 'rhyol', 'andesit', 'dacit', 'tuff', 'volcanic', 'syenit', 'tonalit', 'diorit')): c.add('felsic_volcanic_plutonic')
    if any(k in t for k in ('shale', 'mudstone', 'claystone', 'clay')): c.add('clay_rich_sedimentary')
    if any(k in t for k in ('limestone', 'dolom', 'carbonat', 'marl', 'chalk')): c.add('carbonate')
    if any(k in t for k in ('sandstone', 'siltstone', 'conglomerate', 'sedimentary')): c.add('siliciclastic_other')
    if any(k in t for k in ('gneiss', 'schist', 'metamorph', 'quartzite', 'marble', 'slate')): c.add('metamorphic')
    return c


def unit_classes(u):
    txt = (u.get('lith') or '') + ' ' + (u.get('name') or '')
    cs = classify_ids(u['liths']) | classify_text(txt)
    if '_generic_igneous' in cs:   # generic 'volcanic/plutonic/igneous': let the free text say basalt/granite etc., else felsic
        cs.discard('_generic_igneous')
        tc = classify_text_fallback(txt) & {'mafic_volcanic', 'felsic_volcanic_plutonic'}
        cs |= tc or {'felsic_volcanic_plutonic'}
    if not cs:
        cs = classify_text_fallback(txt)
    return cs


def fetch(key):
    lat, lng = key
    for attempt in range(4):
        try:
            r = sess.get(API, params=dict(lat=lat, lng=lng, response='long'), timeout=60)
            if r.status_code == 200:
                data = r.json()['success']['data']
                return key, [dict(liths=u.get('liths') or [], lith=u.get('lith', ''), name=u.get('name', ''),
                                  scale=u.get('scale', ''), t=u.get('t_age'), b=u.get('b_age')) for u in data]
            time.sleep(1 + attempt * 2)
        except Exception:
            time.sleep(1 + attempt * 2)
    return key, None  # failure -> not cached


def load_cache():
    c = {}
    if os.path.exists(CACHE):
        for ln in open(CACHE):
            try:
                k, u = json.loads(ln); c[tuple(k)] = u
            except Exception:
                pass
    return c


def snap(a, b):
    return (round(round(a / GRID) * GRID, 3), round(round(b / GRID) * GRID, 3))


def pts(lat, lon, off_km):
    dlat = off_km / 111.2
    dlon = off_km / (111.2 * max(math.cos(math.radians(lat)), 0.05))
    P = [(lat, lon), (lat + dlat, lon), (lat - dlat, lon), (lat, lon + dlon), (lat, lon - dlon)]
    out = []
    for a, b in P:
        k = snap(a, ((b + 180) % 360) - 180)
        if -90 < k[0] < 90 and k not in out:
            out.append(k)
    return out


def point_summary(units):
    if not units:
        return None
    us = [(u, unit_classes(u)) for u in units]
    us = [(u, c) for u, c in us if c]
    if not us:
        return None
    best = max(SCALE_RANK.get(u['scale'], 0) for u, _ in us)
    us = [(u, c) for u, c in us if SCALE_RANK.get(u['scale'], 0) == best]
    w = {c: 0.0 for c in CLASSES}; texts = []; ages = []
    for u, cs in us:
        for c in cs: w[c] += 1.0 / len(cs)
        t = u['lith'] or ', '.join(NAME.get(i, str(i)) for i in u['liths'])
        if t: texts.append(t)
        if u['t'] is not None and u['b'] is not None: ages.append((u['t'] + u['b']) / 2)
    n = len(us)
    return dict(w={c: w[c] / n for c in CLASSES}, texts=texts, age=float(np.mean(ages)) if ages else np.nan,
                scale=[k for k, v in SCALE_RANK.items() if v == best][0])


def block_features(keys, cache):
    S = [point_summary(cache.get(k)) for k in keys]
    S = [s for s in S if s]
    row = {('frac_' + c): np.nan for c in CLASSES}
    row.update(lith_main=None, lith_all=None, lith_text=None, age_ma=np.nan, best_scale=None, n_points_ok=len(S))
    if not S:
        return row
    f = {c: float(np.mean([s['w'][c] for s in S])) for c in CLASSES}
    for c in CLASSES: row['frac_' + c] = f[c]
    row['lith_main'] = max(f, key=f.get)
    row['lith_all'] = ';'.join(f'{c}:{f[c]:.2f}' for c in sorted(CLASSES, key=lambda c: -f[c]) if f[c] > 0)
    tx = {}
    for s in S:
        for t in s['texts']: tx[t] = tx.get(t, 0) + 1
    row['lith_text'] = ' | '.join(sorted(tx, key=lambda t: -tx[t])[:6])
    ages = [s['age'] for s in S if not np.isnan(s['age'])]
    row['age_ma'] = float(np.mean(ages)) if ages else np.nan
    row['best_scale'] = max((s['scale'] for s in S), key=lambda s: SCALE_RANK[s])
    return row


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--blocks', required=True, help='CSV with columns id,lat,lon')
    ap.add_argument('--out', required=True)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--off-km', type=float, default=10.0)
    ap.add_argument('--max-minutes', type=float, default=0, help='stop fetching after N minutes (0 = no limit); rerun resumes')
    ap.add_argument('--pause', type=float, default=0.05, help='sleep (s) after each call per thread (politeness)')
    a = ap.parse_args()
    t0 = time.time()
    blocks = pd.read_csv(a.blocks)[['id', 'lat', 'lon']]
    cache = load_cache()
    need, seen = [], set()
    for _, r in blocks.iterrows():
        for k in pts(r.lat, r.lon, a.off_km):
            if k not in cache and k not in seen:
                seen.add(k); need.append(k)
    print(f'blocks {len(blocks)}  cache {len(cache)}  new API points {len(need)}', flush=True)

    def f(k):
        out = fetch(k); time.sleep(a.pause); return out

    done = fails = 0
    chunk = 200
    with open(CACHE, 'a') as fh, ThreadPoolExecutor(a.threads) as ex:
        for i in range(0, len(need), chunk):
            if a.max_minutes and time.time() - t0 > a.max_minutes * 60:
                print('time box reached; rerun to resume', flush=True); break
            for k, u in ex.map(f, need[i:i + chunk]):
                if u is None: fails += 1; continue
                cache[k] = u; fh.write(json.dumps([list(k), u]) + '\n'); done += 1
            fh.flush()
            print(f'fetched {done} fails {fails} / {len(need)}  t={time.time()-t0:.0f}s', flush=True)
    rows = []
    for _, r in blocks.iterrows():
        rows.append({'id': r.id, 'lat': r.lat, 'lon': r.lon, **block_features(pts(r.lat, r.lon, a.off_km), cache)})
    out = pd.DataFrame(rows)
    cols = ['id', 'lat', 'lon', 'lith_main', 'lith_all', 'lith_text'] + ['frac_' + c for c in CLASSES] + ['age_ma', 'best_scale', 'n_points_ok']
    out[cols].to_csv(a.out, index=False)
    print(f'wrote {a.out}: {len(out)} rows, lithology for {int(out.lith_main.notna().sum())}, {time.time()-t0:.1f}s total', flush=True)


if __name__ == '__main__':
    main()
