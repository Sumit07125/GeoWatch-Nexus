from models.database import SessionLocal
from models.aoi import AOIImage, AOIAnalysis

db = SessionLocal()

images = db.query(AOIImage).all()
seen = set()
to_delete = []
for img in images:
    key = (img.aoi_id, img.date)
    if key in seen:
        to_delete.append(img)
    else:
        seen.add(key)

for img in to_delete:
    db.delete(img)
db.commit()
print(f"Deleted {len(to_delete)} duplicate images.")

analyses = db.query(AOIAnalysis).all()
seen_a = set()
to_delete_a = []
for a in analyses:
    key = (a.aoi_id, a.from_date, a.to_date)
    if key in seen_a:
        to_delete_a.append(a)
    else:
        seen_a.add(key)

for a in to_delete_a:
    db.delete(a)
db.commit()
print(f"Deleted {len(to_delete_a)} duplicate analyses.")

db.close()
