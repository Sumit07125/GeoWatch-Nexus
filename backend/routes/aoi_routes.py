"""
AOI Routes — URL routing blueprint for Area of Interest endpoints.

Registers all /api/aoi/* routes and maps them to controller functions.
"""

from flask import Blueprint
from controllers import aoi_controller

aoi_bp = Blueprint("aoi", __name__, url_prefix="/api/aoi")

# POST   /api/aoi        → Create a new AOI
aoi_bp.route("", methods=["POST"])(aoi_controller.create_aoi)

# GET    /api/aoi        → List all AOIs
aoi_bp.route("", methods=["GET"])(aoi_controller.get_all_aois)

# GET    /api/aoi/<id>   → Get a single AOI
aoi_bp.route("/<aoi_id>", methods=["GET"])(aoi_controller.get_aoi)

# DELETE /api/aoi/<id>   → Delete an AOI
aoi_bp.route("/<aoi_id>", methods=["DELETE"])(aoi_controller.delete_aoi)

# PUT    /api/aoi/<id>   → Update an AOI
aoi_bp.route("/<aoi_id>", methods=["PUT"])(aoi_controller.update_aoi)
