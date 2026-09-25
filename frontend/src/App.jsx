/**
 * App Root Component
 * ──────────────────
 * Defines top-level routes: Dashboard (/aoi), My Projects (/projects),
 * and Monitoring (/monitoring).
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AOIPage from "./pages/AOIPage";
import ProjectsPage from "./pages/ProjectsPage";
import MonitoringPage from "./pages/MonitoringPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/aoi" replace />} />
        <Route path="/aoi" element={<AOIPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
