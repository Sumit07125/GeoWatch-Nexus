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
from routes.aoi_routes import aoi_bp

# Load environment variables from .env file
load_dotenv()


def create_app():
    """Application factory — creates and configures the Flask app."""
    app = Flask(__name__)

    # Read CORS origins from .env (comma-separated)
    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    CORS(app, origins=[o.strip() for o in origins])

    # ── Register Blueprints ───────────────────────────────────────
    app.register_blueprint(aoi_bp)

    # ── Health-check endpoint ─────────────────────────────────────
    @app.route("/api/health")
    def health():
        return {"status": "ok", "service": "EarthSentry API"}

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    print(f"\n  🛰️  EarthSentry API running on http://localhost:{port}\n")
    app.run(debug=debug, port=port)
