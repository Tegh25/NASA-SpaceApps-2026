#!/usr/bin/env bash
# Moon data used by moon_regions.py (~1.07 GB, no login). Run from discovery/:  bash download_moon.sh
cd "$(dirname "$0")"; mkdir -p data/moon/regions
m=https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG
curl -fsL -o data/moon/LDEM_80S_40M.LBL $m/LDEM_80S_40M.LBL
curl -fL --retry 5 -C - -o data/moon/LDEM_80S_40M.IMG $m/LDEM_80S_40M.IMG
curl -fL --retry 5 -C - -o data/moon/dlre_prp_south.tab https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab
# USGS Artemis III region outlines (lon/lat, 9 regions)
curl -fsL -o data/moon/regions/a3.zip "https://www.sciencebase.gov/catalog/file/get/671a6fa8d34efed5620f89f8?name=A3_9regions-lonlat-simplified.zip" && unzip -o -q data/moon/regions/a3.zip -d data/moon/regions
# WorldClim 2.1 (climate), used by screen_climate.py / rank_candidates.py
mkdir -p data/earth/worldclim
for f in wc2.1_10m_bio wc2.1_10m_elev; do curl -fsL -o data/earth/worldclim/$f.zip https://geodata.ucdavis.edu/climate/worldclim/2_1/base/$f.zip && unzip -o -q data/earth/worldclim/$f.zip -d data/earth/worldclim; done
