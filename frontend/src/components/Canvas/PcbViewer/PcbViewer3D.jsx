import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Rotate3d,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Layers,
  Sparkles,
  Palette
} from 'lucide-react';
import { SOLDER_MASK_THEMES } from './constants';

/**
 * Creates high-resolution procedural canvas textures for top and bottom PCB solder mask surfaces.
 * Accurately renders copper pours, traces, gold/HASL pads, vias, and silkscreen markings.
 */
function generatePcbTexture(pcbData, maskTheme, isBottom = false, resolution = 2048) {
  const { board = {}, traces = [], vias = [], components = [], silkscreen = [], title } = pcbData;
  const boardWidth = board.width || 65;
  const boardHeight = board.height || 45;

  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = Math.round(resolution * (boardHeight / boardWidth));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const scale = canvas.width / boardWidth;
  const targetLayer = isBottom ? 'B.Cu' : 'F.Cu';
  const targetSilk = isBottom ? 'B.SilkS' : 'F.SilkS';

  // 1. Solder Mask Substrate Base
  ctx.fillStyle = maskTheme.mask;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle surface laminate weave texture
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
  for (let x = 0; x < canvas.width; x += 4) {
    ctx.fillRect(x, 0, 1, canvas.height);
  }

  // 2. Copper Pour / Ground Planes
  ctx.fillStyle = maskTheme.copper;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(scale * 1.0, scale * 1.0, canvas.width - scale * 2.0, canvas.height - scale * 2.0);
  ctx.globalAlpha = 1.0;

  // 3. Routed Copper Traces (Embedded under solder mask with realistic relief)
  traces
    .filter((t) => (isBottom ? t.layer === 'B.Cu' : t.layer !== 'B.Cu'))
    .forEach((t) => {
      const segs = t.segments || [];
      if (segs.length < 2) return;

      const strokeW = Math.max((t.width || 0.35) * scale, 2);

      // Darker relief shadow under trace
      ctx.beginPath();
      ctx.moveTo(segs[0][0] * scale, segs[0][1] * scale + 1.2);
      for (let i = 1; i < segs.length; i++) {
        ctx.lineTo(segs[i][0] * scale, segs[i][1] * scale + 1.2);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = strokeW + 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Copper trace core with solder mask tint
      ctx.beginPath();
      ctx.moveTo(segs[0][0] * scale, segs[0][1] * scale);
      for (let i = 1; i < segs.length; i++) {
        ctx.lineTo(segs[i][0] * scale, segs[i][1] * scale);
      }
      ctx.strokeStyle = isBottom ? '#2563eb' : '#dc2626';
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Specular highlight along trace center
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = Math.max(strokeW * 0.35, 1);
      ctx.stroke();
    });

  // 4. Plated Vias & Annular Copper Rings
  vias.forEach((v) => {
    const vx = v.x * scale;
    const vy = v.y * scale;
    const outerR = ((v.diameter || 0.6) / 2) * scale;
    const drillR = ((v.drill || 0.3) / 2) * scale;

    // Solder mask opening collar
    ctx.beginPath();
    ctx.arc(vx, vy, outerR + scale * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#e879f9';
    ctx.fill();

    // Gold/Copper annular ring
    ctx.beginPath();
    ctx.arc(vx, vy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center drill hole void
    ctx.beginPath();
    ctx.arc(vx, vy, drillR, 0, Math.PI * 2);
    ctx.fillStyle = '#060813';
    ctx.fill();
  });

  // 5. Component SMD / THT Pad Landings (Shiny ENIG Gold finish)
  components.forEach((c) => {
    (c.pads || []).forEach((p) => {
      const px = (p.x !== undefined ? p.x : c.position?.x || 0) * scale;
      const py = (p.y !== undefined ? p.y : c.position?.y || 0) * scale;
      const pw = (p.w || p.width || 1.2) * scale;
      const ph = (p.h || p.height || 1.2) * scale;

      // Solder mask expansion border
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(px - pw / 2 - 1.5, py - ph / 2 - 1.5, pw + 3, ph + 3);

      // Gold Pad
      const grad = ctx.createLinearGradient(px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.5, '#facc15');
      grad.addColorStop(1, '#ca8a04');
      ctx.fillStyle = grad;
      ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);

      // Pad outline
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph);

      // Through-hole drill hole if applicable
      if (p.type === 'tht' || p.hole || p.drill) {
        const hr = ((p.drill || 0.8) / 2) * scale;
        ctx.beginPath();
        ctx.arc(px, py, hr, 0, Math.PI * 2);
        ctx.fillStyle = '#090d16';
        ctx.fill();
      }
    });
  });

  // 6. Crisp Yellow / White Silkscreen Layer (Outlines, Designators & Text)
  ctx.strokeStyle = maskTheme.silk || '#fef08a';
  ctx.fillStyle = maskTheme.silk || '#fef08a';
  ctx.lineWidth = Math.max(scale * 0.15, 1.5);
  ctx.font = `bold ${Math.round(scale * 1.1)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Component Courtyards and Labels
  components.forEach((c) => {
    const cx = (c.position?.x || 0) * scale;
    const cy = (c.position?.y || 0) * scale;
    const ref = c.ref || '';

    // Draw reference designator
    ctx.fillText(ref, cx, cy - scale * 1.6);
  });

  // Board Title Silkscreen
  if (title) {
    ctx.font = `bold ${Math.round(scale * 1.8)}px monospace`;
    ctx.fillText(title, canvas.width / 2, canvas.height - scale * 3.0);
  }

  // Board Outlines Silkscreen
  (silkscreen || [])
    .filter((s) => (isBottom ? s.layer === 'B.SilkS' : s.layer !== 'B.SilkS'))
    .forEach((s) => {
      ctx.font = `bold ${Math.round(scale * (s.size || 1.0))}px monospace`;
      ctx.fillText(s.text || '', s.x * scale, s.y * scale);
    });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Creates dynamic 3D physical component models for real PCB rendering.
 */
function createComponent3D(c, boardWidth, boardHeight) {
  const group = new THREE.Group();
  const pkg = (c.package || '').toUpperCase();
  const ref = (c.ref || '').toUpperCase();
  const val = c.value || c.ref || '';

  // Calculate local coordinates on the board surface:
  // Center of board is (0, 0, 0), top surface is at Z = 0.8mm
  const x = (c.position?.x || 0) - boardWidth / 2;
  const y = -((c.position?.y || 0) - boardHeight / 2);
  const rotDeg = c.position?.rotation || 0;
  const rotRad = -(rotDeg * Math.PI) / 180;

  group.position.set(x, y, 0.8);
  group.rotation.z = rotRad;

  // Materials
  const blackEpoxyMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.65,
    metalness: 0.05
  });

  const metalSilverMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.95
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.95
  });

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.35,
    metalness: 0.9
  });

  // ── 0. Mounting Holes (Cut through) ──
  if (ref.startsWith('MH') || pkg.includes('MOUNT') || pkg.includes('HOLE')) {
    // Annular gold collar ring
    const ringGeo = new THREE.RingGeometry(1.5, 2.8, 32);
    const ringMesh = new THREE.Mesh(ringGeo, goldMat);
    ringMesh.position.z = 0.01;
    group.add(ringMesh);
    return group;
  }

  // ── 1. SMD Resistors (0805, 0603, 1206) ──
  if (pkg.includes('0805') || pkg.includes('0603') || pkg.includes('1206') || ref.startsWith('R')) {
    const isCap = ref.startsWith('C') || pkg.includes('CAP');
    const is0603 = pkg.includes('0603');
    const is1206 = pkg.includes('1206');
    const l = is1206 ? 3.2 : is0603 ? 1.6 : 2.0;
    const w = is1206 ? 1.6 : is0603 ? 0.8 : 1.25;
    const h = is1206 ? 0.7 : is0603 ? 0.45 : 0.6;
    const capW = is1206 ? 0.5 : is0603 ? 0.3 : 0.4;

    const bodyMat = isCap
      ? new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.45, metalness: 0.05 })
      : blackEpoxyMat;

    // Center body
    const bodyGeo = new THREE.BoxGeometry(l - capW * 2, w, h);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.z = h / 2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // End Terminals (Silver Metal Caps)
    const capGeo = new THREE.BoxGeometry(capW, w + 0.02, h + 0.02);
    const leftCap = new THREE.Mesh(capGeo, metalSilverMat);
    leftCap.position.set(-(l / 2 - capW / 2), 0, h / 2);
    leftCap.castShadow = true;
    group.add(leftCap);

    const rightCap = new THREE.Mesh(capGeo, metalSilverMat);
    rightCap.position.set(l / 2 - capW / 2, 0, h / 2);
    rightCap.castShadow = true;
    group.add(rightCap);

    return group;
  }

  // ── 2. Radial Aluminum Electrolytic Capacitors ──
  if (pkg.includes('RADIAL') || pkg.includes('ELECTRO') || ref.startsWith('EC') || ref.startsWith('C_RAD')) {
    const dia = 6.3;
    const height = 9.0;

    // Blue/Black PVC Can Body
    const canGeo = new THREE.CylinderGeometry(dia / 2, dia / 2, height - 0.6, 32);
    const canMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.35 });
    const canMesh = new THREE.Mesh(canGeo, canMat);
    canMesh.rotation.x = Math.PI / 2;
    canMesh.position.z = (height - 0.6) / 2 + 0.3;
    canMesh.castShadow = true;
    group.add(canMesh);

    // Silver Top Cap with Vent Lines
    const topGeo = new THREE.CylinderGeometry(dia / 2 - 0.05, dia / 2 - 0.05, 0.6, 32);
    const topMesh = new THREE.Mesh(topGeo, metalSilverMat);
    topMesh.rotation.x = Math.PI / 2;
    topMesh.position.z = height - 0.3;
    group.add(topMesh);

    // Negative Stripe Marker
    const stripeGeo = new THREE.BoxGeometry(0.8, height - 1.0, 0.1);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.position.set(-dia / 2 + 0.05, 0, height / 2);
    group.add(stripeMesh);

    return group;
  }

  // ── 3. IC Packages: QFP / LQFP / TQFP (e.g. STM32, ATmega) ──
  if (pkg.includes('QFP') || pkg.includes('LQFP') || pkg.includes('TQFP')) {
    const size = pkg.includes('64') || pkg.includes('100') ? 14.0 : pkg.includes('48') ? 9.0 : 9.0;
    const height = 1.4;

    // Molded Package Body
    const bodyGeo = new THREE.BoxGeometry(size, size, height);
    const bodyMesh = new THREE.Mesh(bodyGeo, blackEpoxyMat);
    bodyMesh.position.z = height / 2 + 0.2;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Pin 1 Index Dot
    const dotGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x52525b });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.rotation.x = Math.PI / 2;
    dotMesh.position.set(-size / 2 + 1.2, size / 2 - 1.2, height + 0.21);
    group.add(dotMesh);

    // Gull-wing pins on all 4 sides
    const pinsPerSide = pkg.includes('64') ? 16 : 8;
    const pinPitch = (size - 2.0) / (pinsPerSide - 1);
    const pinGeo = new THREE.BoxGeometry(0.3, 1.2, 0.18);

    for (let i = 0; i < pinsPerSide; i++) {
      const offset = -((pinsPerSide - 1) * pinPitch) / 2 + i * pinPitch;

      // Bottom side pins
      const bPin = new THREE.Mesh(pinGeo, metalSilverMat);
      bPin.position.set(offset, -size / 2 - 0.5, 0.1);
      group.add(bPin);

      // Top side pins
      const tPin = new THREE.Mesh(pinGeo, metalSilverMat);
      tPin.position.set(offset, size / 2 + 0.5, 0.1);
      group.add(tPin);

      // Left side pins
      const lPin = new THREE.Mesh(pinGeo, metalSilverMat);
      lPin.rotation.z = Math.PI / 2;
      lPin.position.set(-size / 2 - 0.5, offset, 0.1);
      group.add(lPin);

      // Right side pins
      const rPin = new THREE.Mesh(pinGeo, metalSilverMat);
      rPin.rotation.z = Math.PI / 2;
      rPin.position.set(size / 2 + 0.5, offset, 0.1);
      group.add(rPin);
    }

    return group;
  }

  // ── 4. DIP Integrated Circuits (DIP-8, DIP-16, DIP-28) ──
  if (pkg.includes('DIP') || ref.startsWith('U_DIP')) {
    const pins = pkg.includes('28') ? 28 : pkg.includes('16') ? 16 : 8;
    const length = (pins / 2) * 2.54;
    const width = 7.62;
    const height = 3.2;

    // Molded Plastic Body
    const bodyGeo = new THREE.BoxGeometry(length, width - 1.2, height);
    const bodyMesh = new THREE.Mesh(bodyGeo, blackEpoxyMat);
    bodyMesh.position.z = height / 2 + 1.2;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Pin 1 Notch on one end
    const notchGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.4, 16, 1, false, 0, Math.PI);
    const notchMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const notchMesh = new THREE.Mesh(notchGeo, notchMat);
    notchMesh.rotation.x = Math.PI / 2;
    notchMesh.rotation.z = Math.PI;
    notchMesh.position.set(-length / 2 + 0.05, 0, height + 1.2);
    group.add(notchMesh);

    // Through-hole bent pins
    const pinCountPerSide = pins / 2;
    const legGeo = new THREE.BoxGeometry(0.45, 0.3, 2.0);
    for (let i = 0; i < pinCountPerSide; i++) {
      const lx = -length / 2 + 1.27 + i * 2.54;

      const pin1 = new THREE.Mesh(legGeo, metalSilverMat);
      pin1.position.set(lx, -(width / 2), 1.0);
      group.add(pin1);

      const pin2 = new THREE.Mesh(legGeo, metalSilverMat);
      pin2.position.set(lx, width / 2, 1.0);
      group.add(pin2);
    }

    return group;
  }

  // ── 5. SOT-223 / TO-252 (Power LDO / Transistors) ──
  if (pkg.includes('SOT-223') || pkg.includes('SOT223') || pkg.includes('TO-252') || pkg.includes('DPAK')) {
    const isDpak = pkg.includes('TO-252') || pkg.includes('DPAK');
    const bodyW = isDpak ? 6.6 : 6.5;
    const bodyL = isDpak ? 6.2 : 3.5;
    const bodyH = isDpak ? 2.3 : 1.6;

    // Molded Body
    const bodyGeo = new THREE.BoxGeometry(bodyW, bodyL, bodyH);
    const bodyMesh = new THREE.Mesh(bodyGeo, blackEpoxyMat);
    bodyMesh.position.z = bodyH / 2 + 0.15;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Copper / Nickel Drain Tab on back
    const tabGeo = new THREE.BoxGeometry(bodyW * 0.85, 2.0, 0.35);
    const tabMesh = new THREE.Mesh(tabGeo, metalSilverMat);
    tabMesh.position.set(0, bodyL / 2 + 0.8, 0.18);
    tabMesh.castShadow = true;
    group.add(tabMesh);

    // 3 Front Gullwing Leads
    const leadGeo = new THREE.BoxGeometry(0.8, 1.6, 0.2);
    for (let i = -1; i <= 1; i++) {
      const lead = new THREE.Mesh(leadGeo, metalSilverMat);
      lead.position.set(i * 2.3, -bodyL / 2 - 0.7, 0.1);
      group.add(lead);
    }

    return group;
  }

  // ── 6. USB Type-C Connector ──
  if (pkg.includes('TYPE-C') || pkg.includes('USB')) {
    const w = 8.9;
    const l = 7.3;
    const h = 3.2;

    // Stainless Steel Shield Housing
    const shellGeo = new THREE.BoxGeometry(w, l, h);
    const shellMesh = new THREE.Mesh(shellGeo, metalSilverMat);
    shellMesh.position.z = h / 2 + 0.1;
    shellMesh.castShadow = true;
    group.add(shellMesh);

    // Dark Receptacle Slot
    const slotGeo = new THREE.BoxGeometry(w - 1.2, 0.8, h - 1.0);
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const slotMesh = new THREE.Mesh(slotGeo, slotMat);
    slotMesh.position.set(0, -l / 2, h / 2 + 0.1);
    group.add(slotMesh);

    return group;
  }

  // ── 7. Screw Terminal Blocks (Blue 2/3-pin 5.08mm) ──
  if (pkg.includes('TERMINAL') || pkg.includes('SCREW') || pkg.includes('TB')) {
    const w = 15.0;
    const l = 8.5;
    const h = 10.0;

    // Blue PBT Plastic Block
    const blockGeo = new THREE.BoxGeometry(w, l, h);
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 });
    const blockMesh = new THREE.Mesh(blockGeo, blueMat);
    blockMesh.position.z = h / 2 + 0.1;
    blockMesh.castShadow = true;
    group.add(blockMesh);

    // Silver Screw Heads on top
    const screwGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.4, 16);
    for (let i = -1; i <= 1; i += 2) {
      const screw = new THREE.Mesh(screwGeo, metalSilverMat);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(i * 3.5, 0, h + 0.15);
      group.add(screw);
    }

    return group;
  }

  // ── 8. Crystal Oscillator (HC-49 / HC-49SMD) ──
  if (pkg.includes('CRYSTAL') || pkg.includes('HC-49') || ref.startsWith('Y')) {
    const canGeo = new THREE.BoxGeometry(11.4, 4.8, 3.5);
    const canMesh = new THREE.Mesh(canGeo, metalSilverMat);
    canMesh.position.z = 3.5 / 2 + 0.2;
    canMesh.castShadow = true;
    group.add(canMesh);
    return group;
  }

  // ── 9. Pin Headers (1xN or 2xN) ──
  if (pkg.includes('HEADER') || ref.startsWith('J') || ref.startsWith('HDR') || ref.startsWith('P')) {
    const pins = 4;
    const w = pins * 2.54;
    const l = 2.54;
    const h = 2.54;

    // Black plastic base
    const baseGeo = new THREE.BoxGeometry(w, l, h);
    const baseMesh = new THREE.Mesh(baseGeo, blackEpoxyMat);
    baseMesh.position.z = h / 2 + 0.1;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Gold Square Posts
    const postGeo = new THREE.BoxGeometry(0.64, 0.64, 6.0);
    for (let i = 0; i < pins; i++) {
      const post = new THREE.Mesh(postGeo, goldMat);
      post.position.set(-w / 2 + 1.27 + i * 2.54, 0, 3.0 + h);
      post.castShadow = true;
      group.add(post);
    }
    return group;
  }

  // ── 10. SOIC / Small IC fallback ──
  const defaultW = 5.0;
  const defaultL = 4.0;
  const defaultH = 1.6;
  const defGeo = new THREE.BoxGeometry(defaultW, defaultL, defaultH);
  const defMesh = new THREE.Mesh(defGeo, blackEpoxyMat);
  defMesh.position.z = defaultH / 2 + 0.1;
  defMesh.castShadow = true;
  group.add(defMesh);

  return group;
}

export default function PcbViewer3D({ pcbData, maskThemeKey = 'green', colorMode = 'dark' }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const [activePreset, setActivePreset] = useState('iso'); // 'top' | 'iso' | 'bottom' | 'front'
  const [autoRotate, setAutoRotate] = useState(false);
  const [explodedView, setExplodedView] = useState(false);
  const [activeTheme, setActiveTheme] = useState(maskThemeKey);

  const maskTheme = SOLDER_MASK_THEMES[activeTheme] || SOLDER_MASK_THEMES.green;
  const isLight = colorMode === 'light';

  const { board = {}, components = [] } = pcbData;
  const boardWidth = board.width || 65;
  const boardHeight = board.height || 45;
  const boardThickness = 1.6; // EDA Standard 1.6mm FR-4

  // Setup Three.js WebGL Scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 2000);
    cameraRef.current = camera;

    // 3. Renderer with soft shadows & realistic ACES tone mapping
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Quality Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(45, -60, 90);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 250;
    const shadowSize = Math.max(boardWidth, boardHeight) * 1.2;
    keyLight.shadow.camera.left = -shadowSize;
    keyLight.shadow.camera.right = shadowSize;
    keyLight.shadow.camera.top = shadowSize;
    keyLight.shadow.camera.bottom = -shadowSize;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    fillLight.position.set(-60, 50, 60);
    scene.add(fillLight);

    const bottomRimLight = new THREE.DirectionalLight(0xfef08a, 0.8);
    bottomRimLight.position.set(0, 0, -80);
    scene.add(bottomRimLight);

    // 5. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 15;
    controls.maxDistance = 400;
    controlsRef.current = controls;

    // Set initial Camera Position (Isometric 45° Angle)
    const diag = Math.sqrt(boardWidth * boardWidth + boardHeight * boardHeight);
    camera.position.set(0, -diag * 1.1, diag * 1.05);
    controls.target.set(0, 0, 0);
    controls.update();

    // 6. Build Physical Board Substrate (FR-4 Glass Epoxy Extrusion)
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    // Rounded rectangle shape
    const shape = new THREE.Shape();
    const cr = Math.min(board.corner_radius || 2.5, 5);
    const hw = boardWidth / 2;
    const hh = boardHeight / 2;

    shape.moveTo(-hw + cr, -hh);
    shape.lineTo(hw - cr, -hh);
    shape.absarc(hw - cr, -hh + cr, cr, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hh - cr);
    shape.absarc(hw - cr, hh - cr, cr, 0, Math.PI / 2, false);
    shape.lineTo(-hw + cr, hh);
    shape.absarc(-hw + cr, hh - cr, cr, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hh + cr);
    shape.absarc(-hw + cr, -hh + cr, cr, Math.PI, (Math.PI * 3) / 2, false);

    // Physically drill mounting holes through substrate
    components
      .filter((c) => (c.ref || '').startsWith('MH') || (c.package || '').includes('MOUNT') || (c.package || '').includes('HOLE'))
      .forEach((c) => {
        const mx = (c.position?.x || 0) - boardWidth / 2;
        const my = -((c.position?.y || 0) - boardHeight / 2);
        const holePath = new THREE.Path();
        holePath.absarc(mx, my, 1.6, 0, Math.PI * 2, true);
        shape.holes.push(holePath);
      });

    // Extrude 3D Substrate
    const extrudeSettings = {
      depth: boardThickness,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.12
    };

    const boardGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center geometry in Z-axis
    boardGeo.translate(0, 0, -boardThickness / 2);

    // FR-4 Core Edge Material (Fibrous tan-olive fiberglass core)
    const fr4CoreMat = new THREE.MeshStandardMaterial({
      color: 0x36432b,
      roughness: 0.85,
      metalness: 0.05
    });

    const boardMesh = new THREE.Mesh(boardGeo, fr4CoreMat);
    boardMesh.receiveShadow = true;
    boardMesh.castShadow = true;
    boardGroup.add(boardMesh);

    // High-Resolution Top Solder Mask Texture Plane
    const topTexture = generatePcbTexture(pcbData, maskTheme, false, 2048);
    if (topTexture) {
      const topMat = new THREE.MeshStandardMaterial({
        map: topTexture,
        roughness: 0.38,
        metalness: 0.15,
        transparent: true
      });
      const topPlaneGeo = new THREE.PlaneGeometry(boardWidth, boardHeight);
      const topMesh = new THREE.Mesh(topPlaneGeo, topMat);
      topMesh.position.set(0, 0, boardThickness / 2 + 0.02);
      topMesh.receiveShadow = true;
      boardGroup.add(topMesh);
    }

    // High-Resolution Bottom Solder Mask Texture Plane
    const bottomTexture = generatePcbTexture(pcbData, maskTheme, true, 2048);
    if (bottomTexture) {
      const bottomMat = new THREE.MeshStandardMaterial({
        map: bottomTexture,
        roughness: 0.38,
        metalness: 0.15,
        transparent: true
      });
      const bottomPlaneGeo = new THREE.PlaneGeometry(boardWidth, boardHeight);
      const bottomMesh = new THREE.Mesh(bottomPlaneGeo, bottomMat);
      bottomMesh.rotation.y = Math.PI;
      bottomMesh.position.set(0, 0, -(boardThickness / 2 + 0.02));
      bottomMesh.receiveShadow = true;
      boardGroup.add(bottomMesh);
    }

    // 7. Populated Real 3D Physical Components
    const componentsGroup = new THREE.Group();
    components.forEach((c) => {
      const compMesh = createComponent3D(c, boardWidth, boardHeight);
      componentsGroup.add(compMesh);
    });
    boardGroup.add(componentsGroup);

    // 8. Animation & Render Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) {
        if (autoRotate) {
          boardGroup.rotation.z += 0.006;
        }
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [pcbData, activeTheme, autoRotate]);

  // Exploded View / Component Elevation Animation
  useEffect(() => {
    if (!sceneRef.current) return;
    const boardGroup = sceneRef.current.children.find((c) => c.type === 'Group');
    if (!boardGroup) return;
    const compGroup = boardGroup.children.find((c) => c.type === 'Group');
    if (!compGroup) return;

    compGroup.position.z = explodedView ? 5.0 : 0.0;
  }, [explodedView]);

  // Camera Presets
  const setCameraPreset = (preset) => {
    setActivePreset(preset);
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const diag = Math.sqrt(boardWidth * boardWidth + boardHeight * boardHeight);

    if (preset === 'top') {
      camera.position.set(0, 0, diag * 1.4);
      controls.target.set(0, 0, 0);
    } else if (preset === 'iso') {
      camera.position.set(0, -diag * 1.1, diag * 1.05);
      controls.target.set(0, 0, 0);
    } else if (preset === 'bottom') {
      camera.position.set(0, 0, -diag * 1.4);
      controls.target.set(0, 0, 0);
    } else if (preset === 'front') {
      camera.position.set(0, -diag * 1.25, 4.0);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%',
          background: isLight
            ? 'radial-gradient(circle at center, #f8fafc 0%, #cbd5e1 100%)'
            : 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)',
          cursor: 'grab'
        }}
      />

      {/* ── Top Floating Toolbar (Camera Angles & Presets) ── */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          padding: '6px 14px',
          borderRadius: '8px',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.6)',
          zIndex: 20
        }}
      >
        <button
          onClick={() => setCameraPreset('iso')}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: activePreset === 'iso' ? 'var(--primary-violet, #8b5cf6)' : 'transparent',
            color: activePreset === 'iso' ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Isometric 45° CAD View"
        >
          <Rotate3d size={13} />
          <span>Isometric</span>
        </button>

        <button
          onClick={() => setCameraPreset('top')}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: activePreset === 'top' ? 'var(--primary-violet, #8b5cf6)' : 'transparent',
            color: activePreset === 'top' ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Top-Down 0° Orthographic View"
        >
          <ArrowUp size={13} />
          <span>Top</span>
        </button>

        <button
          onClick={() => setCameraPreset('bottom')}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: activePreset === 'bottom' ? 'var(--primary-violet, #8b5cf6)' : 'transparent',
            color: activePreset === 'bottom' ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Bottom Solder Joint & Trace View"
        >
          <ArrowDown size={13} />
          <span>Bottom</span>
        </button>

        <button
          onClick={() => setCameraPreset('front')}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: activePreset === 'front' ? 'var(--primary-violet, #8b5cf6)' : 'transparent',
            color: activePreset === 'front' ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Edge Profile View (Inspect Component Heights)"
        >
          <Layers size={13} />
          <span>Profile</span>
        </button>

        <div style={{ width: '1px', height: '16px', background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Auto-Turntable Rotation */}
        <button
          onClick={() => setAutoRotate((prev) => !prev)}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: autoRotate ? '#10b981' : 'transparent',
            color: autoRotate ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Auto-Rotate Showcase Turntable"
        >
          <Sparkles size={13} />
          <span>{autoRotate ? 'Rotating' : 'Turntable'}</span>
        </button>

        {/* Exploded / Component Lift View */}
        <button
          onClick={() => setExplodedView((prev) => !prev)}
          style={{
            padding: '5px 10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            background: explodedView ? '#f59e0b' : 'transparent',
            color: explodedView ? '#ffffff' : (isLight ? '#334155' : '#e2e8f0'),
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Exploded View (Lift components to see routed traces underneath)"
        >
          <span>{explodedView ? 'Landed' : 'Explode'}</span>
        </button>
      </div>

      {/* ── Top-Right Theme Selector ── */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          padding: '6px 10px',
          borderRadius: '8px',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 20
        }}
      >
        <Palette size={13} color={isLight ? '#64748b' : '#94a3b8'} />
        <select
          value={activeTheme}
          onChange={(e) => setActiveTheme(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isLight ? '#0f172a' : '#f8fafc',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="green" style={{ background: '#0f172a', color: '#fff' }}>Classic Green</option>
          <option value="black" style={{ background: '#0f172a', color: '#fff' }}>Matte Black</option>
          <option value="blue" style={{ background: '#0f172a', color: '#fff' }}>Royal Blue</option>
          <option value="purple" style={{ background: '#0f172a', color: '#fff' }}>OSH Park Purple</option>
          <option value="red" style={{ background: '#0f172a', color: '#fff' }}>Ferrari Red</option>
          <option value="white" style={{ background: '#0f172a', color: '#fff' }}>Glossy White</option>
        </select>
      </div>

      {/* ── Bottom Left Instruction Hint ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          background: isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '0.72rem',
          color: isLight ? '#64748b' : '#94a3b8',
          pointerEvents: 'none',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`
        }}
      >
        🎮 <b>Left-Click Drag:</b> 360° Orbit | <b>Right-Click / Shift + Drag:</b> Pan | <b>Wheel:</b> Zoom
      </div>

      {/* ── Bottom Right Board Stats ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          background: isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '0.72rem',
          color: isLight ? '#334155' : '#cbd5e1',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
          fontFamily: 'monospace'
        }}
      >
        <span>FR-4: <b>{boardWidth} × {boardHeight} × {boardThickness} mm</b> ({components.length} components)</span>
      </div>
    </div>
  );
}
