# EarthSentry — Backend API

Flask-based REST API for the EarthSentry satellite-based environmental change detection system. Follows **MVC architecture**.

## Tech Stack

- **Python 3.11+** with Flask 3.x
- **flask-cors** — Cross-Origin Resource Sharing
- **python-dotenv** — Environment variable management
- **JSON file storage** -> Migrated to **SQLite** using SQLAlchemy ORM.

## Project Structure (MVC)

```
backend/
├── app.py                 # Flask app factory + entry point
├── .env                   # Environment variables (not in git)
├── .gitignore
├── requirements.txt
├── database.db            # SQLite Database
├── models/
│   └── aoi.py             # Data models (AOI, AOIImage, AOIAnalysis)
├── services/
│   ├── aoi_service.py     # Business logic + validation
│   ├── scheduler.py       # Background tracking scheduler
│   ├── gee_fetcher.py     # Google Earth Engine API integration
│   ├── cloud_masking.py   # Cloud Score+ Machine Learning masking
│   ├── cv_analyzer.py     # OpenCV Change Detection
│   └── logger_service.py  # Domain log streaming
├── controllers/
│   ├── aoi_controller.py  # HTTP request/response handling (AOIs)
│   └── analysis_controller.py # HTTP request/response handling (Analytics)
└── routes/
    ├── aoi_routes.py      # URL blueprint registration
    └── analysis_routes.py # URL blueprint registration
```

## API Endpoints

| Method | Endpoint         | Description        |
|--------|------------------|--------------------|
| GET    | `/api/health`    | Health check       |
| POST   | `/api/aoi`       | Create a new AOI   |
| GET    | `/api/aoi`       | List all AOIs      |
| PUT    | `/api/aoi/<id>`  | Update an AOI      |
| DELETE | `/api/aoi/<id>`  | Delete an AOI      |
| GET    | `/api/logs`      | Stream system logs |
| GET    | `/api/drive/projects/<name>/dates` | Get capture dates |
| GET    | `/api/drive/projects/<name>/statistics` | Get analysis stats |
| GET    | `/api/analysis/image/<id>/rgb` | Fetch stored RGB image |
| GET    | `/api/analysis/mask/<id>` | Fetch OpenCV change mask |

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
  ],
  "settings": {
    "frequency": "weekly",
    "index_type": "NDVI"
  },
  "area_hectares": 12.5
}
```

Supported `shape_type` values: `"polygon"`, `"rectangle"`

For rectangles with manual coordinate entry, the frontend sends 2 corner points (top-left + bottom-right), which are expanded to 4 corners for storage.

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env   # Ensure EARTH_ENGINE_PROJECT is set

# 3. Authenticate with Earth Engine
earthengine authenticate

# 4. Run the server
python app.py
# → http://localhost:5000
```

## Environment Variables

| Variable                | Default                                              | Description              |
|-------------------------|------------------------------------------------------|--------------------------|
| `FLASK_PORT`            | `5000`                                               | Server port              |
| `FLASK_DEBUG`           | `True`                                               | Debug mode               |
| `FLASK_ENV`             | `development`                                        | Environment              |
| `CORS_ORIGINS`          | `http://localhost:5173,http://127.0.0.1:5173`        | Allowed frontend origins |
| `EARTH_ENGINE_PROJECT`  | `your-google-cloud-project-id`                       | Earth Engine project ID  |

## Architecture Notes

- **Model layer** (`models/aoi.py`) handles all data persistence using SQLAlchemy. Data is stored in `database.db`.
- **Background Scheduler** (`services/scheduler.py`) continuously polls active AOIs and triggers the GEE pipeline.
- **Earth Engine Pipeline** (`services/cloud_masking.py` & `gee_fetcher.py`) dynamically requests Sentinel-2 Harmonized imagery, applying Google's Cloud Score+ algorithm to drop cloudy pixels before generating a median composite.
- **Change Detection** (`services/cv_analyzer.py`) uses OpenCV binary thresholding to calculate pixel-perfect area changes between consecutive captures.

## Current Modules Complete

✅ **AOI Selection** — Define Areas of Interest with polygon/rectangle coordinates
✅ **Date Range & Frequency Selection** — Auto-scheduling
✅ **Satellite Image Fetch** — Sentinel-2 Harmonized via Google Earth Engine API
✅ **Cloud Masking** — Server-side ML cloud masking (Cloud Score+ / s2cloudless)
✅ **Change Detection Pipeline** — OpenCV image subtraction & analytics
✅ **Results Dashboard & Alerts** — Live React Dashboard with Recharts & Zoom analytics
✅ **System Logs** — Live Domain Logs streamed to UI

