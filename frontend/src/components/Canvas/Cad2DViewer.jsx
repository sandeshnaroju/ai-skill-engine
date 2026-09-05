import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sun,
  Moon,
  Ruler,
  Download,
  Eye,
  EyeOff,
  Grid,
  Info,
  Sliders,
  Crosshair,
  Compass
} from 'lucide-react';

/**
 * Standard AutoCAD Color Index (ACI) lookup table (first 10 common colors)
 */
const ACI_COLORS = {
  1: '#ff0000', // Red
  2: '#ffff00', // Yellow
  3: '#00ff00', // Green
  4: '#00ffff', // Cyan
  5: '#0000ff', // Blue
  6: '#ff00ff', // Magenta
  7: '#ffffff', // White / Black depending on bg
  8: '#808080', // Dark Gray
  9: '#c0c0c0', // Light Gray
};

/**
 * Robust lightweight ASCII DXF Parser for browser rendering
 */
function parseDxfContent(dxfText) {
  const lines = dxfText.split(/\r?\n/);
  const entities = [];
  const layers = new Map();
  const blocks = new Map();

  let i = 0;
  const n = lines.length;

  let currentSection = null;
  let currentLayer = '0';
  let currentColor = null;

  function getCodeVal() {
    if (i + 1 >= n) return null;
    const code = parseInt(lines[i].trim(), 10);
    const val = lines[i + 1].trim();
    i += 2;
    return { code, val };
  }

  while (i < n - 1) {
    const pair = getCodeVal();
    if (!pair) break;

    const { code, val } = pair;

    if (code === 0) {
      if (val === 'SECTION') {
        const next = getCodeVal();
        if (next && next.code === 2) {
          currentSection = next.val.toUpperCase();
        }
        continue;
      }
      if (val === 'ENDSEC') {
        currentSection = null;
        continue;
      }
      if (val === 'EOF') {
        break;
      }

      // ENTITIES section parsing
      if (currentSection === 'ENTITIES' || !currentSection) {
        const entityType = val.toUpperCase();
        const entity = { type: entityType, layer: '0', color: null, vertices: [] };
        let entityEnded = false;

        while (i < n - 1) {
          const eCode = parseInt(lines[i].trim(), 10);
          const eVal = lines[i + 1].trim();

          if (eCode === 0) {
            // New entity starts
            break;
          }
          i += 2;

          if (eCode === 8) {
            entity.layer = eVal;
            if (!layers.has(eVal)) {
              layers.set(eVal, { name: eVal, visible: true, color: '#00ffff', count: 0 });
            }
          } else if (eCode === 62) {
            const aci = parseInt(eVal, 10);
            entity.color = ACI_COLORS[Math.abs(aci)] || '#38bdf8';
          } else if (eCode === 10) {
            entity.x = parseFloat(eVal);
            if (!entity.vertices) entity.vertices = [];
            entity.currentVertex = { x: parseFloat(eVal), y: 0, z: 0 };
          } else if (eCode === 20) {
            entity.y = parseFloat(eVal);
            if (entity.currentVertex) {
              entity.currentVertex.y = parseFloat(eVal);
            }
          } else if (eCode === 30) {
            entity.z = parseFloat(eVal);
            if (entity.currentVertex) {
              entity.currentVertex.z = parseFloat(eVal);
              entity.vertices.push({ ...entity.currentVertex });
              entity.currentVertex = null;
            }
          } else if (eCode === 11) {
            entity.x2 = parseFloat(eVal);
          } else if (eCode === 21) {
            entity.y2 = parseFloat(eVal);
          } else if (eCode === 31) {
            entity.z2 = parseFloat(eVal);
          } else if (eCode === 40) {
            entity.radius = parseFloat(eVal);
            entity.textHeight = parseFloat(eVal);
          } else if (eCode === 50) {
            entity.startAngle = parseFloat(eVal);
            entity.rotation = parseFloat(eVal);
          } else if (eCode === 51) {
            entity.endAngle = parseFloat(eVal);
          } else if (eCode === 1) {
            entity.text = eVal;
          } else if (eCode === 70) {
            entity.flags = parseInt(eVal, 10);
          }
        }

        if (entity.currentVertex) {
          entity.vertices.push(entity.currentVertex);
        }

        if (!layers.has(entity.layer)) {
          layers.set(entity.layer, { name: entity.layer, visible: true, color: '#38bdf8', count: 0 });
        }
        layers.get(entity.layer).count += 1;

        entities.push(entity);
      }
    }
  }

  // Fallback default layer if none registered
  if (layers.size === 0) {
    layers.set('0', { name: '0', visible: true, color: '#38bdf8', count: entities.length });
  }

  return { entities, layers: Array.from(layers.values()) };
}

export default function Cad2DViewer({ fullContent, artifact, token, filename = 'drawing.dxf' }) {
  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const layerGroupsRef = useRef(new Map());

  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'
  const [layers, setLayers] = useState([]);
  const [activeLayerNames, setActiveLayerNames] = useState(new Set());
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [measuringMode, setMeasuringMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measuredDistance, setMeasuredDistance] = useState(null);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });
  const [stats, setStats] = useState({ entities: 0, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } });
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isLoading, setIsLoading] = useState(true);

  // Parse raw text
  const parsedData = useMemo(() => {
    if (!fullContent) return null;
    try {
      return parseDxfContent(fullContent);
    } catch (e) {
      console.error('Failed to parse DXF:', e);
      return null;
    }
  }, [fullContent]);

  // Sync layers list
  useEffect(() => {
    if (parsedData && parsedData.layers) {
      setLayers(parsedData.layers);
      setActiveLayerNames(new Set(parsedData.layers.map((l) => l.name)));
      setStats((prev) => ({ ...prev, entities: parsedData.entities.length }));
    }
  }, [parsedData]);

  // Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Render loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const asp = w / h;
      const cam = cameraRef.current;
      const currentHeight = cam.top - cam.bottom;
      cam.left = (-currentHeight * asp) / 2;
      cam.right = (currentHeight * asp) / 2;
      cam.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Build Geometry when parsed data or active layers change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !parsedData) return;

    // Clear old geometry groups
    layerGroupsRef.current.forEach((group) => scene.remove(group));
    layerGroupsRef.current.clear();

    const { entities, layers: layerList } = parsedData;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const updateBounds = (x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    };

    // Group entities by layer
    const entitiesByLayer = new Map();
    entities.forEach((ent) => {
      const lName = ent.layer || '0';
      if (!entitiesByLayer.has(lName)) {
        entitiesByLayer.set(lName, []);
      }
      entitiesByLayer.get(lName).push(ent);
    });

    const isDark = theme === 'dark';
    const defaultStrokeColor = isDark ? 0x38bdf8 : 0x0284c7;

    entitiesByLayer.forEach((layerEntities, layerName) => {
      const layerGroup = new THREE.Group();
      layerGroup.name = `layer_${layerName}`;

      const linePositions = [];
      const lineColors = [];

      layerEntities.forEach((ent) => {
        const entColor = ent.color ? new THREE.Color(ent.color) : new THREE.Color(defaultStrokeColor);

        if (ent.type === 'LINE') {
          const x1 = ent.x ?? 0;
          const y1 = ent.y ?? 0;
          const x2 = ent.x2 ?? 0;
          const y2 = ent.y2 ?? 0;
          linePositions.push(x1, y1, 0, x2, y2, 0);
          lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
          updateBounds(x1, y1);
          updateBounds(x2, y2);
        } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
          if (ent.vertices && ent.vertices.length > 1) {
            for (let v = 0; v < ent.vertices.length - 1; v++) {
              const v1 = ent.vertices[v];
              const v2 = ent.vertices[v + 1];
              linePositions.push(v1.x, v1.y, 0, v2.x, v2.y, 0);
              lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
              updateBounds(v1.x, v1.y);
              updateBounds(v2.x, v2.y);
            }
            if ((ent.flags & 1) === 1) {
              // Closed polyline
              const first = ent.vertices[0];
              const last = ent.vertices[ent.vertices.length - 1];
              linePositions.push(last.x, last.y, 0, first.x, first.y, 0);
              lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
            }
          }
        } else if (ent.type === 'CIRCLE') {
          const cx = ent.x ?? 0;
          const cy = ent.y ?? 0;
          const r = ent.radius || 5;
          const segments = 36;
          for (let s = 0; s < segments; s++) {
            const theta1 = (s / segments) * Math.PI * 2;
            const theta2 = ((s + 1) / segments) * Math.PI * 2;
            const px1 = cx + Math.cos(theta1) * r;
            const py1 = cy + Math.sin(theta1) * r;
            const px2 = cx + Math.cos(theta2) * r;
            const py2 = cy + Math.sin(theta2) * r;
            linePositions.push(px1, py1, 0, px2, py2, 0);
            lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
            updateBounds(px1, py1);
            updateBounds(px2, py2);
          }
        } else if (ent.type === 'ARC') {
          const cx = ent.x ?? 0;
          const cy = ent.y ?? 0;
          const r = ent.radius || 5;
          const sDeg = ent.startAngle || 0;
          const eDeg = ent.endAngle || 360;
          let span = eDeg - sDeg;
          if (span < 0) span += 360;
          const segments = Math.max(12, Math.floor(span / 10));
          for (let s = 0; s < segments; s++) {
            const theta1 = THREE.MathUtils.degToRad(sDeg + (s / segments) * span);
            const theta2 = THREE.MathUtils.degToRad(sDeg + ((s + 1) / segments) * span);
            const px1 = cx + Math.cos(theta1) * r;
            const py1 = cy + Math.sin(theta1) * r;
            const px2 = cx + Math.cos(theta2) * r;
            const py2 = cy + Math.sin(theta2) * r;
            linePositions.push(px1, py1, 0, px2, py2, 0);
            lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
            updateBounds(px1, py1);
            updateBounds(px2, py2);
          }
        }
      });

      if (linePositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          linewidth: 1.5,
          transparent: true,
          opacity: 0.95
        });
        const lineSegments = new THREE.LineSegments(geometry, material);
        layerGroup.add(lineSegments);
      }

      layerGroup.visible = activeLayerNames.has(layerName);
      scene.add(layerGroup);
      layerGroupsRef.current.set(layerName, layerGroup);
    });

    if (minX === Infinity) {
      minX = -50;
      maxX = 50;
      minY = -50;
      maxY = 50;
    }

    setStats((prev) => ({
      ...prev,
      bounds: { minX, maxX, minY, maxY }
    }));

    // Auto zoom to fit on initial load
    fitView(minX, maxX, minY, maxY);
    setIsLoading(false);
  }, [parsedData, activeLayerNames, theme]);

  // Fit View / Zoom to Extents
  const fitView = useCallback((minX, maxX, minY, maxY) => {
    const cam = cameraRef.current;
    const container = mountRef.current;
    if (!cam || !container) return;

    const bMinX = minX !== undefined ? minX : stats.bounds.minX;
    const bMaxX = maxX !== undefined ? maxX : stats.bounds.maxX;
    const bMinY = minY !== undefined ? minY : stats.bounds.minY;
    const bMaxY = maxY !== undefined ? maxY : stats.bounds.maxY;

    const centerX = (bMinX + bMaxX) / 2;
    const centerY = (bMinY + bMaxY) / 2;
    const spanX = Math.max(bMaxX - bMinX, 10) * 1.2;
    const spanY = Math.max(bMaxY - bMinY, 10) * 1.2;

    const containerAspect = (container.clientWidth || 800) / (container.clientHeight || 600);
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
    setZoomLevel(100);
  }, [stats.bounds]);

  // Pan & Zoom Mouse Event Handlers
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1) {
      // Left or Middle drag
      if (measuringMode && e.button === 0) {
        handleMeasureClick(e);
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

    // Convert screen mouse coords to CAD World coords
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
    const curW = cam.right - cam.left;
    const curH = cam.top - cam.bottom;

    cam.left *= zoomFactor;
    cam.right *= zoomFactor;
    cam.top *= zoomFactor;
    cam.bottom *= zoomFactor;
    cam.updateProjectionMatrix();

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
    setZoomLevel((prev) => Math.round(prev / factor));
  };

  const toggleLayer = (layerName) => {
    setActiveLayerNames((prev) => {
      const next = new Set(prev);
      if (next.has(layerName)) {
        next.delete(layerName);
      } else {
        next.add(layerName);
      }
      const group = layerGroupsRef.current.get(layerName);
      if (group) group.visible = next.has(layerName);
      return next;
    });
  };

  const handleMeasureClick = (e) => {
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
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${filename.replace(/\.[^/.]+$/, '')}_blueprint.png`;
    link.href = dataUrl;
    link.click();
  };

  const isDark = theme === 'dark';

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
            {stats.entities} entities
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

          <button
            onClick={() => handleZoom('in')}
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
            onClick={() => handleZoom('out')}
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
            onClick={() => fitView()}
            title="Zoom to Extents (Reset View)"
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
            title={isDark ? 'Switch to Paper White Theme' : 'Switch to AutoCAD Dark Theme'}
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

          <button
            onClick={handleExportPng}
            title="Export High-Res Blueprint PNG"
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* ── Main Canvas Viewport Area ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Subtle CAD Background Grid lines */}
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

        {/* ── Layer Manager Sidebar Drawer ── */}
        {showLayerPanel && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              width: '240px',
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
              <span>CAD Layers</span>
              <button
                onClick={() => setShowLayerPanel(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  opacity: 0.6
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '6px' }}>
              {layers.map((layer) => {
                const isVisible = activeLayerNames.has(layer.name);
                return (
                  <div
                    key={layer.name}
                    onClick={() => toggleLayer(layer.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isVisible
                        ? isDark
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(0,0,0,0.03)'
                        : 'transparent',
                      opacity: isVisible ? 1 : 0.45,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '2px',
                          background: layer.color || '#38bdf8'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{layer.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>{layer.count}</span>
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
