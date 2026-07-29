/**
 * SkeletonLoader Component
 * ────────────────────────
 * Animated shimmer placeholder shown while content loads.
 * Variants: map, text, card
 */

import React from "react";

export default function SkeletonLoader({ variant = "text", count = 1 }) {
  if (variant === "map") {
    return (
      <div className="skeleton skeleton--map">
        <div className="skeleton__shimmer" />
        <div className="skeleton__map-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <span className="skeleton__map-text">Loading map tiles…</span>
        </div>
      </div>
    );
  }

  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === "card") {
    return (
      <div className="skeleton skeleton--card">
        <div className="skeleton__shimmer" />
      </div>
    );
  }

  return (
    <>
      {items.map((i) => (
        <div key={i} className="skeleton skeleton--text">
          <div className="skeleton__shimmer" />
        </div>
      ))}
    </>
  );
}
