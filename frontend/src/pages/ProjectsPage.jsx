import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function ProjectsPage() {
  const [aois, setAois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("http://localhost:5000/api/aoi")
      .then((res) => res.json())
      .then((data) => {
        setAois(data.aois || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch AOIs", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main">
        <div className="app-layout__body" style={{ padding: "40px" }}>
          <h1 style={{ color: "var(--text-dark)", marginBottom: "30px", fontSize: "28px" }}>
            My Projects
          </h1>
          
          {loading ? (
            <p>Loading projects...</p>
          ) : aois.length === 0 ? (
            <div className="empty-state">
              <p>No projects found. Go back and create an AOI.</p>
              <button className="btn btn--accent" onClick={() => navigate("/aoi")} style={{ marginTop: "15px" }}>
                Create AOI
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
              {aois.map((aoi) => (
                <div 
                  key={aoi.id}
                  onClick={() => navigate(`/analysis/${aoi.id}`)}
                  style={{
                    background: "var(--bg-white)",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    transition: "transform 0.2s, box-shadow 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                  }}
                >
                  <div style={{
                    height: "140px",
                    background: "var(--accent-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--accent)"
                  }}>
                    {/* Placeholder for AOI Thumbnail */}
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <circle cx="12" cy="13" r="3"/>
                    </svg>
                  </div>
                  <div style={{ padding: "16px" }}>
                    <h3 style={{ fontSize: "16px", margin: "0 0 8px 0", color: "var(--text-dark)" }}>
                      {aoi.name || "Untitled Project"}
                    </h3>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 12px 0" }}>
                      Created: {new Date(aoi.created_at).toLocaleDateString()}
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ fontSize: "10px", background: "var(--bg-body)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)" }}>
                        {aoi.shape_type}
                      </span>
                      <span style={{ fontSize: "10px", background: "var(--bg-body)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)" }}>
                        {aoi.area_hectares} ha
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
