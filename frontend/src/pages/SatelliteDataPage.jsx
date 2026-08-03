import React, { useState, useEffect, useRef } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useTheme } from "../context/ThemeContext";

export default function SatelliteDataPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [logs, setLogs] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const endOfLogsRef = useRef(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/logs");
        const data = await response.json();
        setLogs(data.logs || []);
      } catch (err) {
        console.error("Failed to fetch logs", err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getColorForType = (type) => {
    switch (type) {
      case "fetch": return "#ffca28"; // Yellow
      case "save": return "#4caf50"; // Green
      case "success": return "#8bc34a"; // Light Green
      case "compare": return "#42a5f5"; // Blue
      case "error": return "#f44336"; // Red
      case "warning": return "#ff9800"; // Orange
      case "info": 
      default: return "#e0e0e0"; // Light gray
    }
  };

  return (
    <div className={`app-layout ${isDark ? "app-layout--dark" : ""} ${collapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      
      <main className="app-layout__main" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <TopBar />

        <div style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ background: "#1e1e1e", borderRadius: "12px", padding: "24px", flex: 1, overflowY: "auto", fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace", fontSize: "14px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", border: "1px solid #333" }}>
            <div style={{ color: "#4caf50", marginBottom: "24px", fontWeight: "bold", fontSize: "15px", borderBottom: "1px dashed #333", paddingBottom: "12px" }}>
              $ connection established with Earth Engine...<br/>
              $ listening for active background satellite jobs...
            </div>
            {logs.length === 0 && (
              <div style={{ color: "#666", fontStyle: "italic" }}>Waiting for background scheduler...</div>
            )}
            {logs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: "10px", lineHeight: "1.6", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <span style={{ color: "#666", flexShrink: 0, userSelect: "none" }}>[{log.timestamp}]</span>
                <span style={{ color: getColorForType(log.type), wordBreak: "break-word" }}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={endOfLogsRef} />
          </div>
        </div>
      </main>
    </div>
  );
}
