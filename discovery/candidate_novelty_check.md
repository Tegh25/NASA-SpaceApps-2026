# Candidate novelty check (literature search, ~20 min, web search only)

**Read this first.** Absence of search hits is not proof of novelty. This was a time-boxed web search (general web search plus a few page fetches; English queries, plus one Chinese-language query). It did not include Google Scholar, ADS, Scopus, Russian/Spanish/Chinese-language journal databases, or conference proceedings beyond what the web search surfaced. Several relevant PDFs were blocked (HKU repository, PMC, the Open University catalogue PDF). Treat "nothing found" as "nothing found by this search".

The companion catalog is `known_analogs_v2.csv` (155 rows). Distances below are great-circle distances from the candidate block centre to the nearest catalog entry (the rows' `radius_km` are only a plausibility guess, so no candidate falls inside any catalog radius).

## Coordinate / label problems worth fixing before presenting

These matter because a reviewer who checks the labels will find them.

- **Region 3 label does not match the coordinates.** 73.8N, 23.7W is not Scoresby Sund, Liverpool Land or Jameson Land. Wikipedia places Scoresby Sund at about 70.5N 25W, Liverpool Land at 70.9N 22.2W and Jameson Land at 71.2N 23.5W, so the block is roughly 300+ km north of all three. By my own geography (not verified against a map) it is in the Kong Oscar Fjord / Kejser Franz Joseph Fjord part of the Greenland Caledonides. Please name it from a map, not from the three names above. All searches below were run for both the named places and the East Greenland area in general.
- **Region 5 label.** 46.7N 92.6E is in far-western Mongolia (Mongolian Altai / Gobi-Altai side). Tuva is much further north (Wikipedia: about 51.8N 94.75E, roughly 500+ km away).
- **Region 2a.** 36.73N 91.34E is about 150 km northwest of the Wikipedia centroid for Hoh Xil (35.38N 92.44E). It is on the Kunlun / Hoh Xil to Qaidam transition, not in the core Hoh Xil lake region. "Burhan Budai" is a range further east-southeast.
- **Region 1.** The two Andes blocks are in the Chilean Atacama Region / Argentine La Rioja-San Juan border area. I could not verify what lies at exactly -28.8, -69.3 (no gazetteer lookup was possible), so the place names "Pircas Negras" and "Laguna Brava" are approximate pointers only.

## Verdicts

| # | Region | Verdict | Nearest catalogued site |
|---|---|---|---|
| 1 | Frontal Cordillera / high Andes, ~-28.8,-69.3 and ~-29.6,-69.4 | **Found analog/planetary use in the same broader cordillera; nothing found for the exact blocks or for "Pircas Negras"** | Agua Negra rock glaciers, 152 km (1a) and 66 km (1b); Ojos del Salado ~200-290 km |
| 2a | Kunlun / Hoh Xil margin, ~36.7N 91.3E | **Nothing found** (adjacent Qaidam Basin is heavily used as a Mars analog) | Dalangtan, 186 km |
| 2b | Kunlun / Altyn-Tagh, south Taklimakan margin, ~36.6N 84.7E | **Nothing found** (only a weak Taklimakan astrobiology mention, 400+ km away) | Ruoqiang, 406 km |
| 3 | East Greenland, ~73.8N 23.7W | **Nothing found** for East Greenland; West Greenland (Kangerlussuaq) is established | Iceland sites ~940-1,020 km; Kangerlussuaq is in West Greenland |
| 4 | Western Tibet, Ngari / Zanda, ~31.3N 80.5E | **Nothing found** | Hanle, 219 km |
| 5 | Mongolian Altai, ~46.7N 92.6E | **Nothing found** for the Mongolian Altai; adjacent Mongolia and Russian Altai items only (tourism or generic permafrost) | Lop Nur yardangs, 744 km |

## 1. Frontal Cordillera / high Andes (Chile-Argentina)

**Verdict: found analog/planetary use in the neighbouring and same cordillera; nothing found for the specific blocks or for Pircas Negras.**

What was found:
- **Agua Negra basin, Argentine Frontal Cordillera (~30S).** A 2026 Europlanet Science Congress abstract (Bertoli et al., INAF Padova / IANIGLA) uses the Dos Lenguas rock glacier (upper Agua Negra basin) and the Morenas Coloradas rock glacier complex as terrestrial analogues for Martian glacier-like forms, with a March 2026 field campaign; DTMs were still being generated, so the work is preliminary. This is about 66 km from block 1b, so block 1b is not independent of existing analog work. https://meetingorganizer.copernicus.org/EPSC2026/EPSC2026-939.html
- **Ojos del Salado region (~-27.1, -68.5).** Multiple Mars-analog papers and campaigns, including EGU22 and EPSC2021 abstracts that cover Ojos del Salado, Laguna Verde, Tres Cruces and Salar de Maricunga. https://meetingorganizer.copernicus.org/EGU22/EGU22-587.html and https://meetingorganizer.copernicus.org/EPSC2021/EPSC2021-452.html . A Mars-analog study also reports that permafrost occurs there (patchy above 5,200 m, continuous above 5,600 m). https://arxiv.org/pdf/2005.14450
- **Salar de Pajonales (-25.14, -68.82).** Described as a Mars analog (Ca-sulfate salar, High Andes). https://www.frontiersin.org/articles/10.3389/fspas.2021.797591
- **Laguna Brava, La Rioja, Argentina (~4,500 m).** An ESA ExoMars page records ExoMars Project Scientist Jorge Vago visiting the Laguna Brava hydrothermal system in November 2010. The page does not itself say "Mars analog"; I am inferring interest from the context. https://exploration.esa.int/web/mars/-/47994-jorge-vago-in-laguna-brava
- **Puna / NW Argentina.** Europlanet lists Argentine Andes (Puna, Laguna Negra, rock glaciers above 4,500 m) as a planetary field analogue facility. https://www.europlanet.org/?p=14039
- **Frontal Cordillera permafrost / rock glacier science (not planetary).** Las Veguitas catchment (Argentina) rock glacier study (Frontiers in Earth Science 2025): https://www.frontiersin.org/articles/10.3389/feart.2025.1533336/full

What was searched and not found: "Pircas Negras" and "Paso de Pircas Negras" (with Mars / lunar / planetary analog), "Cordon de Santa Rosa", "Cordillera Frontal" with lunar analog, "Laguna Brava" with lunar. No hit tied these names to lunar analog use.

Implication: the *lunar-terrain statistics* angle is not found in the literature, but the region is not "unstudied" in planetary science: Agua Negra rock glaciers (Mars) and Ojos del Salado (Mars) sit within about 70-300 km. A safer claim is "a new quantified lunar-terrain match in a Mars-analog cordillera", not "new analog region".

## 2. Kunlun / Hoh Xil / Altyn-Tagh (Qinghai and Xinjiang)

**Verdict: nothing found for either block.**

What was searched: "Hoh Xil Kunlun Burhan Budai Mars analog OR lunar analog", "Altyn-Tagh Kunlun Taklimakan southern margin Mars analog", "Hoh Xil Kekexili permafrost thermokarst Mars analog", "Kunlun Mountains Mars analog glacier / planetary analog", "Tibetan Plateau lunar analog / Moon analog rover test", and a Chinese-language query (qinghai-xizang plateau, Mars, analog, Hoh Xil, Kunlun, Ngari).

What was found nearby (not the candidate blocks):
- **Western Qaidam Basin / Dalangtan** is an established Mars analog (HKU/CUG group, 2017 JGR-Planets review proposing Qaidam as a Martian analog; yardangs, polygons, salts). Dalangtan is 186 km from block 2a. https://repository.hku.hk/handle/10722/244904 and https://cab.inta-csic.es/publicaciones/dalangtan-playa-qaidam-basin-nw-china-its-microbial-life-and-physicochemical-characteristics-and-their-astrobiological-implications/
- **Lenghu "Mars camp" (Qinghai)** is a commercial/public analog base in the Qaidam red-rock area. https://news.cgtn.com/news/2020-01-02/Exploring-China-s-piece-of-Mars-on-Earth-MVxt5TnngI/index.html
- **Hoh Xil** appears only as a permafrost / thaw-slump study area (e.g. MDPI Remote Sensing 2025, https://www.mdpi.com/2072-4292/17/9/1614/html ), with no Mars or Moon framing in the results.
- **Ruoqiang, southern Taklimakan margin** appears in a 2007 Space.com piece on extreme-environment microbes with Mars relevance (not an analog-site designation). https://www.space.com/scienceastronomy/070403_st_life_limits.html . It is 406 km from block 2b.
- The Altyn Tagh and Kunlun ranges are the bounding mountains of Qaidam in the analog literature but only as geography.

Caveat: Chinese-language planetary-geology literature is poorly indexed by this search tool. A Chinese-language search on CNKI would be the main gap to close.

## 3. East Greenland (~73.8N 23.7W)

**Verdict: nothing found for East Greenland. West Greenland is established.**

What was searched: "Scoresby Sund Liverpool Land Jameson Land planetary analog Mars", "East Greenland Mars analogue field site astrobiology Kangerlussuaq OR Scoresby Sund OR Jameson Land OR Liverpool Land", "Greenland Moon analog OR lunar analogue Skaergaard OR East Greenland Mars analog basalt periglacial".

What was found elsewhere in Greenland:
- **Kangerlussuaq (West Greenland)** is a Europlanet TA1 planetary field analogue facility run by Aarhus University; used for biosignature, subglacial-drainage and polygon studies. https://europlanet-society.org/?p=8745 and https://universetoday.com/152862/greenlands-ice-sheet-is-similar-in-many-ways-to-the-solar-systems-icy-worlds-and-can-teach-us-how-to-search-for-life
- **Moriusaq / Station Nord (northern Greenland)** are described as lunar test beds for habitat design in an Arctic Today piece. https://www.arctictoday.com/?p=29982
- **Fiskenaesset Complex (SW Greenland)** is a spinel analogue to lunar material (JpGU 2025 abstract). https://confit.atlas.jp/guide/event/jpgu2025/subject/SMP26-03/date
- **West Greenland permafrost molards** as an analogue for Hale Crater ejecta-ice interaction (Icarus 2023). https://eprints.whiterose.ac.uk/193955/1/1-s2.0-S0019103522004559-main.pdf
- Geology of Jameson Land / Liverpool Land is documented in general-geology sources only, with no analog framing found. https://spitsbergen-svalbard.com/books-dvd-postcards/rocks-and-ice/geology-of-east-greenland/the-jameson-land-basin.html

Implication: Greenland as a whole is not "unstudied" as an analog, but the east coast around this block returned nothing.

## 4. Western Tibet, Ngari / Zanda (~31.3N 80.5E)

**Verdict: nothing found.**

What was searched: "Zanda Ngari western Tibet Mars analog OR planetary analog", "Zanda earth forest OR Zanda basin Tibet Mars-like landform yardang planetary", "Tibetan Plateau Mars analog Chang Tang / Qiangtang / Ngari glacier periglacial".

What was found: only the Qaidam Basin literature (north Tibetan Plateau), plus a travel listing for the Zanda Earth Forest (a tourism description of water and weathering in Tertiary sediments; no planetary framing). Nearest catalogued analog activity: ISRO's Ladakh sites (Hanle 219 km, Tso Kar 325 km, Leh 418 km) which are a human-analog / habitat programme, not a terrain-match programme. https://www.theweek.in/news/sci-tech/2025/08/01/locked-away-at-14000-feet-isro-kicks-off-10-day-analogue-space-survival-test.amp.html . I found no source saying Hanle itself is an ISRO analog site (it hosts the Indian Astronomical Observatory), so the `hanle` row in the catalog is low confidence.

## 5. Mongolian Altai / Tuva (~46.7N 92.6E)

**Verdict: nothing found for this region. Only adjacent or tourism-level items.**

What was searched: "Mongolian Altai Tuva Mars analog OR periglacial planetary analogue", "Altai Mountains Kosh-Agach Chuya Mars analog permafrost OR dry valley", "Mongolia Altai OR Khovsgol OR Tuva Mars analogue site MARS-V", "Mongolian Altai Khovd OR Bayan-Olgii OR Tuva Mars analogue OR planetary analogue OR lunar analogue geology permafrost", "Kyzyl-Chin Altai Mars".

What was found:
- **Northern Mongolia periglacial polygons** studied by a JAXA-affiliated team as a mid-latitude Mars analog (ice found at ~1.8 m): https://cosmos.isas.jaxa.jp/digging-in-mongolia-to-uncover-ice-on-mars/ . Exact site not stated; it is "northern Mongolia" near the southern permafrost limit, not the far-west Altai.
- **MARS-V**, a planned Mongolian Gobi Mars-analog test site (Dundgovi / Umnugovi): https://universemagazine.com/en/mars-v-rehearsal-for-life-on-the-red-planet/
- **Kyzyl-Chin "Altai Mars" (Russian Altai, near Kosh-Agach)** is described in tourism pages only; no scientific Mars-analog study was found. https://eugene.kaspersky.com/2020/09/21/the-martian-landscapes-of-the-altai-mountains/
- Altai/Khovd permafrost papers exist (e.g. National University of Mongolia 2025) but without planetary framing.

## Possible overlap with the project's own method

A 2026 student paper ("Finding Earth's Best Testbeds for Moon and Mars Rovers: A Quantitative Terrain Comparison", NHSJS) also ranks Earth sites against Moon/Mars terrain using image-texture descriptors, and reports that established analog regions such as Devon Island rank among the closest matches. I could not retrieve its full text (the PDF link 404'd), so I do not know which sites it ranks. Worth reading before claiming the approach is unprecedented. https://nhsjs.com/?p=41960

## Summary of searches

All verdicts rest on roughly 25 web searches and about 12 page fetches. No result was a gazetteer or Google Scholar query. Where I wrote "nothing found" the engine returned either only unrelated or only adjacent-region material.
