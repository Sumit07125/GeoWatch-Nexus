"""
AOI Model — Data structure and JSON-file persistence for Areas of Interest.

This module handles all data storage operations using a simple JSON file,
making it easy to swap to a database (SQLite, PostgreSQL) later.
"""

import json
import os
import uuid
from datetime import datetime, timezone

# Path to the JSON data store
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DATA_FILE = os.path.join(DATA_DIR, "aois.json")


def _ensure_data_file():
    """Create the data directory and file if they don't exist."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w") as f:
            json.dump([], f)


def _read_all():
    """Read all AOIs from the JSON file."""
    _ensure_data_file()
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def _write_all(aois):
    """Write the full AOI list back to the JSON file."""
    _ensure_data_file()
    with open(DATA_FILE, "w") as f:
        json.dump(aois, f, indent=2, default=str)


class AOI:
    """
    Represents an Area of Interest defined by the user on the map.

    Attributes:
        id (str):             Unique identifier (UUID).
        name (str):           User-given name for the AOI.
        description (str):    Optional description.
        shape_type (str):     "polygon" or "rectangle".
        coordinates (list):   List of [lat, lng] pairs.
        area_hectares (float): Computed area in hectares.
        created_at (str):     ISO-8601 timestamp.
    """

    def __init__(self, name, description, shape_type, coordinates, area_hectares):
        self.id = str(uuid.uuid4())
        self.name = name
        self.description = description
        self.shape_type = shape_type
        self.coordinates = coordinates
        self.area_hectares = area_hectares
        self.created_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self):
        """Convert the AOI instance to a JSON-serialisable dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "shape_type": self.shape_type,
            "coordinates": self.coordinates,
            "area_hectares": self.area_hectares,
            "created_at": self.created_at,
        }

    # ── CRUD operations ──────────────────────────────────────────────

    @staticmethod
    def save(aoi_dict):
        """Append a new AOI dict to the store and return it."""
        aois = _read_all()
        aois.append(aoi_dict)
        _write_all(aois)
        return aoi_dict

    @staticmethod
    def get_all():
        """Return every stored AOI."""
        return _read_all()

    @staticmethod
    def get_by_id(aoi_id):
        """Find a single AOI by its ID, or return None."""
        for aoi in _read_all():
            if aoi["id"] == aoi_id:
                return aoi
        return None

    @staticmethod
    def delete(aoi_id):
        """Remove an AOI by ID. Returns True if found and deleted."""
        aois = _read_all()
        filtered = [a for a in aois if a["id"] != aoi_id]
        if len(filtered) == len(aois):
            return False
        _write_all(filtered)
        return True
