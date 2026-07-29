/**
 * MapView Component (v4)
 * ──────────────────────
 * Interactive Leaflet map with:
 *   - Satellite tiles (Esri) + labels overlay (CartoDB)
 *   - leaflet-draw polygon/rectangle (fixed stable ref pattern)
 *   - Click-to-geocode (Nominatim) with location popup
 *   - Labels hidden during active drawing
 *   - Floating map search bar (place name + coordinates)
 *   - Skeleton loader while tiles load
 *   - ExternalShape supports both polygon and rectangle (2-point)
 *
 * Props:
 *   onShapeDrawn(shapeData)   — called with { shapeType, coordinates }
 *   onShapeDeleted()          — called when user deletes the shape
 *   onLocationClick(locData)  — called with geocoding result on map click
 *   externalCoords            — coords from manual entry to render on map
 *   externalShapeType         — shape type for external coords
 *   isDrawing                 — parent tracks drawing state
 *   onDrawingChange(bool)     — notify parent of drawing state change
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { MapContainer, TileLayer, FeatureGroup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import { reverseGeocode } from "../api/aoiApi";
import MapSearchBar from "./MapSearchBar";

/* ── Fix default marker icons ────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* ── Monkey-patch leaflet-draw readableArea bug ──────────────── */
if (L.GeometryUtil && L.GeometryUtil.readableArea) {
  const origReadableArea = L.GeometryUtil.readableArea;
  L.GeometryUtil.readableArea = function (area, isMetric, precision) {
    try {
      return origReadableArea.call(this, area, isMetric, precision);
    } catch {
      // Fallback for "type is not defined" error in leaflet-draw
      if (area >= 10000) {
        return (area / 10000).toFixed(2) + " ha";
      }
      return area.toFixed(2) + " m²";
    }
  };
}

/* ── Tile URLs ───────────────────────────────────────────────── */
const SATELLITE_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS_TILE =
  "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";

const SAT_ATTR = "Tiles &copy; Esri &mdash; Maxar, Earthstar Geographics";
const LABEL_ATTR = "&copy; OpenStreetMap &copy; CARTO";

/* ── Default center: Powai Lake, Mumbai ──────────────────────── */
const DEFAULT_CENTER = [19.1234, 72.8765];
const DEFAULT_ZOOM = 15;

/* ── Shape styling ───────────────────────────────────────────── */
const SHAPE_STYLE = {
  color: "#06b6d4",
  fillColor: "rgba(16, 185, 129, 0.2)",
  fillOpacity: 0.2,
  weight: 2,
  dashArray: "6 3",
};


/**
 * DrawControls — sets up leaflet-draw with a stable ref.
 * Uses a controlRef to ensure only one instance exists.
 */
function DrawControls({ featureGroupRef, onShapeDrawn, onShapeDeleted, onDrawingChange }) {
  const map = useMap();
  const controlRef = useRef(null);
  const handlersRef = useRef({ created: null, deleted: null, start: null, stop: null });

  useEffect(() => {
    if (!featureGroupRef.current || controlRef.current) return;

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          guidelineDistance: 15,
          shapeOptions: { ...SHAPE_STYLE },
        },
        rectangle: {
          shapeOptions: { ...SHAPE_STYLE },
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: featureGroupRef.current,
        remove: true,
        edit: false,
      },
    });

    map.addControl(drawControl);
    controlRef.current = drawControl;

    // Handler: shape created
    handlersRef.current.created = (e) => {
      const { layer, layerType } = e;
      featureGroupRef.current.clearLayers();
      featureGroupRef.current.addLayer(layer);

      const coords = layer.getLatLngs()[0].map((ll) => [ll.lat, ll.lng]);
      if (onShapeDrawn) {
        onShapeDrawn({
          shapeType: layerType === "rectangle" ? "rectangle" : "polygon",
          coordinates: coords,
        });
      }
      if (onDrawingChange) onDrawingChange(false);
    };

    // Handler: shape deleted
    handlersRef.current.deleted = () => {
      if (onShapeDeleted) onShapeDeleted();
    };

    // Handler: drawing started
    handlersRef.current.start = () => {
      if (onDrawingChange) onDrawingChange(true);
    };

    // Handler: drawing stopped (cancel or finish)
    handlersRef.current.stop = () => {
      if (onDrawingChange) onDrawingChange(false);
    };

    map.on(L.Draw.Event.CREATED, handlersRef.current.created);
    map.on(L.Draw.Event.DELETED, handlersRef.current.deleted);
    map.on(L.Draw.Event.DRAWSTART, handlersRef.current.start);
    map.on(L.Draw.Event.DRAWSTOP, handlersRef.current.stop);

    return () => {
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
      map.off(L.Draw.Event.CREATED, handlersRef.current.created);
      map.off(L.Draw.Event.DELETED, handlersRef.current.deleted);
      map.off(L.Draw.Event.DRAWSTART, handlersRef.current.start);
      map.off(L.Draw.Event.DRAWSTOP, handlersRef.current.stop);
    };
  }, [map, featureGroupRef, onShapeDrawn, onShapeDeleted, onDrawingChange]);

  return null;
}


/**
 * ClickHandler — reverse geocodes map clicks and shows a popup.
 * Disabled while user is actively drawing.
 */
function ClickHandler({ isDrawing, onLocationClick }) {
  const map = useMap();
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClick = async (e) => {
      if (isDrawing) return;

      // Debounce rapid clicks
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { lat, lng } = e.latlng;
        try {
          const data = await reverseGeocode(lat, lng);
          const name = data.display_name || "Unknown location";
          const shortName =
            [
              data.address?.suburb,
              data.address?.city || data.address?.town || data.address?.village,
              data.address?.state,
            ]
              .filter(Boolean)
              .join(", ") || name;

          L.popup({
            className: "loc-popup-wrapper",
            maxWidth: 260,
          })
            .setLatLng(e.latlng)
            .setContent(
              `<div class="loc-popup">
                <div class="loc-popup__name">${shortName}</div>
                <div class="loc-popup__coords">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</div>
              </div>`
            )
            .openOn(map);

          if (onLocationClick) {
            onLocationClick({ name: shortName, fullName: name, lat, lng });
          }
        } catch {
          // Nominatim error — silently ignore
        }
      }, 300);
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [map, isDrawing, onLocationClick]);

  return null;
}


/**
 * ExternalShape — renders coords from manual entry on the map.
 * Supports both polygon (3+ points) and rectangle (2-point bounding box).
 */
function ExternalShape({ featureGroupRef, coords, shapeType }) {
  const map = useMap();

  useEffect(() => {
    if (!coords || !featureGroupRef.current) return;

    featureGroupRef.current.clearLayers();

    if (shapeType === "rectangle" && coords.length === 2) {
      // Rectangle from 2 corner points
      const bounds = L.latLngBounds(
        [coords[0][0], coords[0][1]],
        [coords[1][0], coords[1][1]]
      );
      const rect = L.rectangle(bounds, SHAPE_STYLE);
      featureGroupRef.current.addLayer(rect);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (coords.length >= 3) {
      // Polygon from 3+ points
      const latLngs = coords.map((c) => [c[0], c[1]]);
      const polygon = L.polygon(latLngs, SHAPE_STYLE);
      featureGroupRef.current.addLayer(polygon);
      map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    }
  }, [coords, shapeType, map, featureGroupRef]);

  return null;
}


/**
 * LabelsLayer — toggles the CartoDB labels overlay.
 * Hidden while user is actively drawing.
 */
function LabelsLayer({ isDrawing }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    layerRef.current = L.tileLayer(LABELS_TILE, {
      attribution: LABEL_ATTR,
      maxZoom: 19,
      pane: "overlayPane",
      opacity: 0.9,
    });
    layerRef.current.addTo(map);

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    if (isDrawing) {
      layerRef.current.setOpacity(0);
    } else {
      layerRef.current.setOpacity(0.9);
    }
  }, [isDrawing]);

  return null;
}


/**
 * TileLoadTracker — fires callback once when first batch of tiles finishes.
 * Uses a 4-second max timeout to guarantee the overlay disappears.
 */
function TileLoadTracker({ onLoadingChange }) {
  const map = useMap();
  const firedRef = useRef(false);

  useEffect(() => {
    // Fallback: hide loading after 4 seconds no matter what
    const fallback = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onLoadingChange(false);
      }
    }, 4000);

    const handleLoad = () => {
      if (!firedRef.current) {
        firedRef.current = true;
        onLoadingChange(false);
      }
    };

    // 'load' fires when all current tiles finish
    map.whenReady(() => {
      map.on("load", handleLoad);
      // Also check tileload — if all visible tiles loaded
      let pending = 0;
      const onStart = () => { pending++; };
      const onEnd = () => {
        pending = Math.max(0, pending - 1);
        if (pending === 0) handleLoad();
      };
      map.on("tileloadstart", onStart);
      map.on("tileload", onEnd);
      map.on("tileerror", onEnd);
    });

    return () => {
      clearTimeout(fallback);
      map.off("load");
      map.off("tileloadstart");
      map.off("tileload");
      map.off("tileerror");
    };
  }, [map, onLoadingChange]);

  return null;
}


export default function MapView({
  onShapeDrawn,
  onShapeDeleted,
  onLocationClick,
  externalCoords,
  externalShapeType,
  isDrawing,
  onDrawingChange,
}) {
  const featureGroupRef = useRef(null);
  const [tilesLoading, setTilesLoading] = useState(true);

  const handleFeatureGroupRef = useCallback((ref) => {
    if (ref) featureGroupRef.current = ref;
  }, []);

  const handleTileLoading = useCallback((loading) => {
    setTilesLoading(loading);
  }, []);

  return (
    <div className="map-view__container">
      {/* Subtle loading overlay — fades out when tiles load */}
      <div className={`map-view__loading-overlay ${tilesLoading ? '' : 'map-view__loading-overlay--hidden'}`}>
        <div className="map-view__loading-spinner">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Loading map tiles...</span>
        </div>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="map-view"
        zoomControl={true}
      >
        <TileLayer url={SATELLITE_TILE} attribution={SAT_ATTR} maxZoom={19} />
        <LabelsLayer isDrawing={isDrawing} />
        <ClickHandler isDrawing={isDrawing} onLocationClick={onLocationClick} />
        <TileLoadTracker onLoadingChange={handleTileLoading} />

        {/* Floating map search */}
        <MapSearchBar />

        <FeatureGroup ref={handleFeatureGroupRef}>
          <DrawControls
            featureGroupRef={featureGroupRef}
            onShapeDrawn={onShapeDrawn}
            onShapeDeleted={onShapeDeleted}
            onDrawingChange={onDrawingChange}
          />
          {externalCoords && externalCoords.length >= 2 && (
            <ExternalShape
              featureGroupRef={featureGroupRef}
              coords={externalCoords}
              shapeType={externalShapeType}
            />
          )}
        </FeatureGroup>
      </MapContainer>
    </div>
  );
}
