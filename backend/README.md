# EarthSentry — Backend API

Flask-based REST API for the EarthSentry satellite-based environmental change detection system. Follows **MVC architecture**.

## Tech Stack

- **Python 3.11+** with Flask 3.x
- **flask-cors** — Cross-Origin Resource Sharing
- **python-dotenv** — Environment variable management
- **JSON file storage** — Lightweight persistence (swappable to SQLite/PostgreSQL)

## Project Structure (MVC)

```
backend/
├── app.py                 # Flask app factory + entry point
├── .env                   # Environment variables (not in git)
├── .gitignore
├── requirements.txt
├── data/
│   └── aois.json          # Auto-generated data store
├── models/
│   └── aoi.py             # Data model + JSON persistence (Model)
├── services/
│   └── aoi_service.py     # Business logic + validation (Service)
├── controllers/
│   └── aoi_controller.py  # HTTP request/response handling (Controller)
└── routes/
    └── aoi_routes.py      # URL blueprint registration (Routes)
```

## API Endpoints

| Method | Endpoint         | Description        |
|--------|------------------|--------------------|
| GET    | `/api/health`    | Health check       |
| POST   | `/api/aoi`       | Create a new AOI   |
| GET    | `/api/aoi`       | List all AOIs      |
| GET    | `/api/aoi/<id>`  | Get single AOI     |
| DELETE | `/api/aoi/<id>`  | Delete an AOI      |

### AOI Request Body (POST)

```json
{
  "name": "Powai Lake - West Bank",
  "description": "Monitoring deforestation near lake shore",
  "shape_type": "polygon",
  "coordinates": [
    [19.12345, 72.87654],
    [19.12456, 72.87765],
    [19.12456, 72.87775],
    [19.12345, 72.87654]
  ]
}
```

Supported `shape_type` values: `"polygon"`, `"rectangle"`

For rectangles with manual coordinate entry, the frontend sends 2 corner points (top-left + bottom-right), which are expanded to 4 corners for storage.

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env   # or edit .env directly

# 3. Run the server
python app.py
# → http://localhost:5000
```

## Environment Variables

| Variable       | Default                                              | Description              |
|----------------|------------------------------------------------------|--------------------------|
| `FLASK_PORT`   | `5000`                                               | Server port              |
| `FLASK_DEBUG`  | `True`                                               | Debug mode               |
| `FLASK_ENV`    | `development`                                        | Environment              |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`        | Allowed frontend origins |

## Architecture Notes

- **Model layer** (`models/aoi.py`) handles all data persistence. Currently uses a JSON file (`data/aois.json`). To migrate to a database, only this file needs to change.
- **Service layer** (`services/aoi_service.py`) contains validation rules, area calculation (Shoelace formula), and business logic.
- **Controller layer** (`controllers/aoi_controller.py`) is a thin HTTP adapter — extracts request data, calls services, returns JSON responses.
- **Routes** (`routes/aoi_routes.py`) map URL patterns to controller functions via Flask Blueprints.

## Current Module

✅ **AOI Selection** — Define Areas of Interest with polygon/rectangle coordinates

## Frontend v4 Features (for context)

The frontend now includes dark mode, skeleton loaders, map search bar (forward geocoding), coordinate input visualization, shape type selector (Polygon/Rectangle), glassmorphic map elements, and micro-interaction animations. See `frontend/README.md` for full details.

## Upcoming Modules

- [ ] Date Range Selection
- [ ] Satellite Image Fetch (Sentinel-2 / Copernicus)
- [ ] Change Detection Pipeline
- [ ] Results Dashboard & Alerts
