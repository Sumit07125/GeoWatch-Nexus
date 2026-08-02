import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { fetchAOIs, fetchProjectStatistics } from "../api/aoiApi";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main" style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f4f7fa" }}>
        <TopBar />
        
        <div 
          style={{ padding: "0", flex: 1, overflowY: "auto", position: "relative" }}
          onScroll={(e) => {
            const top = e.target.scrollTop;
            setIsScrolled(prev => {
              if (!prev && top > 80) return true;
              if (prev && top < 20) return false;
              return prev;
            });
          }}
        >
          {loading ? (
             <p style={{ color: "#777", padding: "20px 40px" }}>Loading projects...</p>
          ) : !selectedProject ? (
             <div style={{ background: "white", padding: "40px", margin: "20px 40px", borderRadius: "12px", textAlign: "center", border: "1px solid #e0e0e0" }}>
               <p style={{ color: "#777", margin: "0" }}>No project selected or found.</p>
             </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              
              {/* Sticky Header Container */}
              <div style={{
                position: "sticky",
                top: 0, // stick exactly to the top of the scroll container
                zIndex: 9999, // Ensure it stays above recharts (which uses z-index layers up to 2000)
                background: "var(--bg-body)", // Matches the app's exact background color
                padding: "24px 40px 12px 40px", 
                borderBottom: "1px solid rgba(0,0,0,0.05)" // Subtle edge when scrolling
              }}>
                {/* Theme-compliant Welcome Banner */}
                <div className="welcome-banner" style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: isScrolled ? "0" : "16px", 
                  alignItems: "stretch", 
                  padding: isScrolled ? "12px 24px" : "20px 28px",
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span className="welcome-banner__greeting" style={{ fontSize: isScrolled ? "16px" : "18px", margin: 0, transition: "font-size 0.3s" }}>Select Project:</span>
                      <select 
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        style={{ 
                          padding: "6px 12px", 
                          borderRadius: "6px", 
                          border: "1px solid rgba(255,255,255,0.3)", 
                          background: "rgba(0,0,0,0.15)", 
                          color: "white", 
                          cursor: "pointer",
                          fontSize: "14px",
                          outline: "none"
                        }}
                      >
                        {projects.map(proj => (
                          <option key={proj.id} value={proj.id} style={{ color: "#333" }}>{proj.name || "Untitled Project"}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      <div className="welcome-banner__stat" style={{ margin: 0 }}>
                        <span className="welcome-banner__stat-num">{imagesData.length}</span>
                        <span className="welcome-banner__stat-label">TOTAL CAPTURES</span>
                      </div>
                      <button 
                        onClick={() => navigate(`/analysis/${selectedProjectId}`)}
                        className="welcome-banner__step-tag"
                        style={{ cursor: "pointer", border: "none" }}
                      >
                        Analysis Dashboard
                      </button>
                    </div>
                  </div>

                  {/* Bottom Row: Project Details */}
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "12px", 
                    flexWrap: "wrap", 
                    position: "relative", 
                    zIndex: 1,
                    overflow: "hidden",
                    maxHeight: isScrolled ? "0" : "50px",
                    opacity: isScrolled ? 0 : 1,
                    transition: "all 0.3s ease",
                    marginTop: isScrolled ? "0" : "4px"
                  }}>
                    <h3 style={{ margin: "0 12px 0 0", fontSize: "16px", fontWeight: "600", color: "white" }}>{selectedProject.name}</h3>

                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
                      📍 {selectedProject.coordinates && selectedProject.coordinates.length > 0 ? `${selectedProject.coordinates[0][0].toFixed(3)}, ${selectedProject.coordinates[0][1].toFixed(3)}` : "Unknown"}
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
                      📐 {selectedProject.area_hectares} ha
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
                      📅 Baseline: {selectedProject.settings ? selectedProject.settings.previous_date : "N/A"}
                    </span>
                    <span style={{ background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", color: "white", display: "flex", alignItems: "center", gap: "6px" }}>
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
              <div style={{ padding: "12px 40px 40px 40px", minHeight: "100vh" }}>
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e0e0e0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", minHeight: "80vh" }}>
                
                {/* GRAPHICAL ANALYTICS TAB */}
                {activeTab === "Graphical Analytics" && (
                  <div style={{ padding: "30px" }}>
                    <h2 style={{ fontSize: "18px", color: "#333", margin: "0 0 24px 0" }}>Deforestation Trend Overview</h2>
                    
                    {statsLoading ? (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Running OpenCV difference analysis to plot graph...</div>
                    ) : statisticsData.length > 0 ? (
                      <div style={{ display: "grid", gap: "40px" }}>
                        <div>
                          <h3 style={{ fontSize: "14px", color: "#666", margin: "0 0 16px 0", textAlign: "center" }}>Percentage Change (% Deforestation)</h3>
                          <div style={{ height: "300px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                <YAxis tick={{fontSize: 12, fill: "#666"}} />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                <Line type="monotone" dataKey="percentage_changed" name="% Change" stroke="#f44336" strokeWidth={3} activeDot={{ r: 8 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div>
                          <h3 style={{ fontSize: "14px", color: "#666", margin: "0 0 16px 0", textAlign: "center" }}>Affected Area (km²)</h3>
                          <div style={{ height: "300px", width: "100%" }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statisticsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                                <XAxis dataKey="to_date" tick={{fontSize: 12, fill: "#666"}} />
                                <YAxis tick={{fontSize: 12, fill: "#666"}} />
                                <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                                <Line type="monotone" dataKey="area_km2" name="Area (km²)" stroke="#15716e" strokeWidth={3} activeDot={{ r: 8 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Insufficient data to plot analytics. Need at least 2 consecutive image captures.</div>
                    )}
                  </div>
                )}

                {/* TIMELINE STATISTICS (ROADMAP) TAB */}
                {activeTab === "Timeline Statistics" && (
                  <div style={{ padding: "40px 20px", background: "#f8f9fa", minHeight: "500px" }}>
                    
                    {statsLoading ? (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Running OpenCV difference analysis... This may take a moment.</div>
                    ) : statisticsData.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', padding: '40px 0' }}>
                        
                        {/* The straight road */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '48px', background: '#2c3e50', borderRadius: '24px', zIndex: 1, boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.2)' }}>
                           {/* Dashed line down the middle */}
                           <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '4px', marginLeft: '-2px', borderLeft: '4px dashed rgba(255,255,255,0.7)', zIndex: 2 }}></div>
                        </div>

                        {/* Timeline items alternating left and right */}
                        {[...statisticsData].reverse().map((stat, idx) => (
                           <div key={idx} style={{ display: 'flex', width: '100%', maxWidth: '800px', justifyContent: idx % 2 === 0 ? 'flex-start' : 'flex-end', marginBottom: '60px', position: 'relative', zIndex: 3 }}>
                              <div style={{ width: '45%', position: 'relative', textAlign: idx % 2 === 0 ? 'right' : 'left', padding: idx % 2 === 0 ? '0 50px 0 0' : '0 0 0 50px' }}>
                                 
                                 {/* Marker pin pointing to road */}
                                 <div style={{ 
                                    position: 'absolute', 
                                    top: '30px', 
                                    [idx % 2 === 0 ? 'right' : 'left']: '-24px', 
                                    width: '74px', 
                                    height: '4px', 
                                    background: getStatusColor(stat.percentage_changed),
                                    zIndex: 0
                                 }}></div>
                                 
                                 {/* Dot on the road */}
                                 <div style={{
                                    position: 'absolute',
                                    top: '22px',
                                    [idx % 2 === 0 ? 'right' : 'left']: '-34px',
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    background: getStatusColor(stat.percentage_changed),
                                    border: '4px solid white',
                                    zIndex: 4,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                 }}></div>

                                 {/* Card content */}
                                 <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', display: 'inline-block', width: '100%', position: 'relative', zIndex: 1 }}>
                                    <span style={{ 
                                      display: 'inline-block',
                                      padding: '4px 12px',
                                      background: stat.percentage_changed > 2 ? '#ffebee' : '#e8f5e9',
                                      color: stat.percentage_changed > 2 ? '#d32f2f' : '#2e7d32',
                                      borderRadius: '20px',
                                      fontSize: '12px',
                                      fontWeight: 'bold',
                                      marginBottom: '12px'
                                    }}>
                                      {stat.from_date} ➔ {stat.to_date}
                                    </span>
                                    
                                    <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '24px' }}>
                                      {stat.percentage_changed > 0 ? '+' : ''}{stat.percentage_changed}% Change
                                    </h3>
                                    
                                    <p style={{ margin: '0', color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: idx % 2 === 0 ? 'flex-end' : 'flex-start' }}>
                                      📐 Area Affected: <strong>{stat.area_km2} km²</strong>
                                    </p>
                                 </div>
                              </div>
                           </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Insufficient data to calculate timeline statistics. Need at least 2 images.</div>
                    )}
                  </div>
                )}

                {/* UPCOMING CAPTURES TAB */}
                {activeTab === "Upcoming Captures" && (
                  <div>
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
                  <div style={{ display: "flex", height: "600px" }}>
                    
                    {/* Left Panel: List of Dates (Master) */}
                    <div style={{ width: "280px", borderRight: "1px solid #e0e0e0", background: "#f8f9fa", display: "flex", flexDirection: "column" }}>
                      <div style={{ padding: "20px", borderBottom: "1px solid #e0e0e0", background: "white" }}>
                        <h3 style={{ margin: 0, fontSize: "14px", color: "#333", textTransform: "uppercase", letterSpacing: "1px" }}>Capture History</h3>
                      </div>
                      
                      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
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

                    {/* Right Panel: Image Display (Detail) */}
                    <div style={{ flex: 1, padding: "30px", background: "white", overflowY: "auto" }}>
                      {imagesData.length > 0 && imagesData[selectedCaptureIdx] ? (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid #eee" }}>
                            <h2 style={{ margin: 0, fontSize: "24px", color: "#333" }}>Image Analysis for {imagesData[selectedCaptureIdx].date}</h2>
                            <span style={{ background: "#e8f4f4", color: "#15716e", padding: "6px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold" }}>
                              Viewing Capture {selectedCaptureIdx + 1} of {imagesData.length}
                            </span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
                            {imagesData[selectedCaptureIdx].images['rgb.png'] && (
                              <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "12px", border: "1px solid #e0e0e0" }}>
                                <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#333", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#2196f3", borderRadius: "50%" }}></span>
                                  TRUE COLOR COMPOSITE (RGB)
                                </p>
                                <img 
                                  src={`http://localhost:5000/api/drive/files/${imagesData[selectedCaptureIdx].images['rgb.png']}`} 
                                  style={{ width: "100%", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} 
                                  alt="RGB" 
                                />
                              </div>
                            )}
                            
                            {imagesData[selectedCaptureIdx].images['index.png'] && (
                              <div style={{ background: "#f8f9fa", padding: "16px", borderRadius: "12px", border: "1px solid #e0e0e0" }}>
                                <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#333", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#4caf50", borderRadius: "50%" }}></span>
                                  COMPUTED VEGETATION INDEX
                                </p>
                                <img 
                                  src={`http://localhost:5000/api/drive/files/${imagesData[selectedCaptureIdx].images['index.png']}`} 
                                  style={{ width: "100%", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} 
                                  alt="Index" 
                                />
                              </div>
                            )}
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
