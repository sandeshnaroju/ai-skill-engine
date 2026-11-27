import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Download,
  Compass,
  Table,
  X
} from 'lucide-react';
import { parseGeoDataAsync } from './gisParser';
import { renderGisCanvas, hitTestGisFeature, createGeoProjector } from './gisRenderer';
import GisAttributeTable from './gisAttributeTable';

export default function GisViewer({ fullContent, artifact, filename = 'map.geojson', theme: propTheme }) {
  const canvasRef = useRef(null);
  const isPanningRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0, centerLng: 0, centerLat: 0 });

  const [theme, setTheme] = useState(() => {
    if (propTheme) return propTheme;
    const docTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_theme') : null;
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    if (propTheme) setTheme(propTheme);
  }, [propTheme]);

  useEffect(() => {
    const handleAppTheme = (e) => {
      if (e.detail?.theme && (e.detail.theme === 'light' || e.detail.theme === 'dark')) {
        setTheme(e.detail.theme);
      }
    };
    window.addEventListener('app-theme-change', handleAppTheme);
    return () => window.removeEventListener('app-theme-change', handleAppTheme);
  }, []);

  const isDark = theme === 'dark';

  const [parseState, setParseState] = useState({
    isParsing: false,
    percent: 0,
    stage: '',
    count: 0,
    features: [],
    bounds: { minLng: -122.5, maxLng: -122.3, minLat: 37.7, maxLat: 37.9 },
    counts: { point: 0, line: 0, polygon: 0 }
  });

  const [selectedFeature, setSelectedFeature] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [visibleCategories, setVisibleCategories] = useState(new Set(['point', 'line', 'polygon']));
  const [cursorGeo, setCursorGeo] = useState({ lng: '0.0000', lat: '0.0000' });

  const [viewState, setViewState] = useState({
    centerLng: -122.4,
    centerLat: 37.8,
    scale: 2000
  });

  const centerLatDeg = (parseState.bounds.minLat + parseState.bounds.maxLat) / 2;

  const fitMapBounds = useCallback((b) => {
    const el = canvasRef.current;
    const w = el ? Math.max(300, el.clientWidth) : 800;
    const h = el ? Math.max(200, el.clientHeight) : 600;
    const cLng = (b.minLng + b.maxLng) / 2;
    const cLat = (b.minLat + b.maxLat) / 2;
    const cosLat = Math.max(0.15, Math.cos((cLat * Math.PI) / 180));

    const spanLng = Math.max(b.maxLng - b.minLng, 0.0005) * cosLat;
    const spanLat = Math.max(b.maxLat - b.minLat, 0.0005);

    const scaleX = (w * 0.85) / spanLng;
    const scaleY = (h * 0.85) / spanLat;
    const scale = Math.min(scaleX, scaleY);

    setViewState({ centerLng: cLng, centerLat: cLat, scale });
  }, []);

  // ── 1. Non-blocking Streaming GIS Parse ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setSelectedFeature(null);

    const isLarge = typeof fullContent === 'string' && fullContent.length > 350000;
    setParseState((prev) => ({
      ...prev,
      isParsing: isLarge,
      percent: 5,
      stage: 'Reading GIS Stream',
      count: 0
    }));

    parseGeoDataAsync(fullContent, filename, (prog) => {
      if (!cancelled) {
        setParseState((prev) => ({
          ...prev,
          percent: prog.percent,
          stage: prog.stage,
          count: prog.count
        }));
      }
    })
      .then((res) => {
        if (!cancelled) {
          setParseState({
            isParsing: false,
            percent: 100,
            stage: 'Complete',
            count: res.features.length,
            features: res.features,
            bounds: res.bounds,
            counts: res.counts
          });
          fitMapBounds(res.bounds);
        }
      })
      .catch((err) => {
        console.error('GIS Parse Error:', err);
        if (!cancelled) {
          setParseState((prev) => ({ ...prev, isParsing: false, features: [] }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fullContent, filename, fitMapBounds]);

  // ── 2. Render Canvas2D Map on View / Filter / Selection Change ──────────────
  useEffect(() => {
    renderGisCanvas(canvasRef.current, parseState.features, viewState, centerLatDeg, {
      isDark,
      selectedFeature,
      visibleCategories,
      showGrid
    });
  }, [parseState.features, viewState, centerLatDeg, isDark, selectedFeature, visibleCategories, showGrid]);

  // Redraw on resize
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      renderGisCanvas(el, parseState.features, viewState, centerLatDeg, {
        isDark,
        selectedFeature,
        visibleCategories,
        showGrid
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [parseState.features, viewState, centerLatDeg, isDark, selectedFeature, visibleCategories, showGrid]);

  // ── 3. Pan, Cursor-Centered Wheel Zoom & Feature Hit-Testing ────────────────
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      centerLng: viewState.centerLng,
      centerLat: viewState.centerLat
    };
  };

  const handleMouseMove = (e) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { toWorld, cosLat } = createGeoProjector(viewState, rect.width, rect.height, centerLatDeg);
    const w = toWorld(sx, sy);
    setCursorGeo({ lng: w.lng.toFixed(4), lat: w.lat.toFixed(4) });

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setViewState((prev) => ({
        ...prev,
        centerLng: panStartRef.current.centerLng - dx / (cosLat * prev.scale),
        centerLat: panStartRef.current.centerLat + dy / prev.scale
      }));
    }
  };

  const handleMouseUp = (e) => {
    const moved = Math.hypot(e.clientX - mouseDownPosRef.current.x, e.clientY - mouseDownPosRef.current.y);
    isPanningRef.current = false;

    if (moved < 4 && e.button === 0 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const hit = hitTestGisFeature(
        sx,
        sy,
        canvasRef.current,
        parseState.features,
        viewState,
        centerLatDeg,
        visibleCategories
      );
      setSelectedFeature(hit);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.2 : 0.83;
    const { toWorld, cosLat } = createGeoProjector(viewState, rect.width, rect.height, centerLatDeg);
    const anchor = toWorld(sx, sy);

    setViewState((prev) => {
      const newScale = Math.max(0.5, Math.min(prev.scale * factor, 1e8));
      const newCenterLng = anchor.lng - (sx - rect.width / 2) / (cosLat * newScale);
      const newCenterLat = anchor.lat + (sy - rect.height / 2) / newScale;
      return { centerLng: newCenterLng, centerLat: newCenterLat, scale: newScale };
    });
  };

  const toggleCategory = (cat) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleSelectAndZoom = (feature) => {
    setSelectedFeature(feature);
    if (feature && feature.bbox) {
      const [minLng, minLat, maxLng, maxLat] = feature.bbox;
      const pad = 0.002;
      fitMapBounds({
        minLng: minLng - pad,
        maxLng: maxLng + pad,
        minLat: minLat - pad,
        maxLat: maxLat + pad
      });
    }
  };

  const handleExportPng = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${filename.replace(/\.[^/.]+$/, '')}_gis_map.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

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
          background: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          zIndex: 20,
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              fontWeight: 650
            }}
          >
            <Compass size={14} /> GIS MAP ENGINE
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.85 }}>{filename}</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '4px',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              opacity: 0.75
            }}
          >
            {parseState.features.length.toLocaleString()} features
          </span>
        </div>

        {/* Filter & Map Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Geometry Category Pills */}
          <div style={{ display: 'flex', gap: '4px', marginRight: '4px' }}>
            {[
              { id: 'polygon', label: `Polygons (${parseState.counts.polygon})` },
              { id: 'line', label: `Lines (${parseState.counts.line})` },
              { id: 'point', label: `Points (${parseState.counts.point})` }
            ].map((cat) => {
              const active = visibleCategories.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '5px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    border: active ? '1px solid rgba(52, 211, 153, 0.4)' : isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    background: active ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
                    color: active ? '#34d399' : 'inherit',
                    opacity: active ? 1 : 0.5,
                    cursor: 'pointer'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowTable(!showTable)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: showTable ? '1px solid #10b981' : isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              background: showTable ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: showTable ? '#10b981' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.76rem',
              fontWeight: 550
            }}
          >
            <Table size={13} /> Attributes
          </button>

          <button
            onClick={() => setViewState((v) => ({ ...v, scale: v.scale * 1.35 }))}
            title="Zoom In"
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={() => setViewState((v) => ({ ...v, scale: Math.max(0.5, v.scale / 1.35) }))}
            title="Zoom Out"
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={() => fitMapBounds(parseState.bounds)}
            title="Zoom to Extents"
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => {
              const next = isDark ? 'light' : 'dark';
              setTheme(next);
              localStorage.setItem('app_theme', next);
              document.documentElement.setAttribute('data-theme', next);
              window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme: next } }));
            }}
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            onClick={handleExportPng}
            title="Export Map PNG"
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* ── Main Canvas2D Map Viewport ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'grab'
          }}
        />

        {/* Streaming Progress Overlay for 20MB+ GIS Files */}
        {parseState.isParsing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark ? 'rgba(8, 12, 20, 0.86)' : 'rgba(241, 245, 249, 0.86)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40
            }}
          >
            <div
              style={{
                width: '380px',
                maxWidth: '90%',
                padding: '24px',
                borderRadius: '12px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <Compass size={22} color="#34d399" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Indexing Spatial GIS Data</div>
                  <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {filename} ({parseState.count.toLocaleString()} features)
                  </div>
                </div>
              </div>
              <div style={{ height: '8px', width: '100%', background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${parseState.percent}%`, background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)', transition: 'width 0.15s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                <span>{parseState.stage || 'Parsing...'}</span>
                <span style={{ fontWeight: 700, color: '#34d399' }}>{parseState.percent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Feature Properties Inspector Drawer */}
        {selectedFeature && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              width: '270px',
              background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              border: isDark ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(5, 150, 105, 0.3)',
              borderRadius: '10px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              padding: '12px',
              zIndex: 30
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399' }}>
                {selectedFeature.geometry?.type} (#{selectedFeature.id + 1})
              </span>
              <button onClick={() => setSelectedFeature(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '0.75rem' }}>
              {Object.entries(selectedFeature.properties || {}).length > 0 ? (
                Object.entries(selectedFeature.properties || {}).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '4px 0',
                      borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)'
                    }}
                  >
                    <span style={{ opacity: 0.7 }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{String(v)}</span>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.6 }}>No properties attached to this feature.</div>
              )}
            </div>
          </div>
        )}

        {/* Paginated Attribute Table */}
        {showTable && (
          <GisAttributeTable
            features={parseState.features}
            selectedFeature={selectedFeature}
            onSelectAndZoom={handleSelectAndZoom}
            onClose={() => setShowTable(false)}
            isDark={isDark}
          />
        )}

        {/* Bounding Box & Cursor Coordinates HUD */}
        <div
          style={{
            position: 'absolute',
            bottom: showTable ? '270px' : '12px',
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
            zIndex: 20,
            transition: 'bottom 0.15s ease'
          }}
        >
          <span>
            Lat: <strong style={{ color: '#34d399' }}>{cursorGeo.lat}°</strong> Lng:{' '}
            <strong style={{ color: '#34d399' }}>{cursorGeo.lng}°</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
