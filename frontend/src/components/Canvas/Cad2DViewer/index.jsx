import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Ruler,
  Download,
  Eye,
  EyeOff,
  Crosshair,
  Compass,
  Search,
  AlertTriangle
} from 'lucide-react';
import { parseDxfAsync } from './dxfParser';
import { buildCadSceneGeometry } from './dxfGeometryBuilder';
import { renderDxfTextOverlay } from './dxfTextOverlay';

export default function Cad2DViewer({ fullContent, artifact, token, filename = 'drawing.dxf', theme: propTheme }) {
  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const textCanvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const layerGroupsRef = useRef(new Map());
  const textEntitiesRef = useRef([]);
  const textDirtyRef = useRef(true);

  const [theme, setTheme] = useState(() => {
    if (propTheme) return propTheme;
    const docTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_theme') : null;
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    if (propTheme && propTheme !== theme) {
      setTheme(propTheme);
    }
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

  const [parseState, setParseState] = useState({
    isParsing: false,
    percent: 0,
    section: '',
    entityCount: 0,
    isBinaryDwg: false,
    data: { entities: [], layers: [] }
  });

  const [layers, setLayers] = useState([]);
  const [activeLayerNames, setActiveLayerNames] = useState(new Set());
  const activeLayerNamesRef = useRef(activeLayerNames);
  useEffect(() => {
    activeLayerNamesRef.current = activeLayerNames;
    textDirtyRef.current = true;
  }, [activeLayerNames]);

  const [layerSearch, setLayerSearch] = useState('');
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [measuringMode, setMeasuringMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measuredDistance, setMeasuredDistance] = useState(null);
  const [cursorCoords, setCursorCoords] = useState({ x: '0.00', y: '0.00' });
  const [stats, setStats] = useState({ entities: 0, bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 } });
  const boundsRef = useRef({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
  const [zoomLevel, setZoomLevel] = useState(100);

  const isDark = theme === 'dark';
  const isDarkRef = useRef(isDark);
  useEffect(() => {
    isDarkRef.current = isDark;
    textDirtyRef.current = true;
  }, [isDark]);

  // ── 1. Non-blocking Streaming DXF Parsing ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!fullContent) {
      setParseState({
        isParsing: false,
        percent: 100,
        section: 'Empty',
        entityCount: 0,
        isBinaryDwg: false,
        data: { entities: [], layers: [] }
      });
      return;
    }

    setParseState((prev) => ({
      ...prev,
      isParsing: fullContent.length > 250000,
      percent: 5,
      section: 'Scanning DXF Stream',
      entityCount: 0,
      isBinaryDwg: false
    }));

    parseDxfAsync(fullContent, (prog) => {
      if (!cancelled) {
        setParseState((prev) => ({
          ...prev,
          percent: prog.percent,
          section: prog.section,
          entityCount: prog.entityCount
        }));
      }
    })
      .then((result) => {
        if (!cancelled) {
          setParseState({
            isParsing: false,
            percent: 100,
            section: 'Complete',
            entityCount: result.entities.length,
            isBinaryDwg: Boolean(result.isBinaryDwg),
            data: result
          });
          setLayers(result.layers || []);
          setActiveLayerNames(new Set((result.layers || []).map((l) => l.name)));
          setStats((prev) => ({ ...prev, entities: result.entities.length }));
        }
      })
      .catch((err) => {
        console.error('Failed to parse DXF:', err);
        if (!cancelled) {
          setParseState({
            isParsing: false,
            percent: 100,
            section: 'Error',
            entityCount: 0,
            isBinaryDwg: false,
            data: { entities: [], layers: [] }
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fullContent]);

  // ── 2. Three.js WebGL Scene + 2D Text Overlay Loop ──────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth || 0, 300);
    const height = Math.max(container.clientHeight || 0, 300);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const aspect = width / height;
    const viewSize = 200;
    const camera = new THREE.OrthographicCamera(
      (-viewSize * aspect) / 2,
      (viewSize * aspect) / 2,
      viewSize / 2,
      -viewSize / 2,
      -1000,
      1000
    );
    camera.position.set(0, 0, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        if (textDirtyRef.current && textCanvasRef.current) {
          textDirtyRef.current = false;
          renderDxfTextOverlay(
            textCanvasRef.current,
            textEntitiesRef.current,
            cameraRef.current,
            activeLayerNamesRef.current,
            isDarkRef.current
          );
        }
      }
    };
    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      const asp = w / h;
      const cam = cameraRef.current;
      const currentHeight = Math.abs(cam.top - cam.bottom) || 200;
      cam.left = (-currentHeight * asp) / 2;
      cam.right = (currentHeight * asp) / 2;
      cam.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      textDirtyRef.current = true;
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: rw, height: rh } = entry.contentRect || {};
          if (rw > 0 && rh > 0) {
            handleResize();
            const b = boundsRef.current;
            if (b && Number.isFinite(b.minX) && Number.isFinite(b.maxX)) {
              fitView(b.minX, b.maxX, b.minY, b.maxY);
            }
          }
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  // ── 3. Fit View / Zoom to Extents ───────────────────────────────────────────
  const fitView = useCallback(
    (minX, maxX, minY, maxY) => {
      const cam = cameraRef.current;
      const container = mountRef.current;
      if (!cam || !container) return;

      const b = boundsRef.current || stats.bounds;
      const bMinX = minX !== undefined ? minX : b.minX;
      const bMaxX = maxX !== undefined ? maxX : b.maxX;
      const bMinY = minY !== undefined ? minY : b.minY;
      const bMaxY = maxY !== undefined ? maxY : b.maxY;

      const centerX = (bMinX + bMaxX) / 2;
      const centerY = (bMinY + bMaxY) / 2;
      const spanX = Math.max(bMaxX - bMinX, 20) * 1.25;
      const spanY = Math.max(bMaxY - bMinY, 20) * 1.25;

      const cWidth = container.clientWidth > 0 ? container.clientWidth : 800;
      const cHeight = container.clientHeight > 0 ? container.clientHeight : 600;
      const containerAspect = cWidth / cHeight;
      let viewH = spanY;
      let viewW = spanX;

      if (viewW / viewH > containerAspect) {
        viewH = viewW / containerAspect;
      } else {
        viewW = viewH * containerAspect;
      }

      cam.position.set(centerX, centerY, 100);
      cam.left = -viewW / 2;
      cam.right = viewW / 2;
      cam.top = viewH / 2;
      cam.bottom = -viewH / 2;
      cam.updateProjectionMatrix();
      textDirtyRef.current = true;
      setZoomLevel(100);
    },
    [stats.bounds]
  );

  // ── 4. Build Batched Geometry when Parsed Data or Theme Changes ─────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || parseState.isParsing || !parseState.data) return;

    // Dispose old geometries & materials safely
    while (scene.children.length > 0) {
      const child = scene.children[0];
      child.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      scene.remove(child);
    }
    layerGroupsRef.current.clear();

    const { layerGroups, textEntities, bounds } = buildCadSceneGeometry(
      parseState.data,
      activeLayerNamesRef.current,
      isDark
    );

    layerGroups.forEach((group, layerName) => {
      scene.add(group);
      layerGroupsRef.current.set(layerName, group);
    });

    textEntitiesRef.current = textEntities;
    textDirtyRef.current = true;
    boundsRef.current = bounds;

    setStats({
      entities: parseState.data.entities.length,
      bounds
    });

    fitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
  }, [parseState.data, parseState.isParsing, isDark, fitView]);

  // ── 5. Pan, Zoom, Measure & Layer Toggles ───────────────────────────────────
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1) {
      if (measuringMode && e.button === 0) {
        handleMeasureClick();
        return;
      }
      isDraggingRef.current = true;
      const cam = cameraRef.current;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        camX: cam ? cam.position.x : 0,
        camY: cam ? cam.position.y : 0
      };
    }
  };

  const handleMouseMove = (e) => {
    const container = mountRef.current;
    const cam = cameraRef.current;
    if (!container || !cam) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const normX = (mouseX / rect.width) * 2 - 1;
    const normY = -(mouseY / rect.height) * 2 + 1;

    const worldX = cam.position.x + (normX * (cam.right - cam.left)) / 2;
    const worldY = cam.position.y + (normY * (cam.top - cam.bottom)) / 2;
    setCursorCoords({ x: worldX.toFixed(2), y: worldY.toFixed(2) });

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const scaleFactorX = (cam.right - cam.left) / rect.width;
      const scaleFactorY = (cam.top - cam.bottom) / rect.height;

      cam.position.x = dragStartRef.current.camX - dx * scaleFactorX;
      cam.position.y = dragStartRef.current.camY + dy * scaleFactorY;
      textDirtyRef.current = true;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const cam = cameraRef.current;
    if (!cam) return;

    const zoomFactor = e.deltaY < 0 ? 0.85 : 1.18;
    cam.left *= zoomFactor;
    cam.right *= zoomFactor;
    cam.top *= zoomFactor;
    cam.bottom *= zoomFactor;
    cam.updateProjectionMatrix();
    textDirtyRef.current = true;

    setZoomLevel((prev) => Math.round(prev / zoomFactor));
  };

  const handleZoom = (direction) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const factor = direction === 'in' ? 0.8 : 1.25;
    cam.left *= factor;
    cam.right *= factor;
    cam.top *= factor;
    cam.bottom *= factor;
    cam.updateProjectionMatrix();
    textDirtyRef.current = true;
    setZoomLevel((prev) => Math.round(prev / factor));
  };

  const toggleLayer = (layerName) => {
    setActiveLayerNames((prev) => {
      const next = new Set(prev);
      if (next.has(layerName)) next.delete(layerName);
      else next.add(layerName);

      const group = layerGroupsRef.current.get(layerName);
      if (group) group.visible = next.has(layerName);
      textDirtyRef.current = true;
      return next;
    });
  };

  const toggleAllLayers = (show) => {
    const next = show ? new Set(layers.map((l) => l.name)) : new Set();
    setActiveLayerNames(next);
    layerGroupsRef.current.forEach((group, name) => {
      group.visible = next.has(name);
    });
    textDirtyRef.current = true;
  };

  const handleMeasureClick = () => {
    const pt = { x: parseFloat(cursorCoords.x), y: parseFloat(cursorCoords.y) };
    if (measurePoints.length === 0) {
      setMeasurePoints([pt]);
      setMeasuredDistance(null);
    } else if (measurePoints.length === 1) {
      const p1 = measurePoints[0];
      const dist = Math.hypot(pt.x - p1.x, pt.y - p1.y);
      setMeasurePoints([p1, pt]);
      setMeasuredDistance(dist.toFixed(3));
    } else {
      setMeasurePoints([pt]);
      setMeasuredDistance(null);
    }
  };

  const handleExportPng = () => {
    if (!rendererRef.current) return;
    const glCanvas = rendererRef.current.domElement;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = glCanvas.width;
    exportCanvas.height = glCanvas.height;
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = isDark ? '#0b0f17' : '#f8fafc';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(glCanvas, 0, 0);
    if (textCanvasRef.current) {
      ctx.drawImage(textCanvasRef.current, 0, 0, exportCanvas.width, exportCanvas.height);
    }
    const link = document.createElement('a');
    link.download = `${filename.replace(/\.[^/.]+$/, '')}_blueprint.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const filteredLayers = useMemo(() => {
    if (!layerSearch.trim()) return layers;
    const q = layerSearch.toLowerCase().trim();
    return layers.filter((l) => l.name.toLowerCase().includes(q));
  }, [layers, layerSearch]);

  // ── 6. Binary DWG Notice Screen ─────────────────────────────────────────────
  if (parseState.isBinaryDwg) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#0b0f17' : '#f8fafc',
          color: isDark ? '#f1f5f9' : '#0f172a',
          padding: '24px'
        }}
      >
        <div
          style={{
            maxWidth: '460px',
            padding: '28px',
            borderRadius: '12px',
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            border: isDark ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(245, 158, 11, 0.4)',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)'
          }}
        >
          <AlertTriangle size={36} color="#f59e0b" style={{ margin: '0 auto 14px auto' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
            Binary DWG Format Detected
          </h3>
          <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.5, marginBottom: '12px' }}>
            <strong>{filename}</strong> is a proprietary binary AutoCAD <code>.dwg</code> file. Our client-side 2D CAD engine parses ASCII <code>.dxf</code> files natively at full fidelity without requiring a backend conversion server.
          </p>
          <p style={{ fontSize: '12px', color: isDark ? '#64748b' : '#64748b', margin: 0 }}>
            Please export or save the drawing as AutoCAD <strong>DXF</strong> (R12–2018+) to inspect all architectural layers, splines, hatches, and dimensions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0b0f17' : '#f8fafc',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* ── Top Viewport Bar ── */}
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
              background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.1)',
              color: isDark ? '#38bdf8' : '#0284c7',
              fontSize: '0.78rem',
              fontWeight: 650,
              letterSpacing: '0.04em'
            }}
          >
            <Compass size={14} /> 2D CAD ENGINE
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
            {stats.entities.toLocaleString()} entities
          </span>
        </div>

        {/* Viewport Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            title="Layer Manager"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: showLayerPanel
                ? '1px solid #38bdf8'
                : isDark
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid rgba(0,0,0,0.1)',
              background: showLayerPanel
                ? isDark
                  ? 'rgba(56, 189, 248, 0.2)'
                  : 'rgba(2, 132, 199, 0.15)'
                : 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 550
            }}
          >
            <Layers size={14} />
            <span>Layers ({layers.length})</span>
          </button>

          <button
            onClick={() => {
              setMeasuringMode(!measuringMode);
              setMeasurePoints([]);
              setMeasuredDistance(null);
            }}
            title="Measure Distance"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: measuringMode
                ? '1px solid #eab308'
                : isDark
                ? '1px solid rgba(255,255,255,0.1)'
                : '1px solid rgba(0,0,0,0.1)',
              background: measuringMode ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
              color: measuringMode ? '#eab308' : 'inherit',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 550
            }}
          >
            <Ruler size={14} />
            <span>Measure</span>
          </button>

          <div
            style={{
              width: '1px',
              height: '18px',
              background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
              margin: '0 4px'
            }}
          />

          <button onClick={() => handleZoom('in')} title="Zoom In" style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <ZoomIn size={15} />
          </button>
          <button onClick={() => handleZoom('out')} title="Zoom Out" style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <ZoomOut size={15} />
          </button>
          <button onClick={() => fitView()} title="Zoom to Extents (Reset View)" style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
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
            title={isDark ? 'Switch to Day / Light Mode' : 'Switch to AutoCAD Night / Dark Mode'}
            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={handleExportPng} title="Export High-Res Blueprint PNG" style={{ padding: '6px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* ── Main Canvas Viewport Area ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {showGrid && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: isDark
                ? 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)'
                : 'radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          />
        )}

        {/* Three.js WebGL Mount */}
        <div
          ref={mountRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          style={{
            width: '100%',
            height: '100%',
            cursor: measuringMode ? 'crosshair' : 'grab'
          }}
        />

        {/* Synchronized GPU-Safe 2D Text Overlay */}
        <canvas
          ref={textCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10
          }}
        />

        {/* Non-blocking 20MB+ Parsing Progress Overlay */}
        {parseState.isParsing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark ? 'rgba(11, 15, 23, 0.85)' : 'rgba(248, 250, 252, 0.85)',
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
                <Compass size={22} color="#38bdf8" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Streaming Architectural CAD</div>
                  <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {filename} ({parseState.entityCount.toLocaleString()} entities)
                  </div>
                </div>
              </div>
              <div style={{ height: '8px', width: '100%', background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${parseState.percent}%`, background: 'linear-gradient(90deg, #38bdf8 0%, #3b82f6 100%)', transition: 'width 0.15s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                <span>{parseState.section || 'Parsing...'}</span>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>{parseState.percent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Layer Manager Sidebar Drawer ── */}
        {showLayerPanel && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              width: '260px',
              maxHeight: 'calc(100% - 24px)',
              background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
              borderRadius: '10px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 30,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                fontWeight: 650,
                fontSize: '0.82rem'
              }}
            >
              <span>CAD Layers ({layers.length})</span>
              <button onClick={() => setShowLayerPanel(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '8px 10px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input
                  type="text"
                  placeholder="Filter layers..."
                  value={layerSearch}
                  onChange={(e) => setLayerSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '5px 8px 5px 26px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
                    background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                    color: 'inherit',
                    fontSize: '0.74rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => toggleAllLayers(true)}
                  style={{ flex: 1, padding: '4px', fontSize: '0.7rem', fontWeight: 600, borderRadius: '5px', border: 'none', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', cursor: 'pointer' }}
                >
                  Show All
                </button>
                <button
                  onClick={() => toggleAllLayers(false)}
                  style={{ flex: 1, padding: '4px', fontSize: '0.7rem', fontWeight: 600, borderRadius: '5px', border: 'none', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: 'inherit', cursor: 'pointer' }}
                >
                  Hide All
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: '6px' }}>
              {filteredLayers.map((layer) => {
                const isVisible = activeLayerNames.has(layer.name);
                return (
                  <div
                    key={layer.name}
                    onClick={() => toggleLayer(layer.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isVisible ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)') : 'transparent',
                      opacity: isVisible ? 1 : 0.45,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: layer.color || '#38bdf8', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {layer.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{layer.count}</span>
                      {isVisible ? <Eye size={13} color="#38bdf8" /> : <EyeOff size={13} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Measuring Distance Overlay Callout ── */}
        {measuringMode && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              padding: '10px 14px',
              background: 'rgba(234, 179, 8, 0.15)',
              border: '1px solid rgba(234, 179, 8, 0.4)',
              borderRadius: '8px',
              backdropFilter: 'blur(12px)',
              color: '#facc15',
              fontSize: '0.8rem',
              fontWeight: 550,
              zIndex: 25,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Crosshair size={14} />
              <span>
                {measurePoints.length === 0
                  ? 'Click first point'
                  : measurePoints.length === 1
                  ? 'Click second endpoint'
                  : 'Measurement Complete'}
              </span>
            </div>
            {measuredDistance && (
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fef08a' }}>
                Distance: {measuredDistance} units
              </div>
            )}
          </div>
        )}

        {/* ── Bottom Floating HUD (Coordinates & Zoom) ── */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            fontSize: '0.76rem',
            fontFamily: 'monospace',
            zIndex: 20
          }}
        >
          <div style={{ opacity: 0.8 }}>
            X: <span style={{ color: '#38bdf8' }}>{cursorCoords.x}</span> Y:{' '}
            <span style={{ color: '#38bdf8' }}>{cursorCoords.y}</span>
          </div>
          <div style={{ width: '1px', height: '12px', background: 'currentColor', opacity: 0.2 }} />
          <div style={{ opacity: 0.8 }}>Zoom: {zoomLevel}%</div>
        </div>
      </div>
    </div>
  );
}
