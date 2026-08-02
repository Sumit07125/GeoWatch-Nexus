/**
 * App Root Component
 * ──────────────────
 * Currently renders the AOI selection page, Projects list, and Analysis Dashboard.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AOIPage from "./pages/AOIPage";
import ProjectsPage from "./pages/ProjectsPage";
import AnalysisDashboard from "./pages/AnalysisDashboard";
import MonitoringPage from "./pages/MonitoringPage";
import AnalyticsPage from "./pages/AnalyticsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/aoi" replace />} />
        <Route path="/aoi" element={<AOIPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analysis/:id" element={<AnalysisDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
