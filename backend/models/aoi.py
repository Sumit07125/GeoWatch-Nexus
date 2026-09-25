import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey, LargeBinary, Integer
from sqlalchemy.orm import relationship
from models.database import Base

class AOI(Base):
    __tablename__ = "aois"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    shape_type = Column(String(50), nullable=False)
    coordinates_json = Column(Text, nullable=False)
    settings_json = Column(Text, nullable=True)
    area_hectares = Column(Float, nullable=False)
    status = Column(String(50), default="stopped")
    start_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    image_pairs = relationship("AOIImagePair", back_populates="aoi",
                               cascade="all, delete-orphan")

    @property
    def coordinates(self):
        return json.loads(self.coordinates_json) if self.coordinates_json else []

    @coordinates.setter
    def coordinates(self, value):
        self.coordinates_json = json.dumps(value)

    @property
    def settings(self):
        return json.loads(self.settings_json) if self.settings_json else {}

    @settings.setter
    def settings(self, value):
        self.settings_json = json.dumps(value)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "shape_type": self.shape_type,
            "coordinates": self.coordinates,
            "settings": self.settings,
            "area_hectares": self.area_hectares,
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "has_images": bool(self.image_pairs),
        }


class AOIImagePair(Base):
    """
    Stores one before/after satellite image pair for an AOI.

    Spec (FINAL_ARCH_3.md §2.1 / §D2):
      Resolution : 10 m/pixel
      Patch size : 128 × 128 px per tile
      Ground     : 1,280 m × 1,280 m per tile = 1.6384 km²
      Stored ch  : 14  (11 S2-optical + 2 S1-SAR + 1 n_clear quality)
      Model ch   : 17  (+ NDVI, NDBI, cross-pol ratio derived on GPU)
    """
    __tablename__ = "aoi_image_pairs"

    id            = Column(String(36), primary_key=True,
                           default=lambda: str(uuid.uuid4()))
    aoi_id        = Column(String(36), ForeignKey("aois.id", ondelete="CASCADE"),
                           nullable=False)

    # Image data — stored as PNG bytes for preview display
    before_png    = Column(LargeBinary(length=(2**32) - 1), nullable=True)
    after_png     = Column(LargeBinary(length=(2**32) - 1), nullable=True)

    # Date windows used for each composite
    before_date   = Column(String(20), nullable=True)   # end date of T1 window
    after_date    = Column(String(20), nullable=True)   # end date of T2 window
    t1_start      = Column(String(20), nullable=True)
    t1_end        = Column(String(20), nullable=True)
    t2_start      = Column(String(20), nullable=True)
    t2_end        = Column(String(20), nullable=True)

    # Tile grid metadata
    nx            = Column(Integer, default=1)          # cover-area multiplier (1-5)
    patch_px      = Column(Integer, default=128)
    resolution_m  = Column(Integer, default=10)
    ground_m      = Column(Float, default=1280.0)       # per tile side in metres

    # Fetch status
    status        = Column(String(20), default="pending")  # pending | fetching | done | error
    error_message = Column(Text, nullable=True)
    fetched_at    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    aoi = relationship("AOI", back_populates="image_pairs")

    def to_dict(self, include_images: bool = False):
        d = {
            "id":           self.id,
            "aoi_id":       self.aoi_id,
            "before_date":  self.before_date,
            "after_date":   self.after_date,
            "t1_window":    [self.t1_start, self.t1_end],
            "t2_window":    [self.t2_start, self.t2_end],
            "nx":           self.nx,
            "patch_px":     self.patch_px,
            "resolution_m": self.resolution_m,
            "ground_m":     self.ground_m,
            "status":       self.status,
            "error":        self.error_message,
            "fetched_at":   self.fetched_at.isoformat() if self.fetched_at else None,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }
        return d
