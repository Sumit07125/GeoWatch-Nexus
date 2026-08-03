import threading
import time
import datetime
import sqlalchemy
from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.aoi import AOI, AOIAnalysis, AOIImage
from services.gee_fetcher import fetch_gee_image_for_date
from services.cv_analyzer import analyze_change
import uuid
import os
import tempfile
import cv2
import numpy as np
from services.logger_service import add_log

def analyze_date_for_project(db, aoi, target_date_str):
    try:
        # Check if already processed
        existing_image = db.query(AOIImage).filter(AOIImage.aoi_id == aoi.id, AOIImage.date == target_date_str).first()
        if existing_image:
            return # Already processed

        add_log(f"Running Earth Engine Analysis for {aoi.name} on {target_date_str}...", type="info")
        
        lat, lon = aoi.coordinates[0][0], aoi.coordinates[0][1]
        index_type = aoi.settings.get("index_type", "NDVI")
        
        rgb_url, index_url = fetch_gee_image_for_date(lat, lon, target_date_str, index_type)
        
        import requests
        res_rgb = requests.get(rgb_url)
        res_index = requests.get(index_url)

        # Save images to Database
        new_image = AOIImage(
            aoi_id=aoi.id,
            date=target_date_str,
            rgb_image=res_rgb.content,
            index_image=res_index.content
        )
        try:
            db.add(new_image)
            db.commit()
        except sqlalchemy.exc.IntegrityError:
            db.rollback()
            add_log(f"Skipping {target_date_str} - already inserted by another thread.", type="info")
            return # Already processed by a concurrent thread
        
        # Now find the previous date to compare against
        prev_image = db.query(AOIImage).filter(
            AOIImage.aoi_id == aoi.id, 
            AOIImage.date < target_date_str
        ).order_by(AOIImage.date.desc()).first()
                
        if prev_image:
            add_log(f"Comparing {target_date_str} against previous date {prev_image.date}...", type="compare")
            
            # Calculate change
            session_id = str(uuid.uuid4())
            cv_results = analyze_change(prev_image.index_image, res_index.content, session_id)
            
            # Save stats and mask to Database
            analysis = AOIAnalysis(
                aoi_id=aoi.id,
                from_date=prev_image.date,
                to_date=target_date_str,
                percentage_changed=cv_results['percentage_changed'],
                area_km2=cv_results['area_km2'],
                recovery_area_km2=cv_results['recovery_area_km2'],
                mean_index=cv_results['mean_index'],
                barren_percent=cv_results['barren_percent'],
                sparse_percent=cv_results['sparse_percent'],
                dense_percent=cv_results['dense_percent'],
                mask_image=cv_results['mask_bytes']
            )
            db.add(analysis)
            db.commit()
            add_log(f"Saved analysis stats for {aoi.name} ({prev_image.date} to {target_date_str}) to DB.", type="save")
            
        add_log(f"Successfully processed {aoi.name} on {target_date_str}.", type="success")

    except Exception as e:
        add_log(f"Error analyzing {aoi.name} for {target_date_str}: {e}", type="error")

def run_scheduler_loop():
    add_log("Background tracking scheduler started...", type="info")
    while True:
        try:
            db = SessionLocal()
            try:
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
                        add_log(f"Project {aoi.name} has reached its end date. Stopping.", type="info")
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
            finally:
                db.close()
        except Exception as e:
            print(f"Scheduler loop error: {e}")
            
        time.sleep(60) # Run loop every minute

def start_scheduler():
    thread = threading.Thread(target=run_scheduler_loop, daemon=True)
    thread.start()
