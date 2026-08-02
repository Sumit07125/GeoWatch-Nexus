import React, { useState, useCallback, useRef, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import MapView from "../components/MapView";
import AOIPanel from "../components/AOIPanel";
import InfoBadge from "../components/InfoBadge";
import { saveAOI, forwardGeocode } from "../api/aoiApi";

export default function AOIPage() {
  const [latitude, setLatitude] = useState(37.38);
  const [longitude, setLongitude] = useState(-122.08);
  const [panTrigger, setPanTrigger] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [locationName, setLocationName] = useState(null);
  const [toast, setToast] = useState({ visible: false, type: "", message: "" });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef(null);
  const searchWrapperRef = useRef(null);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }
    setIsSearching(true);
    try {
      const data = await forwardGeocode(query);
      if (data && data.length > 0) {
        setSearchResults(data.slice(0, 5));
        setIsSearchOpen(true);
      } else {
        setSearchResults([]);
        setIsSearchOpen(true);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const onSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => handleSearch(val), 400);
  };

  const handleResultClick = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setLatitude(lat);
    setLongitude(lng);
    
    // Auto trigger map update
    setTimeout(() => {
      setPanTrigger(prev => prev + 1);
    }, 100);

    const name = result.display_name.split(",").slice(0, 2).join(",");
    setSearchQuery(name);
    setIsSearchOpen(false);
  };

  const showToast = useCallback((type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: "", message: "" }), 3000);
  }, []);

  const handleLocationChange = (field, value) => {
    if (field === "latitude") setLatitude(value);
    if (field === "longitude") setLongitude(value);
  };

  const handleMapClick = (lat, lon) => {
    setLatitude(parseFloat(lat.toFixed(5)));
    setLongitude(parseFloat(lon.toFixed(5)));
    setLocationName(null);
  };

  const handleShowOnMap = () => {
    setPanTrigger(prev => prev + 1);
  };

  const handleSave = useCallback(
    async ({ name, description }) => {
      setIsSaving(true);
      try {
        await saveAOI({
          name: name || "Untitled Project",
          description,
          shape_type: "point",
          coordinates: [[latitude, longitude]],
        });
        showToast("success", "Project coordinates saved successfully!");
      } catch (err) {
        const message =
          err.response?.data?.error ||
          "Failed to save coordinates. Is the backend running?";
        showToast("error", message);
      } finally {
        setIsSaving(false);
      }
    },
    [latitude, longitude, showToast]
  );

  return (
    <div className={`app-layout ${isSidebarCollapsed ? 'app-layout--collapsed' : ''}`}>
      <Sidebar collapsed={isSidebarCollapsed} />

      <div className="app-layout__main">
        <TopBar onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />

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
                Define the coordinate center for your satellite monitoring.
              </p>
            </div>
            <div className="welcome-banner__right">
              <div className="welcome-banner__stat">
                <span className="welcome-banner__stat-num">1</span>
                <span className="welcome-banner__stat-label">Step 1 of 4</span>
              </div>
              <div className="welcome-banner__step-tag">Define Point</div>
            </div>
          </div>

          {/* ── Search Bar Section (Absolute Overlap) ───────────────────────────────────── */}
          <div style={{ position: "relative", zIndex: 1000, height: 0 }} ref={searchWrapperRef}>
            <div 
              style={{ 
                position: "absolute", 
                top: "-28px", 
                left: "32px", 
                width: "100%",
                maxWidth: "340px",
              }} 
            >
              <div style={{ 
                position: "relative", 
                width: "100%",
                borderRadius: "38px",
                border: "8px solid var(--bg-body)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                background: "var(--bg-white)"
              }}>
                <input
                  type="text"
                  style={{ 
                    width: "100%", 
                    padding: "10px 16px 10px 40px", 
                    borderRadius: "30px",
                    border: "none", 
                    background: "transparent", 
                    color: "var(--text-dark)",
                    fontSize: "13px",
                    outline: "none"
                  }}
                  placeholder="Search city or region..."
                  value={searchQuery}
                  onChange={onSearchInputChange}
                  onFocus={() => searchResults.length > 0 && setIsSearchOpen(true)}
                />
                <svg style={{ position: "absolute", left: "16px", top: "11px", color: "var(--text-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {isSearching && (
                  <div style={{ position: "absolute", right: "12px", top: "11px", width: "16px", height: "16px", border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                )}

                {/* Results Dropdown */}
                {isSearchOpen && (
                  <div style={{ position: "absolute", top: "100%", left: "0px", right: "0px", marginTop: "8px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "16px", boxShadow: "var(--shadow-dropdown)", zIndex: 100, overflow: "hidden" }}>
                    {searchResults.length === 0 ? (
                      <div style={{ padding: "16px", fontSize: "14px", color: "var(--text-muted)", textAlign: "center" }}>No results found</div>
                    ) : (
                      searchResults.map((res, i) => (
                        <button
                          key={i}
                          onClick={() => handleResultClick(res)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 20px", fontSize: "14px", color: "var(--text-dark)", background: "transparent", border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-body)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          {res.display_name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="aoi-content" style={{ marginTop: "12px" }}>
            <div className="aoi-content__map-wrapper">
              <MapView
                lat={latitude}
                lon={longitude}
                onLocationClick={handleMapClick}
                panTrigger={panTrigger}
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, height: "100%", borderRadius: "var(--r-xl)", border: "none" }}
              />
              <InfoBadge />
            </div>

            <AOIPanel
              latitude={latitude}
              longitude={longitude}
              locationName={locationName}
              onLocationChange={handleLocationChange}
              onShowOnMap={handleShowOnMap}
              onSave={handleSave}
              isSaving={isSaving}
            />
          </div>
        </div>
      </div>

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
