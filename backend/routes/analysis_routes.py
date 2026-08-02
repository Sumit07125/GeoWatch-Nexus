from flask import Blueprint, jsonify, request, Response
import uuid
from services.gee_fetcher import fetch_gee_indices
from services.cv_analyzer import analyze_change
from services.gdrive_service import list_project_images, download_file_binary

analysis_bp = Blueprint("analysis", __name__, url_prefix="/api")

@analysis_bp.route("/analyze-change", methods=["POST"])
def analyze_change_route():
    data = request.json
    lat = data.get("latitude")
    lon = data.get("longitude")
    start_year = data.get("start_year", 2016)
    end_year = data.get("end_year", 2026)
    index_type = data.get("index_type", "NDVI")
    
    if not all([lat, lon]):
        return jsonify({"error": "Latitude and Longitude are required."}), 400
        
    session_id = str(uuid.uuid4())
    
    try:
        # 1. Fetch images from Earth Engine
        gee_results = fetch_gee_indices(lat, lon, start_year, end_year, index_type, session_id)
        
        # 2. Analyze change with OpenCV using raw memory bytes
        cv_results = analyze_change(gee_results["idx_bytes1"], gee_results["idx_bytes2"], session_id)
        
        result = {
            "before_rgb": gee_results["rgb_url1"],
            "after_rgb": gee_results["rgb_url2"],
            "before_index": gee_results["idx_url1"],
            "after_index": gee_results["idx_url2"],
            "mask_url": cv_results["mask_url"],
            "percentage_changed": cv_results["percentage_changed"],
            "area_km2": cv_results["area_km2"],
            "index_type": index_type
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@analysis_bp.route("/drive/projects/<project_name>/dates", methods=["GET"])
def get_project_dates(project_name):
    try:
        data = list_project_images(project_name)
        return jsonify({"dates": data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@analysis_bp.route("/drive/files/<path:file_id>", methods=["GET"])
def get_drive_file(file_id):
    try:
        binary_data = download_file_binary(file_id)
        return Response(binary_data, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

import os

@analysis_bp.route("/drive/projects/<project_name>/statistics", methods=["GET"])
def get_project_statistics(project_name):
    try:
        data = list_project_images(project_name)
        if not data:
            return jsonify({"statistics": []}), 200
            
        # Data comes sorted descending (newest first), reverse it for chronological calculation
        data_asc = list(reversed(data))
        
        statistics = []
        
        for i in range(1, len(data_asc)):
            prev = data_asc[i-1]
            curr = data_asc[i]
            
            if 'index.png' in prev['images'] and 'index.png' in curr['images']:
                idx_id1 = prev['images']['index.png']
                idx_id2 = curr['images']['index.png']
                
                try:
                    # Download bytes from Google Drive
                    idx_bytes1 = download_file_binary(idx_id1)
                    idx_bytes2 = download_file_binary(idx_id2)
                    
                    # Calculate change between previous and current date in memory
                    session_id = str(uuid.uuid4())
                    cv_results = analyze_change(idx_bytes1, idx_bytes2, session_id)
                    
                    statistics.append({
                        "period": f"{prev['date']} to {curr['date']}",
                        "from_date": prev['date'],
                        "to_date": curr['date'],
                        "percentage_changed": cv_results["percentage_changed"],
                        "area_km2": cv_results["area_km2"],
                        "mask_url": cv_results["mask_url"]
                    })
                except Exception as e:
                    print(f"Error calculating stats for {prev['date']} to {curr['date']}: {e}")
                    
        # Reverse back so newest is first in UI
        statistics.reverse()
        
        return jsonify({"statistics": statistics}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500