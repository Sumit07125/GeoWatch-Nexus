"""
AOI Service — Business logic for Area of Interest operations.

Sits between the controller and model layers. Contains validation,
area calculation, and any future business rules.
"""

import math
from models.aoi import AOI


def calculate_area_hectares(coordinates):
    """
    Approximate area of a polygon on Earth's surface using the Shoelace
    formula on latitude/longitude pairs.

    This uses a spherical-Earth approximation which is accurate enough
    for the relatively small areas typical of satellite monitoring AOIs.

    Args:
        coordinates: List of [lat, lng] pairs (degrees).

    Returns:
        Area in hectares (float, rounded to 2 decimals).
    """
    if len(coordinates) < 3:
        return 0.0

    # Earth's radius in metres
    R = 6_371_000

    # Convert degrees → radians and apply Shoelace on projected coordinates
    n = len(coordinates)
    area = 0.0

    for i in range(n):
        lat1 = math.radians(coordinates[i][0])
        lng1 = math.radians(coordinates[i][1])
        lat2 = math.radians(coordinates[(i + 1) % n][0])
        lng2 = math.radians(coordinates[(i + 1) % n][1])

        area += (lng2 - lng1) * (2 + math.sin(lat1) + math.sin(lat2))

    area = abs(area) * R * R / 2.0

    # Convert m² → hectares (1 ha = 10 000 m²)
    return round(area / 10_000, 2)


def create_aoi(data):
    """
    Validate incoming data, compute area, persist a new AOI.

    Args:
        data (dict): Must contain 'coordinates' and 'shape_type'.
                     May contain 'name' and 'description'.

    Returns:
        tuple: (aoi_dict, error_string | None)
    """
    # ── Validation ────────────────────────────────────────────────
    coordinates = data.get("coordinates")
    shape_type = data.get("shape_type")

    if not coordinates or not isinstance(coordinates, list):
        return None, "coordinates must be a non-empty list of [lat, lng] pairs"

    if shape_type not in ("polygon", "rectangle"):
        return None, "shape_type must be 'polygon' or 'rectangle'"

    if shape_type == "rectangle" and len(coordinates) < 4:
        return None, "rectangle requires at least 4 coordinate pairs"

    if shape_type == "polygon" and len(coordinates) < 3:
        return None, "polygon requires at least 3 coordinate pairs"

    # ── Build & persist ───────────────────────────────────────────
    area = calculate_area_hectares(coordinates)

    aoi = AOI(
        name=data.get("name", "Untitled AOI"),
        description=data.get("description", ""),
        shape_type=shape_type,
        coordinates=coordinates,
        area_hectares=area,
    )

    saved = AOI.save(aoi.to_dict())
    return saved, None


def get_all_aois():
    """Return every stored AOI."""
    return AOI.get_all()


def get_aoi_by_id(aoi_id):
    """Return a single AOI or None."""
    return AOI.get_by_id(aoi_id)


def delete_aoi(aoi_id):
    """Delete an AOI. Returns True if it existed."""
    return AOI.delete(aoi_id)
