#!/usr/bin/env python3
"""Open ANY planetary / Earth-observation file and tell you what it is.

Usage:
  python inspect_file.py data/mars/some_file.tif
  python inspect_file.py data/                    # every file in a folder
  python inspect_file.py file.nc --var reflectance --band 40
Writes a quick-look PNG into previews/.
"""
import argparse, os, re, sys, zipfile
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
PREV = os.path.join(HERE, "previews")
os.makedirs(PREV, exist_ok=True)

PDS_TYPES = {
    "LSB_INTEGER": "<i", "PC_INTEGER": "<i", "MSB_INTEGER": ">i", "MAC_INTEGER": ">i", "SUN_INTEGER": ">i",
    "LSB_UNSIGNED_INTEGER": "<u", "PC_UNSIGNED_INTEGER": "<u", "MSB_UNSIGNED_INTEGER": ">u", "MAC_UNSIGNED_INTEGER": ">u",
    "UNSIGNED_INTEGER": ">u", "INTEGER": ">i",
    "IEEE_REAL": ">f", "PC_REAL": "<f", "MSB_REAL": ">f", "LSB_REAL": "<f", "FLOAT": ">f",
}


def sniff(path):
    with open(path, "rb") as f:
        head = f.read(4096)
    if head[:4] == b"\x89HDF":
        return "HDF5 / NetCDF-4"
    if head[:3] == b"CDF":
        return "NetCDF classic"
    if head[:4] in (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+"):
        return "TIFF / GeoTIFF"
    if head[4:12] == b"jP  \r\n\x87\n" or head[:4] == b"\xff\x4f\xff\x51":
        return "JPEG2000"
    if head[:4] == b"PK\x03\x04":
        return "ZIP archive"
    txt = head.decode("latin-1", errors="ignore")
    if "PDS_VERSION_ID" in txt or txt.startswith("CCSD3ZF"):
        return "PDS3 label (text) - describes a binary .IMG/.TAB next to it"
    if "<?xml" in txt[:100] and "Product_" in txt:
        return "PDS4 label (XML) - describes a data file next to it"
    if "Object = IsisCube" in txt:
        return "ISIS3 cube (USGS planetary format)"
    printable = sum(32 <= b < 127 or b in (9, 10, 13) for b in head)
    if head and printable / len(head) > 0.95:
        return "plain text / table"
    return "raw binary (no header) - probably a PDS .IMG; needs its .LBL"


def parse_pds3(text):
    d = {}
    for line in text.splitlines():
        m = re.match(r"\s*(\^?[A-Za-z_0-9:]+)\s*=\s*(.+?)\s*$", line)
        if m:
            d.setdefault(m.group(1).upper(), m.group(2).strip())
    return d


def num(v, default=None):
    if v is None:
        return default
    m = re.match(r"\s*[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?", v)
    return float(m.group(0)) if m else default


def read_pds3_manual(lbl_path):
    """Fallback reader for a detached PDS3 label + raw .IMG (single band)."""
    text = open(lbl_path, "r", errors="ignore").read()
    d = parse_pds3(text)
    ptr = d.get("^IMAGE") or d.get("^IMAGE_HEADER")
    lines, samples = int(num(d.get("LINES"))), int(num(d.get("LINE_SAMPLES")))
    bits = int(num(d.get("SAMPLE_BITS"), 16))
    stype = d.get("SAMPLE_TYPE", "LSB_INTEGER").strip('"').upper()
    prefix = PDS_TYPES.get(stype, "<i")
    dt = np.dtype(f"{prefix}{bits // 8}")
    img = None
    offset = 0
    if ptr and '"' in ptr:
        img = re.search(r'"([^"]+)"', ptr).group(1)
    elif ptr and re.match(r"\s*\d+", ptr):
        n = int(num(ptr))
        rb = int(num(d.get("RECORD_BYTES"), 1))
        offset = (n - 1) * (1 if "BYTES" in ptr.upper() else rb)
        img = os.path.basename(lbl_path)
    base = os.path.dirname(lbl_path)
    cand = [os.path.join(base, img)] if img else []
    stem = os.path.splitext(lbl_path)[0]
    cand += [stem + e for e in (".IMG", ".img", ".Img")]
    path = next((c for c in cand if os.path.exists(c)), None)
    if path is None:
        raise FileNotFoundError("label points to an image file that is not next to it: %s" % (img,))
    arr = np.fromfile(path, dtype=dt, offset=offset, count=lines * samples).reshape(lines, samples)
    scale, off = num(d.get("SCALING_FACTOR"), 1.0), num(d.get("OFFSET"), 0.0)
    arr = arr.astype("float64")
    mc = num(d.get("MISSING_CONSTANT"))
    if mc is not None:
        arr[arr == mc] = np.nan          # mask "no data" BEFORE applying scale/offset
    arr = arr * scale + off
    meta = {k: d[k] for k in ("TARGET_NAME", "MAP_PROJECTION_TYPE", "MAP_SCALE", "MAP_RESOLUTION", "A_AXIS_RADIUS",
                              "CENTER_LATITUDE", "CENTER_LONGITUDE", "UNIT", "SCALING_FACTOR", "OFFSET",
                              "MISSING_CONSTANT", "SAMPLE_TYPE", "SAMPLE_BITS", "LINES", "LINE_SAMPLES") if k in d}
    return arr, meta, path


def stats_and_preview(arr, name, title, nodata=None):
    a = np.asarray(arr, dtype="float64")
    if nodata is not None and np.isfinite(nodata):
        a = np.where(a == nodata, np.nan, a)
    a = np.where(np.abs(a) > 1e30, np.nan, a)
    step = max(1, int(max(a.shape) // 1200))
    small = a[::step, ::step]
    f = small[np.isfinite(small)]
    if f.size == 0:
        print("   (no valid pixels in the decimated view)")
        return
    lo, hi = np.percentile(f, [2, 98])
    print(f"   values: min={np.nanmin(f):.4g}  p2={lo:.4g}  median={np.median(f):.4g}  p98={hi:.4g}  max={np.nanmax(f):.4g}")
    fig, ax = plt.subplots(figsize=(7, 7 * small.shape[0] / max(small.shape[1], 1) + 0.6))
    im = ax.imshow(small, cmap="gray", vmin=lo, vmax=hi)
    ax.set_title(title, fontsize=8)
    ax.axis("off")
    fig.colorbar(im, ax=ax, shrink=0.6)
    out = os.path.join(PREV, re.sub(r"[^A-Za-z0-9_.-]", "_", name) + ".png")
    fig.savefig(out, dpi=110, bbox_inches="tight")
    plt.close(fig)
    print("   quick-look image ->", os.path.relpath(out, HERE))


def do_raster(path, kind):
    try:
        import rasterio
    except ImportError:
        print("   rasterio not installed: run  bash setup.sh  then  source .venv/bin/activate")
        return False
    stem, ext = os.path.splitext(path)
    cands = [path]
    if ext.lower() in (".img", ".dat"):
        cands += [stem + e for e in (".LBL", ".lbl", ".xml", ".XML")]
    for c in cands:
        if not os.path.exists(c):
            continue
        try:
            with rasterio.open(c) as src:
                print(f"   opened with GDAL/rasterio via: {os.path.basename(c)}   driver={src.driver}")
                print(f"   size: {src.width} x {src.height} pixels, {src.count} band(s), dtype={src.dtypes[0]}")
                print(f"   CRS: {str(src.crs)[:110] if src.crs else 'none (no map projection in file)'}")
                print(f"   pixel size: {src.res[0]:.6g} x {src.res[1]:.6g} (CRS units)   bounds: {tuple(round(b, 4) for b in src.bounds)}")
                sc, of = src.scales[0], src.offsets[0]
                if sc != 1 or of != 0:
                    print(f"   scale/offset stored in file: x{sc} + {of}")
                if src.nodata is not None:
                    print("   nodata value:", src.nodata)
                step = max(1, int(max(src.width, src.height) // 1200))
                arr = src.read(1, out_shape=(src.height // step, src.width // step)).astype("float64")
                if sc != 1 or of != 0:
                    arr = arr * sc + of
                stats_and_preview(arr, os.path.basename(path), os.path.basename(path), src.nodata)
                return True
        except Exception as e:
            print(f"   GDAL could not open {os.path.basename(c)}: {str(e).splitlines()[0][:100]}")
    lbl = next((stem + e for e in (".LBL", ".lbl") if os.path.exists(stem + e)), path if kind.startswith("PDS3") else None)
    if lbl:
        try:
            arr, meta, p = read_pds3_manual(lbl)
            print("   read with the built-in PDS3 reader (GDAL could not):", os.path.basename(p))
            for k, v in meta.items():
                print(f"     {k} = {v}")
            stats_and_preview(arr, os.path.basename(path), os.path.basename(path), None)
            return True
        except Exception as e:
            print("   manual PDS3 read failed:", e)
    return False


def do_netcdf(path, var, band):
    import netCDF4
    ds = netCDF4.Dataset(path)
    print("   global attributes:", ", ".join(list(ds.ncattrs())[:8]) or "(none)")

    def walk(g, prefix=""):
        out = []
        for name, v in g.variables.items():
            out.append((prefix + name, v))
        for gname, sub in g.groups.items():
            out += walk(sub, prefix + gname + "/")
        return out

    allv = walk(ds)
    print(f"   {len(allv)} variables (group/name  dims  shape):")
    for n, v in allv[:40]:
        print(f"     {n:45s} {str(v.dimensions):40s} {v.shape}")
    pick = None
    if var:
        pick = next((x for x in allv if x[0] == var or x[0].endswith("/" + var)), None)
    if pick is None:
        pick = next((x for x in allv if len(x[1].shape) >= 2 and x[1].size > 1000 and not x[0].lower().endswith(("lat", "lon", "latitude", "longitude"))), None)
    if pick:
        n, v = pick
        print("   previewing variable:", n)
        arr = np.ma.filled(v[:].astype("float64"), np.nan) if hasattr(v[:], "filled") else np.asarray(v[:], dtype="float64")
        if arr.ndim == 3:
            idx = band if band is not None else arr.shape[2] // 2 if arr.shape[2] < arr.shape[0] else arr.shape[0] // 2
            arr = arr[:, :, idx] if arr.shape[2] < arr.shape[0] else arr[idx]
            print(f"   (3-D variable: showing slice {idx}; use --band N to change)")
        elif arr.ndim > 3:
            arr = arr.reshape(arr.shape[-2:])
        fv = getattr(v, "_FillValue", None)
        stats_and_preview(arr, os.path.basename(path) + "_" + n.replace("/", "_"), os.path.basename(path) + " :: " + n, fv)
    ds.close()


def do_table(path):
    import pandas as pd
    size = os.path.getsize(path) / 1e6
    print(f"   file size: {size:.1f} MB  (reading only the first 200,000 rows)")
    try:
        df = pd.read_csv(path, nrows=200000, skipinitialspace=True, sep=None, engine="python")
    except Exception as e:
        print("   could not parse as a table:", e)
        return
    print("   columns:", list(df.columns))
    print(df.head(5).to_string(max_colwidth=18))
    print(df.describe().T.head(12).to_string())


def inspect(path, var=None, band=None):
    print("\n==", os.path.relpath(path, os.getcwd()))
    size = os.path.getsize(path)
    kind = sniff(path)
    print(f"   {size/1e6:.2f} MB  | looks like: {kind}")
    ext = os.path.splitext(path)[1].lower()
    if kind.startswith(("PDS3", "PDS4")) and ext in (".lbl", ".xml"):
        text = open(path, "r", errors="ignore").read(200000)
        d = parse_pds3(text)
        pointers = {k: v for k, v in d.items() if k.startswith("^")}
        print("   this is a LABEL: a text description of the data file(s):", pointers or "(see content)")
        for k in ("LINES", "LINE_SAMPLES", "SAMPLE_BITS", "SAMPLE_TYPE", "SCALING_FACTOR", "OFFSET", "MAP_PROJECTION_TYPE",
                  "MAP_RESOLUTION", "TARGET_NAME", "UNIT"):
            if k in d:
                print(f"     {k} = {d[k]}")
        if "^IMAGE" in d or kind.startswith("PDS3"):
            do_raster(path, kind)
        return
    if kind.startswith("ZIP"):
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
        print(f"   zip with {len(names)} files, e.g.: {names[:8]}   -> unzip it, then inspect the contents")
        return
    if "NetCDF" in kind or ext in (".nc", ".nc4") or kind.startswith("HDF5"):
        do_netcdf(path, var, band)
        return
    if kind.startswith(("TIFF", "raw binary", "ISIS", "JPEG2000")) or ext in (".img", ".tif", ".tiff", ".cub", ".jp2"):
        if not do_raster(path, kind):
            print("   could not open as a raster. If this is a .IMG, put its .LBL file in the same folder with the same name.")
        return
    if kind.startswith("plain text") or ext in (".tab", ".csv", ".txt"):
        do_table(path)
        return
    print("   unknown format: send me the file name and I'll add support.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--var")
    ap.add_argument("--band", type=int)
    a = ap.parse_args()
    files = []
    for p in a.paths:
        if os.path.isdir(p):
            for r, _, fs in os.walk(p):
                files += [os.path.join(r, f) for f in sorted(fs) if not f.startswith(".") and not f.endswith(".part")]
        else:
            files.append(p)
    for f in files:
        try:
            inspect(f, a.var, a.band)
        except Exception as e:
            print(f"   ERROR reading {f}: {e}")


if __name__ == "__main__":
    main()
