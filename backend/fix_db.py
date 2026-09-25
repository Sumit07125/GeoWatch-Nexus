from models.database import engine
from sqlalchemy import text
with engine.begin() as conn:
    conn.execute(text('ALTER TABLE aoi_image_pairs MODIFY status VARCHAR(255)'))
