/**
 * MonitoringPage — Satellite Change Detection Workspace
 *
 * Layout:
 *   ① Compact header
 *   ② Horizontal control bar: [Project ▼] [Pair ▼] [Detect] + status strip
 *   ③ Decision Threshold slider (default 28 → 0.28)
 *   ④ Image comparison — Row 1: T1 | T2 | Binary (3-col)
 *   ⑤ Image comparison — Row 2: Mask | Overlay (2-col)
 *   ⑥ Detection Summary metrics (4 cards)
 *   ⑦ Change Types + Legend  |  Model Info + Quality + Benchmark (2-col)
 *
 * Scientific rules:
 *  - No-change = BLACK (#000), Uncertain mapped to BLACK.
 *  - "Uncertain" (class 255) is NEVER shown in the legend or class list.
 *  - Binary map: NO CHANGE=BLACK, CHANGE=WHITE.
 *  - Benchmark metrics are STATIC (0.28), never re-labelled with slider value.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";

// ── Error Boundary ─────────────────────────────────────────────────────────────
class MonitoringErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[MonitoringPage] Render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dark)" }}>
          <h2 style={{ marginBottom: 12 }}>Monitoring view encountered an error.</h2>
          <pre style={{ fontSize: 12, color: "var(--red)", marginBottom: 20, whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.message}
          </pre>
          <button
            type="button"
            style={{ padding: "10px 20px", borderRadius: "var(--r-md)", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Reload Monitoring
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import {
  fetchAOIs,
  fetchImagePairs,
  fetchPairProgress,
  fetchPairAnalysis,
  runPairAnalysis,
  fetchChangeLegend,
  beforeImageUrl,
  afterImageUrl,
  changeMaskUrl,
  binaryMaskUrl,
  t2MaskUrl,
  updatePairThreshold,
} from "../api/aoiApi";

// ── Scientific class config — no "Uncertain" in UI ────────────────────────────
const CLASS_CONFIG = [
  { id: 0,   name: "no_change",    label: "No change",       color: "#000000", showInLegend: false },
  { id: 1,   name: "water_gain",   label: "Water gain",      color: "#1565C0", showInLegend: true },
  { id: 2,   name: "water_loss",   label: "Water loss",      color: "#4FC3F7", showInLegend: true },
  { id: 3,   name: "construction", label: "Construction",    color: "#FF9800", showInLegend: true },
  { id: 4,   name: "veg_loss",     label: "Vegetation loss", color: "#E53935", showInLegend: true },
  { id: 5,   name: "veg_gain",     label: "Vegetation gain", color: "#43A047", showInLegend: true },
  { id: 6,   name: "other",        label: "Other change",    color: "#8E44AD", showInLegend: true },
  // 255 = uncertain — intentionally excluded from UI per scientific requirement
];

const CLASS_BY_ID = Object.fromEntries(CLASS_CONFIG.map(c => [String(c.id), c]));

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(v, digits = 4) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(digits) : String(v);
}
function fmtPct(v) {
  if (v == null) return "—";
  return `${Number(v).toFixed(4)} %`;
}
function fmtWindow(w) {
  if (!w || w.length < 2 || !w[0]) return "—";
  return `${w[0]} → ${w[1]}`;
}
function fmtDate(w) {
  if (!w || w.length < 1 || !w[0]) return "—";
  return w[0];
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size = 20, color = "var(--accent)" }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size,
        border: "2px solid var(--border)", borderTopColor: color,
        borderRadius: "50%", animation: "spin 0.9s linear infinite", flexShrink: 0,
      }}
    />
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending:  { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  fetching: { bg: "#dbeafe", color: "#1e40af", label: "Fetching…" },
  done:     { bg: "#d1fae5", color: "#065f46", label: "Done" },
  error:    { bg: "#fee2e2", color: "#991b1b", label: "Error" },
};
function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { bg: "#dbeafe", color: "#1e40af", label: status || "…" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: "var(--r-full)",
      fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, letterSpacing: "0.4px", whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ children, style, className }) {
  return (
    <div
      className={className}
      style={Object.assign({
        background: "var(--bg-card)", borderRadius: "var(--r-xl)",
        border: "1px solid var(--border)", boxShadow: "var(--shadow-card)", padding: 16,
      }, style)}
    >
      {children}
    </div>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
function SectionLabel({ children, style }) {
  return (
    <div style={Object.assign({
      fontSize: 10, fontWeight: 700, color: "var(--accent)",
      textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 8,
    }, style)}>
      {children}
    </div>
  );
}

// ── MetricCard ─────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub }) {
  return (
    <div style={{ background: "var(--bg-body)", borderRadius: "var(--r-md)", padding: "10px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-dark)", lineHeight: 1.2 }}>
        {value != null ? value : "—"}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── ImageCard ─────────────────────────────────────────────────────────────────
function ImageCard({ eyebrow, title, subtitle, label, src, alt, imgKey }) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [src, imgKey]);

  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "var(--r-xl)",
      border: "1px solid var(--border)", boxShadow: "var(--shadow-card)",
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 1 }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dark)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{subtitle}</div>}
          </div>
          {label && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.5px", padding: "2px 6px",
              borderRadius: "var(--r-md)", background: "var(--accent-light)", color: "var(--accent)",
              textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Image area — fixed height for alignment */}
      <div style={{
        position: "relative", width: "100%", height: 240,
        background: "#000", display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {!loaded && !hasError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center" }}>
            <Spinner size={24} />
            <span style={{ fontSize: 11, color: "#666" }}>Loading…</span>
          </div>
        )}
        {hasError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#666" }}>Image unavailable</span>
          </div>
        )}
        <img
          src={src}
          alt={alt || title}
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(true); setHasError(true); }}
          style={{
            width: "100%", height: "100%", objectFit: "contain", display: "block",
            opacity: loaded && !hasError ? 1 : 0,
            transition: "opacity 0.3s ease",
            imageRendering: "crisp-edges",
          }}
        />
      </div>
    </div>
  );
}

// ── PlaceholderCard ────────────────────────────────────────────────────────────
function PlaceholderCard({ eyebrow, title, subtitle, label, analysing, updatingThreshold }) {
  return (
    <div style={{
      background: "var(--bg-card)", borderRadius: "var(--r-xl)",
      border: "1px dashed var(--border)", boxShadow: "var(--shadow-card)",
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 1 }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{subtitle}</div>}
          </div>
          {label && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: "var(--r-md)", background: "var(--bg-body)", color: "var(--text-muted)", textTransform: "uppercase", flexShrink: 0 }}>
              {label}
            </span>
          )}
        </div>
      </div>
      <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--bg-body)" }}>
        {analysing || updatingThreshold
          ? <><Spinner size={24} /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{updatingThreshold ? "Updating detection…" : "Running detection…"}</span></>
          : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Run Detection Mask to reveal</span>
        }
      </div>
    </div>
  );
}

// ── Select style ───────────────────────────────────────────────────────────────
const SELECT_STYLE = {
  padding: "8px 10px", borderRadius: "var(--r-md)", border: "1px solid var(--border)",
  background: "var(--bg-white)", color: "var(--text-dark)",
  fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer",
  minWidth: 180, maxWidth: 260,
};

// ── ThresholdSlider ────────────────────────────────────────────────────────────
function ThresholdSlider({ value, onChange, disabled, style }) {
  const pct = value;                 // integer 1–100
  const prob = (pct / 100).toFixed(2);

  const handleReset = () => onChange(28);

  return (
    <div style={Object.assign({
      background: "var(--bg-card)", borderRadius: "var(--r-xl)",
      border: "1px solid var(--border)", boxShadow: "var(--shadow-card)",
      padding: "12px 16px",
    }, style)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>

        {/* Left: label + help */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dark)" }}>
                Decision Threshold
              </span>
              <span
                title="Lower thresholds detect more potential change. Higher thresholds require stronger change probability."
                style={{ fontSize: 11, color: "var(--text-muted)", cursor: "help", userSelect: "none" }}
              >
                ⓘ
              </span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
              Change probability required to classify a pixel as changed.
            </div>
          </div>
        </div>

        {/* Middle: slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 200px", minWidth: 160 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>1</span>
          <input
            type="range"
            id="threshold-slider"
            min={1} max={100} step={1}
            value={pct}
            disabled={disabled}
            onChange={e => onChange(Number(e.target.value))}
            onMouseUp={e => onChange(Number(e.target.value))}
            onTouchEnd={e => onChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)", cursor: disabled ? "not-allowed" : "pointer" }}
          />
          <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>100</span>
        </div>

        {/* Right: values + reset */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>
              prob: {prob}
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled || pct === 28}
            title="Reset to validated research threshold (0.28)"
            style={{
              padding: "5px 10px", borderRadius: "var(--r-md)",
              border: "1px solid var(--border)", background: "var(--bg-body)",
              color: "var(--text-muted)", fontSize: 11, cursor: (disabled || pct === 28) ? "not-allowed" : "pointer",
              fontFamily: "inherit", whiteSpace: "nowrap",
              opacity: pct === 28 ? 0.5 : 1, transition: "opacity 0.2s",
            }}
          >
            Reset 0.28
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LegendItem ─────────────────────────────────────────────────────────────────
function LegendItem({ color, label, pct, areakm2 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.12)" }} />
      <span style={{ fontSize: 12, color: "var(--text-body)", flex: 1, minWidth: 0 }}>{label}</span>
      {pct != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dark)", fontFamily: "monospace" }}>
          {Number(pct).toFixed(3)} %
        </span>
      )}
      {areakm2 != null && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", minWidth: 54, textAlign: "right" }}>
          {Number(areakm2).toFixed(4)} km²
        </span>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
function MonitoringPageInner() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Selection
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [pairs, setPairs] = useState([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [selectedPairId, setSelectedPairId] = useState("");

  // Analysis
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [legend, setLegend] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);

  // Threshold slider
  const [thresholdPercent, setThresholdPercent] = useState(28);
  const [updatingThreshold, setUpdatingThreshold] = useState(false);
  const [thresholdError, setThresholdError] = useState(null);
  const debounceRef = useRef(null);
  // Track the committed threshold — do NOT update on every drag tick
  const committedThresholdRef = useRef(28);
  // Image cache-busting key — incremented when images need to reload
  const [imgKey, setImgKey] = useState(0);

  // Progress polling
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  // Toast
  const [toast, setToast] = useState({ visible: false, type: "", message: "" });
  const showToast = useCallback((type, message) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast({ visible: false, type: "", message: "" }), 3500);
  }, []);

  // ── Load projects ──
  useEffect(() => {
    let cancelled = false;
    setLoadingProjects(true);
    fetchAOIs()
      .then(data => { if (!cancelled) setProjects(data.aois || []); })
      .catch(() => { if (!cancelled) setProjectsError("Unable to load projects."); })
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Load pairs when project changes ──
  useEffect(() => {
    if (!selectedProjectId) { setPairs([]); setSelectedPairId(""); return; }
    setLoadingPairs(true);
    setSelectedPairId("");
    setPairs([]);
    setAnalysis(null);
    setLegend(null);
    setAnalysisError(null);
    fetchImagePairs(selectedProjectId)
      .then(data => setPairs(data.pairs || []))
      .catch(() => showToast("error", "Unable to load image pairs."))
      .finally(() => setLoadingPairs(false));
  }, [selectedProjectId, showToast]);

  // ── Clear analysis on pair change ──
  useEffect(() => {
    setAnalysis(null);
    setLegend(null);
    setAnalysisError(null);
    setThresholdPercent(28);
    committedThresholdRef.current = 28;
    setImgKey(k => k + 1);
  }, [selectedPairId]);

  // ── Progress polling ──
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    stopPolling();
    if (!selectedPairId) { setProgress(null); return; }

    const poll = async () => {
      try {
        const data = await fetchPairProgress(selectedPairId);
        setProgress(data);
        if (selectedProjectId) {
          fetchImagePairs(selectedProjectId).then(d => setPairs(d.pairs || [])).catch(() => {});
        }
        if (data.status === "done" || data.status === "error") stopPolling();
      } catch { /* ignore transient poll failures */ }
    };

    poll();
    const sp = pairs.find(p => p.id === selectedPairId);
    if (sp && sp.status !== "done" && sp.status !== "error") {
      pollRef.current = setInterval(poll, 2000);
    }
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPairId, selectedProjectId, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // ── Derived ──
  const selectedProject = projects.find(p => p.id === selectedProjectId) || null;
  const selectedPair    = pairs.find(p => p.id === selectedPairId) || null;
  const pairDone  = selectedPair && selectedPair.status === "done";
  const pairError = selectedPair && selectedPair.status === "error";
  const btnActive = pairDone && !analysing && !updatingThreshold;

  // ── Handle detection ──
  const handleDetect = useCallback(async () => {
    if (!selectedPairId || !pairDone || analysing) return;
    setAnalysing(true);
    setAnalysisError(null);
    setAnalysis(null);
    setLegend(null);
    try {
      let result = await fetchPairAnalysis(selectedPairId);
      if (!result) result = await runPairAnalysis(selectedPairId);

      // Sync slider to the threshold stored in the returned analysis
      const storedThreshold = result && result.model && result.model.threshold;
      if (storedThreshold != null) {
        const pct = Math.round(storedThreshold * 100);
        setThresholdPercent(pct);
        committedThresholdRef.current = pct;
      }

      const legendData = await fetchChangeLegend(selectedPairId);
      setAnalysis(result);
      setLegend((legendData && legendData.classes) || {});
      setImgKey(k => k + 1);
    } catch (err) {
      const msg = (err && err.response && err.response.data &&
        (err.response.data.message || err.response.data.error)) || "Detection analysis failed.";
      setAnalysisError(msg);
      showToast("error", msg);
    } finally {
      setAnalysing(false);
    }
  }, [selectedPairId, pairDone, analysing, showToast]);

  // ── Handle threshold change — debounced ──
  const applyThreshold = useCallback(async (pct) => {
    if (!selectedPairId || !analysis) return;
    const threshold = pct / 100;

    // Don't re-apply the same threshold
    if (pct === committedThresholdRef.current) return;
    committedThresholdRef.current = pct;

    setUpdatingThreshold(true);
    setThresholdError(null);
    try {
      const result = await updatePairThreshold(selectedPairId, threshold);
      setAnalysis(result);
      setImgKey(k => k + 1); // force image reload
    } catch (err) {
      const msg = (err && err.response && err.response.data &&
        (err.response.data.message || err.response.data.error)) || "Threshold update failed.";
      setThresholdError(msg);
      showToast("error", msg);
    } finally {
      setUpdatingThreshold(false);
    }
  }, [selectedPairId, analysis, showToast]);

  const handleThresholdChange = useCallback((pct) => {
    setThresholdPercent(pct);
    if (!analysis) return; // no-op until detection has been run
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyThreshold(pct), 200);
  }, [analysis, applyThreshold]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Convenience derivations ──
  const lat = selectedProject && selectedProject.coordinates && selectedProject.coordinates[0] && selectedProject.coordinates[0][0];
  const lon = selectedProject && selectedProject.coordinates && selectedProject.coordinates[0] && selectedProject.coordinates[0][1];
  const settings = (selectedProject && selectedProject.settings) || {};

  const pairLabel = pair => {
    const t1 = (pair.t1_window && pair.t1_window[0]) || pair.before_date || "";
    const t2 = (pair.t1_window && pair.t1_window[0]) ? (pair.t2_window && pair.t2_window[0]) || pair.after_date || "" : pair.after_date || "";
    return (t1 ? `${t1} / ${t2}` : pair.id.slice(0, 8)) + ` · ${pair.status}`;
  };

  // class_statistics is a DICT from backend — use Object.values()
  const classStats = Object.values((analysis && analysis.class_statistics) || {});
  // Exclude class 255 (uncertain) from display per scientific requirement
  const detectedCls = classStats.filter(c => c && (c.pixels || 0) > 0 && Number(c.class_id) !== 255);
  const bd        = (analysis && analysis.binary_detection) || {};
  const qual      = (analysis && analysis.quality) || {};
  const modelInfo = (analysis && analysis.model) || {};
  const gtMetrics = (analysis && analysis.ground_truth_metrics) || {};
  const benchmark = (analysis && analysis.model_benchmark) || {};
  const hasAnalysis = !!analysis;

  const activeThresholdDisplay = (thresholdPercent / 100).toFixed(2);

  // ── Render ──
  return (
    <div className={`app-layout${isSidebarCollapsed ? " app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={isSidebarCollapsed} />

      <div className="app-layout__main">
        <TopBar onToggleSidebar={() => setIsSidebarCollapsed(v => !v)} />

        <div className="app-layout__body" style={{ padding: "20px 28px" }}>

          {/* ── Page Header ── */}
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-dark)" }}>
              Monitoring
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Select a project and satellite image pair, then run Geo-Nexus K30 binary change detection with spectral change typing.
            </p>
          </div>

          {/* ── Horizontal Control Bar ── */}
          <Card style={{ padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

              {/* Project selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <label htmlFor="mon-project-select" style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Project
                </label>
                {loadingProjects ? (
                  <Spinner size={14} />
                ) : projectsError ? (
                  <span style={{ fontSize: 12, color: "var(--red)" }}>{projectsError}</span>
                ) : (
                  <select
                    id="mon-project-select"
                    style={SELECT_STYLE}
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                  >
                    <option value="">— Select project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name || "Untitled"}</option>)}
                  </select>
                )}
              </div>

              {/* Divider */}
              <span style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0 }} />

              {/* Pair selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <label htmlFor="mon-pair-select" style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Image Pair
                </label>
                {loadingPairs ? (
                  <Spinner size={14} />
                ) : !selectedProjectId ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 10px" }}>Select a project first</span>
                ) : pairs.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 10px" }}>No pairs — fetch images in My Projects</span>
                ) : (
                  <select
                    id="mon-pair-select"
                    style={SELECT_STYLE}
                    value={selectedPairId}
                    onChange={e => setSelectedPairId(e.target.value)}
                  >
                    <option value="">— Select pair —</option>
                    {pairs.map(p => <option key={p.id} value={p.id}>{pairLabel(p)}</option>)}
                  </select>
                )}
              </div>

              {/* Divider */}
              {selectedPair && <span style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0 }} />}

              {/* Detection button */}
              {selectedPair && (
                <button
                  id="mon-detect-btn"
                  type="button"
                  onClick={handleDetect}
                  disabled={!btnActive}
                  title={!pairDone ? "Wait for acquisition to complete" : "Run Geo-Nexus K30 change detection"}
                  style={{
                    padding: "8px 18px", borderRadius: "var(--r-md)", border: "none",
                    background: btnActive ? "var(--accent)" : "var(--border)",
                    color: btnActive ? "#fff" : "var(--text-muted)",
                    fontWeight: 700, fontSize: 13, cursor: btnActive ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: 7,
                    transition: "background 0.2s, color 0.2s", whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {analysing ? <><Spinner size={13} color="#fff" /> Analysing…</> : "🔍 Detection Mask"}
                </button>
              )}

              {/* Status badge */}
              {selectedPair && (
                <StatusBadge status={selectedPair.status} />
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Threshold updating indicator */}
              {updatingThreshold && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  <Spinner size={12} /> Updating detection…
                </div>
              )}
            </div>

            {/* Project status strip */}
            {selectedProject && (
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
                display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dark)" }}>
                  {selectedProject.name || "Untitled"}
                </span>
                {lat != null && lon != null && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {Math.abs(lat).toFixed(5)}°{lat >= 0 ? "N" : "S"} · {Math.abs(lon).toFixed(5)}°{lon >= 0 ? "E" : "W"}
                  </span>
                )}
                {selectedProject.area_hectares != null && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {Number(selectedProject.area_hectares).toFixed(2)} ha
                  </span>
                )}
                {selectedPair && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                      T1: {fmtDate(selectedPair.t1_window)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                      T2: {fmtDate(selectedPair.t2_window)}
                    </span>
                  </>
                )}
                {pairError && progress && progress.message && (
                  <span style={{ fontSize: 11, color: "var(--red)", flex: "1 1 auto" }}>
                    ⚠️ {progress.message}
                  </span>
                )}
                {analysisError && (
                  <span style={{ fontSize: 11, color: "var(--red)" }}>⚠️ {analysisError}</span>
                )}
                {thresholdError && (
                  <span style={{ fontSize: 11, color: "var(--red)" }}>⚠️ {thresholdError}</span>
                )}
              </div>
            )}

            {/* Acquisition progress message */}
            {progress && !pairDone && !pairError && selectedPair && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
                <Spinner size={12} />
                {progress.message || "Acquiring satellite imagery…"}
              </div>
            )}
          </Card>

          {/* ── Nothing selected ── */}
          {!selectedProjectId && (
            <Card style={{ padding: "48px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                Select a project to begin monitoring
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Choose a project, select an image pair, then click <strong>Detection Mask</strong>.
              </div>
            </Card>
          )}

          {/* ── Pair selected — workspace ── */}
          {selectedPair && (
            <>
              {/* ── Decision Threshold Slider ── */}
              <ThresholdSlider
                value={thresholdPercent}
                onChange={handleThresholdChange}
                disabled={analysing || updatingThreshold || !hasAnalysis}
                style={{ marginBottom: 14 }}
              />

              {/* ════════════════════════════════════════════════════════
                   ROW 1 — T1 | T2 | Binary Change (3 columns)
                ════════════════════════════════════════════════════════ */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 12,
              }}>
                {/* Card 1 — Previous / T1 */}
                <ImageCard
                  eyebrow="PREVIOUS · T1"
                  title="Previous Image"
                  subtitle={fmtWindow(selectedPair.t1_window)}
                  label="T1"
                  src={beforeImageUrl(selectedPair.id)}
                  alt="Satellite image — before (T1)"
                  imgKey={`before-${selectedPair.id}`}
                />

                {/* Card 2 — Current / T2 */}
                <ImageCard
                  eyebrow="CURRENT · T2"
                  title="Current Image"
                  subtitle={fmtWindow(selectedPair.t2_window)}
                  label="T2"
                  src={afterImageUrl(selectedPair.id)}
                  alt="Satellite image — after (T2)"
                  imgKey={`after-${selectedPair.id}`}
                />

                {/* Card 3 — Binary Change Map */}
                {hasAnalysis ? (
                  <ImageCard
                    eyebrow="BINARY CHANGE"
                    title="Detected Change Map"
                    subtitle="K30 binary change detection"
                    label="BINARY"
                    src={`${binaryMaskUrl(selectedPair.id)}?v=${imgKey}`}
                    alt="Binary change detection map"
                    imgKey={`binary-${selectedPair.id}-${imgKey}`}
                  />
                ) : (
                  <PlaceholderCard
                    eyebrow="BINARY CHANGE"
                    title="Detected Change Map"
                    subtitle="K30 binary change detection"
                    label="BINARY"
                    analysing={analysing}
                    updatingThreshold={updatingThreshold}
                  />
                )}
              </div>

              {/* ════════════════════════════════════════════════════════
                   ROW 2 — Change-Type Mask | T2 Overlay (2 columns)
                ════════════════════════════════════════════════════════ */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}>
                {/* Card 4 — Multicolor Change-Type Mask */}
                {hasAnalysis ? (
                  <ImageCard
                    eyebrow="CHANGE-TYPE MASK"
                    title="Multicolor Change-Type Mask"
                    subtitle="Spectral change typing"
                    label="MASK"
                    src={`${changeMaskUrl(selectedPair.id)}?v=${imgKey}`}
                    alt="Multicolor change-type mask"
                    imgKey={`mask-${selectedPair.id}-${imgKey}`}
                  />
                ) : (
                  <PlaceholderCard
                    eyebrow="CHANGE-TYPE MASK"
                    title="Multicolor Change-Type Mask"
                    subtitle="Spectral change typing"
                    label="MASK"
                    analysing={analysing}
                    updatingThreshold={updatingThreshold}
                  />
                )}

                {/* Card 5 — T2 + Detection Overlay */}
                {hasAnalysis ? (
                  <ImageCard
                    eyebrow="T2 + DETECTION"
                    title="Current + Detection Overlay"
                    subtitle="Spatial change visualization"
                    label="OVERLAY"
                    src={`${t2MaskUrl(selectedPair.id)}?v=${imgKey}`}
                    alt="T2 image with detection overlay"
                    imgKey={`overlay-${selectedPair.id}-${imgKey}`}
                  />
                ) : (
                  <PlaceholderCard
                    eyebrow="T2 + DETECTION"
                    title="Current + Detection Overlay"
                    subtitle="Spatial change visualization"
                    label="OVERLAY"
                    analysing={analysing}
                    updatingThreshold={updatingThreshold}
                  />
                )}
              </div>

              {/* ── Analysis results ── */}
              {hasAnalysis && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Detection Summary — 4 metric cards in one row */}
                  <Card style={{ padding: "12px 16px" }}>
                    <SectionLabel>Detection Summary</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                      <MetricCard
                        label="Detected Change"
                        value={bd.changed_percent_before_display_typing != null
                          ? fmtPct(bd.changed_percent_before_display_typing)
                          : bd.changed_percent != null ? fmtPct(bd.changed_percent) : "—"}
                        sub="of AOI area"
                      />
                      <MetricCard
                        label="Changed Area"
                        value={bd.changed_area_km2_before_typing != null
                          ? `${fmt(bd.changed_area_km2_before_typing, 4)} km²`
                          : bd.changed_area_km2 != null ? `${fmt(bd.changed_area_km2, 4)} km²` : "—"}
                      />
                      <MetricCard
                        label="Mean Quality"
                        value={qual.q_mean != null ? fmt(qual.q_mean, 3) : "—"}
                        sub={qual.low_q_below_0_25_percent != null ? `Low-Q: ${fmt(qual.low_q_below_0_25_percent, 1)} %` : undefined}
                      />
                      <MetricCard
                        label="Decision Threshold"
                        value={modelInfo.threshold != null ? String(modelInfo.threshold) : "—"}
                        sub={modelInfo.threshold_source || undefined}
                      />
                    </div>
                  </Card>

                  {/* Change Types / Legend | Model + Quality + Benchmark */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                    {/* Left — Change-Type Classes + Legend */}
                    <Card style={{ padding: "12px 16px" }}>
                      <SectionLabel>Change-Type Classes</SectionLabel>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px 0", lineHeight: 1.4 }}>
                        Spectral change typing — not direct model outputs.
                      </p>

                      {detectedCls.length > 0 ? (
                        detectedCls.map(cls => {
                          const classId = String(cls.class_id);
                          // Skip uncertain (255) in UI
                          if (classId === "255") return null;
                          const cfg = CLASS_BY_ID[classId];
                          return (
                            <LegendItem
                              key={classId}
                              color={(cfg && cfg.color) || "#888"}
                              label={(cfg && cfg.label) || cls.class_name || classId}
                              pct={cls.percent_of_aoi}
                              areakm2={cls.area_km2}
                            />
                          );
                        })
                      ) : (
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No detected change classes.</p>
                      )}

                      {/* Compact legend — visible change classes only, no uncertain */}
                      <div style={{ margin: "10px 0 0", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                          Legend
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                          {CLASS_CONFIG.filter(c => c.showInLegend).map(cls => (
                            <LegendItem key={cls.id} color={cls.color} label={cls.label} />
                          ))}
                        </div>
                      </div>
                    </Card>

                    {/* Right — Model info + Quality + Benchmark + AOI validation */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                      {/* Model Information — 2-col grid */}
                      <Card style={{ padding: "12px 16px" }}>
                        <SectionLabel>Model Information</SectionLabel>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {[
                            ["Version",    modelInfo.version || "Geo-Nexus-v3.2-P4b-K30"],
                            ["Task",       "Binary change detection"],
                            ["Device",     modelInfo.device || "—"],
                            ["Input",      `${modelInfo.input_channels || 17} channels`],
                            ["Patch",      `${modelInfo.patch_size || 128} × ${modelInfo.patch_size || 128}`],
                            ["Resolution", `${modelInfo.resolution_m || 10} m`],
                            ["Stride",     modelInfo.stride != null ? String(modelInfo.stride) : "128"],
                            ["Threshold",  modelInfo.threshold != null ? String(modelInfo.threshold) : "0.28"],
                          ].map(([label, value]) => (
                            <div key={label} style={{ background: "var(--bg-body)", borderRadius: "var(--r-md)", padding: "6px 10px" }}>
                              <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 1, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dark)", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </Card>

                      {/* Acquisition Quality — 1 row */}
                      <Card style={{ padding: "12px 16px" }}>
                        <SectionLabel>Acquisition Quality</SectionLabel>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                          <MetricCard label="Q Min"        value={qual.q_min  != null ? fmt(qual.q_min,  3) : "—"} />
                          <MetricCard label="Q Mean"       value={qual.q_mean != null ? fmt(qual.q_mean, 3) : "—"} />
                          <MetricCard label="Q Max"        value={qual.q_max  != null ? fmt(qual.q_max,  3) : "—"} />
                          <MetricCard label="Low Q (<0.25)" value={qual.low_q_below_0_25_percent != null ? fmtPct(qual.low_q_below_0_25_percent) : "—"} />
                        </div>
                      </Card>

                      {/* AOI Validation + Benchmark */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {/* Current AOI */}
                        <Card style={{ padding: "12px 14px" }}>
                          <SectionLabel>Current AOI Validation</SectionLabel>
                          {(gtMetrics.ground_truth_available === false || !gtMetrics.ground_truth_available) ? (
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                              Ground truth unavailable for this AOI.<br />
                              F1, precision, recall, IoU and AP are not reported.
                            </p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {[["F1", gtMetrics.f1], ["Precision", gtMetrics.precision], ["Recall", gtMetrics.recall], ["IoU", gtMetrics.iou], ["AP", gtMetrics.average_precision]].map(([label, value]) => (
                                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dark)", fontFamily: "monospace" }}>{value != null ? fmt(value, 4) : "—"}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>

                        {/* Verified Research Benchmark — always at 0.28 */}
                        <Card style={{ padding: "12px 14px" }}>
                          <SectionLabel>Verified Research Benchmark</SectionLabel>
                          <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 8px 0", lineHeight: 1.4 }}>
                            MH dataset · threshold 0.28 · not metrics for this AOI.
                          </p>
                          {Object.keys(benchmark).length === 0 ? (
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Benchmark unavailable.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {[
                                benchmark.mh_val  && benchmark.mh_val.f1                != null && ["MH-VAL F1",   benchmark.mh_val.f1],
                                benchmark.mh_test && benchmark.mh_test.f1               != null && ["MH-TEST F1",  benchmark.mh_test.f1],
                                benchmark.mh_test && benchmark.mh_test.iou              != null && ["MH-TEST IoU", benchmark.mh_test.iou],
                                benchmark.mh_test && benchmark.mh_test.average_precision!= null && ["MH-TEST AP",  benchmark.mh_test.average_precision],
                              ].filter(Boolean).map(([label, value]) => (
                                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dark)", fontFamily: "monospace" }}>{fmt(value, 4)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      <div className={`toast toast--${toast.type}${toast.visible ? " toast--visible" : ""}`}>
        {toast.message}
      </div>
    </div>
  );
}

// ── Public export (wrapped in ErrorBoundary) ───────────────────────────────────
export default function MonitoringPage() {
  return (
    <MonitoringErrorBoundary>
      <MonitoringPageInner />
    </MonitoringErrorBoundary>
  );
}
