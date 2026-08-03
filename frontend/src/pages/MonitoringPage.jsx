import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { fetchAOIs, fetchProjectStatistics } from "../api/aoiApi";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';

export default function MonitoringPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [imagesData, setImagesData] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  
  const [statisticsData, setStatisticsData] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState("Graphical Analytics");
  const [selectedCaptureIdx, setSelectedCaptureIdx] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchAOIs().then(res => {
      const fetchedProjects = res.aois || [];
      setProjects(fetchedProjects);
      if (fetchedProjects.length > 0) {
        setSelectedProjectId(fetchedProjects[0].id);
      }
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    if (selectedProject) {
      // Fetch Images
      setImagesLoading(true);
      fetch(`http://localhost:5000/api/drive/projects/${encodeURIComponent(selectedProject.name)}/dates`)
        .then(res => res.json())
        .then(data => {
          setImagesData(data.dates || []);
          setSelectedCaptureIdx(0);
          setImagesLoading(false);
        })
        .catch(err => {
          console.error("Failed to load images", err);
          setImagesData([]);
          setImagesLoading(false);
        });
        
      // Fetch Statistics
      setStatsLoading(true);
      fetchProjectStatistics(selectedProject.name)
        .then(data => {
          // Reverse statistics so they map left to right on the chart chronologically
          let stats = data.statistics || [];
          setStatisticsData([...stats].reverse());
          setStatsLoading(false);
        })
        .catch(err => {
          console.error("Failed to load statistics", err);
          setStatisticsData([]);
          setStatsLoading(false);
        });
    }
  }, [selectedProject]);

  // Generate Upcoming Dates
  const getUpcomingDates = () => {
    if (!selectedProject || !selectedProject.settings) return [];
    
    const repDays = selectedProject.settings.repetition_days || 5;
    let baseDate = new Date();
    
    if (imagesData.length > 0) {
      baseDate = new Date(imagesData[0].date);
    } else if (selectedProject.settings.current_date) {
      baseDate = new Date(selectedProject.settings.current_date);
    }
    
    const upcoming = [];
    let current = new Date(baseDate);
    for (let i = 0; i < 5; i++) {
      current.setDate(current.getDate() + repDays);
      upcoming.push(new Date(current).toISOString().split('T')[0]);
    }
    return upcoming;
  };

  const upcomingDates = getUpcomingDates();

  const getStatusColor = (percent) => {
    if (percent < 2) return "#4caf50";
    if (percent < 5) return "#ff9800";
    return "#f44336";
  };

  const handleScroll = (e) => {
    const top = e.target.scrollTop;
    setIsScrolled(prev => {
      if (!prev && top > 80) return true;
      if (prev && top < 20) return false;
      return prev;
    });
  };

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main" style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f4f7fa" }}>
        <TopBar />
        
        <div 
          style={{ padding: "0", flex: 1, overflowY: "hidden", overflowX: "hidden", position: "relative", display: "flex", flexDirection: "column" }}
        >
          {loading ? (
             <p style={{ color: "#777", padding: "20px 40px" }}>Loading projects...</p>
          ) : !selectedProject ? (
             <div style={{ background: "white", padding: "40px", margin: "20px 40px", borderRadius: "12px", textAlign: "center", border: "1px solid #e0e0e0" }}>
               <p style={{ color: "#777", margin: "0" }}>No project selected or found.</p>
             </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              
              {/* Sticky Header Container */}
              <div style={{
                position: "sticky",
                top: 0,
                zIndex: 9999,
                background: "transparent", 
                padding: "12px 40px 8px 40px", 
                borderBottom: "none" 
              }}>
                {/* Theme-compliant Welcome Banner */}
                <div className="welcome-banner" style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: isScrolled ? "0" : "8px", 
                  alignItems: "stretch", 
                  padding: isScrolled ? "6px 16px" : "12px 20px",
                  transition: "all 0.3s ease"
                }}>
                  {!isScrolled && (
                    <>
                      <div className="welcome-banner__cloud welcome-banner__cloud--1" />
                      <div className="welcome-banner__cloud welcome-banner__cloud--2" />
                      <div className="welcome-banner__cloud welcome-banner__cloud--3" />
                    </>
                  )}
                  
                  {/* Top Row: Selector & Stats */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1, minHeight: "36px" }}>
                    
                    {/* LEFT SIDE */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span className="welcome-banner__greeting" style={{ fontSize: isScrolled ? "14px" : "16px", margin: 0, transition: "font-size 0.3s", fontWeight: "500", lineHeight: 1 }}>Select Project:</span>
                      
                      <select 
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        style={{ 
                          padding: "0 10px", 
                          borderRadius: "6px", 
                          border: "1px solid rgba(255,255,255,0.3)", 
                          background: "rgba(0,0,0,0.15)", 
                          color: "white", 
                          cursor: "pointer",
                          fontSize: isScrolled ? "14px" : "16px",
                          outline: "none",
                          transition: "font-size 0.3s",
                          height: "32px",
                          lineHeight: "32px"
                        }}
                      >
                        {projects.map(proj => (
                          <option key={proj.id} value={proj.id} style={{ color: "#333" }}>{proj.name || "Untitled Project"}</option>
                        ))}
                      </select>
                      
                      <h3 style={{ margin: "0", fontSize: isScrolled ? "16px" : "18px", fontWeight: "600", color: "white", transition: "font-size 0.3s", lineHeight: 1 }}>
                        {selectedProject.name}
                      </h3>
                    </div>

                    {/* RIGHT SIDE */}
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      
                      <div className="welcome-banner__stat" style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", padding: "0 12px", borderRadius: "8px", height: "36px" }}>
                        <span className="welcome-banner__stat-num" style={{ fontSize: "14px", fontWeight: "bold", lineHeight: 1 }}>{imagesData.length}</span>
                        <span className="welcome-banner__stat-label" style={{ fontSize: "9px", opacity: 0.8, marginTop: "4px", lineHeight: 1 }}>CAPTURES</span>
                      </div>
                      
                      <button 
                        onClick={() => navigate(`/analysis/${selectedProjectId}`)}
                        style={{ cursor: "pointer", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.15)", color: "white", fontSize: "12px", fontWeight: "600", padding: "0 16px", borderRadius: "8px", height: "36px", display: "flex", alignItems: "center", transition: "all 0.2s" }}
                        onMouseOver={(e) => e.target.style.background = "rgba(0,0,0,0.3)"}
                        onMouseOut={(e) => e.target.style.background = "rgba(0,0,0,0.15)"}
                      >
                        Dashboard
                      </button>
                    </div>
                  </div>

                  {/* Bottom Row: Project Details */}
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    flexWrap: "wrap", 
                    position: "relative", 
                    zIndex: 1,
                    overflow: "hidden",
                    maxHeight: isScrolled ? "0" : "50px",
                    opacity: isScrolled ? 0 : 1,
                    transition: "all 0.3s ease",
                    marginTop: isScrolled ? "0" : "2px"
                  }}>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "16px", fontSize: "10px", color: "white", display: "flex", alignItems: "center", gap: "4px" }}>
                      📍 {selectedProject.coordinates && selectedProject.coordinates.length > 0 ? `${selectedProject.coordinates[0][0].toFixed(3)}, ${selectedProject.coordinates[0][1].toFixed(3)}` : "Unknown"}
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "16px", fontSize: "10px", color: "white", display: "flex", alignItems: "center", gap: "4px" }}>
                      📐 {selectedProject.area_hectares} ha
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "16px", fontSize: "10px", color: "white", display: "flex", alignItems: "center", gap: "4px" }}>
                      📅 Baseline: {selectedProject.settings ? selectedProject.settings.previous_date : "N/A"}
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: "16px", fontSize: "10px", color: "white", display: "flex", alignItems: "center", gap: "4px" }}>
                      ⚙️ Index: {selectedProject.settings ? selectedProject.settings.index_type : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: "12px", justifyContent: "center", margin: "16px 0 0 0" }}>
                  {["Graphical Analytics", "Timeline Statistics", "Upcoming Captures", "All Captures"].map(tab => (
                    <button 
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: "8px 20px",
                        borderRadius: "8px",
                        border: activeTab === tab ? "none" : "1px solid #d0d0d0",
                        background: activeTab === tab ? "#15716e" : "white",
                        color: activeTab === tab ? "white" : "#555",
                        fontWeight: "600",
                        fontSize: "13px",
                        cursor: "pointer",
                        boxShadow: activeTab === tab ? "0 4px 8px rgba(21, 113, 110, 0.3)" : "0 2px 4px rgba(0,0,0,0.05)",
                        transition: "0.2s"
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content Area */}
              <div style={{ padding: "12px 40px 40px 40px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e0e0e0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                
                {/* GRAPHICAL ANALYTICS TAB */}
                {activeTab === "Graphical Analytics" && (
                  <div style={{ padding: "30px", flex: 1, overflowY: "auto" }} onScroll={handleScroll}>
                    <h2 style={{ fontSize: "18px", color: "#333", margin: "0 0 24px 0" }}>Deforestation Trend Overview</h2>
                    
                    {statsLoading ? (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Running OpenCV difference analysis to plot graph...</div>
                    ) : statisticsData.length > 0 ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginBottom: "30px" }}>
                          
                          {/* 1. Cumulative Deforestation */}
                          <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
                            <h3 style={{ fontSize: "14px", color: "#333", margin: "0 0 16px 0", textAlign: "center", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Cumulative Deforestation (km²)</h3>
                            <div style={{ height: "250px", width: "100%" }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <defs>
                                    <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#f44336" stopOpacity={0.8}/>
                                      <stop offset="95%" stopColor="#f44336" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                  <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                  <YAxis tick={{fontSize: 12, fill: "#666"}} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                  <Area type="monotone" dataKey="area_km2" stroke="#f44336" fillOpacity={1} fill="url(#colorArea)" animationDuration={1500} animationEasing="ease-out" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 2. Mean Vegetation Health */}
                          <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
                            <h3 style={{ fontSize: "14px", color: "#333", margin: "0 0 16px 0", textAlign: "center", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Average Vegetation Health (Index)</h3>
                            <div style={{ height: "250px", width: "100%" }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                  <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 12, fill: "#666"}} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                  <Line type="monotone" dataKey="mean_index" name="Mean Index" stroke="#4caf50" strokeWidth={3} activeDot={{ r: 8 }} animationDuration={1500} animationEasing="ease-out" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          
                          {/* 3. Rate of Change */}
                          <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
                            <h3 style={{ fontSize: "14px", color: "#333", margin: "0 0 16px 0", textAlign: "center", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Deforestation Rate (% Change)</h3>
                            <div style={{ height: "250px", width: "100%" }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                  <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                  <YAxis tick={{fontSize: 12, fill: "#666"}} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                  <Bar dataKey="percentage_changed" name="% Changed" fill="#ff9800" radius={[4, 4, 0, 0]} animationDuration={1500} animationEasing="ease-out" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 4. Recovery vs Loss */}
                          <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
                            <h3 style={{ fontSize: "14px", color: "#333", margin: "0 0 16px 0", textAlign: "center", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Recovery vs. Loss (km²)</h3>
                            <div style={{ height: "250px", width: "100%" }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                  <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                  <YAxis tick={{fontSize: 12, fill: "#666"}} />
                                  <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                  <Legend />
                                  <Bar dataKey="recovery_area_km2" stackId="a" name="Recovery" fill="#4caf50" animationDuration={1500} />
                                  <Bar dataKey="area_km2" stackId="a" name="Loss" fill="#f44336" radius={[4, 4, 0, 0]} animationDuration={1500} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>

                        {/* 5. Density Breakdown (Full Width) */}
                        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #eee" }}>
                          <h3 style={{ fontSize: "14px", color: "#333", margin: "0 0 16px 0", textAlign: "center", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Vegetation Density Breakdown (%)</h3>
                          <div style={{ height: "350px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} stackOffset="expand">
                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                <YAxis tickFormatter={(tick) => `${tick * 100}%`} tick={{fontSize: 12, fill: "#666"}} />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                <Legend />
                                <Area type="monotone" dataKey="dense_percent" stackId="1" name="Dense Forest" stroke="#2e7d32" fill="#2e7d32" animationDuration={1500} />
                                <Area type="monotone" dataKey="sparse_percent" stackId="1" name="Sparse Vegetation" stroke="#8bc34a" fill="#8bc34a" animationDuration={1500} />
                                <Area type="monotone" dataKey="barren_percent" stackId="1" name="Barren Land" stroke="#ffeb3b" fill="#ffeb3b" animationDuration={1500} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Insufficient data to plot analytics. Need at least 2 consecutive image captures.</div>
                    )}
                  </div>
                )}

                {/* TIMELINE STATISTICS (ROADMAP) TAB */}
                {activeTab === "Timeline Statistics" && (
                  <div style={{ background: "white", flex: 1, overflowY: "auto", overflowX: "auto", display: "flex", flexDirection: "column" }} onScroll={handleScroll}>
                    
                    {statsLoading ? (
                      <div style={{ padding: "40px", width: "100%", textAlign: "center", color: "#666" }}>Running OpenCV difference analysis... This may take a moment.</div>
                    ) : statisticsData.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', minWidth: '100%', minHeight: '440px', alignSelf: 'center', margin: 'auto' }}>
                        
                        {/* The Curved Winding Road SVG */}
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
                          <defs>
                            <pattern id="curvedRoad" x="0" y="0" width="500" height="440" patternUnits="userSpaceOnUse" patternTransform="translate(40, 0)">
                              {/* Road Shadow */}
                              <path d="M 0,220 C 62.5,220 62.5,40 125,40 C 200,40 300,400 375,400 C 437.5,400 437.5,220 500,220" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="48" strokeLinecap="round" transform="translate(0, 4)" />
                              {/* Main Road Base */}
                              <path d="M 0,220 C 62.5,220 62.5,40 125,40 C 200,40 300,400 375,400 C 437.5,400 437.5,220 500,220" fill="none" stroke="#2c3e50" strokeWidth="40" strokeLinecap="round" />
                              {/* Center Dashed Line */}
                              <path d="M 0,220 C 62.5,220 62.5,40 125,40 C 200,40 300,400 375,400 C 437.5,400 437.5,220 500,220" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="12,12" strokeLinecap="round" />
                            </pattern>
                          </defs>
                          <rect x="0" y="0" width="100%" height="100%" fill="url(#curvedRoad)" />
                        </svg>

                        {/* Timeline Items Layer */}
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', height: '440px', padding: '0 40px', position: 'relative', zIndex: 1, width: 'max-content' }}>
                           {[...statisticsData].reverse().map((stat, idx) => (
                              <div key={idx} style={{ width: '250px', height: '440px', position: 'relative', flexShrink: 0 }}>
                                 
                                 {/* Dot on the road */}
                                 <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: idx % 2 === 0 ? '40px' : '400px',
                                    transform: 'translate(-50%, -50%)',
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    background: getStatusColor(stat.percentage_changed),
                                    border: '3px solid white',
                                    zIndex: 4,
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                                 }}></div>

                                 {/* Vertical Connecting Line */}
                                 <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: idx % 2 === 0 ? '40px' : '318px',
                                    width: '3px',
                                    height: '82px',
                                    background: getStatusColor(stat.percentage_changed),
                                    transform: 'translateX(-50%)',
                                    zIndex: 3
                                 }}></div>

                                 {/* Card content */}
                                 <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: idx % 2 === 0 ? '170px' : '270px',
                                    transform: 'translate(-50%, -50%)',
                                    width: '180px',
                                    background: '#fff', 
                                    padding: '14px 10px', 
                                    borderRadius: '14px', 
                                    boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                                    zIndex: 5,
                                    textAlign: 'center',
                                    borderTop: idx % 2 === 0 ? `4px solid ${getStatusColor(stat.percentage_changed)}` : '1px solid #eee',
                                    borderBottom: idx % 2 !== 0 ? `4px solid ${getStatusColor(stat.percentage_changed)}` : '1px solid #eee',
                                    borderLeft: '1px solid #eee',
                                    borderRight: '1px solid #eee',
                                 }}>
                                    <span style={{ 
                                      display: 'inline-block',
                                      padding: '3px 8px',
                                      background: stat.percentage_changed > 2 ? '#ffebee' : '#e8f5e9',
                                      color: stat.percentage_changed > 2 ? '#d32f2f' : '#2e7d32',
                                      borderRadius: '12px',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      marginBottom: '8px'
                                    }}>
                                      {stat.from_date} ➔ {stat.to_date}
                                    </span>
                                    
                                    <h3 style={{ margin: '0 0 6px 0', color: '#333', fontSize: '18px' }}>
                                      {stat.percentage_changed > 0 ? '+' : ''}{stat.percentage_changed}% Change
                                    </h3>
                                    
                                    <p style={{ margin: '0', color: '#666', fontSize: '11px' }}>
                                      📐 Area: <strong>{stat.area_km2} km²</strong>
                                    </p>
                                 </div>
                              </div>
                           ))}
                           {/* End padding spacer to ensure pattern continues naturally past the last item */}
                           <div style={{ width: '40px', height: '100%', flexShrink: 0 }}></div>
                        </div>

                        {/* Animated Car Overlay */}
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 6, pointerEvents: 'none', overflow: 'visible' }}>
                          <g>
                            <animateMotion 
                              dur={`${(Math.ceil(statisticsData.length / 2) + 1) * 3}s`} 
                              repeatCount="1" 
                              fill="freeze"
                              path={`M 40,220 ${"c 62.5,0 62.5,-180 125,-180 c 75,0 175,360 250,360 c 62.5,0 62.5,-180 125,-180 ".repeat(Math.ceil(statisticsData.length / 2) + 1)}`}
                              rotate="auto"
                            />
                            <text fontSize="40" transform="scale(-1, 1)" dominantBaseline="central" textAnchor="middle">🚙</text>
                          </g>
                        </svg>

                      </div>
                    ) : (
                      <div style={{ padding: "40px", width: "100%", textAlign: "center", color: "#666" }}>Insufficient data to plot analytics. Need at least 2 consecutive image captures.</div>
                    )}
                  </div>
                )}

                {/* UPCOMING CAPTURES TAB */}
                {activeTab === "Upcoming Captures" && (
                  <div style={{ flex: 1, overflowY: "auto" }} onScroll={handleScroll}>
                    <div style={{ background: "#f8f9fa", padding: "20px 30px", borderBottom: "1px solid #e0e0e0" }}>
                      <h2 style={{ fontSize: "16px", color: "#333", margin: 0 }}>Scheduled Satellite Captures</h2>
                      <p style={{ margin: "4px 0 0 0", color: "#666", fontSize: "13px" }}>Based on your configured repetition interval of {selectedProject?.settings?.repetition_days || 5} days.</p>
                    </div>
                    <div style={{ background: "#15716e", color: "white", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "16px 30px", fontSize: "12px", fontWeight: "bold", letterSpacing: "1px" }}>
                      <div>SCHEDULED DATE</div>
                      <div>STATUS</div>
                      <div>PREDICTION</div>
                    </div>
                    {upcomingDates.length > 0 ? (
                      upcomingDates.map((date, idx) => (
                        <div key={idx} style={{ 
                          display: "grid", 
                          gridTemplateColumns: "1fr 1fr 1fr", 
                          padding: "20px 30px", 
                          borderBottom: "1px solid #f0f0f0",
                          alignItems: "center",
                          fontSize: "14px",
                          color: "#333"
                        }}>
                          <div style={{ fontWeight: "600", color: "#15716e" }}>📅 {date}</div>
                          <div>
                            <span style={{ 
                              background: "#fff3e0",
                              color: "#ef6c00",
                              padding: "6px 14px",
                              borderRadius: "20px",
                              fontSize: "12px",
                              fontWeight: "bold"
                            }}>
                              ⏳ Pending Capture
                            </span>
                          </div>
                          <div style={{ color: "#aaa", fontStyle: "italic", fontSize: "12px" }}>Awaiting Earth Engine Sync...</div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>No upcoming captures configured.</div>
                    )}
                  </div>
                )}

                {/* ALL CAPTURES TAB (MASTER-DETAIL VIEW) */}
                {activeTab === "All Captures" && (
                  <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
                    
                    {/* Left Panel: List of Dates (Master) */}
                    <div style={{ width: "160px", borderRight: "1px solid #e0e0e0", background: "#f8f9fa", display: "flex", flexDirection: "column" }}>
                      <div style={{ padding: "20px", borderBottom: "1px solid #e0e0e0", background: "white" }}>
                        <h3 style={{ margin: 0, fontSize: "14px", color: "#333", textTransform: "uppercase", letterSpacing: "1px" }}>Capture History</h3>
                      </div>
                      
                      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }} onScroll={handleScroll}>
                        {imagesLoading ? (
                          <p style={{ color: "#666", textAlign: "center", fontSize: "14px", marginTop: "20px" }}>Loading...</p>
                        ) : imagesData.length > 0 ? (
                          imagesData.map((dateObj, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedCaptureIdx(idx)}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "16px",
                                background: selectedCaptureIdx === idx ? "#e0f2f1" : "white",
                                border: "1px solid",
                                borderColor: selectedCaptureIdx === idx ? "#15716e" : "#eee",
                                borderRadius: "8px",
                                marginBottom: "8px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                color: selectedCaptureIdx === idx ? "#15716e" : "#333",
                                fontWeight: selectedCaptureIdx === idx ? "bold" : "normal",
                                boxShadow: selectedCaptureIdx === idx ? "0 2px 8px rgba(21,113,110,0.1)" : "none"
                              }}
                            >
                              📸 {dateObj.date}
                            </button>
                          ))
                        ) : (
                          <p style={{ color: "#666", textAlign: "center", fontSize: "14px" }}>No captures available.</p>
                        )}
                      </div>
                    </div>

                    {/* Right Panel: Detail View (Images) */}
                    {/* Right Panel: Detail View (Images) */}
                    <div style={{ flex: 1, minWidth: 0, padding: "16px", background: "white", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                      {imagesData[selectedCaptureIdx] ? (
                        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }} onScroll={handleScroll}>
                          <style>{`
                            .zoom-img { transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1); }
                            .zoom-img:hover { transform: scale(1.6); cursor: zoom-in; }
                          `}</style>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid #eee", flexShrink: 0 }}>
                            <h2 style={{ margin: 0, fontSize: "16px", color: "#333" }}>Image Analysis for {imagesData[selectedCaptureIdx].date}</h2>
                            <span style={{ background: "#e8f4f4", color: "#15716e", padding: "4px 8px", borderRadius: "16px", fontSize: "10px", fontWeight: "bold" }}>
                              Capture {selectedCaptureIdx + 1} of {imagesData.length}
                            </span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", flex: 1, minHeight: 0 }}>
                            {/* 1. Previous Image */}
                            {imagesData[selectedCaptureIdx + 1] ? (
                              <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "12px", border: "1px solid #e0e0e0", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                                <p style={{ margin: "4px 0 8px 4px", fontSize: "11px", color: "#333", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                  <span style={{ display: "inline-block", width: "6px", height: "6px", background: "#ff9800", borderRadius: "50%" }}></span>
                                  PREVIOUS ({imagesData[selectedCaptureIdx + 1].date})
                                </p>
                                <div style={{ flex: 1, overflow: "hidden", borderRadius: "8px", minHeight: 0, display: "flex", justifyContent: "center" }}>
                                  <img 
                                    className="zoom-img"
                                    src={`http://localhost:5000${imagesData[selectedCaptureIdx + 1].images['rgb.png']}`} 
                                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }} 
                                    alt="Previous RGB" 
                                  />
                                </div>
                              </div>
                            ) : (
                              <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "12px", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                                <p style={{ color: "#999", fontSize: "12px", textAlign: "center" }}>No previous image<br/>(First Capture)</p>
                              </div>
                            )}

                            {/* 2. Current Image */}
                            {imagesData[selectedCaptureIdx].images['rgb.png'] && (
                              <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "12px", border: "1px solid #e0e0e0", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                                <p style={{ margin: "4px 0 8px 4px", fontSize: "11px", color: "#333", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                  <span style={{ display: "inline-block", width: "6px", height: "6px", background: "#2196f3", borderRadius: "50%" }}></span>
                                  CURRENT ({imagesData[selectedCaptureIdx].date})
                                </p>
                                <div style={{ flex: 1, overflow: "hidden", borderRadius: "8px", minHeight: 0, display: "flex", justifyContent: "center" }}>
                                  <img 
                                    className="zoom-img"
                                    src={`http://localhost:5000${imagesData[selectedCaptureIdx].images['rgb.png']}`} 
                                    style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }} 
                                    alt="Current RGB" 
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* 3. Changed Pixels Mask */}
                            {(() => {
                              const stat = statisticsData.find(s => s.to_date === imagesData[selectedCaptureIdx].date);
                              return stat ? (
                                <div style={{ background: "#111", padding: "8px", borderRadius: "12px", border: "1px solid #333", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                                  <p style={{ margin: "4px 0 8px 4px", fontSize: "11px", color: "#fff", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                    <span style={{ display: "inline-block", width: "6px", height: "6px", background: "#f44336", borderRadius: "50%" }}></span>
                                    CHANGED PIXELS
                                  </p>
                                  <div style={{ flex: 1, overflow: "hidden", borderRadius: "8px", minHeight: 0, display: "flex", justifyContent: "center", background: "#000" }}>
                                    <img 
                                      className="zoom-img"
                                      src={stat.mask_url} 
                                      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }} 
                                      alt="Changed Pixels" 
                                    />
                                  </div>
                                  <div style={{ marginTop: "8px", padding: "6px", background: "rgba(244, 67, 54, 0.15)", borderRadius: "6px", textAlign: "center", border: "1px solid rgba(244, 67, 54, 0.3)" }}>
                                    <span style={{ color: "#ff5252", fontWeight: "bold", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                      {stat.percentage_changed}% Change Detected
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ background: "#f8f9fa", padding: "8px", borderRadius: "12px", border: "1px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                                  <p style={{ color: "#999", fontSize: "12px", textAlign: "center" }}>No change data<br/>(First Capture)</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#999" }}>
                          Select a capture from the left panel to view images.
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
