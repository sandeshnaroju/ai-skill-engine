import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  RotateCcw,
  Sun,
  Moon,
  Ruler,
  ClipboardList,
  Camera,
  AlertTriangle,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import { parseLandXml, estimateCutFill } from './landxmlParser';
import LandXmlSchedulePanel from './landxmlSchedulePanel';

function elevColor(t) {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) return [0.15, 0.35 + (c / 0.25) * 0.55, 0.9];
  if (c < 0.5) return [0.15, 0.9, 0.9 - ((c - 0.25) / 0.25) * 0.7];
  if (c < 0.75) return [0.15 + ((c - 0.5) / 0.25) * 0.8, 0.9, 0.2];
  return [0.95, 0.9 - ((c - 0.75) / 0.25) * 0.7, 0.1];
}

function slopeColor(slopePct) {
  if (slopePct < 2) return [0.13, 0.77, 0.37];
  if (slopePct < 8) return [0.52, 0.8, 0.09];
  if (slopePct < 20) return [0.96, 0.62, 0.04];
  if (slopePct < 45) return [0.98, 0.45, 0.09];
  return [0.94, 0.27, 0.27];
}

export default function LandXmlViewer({ fullContent, filename = 'site.xml', theme: propTheme }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const worldGroupRef = useRef(null);
  const measureGroupRef = useRef(null);

  const [localTheme, setLocalTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setLocalTheme(propTheme);
  }, [propTheme]);
  const isDark = localTheme !== 'light';

  const model = useMemo(() => parseLandXml(fullContent), [fullContent]);
  const baseName = (filename || 'landxml').replace(/\.(landxml|xml)$/i, '');

  const [colorMode, setColorMode] = useState('elevation');
  const [vertExag, setVertExag] = useState(1.5);
  const [showSchedule, setShowSchedule] = useState(true);
  const [layers, setLayers] = useState({
    surfaces: true,
    wireframe: false,
    alignments: true,
    pipes: true,
    parcels: true,
    points: true,
  });

  const [baseSurfIdx, setBaseSurfIdx] = useState(0);
  const [compSurfIdx, setCompSurfIdx] = useState(1);

  const [measureMode, setMeasureMode] = useState(false);
  const [measurePts, setMeasurePts] = useState([]);

  const cutFill = useMemo(() => {
    if (model.surfaces.length < 2) return null;
    const b = model.surfaces[baseSurfIdx] || model.surfaces[0];
    const c = model.surfaces[compSurfIdx] || model.surfaces[1];
    return estimateCutFill(b, c, 40);
  }, [model.surfaces, baseSurfIdx, compSurfIdx]);

  const colorOptions = useMemo(() => {
    const opts = [
      { value: 'elevation', label: 'Elevation Ramp' },
      { value: 'slope', label: 'Slope / Grade (%)' },
    ];
    if (model.surfaces.length >= 2) {
      opts.push({ value: 'cutfill', label: 'Cut / Fill Delta' });
    }
    return opts;
  }, [model.surfaces.length]);

  const centerParams = useMemo(() => {
    const b = model.bounds;
    const ce = (b.minE + b.maxE) / 2;
    const cn = (b.minN + b.maxN) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const de = b.maxE - b.minE;
    const dn = b.maxN - b.minN;
    const dz = Math.max(1, b.maxZ - b.minZ);
    const radius = Math.max(10, Math.sqrt(de * de + dn * dn + dz * dz) * 0.6);
    return { ce, cn, cz, dz, radius };
  }, [model.bounds]);

  // Build Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container || model.error) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#070b12' : '#f1f5f9');
    sceneRef.current = scene;

    const r = centerParams.radius;
    const camera = new THREE.PerspectiveCamera(48, width / height, Math.max(0.05, r * 0.002), r * 50);
    camera.position.set(r * 1.25, r * 0.95, r * 1.25);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(r, r * 1.8, r * 0.8);
    scene.add(dir);

    const grid = new THREE.GridHelper(r * 2.2, 20, isDark ? 0x334155 : 0x94a3b8, isDark ? 0x1e293b : 0xcbd5e1);
    grid.position.y = (model.bounds.minZ - centerParams.cz) * vertExag;
    scene.add(grid);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);
    worldGroupRef.current = worldGroup;

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

  // Populate civil geometry into worldGroup
  useEffect(() => {
    const grp = worldGroupRef.current;
    if (!grp || model.error) return;
    while (grp.children.length) {
      const ch = grp.children[0];
      grp.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) ch.material.dispose();
    }

    const { ce, cn, cz, radius } = centerParams;
    const toVec = (e, n, z) => new THREE.Vector3(e - ce, (z - cz) * vertExag, -(n - cn));

    // 1. TIN Surfaces
    if (layers.surfaces) {
      model.surfaces.forEach((surf, sIdx) => {
        if (!surf.triangles.length) return;
        const pos = new Float32Array(surf.triangles.length * 9);
        const col = new Float32Array(surf.triangles.length * 9);
        const spanZ = Math.max(0.01, model.bounds.maxZ - model.bounds.minZ);

        surf.triangles.forEach((tri, tIdx) => {
          const pts = [tri.a, tri.b, tri.c];
          const sc = slopeColor(tri.slopePct);
          pts.forEach((p, k) => {
            const v = toVec(p.e, p.n, p.z);
            pos[tIdx * 9 + k * 3] = v.x;
            pos[tIdx * 9 + k * 3 + 1] = v.y;
            pos[tIdx * 9 + k * 3 + 2] = v.z;

            let rgb;
            if (colorMode === 'slope') {
              rgb = sc;
            } else if (colorMode === 'cutfill' && model.surfaces.length >= 2) {
              rgb = sIdx === compSurfIdx ? [0.23, 0.51, 0.96] : [0.64, 0.48, 0.28];
            } else {
              rgb = elevColor((p.z - model.bounds.minZ) / spanZ);
            }
            col[tIdx * 9 + k * 3] = rgb[0];
            col[tIdx * 9 + k * 3 + 1] = rgb[1];
            col[tIdx * 9 + k * 3 + 2] = rgb[2];
          });
        });

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geom.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          wireframe: layers.wireframe,
          transparent: colorMode === 'cutfill' && sIdx === compSurfIdx,
          opacity: colorMode === 'cutfill' && sIdx === compSurfIdx ? 0.72 : 1.0,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { kind: 'surface', name: surf.name };
        grp.add(mesh);
      });
    }

    // 2. Alignments (smooth curves + bold 3D tube + segment markers)
    if (layers.alignments) {
      model.alignments.forEach((al) => {
        const pathPts = [];
        al.segments.forEach((seg) => {
          const segPts = seg.points && seg.points.length >= 2 ? seg.points : [seg.start, seg.end];
          segPts.forEach((pt, idx) => {
            if (idx === 0 && pathPts.length > 0) return;
            pathPts.push(toVec(pt.e, pt.n, pt.z || model.bounds.maxZ));
          });
        });
        if (pathPts.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(pathPts, false, 'centripetal', 0.1);
          const tubeGeom = new THREE.TubeGeometry(curve, Math.max(32, pathPts.length * 2), radius * 0.006, 8, false);
          const tubeMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
          grp.add(new THREE.Mesh(tubeGeom, tubeMat));

          const lineGeom = new THREE.BufferGeometry().setFromPoints(pathPts);
          const lineMat = new THREE.LineBasicMaterial({ color: 0xfef08a });
          grp.add(new THREE.Line(lineGeom, lineMat));
        }
      });
    }

    // 3. Pipe Networks
    if (layers.pipes) {
      model.pipeNetworks.forEach((net) => {
        net.structs.forEach((st) => {
          const h = Math.max(0.5, (st.elevRim - st.elevSump) || 2) * vertExag;
          const g = new THREE.CylinderGeometry(radius * 0.012, radius * 0.012, h, 12);
          const m = new THREE.MeshLambertMaterial({ color: 0x06b6d4 });
          const mesh = new THREE.Mesh(g, m);
          const p = toVec(st.e, st.n, (st.elevRim + st.elevSump) / 2 || model.bounds.minZ);
          mesh.position.copy(p);
          grp.add(mesh);
        });
        net.pipes.forEach((pipe) => {
          if (!pipe.startStruct || !pipe.endStruct) return;
          const p1 = toVec(pipe.startStruct.e, pipe.startStruct.n, pipe.startStruct.elevSump || model.bounds.minZ);
          const p2 = toVec(pipe.endStruct.e, pipe.endStruct.n, pipe.endStruct.elevSump || model.bounds.minZ);
          const g = new THREE.BufferGeometry().setFromPoints([p1, p2]);
          const m = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
          grp.add(new THREE.Line(g, m));
        });
      });
    }

    // 4. Parcels
    if (layers.parcels) {
      model.parcels.forEach((par) => {
        if (par.points.length < 2) return;
        const pts = par.points.map((p) => toVec(p.e, p.n, p.z || model.bounds.maxZ));
        pts.push(pts[0].clone());
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const m = new THREE.LineBasicMaterial({ color: 0xc084fc });
        grp.add(new THREE.Line(g, m));
      });
    }

    // 5. Survey Points
    if (layers.points && model.cgPoints.length) {
      const pos = new Float32Array(model.cgPoints.length * 3);
      model.cgPoints.forEach((pt, idx) => {
        const v = toVec(pt.e, pt.n, pt.z);
        pos[idx * 3] = v.x;
        pos[idx * 3 + 1] = v.y;
        pos[idx * 3 + 2] = v.z;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: 0x22c55e, size: 5, sizeAttenuation: false });
      grp.add(new THREE.Points(g, m));
    }
  }, [model, layers, colorMode, vertExag, centerParams, compSurfIdx]);

  // Measurement markers
  useEffect(() => {
    const grp = measureGroupRef.current;
    if (!grp) return;
    while (grp.children.length) grp.remove(grp.children[0]);
    if (!measurePts.length) return;
    const r = centerParams.radius;
    const sg = new THREE.SphereGeometry(r * 0.012, 12, 12);
    const sm = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    for (const p of measurePts) {
      const m = new THREE.Mesh(sg, sm);
      m.position.copy(p);
      grp.add(m);
    }
    if (measurePts.length === 2) {
      const lg = new THREE.BufferGeometry().setFromPoints(measurePts);
      const lm = new THREE.LineBasicMaterial({ color: 0xf43f5e });
      grp.add(new THREE.Line(lg, lm));
    }
  }, [measurePts, centerParams.radius]);

  const handleCanvasClick = useCallback(
    (e) => {
      if (!measureMode || !worldGroupRef.current || !cameraRef.current || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObjects(worldGroupRef.current.children, true);
      if (hits.length > 0) {
        const pt = hits[0].point.clone();
        setMeasurePts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
      }
    },
    [measureMode]
  );

  const setCameraPreset = (preset) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const r = centerParams.radius;
    const cam = cameraRef.current;
    if (preset === 'TOP') cam.position.set(0, r * 1.9, 0.001);
    else if (preset === 'FRONT') cam.position.set(0, 0, r * 1.9);
    else if (preset === 'RIGHT') cam.position.set(r * 1.9, 0, 0);
    else cam.position.set(r * 1.25, r * 0.95, r * 1.25);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleSnapshot = () => {
    if (!rendererRef.current) return;
    const url = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_terrain.png`;
    a.click();
  };

  const measureReadout = useMemo(() => {
    if (measurePts.length !== 2) return null;
    const a = measurePts[0];
    const b = measurePts[1];
    const horiz = Math.hypot(b.x - a.x, b.z - a.z);
    const dz = (b.y - a.y) / vertExag;
    const dist3d = Math.hypot(horiz, dz);
    const gradePct = horiz > 1e-4 ? (dz / horiz) * 100 : 0;
    return { dist3d, horiz, dz, gradePct };
  }, [measurePts, vertExag]);

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

  if (model.error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.text, padding: 24 }}>
        <div style={{ maxWidth: 460, padding: 24, borderRadius: 12, background: colors.surface, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unable to Parse LandXML</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{model.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.bg, color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Toolbar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{model.meta.project || baseName}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: colors.accentSoft, color: colors.accent }}>
              LandXML · {model.meta.units}
            </span>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {model.surfaces.length} Surfaces · {model.alignments.length} Alignments · {model.pipeNetworks.reduce((s, n) => s + n.pipes.length, 0)} Pipes · {model.cgPoints.length} Points
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ModernSelect value={colorMode} onChange={setColorMode} options={colorOptions} isDark={isDark} />

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textMuted }}>
            Z-Exag ({vertExag}×)
            <input type="range" min="1" max="5" step="0.5" value={vertExag} onChange={(e) => setVertExag(Number(e.target.value))} style={{ width: 65 }} />
          </label>

          {[
            { key: 'surfaces', label: 'TIN' },
            { key: 'wireframe', label: 'Wire' },
            { key: 'alignments', label: 'Align' },
            { key: 'pipes', label: 'Pipes' },
            { key: 'parcels', label: 'Parcels' },
            { key: 'points', label: 'Pts' },
          ].map((l) => (
            <button
              key={l.key}
              onClick={() => setLayers((prev) => ({ ...prev, [l.key]: !prev[l.key] }))}
              style={{
                padding: '4px 7px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${layers[l.key] ? colors.accent : colors.border}`,
                background: layers[l.key] ? colors.accentSoft : colors.surfaceAlt,
                color: layers[l.key] ? colors.accent : colors.textMuted,
                cursor: 'pointer',
              }}
            >
              {l.label}
            </button>
          ))}

          {['ISO', 'TOP', 'FRONT', 'RIGHT'].map((p) => (
            <button key={p} onClick={() => setCameraPreset(p)} style={{ padding: '4px 7px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
              {p}
            </button>
          ))}

          <button
            onClick={() => { setMeasureMode((m) => !m); setMeasurePts([]); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: `1px solid ${measureMode ? '#f43f5e' : colors.border}`,
              background: measureMode ? 'rgba(244, 63, 94, 0.16)' : colors.surfaceAlt,
              color: measureMode ? '#f43f5e' : colors.text, cursor: 'pointer',
            }}
          >
            <Ruler size={12} /> Grade
          </button>

          <button
            onClick={() => setShowSchedule((s) => !s)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: `1px solid ${showSchedule ? colors.accent : colors.border}`,
              background: showSchedule ? colors.accentSoft : colors.surfaceAlt,
              color: showSchedule ? colors.accent : colors.text, cursor: 'pointer',
            }}
          >
            <ClipboardList size={12} /> Schedules
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

      {/* 3D Viewport */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div
          ref={mountRef}
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', cursor: measureMode ? 'crosshair' : 'grab' }}
        />
        {measureMode && (
          <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '6px 11px', borderRadius: 8, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11.5 }}>
            {measureReadout
              ? `3D: ${measureReadout.dist3d.toFixed(2)} ${model.meta.linearUnit} · Horiz: ${measureReadout.horiz.toFixed(2)} · ΔZ: ${measureReadout.dz.toFixed(2)} · Grade: ${measureReadout.gradePct.toFixed(2)}%`
              : measurePts.length === 1
              ? 'Click second point to measure distance & grade %'
              : 'Click first point on terrain or pipe'}
          </div>
        )}
      </div>

      {/* Civil & Earthworks Schedule Drawer */}
      {showSchedule && (
        <LandXmlSchedulePanel
          model={model}
          cutFill={cutFill}
          baseSurfIdx={baseSurfIdx}
          compSurfIdx={compSurfIdx}
          onChangeBaseSurf={setBaseSurfIdx}
          onChangeCompSurf={setCompSurfIdx}
          onClose={() => setShowSchedule(false)}
          isDark={isDark}
          baseName={baseName}
        />
      )}
    </div>
  );
}
