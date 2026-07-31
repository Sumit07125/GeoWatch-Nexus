/**
 * TopBar Component (v5 — Celestial Theme Toggle)
 * ───────────────────────────────────────────────
 * Top bar with search, sunset/moonrise transition overlay,
 * animated celestial toggle button, notifications, and profile.
 */

import React from "react";
import { useTheme } from "../context/ThemeContext";

export default function TopBar({ onToggleSidebar }) {
  const { theme, toggleTheme, isTransitioning, transitionDirection } = useTheme();

  return (
    <>
      {/* ── Sunset / Moonrise Transition Overlay ── */}
      {isTransitioning && (
        <div className={`sky-transition sky-transition--${transitionDirection}`}>
          {/* Sun disc (visible during to-dark = sunset) */}
          <div className="sky-transition__sun" />
          {/* Moon crescent (visible during to-light = moonrise going away) */}
          <div className="sky-transition__moon" />
          {/* Stars scatter */}
          <div className="sky-transition__stars">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className="sky-transition__star"
                style={{
                  left: `${8 + Math.random() * 84}%`,
                  top: `${5 + Math.random() * 60}%`,
                  animationDelay: `${Math.random() * 0.6}s`,
                  width: `${1.5 + Math.random() * 2.5}px`,
                  height: `${1.5 + Math.random() * 2.5}px`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <header className="topbar">
        {/* Left — Menu Icon + Page Title */}
        <div className="topbar__left">
          <button className="topbar__menu-btn" aria-label="Menu" onClick={onToggleSidebar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="topbar__title">Dashboard</h1>
        </div>

        {/* Center — Search */}
        <div className="topbar__center">
          <div className="topbar__search">
            <input
              className="topbar__search-input"
              type="text"
              placeholder="Search..."
            />
            <button className="topbar__search-btn" aria-label="Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right — Celestial Toggle + Notifications + Profile */}
        <div className="topbar__right">
          {/* Celestial Sun/Moon Toggle */}
          <button
            className={`celestial-toggle ${theme === "dark" ? "celestial-toggle--night" : ""}`}
            title={theme === "light" ? "Switch to Night Mode" : "Switch to Day Mode"}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            <div className="celestial-toggle__track">
              {/* Sun */}
              <div className="celestial-toggle__sun">
                <div className="celestial-toggle__sun-core" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <div
                    key={deg}
                    className="celestial-toggle__ray"
                    style={{ transform: `rotate(${deg}deg)` }}
                  />
                ))}
              </div>
              {/* Moon */}
              <div className="celestial-toggle__moon">
                <div className="celestial-toggle__moon-body" />
                <div className="celestial-toggle__crater celestial-toggle__crater--1" />
                <div className="celestial-toggle__crater celestial-toggle__crater--2" />
              </div>
              {/* Mini stars in the track */}
              <span className="celestial-toggle__mini-star" style={{ top: '4px', right: '6px' }} />
              <span className="celestial-toggle__mini-star" style={{ top: '14px', right: '12px' }} />
              <span className="celestial-toggle__mini-star" style={{ bottom: '5px', right: '8px' }} />
            </div>
          </button>

          {/* Notifications */}
          <button className="topbar__action" title="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="topbar__badge">3</span>
          </button>

          <div className="topbar__divider" />

          <div className="topbar__user">
            <div className="topbar__avatar">S</div>
            <div className="topbar__user-info">
              <span className="topbar__user-name">Sumit Mali</span>
              <span className="topbar__user-role">Researcher</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
