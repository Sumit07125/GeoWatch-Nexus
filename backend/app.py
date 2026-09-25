"""
GeoWatch-Nexus Backend — Flask Application Entry Point.
"""

import os

from dotenv import load_dotenv

# Load .env BEFORE importing modules that may read environment variables.
load_dotenv()

from flask import Flask
from flask_cors import CORS

from routes.aoi_routes import aoi_bp
from routes.image_routes import image_bp

from models.database import engine, Base
import models.aoi  # Registers AOI + AOIImagePair with Base


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
        return {
            "status": "ok",
            "service": "GeoWatch-Nexus API",
        }

    return app


if __name__ == "__main__":
    app = create_app()

    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"

    print()
    print(f"GeoWatch-Nexus API running on http://localhost:{port}")
    print()

    app.run(
        host="127.0.0.1",
        port=port,
        debug=debug,
    )