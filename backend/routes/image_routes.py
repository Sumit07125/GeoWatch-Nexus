"""
Image Routes — Blueprint for satellite image pair endpoints.
"""

from flask import Blueprint
from controllers import image_controller


image_bp = Blueprint("images", __name__)


# ---------------------------------------------------------------------------
# Acquisition
# ---------------------------------------------------------------------------

image_bp.route("/api/aoi/<aoi_id>/fetch-images", methods=["POST"])(
    image_controller.trigger_fetch
)

image_bp.route("/api/aoi/<aoi_id>/images", methods=["GET"])(
    image_controller.get_image_pairs
)


# ---------------------------------------------------------------------------
# Raw T1/T2 RGB previews
# ---------------------------------------------------------------------------

image_bp.route("/api/images/<pair_id>/before", methods=["GET"])(
    image_controller.serve_before_png
)

image_bp.route("/api/images/<pair_id>/after", methods=["GET"])(
    image_controller.serve_after_png
)


# ---------------------------------------------------------------------------
# Acquisition/progress metadata
# ---------------------------------------------------------------------------

image_bp.route("/api/images/<pair_id>/progress", methods=["GET"])(
    image_controller.get_pair_progress
)

image_bp.route("/api/images/<pair_id>/acquisition", methods=["GET"])(
    image_controller.get_pair_acquisition
)


# ---------------------------------------------------------------------------
# Model analysis
# ---------------------------------------------------------------------------

image_bp.route("/api/images/<pair_id>/analyze", methods=["POST"])(
    image_controller.run_pair_analysis
)

image_bp.route("/api/images/<pair_id>/analysis", methods=["GET"])(
    image_controller.get_pair_analysis
)

image_bp.route("/api/images/<pair_id>/legend", methods=["GET"])(
    image_controller.get_change_legend
)


# ---------------------------------------------------------------------------
# Multicolor change mask and T2 overlay
# ---------------------------------------------------------------------------

image_bp.route("/api/images/<pair_id>/mask", methods=["GET"])(
    image_controller.serve_change_mask_png
)

image_bp.route("/api/images/<pair_id>/t2-mask", methods=["GET"])(
    image_controller.serve_t2_mask_png
)

image_bp.route("/api/images/<pair_id>/binary-mask", methods=["GET"])(
    image_controller.serve_binary_mask_png
)

image_bp.route("/api/images/<pair_id>/threshold", methods=["POST"])(
    image_controller.update_pair_threshold
)
