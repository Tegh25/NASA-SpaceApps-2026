#!/usr/bin/env bash
# Download the shortlisted Copernicus GLO-30 tiles (results/stage2_tiles.txt) into data/earth/. No login. Resumable.
cd "$(dirname "$0")"; mkdir -p data/earth
get() { code="$1"; ns=${code:0:1}; la=${code:1:2}; ew=${code:4:1}; lo=${code:5:3}
  n="Copernicus_DSM_COG_10_${ns}${la}_00_${ew}${lo}_00_DEM"; out="data/earth/$n.tif"
  [ -s "$out" ] && return 0
  curl -fsL --retry 3 -o "$out.part" "https://copernicus-dem-30m.s3.amazonaws.com/$n/$n.tif" && mv "$out.part" "$out" || { rm -f "$out.part"; echo "FAILED $code"; }; }
export -f get
xargs -P 8 -I{} bash -c 'get {}' < "${1:-results/stage2_tiles.txt}"
echo DONE; ls data/earth/*.tif | wc -l; du -sh data/earth
