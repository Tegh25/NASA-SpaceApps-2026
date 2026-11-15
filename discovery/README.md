# Discovery: finding Earth analogs for Moon and Mars sites

Data-side work for the NASA Space Apps challenge "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars".
The question: where on Earth does the terrain, climate and surface resemble the Artemis III lunar south-pole regions (and later Mars exploration sites), and which of those places are not already known analogs?

Raw data is **not** stored in this repository (it is several GB). Scripts download what they need; see `download_*.sh`.

## Layout
- `common.py` shared terrain functions (slope, roughness, hillshade, histograms), same code for every planetary body
- `moon_regions.py` fingerprints of the 9 Artemis III regions (LRO LOLA terrain, Diviner temperature and ice)
- `screen_*.py`, `refine_earth.py`, `rank_candidates.py` staged search over Earth (climate screen, coarse terrain, 40 m terrain, gates)
- `feat_*.py` extra feature families (multi-scale roughness, shadow structure, MODIS temperature, geology, radar)
- `v3_*.py` multi-category scoring, validation, ablation and stability tests
- `validate.py`, `known_analogs*.csv` validation sites and the catalog used to enforce "new places only"
- `results/` small result tables and JSON (`v3_final_table.csv` is the Moon candidate table)
- `previews/` Moon vs Earth twin views and satellite contact sheets
- `mars/` the same approach for Mars (kept separate)
- `FINDINGS.md`, `HANDOFF.md`, `mars/MARS_FINDINGS.md` write-ups with method, tests and caveats

## AI-use note
Parts of this pipeline were written with AI assistance (Claude Code), including several helper agents for data scouting, feature extraction and literature checks. All numbers in the result files come from running the scripts on public data; novelty claims are limited to the searches described in the write-ups.
