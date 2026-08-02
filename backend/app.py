"""
EarthSentry Backend — Flask Application Entry Point.

Initialises the Flask app, loads environment variables from .env,
enables CORS for the React dev server, registers all route blueprints,
and starts the development server.
"""

import os
from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS
from services.scheduler import start_scheduler
from routes.aoi_routes import aoi_bp
from routes.analysis_routes import analysis_bp
from models.database import engine, Base
import models.aoi  # Import models to ensure they are registered with Base

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Load environment variables from .env file
load_dotenv()


def create_app():
    """Application factory — creates and configures the Flask app."""
    app = Flask(__name__)

    # Allow all origins for development to prevent CORS issues
    CORS(app)

    # ── Register Blueprints ───────────────────────────────────────
    app.register_blueprint(aoi_bp)
    app.register_blueprint(analysis_bp)

    # ── Health-check endpoint ─────────────────────────────────────
    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "EarthSentry API"}

    return app


if __name__ == "__main__":
    # Start the background tracking scheduler
    start_scheduler()

    app = create_app()
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    print(f"\n  🛰️  EarthSentry API running on http://localhost:{port}\n")
    app.run(debug=debug, port=port)
