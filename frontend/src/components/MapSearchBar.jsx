/**
 * MapSearchBar Component
 * ──────────────────────
 * Floating glassmorphic search bar on the map.
 * Supports:
 *   - Place name search (Nominatim forward geocode)
 *   - Coordinate input (lat, lng → fly to point)
 *
 * Positioned top-left inside the map container.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { forwardGeocode } from "../api/aoiApi";

export default function MapSearchBar() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const markerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K to focus
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const input = wrapperRef.current?.querySelector("input");
        if (input) input.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const clearSearchMarker = useCallback(() => {
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [map]);

  const flyToLocation = useCallback(
    (lat, lng, name) => {
      clearSearchMarker();
      map.flyTo([lat, lng], 15, { duration: 1.5 });

      // Add a temporary marker
      const marker = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(
          `<div class="loc-popup">
            <div class="loc-popup__name">${name}</div>
            <div class="loc-popup__coords">${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E</div>
          </div>`
        )
        .openPopup();
      markerRef.current = marker;

      setIsOpen(false);
      setQuery(name);
    },
    [map, clearSearchMarker]
  );

  const handleSearch = useCallback(
    async (searchQuery) => {
      if (!searchQuery || searchQuery.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      // Check if it's a coordinate input (e.g., "19.123, 72.876")
      const coordMatch = searchQuery.match(
        /^\s*(-?\d+\.?\d*)\s*[,\s]+\s*(-?\d+\.?\d*)\s*$/
      );
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          setResults([
            {
              display_name: `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
              lat,
              lon: lng,
              isCoordinate: true,
            },
          ]);
          setIsOpen(true);
          return;
        }
      }

      // Otherwise, forward geocode
      setIsLoading(true);
      try {
        const data = await forwardGeocode(searchQuery);
        if (data && data.length > 0) {
          setResults(data.slice(0, 5));
          setIsOpen(true);
        } else {
          setResults([]);
          setIsOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      setQuery(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => handleSearch(value), 400);
    },
    [handleSearch]
  );

  const handleResultClick = useCallback(
    (result) => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      const name = result.isCoordinate
        ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        : result.display_name.split(",").slice(0, 2).join(",");
      flyToLocation(lat, lng, name);
    },
    [flyToLocation]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && results.length > 0) {
        handleResultClick(results[0]);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        e.target.blur();
      }
    },
    [results, handleResultClick]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    clearSearchMarker();
  }, [clearSearchMarker]);

  // Prevent map interactions when interacting with search
  const stopPropagation = useCallback((e) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="map-search"
      onMouseDown={stopPropagation}
      onDoubleClick={stopPropagation}
      onClick={stopPropagation}
    >
      <div className="map-search__bar">
        {/* Search icon */}
        <svg className="map-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          className="map-search__input"
          type="text"
          placeholder="Search places or enter coordinates…"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />

        {/* Keyboard shortcut hint / clear button */}
        {query ? (
          <button className="map-search__clear" onClick={handleClear} aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <span className="map-search__kbd">Ctrl+K</span>
        )}

        {isLoading && <div className="map-search__spinner" />}
      </div>

      {/* Results dropdown */}
      {isOpen && (
        <div className="map-search__dropdown">
          {results.length === 0 ? (
            <div className="map-search__empty">No results found</div>
          ) : (
            results.map((result, i) => (
              <button
                key={i}
                className="map-search__result"
                onClick={() => handleResultClick(result)}
              >
                <svg className="map-search__result-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {result.isCoordinate ? (
                    <>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    </>
                  ) : (
                    <>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </>
                  )}
                </svg>
                <span className="map-search__result-text">
                  {result.display_name.length > 60
                    ? result.display_name.slice(0, 60) + "…"
                    : result.display_name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
