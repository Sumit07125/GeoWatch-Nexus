import React, { useState, useCallback } from "react";

export default function AOIPanel({
  latitude,
  longitude,
  locationName,
  onLocationChange,
  onShowOnMap,
  onSave,
  isSaving,
}) {
  const [aoiName, setAoiName] = useState("");
  const [description, setDescription] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [afterDate, setAfterDate] = useState("");
  const [coverArea, setCoverArea] = useState("1");

  const handleLatChange = (e) => onLocationChange("latitude", parseFloat(e.target.value));
  const handleLonChange = (e) => onLocationChange("longitude", parseFloat(e.target.value));

  const handleSave = useCallback(() => {
    if (!latitude || !longitude) return;
    onSave({ name: aoiName, description, beforeDate, afterDate, coverArea });
  }, [latitude, longitude, aoiName, description, beforeDate, afterDate, coverArea, onSave]);

  return (
    <aside className="aoi-panel">
      {/* Header */}
      <div className="aoi-panel__header">
        <div className="aoi-panel__step">Create New Monitoring Project</div>
        <h2 className="aoi-panel__title">
          Step 1: Define Point of Interest (POI)
        </h2>
      </div>

      <div className="aoi-panel__body">
        <div>
          <div className="panel-section__title">Instructions</div>
          <p className="panel-section__text">
            Enter coordinates manually or click the map to auto-fill.
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

        <div className="manual-entry">
          <div className="manual-entry__title">Center Point</div>
          <div className="manual-entry__row" style={{ display: "flex", gap: "12px" }}>
            {/* Latitude Input */}
            <div style={{ display: 'flex', flex: 1, background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <input
                type="number"
                style={{ border: 'none', padding: '10px 12px', width: '100%', outline: 'none', fontSize: '13px', background: 'transparent' }}
                placeholder="Latitude"
                value={latitude ? Math.abs(latitude) : ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const isSouth = latitude < 0;
                  onLocationChange("latitude", isSouth ? -val : val);
                }}
                step="any"
              />
              <select 
                style={{ border: 'none', background: 'var(--bg-body)', padding: '0 10px', outline: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)', fontSize: '12px', fontWeight: 'bold' }}
                value={latitude < 0 ? "S" : "N"}
                onChange={(e) => {
                  const val = Math.abs(latitude || 0);
                  onLocationChange("latitude", e.target.value === "S" ? -val : val);
                }}
              >
                <option value="N">N</option>
                <option value="S">S</option>
              </select>
            </div>

            {/* Longitude Input */}
            <div style={{ display: 'flex', flex: 1, background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <input
                type="number"
                style={{ border: 'none', padding: '10px 12px', width: '100%', outline: 'none', fontSize: '13px', background: 'transparent' }}
                placeholder="Longitude"
                value={longitude ? Math.abs(longitude) : ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const isWest = longitude < 0;
                  onLocationChange("longitude", isWest ? -val : val);
                }}
                step="any"
              />
              <select 
                style={{ border: 'none', background: 'var(--bg-body)', padding: '0 10px', outline: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)', fontSize: '12px', fontWeight: 'bold' }}
                value={longitude < 0 ? "W" : "E"}
                onChange={(e) => {
                  const val = Math.abs(longitude || 0);
                  onLocationChange("longitude", e.target.value === "W" ? -val : val);
                }}
              >
                <option value="E">E</option>
                <option value="W">W</option>
              </select>
            </div>
          </div>
          <div className="manual-entry__actions">
            <button className="btn btn--accent" onClick={onShowOnMap}>
              Show on Map
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="before-date" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-dark)', minWidth: '75px', margin: 0 }}>
                Before Date
              </label>
              <input
                id="before-date"
                className="form-field__input"
                type="date"
                value={beforeDate}
                onChange={(e) => setBeforeDate(e.target.value)}
                style={{ flex: 1, padding: '8px', margin: 0 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="after-date" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-dark)', minWidth: '75px', margin: 0 }}>
                After Date
              </label>
              <input
                id="after-date"
                className="form-field__input"
                type="date"
                value={afterDate}
                onChange={(e) => setAfterDate(e.target.value)}
                style={{ flex: 1, padding: '8px', margin: 0 }}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Leave blank to default to K30 strict research windows (2020 vs 2024).
            </div>
          </div>
          
          <div style={{ width: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <label htmlFor="cover-area" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-dark)', margin: 0 }}>
              Analysis Tiles (Model Grid)
            </label>
            <select
              id="cover-area"
              className="form-field__input"
              value={coverArea}
              onChange={(e) => setCoverArea(e.target.value)}
              style={{ appearance: "auto", cursor: "pointer", width: '100%', padding: '8px 4px', textAlign: 'center' }}
            >
              <option value="1">1 model tile (1.28 × 1.28 km)</option>
              <option value="2">2 × 2 tiles (2.56 × 2.56 km)</option>
              <option value="4">4 × 4 tiles (5.12 × 5.12 km)</option>
            </select>
          </div>
        </div>

        {/* ── Common: Name, Description, Save ──────────────── */}
        <div className="form-field">
          <label className="form-field__label" htmlFor="aoi-name">
            Project Name (Optional)
          </label>
          <input
            id="aoi-name"
            className="form-field__input"
            type="text"
            placeholder="e.g., Powai Lake Deforestation"
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
            rows={2}
          />
        </div>


        <button
          className="btn-save"
          onClick={handleSave}
          disabled={!latitude || !longitude || isSaving}
        >
          {isSaving ? "Saving..." : "Save Coordinates"}
          <span className="btn-save__arrow">→</span>
        </button>
      </div>
    </aside>
  );
}
