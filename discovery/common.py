"""Shared helpers: same terrain maths for Mars, Moon and Earth DEMs."""
import numpy as np
from scipy import ndimage as ndi

SLOPE_BINS = np.arange(0, 46)  # 0..45 degrees, 1-degree bins


def meters_per_pixel(src):
    """(dx_m, dy_m) for a rasterio dataset. Works for projected (metres) and geographic (degrees) grids."""
    xres, yres = abs(src.transform.a), abs(src.transform.e)
    crs = src.crs
    if crs is not None and crs.is_geographic:
        radius = 6378137.0  # Earth default
        try:
            from pyproj import CRS as PCRS
            radius = PCRS.from_wkt(crs.to_wkt()).ellipsoid.semi_major_metre
        except Exception:
            pass
        lat = (src.bounds.top + src.bounds.bottom) / 2.0
        mpd = radius * np.pi / 180.0
        return xres * mpd * np.cos(np.radians(lat)), yres * mpd
    return xres, yres


def slope_degrees(dem, dx, dy):
    gy, gx = np.gradient(dem.astype("float64"), dy, dx)  # axis0 = rows (y), axis1 = cols (x)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def roughness_plane3(dem):
    """Residual std (metres) after fitting a plane in each 3x3 window. NaN where any input is NaN."""
    valid = np.isfinite(dem)
    z = np.where(valid, dem, np.nanmedian(dem) if valid.any() else 0.0).astype("float64")
    ones = np.ones((3, 3))
    kx = np.array([[-1, 0, 1]] * 3, dtype="float64")
    ky = kx.T
    sz = ndi.correlate(z, ones, mode="nearest")
    sz2 = ndi.correlate(z * z, ones, mode="nearest")
    sxz = ndi.correlate(z, kx, mode="nearest")
    syz = ndi.correlate(z, ky, mode="nearest")
    ssr = sz2 - sz * sz / 9.0 - sxz * sxz / 6.0 - syz * syz / 6.0
    rough = np.sqrt(np.maximum(ssr, 0.0) / 6.0)
    bad = ndi.minimum_filter(valid.astype("uint8"), size=3) == 0
    rough[bad] = np.nan
    return rough


def hillshade(dem, dx, dy, az=315.0, alt=30.0):
    gy, gx = np.gradient(np.nan_to_num(dem.astype("float64"), nan=np.nanmedian(dem)), dy, dx)
    a, h = np.radians(az), np.radians(alt)
    shade = (np.cos(h) * np.sin(a) * (-gx) + np.cos(h) * np.cos(a) * gy + np.sin(h)) / np.sqrt(1 + gx * gx + gy * gy)
    return np.clip(shade, 0, 1)


def slope_hist(slope):
    s = slope[np.isfinite(slope)]
    if s.size == 0:
        return np.zeros(len(SLOPE_BINS) - 1)
    h, _ = np.histogram(np.clip(s, 0, 44.999), bins=SLOPE_BINS)
    return h / h.sum()


def wasserstein_slope(h1, h2):
    """Earth-mover distance between two slope histograms, in degrees."""
    return float(np.abs(np.cumsum(h1) - np.cumsum(h2)).sum())


def tile_name(lat, lon):
    la, lo = int(np.floor(lat)), int(np.floor(lon))
    ns = "N" if la >= 0 else "S"
    ew = "E" if lo >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00_DEM"


def tile_url(name):
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def haversine_km(lat1, lon1, lat2, lon2, radius=6371.0):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * radius * np.arcsin(np.sqrt(a))
