from flask import Blueprint, jsonify, request, Response
import uuid
from services.gee_fetcher import fetch_gee_indices
from services.cv_analyzer import analyze_change
from models.database import get_db
from models.aoi import AOI, AOIAnalysis, AOIImage

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
    db = next(get_db())
    try:
        aoi = db.query(AOI).filter(AOI.name == project_name).first()
        if not aoi:
            return jsonify({"dates": []}), 200
            
        images = db.query(AOIImage).filter(AOIImage.aoi_id == aoi.id).order_by(AOIImage.date.desc()).all()
        dates_data = []
        for img in images:
            dates_data.append({
                "date": img.date,
                "images": {
                    "rgb.png": f"/api/analysis/image/{img.id}/rgb",
                    "index.png": f"/api/analysis/image/{img.id}/index"
                }
            })
        return jsonify({"dates": dates_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@analysis_bp.route("/analysis/mask/<analysis_id>", methods=["GET"])
def get_mask_file(analysis_id):
    db = next(get_db())
    try:
        analysis = db.query(AOIAnalysis).filter(AOIAnalysis.id == analysis_id).first()
        if not analysis:
            return jsonify({"error": "Not found"}), 404
        return Response(analysis.mask_image, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@analysis_bp.route("/analysis/image/<image_id>/<image_type>", methods=["GET"])
def get_aoi_image(image_id, image_type):
    db = next(get_db())
    try:
        img = db.query(AOIImage).filter(AOIImage.id == image_id).first()
        if not img:
            return jsonify({"error": "Not found"}), 404
            
        binary_data = img.rgb_image if image_type == 'rgb' else img.index_image
        return Response(binary_data, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

import os

@analysis_bp.route("/drive/projects/<project_name>/statistics", methods=["GET"])
def get_project_statistics(project_name):
    db = next(get_db())
    try:
        aoi = db.query(AOI).filter(AOI.name == project_name).first()
        
        if not aoi:
            return jsonify({"statistics": []}), 200
            
        analyses = db.query(AOIAnalysis).filter(AOIAnalysis.aoi_id == aoi.id).order_by(AOIAnalysis.to_date.desc()).all()
        
        statistics = []
        for analysis in analyses:
            # We serve the image directly via our new DB route
            mask_url = f"http://localhost:5000/api/analysis/mask/{analysis.id}"
            
            statistics.append({
                "period": f"{analysis.from_date} to {analysis.to_date}",
                "from_date": analysis.from_date,
                "to_date": analysis.to_date,
                "percentage_changed": analysis.percentage_changed,
                "area_km2": analysis.area_km2,
                "recovery_area_km2": analysis.recovery_area_km2,
                "mean_index": analysis.mean_index,
                "barren_percent": analysis.barren_percent,
                "sparse_percent": analysis.sparse_percent,
                "dense_percent": analysis.dense_percent,
                "mask_url": mask_url
            })
            
        return jsonify({"statistics": statistics}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()