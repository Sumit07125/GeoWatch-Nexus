import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey, LargeBinary, UniqueConstraint
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
        }

class AOIImage(Base):
    __tablename__ = "aoi_images"
    __table_args__ = (UniqueConstraint('aoi_id', 'date', name='uq_aoi_date'),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id = Column(String(36), ForeignKey('aois.id', ondelete='CASCADE'), nullable=False)
    date = Column(String(20), nullable=False)
    rgb_image = Column(LargeBinary(length=(2**32)-1), nullable=False)
    index_image = Column(LargeBinary(length=(2**32)-1), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AOIAnalysis(Base):
    __tablename__ = "aoi_analysis"
    __table_args__ = (UniqueConstraint('aoi_id', 'from_date', 'to_date', name='uq_aoi_analysis'),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    aoi_id = Column(String(36), ForeignKey('aois.id', ondelete='CASCADE'), nullable=False)
    from_date = Column(String(20), nullable=False)
    to_date = Column(String(20), nullable=False)
    percentage_changed = Column(Float, nullable=False)
    area_km2 = Column(Float, nullable=False)
    recovery_area_km2 = Column(Float, nullable=True)
    mean_index = Column(Float, nullable=True)
    dense_percent = Column(Float, nullable=True)
    sparse_percent = Column(Float, nullable=True)
    barren_percent = Column(Float, nullable=True)
    mask_image = Column(LargeBinary(length=(2**32)-1), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    aoi = relationship("AOI", backref="analyses")
    
    def to_dict(self):
        return {
            "id": self.id,
            "aoi_id": self.aoi_id,
            "from_date": self.from_date,
            "to_date": self.to_date,
            "percentage_changed": self.percentage_changed,
            "area_km2": self.area_km2,
            "recovery_area_km2": self.recovery_area_km2,
            "mean_index": self.mean_index,
            "dense_percent": self.dense_percent,
            "sparse_percent": self.sparse_percent,
            "barren_percent": self.barren_percent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
