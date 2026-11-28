import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  RotateCcw,
  Sun,
  Moon,
  Scissors,
  Ruler,
  Camera,
  Download,
  Layers,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Search,
  Copy,
  Check,
  AlertTriangle,
  Box,
} from 'lucide-react';
import { loadIfcModel, getIfcElementDetails, exportIfcScheduleCsv } from './ifcEngine';

function collectNodeExpressIds(node, acc = []) {
  if (!node) return acc;
  if (node.hasMesh) acc.push(node.expressID);
  for (const ch of node.children || []) collectNodeExpressIds(ch, acc);
  return acc;
}

function TreeNodeRow({
  node,
  depth = 0,
  selectedId,
  hiddenIds,
  onSelect,
  onToggleVisibility,
  colors,
  searchQuery,
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = (node.children || []).length > 0;

  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const selfMatch =
      (node.name || '').toLowerCase().includes(q) ||
      (node.type || '').toLowerCase().includes(q) ||
      (node.globalId || '').toLowerCase().includes(q);
    if (selfMatch) return true;
    const checkChild = (n) =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.type || '').toLowerCase().includes(q) ||
      (n.globalId || '').toLowerCase().includes(q) ||
      (n.children || []).some(checkChild);
    return (node.children || []).some(checkChild);
  }, [node, searchQuery]);

  if (!matchesSearch) return null;

  const isSelected = node.expressID === selectedId;
  const isHidden = hiddenIds.has(node.expressID);

  return (
    <div>
      <div
        onClick={() => onSelect(node.expressID, node.hasMesh)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px',
          paddingLeft: 6 + depth * 12,
          fontSize: 11.5,
          borderRadius: 5,
          cursor: 'pointer',
          background: isSelected ? colors.accentSoft : 'transparent',
          color: isSelected ? colors.accent : isHidden ? colors.textMuted : colors.text,
          opacity: isHidden ? 0.55 : 1,
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((x) => !x);
            }}
            style={{ background: 'none', border: 'none', padding: 0, color: colors.textMuted, cursor: 'pointer', display: 'inline-flex' }}
          >
            {expanded || searchQuery ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span style={{ width: 13 }} />
        )}

        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: depth < 4 ? 600 : 400 }}>
          {node.name}
        </span>

        <span style={{ fontSize: 9.5, color: colors.textMuted, flexShrink: 0 }}>
          {String(node.type || '').replace(/^IFC/, '')}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(node);
          }}
          title={isHidden ? 'Show' : 'Hide'}
          style={{ background: 'none', border: 'none', padding: 2, color: colors.textMuted, cursor: 'pointer', display: 'inline-flex' }}
        >
          {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      </div>

      {(expanded || searchQuery) &&
        (node.children || []).map((ch) => (
          <TreeNodeRow
            key={ch.expressID}
            node={ch}
            depth={depth + 1}
            selectedId={selectedId}
            hiddenIds={hiddenIds}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            colors={colors}
            searchQuery={searchQuery}
          />
        ))}
    </div>
  );
}

export default function IfcViewer({ fullContent, artifact, filename = 'model.ifc', theme: propTheme }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const clipPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6));
  const measureGroupRef = useRef(null);
  const highlightMatRef = useRef(new THREE.MeshLambertMaterial({ color: 0x38bdf8, emissive: 0x0284c7, side: THREE.DoubleSide }));
  const ghostMatRef = useRef(new THREE.MeshLambertMaterial({ color: 0x64748b, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));

  const [localTheme, setLocalTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setLocalTheme(propTheme);
  }, [propTheme]);
  const isDark = localTheme !== 'light';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [model, setModel] = useState(null);

  const [sidebarTab, setSidebarTab] = useState('tree');
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [hiddenClasses, setHiddenClasses] = useState(() => new Set());

  const [xrayMode, setXrayMode] = useState(false);
  const [clipPct, setClipPct] = useState(100);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePts, setMeasurePts] = useState([]);
  const [copiedGuid, setCopiedGuid] = useState(false);

  const mediaUrl = artifact?.media_url || '';
  const baseName = (filename || 'model').replace(/\.ifc$/i, '');

  // Load IFC via web-ifc WASM
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadIfcModel({ fullContent, mediaUrl, filename })
      .then((m) => {
        if (cancelled) return;
        setModel(m);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to parse IFC model.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fullContent, mediaUrl, filename]);

  // Setup Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container || !model) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#070b12' : '#f1f5f9');
    sceneRef.current = scene;

    const r = model.bounds.radius;
    const camera = new THREE.PerspectiveCamera(45, width / height, Math.max(0.05, r * 0.002), r * 50);
    camera.position.set(r * 1.3, r * 0.9, r * 1.3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.85);
    d1.position.set(r, r * 1.8, r * 0.8);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.35);
    d2.position.set(-r, r * 0.5, -r);
    scene.add(d2);

    const grid = new THREE.GridHelper(r * 2.2, 20, isDark ? 0x334155 : 0x94a3b8, isDark ? 0x1e293b : 0xcbd5e1);
    grid.position.y = model.bounds.minY;
    scene.add(grid);

    scene.add(model.rootGroup);

    // Attach clipping plane to all base materials
    model.rootGroup.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.clippingPlanes = [clipPlaneRef.current];
      }
    });
    highlightMatRef.current.clippingPlanes = [clipPlaneRef.current];
    ghostMatRef.current.clippingPlanes = [clipPlaneRef.current];

    const measureGroup = new THREE.Group();
    scene.add(measureGroup);
    measureGroupRef.current = measureGroup;

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
    };
  }, [model]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(isDark ? '#070b12' : '#f1f5f9');
    }
  }, [isDark]);

  // Apply visibility, selection highlight & X-ray ghosting
  useEffect(() => {
    if (!model) return;
    for (const [eid, meshes] of model.meshesByExpressId.entries()) {
      const meta = model.elementMeta.get(eid);
      const isVis = !hiddenIds.has(eid) && !(meta && hiddenClasses.has(meta.type));
      const isSel = eid === selectedId;
      for (const m of meshes) {
        m.visible = isVis;
        if (isSel) m.material = highlightMatRef.current;
        else if (xrayMode && selectedId != null) m.material = ghostMatRef.current;
        else m.material = m.userData.baseMaterial;
      }
    }
  }, [model, hiddenIds, hiddenClasses, selectedId, xrayMode]);

  // Y-Section Cut
  useEffect(() => {
    if (!model) return;
    const { minY, maxY } = model.bounds;
    clipPlaneRef.current.constant = minY + ((maxY - minY) * clipPct) / 100 + 0.05;
  }, [clipPct, model]);

  // Fetch PropertySets for selected element
  useEffect(() => {
    if (!model || selectedId == null) {
      setSelectedDetails(null);
      return;
    }
    let cancelled = false;
    getIfcElementDetails(model.ifcApi, model.modelID, selectedId).then((det) => {
      if (!cancelled) setSelectedDetails(det);
    });
    return () => {
      cancelled = true;
    };
  }, [model, selectedId]);

  // Measurement line
  useEffect(() => {
    const grp = measureGroupRef.current;
    if (!grp) return;
    while (grp.children.length) grp.remove(grp.children[0]);
    if (!measurePts.length) return;
    const r = model?.bounds?.radius || 10;
    const sg = new THREE.SphereGeometry(r * 0.01, 12, 12);
    const sm = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (const p of measurePts) {
      const m = new THREE.Mesh(sg, sm);
      m.position.copy(p);
      grp.add(m);
    }
    if (measurePts.length === 2) {
      const lg = new THREE.BufferGeometry().setFromPoints(measurePts);
      const lm = new THREE.LineBasicMaterial({ color: 0xfacc15 });
      grp.add(new THREE.Line(lg, lm));
    }
  }, [measurePts, model]);

  const handleCanvasClick = useCallback(
    (e) => {
      if (!model || !cameraRef.current || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObjects(model.rootGroup.children, false).filter((h) => h.object.visible);
      if (hits.length === 0) return;

      if (measureMode) {
        const pt = hits[0].point.clone();
        setMeasurePts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
      } else {
        const eid = hits[0].object.userData?.expressID;
        if (eid != null) setSelectedId(eid);
      }
    },
    [model, measureMode]
  );

  const handleToggleNodeVisibility = (node) => {
    const ids = collectNodeExpressIds(node, [node.expressID]);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      const allHidden = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allHidden) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter' || !model || !searchQuery.trim()) return;
    const q = searchQuery.trim();
    if (model.guidToExpressId.has(q)) {
      setSelectedId(model.guidToExpressId.get(q));
    }
  };

  const setCameraPreset = (preset) => {
    if (!cameraRef.current || !controlsRef.current || !model) return;
    const r = model.bounds.radius;
    const cam = cameraRef.current;
    if (preset === 'TOP') cam.position.set(0, r * 2.0, 0.001);
    else if (preset === 'FRONT') cam.position.set(0, 0, r * 2.0);
    else if (preset === 'RIGHT') cam.position.set(r * 2.0, 0, 0);
    else cam.position.set(r * 1.3, r * 0.9, r * 1.3);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleSnapshot = () => {
    if (!rendererRef.current) return;
    const url = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_bim.png`;
    a.click();
  };

  const handleCopyGuid = (g) => {
    if (!g) return;
    navigator.clipboard?.writeText(g);
    setCopiedGuid(true);
    setTimeout(() => setCopiedGuid(false), 1500);
  };

  const colors = {
    bg: isDark ? '#0b0f17' : '#f8fafc',
    surface: isDark ? '#111827' : '#ffffff',
    surfaceAlt: isDark ? '#161f30' : '#f1f5f9',
    border: isDark ? '#1f2937' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#3b82f6',
    accentSoft: isDark ? 'rgba(59, 130, 246, 0.16)' : '#eff6ff',
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.textMuted, fontSize: 13 }}>
        Loading IFC BIM model with web-ifc WASM...
      </div>
    );
  }

  if (error || !model) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.text, padding: 24 }}>
        <div style={{ maxWidth: 460, padding: 24, borderRadius: 12, background: colors.surface, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unable to Load IFC Model</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{error}</div>
        </div>
      </div>
    );
  }

  const classEntries = Object.entries(model.classCounts || {}).sort((a, b) => b[1] - a[1]);
  const measureDist = measurePts.length === 2 ? measurePts[0].distanceTo(measurePts[1]) : null;
  const s = model.bounds.size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.bg, color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Toolbar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Box size={16} style={{ color: colors.accent }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{filename}</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>
              {model.meshesByExpressId.size} BIM Elements · {s.x.toFixed(1)} × {s.y.toFixed(1)} × {s.z.toFixed(1)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textMuted }}>
            <Scissors size={12} /> Section Y
            <input type="range" min="5" max="100" step="1" value={clipPct} onChange={(e) => setClipPct(Number(e.target.value))} style={{ width: 65 }} />
          </label>

          <button
            onClick={() => setXrayMode((x) => !x)}
            style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: `1px solid ${xrayMode ? colors.accent : colors.border}`,
              background: xrayMode ? colors.accentSoft : colors.surfaceAlt,
              color: xrayMode ? colors.accent : colors.text, cursor: 'pointer',
            }}
          >
            X-Ray
          </button>

          {['ISO', 'TOP', 'FRONT', 'RIGHT'].map((p) => (
            <button key={p} onClick={() => setCameraPreset(p)} style={{ padding: '4px 7px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
              {p}
            </button>
          ))}

          <button
            onClick={() => { setMeasureMode((m) => !m); setMeasurePts([]); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: `1px solid ${measureMode ? '#facc15' : colors.border}`,
              background: measureMode ? 'rgba(250, 204, 21, 0.16)' : colors.surfaceAlt,
              color: measureMode ? '#facc15' : colors.text, cursor: 'pointer',
            }}
          >
            <Ruler size={12} /> Measure
          </button>

          <button
            onClick={() => setShowSidebar((x) => !x)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: `1px solid ${showSidebar ? colors.accent : colors.border}`,
              background: showSidebar ? colors.accentSoft : colors.surfaceAlt,
              color: showSidebar ? colors.accent : colors.text, cursor: 'pointer',
            }}
          >
            <Layers size={12} /> Model Tree
          </button>

          <button onClick={() => exportIfcScheduleCsv(model.elementMeta, `${baseName}_takeoff.csv`)} title="Export BIM Takeoff CSV" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
            <Download size={12} /> CSV
          </button>
          <button onClick={handleSnapshot} title="Export PNG Snapshot" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
            <Camera size={12} /> PNG
          </button>
          <button onClick={() => { setSelectedId(null); setHiddenIds(new Set()); setHiddenClasses(new Set()); setCameraPreset('ISO'); }} title="Reset View & Visibility" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={13} />
          </button>
          <button onClick={() => setLocalTheme(isDark ? 'light' : 'dark')} title="Toggle Theme" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* Main 3-Pane BIM Workspace */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Spatial & Class Tree */}
        {showSidebar && (
          <aside style={{ width: 290, minWidth: 240, borderRight: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 8, borderBottom: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search name, class, or IfcGuid..."
                  style={{ width: '100%', padding: '5px 8px 5px 25px', fontSize: 11.5, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'tree', label: 'Spatial Tree' },
                  { key: 'classes', label: `Classes (${classEntries.length})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSidebarTab(t.key)}
                    style={{
                      flex: 1, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                      border: `1px solid ${sidebarTab === t.key ? colors.accent : colors.border}`,
                      background: sidebarTab === t.key ? colors.accentSoft : colors.surfaceAlt,
                      color: sidebarTab === t.key ? colors.accent : colors.text, cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
              {sidebarTab === 'tree' ? (
                model.spatialTree ? (
                  <TreeNodeRow
                    node={model.spatialTree}
                    selectedId={selectedId}
                    hiddenIds={hiddenIds}
                    onSelect={(eid) => setSelectedId(eid)}
                    onToggleVisibility={handleToggleNodeVisibility}
                    colors={colors}
                    searchQuery={searchQuery.trim()}
                  />
                ) : (
                  <div style={{ padding: 16, fontSize: 12, color: colors.textMuted }}>No spatial hierarchy found.</div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {classEntries.map(([cls, cnt]) => {
                    const isHidden = hiddenClasses.has(cls);
                    return (
                      <label key={cls} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11, opacity: isHidden ? 0.5 : 1, cursor: 'pointer' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => setHiddenClasses((prev) => {
                              const next = new Set(prev);
                              if (next.has(cls)) next.delete(cls);
                              else next.add(cls);
                              return next;
                            })}
                          />
                          <span>{cls.replace(/^IFC/, '')}</span>
                        </span>
                        <span style={{ color: colors.textMuted, fontWeight: 600 }}>{cnt}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center 3D BIM Viewport */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
          <div
            ref={mountRef}
            onClick={handleCanvasClick}
            style={{ width: '100%', height: '100%', cursor: measureMode ? 'crosshair' : 'grab' }}
          />
          {measureMode && (
            <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '6px 11px', borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11.5 }}>
              {measureDist != null
                ? `Distance: ${measureDist.toFixed(3)} units`
                : measurePts.length === 1
                ? 'Click second point to measure distance'
                : 'Click first point on BIM model'}
            </div>
          )}
        </div>

        {/* Right BIM Property Inspector */}
        <aside style={{ width: 310, minWidth: 250, borderLeft: `1px solid ${colors.border}`, background: colors.surface, overflowY: 'auto', minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedDetails ? (
            <div style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingTop: 32 }}>
              Click any BIM element in the 3D view or Spatial Tree to inspect its GlobalId (`IfcGuid`), Material, and `IfcPropertySet` / `IfcElementQuantity` data.
            </div>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', marginBottom: 3 }}>
                  {selectedDetails.type}
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>{selectedDetails.name}</div>
              </div>

              <div style={{ padding: 10, borderRadius: 8, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ color: colors.textMuted }}>IfcGuid: <code style={{ color: colors.text }}>{selectedDetails.globalId || '—'}</code></span>
                  {selectedDetails.globalId && (
                    <button onClick={() => handleCopyGuid(selectedDetails.globalId)} style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', padding: 0 }}>
                      {copiedGuid ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
                <div><span style={{ color: colors.textMuted }}>ExpressID:</span> <code>#{selectedDetails.expressID}</code></div>
                {selectedDetails.tag && <div><span style={{ color: colors.textMuted }}>Tag:</span> <strong>{selectedDetails.tag}</strong></div>}
                {selectedDetails.objectType && <div><span style={{ color: colors.textMuted }}>ObjectType:</span> {selectedDetails.objectType}</div>}
                {selectedDetails.materials.length > 0 && (
                  <div><span style={{ color: colors.textMuted }}>Materials:</span> {selectedDetails.materials.join(', ')}</div>
                )}
              </div>

              {selectedDetails.propertySets.length === 0 ? (
                <div style={{ fontSize: 11.5, color: colors.textMuted }}>No IfcPropertySet or Quantity sets attached.</div>
              ) : (
                selectedDetails.propertySets.map((ps, idx) => (
                  <div key={`${ps.name}-${idx}`} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '6px 9px', background: colors.surfaceAlt, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${colors.border}` }}>
                      {ps.name}
                    </div>
                    {ps.items.map((it, j) => (
                      <div key={`${it.key}-${j}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 9px', fontSize: 11, borderBottom: j < ps.items.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                        <span style={{ color: colors.textMuted }}>{it.key}</span>
                        <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
