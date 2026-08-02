import threading
import time
import datetime
from sqlalchemy.orm import Session
from models.database import get_db
from models.aoi import AOI
from services.gee_fetcher import fetch_gee_image_for_date
from services.gdrive_service import upload_image, list_project_images
import os
import tempfile
import cv2
import numpy as np

def analyze_date_for_project(db, aoi, target_date_str):
    try:
        # Check if already processed
        images_data = list_project_images(aoi.name)
        for data in images_data:
            if data['date'] == target_date_str and 'index.png' in data['images']:
                print(f"Skipping {aoi.name} on {target_date_str}, already exists locally.")
                return
        print(f"Running Earth Engine Analysis for {aoi.name} on {target_date_str}...")
        
        lat, lon = aoi.coordinates[0][0], aoi.coordinates[0][1]
        index_type = aoi.settings.get("index_type", "NDVI")
        
        rgb_url, index_url = fetch_gee_image_for_date(lat, lon, target_date_str, index_type)
        
        # Using a temporary directory to save images and upload
        with tempfile.TemporaryDirectory() as temp_dir:
            rgb_path = os.path.join(temp_dir, 'rgb.png')
            index_path = os.path.join(temp_dir, 'index.png')
            
            # Since these are URLs, we need to download them to upload to GDrive
            import requests
            
            res_rgb = requests.get(rgb_url)
            with open(rgb_path, 'wb') as f:
                f.write(res_rgb.content)
                
            res_index = requests.get(index_url)
            with open(index_path, 'wb') as f:
                f.write(res_index.content)

            # Upload to Google Drive
            upload_image(aoi.name, target_date_str, rgb_path, 'rgb.png')
            upload_image(aoi.name, target_date_str, index_path, 'index.png')
            
        print(f"Successfully processed and uploaded {aoi.name} on {target_date_str}.")

    except Exception as e:
        print(f"Error analyzing {aoi.name} for {target_date_str}: {e}")

def run_scheduler_loop():
    print("Background tracking scheduler started...")
    while True:
        try:
            db = next(get_db())
            running_aois = db.query(AOI).filter(AOI.status == 'running').all()
            
            for aoi in running_aois:
                settings = aoi.settings
                if not settings:
                    continue
                    
                prev_date_str = settings.get('previous_date')
                config_curr_date_str = settings.get('current_date')
                end_date_str = settings.get('end_date')
                rep_days = int(settings.get('repetition_days', 5))
                
                if not prev_date_str or not end_date_str or not config_curr_date_str:
                    continue
                    
                prev_date = datetime.datetime.strptime(prev_date_str, "%Y-%m-%d")
                config_curr_date = datetime.datetime.strptime(config_curr_date_str, "%Y-%m-%d")
                end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d")
                real_now = datetime.datetime.now()
                
                # If we have surpassed the end_date, stop the project
                if real_now > end_date:
                    print(f"Project {aoi.name} has reached its end date. Stopping.")
                    aoi.status = 'stopped'
                    db.commit()
                
                # 1. Past Phase: Yearly from prev_date up to config_curr_date
                target = prev_date
                while target < config_curr_date:
                    target_str = target.strftime("%Y-%m-%d")
                    analyze_date_for_project(db, aoi, target_str)
                    try:
                        target = target.replace(year=target.year + 1)
                    except ValueError:
                        target = target + datetime.timedelta(days=365)
                
                # 2. Future Phase: Every 'rep_days' from config_curr_date up to MIN(real_now, end_date)
                target = config_curr_date
                stop_target = min(real_now, end_date)
                
                while target <= stop_target:
                    target_str = target.strftime("%Y-%m-%d")
                    # Analyze and upload this date (it will skip if already in GDrive)
                    analyze_date_for_project(db, aoi, target_str)
                    
                    target += datetime.timedelta(days=rep_days)

        except Exception as e:
            print(f"Scheduler loop error: {e}")
            
        time.sleep(60) # Run loop every minute

def start_scheduler():
    thread = threading.Thread(target=run_scheduler_loop, daemon=True)
    thread.start()
