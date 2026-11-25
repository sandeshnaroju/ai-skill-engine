import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Box,
  Layers,
  RotateCcw,
  Sun,
  Moon,
  Scissors,
  Download,
  Compass,
  X
} from 'lucide-react';
import { parse3dModelAsync } from './cad3dParser';
import Cad3dTreePanel from './cad3dTreePanel';

export default function Cad3DViewer({ fullContent, artifact, filename = 'model.step', theme: propTheme }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRootRef = useRef(null);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 100000));
  const originalMaterialsRef = useRef(new Map());

  const [theme, setTheme] = useState(() => {
    if (propTheme) return propTheme;
    const docTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_theme') : null;
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    if (propTheme && propTheme !== theme) setTheme(propTheme);
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
    result: null
  });

  const [parts, setParts] = useState([]);
  const [hiddenPartIds, setHiddenPartIds] = useState(new Set());
  const [selectedPart, setSelectedPart] = useState(null);
  const [showTreePanel, setShowTreePanel] = useState(false);

  const [shadingMode, setShadingMode] = useState('shaded'); // 'shaded' | 'wireframe' | 'xray' | 'edges'
  const [enableClipping, setEnableClipping] = useState(false);
  const [clipAxis, setClipAxis] = useState('y');
  const [clipValue, setClipValue] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [stats, setStats] = useState({
    vertices: 0,
    triangles: 0,
    format: '3D CAD',
    bounds: { x: 0, y: 0, z: 0 },
    radius: 60
  });

  // Camera Orbit State
  const isOrbitingRef = useRef(false);
  const isPanningRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const previousMousePosRef = useRef({ x: 0, y: 0 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const sphericalRef = useRef({ radius: 120, theta: Math.PI / 4, phi: Math.PI / 3 });

  const updateCameraPosition = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const { radius, theta, phi } = sphericalRef.current;
    const target = cameraTargetRef.current;

    const sinPhi = Math.sin(phi);
    cam.position.x = target.x + radius * sinPhi * Math.sin(theta);
    cam.position.y = target.y + radius * Math.cos(phi);
    cam.position.z = target.z + radius * sinPhi * Math.cos(theta);
    cam.lookAt(target);
  }, []);

  // ── 1. Non-blocking Async 3D Model Parsing ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setParseState({
      isParsing: Boolean(fullContent && fullContent.length > 250000),
      percent: 5,
      stage: 'Reading 3D Stream',
      count: 0,
      result: null
    });

    parse3dModelAsync(fullContent, filename, (prog) => {
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
            count: res.totalTriangles,
            result: res
          });
          setParts(res.parts || []);
          setHiddenPartIds(new Set());
          setSelectedPart(null);
        }
      })
      .catch((err) => {
        console.error('3D CAD Parse Error:', err);
        if (!cancelled) {
          setParseState({
            isParsing: false,
            percent: 100,
            stage: 'Error',
            count: 0,
            result: null
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fullContent, filename]);

  // ── 2. Three.js WebGL Scene Setup ───────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
    cameraRef.current = camera;
    updateCameraPosition();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Three-point CAD studio lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(1, 1.5, 1.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fillLight.position.set(-1, -0.5, -1);
    scene.add(fillLight);

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
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [updateCameraPosition]);

  // ── 3. Mount Parsed 3D Model + Dynamic Camera Bounds ────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const res = parseState.result;
    if (!scene || !res || !res.rootGroup) return;

    // Remove previous model root & grid
    const prevModel = scene.getObjectByName('__CAD_MODEL_ROOT__');
    if (prevModel) {
      prevModel.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      scene.remove(prevModel);
    }
    const prevGrid = scene.getObjectByName('__CAD_GRID__');
    if (prevGrid) scene.remove(prevGrid);

    const modelRoot = res.rootGroup;
    modelRoot.name = '__CAD_MODEL_ROOT__';
    modelRootRef.current = modelRoot;
    originalMaterialsRef.current.clear();

    // Compute world bounding box
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
      // Center model at origin for smooth orbit
      modelRoot.position.sub(center);
    } else {
      size.set(40, 40, 40);
    }

    const maxDim = Math.max(size.x, size.y, size.z, 10);
    const radius = maxDim * 1.45;

    // Dynamic camera frustum (prevents clipping on millimeter-scale buildings)
    if (cameraRef.current) {
      cameraRef.current.near = Math.max(0.01, maxDim * 0.001);
      cameraRef.current.far = Math.max(5000, maxDim * 50);
      cameraRef.current.updateProjectionMatrix();
    }

    // Store original materials & attach clipping plane
    modelRoot.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        originalMaterialsRef.current.set(obj.uuid, obj.material.clone());
        obj.material.clippingPlanes = enableClipping ? [clippingPlaneRef.current] : [];
      }
    });

    scene.add(modelRoot);

    if (showGrid) {
      const gridSize = Math.pow(10, Math.ceil(Math.log10(maxDim * 2)));
      const gridHelper = new THREE.GridHelper(
        gridSize,
        20,
        isDark ? 0x334155 : 0xcbd5e1,
        isDark ? 0x1e293b : 0xe2e8f0
      );
      gridHelper.name = '__CAD_GRID__';
      gridHelper.position.y = -size.y / 2;
      scene.add(gridHelper);
    }

    cameraTargetRef.current.set(0, 0, 0);
    sphericalRef.current = { radius, theta: Math.PI / 4, phi: Math.PI / 3 };
    updateCameraPosition();

    setStats({
      vertices: res.totalVertices || 0,
      triangles: res.totalTriangles || 0,
      format: res.format || '3D CAD',
      bounds: {
        x: size.x.toFixed(1),
        y: size.y.toFixed(1),
        z: size.z.toFixed(1)
      },
      radius
    });
  }, [parseState.result, showGrid, isDark, updateCameraPosition]);

  // ── 4. Apply Shading Modes, Selection Highlight & Clipping Plane ────────────
  useEffect(() => {
    const modelRoot = modelRootRef.current;
    if (!modelRoot) return;

    const plane = clippingPlaneRef.current;
    const nx = clipAxis === 'x' ? -1 : 0;
    const ny = clipAxis === 'y' ? -1 : 0;
    const nz = clipAxis === 'z' ? -1 : 0;
    plane.normal.set(nx, ny, nz);
    plane.constant = clipValue * (stats.radius / 100);

    modelRoot.traverse((obj) => {
      if (!obj.isMesh) return;

      // Remove any old edge helper
      const oldEdge = obj.getObjectByName('__EDGE_OVERLAY__');
      if (oldEdge) {
        oldEdge.geometry.dispose();
        oldEdge.material.dispose();
        obj.remove(oldEdge);
      }

      const origMat = originalMaterialsRef.current.get(obj.uuid);
      if (origMat) {
        obj.material = origMat.clone();
      }

      const isSelected = selectedPart && obj.userData.partId === selectedPart.id;
      if (isSelected) {
        obj.material.emissive = new THREE.Color(0xf59e0b);
        obj.material.emissiveIntensity = 0.45;
      }

      if (shadingMode === 'wireframe') {
        obj.material.wireframe = true;
      } else if (shadingMode === 'xray') {
        obj.material.transparent = true;
        obj.material.opacity = 0.32;
        obj.material.depthWrite = false;
      } else if (shadingMode === 'edges') {
        // Safe triangle threshold: avoid EdgesGeometry hang on 20MB+ meshes (>120k tris)
        if (stats.triangles <= 120000) {
          const edgesGeo = new THREE.EdgesGeometry(obj.geometry, 25);
          const edgesMat = new THREE.LineBasicMaterial({
            color: isDark ? 0x38bdf8 : 0x0f172a,
            transparent: true,
            opacity: 0.7
          });
          const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
          edgeLines.name = '__EDGE_OVERLAY__';
          obj.add(edgeLines);
        } else {
          obj.material.wireframe = true;
        }
      }

      obj.material.clippingPlanes = enableClipping ? [plane] : [];
      obj.material.needsUpdate = true;
    });
  }, [shadingMode, enableClipping, clipAxis, clipValue, selectedPart, stats.triangles, stats.radius, isDark]);

  // ── 5. Orbit, Pan, Zoom & Raycast Part Selection ────────────────────────────
  const handleMouseDown = (e) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };
    if (e.button === 0 && !e.shiftKey) isOrbitingRef.current = true;
    else isPanningRef.current = true;
  };

  const handleMouseMove = (e) => {
    if (!isOrbitingRef.current && !isPanningRef.current) return;
    const dx = e.clientX - previousMousePosRef.current.x;
    const dy = e.clientY - previousMousePosRef.current.y;
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isOrbitingRef.current) {
      sphericalRef.current.theta -= dx * 0.008;
      sphericalRef.current.phi = Math.max(0.08, Math.min(Math.PI - 0.08, sphericalRef.current.phi - dy * 0.008));
      updateCameraPosition();
    } else if (isPanningRef.current && cameraRef.current) {
      const panSpeed = sphericalRef.current.radius * 0.0012;
      const cam = cameraRef.current;
      const forward = new THREE.Vector3();
      cam.getWorldDirection(forward);
      const right = new THREE.Vector3().crossVectors(forward, cam.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();

      cameraTargetRef.current.addScaledVector(right, -dx * panSpeed);
      cameraTargetRef.current.addScaledVector(up, dy * panSpeed);
      updateCameraPosition();
    }
  };

  const handleMouseUp = (e) => {
    const moved = Math.hypot(e.clientX - mouseDownPosRef.current.x, e.clientY - mouseDownPosRef.current.y);
    isOrbitingRef.current = false;
    isPanningRef.current = false;

    // Click-to-select part via Raycaster
    if (moved < 4 && e.button === 0 && mountRef.current && cameraRef.current && modelRootRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      const hits = raycaster.intersectObjects(modelRootRef.current.children, true);
      const hitMesh = hits.find((h) => h.object.isMesh && h.object.visible);
      if (hitMesh) {
        const part = parts.find((p) => p.id === hitMesh.object.userData.partId);
        if (part) setSelectedPart(part);
      } else {
        setSelectedPart(null);
      }
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.88 : 1.14;
    sphericalRef.current.radius = Math.max(stats.radius * 0.05, sphericalRef.current.radius * factor);
    updateCameraPosition();
  };

  const setPresetView = (preset) => {
    const r = stats.radius || 100;
    cameraTargetRef.current.set(0, 0, 0);
    if (preset === 'iso') sphericalRef.current = { radius: r, theta: Math.PI / 4, phi: Math.PI / 3 };
    else if (preset === 'top') sphericalRef.current = { radius: r, theta: 0, phi: 0.05 };
    else if (preset === 'front') sphericalRef.current = { radius: r, theta: 0, phi: Math.PI / 2 };
    else if (preset === 'right') sphericalRef.current = { radius: r, theta: Math.PI / 2, phi: Math.PI / 2 };
    updateCameraPosition();
  };

  const handleTogglePart = (partId) => {
    setHiddenPartIds((prev) => {
      const next = new Set(prev);
      const hide = !next.has(partId);
      if (hide) next.add(partId);
      else next.delete(partId);

      const part = parts.find((p) => p.id === partId);
      if (part && part.mesh) part.mesh.visible = !hide;
      return next;
    });
  };

  const handleIsolatePart = (partId) => {
    const nextHidden = new Set();
    parts.forEach((p) => {
      const hide = p.id !== partId;
      if (hide) nextHidden.add(p.id);
      if (p.mesh) p.mesh.visible = !hide;
    });
    setHiddenPartIds(nextHidden);
  };

  const handleShowAllParts = () => {
    setHiddenPartIds(new Set());
    parts.forEach((p) => {
      if (p.mesh) p.mesh.visible = true;
    });
  };

  const handleExportPng = () => {
    if (!rendererRef.current) return;
    const link = document.createElement('a');
    link.download = `${filename.replace(/\.[^/.]+$/, '')}_3d_render.png`;
    link.href = rendererRef.current.domElement.toDataURL('image/png');
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
        backgroundColor: isDark ? '#090d14' : '#f1f5f9',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      {/* ── Top CAD Viewport Toolbar ── */}
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
              background: isDark ? 'rgba(168, 85, 247, 0.14)' : 'rgba(147, 51, 234, 0.1)',
              color: isDark ? '#c084fc' : '#7e22ce',
              fontSize: '0.78rem',
              fontWeight: 650
            }}
          >
            <Box size={14} /> 3D CAD / BIM
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.88 }}>{filename}</span>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '4px',
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              opacity: 0.75
            }}
          >
            {stats.format} • {stats.triangles.toLocaleString()} tris
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Assembly Tree Toggle */}
          <button
            onClick={() => setShowTreePanel(!showTreePanel)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: showTreePanel ? '1px solid #38bdf8' : isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              background: showTreePanel ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              color: 'inherit',
              fontSize: '0.76rem',
              fontWeight: 550,
              cursor: 'pointer'
            }}
          >
            <Layers size={13} /> Parts ({parts.length})
          </button>

          {/* View Presets */}
          <div style={{ display: 'flex', gap: '2px', background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)', padding: '2px', borderRadius: '6px' }}>
            {['iso', 'top', 'front', 'right'].map((v) => (
              <button
                key={v}
                onClick={() => setPresetView(v)}
                style={{
                  padding: '4px 7px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: 'none',
                  borderRadius: '4px',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer'
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Shading Modes */}
          <div style={{ display: 'flex', gap: '2px', background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)', padding: '2px', borderRadius: '6px' }}>
            {[
              { id: 'shaded', label: 'Shaded' },
              { id: 'edges', label: 'Edges' },
              { id: 'wireframe', label: 'Wire' },
              { id: 'xray', label: 'X-Ray' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setShadingMode(m.id)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  background: shadingMode === m.id ? '#38bdf8' : 'transparent',
                  color: shadingMode === m.id ? '#0f172a' : 'inherit',
                  cursor: 'pointer'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setEnableClipping(!enableClipping)}
            title="Section Clipping Plane"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              borderRadius: '6px',
              border: enableClipping ? '1px solid #f59e0b' : isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              background: enableClipping ? 'rgba(245, 158, 11, 0.18)' : 'transparent',
              color: enableClipping ? '#f59e0b' : 'inherit',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Scissors size={13} /> Section
          </button>

          <button onClick={() => setPresetView('iso')} title="Reset View" style={{ padding: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
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
            style={{ padding: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button onClick={handleExportPng} title="Export Render PNG" style={{ padding: '6px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* ── Main 3D Viewport ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <div
          ref={mountRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          style={{ width: '100%', height: '100%', cursor: 'grab' }}
        />

        {/* Streaming Progress Overlay for 20MB+ Models */}
        {parseState.isParsing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isDark ? 'rgba(9, 13, 20, 0.86)' : 'rgba(241, 245, 249, 0.86)',
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
                <Compass size={22} color="#c084fc" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Loading 3D CAD / BIM Model</div>
                  <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {filename} ({parseState.count.toLocaleString()} items)
                  </div>
                </div>
              </div>
              <div style={{ height: '8px', width: '100%', background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ height: '100%', width: `${parseState.percent}%`, background: 'linear-gradient(90deg, #a855f7 0%, #38bdf8 100%)', transition: 'width 0.15s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                <span>{parseState.stage || 'Parsing...'}</span>
                <span style={{ fontWeight: 700, color: '#c084fc' }}>{parseState.percent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Assembly Tree Sidebar */}
        {showTreePanel && (
          <Cad3dTreePanel
            parts={parts}
            hiddenPartIds={hiddenPartIds}
            selectedPartId={selectedPart?.id}
            onTogglePart={handleTogglePart}
            onIsolatePart={handleIsolatePart}
            onShowAll={handleShowAllParts}
            onSelectPart={(p) => setSelectedPart(p)}
            onClose={() => setShowTreePanel(false)}
            isDark={isDark}
          />
        )}

        {/* Selected Component Inspector Card */}
        {selectedPart && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '240px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(14px)',
              border: isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(245, 158, 11, 0.5)',
              boxShadow: '0 10px 24px rgba(0,0,0,0.3)',
              zIndex: 25,
              fontSize: '0.78rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                Selected Component
              </span>
              <button onClick={() => setSelectedPart(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ fontWeight: 650, marginBottom: '4px', wordBreak: 'break-word' }}>{selectedPart.name}</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.7, marginBottom: '10px' }}>
              Triangles: {selectedPart.triangles.toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => handleIsolatePart(selectedPart.id)}
                style={{ flex: 1, padding: '5px', borderRadius: '5px', border: 'none', background: '#38bdf8', color: '#0f172a', fontWeight: 650, fontSize: '0.72rem', cursor: 'pointer' }}
              >
                Isolate
              </button>
              <button
                onClick={() => handleTogglePart(selectedPart.id)}
                style={{ flex: 1, padding: '5px', borderRadius: '5px', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', background: 'transparent', color: 'inherit', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer' }}
              >
                Hide
              </button>
            </div>
          </div>
        )}

        {/* Section Clipping Controls */}
        {enableClipping && (
          <div
            style={{
              position: 'absolute',
              bottom: '48px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 16px',
              borderRadius: '10px',
              background: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 25,
              fontSize: '0.76rem'
            }}
          >
            <span style={{ fontWeight: 650, color: '#f59e0b' }}>Section Axis:</span>
            {['x', 'y', 'z'].map((ax) => (
              <button
                key={ax}
                onClick={() => setClipAxis(ax)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  background: clipAxis === ax ? '#f59e0b' : 'transparent',
                  color: clipAxis === ax ? '#0f172a' : 'inherit',
                  cursor: 'pointer'
                }}
              >
                {ax}
              </button>
            ))}
            <input
              type="range"
              min="-60"
              max="60"
              value={clipValue}
              onChange={(e) => setClipValue(Number(e.target.value))}
              style={{ width: '140px' }}
            />
          </div>
        )}

        {/* Bottom Floating Stats Pill */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
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
          Bounds: {stats.bounds.x} × {stats.bounds.y} × {stats.bounds.z} • Left-Drag Orbit • Shift+Drag Pan • Click Part Inspect
        </div>
      </div>
    </div>
  );
}
