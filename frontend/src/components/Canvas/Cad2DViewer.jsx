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
 * Standard AutoCAD Color Index (ACI) lookup table
 */
const ACI_COLORS = {
  1: '#ef4444', // Red
  2: '#eab308', // Yellow
  3: '#22c55e', // Green
  4: '#06b6d4', // Cyan
  5: '#3b82f6', // Blue
  6: '#ec4899', // Magenta
  7: '#f8fafc', // White
  8: '#64748b', // Dark Gray
  9: '#94a3b8', // Light Gray
};
const VALID_ENTITIES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 
  'SPLINE', 'SOLID', '3DFACE', 'TRACE', 'TEXT', 'MTEXT', 'INSERT'
]);

/**
 * Helper: read all group-code/value pairs until the next group-code 0 (new entity).
 * Returns:
 *   props       – plain object of { [code]: firstValue } for single-occurrence codes
 *   vertexPairs – array of {x, y} for repeated group-10/20 pairs (LWPOLYLINE vertices)
 *   nextI       – updated line index after consuming all props
 */
/**
 * Helper: read all group-code/value pairs until the next code 0 (new entity / record).
 */
function readEntityPropsFromPairs(pairs, startIdx, numPairs) {
  const props = {};
  const vertexPairs = []; // for LWPOLYLINE repeated 10/20 pairs
  let pendingX = null;
  let p = startIdx;

  while (p < numPairs) {
    const [code, val] = pairs[p];
    if (code === 0) break;
    p++;

    if (code === 10) {
      pendingX = parseFloat(val);
      if (props[10] === undefined) props[10] = val;
    } else if (code === 20) {
      if (pendingX !== null) {
        vertexPairs.push({ x: pendingX, y: parseFloat(val), z: 0 });
        pendingX = null;
      }
      if (props[20] === undefined) props[20] = val;
    } else {
      if (props[code] === undefined) props[code] = val;
    }
  }

  return { props, vertexPairs, nextIdx: p };
}

function parseDxfContent(dxfText) {
  if (!dxfText) return { entities: [], layers: [] };

  // CRITICAL: Preserve empty value lines so group-code and value parity is strictly maintained!
  const rawLines = dxfText.split(/\r?\n/);
  const pairs = [];
  let lineIdx = 0;
  while (lineIdx < rawLines.length - 1) {
    const codeStr = rawLines[lineIdx].trim();
    const valStr = rawLines[lineIdx + 1].trim();
    lineIdx += 2;
    const code = parseInt(codeStr, 10);
    if (!isNaN(code)) {
      pairs.push([code, valStr]);
    }
  }

  const entities = [];
  const layers = new Map();
  const blocksMap = new Map(); // blockName -> array of sub-entities

  let p = 0;
  const numPairs = pairs.length;
  let currentSection = null;
  let currentBlock = null; // currently parsing block definition

  while (p < numPairs) {
    const [code, val] = pairs[p];
    p++;

    if (code !== 0) continue; // Only act on record/entity-level tokens (code 0)

    const valUpper = val.toUpperCase();

    // ── Section control ─────────────────────────────────────────────────────
    if (valUpper === 'SECTION') {
      if (p < numPairs && pairs[p][0] === 2) {
        currentSection = pairs[p][1].toUpperCase();
        p++;
      }
      continue;
    }
    if (valUpper === 'ENDSEC') {
      currentSection = null;
      currentBlock = null;
      continue;
    }
    if (valUpper === 'EOF') {
      // In multi-part or concatenated DXF files, an EOF may appear before subsequent sections.
      // Reset section state and continue so all entities across all sections are parsed completely.
      currentSection = null;
      currentBlock = null;
      continue;
    }

    // ── TABLES: Layer definitions ───────────────────────────────────────────
    if (currentSection === 'TABLES') {
      if (valUpper === 'LAYER') {
        let layerName = '0';
        let layerColor = '#38bdf8';
        while (p < numPairs && pairs[p][0] !== 0) {
          const [lCode, lVal] = pairs[p];
          p++;
          if (lCode === 2) layerName = lVal;
          else if (lCode === 62) {
            const aci = parseInt(lVal, 10);
            layerColor = ACI_COLORS[Math.abs(aci)] || '#38bdf8';
          }
        }
        layers.set(layerName, { name: layerName, color: layerColor, visible: true, count: 0 });
      }
      continue;
    }

    // ── BLOCKS: Component definitions & symbols ─────────────────────────────
    if (currentSection === 'BLOCKS') {
      if (valUpper === 'BLOCK') {
        const { props: bProps, nextIdx } = readEntityPropsFromPairs(pairs, p, numPairs);
        p = nextIdx;
        const bName = (bProps[2] || '').trim();
        currentBlock = {
          name: bName,
          baseX: bProps[10] != null ? parseFloat(bProps[10]) : 0,
          baseY: bProps[20] != null ? parseFloat(bProps[20]) : 0,
          entities: []
        };
        if (bName) blocksMap.set(bName, currentBlock);
      } else if (valUpper === 'ENDBLK') {
        currentBlock = null;
      } else if (currentBlock) {
        // Collect sub-entity inside block
        const { props, vertexPairs, nextIdx } = readEntityPropsFromPairs(pairs, p, numPairs);
        p = nextIdx;
        const subEnt = {
          type: valUpper,
          layer: props[8] || '0',
          color: props[62] != null ? (ACI_COLORS[Math.abs(parseInt(props[62], 10))] || null) : null,
          x: props[10] != null ? parseFloat(props[10]) : 0,
          y: props[20] != null ? parseFloat(props[20]) : 0,
          z: props[30] != null ? parseFloat(props[30]) : 0,
          x2: props[11] != null ? parseFloat(props[11]) : undefined,
          y2: props[21] != null ? parseFloat(props[21]) : undefined,
          radius: props[40] != null ? parseFloat(props[40]) : undefined,
          textHeight: props[40] != null ? parseFloat(props[40]) : 10,
          startAngle: props[50] != null ? parseFloat(props[50]) : undefined,
          endAngle: props[51] != null ? parseFloat(props[51]) : undefined,
          rotation: props[50] != null ? parseFloat(props[50]) : 0,
          flags: props[70] != null ? parseInt(props[70], 10) : 0,
          text: props[1] || props[3] || undefined,
          vertices: vertexPairs
        };
        currentBlock.entities.push(subEnt);
      }
      continue;
    }

    // ── ENTITIES: Drawing elements ──────────────────────────────────────────
    if (currentSection !== 'ENTITIES') continue;

    const entityType = valUpper;

    // Skip sub-entity markers handled by POLYLINE
    if (entityType === 'VERTEX' || entityType === 'SEQEND') {
      continue;
    }

    if (!VALID_ENTITIES.has(entityType)) {
      // Ignore unrecognized/internal tokens (e.g. spurious group 0 noise)
      const { nextIdx } = readEntityPropsFromPairs(pairs, p, numPairs);
      p = nextIdx;
      continue;
    }

    const { props, vertexPairs, nextIdx } = readEntityPropsFromPairs(pairs, p, numPairs);
    p = nextIdx;

    const entity = {
      type:       entityType,
      layer:      props[8]  || '0',
      color:      props[62] != null ? (ACI_COLORS[Math.abs(parseInt(props[62], 10))] || null) : null,
      // Common coordinates
      x:  props[10] != null ? parseFloat(props[10]) : 0,
      y:  props[20] != null ? parseFloat(props[20]) : 0,
      z:  props[30] != null ? parseFloat(props[30]) : 0,
      x2: props[11] != null ? parseFloat(props[11]) : undefined,
      y2: props[21] != null ? parseFloat(props[21]) : undefined,
      x3: props[12] != null ? parseFloat(props[12]) : undefined,
      y3: props[22] != null ? parseFloat(props[22]) : undefined,
      x4: props[13] != null ? parseFloat(props[13]) : undefined,
      y4: props[23] != null ? parseFloat(props[23]) : undefined,
      // Geometry params
      radius:     props[40] != null ? parseFloat(props[40]) : undefined,
      textHeight: props[40] != null ? parseFloat(props[40]) : 8,
      startAngle: props[50] != null ? parseFloat(props[50]) : undefined,
      endAngle:   props[51] != null ? parseFloat(props[51]) : undefined,
      rotation:   props[50] != null ? parseFloat(props[50]) : 0,
      scaleX:     props[41] != null ? parseFloat(props[41]) : 1,
      scaleY:     props[42] != null ? parseFloat(props[42]) : 1,
      scaleZ:     props[43] != null ? parseFloat(props[43]) : 1,
      blockName:  props[2]  || undefined,
      flags:      props[70] != null ? parseInt(props[70], 10) : 0,
      text:       props[1]  || props[3] || undefined,
      vertices:   [],
    };

    // ── R12 POLYLINE: consume VERTEX sub-entities ───────────────────────────
    if (entityType === 'POLYLINE') {
      while (p < numPairs) {
        if (pairs[p][0] !== 0) { p++; continue; }
        const subType = pairs[p][1].toUpperCase();
        p++;
        if (subType === 'SEQEND') {
          break;
        }
        if (subType === 'VERTEX') {
          const { props: vp, nextIdx: vi } = readEntityPropsFromPairs(pairs, p, numPairs);
          p = vi;
          const vflags = vp[70] != null ? parseInt(vp[70], 10) : 0;
          if (!(vflags & 0x10) && !(vflags & 0x20)) {
            entity.vertices.push({
              x: vp[10] != null ? parseFloat(vp[10]) : 0,
              y: vp[20] != null ? parseFloat(vp[20]) : 0,
              z: vp[30] != null ? parseFloat(vp[30]) : 0,
            });
          }
        } else {
          p--; // Put back if not VERTEX
          break;
        }
      }
    }

    // ── LWPOLYLINE: inline vertices ─────────────────────────────────────────
    if (entityType === 'LWPOLYLINE') {
      entity.vertices = vertexPairs;
    }

    // ── INSERT: Resolve Block Reference into instanced entities ─────────────
    if (entityType === 'INSERT' && entity.blockName && blocksMap.has(entity.blockName)) {
      const blk = blocksMap.get(entity.blockName);
      const rad = THREE.MathUtils.degToRad(entity.rotation || 0);
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const sx = entity.scaleX || 1;
      const sy = entity.scaleY || 1;

      blk.entities.forEach((be) => {
        // Clone and transform coordinates relative to insertion point
        const transformPt = (px, py) => {
          const lx = (px - blk.baseX) * sx;
          const ly = (py - blk.baseY) * sy;
          return {
            x: entity.x + (lx * cosR - ly * sinR),
            y: entity.y + (lx * sinR + ly * cosR)
          };
        };

        const instEnt = { ...be };
        instEnt.layer = entity.layer || be.layer;
        instEnt.color = entity.color || be.color;

        const tp1 = transformPt(be.x ?? 0, be.y ?? 0);
        instEnt.x = tp1.x;
        instEnt.y = tp1.y;

        if (be.x2 !== undefined && be.y2 !== undefined) {
          const tp2 = transformPt(be.x2, be.y2);
          instEnt.x2 = tp2.x;
          instEnt.y2 = tp2.y;
        }
        if (be.radius !== undefined) {
          instEnt.radius = be.radius * Math.abs(sx);
        }
        if (be.rotation !== undefined) {
          instEnt.rotation = (be.rotation || 0) + (entity.rotation || 0);
        }
        if (be.vertices && be.vertices.length > 0) {
          instEnt.vertices = be.vertices.map(v => transformPt(v.x, v.y));
        }

        if (!layers.has(instEnt.layer)) {
          layers.set(instEnt.layer, { name: instEnt.layer, color: '#38bdf8', visible: true, count: 0 });
        }
        layers.get(instEnt.layer).count += 1;
        entities.push(instEnt);
      });
      continue;
    }

    // Register layer if not already seen
    if (!layers.has(entity.layer)) {
      layers.set(entity.layer, { name: entity.layer, color: '#38bdf8', visible: true, count: 0 });
    }
    layers.get(entity.layer).count += 1;
    if (!entity.color) entity.color = layers.get(entity.layer).color;

    entities.push(entity);
  }

  // Fallback default layer if none registered
  if (layers.size === 0) {
    layers.set('0', { name: '0', color: '#38bdf8', visible: true, count: entities.length });
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
  const [cursorCoords, setCursorCoords] = useState({ x: '0.00', y: '0.00' });
  const [stats, setStats] = useState({ entities: 0, bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 } });
  const boundsRef = useRef({ minX: -50, maxX: 50, minY: -50, maxY: 50 });
  const [zoomLevel, setZoomLevel] = useState(100);

  // Parse raw text
  const parsedData = useMemo(() => {
    if (!fullContent) return { entities: [], layers: [] };
    try {
      return parseDxfContent(fullContent);
    } catch (e) {
      console.error('Failed to parse DXF:', e);
      return { entities: [], layers: [] };
    }
  }, [fullContent]);

  // Sync layers list
  useEffect(() => {
    if (parsedData && parsedData.layers && parsedData.layers.length > 0) {
      setLayers(parsedData.layers);
      setActiveLayerNames(new Set(parsedData.layers.map((l) => l.name)));
      setStats((prev) => ({ ...prev, entities: parsedData.entities.length }));
    }
  }, [parsedData]);

  // Three.js Scene Setup
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
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: rw, height: rh } = entry.contentRect || {};
          if (rw > 0 && rh > 0) {
            handleResize();
            // Re-fit current drawing bounds if available
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
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Build Geometry when parsed data, active layers, or theme changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !parsedData) return;

    // Clear old geometry groups
    layerGroupsRef.current.forEach((group) => scene.remove(group));
    layerGroupsRef.current.clear();

    const { entities } = parsedData;

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
        let entColor = ent.color ? new THREE.Color(ent.color) : new THREE.Color(defaultStrokeColor);
        // Adjust pure white/black contrast for theme
        if (!isDark && (ent.color === '#ffffff' || ent.color === '#f8fafc')) {
          entColor = new THREE.Color(0x0f172a);
        }

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
          const segments = 48;
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
          const segments = Math.max(16, Math.floor(span / 8));
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
        } else if (ent.type === 'ELLIPSE') {
          const cx = ent.x ?? 0;
          const cy = ent.y ?? 0;
          const mx = ent.x2 ?? 10;
          const my = ent.y2 ?? 0;
          const majorLen = Math.sqrt(mx * mx + my * my) || 10;
          const minorLen = majorLen * (ent.radius || 0.5);
          const majorAngle = Math.atan2(my, mx);
          const segments = 48;
          for (let s = 0; s < segments; s++) {
            const t1 = (s / segments) * Math.PI * 2;
            const t2 = ((s + 1) / segments) * Math.PI * 2;
            const lx1 = Math.cos(t1) * majorLen;
            const ly1 = Math.sin(t1) * minorLen;
            const lx2 = Math.cos(t2) * majorLen;
            const ly2 = Math.sin(t2) * minorLen;
            const px1 = cx + lx1 * Math.cos(majorAngle) - ly1 * Math.sin(majorAngle);
            const py1 = cy + lx1 * Math.sin(majorAngle) + ly1 * Math.cos(majorAngle);
            const px2 = cx + lx2 * Math.cos(majorAngle) - ly2 * Math.sin(majorAngle);
            const py2 = cy + lx2 * Math.sin(majorAngle) + ly2 * Math.cos(majorAngle);
            linePositions.push(px1, py1, 0, px2, py2, 0);
            lineColors.push(entColor.r, entColor.g, entColor.b, entColor.r, entColor.g, entColor.b);
            updateBounds(px1, py1);
            updateBounds(px2, py2);
          }
        } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          if (ent.text && ent.text.trim()) {
            const tx = ent.x ?? 0;
            const ty = ent.y ?? 0;
            updateBounds(tx, ty);

            // Clean AutoCAD formatting codes like \A1;, %%c, \P
            const cleanStr = ent.text
              .replace(/\\[A-Za-z0-9]+;?/g, '')
              .replace(/%%[A-Za-z0-9]/g, '')
              .replace(/\\P/g, '\n')
              .trim();

            if (cleanStr) {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const fontSize = 48;
              ctx.font = `600 ${fontSize}px sans-serif`;

              const linesArr = cleanStr.split('\n');
              let maxLineW = 0;
              linesArr.forEach(l => {
                const w = ctx.measureText(l).width;
                if (w > maxLineW) maxLineW = w;
              });

              canvas.width = Math.max(128, Math.ceil(maxLineW + 32));
              canvas.height = Math.max(64, Math.ceil(linesArr.length * fontSize * 1.35 + 24));

              ctx.font = `600 ${fontSize}px sans-serif`;
              ctx.fillStyle = ent.color || (isDark ? '#f8fafc' : '#0f172a');
              ctx.textBaseline = 'top';

              linesArr.forEach((lineText, lIdx) => {
                ctx.fillText(lineText, 16, 12 + lIdx * fontSize * 1.35);
              });

              const texture = new THREE.CanvasTexture(canvas);
              texture.minFilter = THREE.LinearFilter;
              const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
              const sprite = new THREE.Sprite(spriteMat);

              const userH = Math.max(ent.textHeight || 8, 3.5);
              const scaleRatio = canvas.width / canvas.height;
              const spriteW = userH * scaleRatio * linesArr.length;
              const spriteH = userH * linesArr.length;
              sprite.scale.set(spriteW, spriteH, 1);

              if (ent.rotation) {
                spriteMat.rotation = THREE.MathUtils.degToRad(ent.rotation);
              }
              sprite.position.set(tx + (spriteW / 2), ty + (spriteH / 2), 0.5);

              layerGroup.add(sprite);
            }
          }
        } else if (ent.type === 'SOLID' || ent.type === '3DFACE' || ent.type === 'TRACE') {
          // Render solid filled polygon / triangular or quad arrowheads / equipment bodies
          const p1 = { x: ent.x ?? 0, y: ent.y ?? 0 };
          const p2 = { x: ent.x2 ?? 0, y: ent.y2 ?? 0 };
          const p3 = { x: ent.x3 !== undefined ? ent.x3 : p2.x, y: ent.y3 !== undefined ? ent.y3 : p2.y };
          const p4 = { x: ent.x4 !== undefined ? ent.x4 : p3.x, y: ent.y4 !== undefined ? ent.y4 : p3.y };

          updateBounds(p1.x, p1.y);
          updateBounds(p2.x, p2.y);
          updateBounds(p3.x, p3.y);
          updateBounds(p4.x, p4.y);

          // Lines for boundaries
          linePositions.push(p1.x, p1.y, 0, p2.x, p2.y, 0);
          linePositions.push(p2.x, p2.y, 0, p4.x, p4.y, 0);
          linePositions.push(p4.x, p4.y, 0, p3.x, p3.y, 0);
          linePositions.push(p3.x, p3.y, 0, p1.x, p1.y, 0);
          for (let i = 0; i < 8; i++) {
            lineColors.push(entColor.r, entColor.g, entColor.b);
          }
        }
      });

      if (linePositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          linewidth: 2,
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

    boundsRef.current = { minX, maxX, minY, maxY };

    setStats({
      entities: entities.length,
      bounds: { minX, maxX, minY, maxY }
    });

    // Auto fit view on load
    fitView(minX, maxX, minY, maxY);
  }, [parsedData, activeLayerNames, theme]);

  // Fit View / Zoom to Extents
  const fitView = useCallback((minX, maxX, minY, maxY) => {
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
    const spanX = Math.max(bMaxX - bMinX, 20) * 1.35;
    const spanY = Math.max(bMaxY - bMinY, 20) * 1.35;

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
    setZoomLevel(100);
  }, [stats.bounds]);

  // Pan & Zoom Mouse Event Handlers
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  const handleMouseDown = (e) => {
    if (e.button === 0 || e.button === 1) {
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
