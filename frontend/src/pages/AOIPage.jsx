/**
 * AOIPage (v4 — Dark Mode + Premium UI)
 * ──────────────────────────────────────
 * Layout: Sidebar (200px teal) | [ TopBar (white/dark) / Content (padded) ]
 * Supports both polygon (3+ pts) and rectangle (2-corner) manual input.
 */

import React, { useState, useCallback } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import MapView from "../components/MapView";
import AOIPanel from "../components/AOIPanel";
import InfoBadge from "../components/InfoBadge";
import { saveAOI } from "../api/aoiApi";

/**
 * Calculate area in hectares from coordinate array.
 * Handles both polygon (3+ pts) and rectangle (2-point bounding box).
 */
function calculateAreaHectares(coords, shapeType) {
  if (!coords || coords.length < 2) return 0;

  // Expand 2-point rectangle to 4 corners for area calculation
  let pts = coords;
  if (shapeType === "rectangle" && coords.length === 2) {
    const [lat1, lng1] = coords[0];
    const [lat2, lng2] = coords[1];
    pts = [
      [lat1, lng1],
      [lat1, lng2],
      [lat2, lng2],
      [lat2, lng1],
    ];
  }

  if (pts.length < 3) return 0;

  const R = 6_371_000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const lat1 = toRad(pts[i][0]);
    const lng1 = toRad(pts[i][1]);
    const lat2 = toRad(pts[(i + 1) % n][0]);
    const lng2 = toRad(pts[(i + 1) % n][1]);
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = (Math.abs(area) * R * R) / 2;
  return Math.round((area / 10_000) * 100) / 100;
}

export default function AOIPage() {
  const [shapeType, setShapeType] = useState(null);
  const [coordinates, setCoordinates] = useState([]);
  const [areaHectares, setAreaHectares] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [locationName, setLocationName] = useState(null);
  const [externalCoords, setExternalCoords] = useState(null);
  const [externalShapeType, setExternalShapeType] = useState(null);
  const [toast, setToast] = useState({ visible: false, type: "", message: "" });

  const showToast = useCallback((type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: "", message: "" }), 3000);
  }, []);

  const handleShapeDrawn = useCallback((data) => {
    setShapeType(data.shapeType);
    setCoordinates(data.coordinates);
    setAreaHectares(calculateAreaHectares(data.coordinates, data.shapeType));
    setExternalCoords(null);
    setExternalShapeType(null);
  }, []);

  const handleShapeDeleted = useCallback(() => {
    setShapeType(null);
    setCoordinates([]);
    setAreaHectares(0);
    setExternalCoords(null);
    setExternalShapeType(null);
    setLocationName(null);
  }, []);

  const handleLocationClick = useCallback((locData) => {
    setLocationName(locData.name);
  }, []);

  const handleDrawingChange = useCallback((drawing) => {
    setIsDrawing(drawing);
    if (drawing) setLocationName(null);
  }, []);

  const handleManualApply = useCallback((data) => {
    setShapeType(data.shapeType);
    setCoordinates(data.coordinates);
    setAreaHectares(calculateAreaHectares(data.coordinates, data.shapeType));
    setExternalCoords(data.coordinates);
    setExternalShapeType(data.shapeType);
  }, []);

  const handleSave = useCallback(
    async ({ name, description }) => {
      setIsSaving(true);
      try {
        await saveAOI({
          name: name || "Untitled AOI",
          description,
          shape_type: shapeType,
          coordinates,
        });
        showToast("success", "AOI saved successfully!");
      } catch (err) {
        const message =
          err.response?.data?.error ||
          "Failed to save AOI. Is the backend running?";
        showToast("error", message);
      } finally {
        setIsSaving(false);
      }
    },
    [shapeType, coordinates, showToast]
  );

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <div className="app-layout__main">
        {/* Top Bar */}
        <TopBar />

        {/* Welcome Banner */}
        <div className="app-layout__body">
          <div className="welcome-banner">
            <div className="welcome-banner__cloud welcome-banner__cloud--1" />
            <div className="welcome-banner__cloud welcome-banner__cloud--2" />
            <div className="welcome-banner__cloud welcome-banner__cloud--3" />
            <div className="welcome-banner__left">
              <span className="welcome-banner__date">
                🌍 {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <h2 className="welcome-banner__greeting">
                Welcome back, Researcher
              </h2>
              <p className="welcome-banner__sub">
                Define your Area of Interest to begin satellite monitoring.
              </p>
            </div>
            <div className="welcome-banner__right">
              <div className="welcome-banner__stat">
                <span className="welcome-banner__stat-num">1</span>
                <span className="welcome-banner__stat-label">Step 1 of 4</span>
              </div>
              <div className="welcome-banner__step-tag">Define AOI</div>
            </div>
          </div>

          {/* Content — Map + Panel */}
          <div className="aoi-content">
            <div className="aoi-content__map-wrapper">
              <MapView
                onShapeDrawn={handleShapeDrawn}
                onShapeDeleted={handleShapeDeleted}
                onLocationClick={handleLocationClick}
                externalCoords={externalCoords}
                externalShapeType={externalShapeType}
                isDrawing={isDrawing}
                onDrawingChange={handleDrawingChange}
              />
              <InfoBadge />
            </div>

            <AOIPanel
              shapeType={shapeType}
              coordinates={coordinates}
              areaHectares={areaHectares}
              locationName={locationName}
              onSave={handleSave}
              onManualApply={handleManualApply}
              isSaving={isSaving}
            />
          </div>
        </div>
      </div>

      {/* Toast */}
      <div
        className={`toast toast--${toast.type} ${
          toast.visible ? "toast--visible" : ""
        }`}
      >
        {toast.type === "success" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {toast.type === "error" && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {toast.message}
      </div>
    </div>
  );
}
