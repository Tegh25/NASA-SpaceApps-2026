import json, numpy as np, rasterio
from rasterio.windows import from_bounds
SITES={'jezero':(18.45,77.50),'oxia':(18.28,-24.63),'gale':(-4.90,137.60),'meridiani':(-1.95,-5.53)}
R=3396000.0; out={}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
    s=rasterio.open('/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif')
    a=s.read(1).astype('float64'); a[a<-1e30]=np.nan
    print(np.nanmin(a),np.nanmax(a))
    for k,(lat,lon) in SITES.items():
        d=np.degrees(15000/R)  # half-width 15 km in degrees (lat)
        dlon=d/np.cos(np.radians(lat))
        m=lambda v:np.radians(v)*R
        w=from_bounds(m(lon-dlon),m(lat-d),m(lon+dlon),m(lat+d),s.transform)
        r0,r1=int(np.floor(w.row_off)),int(np.ceil(w.row_off+w.height)); c0,c1=int(np.floor(w.col_off)),int(np.ceil(w.col_off+w.width))
        blk=a[r0:r1,c0:c1]
        # pixel containing centre
        r,c=s.index(m(lon),m(lat)); 
        out[k]=dict(window_mean=float(np.nanmean(blk)),window_min=float(np.nanmin(blk)),window_max=float(np.nanmax(blk)),npx=int(blk.size),centre_px=float(a[r,c]),block=[r0,r1,c0,c1])
        print(k,out[k])
json.dump(out,open('results/albedo_sampled.json','w'))
