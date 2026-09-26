/**
 * ProjectsPage — "My Projects"
 * Lists all saved AOIs as cards. Each card shows:
 *   - Project name, coordinates, date range, cover-area setting
 *   - A "Fetch Satellite Images" button (calls GEE via backend)
 *   - Before / After satellite image thumbnails once fetched
 *
 * Spec: 128×128 px @ 10 m/pixel per tile · 1,280 m × 1,280 m ground area
 *       Up to Nx tiles stitched into one mosaic.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";

import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import {
  fetchAOIs,
  deleteAOI,
  triggerImageFetch,
  fetchImagePairs,
  fetchPairProgress,
  beforeImageUrl,
  afterImageUrl,
} from "../api/aoiApi";

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  pending:  { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  done:     { bg: "#d1fae5", color: "#065f46", label: "Done" },
  error:    { bg: "#fee2e2", color: "#991b1b", label: "Error" },
};

function StatusBadge({ status }) {
  // If status is a detailed progress string, treat it as "Fetching..." style
  let s = STATUS_COLORS[status];
  let isProgress = false;
  if (!s) {
    s = { bg: "#dbeafe", color: "#1e40af", label: status };
    isProgress = true;
  }
  
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "2px 10px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 600,
      background: s.bg,
      color: s.color,
      letterSpacing: "0.4px",
    }}>
      {isProgress && (
         <span style={{ width: "10px", height: "10px", border: "2px solid rgba(30,64,175,0.3)", borderTopColor: "#1e40af", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
      )}
      {s.label}
    </span>
  );
}

// ── Image pair viewer ─────────────────────────────────────────────────────────
function ImagePairCard({ pair, progressMessage }) {
  const nx = pair.nx || 1;
  const patchPx = pair.patch_px || 128;
  const resMtr  = pair.resolution_m || 10;
  const groundM = (nx * patchPx * resMtr).toFixed(0);
  const groundKm = (groundM / 1000).toFixed(3);
  const areaKm2  = ((groundM / 1000) ** 2).toFixed(4);

  return (
    <div style={{
      background: "var(--bg-body)",
      borderRadius: "12px",
      padding: "16px",
      marginTop: "16px",
      border: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>
          Image Pair
        </div>
        <StatusBadge status={pair.status} />
      </div>

      {/* Spec info */}
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px", fontFamily: "monospace", lineHeight: 1.8 }}>
        Resolution: {resMtr} m/pixel · Patch: {patchPx}×{patchPx} px · Grid: {nx}×{nx} tiles
        <br/>
        Ground: {groundM} m × {groundM} m = {groundKm} km × {groundKm} km = {areaKm2} km²
      </div>

      {/* Analysis windows (actual research windows from GEE) */}
      {pair.t1_window && pair.t1_window[0] && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: 1, background: "var(--bg-white)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: "2px" }}>📅 T1 Analysis Window (Before)</div>
            <div style={{ fontWeight: 600, color: "var(--text-dark)" }}>{pair.t1_window[0]} → {pair.t1_window[1]}</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>Research-grade composite period</div>
          </div>
          <div style={{ flex: 1, background: "var(--bg-white)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: "2px" }}>📅 T2 Analysis Window (After)</div>
            <div style={{ fontWeight: 600, color: "var(--text-dark)" }}>{pair.t1_window && pair.t2_window ? `${pair.t2_window[0]} → ${pair.t2_window[1]}` : '—'}</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>Research-grade composite period</div>
          </div>
        </div>
      )}

      {/* Live progress message during fetch */}
      {pair.status === "fetching" && progressMessage && (
        <div style={{
          background: "var(--bg-body)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "8px 12px",
          marginBottom: "12px",
          fontSize: "11px",
          color: "var(--text-muted)",
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{ width: "10px", height: "10px", border: "2px solid rgba(30,64,175,0.3)", borderTopColor: "#1e40af", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite", flexShrink: 0 }} />
          {progressMessage}
        </div>
      )}

      {/* Images */}

      {pair.status === "done" && (
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              📅 BEFORE
            </div>
            <img
              src={beforeImageUrl(pair.id)}
              alt="Before satellite image"
              style={{
                width: "100%",
                borderRadius: "8px",
                border: "2px solid var(--border)",
                imageRendering: "crisp-edges",
              }}
            />
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "6px" }}>
              📅 AFTER
            </div>
            <img
              src={afterImageUrl(pair.id)}
              alt="After satellite image"
              style={{
                width: "100%",
                borderRadius: "8px",
                border: "2px solid var(--border)",
                imageRendering: "crisp-edges",
              }}
            />
          </div>
        </div>
      )}

      {pair.status !== "done" && pair.status !== "error" && pair.status !== "pending" && (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "13px" }}>
          <div style={{ width: "28px", height: "28px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
          {pair.status}
        </div>
      )}

      {pair.status === "error" && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "12px", borderRadius: "8px", fontSize: "12px" }}>
          ⚠️ {pair.error || "Fetch failed. Check GEE credentials and try again."}
        </div>
      )}
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────
function ProjectCard({ aoi, onDelete, onFetch }) {
  const [pairs, setPairs] = useState([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [progressMessages, setProgressMessages] = useState({}); // { pairId: message }
  const pairsRef = useRef([]); // always reflects the current pairs without stale closure

  const lat = aoi.coordinates?.[0]?.[0];
  const lon = aoi.coordinates?.[0]?.[1];
  const s   = aoi.settings || {};

  const loadPairs = useCallback(async () => {
    setLoadingPairs(true);
    try {
      const data = await fetchImagePairs(aoi.id);
      const p = data.pairs || [];
      pairsRef.current = p;
      setPairs(p);
    } catch {
      setPairs([]);
    } finally {
      setLoadingPairs(false);
    }
  }, [aoi.id]);

  // Poll while any pair is fetching — also poll progress endpoint for detailed messages
  useEffect(() => {
    let interval;

    loadPairs();

    interval = setInterval(async () => {
      // Read current pairs via ref — no stale closure, no React anti-pattern
      const currentPairs = pairsRef.current;
      const isFetching = currentPairs.some(p => p.status !== "done" && p.status !== "error");
      if (expanded || isFetching) {
        if (isFetching && !expanded) {
          setExpanded(true); // Auto-expand if a background fetch is running
        }
        await loadPairs();
        // Fetch progress messages for fetching pairs
        const fetchingPairs = currentPairs.filter(p => p.status === "fetching");
        for (const p of fetchingPairs) {
          try {
            const prog = await fetchPairProgress(p.id);
            if (prog && prog.message) {
              setProgressMessages(prev => ({ ...prev, [p.id]: prog.message }));
            }
          } catch { /* ignore */ }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [expanded, loadPairs]); // pairsRef is stable, no dependency needed


  const handleFetch = async () => {
    setFetching(true);
    try {
      await triggerImageFetch(aoi.id);
      setExpanded(true);
      await loadPairs();
    } catch (e) {
      alert(e?.response?.data?.error || "Failed to start fetch. Check backend.");
    } finally {
      setFetching(false);
    }
  };

  const hasFetchableDates = s.before_date && s.after_date;

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      padding: "20px 24px",
      boxShadow: "var(--shadow-card)",
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Card Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-dark)" }}>
            {aoi.name || "Untitled Project"}
          </h3>
          {aoi.description && (
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              {aoi.description}
            </p>
          )}
        </div>
        <button
          onClick={() => onDelete(aoi.id)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}
          title="Delete project"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
        {[
          { label: "Latitude",   value: lat ? `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}` : "—" },
          { label: "Longitude",  value: lon ? `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? "E" : "W"}` : "—" },
          { label: "Before Date", value: s.before_date || "—" },
          { label: "After Date",  value: s.after_date  || "—" },
          { label: "Area Scale",  value: `${s.analysis_tiles || s.cover_area || "1"} tile(s)` },
          { label: "Area (ha)",   value: `${aoi.area_hectares?.toFixed(2) || "0"} ha` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "var(--bg-body)", borderRadius: "8px", padding: "8px 12px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Spec reminder */}
      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace", marginBottom: "14px",
        background: "var(--bg-body)", borderRadius: "8px", padding: "8px 12px", lineHeight: 1.7 }}>
        128×128 px · 10 m/px · 1,280 m side · 1.6384 km² / tile
      </div>

      {/* Action row */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          onClick={handleFetch}
          disabled={fetching}
          style={{
            padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 600, fontSize: "13px", display: "flex", alignItems: "center", gap: "7px",
            opacity: fetching ? 0.7 : 1, transition: "opacity 0.2s",
          }}
          title="Fetch satellite imagery from GEE (defaults to K30 dates if not set)"
        >
          {fetching
            ? <><span style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />Fetching…</>
            : <>🛰️ Fetch Satellite Images</>
          }
        </button>

        {pairs.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--bg-body)", cursor: "pointer", fontSize: "13px", color: "var(--text-dark)", fontWeight: 500 }}
          >
            {expanded ? "▲ Hide" : `▼ View ${pairs.length} pair${pairs.length !== 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      {!s.before_date && !s.after_date && (
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px" }}>
          ℹ️ No dates provided. Defaulting to K30 strict research windows (2020 vs 2024).
        </p>
      )}

      {/* Image pairs */}
      {expanded && (
        <div>
          {loadingPairs && pairs.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px", color: "var(--text-muted)", fontSize: "13px" }}>
              Loading…
            </div>
          )}
          {pairs.map((pair) => (
            <ImagePairCard key={pair.id} pair={pair} progressMessage={progressMessages[pair.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const [aois, setAois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "", message: "" });

  const showToast = (type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: "", message: "" }), 3500);
  };

  const loadAOIs = async () => {
    try {
      const data = await fetchAOIs();
      setAois(data.aois || []);
    } catch {
      showToast("error", "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAOIs(); }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this project and all its images?")) return;
    try {
      await deleteAOI(id);
      setAois((prev) => prev.filter((a) => a.id !== id));
      showToast("success", "Project deleted.");
    } catch {
      showToast("error", "Failed to delete.");
    }
  };

  return (
    <div className={`app-layout ${isSidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={isSidebarCollapsed} />

      <div className="app-layout__main">
        <TopBar onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />

        <div className="app-layout__body" style={{ padding: "24px 32px" }}>
          {/* Page header */}
          <div style={{ marginBottom: "28px" }}>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "var(--text-dark)" }}>
              My Projects
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "14px", color: "var(--text-muted)" }}>
              Manage your saved AOIs and satellite image pairs.
              Each image is a <strong>128×128 px · 10 m/pixel</strong> Sentinel-2 composite
              with 11 optical + 2 SAR channels.
            </p>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>
              <div style={{ width: "32px", height: "32px", border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              Loading projects…
            </div>
          )}

          {!loading && aois.length === 0 && (
            <div style={{ textAlign: "center", padding: "64px 32px", color: "var(--text-muted)" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 16px", display: "block" }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>No projects yet</div>
              <div style={{ fontSize: "13px" }}>
                Go to the <strong>Dashboard</strong> to save your first coordinate.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: "20px" }}>
            {aois.map((aoi) => (
              <ProjectCard
                key={aoi.id}
                aoi={aoi}
                onDelete={handleDelete}
                onFetch={loadAOIs}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`toast toast--${toast.type} ${toast.visible ? "toast--visible" : ""}`}>
        {toast.message}
      </div>
    </div>
  );
}
