"""
GeoWatch-Nexus Backend — Flask Application Entry Point.
"""

import os
import threading

from dotenv import load_dotenv

# Load .env BEFORE importing modules that may read environment variables.
load_dotenv()

from flask import Flask
from flask_cors import CORS

from routes.aoi_routes import aoi_bp
from routes.image_routes import image_bp

from models.database import engine, Base
import models.aoi  # Registers AOI + AOIImagePair with Base


def _schedule_warmup() -> None:
    """
    Launch K30 model warm-up in a daemon background thread.

    Guard: Werkzeug debug reloader spawns a child process with
    WERKZEUG_RUN_MAIN=true.  We only warm up in the child (main) process
    so the heavy model load never blocks the parent watcher process.
    In production (no FLASK_DEBUG), the guard is irrelevant and the
    warm-up always runs.
    """
    in_reloader_parent = (
        os.getenv("WERKZEUG_RUN_MAIN") is None
        and os.getenv("FLASK_DEBUG", "True").lower() == "true"
    )
    if in_reloader_parent:
        return  # Child process (WERKZEUG_RUN_MAIN=true) will do the warm-up

    def _do_warmup():
        try:
            from services.inference_service import warm_up_model
            warm_up_model()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(
                "Background warm-up thread raised: %s", exc
            )

    t = threading.Thread(target=_do_warmup, daemon=True, name="k30-warmup")
    t.start()


def create_app():
    """Application factory — creates and configures the Flask app."""

    app = Flask(__name__)

    CORS(app)

    # Create database tables after configuration/database initialization.
    Base.metadata.create_all(bind=engine)

    # Register blueprints.
    app.register_blueprint(aoi_bp)
    app.register_blueprint(image_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        from services.inference_service import _MODEL_ERROR, _MODEL_DEVICE
        return {
            "status": "ok",
            "service": "GeoWatch-Nexus API",
            "model_device": str(_MODEL_DEVICE) if _MODEL_DEVICE is not None else None,
            "model_error": _MODEL_ERROR,
        }

    return app


if __name__ == "__main__":
    app = create_app()

    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    # Start K30 warm-up before Flask begins serving
    _schedule_warmup()

    print()
    print(f"GeoWatch-Nexus API running on http://localhost:{port}")
    print()

    app.run(
        host="127.0.0.1",
        port=port,
        debug=debug,
        threaded=True,   # required for long-running endpoints (e.g. /threshold)
    )