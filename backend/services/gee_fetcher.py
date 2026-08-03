import ee
import os
import requests
from .cloud_masking import get_cloud_free_mosaic_for_year, get_best_cloud_free_image

_INITIALIZED = False

def initialize_gee():
    global _INITIALIZED
    if _INITIALIZED:
        return
    try:
        ee.Initialize(project='satellite-based')
        _INITIALIZED = True
        print("Google Earth Engine initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize GEE: {e}")
        print("Please run 'earthengine authenticate' in your terminal.")
        raise e

def fetch_gee_indices(lat, lon, start_year, end_year, index_type, session_id):
    initialize_gee()
    
    point = ee.Geometry.Point([lon, lat])
    roi = point.buffer(2560).bounds()
    
    # Use the robust cloud masking module to get annual composites
    img1 = get_cloud_free_mosaic_for_year(roi, start_year)
    img2 = get_cloud_free_mosaic_for_year(roi, end_year)
    
    if index_type == "NDVI":
        idx1 = img1.normalizedDifference(['B8', 'B4'])
        idx2 = img2.normalizedDifference(['B8', 'B4'])
    elif index_type == "NDWI":
        idx1 = img1.normalizedDifference(['B3', 'B8'])
        idx2 = img2.normalizedDifference(['B3', 'B8'])
    elif index_type == "NDSI":
        idx1 = img1.normalizedDifference(['B3', 'B11'])
        idx2 = img2.normalizedDifference(['B3', 'B11'])
    else:
        raise ValueError(f"Invalid index type: {index_type}")
        
    # Scale index from [-1, 1] to [0, 255] and convert to Byte
    gray1 = idx1.unitScale(-1, 1).multiply(255).toByte()
    gray2 = idx2.unitScale(-1, 1).multiply(255).toByte()
    
    params = {'region': roi, 'scale': 10, 'format': 'png'}
    url1 = gray1.getThumbURL(params)
    url2 = gray2.getThumbURL(params)
    
    # Also get RGB for visualization
    rgb_params = {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000, 'gamma': 1.4, 'region': roi, 'scale': 10, 'format': 'png'}
    rgb_url1 = img1.getThumbURL(rgb_params)
    rgb_url2 = img2.getThumbURL(rgb_params)
    # Download to memory instead of disk
    content1 = requests.get(url1).content
    content2 = requests.get(url2).content
    
    # Return raw bytes for CV and public GEE URLs for the frontend
    return {
        "rgb_url1": rgb_url1,
        "rgb_url2": rgb_url2,
        "idx_url1": url1,
        "idx_url2": url2,
        "idx_bytes1": content1,
        "idx_bytes2": content2
    }

def fetch_gee_image_for_date(lat, lon, target_date_str, index_type):
    initialize_gee()
    
    point = ee.Geometry.Point([lon, lat])
    roi = point.buffer(2560).bounds()
    
    # Use the robust cloud masking module with automatic fallback and expanding search window
    img = get_best_cloud_free_image(roi, target_date_str, cloud_threshold=0.60, max_cloud_pct=20)
    
    if img is None:
        raise ValueError("Could not find any Sentinel-2 imagery for this region and date.")
    
    if index_type == "NDVI":
        idx = img.normalizedDifference(['B8', 'B4'])
    elif index_type == "NDWI":
        idx = img.normalizedDifference(['B3', 'B8'])
    elif index_type == "NDSI":
        idx = img.normalizedDifference(['B3', 'B11'])
    else:
        raise ValueError(f"Invalid index type: {index_type}")
        
    gray = idx.unitScale(-1, 1).multiply(255).toByte()
    
    params = {'region': roi, 'scale': 10, 'format': 'png'}
    idx_url = gray.getThumbURL(params)
    
    rgb_params = {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 3000, 'gamma': 1.4, 'region': roi, 'scale': 10, 'format': 'png'}
    rgb_url = img.getThumbURL(rgb_params)
    
    return rgb_url, idx_url
