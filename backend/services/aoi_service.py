"""
GeoWatch-Nexus AOI service.

Canonical application geometry contract
---------------------------------------
- API coordinate order: [lat, lon]
- GeoJSON input order: [lon, lat], converted immediately to [lat, lon]
- Polygon/rectangle area: WGS84 -> local UTM -> m²/hectares/km²
- Point AOI: analysis center, expanded to an exact 1280 m model-tile footprint
- Maximum polygon/rectangle area: 100 km²
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.ops import transform as shapely_transform
from shapely.validation import explain_validity

from models.aoi import AOI
from models.database import get_db


MAX_AOI_AREA_KM2 = 100.0
DEFAULT_POINT_TILES = 1
MAX_POINT_TILES = 5
PATCH_PX = 128
RESOLUTION_M = 10
TILE_GROUND_M = PATCH_PX * RESOLUTION_M
GEOMETRY_VERSION = "geowatch-aoi-v4"


def _utm_epsg_from_lon(lon: float) -> int:
    zone = int((lon + 180.0) // 6.0) + 1
    if not 1 <= zone <= 60:
        raise ValueError(f"Longitude produced invalid UTM zone: {zone}")
    return 32600 + zone


def _validate_lat_lon(lat: float, lon: float) -> None:
    if not -90.0 <= lat <= 90.0:
        raise ValueError(f"Invalid latitude: {lat}")
    if not -180.0 <= lon <= 180.0:
        raise ValueError(f"Invalid longitude: {lon}")


def validate_point_coordinate(coordinate: Any) -> tuple[float, float]:
    if not isinstance(coordinate, (list, tuple)) or len(coordinate) != 2:
        raise ValueError("Point must be [lat, lon]")
    try:
        lat = float(coordinate[0])
        lon = float(coordinate[1])
    except (TypeError, ValueError) as exc:
        raise ValueError("Point coordinates must be numeric") from exc
    _validate_lat_lon(lat, lon)
    return lat, lon


def _parse_point_tiles(settings: dict[str, Any] | None) -> int:
    settings = settings or {}
    raw = settings.get("analysis_tiles", settings.get("cover_area", DEFAULT_POINT_TILES))

    if isinstance(raw, bool):
        raise ValueError("analysis_tiles must be an integer from 1 to 5")
    if isinstance(raw, int):
        tiles = raw
    elif isinstance(raw, str):
        value = raw.strip().lower()
        if value.endswith("x"):
            value = value[:-1]
        if not value.isdigit():
            raise ValueError("analysis_tiles/cover_area must be an integer from 1 to 5")
        tiles = int(value)
    else:
        raise ValueError("analysis_tiles/cover_area must be an integer from 1 to 5")

    if not 1 <= tiles <= MAX_POINT_TILES:
        raise ValueError(f"analysis_tiles must be between 1 and {MAX_POINT_TILES}")
    return tiles


def _polygon_from_lat_lon(coordinates: list[list[float]]) -> Polygon:
    if not isinstance(coordinates, list) or len(coordinates) < 3:
        raise ValueError("Polygon requires at least 3 coordinate pairs")

    lon_lat: list[tuple[float, float]] = []
    for pair in coordinates:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError("Every polygon coordinate must be [lat, lon]")
        lat, lon = validate_point_coordinate(pair)
        lon_lat.append((lon, lat))

    if lon_lat[0] != lon_lat[-1]:
        lon_lat.append(lon_lat[0])

    polygon = Polygon(lon_lat)
    if polygon.is_empty:
        raise ValueError("AOI polygon is empty")
    if not polygon.is_valid:
        raise ValueError(f"Invalid AOI polygon: {explain_validity(polygon)}")
    if polygon.area <= 0:
        raise ValueError("AOI polygon has zero area")
    return polygon


def _geojson_to_lat_lon(data: dict[str, Any]) -> tuple[str, list[list[float]]]:
    geometry_type = data.get("type")
    coords = data.get("coordinates")

    if geometry_type == "Point":
        if not isinstance(coords, (list, tuple)) or len(coords) != 2:
            raise ValueError("GeoJSON Point coordinates must be [lon, lat]")
        lon, lat = float(coords[0]), float(coords[1])
        _validate_lat_lon(lat, lon)
        return "point", [[lat, lon]]

    if geometry_type == "Polygon":
        if not isinstance(coords, list) or not coords or not isinstance(coords[0], list):
            raise ValueError("GeoJSON Polygon coordinates are empty")
        ring = coords[0]
        lat_lon: list[list[float]] = []
        for pair in ring:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                raise ValueError("GeoJSON Polygon coordinates must be [lon, lat]")
            lon, lat = float(pair[0]), float(pair[1])
            _validate_lat_lon(lat, lon)
            lat_lon.append([lat, lon])
        return "polygon", lat_lon

    raise ValueError("Only GeoJSON Point and Polygon are supported")


def _same_utm_zone(polygon: Polygon, centroid_lon: float) -> bool:
    target = _utm_epsg_from_lon(centroid_lon)
    for lon, _lat in polygon.exterior.coords:
        if _utm_epsg_from_lon(float(lon)) != target:
            return False
    return True


def calculate_geometry_area(coordinates: list[list[float]]) -> dict[str, float | int]:
    polygon = _polygon_from_lat_lon(coordinates)
    centroid_lon = float(polygon.centroid.x)

    if not _same_utm_zone(polygon, centroid_lon):
        raise ValueError(
            "AOI crosses a UTM zone boundary. Keep the analysis AOI inside one UTM zone."
        )

    utm_epsg = _utm_epsg_from_lon(centroid_lon)
    transformer = Transformer.from_crs(
        "EPSG:4326",
        f"EPSG:{utm_epsg}",
        always_xy=True,
    )
    projected = shapely_transform(transformer.transform, polygon)
    area_m2 = float(projected.area)
    area_km2 = area_m2 / 1_000_000.0

    if area_km2 <= 0:
        raise ValueError("AOI polygon has zero projected area")
    if area_km2 > MAX_AOI_AREA_KM2:
        raise ValueError(
            f"AOI is too large: {area_km2:.2f} km² "
            f"(maximum {MAX_AOI_AREA_KM2:.2f} km²)"
        )

    return {
        "area_m2": area_m2,
        "area_hectares": area_m2 / 10_000.0,
        "area_km2": area_km2,
        "utm_epsg": utm_epsg,
    }


def calculate_point_analysis_area(tiles: int = DEFAULT_POINT_TILES) -> dict[str, float | int]:
    if not 1 <= tiles <= MAX_POINT_TILES:
        raise ValueError(f"analysis_tiles must be between 1 and {MAX_POINT_TILES}")

    side_m = float(tiles * TILE_GROUND_M)
    area_m2 = side_m * side_m
    return {
        "area_m2": area_m2,
        "area_hectares": area_m2 / 10_000.0,
        "area_km2": area_m2 / 1_000_000.0,
    }


def _normalise_input(data: dict[str, Any]) -> tuple[str, list[list[float]]]:
    geometry = data.get("geojson") or data.get("geometry")
    if isinstance(geometry, dict) and geometry.get("type"):
        return _geojson_to_lat_lon(geometry)

    coordinates = data.get("coordinates")
    shape_type = data.get("shape_type")

    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("coordinates must be a non-empty list of [lat, lon] pairs")
    if shape_type not in {"polygon", "rectangle", "point"}:
        raise ValueError("shape_type must be 'polygon', 'rectangle', or 'point'")

    if shape_type == "point":
        if len(coordinates) != 1:
            raise ValueError("point requires exactly one coordinate pair")
        validate_point_coordinate(coordinates[0])
    else:
        minimum = 4 if shape_type == "rectangle" else 3
        if len(coordinates) < minimum:
            raise ValueError(f"{shape_type} requires at least {minimum} coordinate pairs")
        _polygon_from_lat_lon(coordinates)

    return shape_type, coordinates


def _build_settings(
    settings: dict[str, Any],
    shape_type: str,
    coordinates: list[list[float]],
    area_info: dict[str, float | int],
) -> dict[str, Any]:
    out = dict(settings)
    out.update(
        {
            "geometry_version": GEOMETRY_VERSION,
            "coordinate_order": "lat_lon",
            "area_m2": float(area_info["area_m2"]),
            "area_hectares": float(area_info["area_hectares"]),
            "area_km2": float(area_info["area_km2"]),
            "utm_epsg": int(area_info["utm_epsg"]),
            "input_shape_type": shape_type,
            "input_coordinates": coordinates,
        }
    )
    return out


def create_aoi(data: dict[str, Any]):
    try:
        shape_type, coordinates = _normalise_input(data)
        settings = dict(data.get("settings") or {})

        if shape_type == "point":
            tiles = _parse_point_tiles(settings)
            area_info = calculate_point_analysis_area(tiles)
            _lat, lon = validate_point_coordinate(coordinates[0])
            area_info["utm_epsg"] = _utm_epsg_from_lon(lon)
            settings["analysis_tiles"] = tiles
        else:
            area_info = calculate_geometry_area(coordinates)

        settings = _build_settings(settings, shape_type, coordinates, area_info)

        aoi = AOI(
            name=data.get("name", "Untitled AOI"),
            description=data.get("description", ""),
            shape_type=shape_type,
            coordinates=coordinates,
            area_hectares=float(area_info["area_hectares"]),
            settings=settings,
        )

        db = next(get_db())
        try:
            db.add(aoi)
            db.commit()
            db.refresh(aoi)
            return aoi.to_dict(), None
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    except (TypeError, ValueError) as exc:
        return None, str(exc)


def get_all_aois():
    db = next(get_db())
    try:
        aois = db.query(AOI).order_by(AOI.created_at.desc()).all()
        return [aoi.to_dict() for aoi in aois]
    finally:
        db.close()


def get_aoi_by_id(aoi_id):
    db = next(get_db())
    try:
        aoi = db.query(AOI).filter(AOI.id == aoi_id).first()
        return aoi.to_dict() if aoi else None
    finally:
        db.close()


def delete_aoi(aoi_id):
    db = next(get_db())
    try:
        aoi = db.query(AOI).filter(AOI.id == aoi_id).first()
        if not aoi:
            return False
        db.delete(aoi)
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def update_aoi(aoi_id, data: dict[str, Any]):
    db = next(get_db())
    try:
        aoi = db.query(AOI).filter(AOI.id == aoi_id).first()
        if not aoi:
            return None, "AOI not found"

        geometry_changed = any(
            key in data for key in ("coordinates", "shape_type", "geojson", "geometry", "settings")
        )

        if geometry_changed:
            combined = {
                "coordinates": aoi.coordinates,
                "shape_type": aoi.shape_type,
                "settings": dict(aoi.settings or {}),
            }
            combined.update(
                {
                    key: data[key]
                    for key in ("coordinates", "shape_type", "geojson", "geometry", "settings")
                    if key in data
                }
            )

            shape_type, coordinates = _normalise_input(combined)
            settings = dict(combined.get("settings") or {})

            if shape_type == "point":
                tiles = _parse_point_tiles(settings)
                area_info = calculate_point_analysis_area(tiles)
                _lat, lon = validate_point_coordinate(coordinates[0])
                area_info["utm_epsg"] = _utm_epsg_from_lon(lon)
                settings["analysis_tiles"] = tiles
            else:
                area_info = calculate_geometry_area(coordinates)

            aoi.shape_type = shape_type
            aoi.coordinates = coordinates
            aoi.area_hectares = float(area_info["area_hectares"])
            aoi.settings = _build_settings(settings, shape_type, coordinates, area_info)

        if "name" in data:
            aoi.name = data["name"]
        if "description" in data:
            aoi.description = data["description"]
        if "status" in data:
            aoi.status = data["status"]
        if "start_time" in data:
            if data["start_time"] is None:
                aoi.start_time = None
            else:
                iso_str = str(data["start_time"]).replace("Z", "+00:00")
                aoi.start_time = datetime.fromisoformat(iso_str)

        db.commit()
        db.refresh(aoi)
        return aoi.to_dict(), None
    except (TypeError, ValueError) as exc:
        db.rollback()
        return None, str(exc)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
