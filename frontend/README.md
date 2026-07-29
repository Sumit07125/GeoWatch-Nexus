# EarthSentry — Frontend

React-based user interface for the EarthSentry satellite-based environmental change detection system. Built with **Vite**, **Leaflet**, and vanilla CSS.

## Tech Stack

- **React 19** — UI framework
- **Vite 8** — Build tool & dev server
- **Leaflet** + **react-leaflet** — Interactive maps
- **leaflet-draw** — Polygon/rectangle drawing tools
- **Axios** — HTTP client for API calls
- **OpenStreetMap Nominatim** — Forward + reverse geocoding (no API key)

## Project Structure

```
frontend/
├── .env                          # Environment variables
├── index.html                    # Entry HTML (SEO optimised)
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                  # React DOM mount + ThemeProvider
    ├── App.jsx                   # Root component
    ├── index.css                 # Design system (light/dark) + all styles
    ├── api/
    │   └── aoiApi.js             # Backend + Nominatim API client
    ├── context/
    │   └── ThemeContext.jsx       # Dark/light mode context + localStorage
    ├── components/
    │   ├── Sidebar.jsx           # Left sidebar (teal, 3-layer clouds)
    │   ├── TopBar.jsx            # Top bar (search, theme toggle, profile)
    │   ├── MapView.jsx           # Leaflet map + draw tools + search + skeleton
    │   ├── MapSearchBar.jsx      # Floating glassmorphic map search
    │   ├── SkeletonLoader.jsx    # Shimmer loading placeholders
    │   ├── AOIPanel.jsx          # Right panel (shape selector, manual entry)
    │   └── InfoBadge.jsx         # Satellite coverage overlay badge
    └── pages/
        └── AOIPage.jsx           # Main page (state orchestrator)
```

## Component Hierarchy

```
ThemeProvider
└── App
    └── AOIPage
        ├── Sidebar          (left, 200px, teal, cloud decorations)
        ├── TopBar           (top, search + dark/light toggle + profile)
        ├── MapView          (center, satellite map)
        │   ├── TileLoadTracker  (skeleton loader trigger)
        │   ├── MapSearchBar     (floating glassmorphic search)
        │   ├── DrawControls     (leaflet-draw polygon/rectangle)
        │   ├── LabelsLayer      (CartoDB place name labels)
        │   ├── ClickHandler     (reverse geocoding on click)
        │   └── ExternalShape    (render manual coords on map)
        ├── AOIPanel         (right, 380px, tabs + shape selector)
        └── InfoBadge        (map overlay, satellite info)
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env   # or edit .env directly

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

## Environment Variables

| Variable            | Default                                   | Description                  |
|---------------------|-------------------------------------------|------------------------------|
| `VITE_API_URL`      | `http://localhost:5000/api`               | Backend API base URL         |
| `VITE_NOMINATIM_URL`| `https://nominatim.openstreetmap.org`     | Nominatim geocoding endpoint |

## Features (Current Module: AOI Selection)

### Core
- ✅ Interactive satellite map (Esri World Imagery)
- ✅ Place name labels overlay (CartoDB)
- ✅ Polygon drawing (unlimited vertices)
- ✅ Rectangle drawing
- ✅ Guide lines while drawing
- ✅ Click-to-reveal location names (reverse geocoding)
- ✅ Live coordinate capture
- ✅ Manual coordinate entry (Polygon + Rectangle shape selector)
- ✅ AOI metadata (name, description)
- ✅ Save AOI to backend

### v4 Premium UI
- ✅ **Dark Mode** — toggle via moon/sun icon, persisted in localStorage
- ✅ **Skeleton Loaders** — shimmer animation while map tiles load
- ✅ **Map Search Bar** — floating glassmorphic search (place names + coordinates)
- ✅ **Forward Geocoding** — type place name → fly to location
- ✅ **Coordinate Input** — type `lat, lng` → fly to point
- ✅ **Shape Type Selector** — choose Polygon (3+ pts) or Rectangle (2 corners)
- ✅ **Custom Glassmorphic Map Elements** — popups, draw toolbar, tooltips
- ✅ **Micro-Interactions** — hover scale, lift, glow, slide, pulse animations
- ✅ **3-Layer Sidebar Clouds** — drifting atmospheric decorations
- ✅ **Toast Slide-in** — gradient toasts with icons (checkmark/X)
- ✅ **Keyboard Shortcuts** — `Ctrl+K` to focus map search

## Design System

CSS custom properties in `src/index.css` with automatic dark mode support:

| Token             | Light              | Dark              | Usage                |
|-------------------|--------------------|-------------------|----------------------|
| `--bg-body`       | `#f0f2f5`          | `#0f1419`         | Main background      |
| `--bg-white`      | `#ffffff`          | `#1a1f2e`         | Cards, panels        |
| `--accent`        | `#2e8b7e`          | `#2e8b7e`         | Primary actions      |
| `--text-dark`     | `#1a1a2e`          | `#e8eaed`         | Main text            |
| `--text-muted`    | `#8e8ea0`          | `#6b7a8d`         | Labels               |
| `--border`        | `#e5e7eb`          | `#2a3142`         | Border lines         |

## Upcoming Modules

- [ ] Date Range Selection
- [ ] Satellite Image Viewer
- [ ] Change Detection Results
- [ ] Alerts Dashboard
