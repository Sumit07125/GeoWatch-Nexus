import ee
import os
import requests

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
    
    s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    
    def get_composite(year):
        # We take the median of the year to get a clear composite
        return s2.filterBounds(roi).filterDate(f"{year}-01-01", f"{year}-12-31").median().clip(roi)
        
    img1 = get_composite(start_year)
    img2 = get_composite(end_year)
    
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
    
    s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    
    import datetime
    target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d")
    start = (target_date - datetime.timedelta(days=15)).strftime("%Y-%m-%d")
    end = (target_date + datetime.timedelta(days=15)).strftime("%Y-%m-%d")
    
    img = s2.filterBounds(roi).filterDate(start, end).median().clip(roi)
    
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
