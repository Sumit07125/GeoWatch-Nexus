import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

export default function AnalyticsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <TopBar />
        
        <div style={{ padding: "40px", flex: 1, overflowY: "auto" }}>
          
          <div style={{ marginBottom: "30px" }}>
            <h1 style={{ color: "var(--text-dark)", fontSize: "28px", margin: "0 0 8px 0" }}>Graph & Analysis</h1>
            <p style={{ color: "var(--text-muted)", margin: 0 }}>Deep-dive data visualizations and cross-project analytical metrics.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
            
            {/* Bar Chart: Project Areas */}
            <div style={{ background: "var(--bg-white)", padding: "24px", borderRadius: "12px", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-dark)", margin: "0 0 20px 0" }}>Total Area Analysed (Hectares)</h2>
              <div style={{ width: "100%", height: "250px", position: "relative", display: "flex", alignItems: "flex-end", gap: "10%" }}>
                
                {/* Y-Axis lines */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", zIndex: 0, pointerEvents: "none" }}>
                  {[100, 75, 50, 25, 0].map(val => (
                    <div key={val} style={{ borderBottom: "1px dashed var(--border)", position: "relative" }}>
                      <span style={{ position: "absolute", left: "-35px", top: "-8px", fontSize: "11px", color: "var(--text-muted)" }}>{val}k</span>
                    </div>
                  ))}
                </div>

                {/* Bars */}
                <div style={{ flex: 1, height: "80%", background: "var(--primary-color)", borderRadius: "6px 6px 0 0", zIndex: 1, transition: "height 0.3s ease" }}></div>
                <div style={{ flex: 1, height: "40%", background: "#455A64", borderRadius: "6px 6px 0 0", zIndex: 1, transition: "height 0.3s ease" }}></div>
                <div style={{ flex: 1, height: "95%", background: "var(--primary-color)", borderRadius: "6px 6px 0 0", zIndex: 1, transition: "height 0.3s ease" }}></div>
                <div style={{ flex: 1, height: "60%", background: "#455A64", borderRadius: "6px 6px 0 0", zIndex: 1, transition: "height 0.3s ease" }}></div>
                <div style={{ flex: 1, height: "20%", background: "var(--primary-color)", borderRadius: "6px 6px 0 0", zIndex: 1, transition: "height 0.3s ease" }}></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", color: "var(--text-muted)", fontSize: "12px", fontWeight: "bold", paddingLeft: "15px" }}>
                <span style={{ flex: 1, textAlign: "center" }}>Amazon</span>
                <span style={{ flex: 1, textAlign: "center" }}>Navi</span>
                <span style={{ flex: 1, textAlign: "center" }}>Alps</span>
                <span style={{ flex: 1, textAlign: "center" }}>Nile</span>
                <span style={{ flex: 1, textAlign: "center" }}>Sahara</span>
              </div>
            </div>

            {/* Donut Chart: Alert Distribution */}
            <div style={{ background: "var(--bg-white)", padding: "24px", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontSize: "16px", color: "var(--text-dark)", margin: "0 0 20px 0" }}>System Alerts by Category</h2>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                
                {/* SVG Donut Chart */}
                <svg width="200" height="200" viewBox="0 0 42 42">
                  <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="var(--bg-body)" strokeWidth="8" />
                  
                  {/* Deforestation (Red) */}
                  <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#C62828" strokeWidth="8" strokeDasharray="40 60" strokeDashoffset="25" />
                  {/* Flooding (Blue) */}
                  <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1565C0" strokeWidth="8" strokeDasharray="30 70" strokeDashoffset="-15" />
                  {/* Urbanization (Grey) */}
                  <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#455A64" strokeWidth="8" strokeDasharray="30 70" strokeDashoffset="-45" />

                  <text x="21" y="21" fill="var(--text-dark)" fontSize="6" fontWeight="bold" textAnchor="middle" dy="2">142</text>
                  <text x="21" y="25" fill="var(--text-muted)" fontSize="3" textAnchor="middle">Total Alerts</text>
                </svg>

                {/* Legend */}
                <div style={{ marginLeft: "30px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#C62828" }}></div>
                    <span style={{ fontSize: "13px", color: "var(--text-dark)" }}>Deforestation (40%)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#1565C0" }}></div>
                    <span style={{ fontSize: "13px", color: "var(--text-dark)" }}>Flooding (30%)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#455A64" }}></div>
                    <span style={{ fontSize: "13px", color: "var(--text-dark)" }}>Urbanization (30%)</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Area Chart: Cross-Project Analysis */}
          <div style={{ background: "var(--bg-white)", padding: "24px", borderRadius: "12px", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "16px", color: "var(--text-dark)", margin: "0 0 20px 0" }}>Cross-Project Vegetation (NDVI) Variance</h2>
            
            <div style={{ width: "100%", height: "300px", position: "relative", background: "var(--bg-body)", borderRadius: "8px", display: "flex", alignItems: "flex-end", padding: "20px 30px" }}>
              <svg width="100%" height="100%" viewBox="0 0 800 300" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="75" x2="800" y2="75" stroke="var(--border)" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="150" x2="800" y2="150" stroke="var(--border)" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="225" x2="800" y2="225" stroke="var(--border)" strokeWidth="1" strokeDasharray="4" />
                
                {/* Project A Line */}
                <path 
                  d="M 0,250 C 100,200 200,260 300,180 C 400,100 500,120 600,60 C 700,20 750,40 800,30" 
                  fill="none" 
                  stroke="var(--primary-color)" 
                  strokeWidth="4" 
                  strokeLinecap="round" 
                />
                <path 
                  d="M 0,250 C 100,200 200,260 300,180 C 400,100 500,120 600,60 C 700,20 750,40 800,30 L 800,300 L 0,300 Z" 
                  fill="var(--primary-color)" 
                  opacity="0.1"
                />

                {/* Project B Line */}
                <path 
                  d="M 0,150 C 100,170 200,130 300,190 C 400,220 500,180 600,120 C 700,100 750,140 800,150" 
                  fill="none" 
                  stroke="#C62828" 
                  strokeWidth="3" 
                  strokeDasharray="8 8"
                  strokeLinecap="round" 
                />
              </svg>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", color: "var(--text-muted)", fontSize: "12px", fontWeight: "bold", padding: "0 10px" }}>
              <span>2020</span>
              <span>2021</span>
              <span>2022</span>
              <span>2023</span>
              <span>2024</span>
              <span>2025</span>
              <span>2026</span>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "20px" }}>
               <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "16px", height: "4px", background: "var(--primary-color)", borderRadius: "2px" }}></div>
                  <span style={{ fontSize: "13px", color: "var(--text-dark)", fontWeight: "bold" }}>Amazon Deforestation Project</span>
               </div>
               <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "16px", height: "4px", background: "#C62828", borderStyle: "dashed", borderRadius: "2px" }}></div>
                  <span style={{ fontSize: "13px", color: "var(--text-dark)", fontWeight: "bold" }}>Navi Mumbai Urbanization</span>
               </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
