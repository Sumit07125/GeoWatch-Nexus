import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const HYBRID_TILE = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
const MAP_ATTR = "Map data &copy; Google";
const DEFAULT_CENTER = [37.38, -122.08];

function ClickHandler({ onLocationClick }) {
  useMapEvents({
    click(e) {
      if (onLocationClick) {
        onLocationClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

function MapUpdater({ lat, lon, triggerPan }) {
  const map = useMap();
  useEffect(() => {
    if (triggerPan && lat && lon) {
      map.flyTo([lat, lon], 14, { duration: 1.5 });
    }
  }, [lat, lon, triggerPan, map]);
  return null;
}

export default function MapView({ lat, lon, onLocationClick, panTrigger, style }) {
  const center = lat && lon ? [lat, lon] : DEFAULT_CENTER;

  return (
    <div style={{ minHeight: "400px", width: "100%", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", position: "relative", ...style }}>
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={true}>
        <TileLayer url={HYBRID_TILE} attribution={MAP_ATTR} maxZoom={19} />
        
        <ClickHandler onLocationClick={onLocationClick} />
        <MapUpdater lat={lat} lon={lon} triggerPan={panTrigger} />
        
        {lat && lon && (
          <Marker position={[lat, lon]} />
        )}
      </MapContainer>
    </div>
  );
}
