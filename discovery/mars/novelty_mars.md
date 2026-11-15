# Novelty check: Mars-like Earth candidate blocks

Date of check: 2026-11-15. Method: WebSearch (standard mode; extended for Saudi harrats and Tibet), English plus Chinese, Persian, Arabic and Spanish keywords. WebFetch worked on some HTTPS pages (Hamshahri, astrobiology.com, Frontiers, NHSJS, arXiv, Aramco World); Springer and a Cambridge proxy PDF redirected to login and were NOT read, and the ESA catalogue page returned 404. Where I only saw a search-result summary rather than the page, it is marked "(summary)".

Absence of results is not proof of novelty. Search engines returned mostly tourism, news and Qaidam-Basin papers; Google Scholar, CNKI and Persian journal databases were not directly searchable.

## Place names: how determined
Reverse geocoding with OpenStreetMap Nominatim (zoom 10) on each candidate coordinate; nearest known-analog distances computed (haversine) against `../known_analogs_v2.csv` and `known_mars_analogs_additions.csv`. Nominatim returns administrative units, not desert names, so "system" labels (Lut, Kavir, Gobi etc.) are my geographic judgement.

| # | Coord | Nominatim | Likely geographic system |
|---|---|---|---|
| 1 | 28.46, 62.31 | Taftan Tehsil, Chagai District, Balochistan, Pakistan (Taftan volcano is 116 km away) | Chagai / Iran-Pakistan border, Sistan-Baluchestan frontier |
| 2a | 31.33, 55.32 | Bafq County, Yazd Province, Iran | Central Iran, Kavir/Lut margin |
| 2b | 32.46, 57.16 | Tabas County, South Khorasan, Iran ("Kavir" rural district) | Between Dasht-e Kavir and Dasht-e Lut |
| 3a | 42.46, 98.55 | Har Burgdin Ul, Ejina Banner, Alxa League, Inner Mongolia, China | Gobi north of Beishan, near Mongolian border |
| 3b | 41.60, 97.18 | Mazongshan Town, Subei County, Jiuquan, Gansu | Mazong Shan / Beishan Gobi |
| 4 | 41.46, 101.72 | Ungt Gol, Ejina Banner, Alxa League, Inner Mongolia | Ejin / Heihe Gobi (Badain Jaran is 178 km SSE) |
| 5 | 21.19, 16.58 | Tibesti, Chad | Tibesti massif (western/northern part) |
| 6a | 24.33, 41.59 | Al Mahd, Medina Province, Saudi Arabia | Najd east of Harrat Rahat (Rahat ~233 km, Khaybar ~250 km). I could not determine which harrat, if any, lies under the block |
| 6b | 23.87, 41.15 | Al Mahd, Medina Province | As above (Rahat ~168 km) |
| 6c | 28.33, 37.61 | Tabuk Governorate | Harrat Uwayrid is 143 km SW (Nominatim centre 27.08, 37.25); Wadi Rum 257 km NW |
| 7 | -14.40, -75.58 | Santiago, Province of Ica, Peru | Peruvian coastal desert (Ica-Nazca) |
| 8 | 32.87, 83.32 | Oma township, Gerze County, Ngari Prefecture, Xizang | Northern Tibet / Changtang |
| 9a | 41.46, 89.36 | Gaochang District, Turpan, Xinjiang | Turpan-Kuruktag / Kumtag margin (Lop Nur 176 km) |
| 9b | 43.19, 96.37 | Tsogt, Govi-Altai, Mongolia | Mongolian Gobi / Great Gobi A area |
| 10 | -20.40, -69.28 | Pica, Provincia del Tamarugal, Tarapaca, Chile | Atacama, Pampa del Tamarugal |

## Per-region findings

### 1. 28.46, 62.31 (Chagai, Pakistan/Iran border)
- Searched: "Chagai Hamun-e Mashkel Registan Mars analog"; "Sistan Baluchestan Mars analogue Taftan"; "Pakistan Balochistan Mars analog Chagai Saindak Koh-e-Sultan"; Makran/Hingol mud volcanoes Mars; Persian "Mars-like Iran" lists.
- Found: nothing for Chagai, Hamun-e Mashkel, Registan or Taftan as a Mars analog. Only a stock photo of Mars over Taftan (https://www.afloimages.com/imagedetails/148739182_extIntAflo/148739182-AFLO-Images-Mars%2Dover%2DTaftan%2Dvolcano%2DThe%2Dplanet%2DMars%2Dbright%2Din.html), and Taftan volcano uplift news. Tourism-grade "Mars mountains" near Chabahar (~389 km, Makran coast, a different system) in Hamshahri: https://www.hamshahrionline.ir/news/858432/ (title "Mars in Iran"). A Hingol "Mars Point" travel blog (https://pakistaniat.com/2007/03/02/mud-volcanoes-volcano-balochistan-baluchistan-hingol-offroad-makran-pasni-hinglaj/) is an informal impression only. A review of Indian-subcontinent analog sites (https://astrobiology.com/2025/10/05/planetary-analog-sites-in-the-indian-subcontinent-and-the-indian-ocean-underexplored-environments-suited-for-astrobiological-and-space-research/) names no Pakistan or Iran sites.
- Nearest known: Dasht-e Lut 393 km; Shahdad kaluts 497 km.
- Verdict: **nothing found**.

### 2a. 31.33, 55.32 (Bafq/Yazd) and 2b. 32.46, 57.16 (Tabas)
- Searched: Yazd/Tabas/Kavir Mars analog; Persian "Mars analog Iran Lut Yazd Tabas"; Bafq iron-oxide Mars; Kavir salt diapirs Mars; ISA Mars simulation.
- Lut Desert is an established Mars analog: Foroutan and Zimbelman, "Mega-ripples in Iran: A new analog for transverse aeolian ridges on Mars" (Icarus 2016) and a 2020 Planetary and Space Science follow-up (summary): https://prism.ucalgary.ca/handle/11023/3645 ; https://profiles.si.edu/display/sro_139430 . Kaluts vs Aeolis yardangs, Hesarakizad and Maghsoudi 2025 (summary): https://www.ensani.ir/fa/article/download/645048 . NASA Earth Observatory on Lut: https://www.earthobservatory.nasa.gov/images/153634/irans-lut-desert . Study-area coordinates of the Lut papers were not visible to me.
- Kavir: Aftabi (2006 EGU abstract, summary) compares Central Iran Kavir and Qum Kuh salt-sheet flow with Mars: https://www.meetings.copernicus.org/www.cosis.net/abstracts/EGU06/00849/EGU06-J-00849-5.pdf . A low-quality study-guide page asserts Kavir is used for rover tests (no citation; not relied on): https://studyguides.com/study-methods/overview/cmolziwrbkitp01khizz50vg3 .
- Bafq: only Kiruna-type iron-ore geology; no Mars link found. Tabas: no result. Hamshahri "Mars-like Iran" article lists Shahdad kaluts, Damghan, Pade (Semnan, in Kavir) but not Yazd/Tabas/Bafq.
- Nearest known: Shahdad kaluts 249 km (2a) / 233 km (2b); Dasht-e Lut known row 363 / 279 km; Dasht-e Kavir row 382 / 333 km.
- Verdict: both **adjacent use only** (same Kavir/Lut desert system; no block-specific use found).

### 3a. 42.46, 98.55 (Ejina Banner Gobi) and 3b. 41.60, 97.18 (Mazong Shan)
- Searched: "Mazong Shan Beishan Gobi Mars analog"; Chinese "北山 马鬃山 类火星 火星类比 戈壁"; "马鬃山 火星 OR 北山 戈壁 火星 类比"; Zhurong/Jiuquan Gobi comparison.
- No Beishan or Mazong Shan Mars-analog study found; the only Mazongshan hit was a mineral-geology paper (https://search.napstic.cn/literature/periodical/010zgmengy202402014). Gobi-wide analog framing exists: Jinchang Mars Base 1 (tourism-themed, CAS director quoted) and a 2026 China Daily item saying the Gobi offers one of China's closest natural analogs: https://regional.chinadaily.com.cn/gansu/2026-07/21/c_1198935.htm ; https://www.marsdaily.com/reports/Exploring_life_on_Mars_in_the_Gobi_desert_999.html ; https://www.chinadaily.com.cn/a/202201/25/WS61ef32cfa310cdd39bc82f3b_3.html (Hami). Qaidam dominates the real science literature: https://bohrium.dp.tech/paper/arxiv/64b6c8753fda6d7f06fabd84 .
- Nearest known: 3a: Hami Dahaidao 414 km, Badain Jaran 417 km, Orog Nuur (Mongolian Gobi lakes) 336 km. 3b: Hami Dahaidao 331 km, Dunhuang 354 km.
- Verdict: **adjacent use only (weak)** for both: Gobi-system tourism/analog use at 330-410 km; no study of the block area itself. Strictly by distance (>300 km) it is "nothing found".

### 4. 41.46, 101.72 (Ejin/Heihe Gobi)
- Searched: Alxa/Ejin/Juyan Mars analog (English and Chinese 额济纳 阿拉善 戈壁 火星 类比); Badain Jaran Mars comparison.
- Nothing found for Ejin. Badain Jaran (178 km) has dune/lake papers but no Mars comparison found in my search (NASA EO https://earthobservatory.nasa.gov/images/84773/megadunes-and-desert-lakes-in-china ; Frontiers https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2021.811181/pdf describe it without Mars). The existing catalog row for Badain Jaran is a concept entry only. Ejin hosts the Jiuquan launch centre; this is not an analog use.
- Nearest known: Badain Jaran (additions row, low) 178 km; Jinchang Mars Base 1 329 km.
- Verdict: **nothing found** (weak Gobi-wide adjacency only).

### 5. 21.19, 16.58 (Tibesti)
- Searched: Tibesti Mars analog; Wau-an-Namus; Libya/Chad Sahara Mars.
- Tibesti massif has Mars-comparison use: NASA Earth Observatory says Emi Koussi has served as a close analog to Elysium Mons; Malin (1977) used Martian volcanism as analogues for Tibesti volcanism (summary): https://earthobservatory.nasa.gov/IOTD/view.php?id=3023 ; https://eol.jsc.nasa.gov/Collections/EarthObservatory/articles/Emi_Koussi_Volcano.htm . A French source disputes the Mars-analog notion (https://saf-astronomie.fr/mars-sur-terre-non-le-trou-au-natron/). Waw an Namus (Libya, 24.92, 17.83; about 420 km north-east) is a Foroutan et al. 2019 megaripple/TAR analog: https://uwaterloo.ca/duguay-research-group/references/megaripples-wau-namus-libya-new-analog-similar-features-mars .
- Nearest known: catalog Tibesti row 159 km; Emi Koussi 256 km.
- Verdict: **adjacent use only** (same massif; analog use is Emi Koussi-scale, not this block). NOTE: the block is inside the Tibesti massif that is already in the catalog; it should arguably be flagged as "known region" rather than novel.

### 6a. 24.33, 41.59; 6b. 23.87, 41.15; 6c. 28.33, 37.61 (Saudi harrats)
- Searched: Saudi harrat Mars analog (standard and extended); Arabic "حرة خيبر حرة رهط محاكاة المريخ"; lava tubes Mars analog Saudi; Uwayrid/Ithnayn.
- Found: Harrat Khaybar described as Mars-like (ISS image, Slate 2010; https://www.slate.com/blogs/bad_astronomy/2010/12/02/guess_the_planet.html). Saudi lava tubes (Hibashi) treated as Mars/Moon lava-tube analogs by P. Boston (NASA-linked) per Aramco World 2006: https://archive.aramcoworld.com/issue/200602/volcanic.arabia.htm (page does not name the harrat). Umm Jirsan lava tube (Khaybar) paper is archaeology; EarthDate piece mentions Mars lava tubes generically: https://earthdate.org/node/1161 . A 2026 Extremophiles review frames Saudi deserts/salt flats/volcanic settings as Mars/icy-moon analogs but names no harrat for Mars (fetched): https://astrobiology.com/2026/04/13/extreme-arabian-environments-and-their-microbiomes-new-frontiers-for-astrobiology-and-biosignature-discovery/ . USGS Harrat Rahat paper is not a Mars study: https://pubs.usgs.gov/pp/1862/e/pp1862e.pdf . Nothing for Uwayrid, Ithnayn, Kishb as Mars analogs.
- Nearest known: 6a/6b: Harrat Khaybar row 251/258 km, Rahat 233/168 km (no catalog row). 6c: Harrat Uwayrid 143 km, Wadi Rum (PETRA analog, known) 257 km, Khaybar 351 km.
- Verdict: 6a, 6b **adjacent use only** (Saudi harrat province; Khaybar/lava-tube analog use 250 km; may not even sit on a harrat). 6c **adjacent use only** (Wadi Rum 257 km).

### 7. -14.40, -75.58 (Ica/Nazca/Pisco-Paracas)
- Searched: English and Spanish ("análogo marciano desierto Perú Ica Nazca Pisco").
- Nothing found for Ica, Nazca or Paracas. Travel captions say the Ica-Nazca desert "reminds us of Mars" (https://homer.360cities.net/image/peru-coastal-desert-of-nazca-ica-river-valley); IGP states it never rains at Paracas (https://www.igp.gob.pe/observatorios/radio-observatorio-jicamarca/Oyu25ffoXLpO5RQOpRCmRxCPCrNk1NGn/pdf/paracasgeologicalservice.pdf). The cited Peruvian Mars analog is Pampas de La Joya, Arequipa (Valdivia-Silva, McKay et al.; GCA 2011; IJA 2004-2008 climate study): https://www.cambridge.org/core/journals/international-journal-of-astrobiology/article/abs/climatological-characteristics-in-the-extreme-hyperarid-region-of-pampas-de-la-joya-peru-astrobiological-approach-in-four-years-of-observation-20042008/2997D5A36434B310BCA2FB4C48CF84C8 ; https://larepublica.pe/datos-lr/respuestas/2023/11/20/sabias-que-el-desierto-mas-seco-del-mundo-esta-en-peru-fue-comparado-con-marte-y-no-esta-en-ica-evat-1669800 (says the driest, Mars-compared desert is not in Ica).
- Nearest: La Joya 475 km (new row); Salar de Surire (additions) 852 km.
- Verdict: **adjacent use only (weak)**: same Peru-Atacama coastal desert but 475 km away; no Ica-specific use.

### 8. 32.87, 83.32 (Gerze, Ngari, northern Tibet)
- Searched: English (standard and extended) and Chinese "西藏 羌塘 阿里 类火星"; Zabuye/Zhacang Caka; Tibetan Plateau Mars analog.
- Nothing found for Ngari/Gerze/Changtang as a Mars analog. Northern Tibet volcanic field is described purely geologically (https://wiki.riteme.site/wiki/Northern_Tibet_volcanic_field). All Tibetan-Plateau Mars analog work is Qaidam Basin (Wang et al. / Anglés and Li 2017): https://bohrium.dp.tech/paper/arxiv/64b6c8753fda6d7f06fabd84 ; https://ricerca.unich.it/handle/11564/658125 ; Dalangtan at ~4500 m: https://www.lpi.usra.edu/meetings/lpsc2009/pdf/1216.pdf . A Cambridge IJA paper compares ring structures on Mars and the Tibetan Plateau, but the Plateau location was not readable (proxy login) - unverified. Lake Zabuye results are lithium-focused, no Mars link.
- Nearest known: Hanle 407 km, Tso Kar 500 km (Ladakh, ISRO).
- Verdict: **nothing found**.

### 9a. 41.46, 89.36 (Turpan / Kuruktag-Kumtag margin)
- Searched: Kumtag/Kuruktag/Turpan Mars analog; Chinese "吐鲁番 库姆塔格 哈密 类火星".
- Nothing specific to Turpan. Lop Nur yardangs (already catalogued) are 176 km away. Hami Basin Mars camp is a tourism/education facility (https://www.theworldofchinese.com/2021/06/2021-a-mars-camp-odyssey/); Dahaidao yardangs marketed as "Mars base" (https://www.thepaper.cn/newsDetail_forward_22847810). Kumtag dunes literature has no Mars comparison (https://www.mdpi.com/2073-445X/14/11/2169). A news item says NASA scientists studied microbes in NW China deserts as Mars-like (https://planete-mars.com/?p=1094 ; https://www.nbcnews.com/id/wbna17934555), sites unnamed.
- Nearest known: Lop Nur 176 km; Ruoqiang 289 km; Dunhuang 353 km; Hami 374 km; Dalangtan 382 km.
- Verdict: **adjacent use only**.

### 9b. 43.19, 96.37 (Tsogt, Govi-Altai, Mongolia)
- Searched: Mongolia Gobi Mars analog; Gobi-Altai; Great Gobi.
- No study of this block. Peer-reviewed analog work in Mongolia: Valley of the Gobi Lakes (Boon Tsagaan, Orog, Olgoy lakes) proposed as early-Mars semi-arid lake analog, Minerals 2020, 10(9), 792: https://mdpi.com/2075-163X/10/9/792 (a reviewer notes it had not previously been explored as a planetary analog); MARS-V analog station planned in Dundgovi/Umnugovi (already catalogued): https://universemagazine.com/en/mars-v-rehearsal-for-life-on-the-red-planet/ ; https://localnews8.com/life/cnn-style/2025/10/23/inside-mongolias-mars-camp-the-extreme-adventure-that-wants-to-turn-tourists-into-astronauts/ .
- Nearest: Hami Dahaidao 236 km (low-confidence catalog row); Valley of the Gobi Lakes ~403 km (Orog Nuur); MARS-V ~707 km.
- Verdict: **adjacent use only (weak)**.

### 10. -20.40, -69.28 (Pica, Tarapaca, Atacama)
- Searched: Pica/Tarapaca/Pampa del Tamarugal Mars analog; Salar Grande.
- Atacama as Mars analog is extensive (Azua-Bustos et al. review: https://doi.org/10.3389/fspas.2021.810426 ; Flahaut et al. 2017 on Chilean salars: https://cosmochemistry-papers.com/2016/10/17/remote-sensing-and-in-situ-mineralogic-survey-of-the-chilean-salars-an-analog-to-mars-evaporate-deposits/). Salar Grande, ~100 km SW of the block, has Mars halite/perchlorate biomarker drilling studies (summary of https://link.springer.com/doi/10.1007/s11084-012-9289-y; full text not read; also https://www.frontiersin.org/journals/astronomy-and-space-sciences/articles/10.3389/fspas.2021.810426/pdf). No result for Pica or Pampa del Tamarugal specifically.
- Nearest known: Salar Grande 100 km (new row, low), Salar de Surire 176 km, Salar de Coipasa 162 km, Salar de Uyuni 189 km, Yungay 415 km.
- Verdict: **adjacent use only** (expected; confirmed).

## Systematic / global-search angle
Searches: Earth locations ranked by similarity to Mars landing sites (DEM, thermal inertia, mineralogy), terrestrial analogs for Jezero and Oxia Planum, Flahaut 2017.
- No paper found that ranks the whole Earth by DEM + thermal inertia + mineralogy similarity to Mars sites. Closest items:
  - Meng et al., "Deep learning selection of analogues for Mars landing sites in the Qaidam Basin" (CNN similarity on Earth/Mars surface images; names only Qaidam evaporite region; no specific Mars sites in abstract): https://arxiv.org/abs/2501.08584
  - NHSJS 2026 "Finding Earth's Best Testbeds for Moon and Mars Rovers" (image-feature similarity; 10 Earth sites: Askja, N and S Atacama, Devon Island, Mauna Kea, Meteor Crater, Nevada Desert, Nevada Test Site, Utah Desert, Wadi Rum; closest to Mars: Nevada Desert; Mars reference regions include Gale, not Jezero): https://nhsjs.com/2026/finding-earths-best-testbeds-for-moon-and-mars-rovers-a-quantitative-terrain-comparison/
  - Flahaut et al. 2017 (Icarus 282:152-173): in-situ + remote-sensing survey of Chilean salars (Salar de Atacama and others) as Mars evaporite analog; regional, not global: https://cosmochemistry-papers.com/2016/10/17/remote-sensing-and-in-situ-mineralogic-survey-of-the-chilean-salars-an-analog-to-mars-evaporate-deposits/ . (I did not find a Flahaut paper titled "Mars-analog Earth sites"; that title in the brief seems not to exist as stated.)
  - Frontiers 2022 review of five lake analogs for Gale/Jezero: Haughton (Canada), Atacama salars, Lake Bonney (Antarctica), Lonar Lake (India), Rio Tinto (Spain): https://www.frontiersin.org/articles/10.3389/fspas.2022.849078
  - NASA Analog Explorer pairs Lake Salda (Turkey) with Jezero; also Atacama, Pilot Valley (Utah), Iceland: https://science.nasa.gov/solar-system/analog-explorer/ ; https://earthobservatory.nasa.gov/blogs/earthmatters/2021/02/17/what-a-lake-in-turkey-can-tell-us-about-mars/
  - Oxia Planum: sample-level analogs only (Otago, NZ vermiculite schist; Granby, Massachusetts tuff) in the Oslo PTAL library: https://meetingorganizer.copernicus.org/EGU21/EGU21-841.html ; https://www.mn.uio.no/analogue-sample-library
  - Catalogues: ESA Catalogue of Planetary Analogues (summary: https://www.esa.int/Our_Activities/Preparing_for_the_Future/Discovery_and_Preparation/Cataloguing_otherworldly_landscapes_on_Earth, page 404 on fetch); Mars Society Australia site list (https://www.marssociety.org.au/project/geology/sites); IMEWG Mars-on-Earth analogues database (https://imewg.org/joint-initiatives/mars-on-earth-analogues); a Kuwait GIS "Analog Conjunctive Method" is regional only (URL not captured).
- Implication: a global DEM/thermal-inertia/mineral similarity ranking appears unpublished or at least not found; none of the named Earth sites in these papers are in the candidate regions above.

## Summary table

| Region | Place | Nearest known analog (km) | Verdict |
|---|---|---|---|
| 1 | Chagai, Pakistan (Taftan Tehsil) | Dasht-e Lut 393 | nothing found |
| 2a | Bafq, Yazd, Iran | Shahdad kaluts 249 | adjacent use only (Lut/Kavir) |
| 2b | Tabas, S. Khorasan, Iran | Shahdad 233 | adjacent use only (Lut/Kavir) |
| 3a | Ejina Banner Gobi, N of Beishan | Orog Nuur lakes 336, Hami 414 | adjacent use only (weak, Gobi-wide) |
| 3b | Mazongshan, Gansu | Hami 331, Dunhuang 354 | adjacent use only (weak, Gobi-wide) |
| 4 | Ejin / Heihe Gobi | Badain Jaran 178 (concept only), Jinchang 329 | nothing found (weak Gobi-wide) |
| 5 | Tibesti, Chad | Tibesti row 159, Emi Koussi 256 | adjacent use only (same massif) |
| 6a | Al Mahd, Medina Prov., Saudi | Rahat 233 (uncatalogued), Khaybar 251 | adjacent use only |
| 6b | Al Mahd, Medina Prov., Saudi | Rahat 168, Khaybar 258 | adjacent use only |
| 6c | Tabuk, Saudi (Uwayrid 143 km) | Wadi Rum 257 | adjacent use only |
| 7 | Ica, Peru | Pampas de La Joya 475 | adjacent use only (weak) |
| 8 | Gerze, Ngari, Tibet | Hanle 407 | nothing found |
| 9a | Turpan, Xinjiang | Lop Nur 176 | adjacent use only |
| 9b | Govi-Altai, Mongolia | Hami 236, Gobi Lakes 403 | adjacent use only (weak) |
| 10 | Pica, Tarapaca, Chile | Salar Grande 100, Surire 176 | adjacent use only |

No region got "analog use found" at block level. Most novel by this search: 1 (Chagai), 8 (Gerze, Ngari), and 4 (Ejin Gobi); regions 5 and 10 are the least novel (inside or beside already-catalogued systems).

New sites added to `known_mars_analogs_additions2.csv`: Emi Koussi, Waw an Namus, Valley of the Gobi Lakes (Mongolia), Pampas de La Joya, Salar Grande (low).
