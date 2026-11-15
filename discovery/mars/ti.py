import json, numpy as np, urllib.request
D='https://pds-geosciences.wustl.edu/mgs/mgs-m-tes-5-timap-v1/mgst_9001/data/'
SITES={'jezero':(18.45,77.50),'oxia':(18.28,-24.63),'gale':(-4.90,137.60),'meridiani':(-1.95,-5.53)}
R=3396000.0; W=7200; PPD=20.0
def rows(fn,r0,r1,bytes_per):
    rb=W*bytes_per; req=urllib.request.Request(D+fn,headers={'Range':f'bytes={r0*rb}-{(r1+1)*rb-1}'})
    b=urllib.request.urlopen(req).read(); dt='>i2' if bytes_per==2 else 'u1'
    return np.frombuffer(b,dtype=dt).reshape(r1-r0+1,W)
out={}
for k,(lat,lon) in SITES.items():
    d=np.degrees(15000/R); dl=d/np.cos(np.radians(lat))
    r0=int(np.floor((90-(lat+d))*PPD)); r1=int(np.ceil((90-(lat-d))*PPD))-1
    c0=int(np.floor((lon-dl+180)*PPD)); c1=int(np.ceil((lon+dl+180)*PPD))-1
    o={'rows':[r0,r1],'cols':[c0,c1]}
    for t in ('day','night'):
        ti=rows(f'global_ti_{t}_2007.img',r0,r1,2)[:,c0:c1+1].astype(float)
        mk=rows(f'global_ti_msk_{t}_2007.img',r0,r1,1)[:,c0:c1+1]
        ok=(mk!=0)&(ti>0)
        v=ti[ok]
        o[t]=dict(n_total=int(ti.size),n_valid_noninterp=int(ok.sum()),mean_all=float(ti[ti>0].mean()) if (ti>0).any() else None,
                  mean_noninterp=float(v.mean()) if v.size else None,median_noninterp=float(np.median(v)) if v.size else None,min=float(ti[ti>0].min()),max=float(ti.max()))
    out[k]=o; print(k,json.dumps(o))
json.dump(out,open('results/ti_sampled.json','w'))
