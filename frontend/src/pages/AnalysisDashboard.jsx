import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAOI, deleteAOI, updateAOI } from "../api/aoiApi";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import MapView from "../components/MapView";

export default function AnalysisDashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [countdown, setCountdown] = useState("");

  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });

  const [formData, setFormData] = useState({
    latitude: 37.38,
    longitude: -122.08,
    previous_date: "2023-01-01",
    current_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    repetition_days: 5,
    index_type: "NDVI"
  });

  const [panTrigger, setPanTrigger] = useState(0);

  useEffect(() => {
    if (id) {
      fetchAOI(id).then(res => {
        if (res.aoi) {
          setProject(res.aoi);
          setEditForm({ name: res.aoi.name || "", description: res.aoi.description || "" });
          
          let updates = {};
          if (res.aoi.coordinates && res.aoi.coordinates.length > 0) {
            const [lat, lon] = res.aoi.coordinates[0];
            updates.latitude = lat;
            updates.longitude = lon;
          }
          if (res.aoi.settings) {
            updates = { ...updates, ...res.aoi.settings };
          }
          
          if (Object.keys(updates).length > 0) {
            setFormData(prev => ({ ...prev, ...updates }));
            setPanTrigger(prev => prev + 1);
          }
        }
      }).catch(err => {
        console.error("Failed to load project", err);
        setError("Failed to load project details.");
      });
    }
  }, [id]);

  useEffect(() => {
    if (project?.status === "running" && project?.settings?.end_date) {
      const end = new Date(project.settings.end_date).getTime();
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const distance = end - now;
        if (distance < 0) {
          clearInterval(interval);
          setCountdown("EXPIRED");
        } else {
          const days = Math.floor(distance / (1000 * 60 * 60 * 24));
          const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((distance % (1000 * 60)) / 1000);
          setCountdown(`${days}d ${hours}h ${mins}m ${secs}s`);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown("");
    }
  }, [project]);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this project?")) {
      try {
        await deleteAOI(id);
        navigate("/projects");
      } catch (err) {
        alert("Failed to delete project");
      }
    }
  };

  const handleUpdate = async () => {
    try {
      const updated = await updateAOI(id, editForm);
      setProject(updated.aoi);
      setIsEditing(false);
    } catch (err) {
      alert("Failed to update project");
    }
  };

  const getTags = () => {
    const tags = [];
    if (formData.index_type === "NDVI") {
      tags.push({ label: "Forestry & Vegetation", color: "#2E7D32", bg: "#E8F5E9" });
      tags.push({ label: "Deforestation Risk", color: "#C62828", bg: "#FFEBEE" });
    } else if (formData.index_type === "NDWI") {
      tags.push({ label: "Water Bodies", color: "#1565C0", bg: "#E3F2FD" });
      tags.push({ label: "Flood Monitoring", color: "#0277BD", bg: "#E1F5FE" });
    } else if (formData.index_type === "NDSI") {
      tags.push({ label: "Snow & Ice", color: "#455A64", bg: "#ECEFF1" });
      tags.push({ label: "Glacial Coverage", color: "#37474F", bg: "#CFD8DC" });
    }
    return tags;
  };

  const handleMapClick = (lat, lon) => {
    setFormData(prev => ({
      ...prev,
      latitude: parseFloat(lat.toFixed(5)),
      longitude: parseFloat(lon.toFixed(5))
    }));
  };

  const handleShowOnMap = () => {
    setPanTrigger(prev => prev + 1);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const numberFields = ["latitude", "longitude", "repetition_days"];
    setFormData(prev => ({
      ...prev,
      [name]: numberFields.includes(name) ? Number(value) : value
    }));
  };

  const handleSaveConfig = async () => {
    try {
      const settings = {
        previous_date: formData.previous_date,
        current_date: formData.current_date,
        end_date: formData.end_date,
        repetition_days: formData.repetition_days,
        index_type: formData.index_type
      };
      
      const updated = await updateAOI(id, { settings });
      setProject(updated.aoi);
      alert("Configuration saved successfully!");
    } catch (err) {
      alert("Failed to save configuration.");
    }
  };

  const handleStartProject = async () => {
    try {
      const settings = {
        previous_date: formData.previous_date,
        current_date: formData.current_date,
        end_date: formData.end_date,
        repetition_days: formData.repetition_days,
        index_type: formData.index_type
      };
      
      const updated = await updateAOI(id, { 
        status: "running",
        start_time: new Date().toISOString(),
        settings: settings
      });
      setProject(updated.aoi);
    } catch (err) {
      alert("Failed to start project.");
    }
  };

  const handleStopProject = async () => {
    try {
      const updated = await updateAOI(id, { status: "stopped" });
      setProject(updated.aoi);
    } catch (err) {
      alert("Failed to stop project.");
    }
  };

  return (
    <div className={`app-layout ${sidebarCollapsed ? "app-layout--collapsed" : ""}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      
      <main className="app-layout__main" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <TopBar />
        
        <div style={{ padding: "40px", flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "30px" }}>
            {isEditing ? (
              <div style={{ flex: 1, marginRight: "20px" }}>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  style={{ width: "100%", padding: "10px", fontSize: "24px", fontWeight: "bold", marginBottom: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }}
                />
                <textarea 
                  value={editForm.description} 
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                  rows={3}
                  style={{ width: "100%", padding: "10px", fontSize: "14px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)", resize: "none" }}
                />
                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button onClick={handleUpdate} className="btn btn--accent">Save</button>
                  <button onClick={() => setIsEditing(false)} className="btn">Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
                  <h1 style={{ color: "var(--text-dark)", fontSize: "28px", margin: 0 }}>
                    {project ? project.name : "Change Detection Explorer"}
                  </h1>
                  {project && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ 
                        background: project.status === "running" ? "#E8F5E9" : "#FFEBEE", 
                        color: project.status === "running" ? "#2E7D32" : "#C62828", 
                        padding: "4px 12px", 
                        borderRadius: "16px", 
                        fontSize: "12px", 
                        fontWeight: "bold",
                        border: `1px solid ${project.status === "running" ? "#2E7D3240" : "#C6282840"}`
                      }}>
                        {project.status === "running" ? "● RUNNING" : "STOPPED"}
                      </span>
                      {project.status === "running" && countdown && (
                         <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: "bold" }}>
                           ⏳ {countdown} remaining
                         </span>
                      )}
                    </div>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", margin: "0 0 16px 0", maxWidth: "800px" }}>
                  {project?.description ? project.description : "Analyze multispectral indices using Earth Engine and OpenCV."}
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {getTags().map((tag, idx) => (
                    <span key={idx} style={{ background: tag.bg, color: tag.color, padding: "4px 12px", borderRadius: "16px", fontSize: "12px", fontWeight: "bold", border: `1px solid ${tag.color}40` }}>
                      {tag.label}
                    </span>
                  ))}
                  {project?.shape_type && (
                    <span style={{ background: "var(--bg-body)", color: "var(--text-muted)", padding: "4px 12px", borderRadius: "16px", fontSize: "12px", fontWeight: "bold", border: "1px solid var(--border)", textTransform: "capitalize" }}>
                      {project.shape_type}
                    </span>
                  )}
                </div>
              </div>
            )}

            {project && !isEditing && (
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setIsEditing(true)} className="btn" style={{ background: "var(--bg-body)", color: "var(--text-dark)", border: "1px solid var(--border)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
                <button onClick={handleDelete} className="btn" style={{ background: "#FFEbee", color: "#c62828", border: "1px solid #ffcdd2" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px" }}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Split Layout: Form (Left) | Satellite Map (Right) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
            
            {/* Configuration Form */}
            <div style={{ background: "var(--bg-white)", padding: "24px", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "20px" }}>
              
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>LATITUDE</label>
                  <input type="number" step="0.000001" name="latitude" value={formData.latitude} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>LONGITUDE</label>
                  <input type="number" step="0.000001" name="longitude" value={formData.longitude} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>PREVIOUS DATE</label>
                  <input type="date" name="previous_date" value={formData.previous_date} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>CURRENT DATE</label>
                  <input type="date" name="current_date" value={formData.current_date} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>END DATE</label>
                  <input type="date" name="end_date" value={formData.end_date} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>REPETITION INTERVAL</label>
                  <select name="repetition_days" value={formData.repetition_days} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)", cursor: "pointer" }}>
                    <option value="1">Every 1 day</option>
                    <option value="5">Every 5 days</option>
                    <option value="7">Every 1 week</option>
                    <option value="14">Every 2 weeks</option>
                    <option value="30">Every 1 month</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)", marginBottom: "8px" }}>INDEX TYPE</label>
                <select name="index_type" value={formData.index_type} onChange={handleInputChange} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text-dark)", cursor: "pointer" }}>
                  <option value="NDVI">NDVI (Deforestation / Vegetation)</option>
                  <option value="NDWI">NDWI (Water Bodies / Floods)</option>
                  <option value="NDSI">NDSI (Ice / Snow Cover)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button onClick={handleSaveConfig} className="btn btn--outline" style={{ flex: 1, height: "42px" }}>
                  Update Changed Info
                </button>
                {project?.status === "running" ? (
                  <button onClick={handleStopProject} className="btn" style={{ flex: 1, height: "42px", background: "var(--red)", color: "white" }}>
                    Stop-Project
                  </button>
                ) : (
                  <button onClick={handleStartProject} className="btn btn--accent" style={{ flex: 1, height: "42px" }}>
                    Start-Project
                  </button>
                )}
              </div>
            </div>

            {/* Satellite Map */}
            <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-white)", borderRadius: "12px", border: "1px solid var(--border)", overflow: "hidden" }}>
              <MapView 
                lat={formData.latitude} 
                lon={formData.longitude} 
                onLocationClick={handleMapClick}
                panTrigger={panTrigger}
                style={{ height: "100%", minHeight: "450px" }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
