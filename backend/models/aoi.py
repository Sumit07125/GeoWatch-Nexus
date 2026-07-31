import uuid
import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, DateTime, Text
from models.database import Base

class AOI(Base):
    __tablename__ = "aois"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    shape_type = Column(String(50), nullable=False)
    coordinates_json = Column(Text, nullable=False)
    area_hectares = Column(Float, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def coordinates(self):
        return json.loads(self.coordinates_json) if self.coordinates_json else []

    @coordinates.setter
    def coordinates(self, value):
        self.coordinates_json = json.dumps(value)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "shape_type": self.shape_type,
            "coordinates": self.coordinates,
            "area_hectares": self.area_hectares,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
