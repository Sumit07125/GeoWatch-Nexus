/**
 * Sidebar Component (v5 — Celestial Theme)
 * ─────────────────────────────────────────
 * Teal sidebar with clouds (light) and twinkling stars + crescent moon (dark).
 * Decorations swap based on the current theme.
 */

import React, { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    active: true,
  },
  {
    id: "projects",
    label: "My Projects",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "monitoring",
    label: "Monitoring",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "satellite",
    label: "Satellite Data",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

// Generate stable random star positions
function generateStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      id: i,
      left: `${5 + (i * 37 + 13) % 90}%`,
      top: `${8 + (i * 53 + 7) % 82}%`,
      size: 1 + (i % 3),
      delay: (i * 0.3) % 2.5,
      duration: 1.5 + (i % 3) * 0.5,
    });
  }
  return stars;
}

const STARS = generateStars(25);

export default function Sidebar() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* ── Light Mode: Fluffy Clouds ── */}
      <div className={`sidebar__clouds ${isDark ? 'sidebar__clouds--hidden' : ''}`}>
        <div className="fluffy-cloud fluffy-cloud--top"></div>
        <div className="fluffy-cloud fluffy-cloud--mid"></div>
        <div className="fluffy-cloud fluffy-cloud--bottom"></div>
      </div>

      {/* ── Dark Mode: Stars + Moon ── */}
      <div className={`sidebar__night-sky ${isDark ? 'sidebar__night-sky--visible' : ''}`}>
        {/* Twinkling stars */}
        {STARS.map((star) => (
          <span
            key={star.id}
            className="sidebar__star"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
            }}
          />
        ))}
        {/* Crescent moon */}
        <div className="sidebar__moon">
          <div className="sidebar__moon-glow" />
        </div>
      </div>

      {/* Logo + Brand */}
      <div className="sidebar__brand">
        <div className="sidebar__logo-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <span className="sidebar__brand-name">EarthSentry</span>
      </div>

      {/* Nav Items */}
      <div className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__item ${item.active ? "sidebar__item--active" : ""}`}
            onClick={(e) => e.preventDefault()}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            <span className="sidebar__item-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom — Logout */}
      <div className="sidebar__bottom">
        <button className="sidebar__item sidebar__item--logout">
          <span className="sidebar__item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className="sidebar__item-label">Logout</span>
        </button>
      </div>
    </nav>
  );
}
