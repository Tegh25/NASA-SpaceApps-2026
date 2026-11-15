import sys, json, numpy as np, rasterio
sys.path.insert(0,'..'); import common as C
from pyproj import CRS, Transformer
from rasterio.windows import Window
u='/vsicurl/https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif'
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
    s=rasterio.open(u)
    t=Transformer.from_crs(CRS.from_wkt(s.crs.to_wkt()).geodetic_crs,CRS.from_wkt(s.crs.to_wkt()),always_xy=True)
    x,y=t.transform(77.50,18.45); r,c=s.index(x,y); print(x,y,r,c)
    r0,c0=r-750,c-750
    d=s.read(1,window=Window(c0,r0,1500,1500)).astype('float64'); d[d<-1e30]=np.nan; print(d.shape,np.isnan(d).mean())
np.save('data/jezero_dem20.npy',d.astype('float32'))
sl=C.slope_degrees(d,20,20); rg=C.roughness_plane3(d); h=C.slope_hist(sl)
o=dict(slope_hist=[round(float(v),5) for v in h],slope_p50=float(np.nanpercentile(sl,50)),slope_p90=float(np.nanpercentile(sl,90)),rough_p50=float(np.nanpercentile(rg,50)),
 relief_m=float(np.nanpercentile(d,95)-np.nanpercentile(d,5)),elev_mean_m=float(np.nanmean(d)),pixel_m=20.0,nan_frac=float(np.isnan(d).mean()),
 dem_source='USGS/JPL M20_JezeroCrater_CTXDEM_20m.tif (CTX stereo DEM, Equirectangular std parallel 18.4663), 1500x1500 px window at 20 m')
json.dump(o,open('results/jezero_20m.json','w')); print({k:round(v,2) for k,v in o.items() if isinstance(v,float)})
