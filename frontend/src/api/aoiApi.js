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
 * Update an AOI by its ID.
 * @param {string} id
 * @param {Object} aoiData
 * @returns {Promise<Object>}
 */
export async function updateAOI(id, aoiData) {
  const response = await API.put(`/aoi/${id}`, aoiData);
  return response.data;
}

/**
 * Fetch chronological change statistics for a project.
 * @param {string} projectName
 * @returns {Promise<Object>} { statistics: [...] }
 */
export async function fetchProjectStatistics(projectName) {
  const response = await API.get(`/drive/projects/${encodeURIComponent(projectName)}/statistics`);
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

/**
 * Trigger a GEE satellite image fetch for an AOI.
 * Runs asynchronously in the backend — poll /images to see when done.
 * @param {string} aoiId
 * @returns {Promise<Object>} { message, pair: { id, status, ... } }
 */
export async function triggerImageFetch(aoiId) {
  const response = await API.post(`/aoi/${aoiId}/fetch-images`, {});
  return response.data;
}

/**
 * List all image pairs (before/after) for an AOI.
 * @param {string} aoiId
 * @returns {Promise<Object>} { pairs: [...], count }
 */
export async function fetchImagePairs(aoiId) {
  const response = await API.get(`/aoi/${aoiId}/images`);
  return response.data;
}

/**
 * URL to serve the before-image PNG for a pair.
 */
export function beforeImageUrl(pairId) {
  return `${API_BASE}/images/${pairId}/before`;
}

/**
 * URL to serve the after-image PNG for a pair.
 */
export function afterImageUrl(pairId) {
  return `${API_BASE}/images/${pairId}/after`;
}

/**
 * URL to serve the multicolor change mask PNG.
 */
export function changeMaskUrl(pairId) {
  return `${API_BASE}/images/${pairId}/mask`;
}

/**
 * URL to serve the T2 + mask overlay PNG.
 */
export function t2MaskUrl(pairId) {
  return `${API_BASE}/images/${pairId}/t2-mask`;
}

/**
 * Fetch acquisition progress for an image pair.
 * @param {string} pairId
 * @returns {Promise<Object>} { pair_id, status, state, message }
 */
export async function fetchPairProgress(pairId) {
  const response = await API.get(`/images/${pairId}/progress`);
  return response.data;
}

/**
 * Fetch acquisition metadata for an image pair.
 * @param {string} pairId
 * @returns {Promise<Object>}
 */
export async function fetchPairAcquisition(pairId) {
  const response = await API.get(`/images/${pairId}/acquisition`);
  return response.data;
}

/**
 * Fetch the existing analysis JSON for an image pair.
 * Returns null (404) if analysis has not been run yet.
 * @param {string} pairId
 * @returns {Promise<Object|null>}
 */
export async function fetchPairAnalysis(pairId) {
  try {
    const response = await API.get(`/images/${pairId}/analysis`);
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Trigger K30 model inference for an image pair.
 * @param {string} pairId
 * @returns {Promise<Object>}
 */
export async function runPairAnalysis(pairId) {
  const response = await API.post(`/images/${pairId}/analyze`);
  return response.data;
}

/**
 * Fetch the change-type color legend for an image pair.
 * @param {string} pairId
 * @returns {Promise<Object>} { pair_id, classes: { "0": {...}, ... } }
 */
export async function fetchChangeLegend(pairId) {
  const response = await API.get(`/images/${pairId}/legend`);
  return response.data;
}

/**
 * URL to serve the binary change mask PNG (black = no change, white = change).
 */
export function binaryMaskUrl(pairId) {
  return `${API_BASE}/images/${pairId}/binary-mask`;
}

/**
 * Re-apply a decision threshold to the cached probability map.
 * Regenerates binary mask, change-type mask, overlay, and statistics.
 * Does NOT rerun GEE or model inference.
 *
 * @param {string} pairId
 * @param {number} threshold - normalized probability [0.01, 1.00]
 * @returns {Promise<Object>} Updated analysis JSON
 */
export async function updatePairThreshold(pairId, threshold) {
  const response = await API.post(`/images/${pairId}/threshold`, { threshold });
  return response.data;
}
