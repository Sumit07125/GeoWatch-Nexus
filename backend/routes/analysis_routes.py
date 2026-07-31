from flask import Blueprint, jsonify
from services import aoi_service
from services.gee_service import get_aoi_images, download_tensors_for_ml
from services.inference import generate_and_save_mask
import numpy as np

analysis_bp = Blueprint("analysis", __name__, url_prefix="/api/analysis")

@analysis_bp.route("/<aoi_id>", methods=["GET"])
def analyze_aoi(aoi_id):
    # 1. Fetch AOI from database
    aoi = aoi_service.get_aoi_by_id(aoi_id)
    if not aoi:
        return jsonify({"error": "AOI not found"}), 404
        
    coordinates = aoi["coordinates"]
    
    # 2. Get Google Earth Engine RGB Images for Display
    try:
        urls = get_aoi_images(coordinates)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
    # 3. Download 13-band tensors for PyTorch
    current_arr, hist_arr = download_tensors_for_ml(coordinates)
    
    mask_url = None
    change_percentage = 0.0
    
    if current_arr is not None and hist_arr is not None:
        try:
            mask_url = generate_and_save_mask(current_arr, hist_arr, aoi_id)
            
            # Since mask is stored as a URL, we need a way to get the change %
            # We can re-calculate or just mock it for now since we're using a mock mask
            change_percentage = 5.2 # Mock value
        except Exception as e:
            print(f"Failed to generate mask: {e}")
            
    return jsonify({
        "aoi_id": aoi_id,
        "current_url": urls.get("current_url"),
        "historical_url": urls.get("historical_url"),
        "mask_url": mask_url,
        "change_percentage": change_percentage
    }), 200
