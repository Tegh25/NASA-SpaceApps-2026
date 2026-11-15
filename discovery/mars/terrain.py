import sys, json, numpy as np, rasterio
sys.path.insert(0,'..')
import common as C
from rasterio.windows import Window, from_bounds
from scipy.ndimage import map_coordinates
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
R=3396190.0
SITES={'jezero':(18.45,77.50),'oxia':(18.28,-24.63),'gale':(-4.90,137.60),'meridiani':(-1.95,-5.53)}
URL='/vsicurl/https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif'
N=150; PX=200.0
out={}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif'):
    s=rasterio.open(URL); print('native px m',C.meters_per_pixel(s)); 
    for k,(lat,lon) in SITES.items():
        half=15000+3*PX
        dlat=np.degrees(half/R); dlon=np.degrees(half/(R*np.cos(np.radians(lat))))
        w=from_bounds(lon-dlon,lat-dlat,lon+dlon,lat+dlat,s.transform).round_offsets().round_lengths()
        a=s.read(1,window=w).astype('float64'); a[a==-32768]=np.nan
        wt=s.window_transform(w)
        # local grid
        ii,jj=np.meshgrid(np.arange(N),np.arange(N),indexing='ij')
        y=(N/2-ii-0.5)*PX; x=(jj+0.5-N/2)*PX
        la=lat+np.degrees(y/R); lo=lon+np.degrees(x/(R*np.cos(np.radians(la))))
        col=(lo-wt.c)/wt.a-0.5; row=(la-wt.f)/wt.e-0.5
        d=map_coordinates(a,[row,col],order=1,mode='nearest')
        np.save(f'data/{k}_dem200.npy',d.astype('float32'))
        sl=C.slope_degrees(d,PX,PX); rg=C.roughness_plane3(d); h=C.slope_hist(sl)
        out[k]=dict(slope_hist=[round(float(v),5) for v in h],slope_p50=float(np.nanpercentile(sl,50)),slope_p90=float(np.nanpercentile(sl,90)),
            rough_p50=float(np.nanpercentile(rg,50)),relief_m=float(np.nanpercentile(d,95)-np.nanpercentile(d,5)),elev_mean_m=float(np.nanmean(d)),
            elev_min_m=float(d.min()),elev_max_m=float(d.max()),frac_slope_lt15=float((sl<15).mean()),pixel_m=PX,shape=list(d.shape),
            dem_source='USGS Astrogeology Mars HRSC+MOLA blended DEM global 200 m v2 (Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif), resampled bilinear to local 200 m grid; sphere R=3396190 m')
        print(k,{q:round(v,2) for q,v in out[k].items() if isinstance(v,float)})
        hs=C.hillshade(d,PX,PX)
        fig,ax=plt.subplots(1,2,figsize=(10,5))
        ax[0].imshow(hs,cmap='gray'); ax[0].set_title(f'{k} hillshade 200 m (30x30 km)')
        im=ax[1].imshow(d,cmap='terrain'); plt.colorbar(im,ax=ax[1],label='m'); ax[1].set_title('elevation')
        for q in ax: q.axis('off')
        plt.tight_layout(); plt.savefig(f'previews/mars_{k}.png',dpi=80); plt.close()
json.dump(out,open('results/terrain_200m.json','w'))
