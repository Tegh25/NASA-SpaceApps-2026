# Novelty / literature check, round 2

Builds on `candidate_novelty_check.md` (round 1) and `known_analogs_v2.csv`. New catalog rows are in `known_analogs_v3_additions.csv` (11 rows, mostly low/medium confidence; all approximate coordinates are flagged in the row names).

## Read this first: what this check could and could not do

- **No page was opened directly.** In this session WebFetch refused every domain it was given (nominatim.openstreetmap.org, en.wikipedia.org, nhsjs.com, arxiv.org) with "Unable to verify if domain ... is safe to fetch", and outbound `curl` from the shell timed out on DNS. The only working tool was WebSearch (standard mode), which returns a short summary of each result plus URLs.
- So every URL below is one that **a WebSearch result returned and summarised**, not a page I read myself. Where I quote a number (coordinates, 10 images per body, etc.) it is from those summaries. The URLs are real search hits, but please spot-check the ones you plan to cite on a slide.
- **Nominatim / GeoNames could not be used.** Place names are therefore built from (a) coordinates that search results gave for named features (Pircas Negras Pass, King Oscar Fjord, Kaiser Franz Joseph Fjord, Muskox Fjord, Traill Island), and (b) my own recollection of the coordinates of towns and peaks (Tingri, Shigatse, Lhatse, Dinggye, Sakya, Everest, Gyirong, Zanda, Gerze, Rutog, Nyima, Kailash, Manasarovar, Muztagh Ata, Karakuli Lake, Tashkurgan, Khovd, Bayankhongor, Cele, Niya, Qiemo, Golmud). Those recalled coordinates are approximate (a few km to tens of km) and unverified. Distances are great-circle, computed in Python from those coordinates; they are good to roughly +/- 10-20 km.
- Absence of results is not proof of novelty. Chinese-language planetary-geology literature (CNKI, Wanfang) and Russian-language journals are not indexed by this search tool; I ran Chinese and Russian and Spanish queries but they returned almost entirely English-language Qaidam material.
- Search language coverage: English; Chinese (类火星, 火星类比, 月球模拟/类比, with 西藏/阿里/羌塘/日喀则/珠峰/昆仑/阿尔金/可可西里/阿尔泰/蒙古); Russian (аналог Марса/Луны, Алтай/Монголия/Памир/Тибет); Spanish (análogo marciano/lunar, Cordillera Frontal, glaciares de roca).

## Summary table

| Region | Accurate place (see per-region notes) | Verdict | Nearest known analog use (great-circle) |
|---|---|---|---|
| A. High Andes, Chile-Argentina | Border zone about 50-75 km S of Paso de Pircas Negras (Frontal Cordillera / Atacama-La Rioja border). Exact named peak/valley not verified | **Adjacent use only** (Mars; lunar angle only in Puna domes ~650 km away) | Ojos del Salado 175-200 km; Tres Cruces 170-190 km; Maricunga 175-200 km; Agua Negra rock glaciers 160-185 km |
| B. Southern Tibet N of Himalaya | Shigatse Prefecture: Tingri / Dinggye / Sakya counties, Tethyan Himalaya north of Everest-Makalu | **Nothing found** | Lower Mustang (Nepal, Mars Medics 2019) about 270 km; Ladakh sites 850-1100 km |
| C. Pamir / Kunlun-Karakoram junction | Eastern Pamir, Akto/Tashkurgan area, Xinjiang, about 30 km from Muztagh Ata and Karakuli Lake | **Nothing found** | Karakul impact structure (Tajikistan) about 145 km, but it is a geology curiosity, not an analog site; Tso Kar 615 km |
| D. Ngari / Changtang | D1 northern Ngari; D2 between Zanda and Kailash; D3 Gerze area; D4 Nyima area (details below) | **Nothing found** | Hanle 208-430 km (D1-D3), Tso Kar 316-534 km, Leh 406-604 km; D4 is 728 km from Hanle |
| E. Kunlun / Hoh Xil margin | Eastern Kunlun, south margin of the Qaidam, Haixi Prefecture, Qinghai | **Adjacent use only** | Dalangtan 187 km; Lenghu Mars Camp 271 km; Kumtag Chang'e-3 rover ground about 405 km |
| F. W. Mongolia / Gobi-Altai | F1 Mongolian Altai, Khovd province (about 120 km from Khovd city); F2 Gobi-Altai / Bayankhongor side (about 335 km from Khovd) | **Nothing found** | N. Mongolia periglacial Mars-analog study (location approximate, several hundred km); MARS-V 840-1060 km |
| G. Altyn-Tagh / S Taklimakan margin | Kunlun/Altyn interior south of Niya and Qiemo, probably in the Altun Shan Nature Reserve area; north slope of Kunlun is further north | **Nothing found** | Ruoqiang 406 km; Dalangtan 625 km |
| H. East Greenland | Muskox Fjord / Hudson Land, Kejser Franz Joseph Fjord system, Northeast Greenland National Park | **Nothing found** | Station Nord (lunar habitat siting) about 880 km; Kangerlussuaq about 1240 km; Askja (Iceland) about 1010 km |

## What changes our claims

1. **Do not say "new analog region" for A, E or G without qualification.** A sits 160-200 km from three separately documented Andean Mars-analog areas; E and G sit on the same plateau and the same ring of ranges as the heavily studied Qaidam Basin. A safer framing: "a quantitative lunar-terrain match in a region where only Mars analog work exists."
2. **B, C, D, F, H are the strongest "nothing found" cases**, but "nothing found by this search" is all that can be said. D and B are the best story: large Tibetan-Plateau areas with no analog use found, nearest ISRO/Ladakh work 200+ km away.
3. **Round 1 mislabelled region H.** It is not Scoresby Sund, Liverpool Land or Jameson Land (those are ~300+ km south). It is within about 26 km of Muskox Fjord (73.63N 23.17W, per a Wikipedia mirror seen in search results) and about 58 km from the centre point of Kaiser/Kejser Franz Joseph Fjord (73.45N 25.0W). Hudson Land is described as the land north of Muskox Fjord, so the block is Hudson Land / Muskox Fjord area (the Wikipedia mirror says Muskox Fjord separates Hudson Land in the north from the Gauss Peninsula in the south). The block is inside Northeast Greenland National Park, where access is permit-regulated (travel source), which matters for any "test site" claim.
4. **The "nobody has done a systematic data-driven search of Earth" claim is not safe.** At least one 2026 paper does a quantitative ranking of Earth sites against Moon and Mars terrain (NHSJS, below), though its scale and method are much smaller than ours. See the last section.
5. **A lunar-specific Andean precedent exists**, so the Andes are not only a Mars region: Flahaut and colleagues (EPSC2020-756) use Central Andean domes as an analog for lunar silicic constructs, and an EuroMoonMars/University of Atacama campaign (EPSC2021-452) covers Maricunga, Tres Cruces, Laguna Verde and Ojos del Salado with a stated long-term goal of an analog base in the Puna de Atacama.

---

## A. High Andes, Chile-Argentina border: (-28.54,-69.28), (-28.72,-69.39), (-28.45,-69.59)

**Name.** The only verified anchor is Paso de Pircas Negras at 28.067S 69.300W (Wikipedia mirrors, via search; 4,164 m, border crossing). The three blocks are 51-73 km south of it. They are in the high Andes along the Atacama (Chile) / La Rioja-Catamarca (Argentina) border zone, in the Frontal Cordillera sector. I could not determine which blocks are on which side of the border, nor name specific peaks or valleys; Laguna Brava (La Rioja) is nearby by my recollection, but I could not verify its coordinates (the v3 CSV row is approximate). Las Tolas and the Cordillera de Santa Rosa searches returned nothing locating them, so I do not use those names. Treat any place label for these blocks as approximate.

**Searched.** "Pircas Negras / Laguna Brava / Frontal Cordillera" with Mars/lunar/planetary analog; Cerro Tres Cruces / Paso de San Francisco / Maricunga with analog; Las Tolas / Cordillera de Santa Rosa / Paso de Pircas Negras with geologia / glaciar rocoso; Spanish "analogo marciano / analogo lunar" with Cordillera Frontal / Agua Negra / Laguna Brava / Puna; "lunar" with Atacama / Puna rover/simulant/south pole; EPSC2022-276 detail.

**Findings.**
- No result ties Pircas Negras, Las Tolas, Cordillera de Santa Rosa or the specific blocks to any planetary use.
- Ojos del Salado / Tres Cruces / Laguna Verde / Maricunga: EuroMoonMars + Universidad de Atacama campaign, "assessing the Puna de Atacama in terms of planetary analogs", with a stated long-term goal of an analog base. https://meetingorganizer.copernicus.org/EPSC2021/EPSC2021-452.html ; Ojos del Salado as a Mars analog candidate (EPSC2018): https://meetingorganizer.copernicus.org/EPSC2018/EPSC2018-216.pdf ; Raman/UV-Vis work: https://meetingorganizer.copernicus.org/EGU22/EGU22-587.html
- Atacama general review as a Mars analog and technology test bed (rovers, instruments): https://doi.org/10.3389/fspas.2021.810426
- Central Andean volcanic geoforms (Altiplano-Puna Volcanic Complex) as Mars analogs for lava rheology: https://meetingorganizer.copernicus.org/EPSC2022/EPSC2022-276.html (the summary did not mention Ojos del Salado or Tres Cruces; APVC is about 650 km north of block A).
- **Lunar angle:** Andean domes as analogs for lunar silicic constructs: https://meetingorganizer.copernicus.org/EPSC2020/EPSC2020-756.html
- Laguna Brava hydrothermal system visited by ExoMars project scientist (2010); the page does not say "analog": https://exploration.esa.int/web/mars/-/47994-jorge-vago-in-laguna-brava
- Agua Negra rock glaciers as Mars analogs (round 1, EPSC2026-939): https://meetingorganizer.copernicus.org/EPSC2026/EPSC2026-939.html
- Frontal Cordillera permafrost/rock glacier science exists but without planetary framing, e.g. Dry Andes Rodeo basin 2026 (https://tc.copernicus.org/articles/20/2257/2026/) and Las Veguitas (round 1).
- Puna de Atacama / Argentine Puna lakes as Mars analogs (Europlanet): https://europlanet-society.org/?p=16880

**Adjacent sites.** Pircas Negras Pass 51-73 km (location marker only); Ojos del Salado 175-198 km; Tres Cruces 170-192 km; Maricunga 174-199 km; Laguna Verde 198-221 km; Agua Negra rock glaciers 159-185 km; Salar de Pajonales 376-402 km; Atacama core/Yungay about 500 km.

**Verdict: adjacent use only.**

---

## B. Southern Tibet north of the Himalaya: (28.10,87.82), (28.82,86.51), (28.73,87.72)

**Name (from recalled gazetteer coordinates; not verified).** All three lie in Shigatse Prefecture of the Tibet Autonomous Region on the northern side of the Himalayan crest, in the Tethyan Himalaya / Yarlung Tsangpo-Himalaya belt:
- B1 (28.10,87.82): about 30 km from Dinggye (Tingkye) county town; 88 km from Mt Qomolangma/Everest; 93 km from Tingri.
- B2 (28.82,86.51): about 62 km from Tingri (Dingri) town in the Tingri basin; 101 km from Everest; 118 km from Gyirong.
- B3 (28.73,87.72): about 35 km from Sakya and 40 km from both Lhatse and Dinggye; 128 km from Shigatse.
(Yarlung Tsangpo main stem runs just north of B3 near Lhatse; headwaters are far to the west, near Mt Kailash, about 500 km away.)

**Searched.** "Tingri Dingri Tibet Mars analog / planetary analog / Mars-like"; Chinese 类火星 西藏 / 火星类比 日喀则 / 珠穆朗玛峰 定日 日喀则 雅鲁藏布江 火星 月球 训练 基地; Himalaya/Spiti/Mustang Nepal Mars analogue.

**Findings.**
- No planetary-analog, astronaut-training or rover test use of Tingri, Dinggye, Sakya, Lhatse, Shigatse or the Everest north side found. Searches returned only Qaidam Basin material (not southern Tibet).
- Nearest documented Himalayan analog activity: **Lower Mustang, Nepal**, a 2019 Mars Academy USA "Mars Medics" analog mission at about 10,000 ft after scouting for Mars-like terrain: https://iafastro.directory/iac/archive/browse/IAC-19/A1/4/50533/ (Kagbeni area, roughly 270 km west of B2; abstract only).
- Ladakh Mars-analog framing paper (rock glaciers, dunes, drainage, basalts, saline lakes; names Tso Kar, Pangong Tso, Hanle): https://www.jpsonline.co.in/index.php/jop/article/download/24/20/24 ; Mars Society Australia / Birbal Sahni Institute 2016 Spaceward Bound expedition in Ladakh: https://marssociety.org.au/node/1760
- "Upper Mustang looks like Mars" pieces are travel writing only.
- Chinese news on Mars simulation bases refers only to Qinghai (Qaidam), e.g. https://www.inverse.com/science/35366-chinese-select-site-for-mars-simulation-colony

**Adjacent sites.** Mustang about 270 km; Ladakh (Hanle 845-996 km, Tso Kar 953-1103 km); Qaidam Dalangtan about 1,200 km.

**Verdict: nothing found.**

---

## C. Pamir / Kunlun-Karakoram junction: (38.19,74.80)

**Name (recalled coordinates).** Eastern Pamir, Xinjiang (Kizilsu / Kashgar prefectures, Akto or Tashkurgan county area): 29 km from Muztagh Ata (38.28N 75.11E), 34 km from Karakuli (Karakul) Lake in China (38.43N 75.05E), 60 km from Tashkurgan, 176 km from Kashgar. The block lies west-southwest of Muztagh Ata, between the Muztagh Ata/Kongur massif and the Chinese-Tajik border. It is not Tajik Karakul Lake (39N 73.5E).

**Searched.** "Pamir Muztagh Ata OR Karakul OR Tashkurgan OR Kongur Mars analog OR planetary analogue OR lunar analogue"; "Karakul impact structure Pamir Tajikistan Mars OR lunar analogue OR planetary geology study"; Ladakh analog framing.

**Findings.**
- No Mars/Moon analog or rover test use of the Pamir / Muztagh Ata / Tashkurgan area found.
- Tajik **Karakul** (about 144 km northwest; ~45-52 km rim diameter) is an impact structure whose origin is disputed; I found no analog-use framing. https://en.wikipedia.org/wiki/Karakul_(Tajikistan) ; https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19940011739.pdf ; 2011 AGU abstract noting shatter cones and a competing extensional-rift interpretation: https://ui.adsabs.harvard.edu/abs/2011AGUFM.P31A1701B/abstract . Treat it as a geology item, not a precedent for "analog use".
- Ladakh work (above) is the regional precedent but 600-700 km away.

**Verdict: nothing found.**

---

## D. Western / central Tibet (Ngari / Changtang): (32.46,81.53), (31.55,80.63), (31.64,83.32), (31.46,86.53)

**Name (recalled coordinates; unverified).** All in the Western Tibetan plateau, Ngari Prefecture except D4 which is in Nagqu Prefecture (Changtang):
- D1 (32.46,81.53): northern Ngari, western Changtang plateau; 156 km NNE of Mt Kailash, about 200 km from Rutog, Lake Manasarovar and Zanda (196 km).
- D2 (31.55,80.63): 79 km from Zanda (Tsada) basin, 84 km from Mt Kailash, 126 km from Lake Manasarovar; southern Ngari, Gangdise/Himalaya foreland side.
- D3 (31.64,83.32): central Changtang, 90 km from Gerze (Gerzê) county, 201 km from Kailash.
- D4 (31.46,86.53): Changtang, 76 km from Nyima county town (Nagqu Prefecture; not to be confused with Nyêmo near Lhasa), 246 km east of Gerze.

**Searched.** "Ngari Zanda OR Gerze OR Rutog OR Changtang Mars analog / lunar analog / planetary analogue Tibet permafrost glacier"; "Qiangtang OR Changtang OR Ngari OR Manasarovar OR Kailash planetary analog"; Chinese 类火星 西藏 阿里 羌塘; Tibet lakes/dunes Mars analog.

**Findings.**
- No Mars/Moon analog, rover test or planetary-science field-site use found for Zanda, Gerze, Rutog, Ngari generally, Kailash, Manasarovar, Nyima or Changtang.
- Two near-identical "Ngari geography" web pages say Ngari is a natural laboratory including "exobiology (Mars analog)": https://americageography.github.io/china-geography/tibet-geography/ngari-geography . They look auto-generated and uncited; **do not rely on them.**
- Tibet-related Mars-analog items that exist: Rodriguez (Planetary Science Institute, 2016 press release) planned a field visit to a "Tibetan high-mountain lake" with ice-pushed ridges as an analog for Martian shoreline ridges; the lake is not named in the search results: https://www.astronomy.com/science/site-of-martian-lakes-might-have-been-linked-to-ancient-habitable-environment/ . Anglés & Li, 2016, Int. J. Astrobiology, uses a Qaidam site (not western Tibet) as analog for Mars polar ring structures: https://core-prod.cambridgecore.org/core/journals/international-journal-of-astrobiology/article/similar-ring-structures-on-mars-and-tibetan-plateau-confirm-recent-tectonism-on-martian-northern-polar-region/C56AF2313FC7D3DFAE4797DC9C5139CA
- ISRO Ladakh sites are the nearest operational analog sites: ISRO Space Analog Mission at Tso Kar (HOPE, 2025): https://www.isro.gov.in/ISRO_EN/Space_Analog_Mission.html ; Tso Kar as a Mars paleolake analog (EPSC2024-212): https://meetingorganizer.copernicus.org/EPSC2024/EPSC2024-212.html ; Tso Kar GPR permafrost-ice analog preprint: https://www.researchsquare.com/article/rs-10880070/v1 . Round 1 found no source calling Hanle itself an ISRO analog site (it hosts an observatory).

**Distances to ISRO/Ladakh sites (great-circle).** D1: Hanle 243, Tso Kar 344, Leh 412 km. D2: Hanle 208, Tso Kar 316, Leh 406 km (nearest of all four). D3: Hanle 429, Tso Kar 534, Leh 604 km. D4: Hanle 728, Tso Kar 828, Leh 888 km.

**Verdict: nothing found** for all four blocks. D2 is the closest to existing Ladakh analog activity (about 210-320 km). That is a different Indian-administered region and a human-ops programme, not a terrain-match programme.

---

## E. Kunlun / Hoh Xil margin, Qinghai: (36.73,91.11)

**Name.** Eastern Kunlun / southern margin of the Qaidam Basin, Haixi Mongol and Tibetan Autonomous Prefecture, Qinghai; roughly 340 km west-northwest of Golmud (recalled coordinates 36.4N 94.9E). It is at the transition from the Kunlun ranges to the Hoh Xil (Kekexili) highlands, but Hoh Xil core (about 35.4N 92.4E, round 1) is ~150 km southeast. Burhan Budai is a range further east. Place name for the exact point not verified.

**Searched.** "Kunlun Burhan Budai OR Hoh Xil OR Kekexili permafrost OR rock glacier Mars analog OR lunar analog OR planetary geomorphology"; "Golmud Mars analog base OR Mars camp OR Mars village Qinghai Dalangtan Lenghu"; Chinese 可可西里 / 布尔汗布达山 / 昆仑山 火星 月球 类比; Chinese 月球模拟 青藏高原 / 昆仑山 / 柴达木 试验场; Chang'e/Tianwen rover test site queries.

**Findings.**
- No Mars/Moon analog use of Hoh Xil, Burhan Budai or the Kunlun margin found. Hoh Xil landform work (DEM-based geomorphic regionalisation, Peking Univ. 2017; permafrost) has no planetary framing: https://xbna.pku.edu.cn/CN/Y2017/V53/I5/833
- East Kunlun and West Kunlun rock-glacier / periglacial studies (InSAR, deep learning) exist but with no planetary framing; one review links rock glaciers to martian lobate debris aprons in general: https://openpolar.no/Record/crwiley:10.1002%2Fesp.5039 ; https://quarxiv.authorea.com/doi/full/10.22541/essoar.168554960.07607449/v1
- **Qaidam Basin is a major Mars analog**: Wang/Xiao and colleagues' 2017 review; Europlanet TA1 Facility 7 (Qaidam Basin): https://www.europlanet-society.org/?p=15968 ; Dalangtan playa (salts) https://repository.hku.hk/handle/10722/244904 ; JUSTC 2023 araneiform analog: https://just.ustc.edu.cn/article/pdf/preview/JUSTC-2023-0164.pdf ; Lenghu Mars camp/community: https://news.cgtn.com/news/2020-01-02/Exploring-China-s-piece-of-Mars-on-Earth-MVxt5TnngI/index.html ; Mars simulation base reports: https://www.yicaiglobal.com/news/china-to-build-its-first-mars-simulation-base-in-mars-like-qinghai-landscape . No Golmud-specific analog facility found.
- **A Moon-oriented Chinese rover ground exists nearby**: Chang'e-3 rover tests in the Kumtag Desert ("Wangshu Village", about 3 km2 of modified terrain; Taklamakan also considered): https://europe.chinadaily.com.cn/china/2011-10/26/content_13982769.htm ; and a "China's most moon-like place" report: https://www.solardaily.com/reports/Chinas_most_moon_like_place_999.html . Location approximate (about 405 km from E).
- Deep-learning Mars-landing-analog work is also in the Qaidam (local, not global): https://arxiv.org/abs/2501.08584

**Adjacent sites.** Dalangtan 187 km; Lenghu Mars Camp 271 km; Golmud 340 km; Kumtag lunar-rover ground about 405 km; Ruoqiang 362 km.

**Verdict: adjacent use only.**

---

## F. Western Mongolia / Gobi-Altai: (46.91,91.78), (45.64,94.38)

**Name (recalled coordinates; unverified).** F1 is in the Mongolian Altai, Khovd province, about 122 km from Khovd city (48.0N 91.64E); I could not identify the specific range or soum. F2 is on the Gobi-Altai side, about 335 km from Khovd and 494 km from Bayankhongor; likely Gobi-Altai province / the Gobi Altai range. (Not Tuva, as round 1 already noted.)

**Searched.** "Mongolian Altai OR Gobi-Altai OR Khovd Mars analog OR lunar analog OR planetary analogue field campaign"; "Gobi-Altai OR Bayankhongor OR Khovd analog Mars OR Moon JAXA OR NASA permafrost OR volcanic OR lunar"; Chinese 阿尔泰 / 蒙古 / 戈壁阿尔泰 火星 月球 类比; Russian аналог Марса/Луны Алтай Монголия Памир Тибет.

**Findings.**
- No analog use of the Mongolian Altai, Khovd or Gobi-Altai found.
- **MARS-V** (Mongolian NGO, supported by MARSA and the Mars Society) is planning a Mars analog station in Dundgovi / Umnugovi (south-central Gobi), tourists from 2029; 840-1060 km away: https://universemagazine.com/en/mars-v-rehearsal-for-life-on-the-red-planet/ ; https://es.digitaltrends.com/espacio/mongolia-conquista-marte/
- Japan-led (Okayama, Tokyo, Kanazawa, AIST + Mongolian institutions) 2023 field survey of periglacial landforms and brain terrain in **northern Mongolia** as a Mars mid-latitude subsurface-ice analog (JpGU 2024): https://confit.atlas.jp/guide/event/jpgu2024/subject/PPS06-10/date ; JAXA-site write-up (round 1): https://cosmos.isas.jaxa.jp/digging-in-mongolia-to-uncover-ice-on-mars/ . Exact sites not stated; "northern", at the permafrost/desert boundary, not the far west.
- Russian Altai "Altai Mars" (Kyzyl-Chin, near Kosh-Agach) is tourism description only: https://tonkosti.ru/%D0%90%D0%BB%D1%82%D0%B0%D0%B9%D1%81%D0%BA%D0%B8%D0%B9_%D0%9C%D0%B0%D1%80%D1%81
- No volcanic/lunar analog work in Khovd or Bayankhongor found. No NASA or JAXA-operated field site in Mongolia found.

**Verdict: nothing found** (adjacent Mongolian Mars-analog programmes exist in other provinces).

---

## G. Altyn-Tagh / south Taklimakan margin: (36.64,84.67)

**Name (recalled coordinates; unverified).** 183 km south-southwest of Qiemo (Qarqan) and 183 km from Niya (Minfeng); 347 km from Cele. At 36.6N it is well inside the Kunlun/Altyn highlands, plausibly the Altun Shan (Arjin Shan) Nature Reserve area, not on the Taklimakan margin itself. The "south Taklimakan margin / north slope of the Kunlun" label from the brief overstates the proximity to the desert (the Taklimakan edge is around 37-38N here).

**Searched.** Round-1 queries on the Altyn-Tagh / Kunlun / Taklimakan margin, plus the Chinese query 阿尔金山 / 昆仑山北坡 / 塔克拉玛干南缘 火星类比 / 类火星地貌; Kumtag/Taklimakan Chinese rover test ground.

**Findings.**
- No Mars/Moon analog use of Altyn-Tagh, Niya, Qiemo, Cele or the Kunlun north slope found. Search returns Qaidam only: https://hub.hku.hk/bitstream/10722/244904/1/content.pdf
- Taklimakan appears only as a microbe-survey area with Mars-life relevance (Ruoqiang, Toksun, Sol Kuli): https://www.space.com/scienceastronomy/070403_st_life_limits.html and as a candidate (rejected in favour of Kumtag) for the Chang'e-3 rover test ground: https://europe.chinadaily.com.cn/china/2011-10/26/content_13982769.htm

**Adjacent sites.** Ruoqiang 406 km; Dalangtan 625 km; Hanle 676 km; Kumtag ground about 835 km.

**Verdict: nothing found.**

---

## H. East Greenland: (73.82,-23.68)

**Name.** About 26 km north of Muskox Fjord (73.633N 23.167W) and 58 km from the nominal centre of Kaiser (Kejser) Franz Joseph Fjord (73.45N 25.0W); Muskox Fjord is reported to separate Hudson Land (north) from the Gauss Peninsula (south). So: **Hudson Land / Muskox Fjord, north side of the Kejser Franz Joseph Fjord system, Northeast Greenland National Park.** (Sources are Wikipedia mirrors surfaced by search: https://en.wikipedia.org/wiki/Kaiser_Franz_Joseph_Fjord ; https://www.wikipedia.com/wiki/Muskox_Fjord ; King Oscar Fjord 72.37N 24.0W, 162 km south: https://en.wikipedia.com/wiki/King_Oscar_Fjord .) Round 1's "Scoresby / Liverpool / Jameson Land" label was wrong. A cruise page and Aarhus University describe the fjord as dominating 73-74N on this coast: https://arctic.au.dk/news-and-events/news/show/artikel/kejser-franz-joseph-fjord

**Searched.** "East Greenland Kong Oscar Fjord OR Kejser Franz Joseph Fjord OR Hudson Land OR Traill planetary analogue OR Mars analog OR lunar analog"; "Daneborg OR Zackenberg OR Station Nord OR Mestersvig Greenland moon analog OR lunar habitat test OR Mars analog"; "Greenland East Greenland Mars analogue ... Skaergaard OR Scoresby OR Kangerlussuaq Europlanet catalogue"; geology of East Greenland.

**Findings.**
- Nothing found tying Hudson Land, Muskox Fjord, Kejser Franz Joseph Fjord, Kong Oscar Fjord or Traill Ø to a planetary-analog, astronaut-training or rover test use. Results are geology-only: https://depositsmag.com/2017/04/27/the-geology-of-east-greenland/ (the area is the largest ice-free area in Greenland; 2 Ga basement gneisses and Caledonian rocks).
- Greenland analog use is elsewhere: Kangerlussuaq (Europlanet TA1 Facility 4, Aarhus University): https://europlanet-society.org/?p=8745 ; 2023 subglacial/polygon comparison: https://www.europlanet-society.org/?p=17812 ; SAGA "Lunark" lunar habitat test in North Greenland (60 days; Station Nord considered for siting): https://www.designboom.com/architecture/saga-lunark-moon-habitat-northern-greenland-extreme-climate-12-10-2020/ ; https://www.arctictoday.com/?p=29982
- Zackenberg/Daneborg research stations (about 74.5N, 20.5W; recalled, roughly 120 km from the block; site manual has no analog content): https://g-e-m.dk/fileadmin/g-e-m/Zackenberg/Site_Manual_2023_7_June.pdf
- A DEIMS record lists "Flashline Mars Arctic Research Station - Greenland" at a position near the pole, which looks like a data-entry artefact (FMARS is on Devon Island): https://deims.org/0c947521-a041-4760-8f0a-a9277266f3e6 . Don't cite it.

**Adjacent sites.** Station Nord about 880 km; Askja (Iceland) 1,013 km; Kangerlussuaq 1,242 km; Svalbard (Longyearbyen) about 1,400 km (recalled).

**Verdict: nothing found.**

---

## Systematic, data-driven searches of Earth for Moon/Mars analogs

Found, in rough order of closeness. None is a global, DEM-based, south-pole-specific search.

1. **NHSJS 2026, "Finding Earth's Best Testbeds for Moon and Mars Rovers: A Quantitative Terrain Comparison"** (Chaitanya Sanganeria; accepted April 2026). https://nhsjs.com/?p=41960 ; PDF: https://nhsjs.com/wp-content/uploads/2026/04/Finding-Earth-s-Best-Testbeds-for-Moon-and-Mars-Rovers-A-Quantitative-Terrain-Comparison_compressed.pdf . **I could not open it** (WebFetch refused nhsjs.com). From search summaries: ranks candidate Earth sites by grayscale image-texture similarity to lunar and Martian terrain using two descriptors (a brightness variability index and a local-gradient roughness proxy); a curated set of about ten images per body; Devon Island, South Atacama, Meteor Crater and Mauna Kea appear among the closest matches; the author says it is a screening tool that does not model gravity, regolith mechanics or traction, and that DEM-derived slope/roughness validation is needed. It does not appear to be global, DEM-based, or a machine-learning model, and I do not know whether any Tibetan, Andean, Mongolian or Greenland site is in its set (likely not). Our approach differs in scale and inputs, but it is prior art for "rank Earth sites by terrain similarity to the Moon/Mars" and should be cited.
2. **arXiv 2501.08584, "Deep learning selection of analogues for Mars landing sites in the Qaidam Basin, Qinghai-Tibet Plateau"** (Meng, Wang et al., Dec 2024). Siamese CNN compares Qaidam imagery with Mars landing-region imagery. Local (one basin), imagery-based, Mars. https://arxiv.org/abs/2501.08584
3. **Artemis III landing-site multi-criteria study (GIS/TOPSIS, 1,247 candidate locations)**, lunar side only: https://arxiv.org/html/2406.19863v2 . No Earth analog search.
4. **IMEWG "Mars on Earth – Analogues"** is building a curated database of Mars analog field sites, i.e. a catalogue, not a quantitative ranking: https://imewg.org/joint-initiatives/mars-on-earth-analogues
5. A NASA-linked HMP figure caption notes the lunar south pole terrain (roughness, slopes, illumination) is harder than Apollo terrain and names Painted Hills (John Day Fossil Beds) as an Earth site with similar slopes/textures/strength: https://www.eurekalert.org/multimedia/957913 (added to v3 CSV, low confidence).
6. Related but not the same task: Cascadia-margin geomorphic-phenotype classification for Mars faults (https://indico.fais.uj.edu.pl/event/45/contributions/294/); real-time terrain classifier tested on an Icelandic analog (ESA ASTRA 2023 paper in round-1 search); hierarchical clustering for lunar landing sites (Kyungpook National Univ.).

Searches run for this: "terrestrial analog site selection terrain similarity machine learning Moon rover Earth global search"; "Finding Earth's Best Testbeds ... Devon Island"; "global GIS search Earth locations most similar to lunar south pole terrain slope roughness illumination analog"; "Mars analog site selection multi-criteria GIS global DEM geomorphometric similarity". I did not get to ADS, Google Scholar or Semantic Scholar directly (they could not be fetched), so a literature gap remains for 2024-2026 conference abstracts (LPSC/EPSC/AGU).

**Bottom line:** I found no published global, DEM-based, lunar-south-pole-specific analog search. That statement should be phrased "we found none" and reference the NHSJS paper as the closest prior work.

## Catalogue additions

See `known_analogs_v3_additions.csv`: 11 rows. The ones most useful for the nearest-site distance calculation are `mustang_nepal_marsmedics` (Himalaya, near B), `qaidam_basin_regional` and `kumtag_wangshu_village` (near E/G), `puna_apvc_andean_domes` (lunar-relevant Andean domes), `laguna_brava_larioja` (near A), `mongolia_northern_periglacial` (F, location very approximate) and `station_nord_greenland` (H). Rows with "approximate" in the name have coordinates I could not verify; treat the confidence column as binding.
