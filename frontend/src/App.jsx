/**
 * App Root Component
 * ──────────────────
 * Defines top-level routes: Dashboard (/aoi) and My Projects (/projects).
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AOIPage from "./pages/AOIPage";
import ProjectsPage from "./pages/ProjectsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/aoi" replace />} />
        <Route path="/aoi" element={<AOIPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
