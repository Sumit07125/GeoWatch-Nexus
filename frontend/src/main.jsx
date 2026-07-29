/**
 * Main Entry Point
 * ────────────────
 * NOTE: StrictMode is intentionally removed.
 * React StrictMode double-invokes effects in dev mode, which causes
 * leaflet-draw to register handlers twice and break polygon drawing.
 */
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
)
