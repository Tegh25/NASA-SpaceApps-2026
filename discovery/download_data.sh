#!/usr/bin/env bash
# Run this on YOUR Mac (Terminal), from inside the discovery/ folder:   bash download_data.sh
# Options:  --moon   also fetch a Moon polar elevation grid (LOLA, ~115 MB)
# No logins needed for anything in here. Re-running resumes/skips files already downloaded.
set -u
cd "$(dirname "$0")"
mkdir -p data/mars data/moon data/earth

get() {  # get <url> <output file>
  local url="$1" out="$2"
  if [ -s "$out" ]; then echo "have   $out"; return 0; fi
  echo "fetch  $out"
  if curl -fL --retry 3 -C - -o "$out.part" "$url"; then mv "$out.part" "$out"; else
    echo "  !! FAILED: $url   (skipping; tell Claude the error text)"; rm -f "$out.part"; return 1; fi
}

echo "== Mars: Jezero crater CTX DEM, 20 m/pixel (USGS, 87 MB, GeoTIFF with map projection inside) =="
get "https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif" \
    data/mars/jezero_ctx_dem_20m.tif

echo "== Earth control tiles (Copernicus GLO-30, 1 degree each, ~30 MB, no login) =="
base="https://copernicus-dem-30m.s3.amazonaws.com"
for t in "N37_00_E029_00:salda_turkiye" "S25_00_W070_00:yungay_atacama" "N75_00_W090_00:haughton_canada"; do
  code="${t%%:*}"; label="${t##*:}"; n="Copernicus_DSM_COG_10_${code}_DEM"
  get "$base/$n/$n.tif" "data/earth/$n.tif"
done

if [ "${1:-}" = "--moon" ]; then
  echo "== Moon: LOLA south-polar elevation, 40 m/pixel: a .LBL (text label) + .IMG (raw binary) pair =="
  m="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG"
  get "$m/LDEM_85S_40M.LBL" data/moon/LDEM_85S_40M.LBL
  get "$m/LDEM_85S_40M.IMG" data/moon/LDEM_85S_40M.IMG
fi

echo; echo "Done. Next:   python inspect_file.py data/"
