import json, numpy as np
T=json.load(open('results/terrain_200m.json')); A=json.load(open('results/albedo_sampled.json')); TI=json.load(open('results/ti_sampled.json')); J20=json.load(open('results/jezero_20m.json'))
PDS='https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/global_ti_%s_2007.img'
ALB='https://planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif'
def v(value,cls,url,note): return dict(value=value,**{'class':cls},source_url=url,note=note)
def ti(k):
    d,n=TI[k]['day'],TI[k]['night']
    return v(dict(dayside_mean_tiu=round(d['mean_noninterp'],1),dayside_median_tiu=d['median_noninterp'],nightside_mean_tiu=round(n['mean_noninterp'],1),nightside_median_tiu=n['median_noninterp'],
        dayside_range_tiu=[d['min'],d['max']],nightside_range_tiu=[n['min'],n['max']]),'A',PDS%'night',
        f"Putzig & Mellon 2007 apparent TI (TES bolometer, 20 ppd ~3 km, int16 MSB, units tiu) sampled by HTTP range read of the 30x30 km window ({d['n_total']} px; interpolated pixels masked out with global_ti_msk_*_2007.img). Day file: {PDS%'day'}. Apparent TI, not a true bulk TI; 3 km pixels average over heterogeneous terrain.")
def alb(k):
    a=A[k]; return v(dict(mean=round(a['window_mean'],4),min=round(a['window_min'],4),max=round(a['window_max'],4),centre_pixel=round(a['centre_px'],4)),'A',ALB,
        f"TES Lambert albedo, USGS 7410 m (8 ppd) mosaic; mean over {a['npx']} px covering the 30x30 km window. Product = Christensen et al. 2001 (PDS GLOBAL_ALBEDO_8PPD).")
NULLDCI=v(None,'C',None,'Ruff & Christensen 2002 DCI only available to me as a colorized image (https://www.mars.asu.edu/data/tes_ruffdust, 16 ppd, 3.5 km); no numeric raster found open/no-login, and colour-bar inversion not attempted.')
NULLROCK=v(None,'C',None,'No open numeric TES rock-abundance raster found (ASU lists only a colorized Viking IRTM rock map, https://www.mars.asu.edu/data). Not sampled.')
NULLT=v(None,'C',None,'No open global raster of TES annual-mean surface temperature found; not available as a number I saw in a source. Left null (could be taken from Mars Climate Database / REMS / MEDA papers later).')
NULLTD=v(None,'C',None,'Not found as a quotable site value; see T_mean note.')
def pres(k):
    h=T[k]['elev_mean_m']; est=6.1*np.exp(-h/10800.0)  # illustrative
    return v(None,'C',None,f"No quoted site pressure found. Rough barometric ESTIMATE only (NOT a sourced value; assumes P0=6.1 mbar at MOLA datum, scale height ~10.8 km, my DEM mean elev {h:.0f} m): ~{est:.1f} mbar.")
M=lambda l,u,n: v(l,'C',u,n)
ctx={
'jezero':dict(thermal_inertia=ti('jezero'),albedo=alb('jezero'),dci=NULLDCI,T_mean_K=NULLT,T_diurnal_K=NULLTD,pressure_mbar=pres('jezero'),rock_abundance=NULLROCK,
  thermal_inertia_literature=M('180 (sand dune) to 605 (bedrock) tiu in situ MEDA traverse; agrees with THEMIS 100 m','https://digital.inta.es/entities/publication/399c1608-d291-4e31-a254-f530673bd909/full','Martinez et al. 2023 JGR Planets, doi 10.1029/2022JE007537 (abstract-level via search snippet; full text not retrieved)'),
  minerals=M(['Mg-rich carbonate','olivine','Fe/Mg smectite (saponite/nontronite) on western fan','low-Ca pyroxene'],'https://ui.adsabs.harvard.edu/abs/2015JGRE..120..775G','Goudge et al. 2015 CRISM mapping (abstract-level via search); Ehlmann 2008 for Nili Fossae carbonate; also https://arxiv.org/pdf/1801.09841')),
'oxia':dict(thermal_inertia=ti('oxia'),albedo=alb('oxia'),dci=NULLDCI,T_mean_K=NULLT,T_diurnal_K=NULLTD,pressure_mbar=pres('oxia'),rock_abundance=NULLROCK,
  minerals=M(['Fe/Mg-rich clays (smectite)','possible carbonate or other clay mixture (2.5 um feature)','olivine-like 1 um absorption in bluish bedrock'],'https://boris.unibe.ch/156503','Mandon et al. 2021 Astrobiology (HiRISE/CRISM/CaSSIS), abstract-level via search; geological context Quantin-Nataf et al. 2021')),
'gale':dict(thermal_inertia=ti('gale'),albedo=alb('gale'),dci=NULLDCI,T_mean_K=NULLT,T_diurnal_K=NULLTD,pressure_mbar=pres('gale'),rock_abundance=NULLROCK,
  thermal_inertia_literature=M('265-375 tiu from REMS diurnal fits, first 100 sols (Hamilton et al. 2014); other sites 280-445 tiu','https://meetingorganizer.copernicus.org/EGU2014/EGU2014-3134.pdf','Search-snippet level only; attribution to specific URL not verified against full text'),
  minerals=M(['Fe/Mg phyllosilicates (smectite/nontronite) on floor, walls and lower Mount Sharp','sulfates (upper units)','hematite (Vera Rubin ridge)','OMEGA hydration 2-3 wt% H2O'],'https://pmc.ncbi.nlm.nih.gov/articles/PMC7539960','Milliken et al. 2010, Fraeman et al. 2016 as summarised in search results (abstract-level); also https://ntrs.nasa.gov/api/citations/20205001823/downloads/Rampe_etal_VRR_mineralogy_main_text_revised_tracked_changes_accepted.docx.pdf')),
'meridiani':dict(thermal_inertia=ti('meridiani'),albedo=alb('meridiani'),dci=NULLDCI,T_mean_K=NULLT,T_diurnal_K=NULLTD,pressure_mbar=pres('meridiani'),rock_abundance=NULLROCK,
  thermal_inertia_literature=M('TES 200 / THEMIS 190 tiu bulk at landing location; TES 170-240 over hematite unit (Christensen & Ruff 2004)','https://ntrs.nasa.gov/api/citations/20050169539/downloads/20050169539.pdf','Search-snippet level; mapping of the numbers to this exact URL not verified (other hits: https://pubs.usgs.gov/publication/70028845)'),
  minerals=M(['crystalline gray hematite (TES)','sulfate-rich sedimentary rocks (Arvidson 2006)','olivine-rich basaltic sands'],'https://pubs.usgs.gov/publication/70028845','Search-snippet level (Christensen et al. 2001; Arvidson et al. 2006 https://ui.adsabs.harvard.edu/abs/2006JGRE..11112S08A)')),
}
out={}
for k in ctx:
    t=T[k]; out[k]=dict(terrain=t,context=ctx[k])
out['jezero']['terrain_20m_ctx']=J20
out['_meta']=dict(note='Mars data only. DEM = USGS HRSC+MOLA blend 200 m v2. Class A=sampled by us from open raster, C=literature/not found.',window_km=30)
json.dump(out,open('results/mars_sites.json','w'),indent=1)
for k in ['jezero','oxia','gale','meridiani']: print(k,out[k]['context']['pressure_mbar']['note'][-60:])
