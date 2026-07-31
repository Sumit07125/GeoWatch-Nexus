import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function AnalysisDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Call the Analysis API endpoint which triggers GEE and the PyTorch model
    fetch(`http://localhost:5000/api/analysis/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch analysis data");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Error fetching satellite data. Did you authenticate GEE?");
        setLoading(false);
      });
  }, [id]);

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main">
        <div className="app-layout__body" style={{ padding: "40px" }}>
          <button 
            className="btn" 
            onClick={() => navigate("/projects")}
            style={{ marginBottom: "20px" }}
          >
            ← Back to Projects
          </button>

          <h1 style={{ color: "var(--text-dark)", marginBottom: "30px", fontSize: "28px" }}>
            Change Detection Analysis
          </h1>

          {loading ? (
            <div style={{ textAlign: "center", padding: "100px", color: "var(--text-muted)" }}>
              <div className="spinner" style={{ marginBottom: "20px" }}></div>
              <p>Contacting Google Earth Engine and running Siamese Attention U-Net...</p>
              <p style={{ fontSize: "12px", opacity: 0.7 }}>(This may take a minute depending on satellite availability)</p>
            </div>
          ) : error ? (
            <div className="empty-state" style={{ borderColor: "var(--red)", color: "var(--red)" }}>
              <h3>Analysis Failed</h3>
              <p>{error}</p>
            </div>
          ) : data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
              {/* Statistics Card */}
              <div style={{ background: "var(--bg-white)", padding: "20px", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", gap: "40px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }}>Change Detected</div>
                  <div style={{ fontSize: "32px", color: "var(--accent)", fontWeight: "bold" }}>{data.change_percentage}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }}>Status</div>
                  <div style={{ fontSize: "18px", color: data.change_percentage > 5 ? "var(--red)" : "var(--text-dark)", fontWeight: "600", marginTop: "8px" }}>
                    {data.change_percentage > 5 ? "Significant Changes Alert" : "Stable Region"}
                  </div>
                </div>
              </div>

              {/* Imagery Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                
                {/* Historical Image */}
                <div style={{ background: "var(--bg-white)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-dark)" }}>Historical Satellite (5-10 Yrs Ago)</h3>
                  {data.historical_url ? (
                    <img src={data.historical_url} alt="Historical" style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }} />
                  ) : (
                    <div style={{ height: "300px", background: "var(--bg-body)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Image unavailable</span>
                    </div>
                  )}
                </div>

                {/* Current Image */}
                <div style={{ background: "var(--bg-white)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-dark)" }}>Current Satellite</h3>
                  {data.current_url ? (
                    <img src={data.current_url} alt="Current" style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }} />
                  ) : (
                    <div style={{ height: "300px", background: "var(--bg-body)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px" }}>
                      <span style={{ color: "var(--text-muted)" }}>Image unavailable</span>
                    </div>
                  )}
                </div>

                {/* Change Mask */}
                <div style={{ background: "var(--bg-white)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border)", gridColumn: "1 / -1" }}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "var(--text-dark)" }}>AI Detected Change Mask (Siamese U-Net)</h3>
                  {data.mask_url ? (
                    <img src={data.mask_url} alt="Mask" style={{ width: "100%", borderRadius: "8px", border: "1px solid var(--border)" }} />
                  ) : (
                    <div style={{ height: "400px", background: "var(--bg-body)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "1px dashed var(--border)" }}>
                      <div style={{ textAlign: "center" }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "10px" }}>
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                        <p style={{ color: "var(--text-muted)", margin: 0 }}>Mask generation pending tensor download implementation</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
