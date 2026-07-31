"""
AOI Service — Business logic for Area of Interest operations.
"""

import math
from models.aoi import AOI
from models.database import get_db

def calculate_area_hectares(coordinates):
    if len(coordinates) < 3:
        return 0.0

    R = 6_371_000
    n = len(coordinates)
    area = 0.0

    for i in range(n):
        lat1 = math.radians(coordinates[i][0])
        lng1 = math.radians(coordinates[i][1])
        lat2 = math.radians(coordinates[(i + 1) % n][0])
        lng2 = math.radians(coordinates[(i + 1) % n][1])
        area += (lng2 - lng1) * (2 + math.sin(lat1) + math.sin(lat2))

    area = abs(area) * R * R / 2.0
    return round(area / 10_000, 2)


def create_aoi(data):
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

    area = calculate_area_hectares(coordinates)

    aoi = AOI(
        name=data.get("name", "Untitled AOI"),
        description=data.get("description", ""),
        shape_type=shape_type,
        coordinates=coordinates,
        area_hectares=area,
    )

    db = next(get_db())
    try:
        db.add(aoi)
        db.commit()
        db.refresh(aoi)
        return aoi.to_dict(), None
    finally:
        db.close()


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
    finally:
        db.close()
