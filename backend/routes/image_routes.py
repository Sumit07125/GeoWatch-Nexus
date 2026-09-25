"""
Image Routes — Blueprint for satellite image pair endpoints.
"""
from flask import Blueprint
from controllers import image_controller

image_bp = Blueprint("images", __name__)

# Trigger GEE fetch for an AOI
image_bp.route("/api/aoi/<aoi_id>/fetch-images", methods=["POST"])(
    image_controller.trigger_fetch
)

# List all image pairs for an AOI
image_bp.route("/api/aoi/<aoi_id>/images", methods=["GET"])(
    image_controller.get_image_pairs
)

# Serve the actual PNG images
image_bp.route("/api/images/<pair_id>/before", methods=["GET"])(
    image_controller.serve_before_png
)
image_bp.route("/api/images/<pair_id>/after", methods=["GET"])(
    image_controller.serve_after_png
)
