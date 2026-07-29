/**
 * AOIPanel Component (v4)
 * ───────────────────────
 * Right-side panel for AOI definition:
 *   - Pill-style tabs (Draw on Map / Manual Coordinates)
 *   - Location info card (from reverse geocoding)
 *   - Selected Region Details
 *   - Auto-populated coordinates list
 *   - Manual coordinate entry with shape type selector (Polygon/Rectangle)
 *   - Rectangle: 2 corner points → auto-compute bounding box
 *   - Polygon: 3+ vertex points
 *   - AOI name + description
 *   - Save AOI button
 */

import React, { useState, useCallback } from "react";

const TABS = [
  { id: "draw", label: "Draw on Map" },
  { id: "manual", label: "Manual Coordinates" },
];

const SHAPE_OPTIONS = [
  { id: "polygon", label: "Polygon", minPoints: 3 },
  { id: "rectangle", label: "Rectangle", minPoints: 2 },
];

export default function AOIPanel({
  shapeType,
  coordinates,
  areaHectares,
  locationName,
  onSave,
  onManualApply,
  isSaving,
}) {
  const [activeTab, setActiveTab] = useState("draw");
  const [aoiName, setAoiName] = useState("");
  const [description, setDescription] = useState("");

  // Manual coordinate entry state
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [manualPoints, setManualPoints] = useState([]);
  const [manualShapeType, setManualShapeType] = useState("polygon");

  const hasShape = coordinates && coordinates.length >= 2;
  const minPointsRequired = SHAPE_OPTIONS.find((s) => s.id === manualShapeType)?.minPoints || 3;
  const maxPointsForRect = manualShapeType === "rectangle" ? 2 : Infinity;

  // ── Handlers ─────────────────────────────────────────────────
  const handleAddPoint = useCallback(() => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    if (manualPoints.length >= maxPointsForRect) return;
    setManualPoints((prev) => [...prev, [lat, lng]]);
    setManualLat("");
    setManualLng("");
  }, [manualLat, manualLng, manualPoints.length, maxPointsForRect]);

  const handleApplyManual = useCallback(() => {
    if (manualPoints.length < minPointsRequired) return;

    if (manualShapeType === "rectangle" && manualPoints.length === 2) {
      // For rectangle: pass 2 corners, MapView ExternalShape will create the L.rectangle
      onManualApply({ coordinates: manualPoints, shapeType: "rectangle" });
    } else {
      onManualApply({ coordinates: manualPoints, shapeType: "polygon" });
    }
  }, [manualPoints, minPointsRequired, manualShapeType, onManualApply]);

  const handleClearManual = useCallback(() => {
    setManualPoints([]);
  }, []);

  const handleRemovePoint = useCallback((index) => {
    setManualPoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleShapeTypeChange = useCallback((type) => {
    setManualShapeType(type);
    setManualPoints([]); // Reset points when switching shape type
  }, []);

  const handleSave = useCallback(() => {
    if (!hasShape) return;
    onSave({ name: aoiName, description });
  }, [hasShape, aoiName, description, onSave]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") handleAddPoint();
    },
    [handleAddPoint]
  );

  return (
    <aside className="aoi-panel">
      {/* Header */}
      <div className="aoi-panel__header">
        <div className="aoi-panel__step">Create New Monitoring Project</div>
        <h2 className="aoi-panel__title">
          Step 1: Define Area of Interest (AOI)
        </h2>
      </div>

      {/* Tabs */}
      <div className="aoi-panel__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`aoi-panel__tab ${
              activeTab === tab.id ? "aoi-panel__tab--active" : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="aoi-panel__body">
        {/* ── Draw on Map Tab ──────────────────────────────── */}
        {activeTab === "draw" && (
          <>
            <div>
              <div className="panel-section__title">Instructions</div>
              <p className="panel-section__text">
                Use the drawing tools on the map to define your monitoring area.
                Click on the map to see location names. Draw a polygon or
                rectangle to select the region.
              </p>
            </div>

            {/* Location Info (from click geocoding) */}
            {locationName && (
              <div className="location-info">
                <span className="location-info__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <div>
                  <div className="location-info__label">Detected Location</div>
                  <div className="location-info__text">{locationName}</div>
                </div>
              </div>
            )}

            {/* Region Details or Empty State */}
            {hasShape ? (
              <div className="region-details">
                <div className="panel-section__title">Selected Region</div>
                <div className="region-details__row">
                  <span className="region-details__label">Shape</span>
                  <span className="region-details__value">
                    {shapeType === "rectangle" ? "Rectangle" : "Polygon"}
                  </span>
                </div>
                <div className="region-details__row">
                  <span className="region-details__label">Vertices</span>
                  <span className="region-details__value">
                    {coordinates.length} points
                  </span>
                </div>
                <div className="region-details__row">
                  <span className="region-details__label">Total Area</span>
                  <span className="region-details__value">
                    ~{areaHectares} ha
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </div>
                <div className="empty-state__title">No area selected</div>
                <p className="empty-state__text">
                  Click the polygon or rectangle tool on the map to start
                  defining your monitoring region.
                </p>
              </div>
            )}

            {/* Coordinates List */}
            {hasShape && (
              <div className="coord-list">
                <div className="coord-list__title">
                  Coordinates ({coordinates.length} points)
                </div>
                {coordinates.map((coord, i) => (
                  <div className="coord-list__item" key={i}>
                    <span className="coord-list__label">P{i + 1}</span>
                    <span className="coord-list__value">
                      {coord[0].toFixed(5)}°N, {coord[1].toFixed(5)}°E
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Manual Coordinates Tab ───────────────────────── */}
        {activeTab === "manual" && (
          <>
            <div>
              <div className="panel-section__title">Manual Entry</div>
              <p className="panel-section__text">
                Select a shape type, then enter coordinates for each vertex.
              </p>
            </div>

            {/* Shape Type Selector */}
            <div className="shape-selector">
              <div className="shape-selector__title">Shape Type</div>
              <div className="shape-selector__options">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className={`shape-selector__btn ${
                      manualShapeType === opt.id ? "shape-selector__btn--active" : ""
                    }`}
                    onClick={() => handleShapeTypeChange(opt.id)}
                  >
                    {opt.id === "polygon" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                    )}
                    {opt.label}
                    <span className="shape-selector__hint">
                      min {opt.minPoints} pts
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="manual-entry">
              <div className="manual-entry__title">
                Add Point {manualPoints.length + 1}
                {manualShapeType === "rectangle" && (
                  <span className="manual-entry__hint">
                    {manualPoints.length === 0
                      ? "(Top-Left Corner)"
                      : manualPoints.length === 1
                      ? "(Bottom-Right Corner)"
                      : "(Done)"}
                  </span>
                )}
              </div>
              <div className="manual-entry__row">
                <input
                  type="number"
                  className="manual-entry__input"
                  placeholder="Latitude"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  onKeyDown={handleKeyDown}
                  step="any"
                  disabled={manualPoints.length >= maxPointsForRect}
                />
                <input
                  type="number"
                  className="manual-entry__input"
                  placeholder="Longitude"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  onKeyDown={handleKeyDown}
                  step="any"
                  disabled={manualPoints.length >= maxPointsForRect}
                />
              </div>
              <div className="manual-entry__actions">
                <button
                  className="btn"
                  onClick={handleAddPoint}
                  disabled={manualPoints.length >= maxPointsForRect}
                >
                  Add Point
                </button>
                <button
                  className="btn btn--accent"
                  onClick={handleApplyManual}
                  disabled={manualPoints.length < minPointsRequired}
                >
                  Apply to Map
                </button>
                {manualPoints.length > 0 && (
                  <button className="btn" onClick={handleClearManual}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {manualPoints.length > 0 && (
              <div className="coord-list">
                <div className="coord-list__title">
                  Entered Points ({manualPoints.length}
                  {manualShapeType === "rectangle" ? " / 2" : ""})
                </div>
                {manualPoints.map((coord, i) => (
                  <div className="coord-list__item" key={i}>
                    <span className="coord-list__label">
                      {manualShapeType === "rectangle"
                        ? i === 0
                          ? "TL"
                          : "BR"
                        : `P${i + 1}`}
                    </span>
                    <span className="coord-list__value">
                      {coord[0].toFixed(5)}°N, {coord[1].toFixed(5)}°E
                    </span>
                    <button
                      className="coord-list__remove"
                      onClick={() => handleRemovePoint(i)}
                      aria-label={`Remove point ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {hasShape && (
              <div className="region-details">
                <div className="panel-section__title">Applied Region</div>
                <div className="region-details__row">
                  <span className="region-details__label">Shape</span>
                  <span className="region-details__value">
                    {shapeType === "rectangle" ? "Rectangle" : "Polygon"}
                  </span>
                </div>
                <div className="region-details__row">
                  <span className="region-details__label">Vertices</span>
                  <span className="region-details__value">
                    {coordinates.length} points
                  </span>
                </div>
                <div className="region-details__row">
                  <span className="region-details__label">Total Area</span>
                  <span className="region-details__value">
                    ~{areaHectares} ha
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Common: Name, Description, Save ──────────────── */}
        <div className="form-field">
          <label className="form-field__label" htmlFor="aoi-name">
            AOI Name (Optional)
          </label>
          <input
            id="aoi-name"
            className="form-field__input"
            type="text"
            placeholder="e.g., Powai Lake - West Bank"
            value={aoiName}
            onChange={(e) => setAoiName(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="aoi-desc">
            Description
          </label>
          <textarea
            id="aoi-desc"
            className="form-field__textarea"
            placeholder="Brief description of the monitoring area..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <button
          className="btn-save"
          onClick={handleSave}
          disabled={!hasShape || isSaving}
        >
          {isSaving ? "Saving..." : "Save AOI"}
          <span className="btn-save__arrow">→</span>
        </button>
      </div>
    </aside>
  );
}
