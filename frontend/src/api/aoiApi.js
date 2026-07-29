/**
 * AOI API Client
 * ──────────────
 * Axios wrapper for all Area of Interest backend calls.
 * Reads the base URL from VITE_API_URL environment variable.
 */

import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const API = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

/**
 * Save a new AOI to the backend.
 * @param {Object} aoiData - { name, description, shape_type, coordinates }
 * @returns {Promise<Object>} The saved AOI object
 */
export async function saveAOI(aoiData) {
  const response = await API.post("/aoi", aoiData);
  return response.data;
}

/**
 * Fetch all saved AOIs.
 * @returns {Promise<Object>} { aois: [...], count: number }
 */
export async function fetchAOIs() {
  const response = await API.get("/aoi");
  return response.data;
}

/**
 * Fetch a single AOI by its ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function fetchAOI(id) {
  const response = await API.get(`/aoi/${id}`);
  return response.data;
}

/**
 * Delete an AOI by its ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function deleteAOI(id) {
  const response = await API.delete(`/aoi/${id}`);
  return response.data;
}

/**
 * Reverse geocode a lat/lng position using Nominatim.
 * Returns the display name of the location (free, no API key).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>} Location name
 */
export async function reverseGeocode(lat, lng) {
  const base =
    import.meta.env.VITE_NOMINATIM_URL ||
    "https://nominatim.openstreetmap.org";
  const response = await axios.get(`${base}/reverse`, {
    params: {
      lat,
      lon: lng,
      format: "json",
      zoom: 14,
      addressdetails: 1,
    },
    headers: {
      "User-Agent": "EarthSentry/1.0 (academic-project)",
    },
  });
  return response.data;
}

/**
 * Forward geocode a place name to lat/lng using Nominatim.
 * @param {string} query - Place name to search
 * @returns {Promise<Array>} Array of location results
 */
export async function forwardGeocode(query) {
  const base =
    import.meta.env.VITE_NOMINATIM_URL ||
    "https://nominatim.openstreetmap.org";
  const response = await axios.get(`${base}/search`, {
    params: {
      q: query,
      format: "json",
      limit: 5,
      addressdetails: 1,
    },
    headers: {
      "User-Agent": "EarthSentry/1.0 (academic-project)",
    },
  });
  return response.data;
}

