import os
import sys
from models.database import get_db
from models.aoi import AOI
from services.scheduler import analyze_date_for_project
import logging

logging.basicConfig(level=logging.INFO)

db = next(get_db())
aoi = db.query(AOI).filter(AOI.name == 'Amazon deforestation hotspot (southern Pará, Brazil)').first()

if aoi:
    print("Testing analyze_date_for_project for 2023-01-01...")
    try:
        analyze_date_for_project(db, aoi, "2023-01-01")
        print("Done testing.")
    except Exception as e:
        print(f"Error: {e}")
else:
    print("AOI not found.")
