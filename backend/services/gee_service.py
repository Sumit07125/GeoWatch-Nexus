"""
GeoWatch-Nexus Google Earth Engine acquisition service.

Geo-Nexus v3.2 runtime contract
--------------------------------
S2:
  COPERNICUS/S2_SR_HARMONIZED
  B2 B3 B4 B5 B6 B7 B8 B8A B9 B11 B12
  Cloud Score+ cs_cdf >= 0.60
  reflectance physical units internally; stored research-compatible TIFFs use x10000

S1:
  COPERNICUS/S1_GRD
  IW + VV + VH
  DESCENDING
  one common relativeOrbitNumber_start across T1/T2
  median in linear power
  focal_median(1.5, 'circle', 'pixels') when look count < 5
  stored research-compatible TIFFs use dB x100

Model grid:
  10 m/pixel
  128 x 128 pixels
  1,280 m x 1,280 m per model tile
  inference stride = 128

Temporal research protocol:
  T1 = [2020-01-01, 2020-04-01)
  T2 = [2024-01-01, 2024-04-01)

This module does not load PyTorch checkpoints.
"""

from __future__ import annotations

import io
import json
import math
import os
import uuid
import zipfile
from datetime import date
from pathlib import Path
from typing import Any, Callable

import ee
import requests
from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.ops import transform as shapely_transform

from services.model_registry import get_model_config, validate_model_contract


PATCH_PX = 128
RESOLUTION = 10
GROUND_M = PATCH_PX * RESOLUTION
MAX_GRID_PX = 10_000
DOWNLOAD_LIMIT_BYTES = 30 * 1024 * 1024
MAX_AOI_AREA_KM2 = 100.0
MAX_POINT_TILES = 5

S2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_SCORE_COLLECTION = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
S1_COLLECTION = "COPERNICUS/S1_GRD"
S2_BANDS = ["B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12"]
S1_BANDS = ["VV", "VH"]
CLEAR_THR = 0.60
OPTICAL_STORAGE_SCALE = 10_000
SAR_STORAGE_SCALE = 100
N_TARGET = 8.0

RESEARCH_WINDOWS = {
    "t1": ("2020-01-01", "2020-04-01"),
    "t2": ("2024-01-01", "2024-04-01"),
}

ProgressCallback = Callable[[str], None]


# ---------------------------------------------------------------------------
# Earth Engine initialization
# ---------------------------------------------------------------------------

_EE_INITIALISED = False


def _init_ee() -> None:
    global _EE_INITIALISED
    if _EE_INITIALISED:
        return

    project_id = os.getenv("GEE_PROJECT_ID", "satellite-based")
    sa_key = os.getenv("GEE_SERVICE_ACCOUNT_KEY")
    sa_email = os.getenv("GEE_SERVICE_ACCOUNT_EMAIL")

    try:
        if sa_key and sa_email:
            if not os.path.isfile(sa_key):
                raise FileNotFoundError(f"GEE service-account key not found: {sa_key}")
            credentials = ee.ServiceAccountCredentials(sa_email, sa_key)
            ee.Initialize(credentials=credentials, project=project_id)
        else:
            # Uses the locally configured Earth Engine / ADC credentials.
            ee.Initialize(project=project_id)
    except Exception as exc:
        raise RuntimeError(
            f"Earth Engine initialization failed. GEE says: {str(exc)}\n"
            "Please check your Google Cloud IAM permissions and GEE_PROJECT_ID."
        ) from exc

    _EE_INITIALISED = True


# ---------------------------------------------------------------------------
# Geometry / grid helpers
# ---------------------------------------------------------------------------

def _utm_epsg_from_lon(lon: float) -> int:
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    if not 1 <= zone <= 60:
        raise ValueError(f"Invalid UTM zone {zone} for longitude {lon}")
    return 32600 + zone


def _validate_lat_lon(lat: float, lon: float) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Invalid latitude: {lat}")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Invalid longitude: {lon}")


def _parse_tiles(value: str | int | None) -> int:
    if value is None:
        return 1
    if isinstance(value, int):
        tiles = value
    elif isinstance(value, str):
        raw = value.strip().lower()
        if raw.endswith("x"):
            raw = raw[:-1]
        if not raw.isdigit():
            raise ValueError("cover_area/analysis_tiles must be an integer from 1 to 5")
        tiles = int(raw)
    else:
        raise ValueError("cover_area/analysis_tiles must be an integer from 1 to 5")

    if not 1 <= tiles <= MAX_POINT_TILES:
        raise ValueError(f"cover_area must be between 1x and {MAX_POINT_TILES}x")
    return tiles


def _lat_lon_polygon(coordinates: list[list[float]]) -> Polygon:
    if not isinstance(coordinates, list) or len(coordinates) < 3:
        raise ValueError("Polygon AOI requires at least three coordinate pairs")

    ring: list[tuple[float, float]] = []
    for pair in coordinates:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError("AOI coordinates must use [lat, lon] pairs")
        lat = float(pair[0])
        lon = float(pair[1])
        _validate_lat_lon(lat, lon)
        ring.append((lon, lat))

    polygon = Polygon(ring)
    if polygon.is_empty or polygon.area <= 0:
        raise ValueError("AOI polygon has zero area")
    if not polygon.is_valid:
        raise ValueError("Invalid AOI polygon")
    return polygon


def _ee_polygon_from_lat_lon(coordinates: list[list[float]]) -> ee.Geometry:
    ring = []
    for lat, lon in coordinates:
        ring.append([float(lon), float(lat)])
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ee.Geometry.Polygon([ring], proj="EPSG:4326", geodesic=True)


def point_analysis_grid(lat: float, lon: float, nx: int = 1) -> dict[str, Any]:
    """Build a UTM-aligned square containing exactly nx x nx model tiles."""
    _validate_lat_lon(lat, lon)
    nx = _parse_tiles(nx)
    epsg = _utm_epsg_from_lon(lon)

    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    x, y = to_utm.transform(lon, lat)

    x = round(x / RESOLUTION) * RESOLUTION
    y = round(y / RESOLUTION) * RESOLUTION

    size_m = nx * GROUND_M
    half = size_m / 2.0
    xmin = x - half
    ymin = y - half
    xmax = x + half
    ymax = y + half

    grid = _grid_metadata(xmin, ymin, xmax, ymax, epsg)
    grid["centroid_lat"] = float(lat)
    grid["centroid_lon"] = float(lon)
    return grid


def _grid_metadata(xmin: float, ymin: float, xmax: float, ymax: float, epsg: int) -> dict[str, Any]:
    width_m = xmax - xmin
    height_m = ymax - ymin

    if width_m <= 0 or height_m <= 0:
        raise ValueError("Invalid analysis grid extent")

    width_px = int(round(width_m / RESOLUTION))
    height_px = int(round(height_m / RESOLUTION))

    if width_px % PATCH_PX != 0 or height_px % PATCH_PX != 0:
        raise ValueError("Analysis grid is not aligned to the 128-pixel model tile")

    if width_px > MAX_GRID_PX or height_px > MAX_GRID_PX:
        raise ValueError(
            f"Analysis grid exceeds Earth Engine download dimension limit: "
            f"{width_px}x{height_px} pixels"
        )

    return {
        "epsg": epsg,
        "crs": f"EPSG:{epsg}",
        "xmin": float(xmin),
        "ymin": float(ymin),
        "xmax": float(xmax),
        "ymax": float(ymax),
        "width_px": width_px,
        "height_px": height_px,
        "resolution_m": RESOLUTION,
        "patch_px": PATCH_PX,
        "tile_ground_m": GROUND_M,
        "transform": [RESOLUTION, 0.0, float(xmin), 0.0, -RESOLUTION, float(ymax)],
    }


def _polygon_analysis_grid(coordinates: list[list[float]]) -> tuple[dict[str, Any], Polygon]:
    polygon_wgs84 = _lat_lon_polygon(coordinates)
    centroid_lon = float(polygon_wgs84.centroid.x)
    epsg = _utm_epsg_from_lon(centroid_lon)

    to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    polygon_utm = shapely_transform(to_utm.transform, polygon_wgs84)
    area_km2 = float(polygon_utm.area) / 1_000_000.0
    if area_km2 <= 0.0:
        raise ValueError("AOI polygon has zero projected area")
    if area_km2 > MAX_AOI_AREA_KM2:
        raise ValueError(
            f"AOI is too large: {area_km2:.2f} km² (maximum {MAX_AOI_AREA_KM2:.2f} km²)"
        )

    minx, miny, maxx, maxy = polygon_utm.bounds
    tile = float(GROUND_M)

    xmin = math.floor(minx / tile) * tile
    ymin = math.floor(miny / tile) * tile
    xmax = math.ceil(maxx / tile) * tile
    ymax = math.ceil(maxy / tile) * tile

    grid = _grid_metadata(xmin, ymin, xmax, ymax, epsg)
    centroid_lat = float(polygon_wgs84.centroid.y)
    centroid_lon = float(polygon_wgs84.centroid.x)
    grid["centroid_lat"] = centroid_lat
    grid["centroid_lon"] = centroid_lon
    return grid, polygon_wgs84


def _geometry_from_request(
    aoi: dict[str, Any] | None,
    lat: float | None,
    lon: float | None,
    cover_area: str | int,
) -> tuple[ee.Geometry, ee.Geometry, dict[str, Any], str]:
    """
    Return (acquisition_grid, original_aoi, grid_metadata, input_shape_type).

    aoi coordinates are [lat, lon]. A GeoJSON object may also be supplied.
    """
    if aoi is None:
        if lat is None or lon is None:
            raise ValueError("lat/lon are required when no AOI geometry is supplied")
        grid = point_analysis_grid(float(lat), float(lon), _parse_tiles(cover_area))
        proj = ee.Projection(grid["crs"])
        geom = ee.Geometry.Rectangle(
            [grid["xmin"], grid["ymin"], grid["xmax"], grid["ymax"]],
            proj=proj,
            geodesic=False,
        )
        return geom, geom, grid, "point"

    # Canonical application payload: {shape_type, coordinates:[lat,lon]}
    shape_type = aoi.get("shape_type")
    coordinates = aoi.get("coordinates")

    # Optional GeoJSON payload.
    geometry = aoi.get("geojson") or aoi.get("geometry")
    if isinstance(geometry, dict) and geometry.get("type"):
        geometry_type = geometry["type"]
        if geometry_type == "Point":
            coords = geometry["coordinates"]
            if len(coords) != 2:
                raise ValueError("GeoJSON Point must contain [lon, lat]")
            lon_value, lat_value = float(coords[0]), float(coords[1])
            shape_type = "point"
            coordinates = [[lat_value, lon_value]]
        elif geometry_type == "Polygon":
            ring = geometry["coordinates"][0]
            coordinates = [[float(pair[1]), float(pair[0])] for pair in ring]
            shape_type = "polygon"
        else:
            raise ValueError("Only GeoJSON Point and Polygon are supported")

    if shape_type == "point":
        if not coordinates or len(coordinates) != 1:
            raise ValueError("point AOI requires exactly one [lat, lon] coordinate")
        center_lat = float(coordinates[0][0])
        center_lon = float(coordinates[0][1])
        grid = point_analysis_grid(
            center_lat,
            center_lon,
            _parse_tiles(aoi.get("analysis_tiles", aoi.get("cover_area", cover_area))),
        )
        proj = ee.Projection(grid["crs"])
        geom = ee.Geometry.Rectangle(
            [grid["xmin"], grid["ymin"], grid["xmax"], grid["ymax"]],
            proj=proj,
            geodesic=False,
        )
        return geom, geom, grid, "point"

    if shape_type not in ("polygon", "rectangle"):
        raise ValueError("AOI must be point, rectangle, or polygon")
    if not isinstance(coordinates, list):
        raise ValueError("AOI coordinates are required")

    grid, original_polygon = _polygon_analysis_grid(coordinates)
    proj = ee.Projection(grid["crs"])
    acquisition_geom = ee.Geometry.Rectangle(
        [grid["xmin"], grid["ymin"], grid["xmax"], grid["ymax"]],
        proj=proj,
        geodesic=False,
    )
    original_geom = _ee_polygon_from_lat_lon(coordinates)
    return acquisition_geom, original_geom, grid, shape_type


# ---------------------------------------------------------------------------
# Temporal protocol
# ---------------------------------------------------------------------------

def resolve_temporal_windows(
    temporal_mode: str = "research",
    before_start: str | None = None,
    before_end: str | None = None,
    after_start: str | None = None,
    after_end: str | None = None,
) -> tuple[tuple[str, str], tuple[str, str]]:
    if temporal_mode == "research":
        return RESEARCH_WINDOWS["t1"], RESEARCH_WINDOWS["t2"]

    if temporal_mode != "custom":
        raise ValueError("temporal_mode must be 'research' or 'custom'")

    values = (before_start, before_end, after_start, after_end)
    if not all(values):
        raise ValueError(
            "Custom temporal mode requires before_start, before_end, "
            "after_start, and after_end. No automatic 90-day expansion is used."
        )

    # Strict ISO validation and ordering.
    b0 = date.fromisoformat(before_start)
    b1 = date.fromisoformat(before_end)
    a0 = date.fromisoformat(after_start)
    a1 = date.fromisoformat(after_end)

    if b0 >= b1:
        raise ValueError("before_start must be earlier than before_end")
    if a0 >= a1:
        raise ValueError("after_start must be earlier than after_end")

    return (
        (b0.isoformat(), b1.isoformat()),
        (a0.isoformat(), a1.isoformat()),
    )


# ---------------------------------------------------------------------------
# S2
# ---------------------------------------------------------------------------

def _s2_collection(d0: str, d1: str, aoi: ee.Geometry):
    return (
        ee.ImageCollection(S2_COLLECTION)
        .filterBounds(aoi)
        .filterDate(d0, d1)
    )


def _optical_composite(d0: str, d1: str, aoi: ee.Geometry) -> ee.Image:
    s2 = _s2_collection(d0, d1, aoi)
    csp = ee.ImageCollection(CLOUD_SCORE_COLLECTION)

    masked = s2.linkCollection(csp, ["cs_cdf"]).map(
        lambda img: (
            img.updateMask(img.select("cs_cdf").gte(CLEAR_THR))
            .select(S2_BANDS)
            .divide(OPTICAL_STORAGE_SCALE)
            .copyProperties(img, ["system:time_start", "system:index"])
        )
    )

    n_clear = masked.select("B4").count().rename("n_clear").unmask(0)
    return masked.median().addBands(n_clear).clip(aoi)


def _s2_quality_summary(d0: str, d1: str, aoi: ee.Geometry) -> dict[str, float | int]:
    """Compute scene count and clear-observation statistics with minimal sync calls."""
    collection = _s2_collection(d0, d1, aoi)
    scene_count = int(collection.size().getInfo())
    if scene_count <= 0:
        raise ValueError(f"No Sentinel-2 scenes found for {d0} to {d1}")

    csp = ee.ImageCollection(CLOUD_SCORE_COLLECTION)
    masked = collection.linkCollection(csp, ["cs_cdf"]).map(
        lambda img: img.updateMask(
            img.select("cs_cdf").gte(CLEAR_THR)
        ).select("B4")
    )
    n_clear = masked.count().rename("n_clear").unmask(0)

    valid_fraction = n_clear.gt(0).reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=aoi,
        scale=RESOLUTION,
        maxPixels=100_000_000,
        bestEffort=True,
    ).get("n_clear")

    stats = n_clear.reduceRegion(
        reducer=ee.Reducer.mean().combine(
            reducer2=ee.Reducer.minMax(),
            sharedInputs=True,
        ),
        geometry=aoi,
        scale=RESOLUTION,
        maxPixels=100_000_000,
        bestEffort=True,
    ).getInfo() or {}

    result = {
        "scene_count": scene_count,
        "clear_coverage_fraction": float(valid_fraction.getInfo() or 0.0),
        "n_clear_mean": float(stats.get("n_clear_mean", 0.0)),
        "n_clear_min": int(stats.get("n_clear_min", 0)),
        "n_clear_max": int(stats.get("n_clear_max", 0)),
    }

    if result["clear_coverage_fraction"] <= 0.0:
        raise ValueError(
            f"Sentinel-2 scenes exist for {d0} to {d1}, but no pixel has a clear "
            f"observation at cs_cdf >= {CLEAR_THR:.2f}."
        )
    return result


# ---------------------------------------------------------------------------
# S1
# ---------------------------------------------------------------------------

def _s1_base(d0: str, d1: str, aoi: ee.Geometry):
    return (
        ee.ImageCollection(S1_COLLECTION)
        .filterBounds(aoi)
        .filterDate(d0, d1)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
    )


def _preferred_orbit_for_point(lat: float | None, lon: float | None, model_id: str) -> int | None:
    if lat is None or lon is None:
        return None

    config = get_model_config(model_id)
    for profile in config.get("research_zone_orbits", []):
        min_lon, min_lat, max_lon, max_lat = profile["bbox"]
        if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
            return int(profile["relative_orbit"])
    return None


def _get_common_relative_orbit(
    t1_start: str,
    t1_end: str,
    t2_start: str,
    t2_end: str,
    aoi: ee.Geometry,
    preferred_orbit: int | None = None,
) -> tuple[int, int, int]:
    t1 = _s1_base(t1_start, t1_end, aoi)
    t2 = _s1_base(t2_start, t2_end, aoi)

    t1_orbits = set(int(x) for x in (t1.aggregate_array("relativeOrbitNumber_start").distinct().getInfo() or []))
    t2_orbits = set(int(x) for x in (t2.aggregate_array("relativeOrbitNumber_start").distinct().getInfo() or []))
    common = sorted(t1_orbits & t2_orbits)

    if not common:
        raise ValueError(
            "No common descending Sentinel-1 relative orbit exists in both temporal windows."
        )

    if preferred_orbit is not None and preferred_orbit in common:
        selected = preferred_orbit
    else:
        # Choose the common orbit maximizing the weaker period's scene count.
        scores: list[tuple[int, int, int]] = []
        for orbit in common:
            n1 = int(t1.filter(ee.Filter.eq("relativeOrbitNumber_start", orbit)).size().getInfo())
            n2 = int(t2.filter(ee.Filter.eq("relativeOrbitNumber_start", orbit)).size().getInfo())
            scores.append((min(n1, n2), n1 + n2, orbit))
        selected = max(scores)[2]

    n1 = int(t1.filter(ee.Filter.eq("relativeOrbitNumber_start", selected)).size().getInfo())
    n2 = int(t2.filter(ee.Filter.eq("relativeOrbitNumber_start", selected)).size().getInfo())
    if n1 <= 0 or n2 <= 0:
        raise ValueError("Selected Sentinel-1 relative orbit has no observations in one period")

    return int(selected), n1, n2


def _sar_composite(d0: str, d1: str, aoi: ee.Geometry, relative_orbit: int) -> ee.Image:
    collection = (
        _s1_base(d0, d1, aoi)
        .filter(ee.Filter.eq("relativeOrbitNumber_start", relative_orbit))
        .select(S1_BANDS)
    )
    count = collection.size()

    if int(count.getInfo()) <= 0:
        raise ValueError(
            f"No Sentinel-1 VV/VH observations for orbit {relative_orbit} "
            f"during {d0} to {d1}"
        )

    def to_natural(img):
        return ee.Image(10).pow(img.divide(10.0))

    linear_median = collection.map(to_natural).median()
    despeckled = ee.Algorithms.If(
        count.lt(5),
        linear_median.focal_median(1.5, "circle", "pixels"),
        linear_median,
    )

    return (
        ee.Image(despeckled)
        .log10()
        .multiply(10.0)
        .clip(aoi)
    )


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _estimate_bytes(width_px: int, height_px: int, bands: int, bytes_per_sample: int = 2) -> int:
    return width_px * height_px * bands * bytes_per_sample


def _download_bytes(url: str, timeout: int = 120) -> bytes:
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.content


def _write_ee_geotiff(
    ee_image: ee.Image,
    out_path: Path,
    grid: dict[str, Any],
    bands: list[str] | None = None,
) -> None:
    params: dict[str, Any] = {
        "crs": grid["crs"],
        "crs_transform": grid["transform"],
        "dimensions": [grid["width_px"], grid["height_px"]],
        "format": "GEO_TIFF",
        "filePerBand": False,
    }
    if bands:
        params["bands"] = bands

    content = _download_bytes(ee_image.getDownloadURL(params))
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if content.startswith(b"PK\x03\x04"):
        with zipfile.ZipFile(io.BytesIO(content), "r") as archive:
            tif_names = [name for name in archive.namelist() if name.lower().endswith((".tif", ".tiff"))]
            if not tif_names:
                raise ValueError("Earth Engine ZIP did not contain a GeoTIFF")
            out_path.write_bytes(archive.read(tif_names[0]))
    else:
        out_path.write_bytes(content)


def _ee_to_png(
    ee_image: ee.Image,
    aoi: ee.Geometry,
    grid: dict[str, Any],
    size_px: int = 1024,
) -> bytes:
    size_px = max(128, min(int(size_px), 2048))
    url = ee_image.getThumbURL(
        {
            "bands": ["B4", "B3", "B2"],
            "min": 0,
            "max": 0.3,
            "region": aoi,
            "crs": grid["crs"],
            "format": "png",
            "dimensions": f"{size_px}x{size_px}",
        }
    )
    return _download_bytes(url, timeout=90)


def _storage_images(optical: ee.Image, sar: ee.Image) -> tuple[ee.Image, ee.Image]:
    """Create research-compatible raw storage images."""
    optical_raw = (
        optical.select(S2_BANDS)
        .multiply(OPTICAL_STORAGE_SCALE)
        .round()
        .toInt16()
        .addBands(optical.select("n_clear").round().toUint8())
    )
    sar_raw = sar.multiply(SAR_STORAGE_SCALE).round().toInt16()
    return optical_raw, sar_raw


def _build_tiles(grid: dict[str, Any]) -> list[dict[str, Any]]:
    rows = grid["height_px"] // PATCH_PX
    cols = grid["width_px"] // PATCH_PX
    tiles: list[dict[str, Any]] = []

    for row in range(rows):
        for col in range(cols):
            xmin = grid["xmin"] + col * GROUND_M
            xmax = xmin + GROUND_M
            ymax = grid["ymax"] - row * GROUND_M
            ymin = ymax - GROUND_M
            tiles.append(
                {
                    "row": row,
                    "col": col,
                    "id": f"tile_{row}_{col}",
                    "x_offset_px": col * PATCH_PX,
                    "y_offset_px": row * PATCH_PX,
                    "width_px": PATCH_PX,
                    "height_px": PATCH_PX,
                    "bounds_utm": [xmin, ymin, xmax, ymax],
                }
            )
    return tiles


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_image_pair(
    lat: float | None = None,
    lon: float | None = None,
    before_date: str | None = None,
    after_date: str | None = None,
    cover_area: str | int = "1x",
    pair_id: str | None = None,
    update_progress: ProgressCallback | None = None,
    *,
    aoi: dict[str, Any] | None = None,
    temporal_mode: str = "research",
    before_start: str | None = None,
    before_end: str | None = None,
    after_start: str | None = None,
    after_end: str | None = None,
    model_id: str = "geonexus_p4b_k30",
) -> dict[str, Any]:
    """
    Acquire a before/after S1+S2 pair without loading a model checkpoint.

    Backward compatibility:
      - lat/lon + cover_area still work for point AOIs.
      - before_date/after_date are retained as legacy parameters but are NOT
        interpreted as implicit 90-day windows.
      - use temporal_mode='custom' with all four explicit dates for custom runs.
    """
    config = get_model_config(model_id)
    validate_model_contract(model_id)

    if update_progress:
        update_progress("Initializing Earth Engine...")
    _init_ee()

    acquisition_geom, original_aoi_geom, grid, shape_type = _geometry_from_request(
        aoi=aoi,
        lat=lat,
        lon=lon,
        cover_area=cover_area,
    )

    if temporal_mode == "custom" and (before_date or after_date) and not all(
        [before_start, before_end, after_start, after_end]
    ):
        raise ValueError(
            "Custom mode requires four explicit dates: before_start, before_end, "
            "after_start, after_end. before_date/after_date are legacy fields and "
            "never create implicit 90-day windows."
        )

    t1, t2 = resolve_temporal_windows(
        temporal_mode=temporal_mode,
        before_start=before_start,
        before_end=before_end,
        after_start=after_start,
        after_end=after_end,
    )

    # In research mode, the trained K30 seasonal windows are authoritative.
    # Legacy before_date/after_date fields do not alter this contract.
    t1_start, t1_end = t1
    t2_start, t2_end = t2

    # Prefer the research-lock orbit for the three established project regions.
    center_lat = grid.get("centroid_lat")
    center_lon = grid.get("centroid_lon")
    preferred_orbit = _preferred_orbit_for_point(center_lat, center_lon, model_id)

    if update_progress:
        update_progress("Checking Sentinel-2 coverage and clear-pixel quality...")
    s2_quality_t1 = _s2_quality_summary(t1_start, t1_end, original_aoi_geom)
    s2_quality_t2 = _s2_quality_summary(t2_start, t2_end, original_aoi_geom)

    if update_progress:
        update_progress("Selecting a common descending Sentinel-1 relative orbit...")
    common_orbit, s1_count_t1, s1_count_t2 = _get_common_relative_orbit(
        t1_start,
        t1_end,
        t2_start,
        t2_end,
        acquisition_geom,
        preferred_orbit=preferred_orbit,
    )

    if update_progress:
        update_progress("Building T1 Sentinel-2/Sentinel-1 composites...")
    opt1 = _optical_composite(t1_start, t1_end, acquisition_geom)
    sar1 = _sar_composite(t1_start, t1_end, acquisition_geom, common_orbit)

    if update_progress:
        update_progress("Building T2 Sentinel-2/Sentinel-1 composites...")
    opt2 = _optical_composite(t2_start, t2_end, acquisition_geom)
    sar2 = _sar_composite(t2_start, t2_end, acquisition_geom, common_orbit)

    # Filesystem paths are always backend-generated. pair_id is metadata only.
    run_id = uuid.uuid4().hex
    requested_pair_id = str(pair_id)[:128] if pair_id is not None else None

    data_dir = Path(__file__).resolve().parent.parent / "data" / "runs" / run_id
    data_dir.mkdir(parents=True, exist_ok=True)

    optical1_raw, sar1_raw = _storage_images(opt1, sar1)
    optical2_raw, sar2_raw = _storage_images(opt2, sar2)

    # Research-scale limit check. At <= 30 MB estimate, a single exact-grid
    # download is safe; otherwise split into model tiles.
    optical_estimate = _estimate_bytes(grid["width_px"], grid["height_px"], 12, 2)
    use_full_download = optical_estimate <= DOWNLOAD_LIMIT_BYTES

    tile_files: dict[str, list[str]] = {"before_optical": [], "after_optical": [], "before_sar": [], "after_sar": []}

    if use_full_download:
        if update_progress:
            update_progress("Downloading research-compatible GeoTIFF stacks...")

        _write_ee_geotiff(optical1_raw, data_dir / "before_optical.tif", grid)
        _write_ee_geotiff(optical2_raw, data_dir / "after_optical.tif", grid)
        _write_ee_geotiff(sar1_raw, data_dir / "before_sar.tif", grid)
        _write_ee_geotiff(sar2_raw, data_dir / "after_sar.tif", grid)
    else:
        if update_progress:
            update_progress("AOI is too large for one download; acquiring 128x128 model tiles...")

        tile_dir = data_dir / "tiles"
        tile_dir.mkdir(parents=True, exist_ok=True)

        for tile in _build_tiles(grid):
            xmin, ymin, xmax, ymax = tile["bounds_utm"]
            tile_grid = _grid_metadata(xmin, ymin, xmax, ymax, grid["epsg"])
            for prefix, image, key in (
                ("before_optical", optical1_raw, "before_optical"),
                ("after_optical", optical2_raw, "after_optical"),
                ("before_sar", sar1_raw, "before_sar"),
                ("after_sar", sar2_raw, "after_sar"),
            ):
                path = tile_dir / f"{prefix}_r{tile['row']:04d}_c{tile['col']:04d}.tif"
                _write_ee_geotiff(image, path, tile_grid)
                tile_files[key].append(str(path))

    preview_size = min(1024, max(grid["width_px"], grid["height_px"]))
    if update_progress:
        update_progress("Creating RGB previews...")
    before_rgb = _ee_to_png(opt1, original_aoi_geom, grid, size_px=preview_size)
    after_rgb = _ee_to_png(opt2, original_aoi_geom, grid, size_px=preview_size)
    (data_dir / "before_rgb.png").write_bytes(before_rgb)
    (data_dir / "after_rgb.png").write_bytes(after_rgb)

    tiles = _build_tiles(grid)

    analysis_area_m2 = float(grid["width_px"] * grid["height_px"] * RESOLUTION * RESOLUTION)
    metadata = {
        "run_id": run_id,
        "analysis_area_m2": analysis_area_m2,
        "analysis_area_km2": analysis_area_m2 / 1_000_000.0,
        "requested_pair_id": requested_pair_id,
        "model_id": model_id,
        "shape_type": shape_type,
        "centroid": {
            "lat": grid.get("centroid_lat"),
            "lon": grid.get("centroid_lon"),
        },
        "temporal_mode": temporal_mode,
        "research_protocol": temporal_mode == "research",
        "t1_window": [t1_start, t1_end],
        "t2_window": [t2_start, t2_end],
        "crs": grid["crs"],
        "utm_epsg": grid["epsg"],
        "resolution_m": RESOLUTION,
        "patch_px": PATCH_PX,
        "tile_ground_m": GROUND_M,
        "grid": grid,
        "s2": {
            "collection": S2_COLLECTION,
            "bands": S2_BANDS,
            "cloud_score_collection": CLOUD_SCORE_COLLECTION,
            "cloud_score_band": "cs_cdf",
            "threshold": CLEAR_THR,
            "t1": s2_quality_t1,
            "t2": s2_quality_t2,
            "storage_scale": OPTICAL_STORAGE_SCALE,
        },
        "s1": {
            "collection": S1_COLLECTION,
            "instrument_mode": "IW",
            "pass": "DESCENDING",
            "relative_orbit": common_orbit,
            "preferred_relative_orbit": preferred_orbit,
            "t1_scene_count": s1_count_t1,
            "t2_scene_count": s1_count_t2,
            "storage_scale_db": SAR_STORAGE_SCALE,
            "median_domain": "linear_power",
            "low_look_threshold": 5,
            "low_look_filter": "focal_median(radius=1.5px, kernel=circle)",
        },
        "model_input": {
            "channels": config["channel_order"],
            "input_channels": config["input_channels"],
            "normalization_file": config["normalization_file"],
            "q_formula": "clip(n_clear / 8, 0, 1)",
            "storage_contract": {
                "optical": "int16 reflectance_x10000",
                "sar": "int16 db_x100",
                "n_clear": "uint8 count",
            },
        },
        "files": {
            "before_rgb": str(data_dir / "before_rgb.png"),
            "after_rgb": str(data_dir / "after_rgb.png"),
            "before_optical": str(data_dir / "before_optical.tif") if use_full_download else None,
            "after_optical": str(data_dir / "after_optical.tif") if use_full_download else None,
            "before_sar": str(data_dir / "before_sar.tif") if use_full_download else None,
            "after_sar": str(data_dir / "after_sar.tif") if use_full_download else None,
            "tiles": tile_files,
        },
        "tiles": tiles,
    }

    (data_dir / "run_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    return {
        **metadata,
        "opt1_img": opt1,
        "opt2_img": opt2,
        "sar1_img": sar1,
        "sar2_img": sar2,
        "aoi_geom": original_aoi_geom,
        "analysis_geom": acquisition_geom,
        "data_dir": str(data_dir),
    }
