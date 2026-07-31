import ee
import os
import io
import zipfile
import requests
import tifffile
from datetime import datetime
from dateutil.relativedelta import relativedelta

_INITIALIZED = False

def initialize_gee():
    global _INITIALIZED
    if _INITIALIZED:
        return
    try:
        # User MUST run `earthengine authenticate` on their machine first
        ee.Initialize(project='satellite-based')
        _INITIALIZED = True
        print("Google Earth Engine initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize GEE: {e}")
        print("Please run 'earthengine authenticate' in your terminal.")
        raise e

def get_aoi_images(coordinates):
    """
    Given a list of [lat, lng] pairs, fetch current and historical 
    Sentinel-2 imagery URLs (RGB for dashboard display).
    """
    initialize_gee()
    
    # Convert [lat, lng] to [lng, lat] for Earth Engine GeoJSON
    ee_coords = [[lng, lat] for lat, lng in coordinates]
    
    # Ensure polygon is closed
    if ee_coords[0] != ee_coords[-1]:
        ee_coords.append(ee_coords[0])
        
    roi = ee.Geometry.Polygon([ee_coords])
    
    # Sentinel-2 Surface Reflectance
    s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    
    # 1. Current Image (Most recent 20 images, pick least cloudy)
    current_col = s2.filterBounds(roi).sort('system:time_start', False).limit(20)
    current_img = current_col.sort('CLOUDY_PIXEL_PERCENTAGE').first().clip(roi)
                    
    # 2. Historical Image (Oldest 20 images, pick least cloudy)
    historical_col = s2.filterBounds(roi).sort('system:time_start', True).limit(20)
    historical_img = historical_col.sort('CLOUDY_PIXEL_PERCENTAGE').first().clip(roi)
                       
    # Visualization params for True Color RGB
    vis_params = {
        'bands': ['B4', 'B3', 'B2'],
        'min': 0,
        'max': 3000,
        'gamma': 1.4,
        'dimensions': 512,
        'format': 'png'
    }
    
    try:
        current_url = current_img.getThumbURL(vis_params)
        historical_url = historical_img.getThumbURL(vis_params)
    except Exception as e:
        current_url = None
        historical_url = None
        print(f"Error generating GEE URLs: {e}")
        
    return {
        "current_url": current_url,
        "historical_url": historical_url
    }

def download_tensors_for_ml(coordinates):
    """
    Downloads the 13-band multispectral data as Numpy arrays for PyTorch.
    """
    initialize_gee()
    
    ee_coords = [[lng, lat] for lat, lng in coordinates]
    if ee_coords[0] != ee_coords[-1]:
        ee_coords.append(ee_coords[0])
    roi = ee.Geometry.Polygon([ee_coords])
    
    s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    
    current_col = s2.filterBounds(roi).sort('system:time_start', False).limit(20)
    current_img = current_col.sort('CLOUDY_PIXEL_PERCENTAGE').first().clip(roi)
    
    historical_col = s2.filterBounds(roi).sort('system:time_start', True).limit(20)
    historical_img = historical_col.sort('CLOUDY_PIXEL_PERCENTAGE').first().clip(roi)
    
    bands = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12']
    current_img = current_img.select(bands)
    historical_img = historical_img.select(bands)
    
    def download_image_as_numpy(img):
        url = img.getDownloadURL({
            'scale': 10,
            'region': roi,
            'format': 'GEO_TIFF'
        })
        response = requests.get(url)
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            tif_name = [name for name in z.namelist() if name.endswith('.tif')][0]
            with z.open(tif_name) as f:
                img_data = f.read()
                arr = tifffile.imread(io.BytesIO(img_data))
                return arr
                
    try:
        current_array = download_image_as_numpy(current_img)
        historical_array = download_image_as_numpy(historical_img)
        return current_array, historical_array
    except Exception as e:
        print(f"Error downloading tensors: {e}")
        return None, None
