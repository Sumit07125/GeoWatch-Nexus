"""
AOI Controller — Handles HTTP request/response logic for AOI endpoints.

Each function receives the Flask request, extracts data, calls the
service layer, and returns an appropriate JSON response.
"""

from flask import request, jsonify
from services import aoi_service


def create_aoi():
    """Handle POST /api/aoi — create a new Area of Interest."""
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    aoi, error = aoi_service.create_aoi(data)

    if error:
        return jsonify({"error": error}), 400

    return jsonify({"message": "AOI saved successfully", "aoi": aoi}), 201


def get_all_aois():
    """Handle GET /api/aoi — list every saved AOI."""
    aois = aoi_service.get_all_aois()
    return jsonify({"aois": aois, "count": len(aois)}), 200


def get_aoi(aoi_id):
    """Handle GET /api/aoi/<id> — fetch one AOI by ID."""
    aoi = aoi_service.get_aoi_by_id(aoi_id)

    if not aoi:
        return jsonify({"error": "AOI not found"}), 404

    return jsonify({"aoi": aoi}), 200


def delete_aoi(aoi_id):
    """Handle DELETE /api/aoi/<id> — remove an AOI."""
    deleted = aoi_service.delete_aoi(aoi_id)

    if not deleted:
        return jsonify({"error": "AOI not found"}), 404

    return jsonify({"message": "AOI deleted successfully"}), 200


def update_aoi(aoi_id):
    """Handle PUT /api/aoi/<id> — update an AOI name/description."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    aoi, error = aoi_service.update_aoi(aoi_id, data)
    
    if error:
        return jsonify({"error": error}), 400

    return jsonify({"message": "AOI updated successfully", "aoi": aoi}), 200
