import React, { useState, useMemo, useRef } from 'react';
import {
  MapPin,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Info,
  Download,
  Filter,
  Compass,
  Crosshair,
  Table
} from 'lucide-react';

/**
 * Parses GeoJSON or KML/KMZ coordinates into normalized GeoJSON FeatureCollection
 */
function parseGeoData(rawContent, filename = '') {
  if (!rawContent) return { type: 'FeatureCollection', features: [] };

  if (typeof rawContent === 'object') {
    return rawContent;
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.type === 'FeatureCollection' || parsed.type === 'Feature' || parsed.geometry) {
      if (parsed.type === 'Feature') return { type: 'FeatureCollection', features: [parsed] };
      if (parsed.geometry) return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed.geometry, properties: {} }] };
      return parsed;
    }
  } catch (e) {
    // Attempt KML parsing if XML format
    if (rawContent.includes('<kml') || rawContent.includes('<Placemark')) {
      return parseKMLtoGeoJSON(rawContent);
    }
  }

  return { type: 'FeatureCollection', features: [] };
}

function parseKMLtoGeoJSON(kmlText) {
  const features = [];
  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/gi;
  const matches = kmlText.match(placemarkRegex) || [];

  matches.forEach((pm, idx) => {
    const nameMatch = pm.match(/<name>(.*?)<\/name>/i);
    const name = nameMatch ? nameMatch[1] : `Placemark ${idx + 1}`;

    const coordMatch = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    if (coordMatch) {
      const coordStr = coordMatch[1].trim();
      const coordPairs = coordStr.split(/\s+/).map((pair) => {
        const parts = pair.split(',').map((s) => parseFloat(s.trim()));
        return [parts[0], parts[1]]; // [lng, lat]
      });

      if (coordPairs.length === 1) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coordPairs[0] },
          properties: { name }
        });
      } else if (coordPairs.length > 1) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coordPairs },
          properties: { name }
        });
      }
    }
  });

  return { type: 'FeatureCollection', features };
}

export default function GisViewer({ fullContent, artifact, filename = 'map.geojson' }) {
  const [theme, setTheme] = useState('dark');
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  const geojson = useMemo(() => parseGeoData(fullContent, filename), [fullContent, filename]);

  // Compute Geo Bounding Box [minLng, minLat, maxLng, maxLat]
  const bounds = useMemo(() => {
    let minLng = 180,
      maxLng = -180,
      minLat = 90,
      maxLat = -90;
    let hasCoords = false;

    const traverseCoords = (coords) => {
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          hasCoords = true;
        }
      } else if (Array.isArray(coords)) {
        coords.forEach(traverseCoords);
      }
    };

    if (geojson.features) {
      geojson.features.forEach((f) => {
        if (f.geometry && f.geometry.coordinates) {
          traverseCoords(f.geometry.coordinates);
        }
      });
    }

    if (!hasCoords) {
      return { minLng: -122.5, maxLng: -122.3, minLat: 37.7, maxLat: 37.9 };
    }
    return { minLng, maxLng, minLat, maxLat };
  }, [geojson]);

  // Convert GPS (lng, lat) to SVG canvas coordinates (0..800, 0..600)
  const project = (lng, lat) => {
    const width = 800;
    const height = 600;
    const pad = 40;

    const spanLng = Math.max(bounds.maxLng - bounds.minLng, 0.001);
    const spanLat = Math.max(bounds.maxLat - bounds.minLat, 0.001);

    const x = pad + ((lng - bounds.minLng) / spanLng) * (width - pad * 2);
    // Invert Y because latitude goes north (up) but SVG Y goes down
    const y = height - (pad + ((lat - bounds.minLat) / spanLat) * (height - pad * 2));
    return { x, y };
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y
      });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const isDark = theme === 'dark';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#080c14' : '#f1f5f9',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* ── Header Viewport Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.1)',
              color: isDark ? '#34d399' : '#059669',
              fontSize: '0.78rem',
              fontWeight: 650,
              letterSpacing: '0.04em'
            }}
          >
            <Compass size={14} /> GIS MAP ENGINE
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.85 }}>{filename}</span>
          <span
            style={{
              fontSize: '0.74rem',
              padding: '2px 8px',
              borderRadius: '4px',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              opacity: 0.7
            }}
          >
            {geojson.features ? geojson.features.length : 0} map features
          </span>
        </div>

        {/* Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setShowTable(!showTable)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: showTable
                ? '1px solid #10b981'
                : isDark
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid rgba(0,0,0,0.1)',
              background: showTable ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: showTable ? '#10b981' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 550
            }}
          >
            <Table size={14} />
            <span>Attributes</span>
          </button>

          <button
            onClick={() => setZoom((z) => Math.min(z * 1.3, 5))}
            title="Zoom In"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            <ZoomIn size={15} />
          </button>

          <button
            onClick={() => setZoom((z) => Math.max(z / 1.3, 0.4))}
            title="Zoom Out"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            <ZoomOut size={15} />
          </button>

          <button
            onClick={resetView}
            title="Reset Map View"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={15} />
          </button>

          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            title="Toggle Map Backdrop"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* ── Main Map Canvas Viewport ── */}
      <div
        style={{ position: 'relative', flex: 1, overflow: 'hidden', cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Vector SVG Map Container */}
        <svg
          viewBox="0 0 800 600"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          {/* Subtle Coordinate Grid Lines */}
          <defs>
            <pattern id="gisGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#gisGrid)" />

          {/* Render Features */}
          {geojson.features &&
            geojson.features.map((feature, idx) => {
              const geom = feature.geometry;
              if (!geom) return null;

              const isSelected = selectedFeature === feature;
              const strokeColor = isSelected ? '#f59e0b' : isDark ? '#34d399' : '#059669';
              const fillColor = isSelected
                ? 'rgba(245, 158, 11, 0.35)'
                : isDark
                ? 'rgba(52, 211, 153, 0.25)'
                : 'rgba(5, 150, 105, 0.2)';

              if (geom.type === 'Point') {
                const pt = project(geom.coordinates[0], geom.coordinates[1]);
                return (
                  <g
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFeature(feature);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle cx={pt.x} cy={pt.y} r={isSelected ? 8 : 6} fill={strokeColor} />
                    <circle cx={pt.x} cy={pt.y} r={isSelected ? 14 : 10} fill="none" stroke={strokeColor} strokeWidth="1.5" opacity="0.6" />
                  </g>
                );
              } else if (geom.type === 'LineString') {
                const pts = geom.coordinates.map((c) => project(c[0], c[1]));
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                return (
                  <path
                    key={idx}
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3.5 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFeature(feature);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                );
              } else if (geom.type === 'Polygon') {
                const rings = geom.coordinates.map((ring) => {
                  const pts = ring.map((c) => project(c[0], c[1]));
                  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                });
                return (
                  <path
                    key={idx}
                    d={rings.join(' ')}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3 : 1.5}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFeature(feature);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                );
              }
              return null;
            })}
        </svg>

        {/* ── Feature Properties Inspector Drawer ── */}
        {selectedFeature && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              width: '260px',
              background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
              borderRadius: '10px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              padding: '12px',
              zIndex: 30
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 650, color: '#34d399' }}>
                {selectedFeature.geometry.type}
              </span>
              <button
                onClick={() => setSelectedFeature(null)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}
              >
                ✕
              </button>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.76rem' }}>
              {Object.entries(selectedFeature.properties || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ opacity: 0.7 }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bounding Box HUD ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            fontSize: '0.74rem',
            fontFamily: 'monospace',
            zIndex: 20
          }}
        >
          <span>
            SW: {bounds.minLat.toFixed(3)}°, {bounds.minLng.toFixed(3)}°
          </span>
          <div style={{ width: '1px', height: '10px', background: 'currentColor', opacity: 0.2 }} />
          <span>
            NE: {bounds.maxLat.toFixed(3)}°, {bounds.maxLng.toFixed(3)}°
          </span>
        </div>
      </div>
    </div>
  );
}
