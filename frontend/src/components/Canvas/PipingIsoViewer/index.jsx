import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  RotateCcw,
  Sun,
  Moon,
  Layers,
  Download,
  Palette,
  X,
  Compass,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import {
  parsePcfOrIdf,
  ISO_CATEGORY_COLORS,
  exportIsoMtoCsv,
} from './pcfIdfParser';
import IsoSchedulePanel from './isoSchedulePanel';

const COLOR_MODE_OPTIONS = [
  { value: 'category', label: 'Color by Type' },
  { value: 'spool', label: 'Color by Spool' },
];

export default function PipingIsoViewer({
  fullContent,
  filename = 'isometric.pcf',
  theme: propTheme,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const meshMetaMapRef = useRef(new Map());

  const [theme, setTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setTheme(propTheme);
  }, [propTheme]);
  const isDark = theme !== 'light';

  const parsed = useMemo(() => parsePcfOrIdf(fullContent, filename), [fullContent, filename]);

  const [colorMode, setColorMode] = useState('category');
  const [showPanel, setShowPanel] = useState(false);
  const [selectedSpoolId, setSelectedSpoolId] = useState(null);
  const [selectedComp, setSelectedComp] = useState(null);

  const setCameraPreset = useCallback(
    (preset = 'iso') => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const { cx, cy, cz, span } = parsed.bounds;
      const dist = span * 1.45;
      controls.target.set(cx, cy, cz);
      if (preset === 'top') camera.position.set(cx, cy + dist, cz + 0.01);
      else if (preset === 'front') camera.position.set(cx, cy, cz + dist);
      else if (preset === 'right') camera.position.set(cx + dist, cy, cz);
      else camera.position.set(cx + dist * 0.65, cy + dist * 0.55, cz + dist * 0.65);
      controls.update();
    },
    [parsed.bounds]
  );

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(1, 1.5, 1.2);
    scene.add(keyLight);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw <= 0 || nh <= 0) return;
      cameraRef.current.aspect = nw / nh;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (ro) ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Build 3D Piping Isometric Geometry
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const prev = scene.getObjectByName('__ISO_ROOT__');
    if (prev) {
      prev.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      scene.remove(prev);
    }
    const prevGrid = scene.getObjectByName('__ISO_GRID__');
    if (prevGrid) scene.remove(prevGrid);

    const root = new THREE.Group();
    root.name = '__ISO_ROOT__';
    meshMetaMapRef.current.clear();

    const { cx, cy, cz, span, minY } = parsed.bounds;
    const grid = new THREE.GridHelper(span * 1.6, 20, isDark ? 0x334155 : 0xcbd5e1, isDark ? 0x1e293b : 0xe2e8f0);
    grid.name = '__ISO_GRID__';
    grid.position.set(cx, minY - span * 0.05, cz);
    scene.add(grid);

    const baseRadius = Math.max(span * 0.006, 2);

    const addCylinder = (a, b, r, colorHex, comp, opacity = 1) => {
      const va = new THREE.Vector3(a.x, a.z, -a.y); // Map Z-up piping coords to Y-up Three.js
      const vb = new THREE.Vector3(b.x, b.z, -b.y);
      const len = va.distanceTo(vb);
      if (len < 0.01) return;
      const geo = new THREE.CylinderGeometry(r, r, len, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.45,
        metalness: 0.25,
        transparent: opacity < 1,
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(va).add(vb).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      mesh.userData = { comp };
      root.add(mesh);
      meshMetaMapRef.current.set(mesh.uuid, comp);
    };

    const addMarker = (pt, r, colorHex, comp, opacity = 1) => {
      const geo = new THREE.SphereGeometry(r, 12, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.2,
        transparent: opacity < 1,
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pt.x, pt.z, -pt.y);
      mesh.userData = { comp };
      root.add(mesh);
      meshMetaMapRef.current.set(mesh.uuid, comp);
    };

    parsed.components.forEach((c) => {
      const dimmed = selectedSpoolId && c.spoolId !== selectedSpoolId;
      const opacity = dimmed ? 0.16 : 1;
      const isSelected = selectedComp?.id === c.id;
      let col =
        colorMode === 'spool'
          ? parsed.spoolColorMap.get(c.spoolId) || '#38bdf8'
          : c.category === 'weld'
            ? c.shopField === 'FIELD'
              ? '#10b981'
              : '#ef4444'
            : ISO_CATEGORY_COLORS[c.category] || '#94a3b8';
      if (isSelected) col = '#ffffff';

      const boreScale = Math.max(0.5, Math.min(2.4, (c.bore || 50) / 100));
      const r = baseRadius * boreScale * (c.category === 'flange' || c.category === 'valve' ? 1.55 : 1);

      if (c.category === 'weld' || c.category === 'support' || c.category === 'instrument') {
        addMarker(c.p1, baseRadius * 1.4, col, c, opacity);
      } else if (dist3Check(c.p1, c.p2) > 0.1) {
        addCylinder(c.p1, c.p2, r, col, c, opacity);
        if (c.center && c.branch) {
          addCylinder(c.center, c.branch, r * 0.85, col, c, opacity);
        }
      } else if (c.center) {
        addMarker(c.center, r * 1.3, col, c, opacity);
      }
    });

    scene.add(root);

    // Adjust camera bounds (note Y-up mapping: cx, cz, -cy)
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      const tx = cx;
      const ty = cz;
      const tz = -cy;
      const dist = span * 1.45;
      controls.target.set(tx, ty, tz);
      camera.position.set(tx + dist * 0.65, ty + dist * 0.55, tz + dist * 0.65);
      controls.update();
    }
  }, [parsed, colorMode, selectedSpoolId, selectedComp, isDark]);

  const handleCanvasClick = (e) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!container || !camera || !scene) return;
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const root = scene.getObjectByName('__ISO_ROOT__');
    if (!root) return;
    const hits = raycaster.intersectObjects(root.children, false);
    if (hits.length > 0 && hits[0].object?.userData?.comp) {
      setSelectedComp(hits[0].object.userData.comp);
    }
  };

  const focusComponent = useCallback((comp) => {
    setSelectedComp(comp);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !comp?.p1) return;
    const tx = comp.p1.x;
    const ty = comp.p1.z;
    const tz = -comp.p1.y;
    const d = Math.max(parsed.bounds.span * 0.25, 150);
    controls.target.set(tx, ty, tz);
    camera.position.set(tx + d, ty + d * 0.75, tz + d);
    controls.update();
  }, [parsed.bounds.span]);

  const toolbarBg = isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.94)';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: isDark ? '#090d14' : '#f1f5f9',
        color: isDark ? '#f1f5f9' : '#0f172a',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: toolbarBg,
          borderBottom: `1px solid ${borderCol}`,
          zIndex: 25,
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Compass size={14} /> Piping ISO ({parsed.format})
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{parsed.pipelineRef}</span>
          <button
            type="button"
            onClick={() => setShowPanel((s) => !s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: `1px solid ${showPanel ? '#38bdf8' : borderCol}`,
              background: showPanel ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Layers size={13} /> MTO & Welds ({parsed.components.length})
          </button>
          <ModernSelect
            value={colorMode}
            onChange={setColorMode}
            options={COLOR_MODE_OPTIONS}
            icon={Palette}
            isDark={isDark}
            minWidth="150px"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {['iso', 'top', 'front', 'right'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setCameraPreset(p)}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                border: `1px solid ${borderCol}`,
                background: 'transparent',
                color: 'inherit',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => exportIsoMtoCsv(parsed, filename)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: `1px solid ${borderCol}`,
              background: 'transparent',
              color: 'inherit',
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            <Download size={12} /> MTO
          </button>
          <button type="button" onClick={() => setCameraPreset('iso')} title="Reset View" style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <RotateCcw size={15} />
          </button>
          <button type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} title="Toggle Theme" style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* 3D Viewport */}
      <div ref={mountRef} onClick={handleCanvasClick} style={{ flex: 1, minHeight: 0, position: 'relative' }} />

      {showPanel && (
        <IsoSchedulePanel
          parsed={parsed}
          filename={filename}
          selectedSpoolId={selectedSpoolId}
          onSelectSpool={setSelectedSpoolId}
          onFocusComponent={focusComponent}
          onClose={() => setShowPanel(false)}
          isDark={isDark}
        />
      )}

      {selectedComp && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            right: '12px',
            width: '270px',
            padding: '12px',
            borderRadius: '10px',
            background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)',
            border: `1px solid ${borderCol}`,
            zIndex: 30,
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 14px 28px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <strong>{selectedComp.type} ({selectedComp.id})</strong>
            <button type="button" onClick={() => setSelectedComp(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <div>Bore: <strong>{selectedComp.bore} {parsed.unitsBore}</strong></div>
          <div>Spool: <strong>{selectedComp.spoolId}</strong></div>
          {selectedComp.itemCode && <div>Item Code: <strong>{selectedComp.itemCode}</strong></div>}
          {selectedComp.description && <div>Desc: {selectedComp.description}</div>}
          {selectedComp.shopField && <div>Location: <strong>{selectedComp.shopField}</strong></div>}
          {selectedComp.length > 0 && <div>Length: <strong>{selectedComp.length.toFixed(1)} {parsed.unitsCoords}</strong></div>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px', background: toolbarBg, borderTop: `1px solid ${borderCol}`, fontSize: '11px', opacity: 0.85 }}>
        <span>Spec: {parsed.pipingSpec || 'Standard'} • Spools: {parsed.spools.length}</span>
        <span>Components: {parsed.components.length} • Welds: {parsed.weldLog.length}</span>
      </div>
    </div>
  );
}

function dist3Check(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
}
