/**
 * InfoBadge Component
 * ───────────────────
 * Overlay badge on the map showing satellite coverage information.
 * Positioned at bottom-right of the map container.
 */

import React from "react";

export default function InfoBadge() {
  return (
    <div className="info-badge">
      <div className="info-badge__row">
        <span className="info-badge__label">Satellite Coverage:</span>
        <span className="info-badge__value">Sentinel-2</span>
      </div>
      <div className="info-badge__row">
        <span className="info-badge__label">Data Availability:</span>
        <span className="info-badge__value">Every ~5 days</span>
      </div>
    </div>
  );
}
