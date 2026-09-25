"""
Image Controller
=================
Handles HTTP endpoints for triggering and serving satellite image pair fetches.

POST /api/aoi/<id>/fetch-images   → kick off a GEE fetch (async thread)
GET  /api/aoi/<id>/images         → list all image pairs for an AOI
GET  /api/images/<pair_id>/before → serve the before PNG
GET  /api/images/<pair_id>/after  → serve the after PNG
"""

import base64
import threading
from datetime import datetime, timezone

from flask import jsonify, request, Response
from models.database import SessionLocal
from models.aoi import AOI, AOIImagePair


def _do_fetch(pair_id: str, lat: float, lon: float,
              before_date: str, after_date: str, cover_area: str):
    """Background thread: calls GEE, stores PNGs in DB."""
    db = SessionLocal()
    try:
        pair = db.get(AOIImagePair, pair_id)
        if not pair:
            return

        def update_progress(msg: str):
            # We open a new small session to update just the status string
            # to avoid locking the main pair object for too long.
            local_db = SessionLocal()
            try:
                local_pair = local_db.get(AOIImagePair, pair_id)
                if local_pair:
                    local_pair.status = msg
                    local_db.commit()
            finally:
                local_db.close()

        update_progress("Starting Fetch...")

        from services.gee_service import fetch_image_pair
        result = fetch_image_pair(lat, lon, before_date, after_date, cover_area, pair_id, update_progress)

        pair = db.get(AOIImagePair, pair_id)
        pair.t1_start     = result["t1_window"][0]
        pair.t1_end       = result["t1_window"][1]
        pair.t2_start     = result["t2_window"][0]
        pair.t2_end       = result["t2_window"][1]
        pair.patch_px     = result["patch_px"]
        pair.resolution_m = result["resolution_m"]
        pair.ground_m     = result["tile_ground_m"]
        pair.status       = "done"
        pair.fetched_at   = datetime.now(timezone.utc)
        db.commit()

    except Exception as exc:
        db.rollback()
        try:
            pair = db.get(AOIImagePair, pair_id)
            if pair:
                pair.status = "error"
                pair.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def trigger_fetch(aoi_id: str):
    """POST /api/aoi/<id>/fetch-images"""
    db = SessionLocal()
    try:
        aoi = db.get(AOI, aoi_id)
        if not aoi:
            return jsonify({"error": "AOI not found"}), 404

        settings    = aoi.settings or {}
        before_date = settings.get("before_date") or request.json.get("before_date") if request.json else settings.get("before_date")
        after_date  = settings.get("after_date")  or request.json.get("after_date")  if request.json else settings.get("after_date")
        cover_area  = settings.get("cover_area", "1x")

        if not before_date or not after_date:
            before_date = "K30_T1 (2020)"
            after_date = "K30_T2 (2024)"

        lat = aoi.coordinates[0][0]
        lon = aoi.coordinates[0][1]
        
        # Get nx from new analysis_tiles or old cover_area
        nx_raw = settings.get("analysis_tiles", settings.get("cover_area", "1"))
        nx_val = int(str(nx_raw).replace("x", ""))

        # Create a pending image pair record
        pair = AOIImagePair(
            aoi_id      = aoi_id,
            before_date = before_date,
            after_date  = after_date,
            nx          = nx_val,
            status      = "pending",
        )
        db.add(pair)
        db.commit()
        db.refresh(pair)
        pair_id = pair.id
        pair_dict = pair.to_dict()

    finally:
        db.close()

    # Fire the GEE fetch in a background thread so the HTTP response returns immediately
    t = threading.Thread(
        target=_do_fetch,
        args=(pair_id, lat, lon, before_date, after_date, cover_area),
        daemon=True,
    )
    t.start()

    return jsonify({"message": "Image fetch started", "pair": pair_dict}), 202


def get_image_pairs(aoi_id: str):
    """GET /api/aoi/<id>/images"""
    db = SessionLocal()
    try:
        aoi = db.get(AOI, aoi_id)
        if not aoi:
            return jsonify({"error": "AOI not found"}), 404
        pairs = [p.to_dict() for p in aoi.image_pairs]
        return jsonify({"pairs": pairs, "count": len(pairs)}), 200
    finally:
        db.close()

from flask import send_file
import os

def serve_before_png(pair_id: str):
    """GET /api/images/<pair_id>/before"""
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", pair_id, "before_rgb.png")
    if not os.path.exists(path):
        return jsonify({"error": "Image not found on disk"}), 404
    return send_file(path, mimetype="image/png")

def serve_after_png(pair_id: str):
    """GET /api/images/<pair_id>/after"""
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", pair_id, "after_rgb.png")
    if not os.path.exists(path):
        return jsonify({"error": "Image not found on disk"}), 404
    return send_file(path, mimetype="image/png")
