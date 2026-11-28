import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  RotateCcw,
  Sun,
  Moon,
  Download,
  Ruler,
  Layers,
  AlertTriangle,
  Scissors,
  Camera,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import {
  loadPointCloudData,
  buildPointCloudColors,
  getAsprsClassInfo,
  exportPointCloudStatsCsv,
} from './pointCloudParser';

export default function PointCloudViewer({ fullContent, artifact, filename = 'scan.ply', theme: propTheme }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pointsRef = useRef(null);
  const clipPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6));
  const measureGroupRef = useRef(null);

  const [localTheme, setLocalTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setLocalTheme(propTheme);
  }, [propTheme]);
  const isDark = localTheme !== 'light';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pcData, setPcData] = useState(null);

  const [colorMode, setColorMode] = useState('elevation');
  const [pointSize, setPointSize] = useState(2.2);
  const [clipPct, setClipPct] = useState(100);
  const [showSidebar, setShowSidebar] = useState(true);
  const [hiddenClasses, setHiddenClasses] = useState(() => new Set());

  const [measureMode, setMeasureMode] = useState(false);
  const [measurePts, setMeasurePts] = useState([]);

  const mediaUrl = artifact?.media_url || '';

  // Load point cloud
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadPointCloudData({ fullContent, mediaUrl, filename })
      .then((data) => {
        if (cancelled) return;
        setPcData(data);
        if (data.hasColor) setColorMode('rgb');
        else setColorMode('elevation');
        if (data.count < 500) setPointSize(8);
        else if (data.count < 5000) setPointSize(5);
        else if (data.count < 50000) setPointSize(3);
        else setPointSize(2);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load point cloud.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fullContent, mediaUrl, filename]);

  const colorOptions = useMemo(() => {
    const opts = [
      { value: 'elevation', label: 'Elevation Ramp' },
    ];
    if (pcData?.hasColor) opts.unshift({ value: 'rgb', label: 'RGB True Color' });
    if (pcData?.intensities) opts.push({ value: 'intensity', label: 'LiDAR Intensity' });
    if (pcData?.classifications) opts.push({ value: 'classification', label: 'ASPRS Classification' });
    return opts;
  }, [pcData]);

  // Initialize Three.js scene when pcData is ready
  useEffect(() => {
    const container = mountRef.current;
    if (!container || !pcData || pcData.count === 0) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#070b12' : '#f1f5f9');
    sceneRef.current = scene;

    const r = pcData.centeredBounds.radius;
    const camera = new THREE.PerspectiveCamera(50, width / height, Math.max(0.01, r * 0.002), r * 50);
    camera.position.set(r * 1.4, r * 1.1, r * 1.4);
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

    // Grid helper
    const grid = new THREE.GridHelper(r * 2.2, 20, isDark ? 0x334155 : 0x94a3b8, isDark ? 0x1e293b : 0xcbd5e1);
    grid.position.y = pcData.centeredBounds.minY;
    scene.add(grid);

    // Point cloud geometry
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pcData.positions, 3));
    const initialColors = buildPointCloudColors(pcData, colorMode, hiddenClasses);
    geom.setAttribute('color', new THREE.BufferAttribute(initialColors, 3));

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: false,
      vertexColors: true,
      clippingPlanes: [clipPlaneRef.current],
    });

    const pts = new THREE.Points(geom, mat);
    scene.add(pts);
    pointsRef.current = pts;

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
      geom.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [pcData]);

  // Update background theme
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(isDark ? '#070b12' : '#f1f5f9');
    }
  }, [isDark]);

  // Update vertex colors when colorMode or hiddenClasses change
  useEffect(() => {
    if (!pointsRef.current || !pcData) return;
    const colAttr = pointsRef.current.geometry.getAttribute('color');
    if (!colAttr) return;
    const next = buildPointCloudColors(pcData, colorMode, hiddenClasses);
    colAttr.array.set(next);
    colAttr.needsUpdate = true;
  }, [colorMode, hiddenClasses, pcData]);

  // Update point size
  useEffect(() => {
    if (pointsRef.current?.material) {
      pointsRef.current.material.size = pointSize;
    }
  }, [pointSize]);

  // Update Z-slice clipping plane
  useEffect(() => {
    if (!pcData) return;
    const { minY, maxY } = pcData.centeredBounds;
    const cutoff = minY + ((maxY - minY) * clipPct) / 100 + 0.05;
    clipPlaneRef.current.constant = cutoff;
  }, [clipPct, pcData]);

  // Draw measurement line
  useEffect(() => {
    const grp = measureGroupRef.current;
    if (!grp) return;
    while (grp.children.length) grp.remove(grp.children[0]);
    if (measurePts.length === 0) return;

    const r = pcData?.centeredBounds?.radius || 10;
    const sphereGeom = new THREE.SphereGeometry(r * 0.012, 12, 12);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    for (const p of measurePts) {
      const m = new THREE.Mesh(sphereGeom, sphereMat);
      m.position.copy(p);
      grp.add(m);
    }

    if (measurePts.length === 2) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints(measurePts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15 });
      grp.add(new THREE.Line(lineGeom, lineMat));
    }
  }, [measurePts, pcData]);

  const handleCanvasClick = useCallback(
    (e) => {
      if (!measureMode || !pointsRef.current || !cameraRef.current || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      const r = pcData?.centeredBounds?.radius || 10;
      raycaster.params.Points.threshold = Math.max(0.05, r * 0.02);
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObject(pointsRef.current);
      if (hits.length > 0) {
        const pt = hits[0].point.clone();
        setMeasurePts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
      }
    },
    [measureMode, pcData]
  );

  const setCameraPreset = (preset) => {
    if (!cameraRef.current || !controlsRef.current || !pcData) return;
    const r = pcData.centeredBounds.radius;
    const cam = cameraRef.current;
    if (preset === 'TOP') cam.position.set(0, r * 2.1, 0.001);
    else if (preset === 'FRONT') cam.position.set(0, 0, r * 2.1);
    else if (preset === 'RIGHT') cam.position.set(r * 2.1, 0, 0);
    else cam.position.set(r * 1.4, r * 1.1, r * 1.4);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleSnapshot = () => {
    if (!rendererRef.current) return;
    const url = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.(ply|las|laz)$/i, '')}_snapshot.png`;
    a.click();
  };

  const toggleClassVisibility = (clsId) => {
    setHiddenClasses((prev) => {
      const next = new Set(prev);
      if (next.has(clsId)) next.delete(clsId);
      else next.add(clsId);
      return next;
    });
  };

  const measureDistance = useMemo(() => {
    if (measurePts.length !== 2) return null;
    return measurePts[0].distanceTo(measurePts[1]);
  }, [measurePts]);

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
        Loading point cloud...
      </div>
    );
  }

  if (error || !pcData) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.text, padding: 24 }}>
        <div style={{ maxWidth: 460, padding: 24, borderRadius: 12, background: colors.surface, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unable to Load Point Cloud</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{error || 'No point data found.'}</div>
        </div>
      </div>
    );
  }

  const dx = (pcData.bounds.maxX - pcData.bounds.minX).toFixed(2);
  const dy = (pcData.bounds.maxY - pcData.bounds.minY).toFixed(2);
  const dz = (pcData.bounds.maxZ - pcData.bounds.minZ).toFixed(2);
  const classEntries = Object.entries(pcData.classificationCounts || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.bg, color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Toolbar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{pcData.filename || filename}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: colors.accentSoft, color: colors.accent }}>
              {(pcData.sourceExt || '').toUpperCase().replace('.', '') || 'POINT CLOUD'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {pcData.count.toLocaleString()} rendered / {(pcData.totalPoints || pcData.count).toLocaleString()} total pts · Extent: {dx} × {dy} × {dz}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ModernSelect value={colorMode} onChange={setColorMode} options={colorOptions} isDark={isDark} />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textMuted }}>
            Pt Size ({pointSize}px)
            <input type="range" min="1" max="14" step="0.5" value={pointSize} onChange={(e) => setPointSize(Number(e.target.value))} style={{ width: 65 }} />
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textMuted }}>
            <Scissors size={12} /> Z-Clip
            <input type="range" min="5" max="100" step="1" value={clipPct} onChange={(e) => setClipPct(Number(e.target.value))} style={{ width: 65 }} />
          </label>

          {['ISO', 'TOP', 'FRONT', 'RIGHT'].map((p) => (
            <button
              key={p}
              onClick={() => setCameraPreset(p)}
              style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}
            >
              {p}
            </button>
          ))}

          <button
            onClick={() => {
              setMeasureMode((m) => !m);
              setMeasurePts([]);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 9px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${measureMode ? '#facc15' : colors.border}`,
              background: measureMode ? 'rgba(250, 204, 21, 0.16)' : colors.surfaceAlt,
              color: measureMode ? '#facc15' : colors.text,
              cursor: 'pointer',
            }}
          >
            <Ruler size={12} /> Measure
          </button>

          <button
            onClick={() => setShowSidebar((s) => !s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 9px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${showSidebar ? colors.accent : colors.border}`,
              background: showSidebar ? colors.accentSoft : colors.surfaceAlt,
              color: showSidebar ? colors.accent : colors.text,
              cursor: 'pointer',
            }}
          >
            <Layers size={12} /> Classes
          </button>

          <button onClick={() => exportPointCloudStatsCsv(pcData)} title="Export Summary CSV" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
            <Download size={12} /> CSV
          </button>
          <button onClick={handleSnapshot} title="Export PNG Snapshot" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
            <Camera size={12} /> PNG
          </button>
          <button onClick={() => setCameraPreset('ISO')} title="Reset View" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={13} />
          </button>
          <button onClick={() => setLocalTheme(isDark ? 'light' : 'dark')} title="Toggle Theme" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* 3D Viewport + Classification Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
          <div
            ref={mountRef}
            onClick={handleCanvasClick}
            style={{ width: '100%', height: '100%', cursor: measureMode ? 'crosshair' : 'grab' }}
          />
          {measureMode && (
            <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '6px 11px', borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11.5 }}>
              {measureDistance != null
                ? `Distance: ${measureDistance.toFixed(3)} units`
                : measurePts.length === 1
                ? 'Click second point to measure distance'
                : 'Click first point on the cloud'}
            </div>
          )}
        </div>

        {showSidebar && (
          <aside style={{ width: 280, minWidth: 230, borderLeft: `1px solid ${colors.border}`, background: colors.surface, overflowY: 'auto', minHeight: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Scan Bounds</div>
              <div style={{ fontSize: 11, color: colors.textMuted, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span>X: {pcData.bounds.minX.toFixed(2)} .. {pcData.bounds.maxX.toFixed(2)}</span>
                <span>Y: {pcData.bounds.minY.toFixed(2)} .. {pcData.bounds.maxY.toFixed(2)}</span>
                <span>Z: {pcData.bounds.minZ.toFixed(2)} .. {pcData.bounds.maxZ.toFixed(2)}</span>
                {pcData.lasVersion && <span>LAS v{pcData.lasVersion} (Fmt {pcData.pointFormat})</span>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                ASPRS Classifications ({classEntries.length})
              </div>
              {classEntries.length === 0 ? (
                <div style={{ fontSize: 11.5, color: colors.textMuted }}>
                  No ASPRS classification codes in this file.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {classEntries.map(([clsKey, cnt]) => {
                    const clsId = Number(clsKey);
                    const info = getAsprsClassInfo(clsId);
                    const isHidden = hiddenClasses.has(clsId);
                    const pct = pcData.count ? ((cnt / pcData.count) * 100).toFixed(1) : '0.0';
                    return (
                      <label
                        key={clsKey}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 6,
                          background: colors.surfaceAlt,
                          border: `1px solid ${colors.border}`,
                          fontSize: 11,
                          opacity: isHidden ? 0.5 : 1,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => toggleClassVisibility(clsId)}
                          />
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: info.hex }} />
                          <span>{info.name}</span>
                        </span>
                        <span style={{ color: colors.textMuted, fontWeight: 600 }}>{pct}%</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
