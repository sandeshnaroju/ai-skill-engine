import React, { useState, useMemo, useRef } from 'react';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Maximize2,
  Box,
  Compass,
  CheckCircle2,
  Zap,
  Activity,
  Rotate3d,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Hand,
  Move,
  Info,
  Sun,
  Moon,
  Ruler
} from 'lucide-react';
import { SOLDER_MASK_THEMES } from './constants';
import { parsePcbData } from './parser';
import { Component2D } from './ComponentLibrary2D';
import PcbViewer3D from './PcbViewer3D';
import { SchematicView } from './SchematicView';
import { SimulationOscilloscope } from './SimulationOscilloscope';

const LAYER_METADATA = {
  'F.Cu': { name: 'Top Copper', color: '#ef4444', desc: 'Signal & Power Traces (Top)' },
  'B.Cu': { name: 'Bottom Copper', color: '#3b82f6', desc: 'Signal & Ground Return (Bottom)' },
  'F.SilkS': { name: 'Top Silkscreen', color: '#facc15', desc: 'Component Text & Outlines' },
  'B.SilkS': { name: 'Bottom Silkscreen', color: '#93c5fd', desc: 'Bottom Markings & Labels' },
  'F.Mask': { name: 'Top Solder Mask', color: '#e879f9', desc: 'Solder Mask Openings' },
  'Edge.Cuts': { name: 'Edge Cuts', color: '#c084fc', desc: 'Physical Board Boundary' },
  'Pads': { name: 'Component Pads', color: '#fb7185', desc: 'SMD & Through-Hole Lands' },
  'Vias': { name: 'Plated Vias', color: '#d97706', desc: 'Through-hole Interconnects' },
  'Pours': { name: 'Copper Pours', color: '#10b981', desc: 'GND/Power Plane Zones' }
};

export default function PcbViewer({ fullContent, artifact, filename, theme = 'dark' }) {
  const [colorMode, setColorMode] = useState(theme === 'light' ? 'light' : 'dark'); // 'dark' | 'light'
  const [viewMode, setViewMode] = useState('pcb'); // 'pcb' | 'schematic' | 'simulation' | '3d'
  const [maskThemeKey, setMaskThemeKey] = useState('green');
  const [selectedNet, setSelectedNet] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [sidebarTab, setSidebarTab] = useState('layers'); // 'layers' | 'props' | 'nets' | 'bom' | 'drc'

  // Decoupled per-tab zoom and pan viewports so zooming in one tab does NOT affect another
  const [pcbZoom, setPcbZoom] = useState(1);
  const [pcbPan, setPcbPan] = useState({ x: 0, y: 0 });

  const [schZoom, setSchZoom] = useState(1);
  const [schPan, setSchPan] = useState({ x: 0, y: 0 });

  const [zoom3D, setZoom3D] = useState(1);
  const [pan3D, setPan3D] = useState({ x: 0, y: 0 });
  const [rot3D, setRot3D] = useState({ x: 0, y: 0, z: 0 });
  const [tool3DMode, setTool3DMode] = useState('orbit'); // 'orbit' | 'pan'

  const [isDragging, setIsDragging] = useState(false);
  const [dragButton, setDragButton] = useState(0); // 0 = left, 1 = middle, 2 = right
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showRatsnest, setShowRatsnest] = useState(true);
  const [showTeardrops, setShowTeardrops] = useState(true);
  const [showCopperPours, setShowCopperPours] = useState(true);
  const [simActiveChannels, setSimActiveChannels] = useState({ vin: true, vout: true, iload: true });

  const [activeLayers, setActiveLayers] = useState({
    'F.Cu': true,
    'B.Cu': true,
    'F.SilkS': true,
    'B.SilkS': false,
    'F.Mask': true,
    'Edge.Cuts': true,
    'Pads': true,
    'Vias': true,
    'Pours': true
  });

  const svgRef = useRef(null);

  // Parse PCB data
  const pcbData = useMemo(() => {
    return parsePcbData(fullContent, filename);
  }, [fullContent, filename]);

  const { board = {}, components = [], traces = [], vias = [], schematic = {}, rules = {}, silkscreen = [] } = pcbData;
  const boardWidth = board.width || 65;
  const boardHeight = board.height || 45;

  // 2D PCB Dimension Inspection & Caliper Measurement State
  const [hoveredItem, setHoveredItem] = useState(null); // { type: 'trace' | 'component' | 'via', ... }
  const [cursorBoardPos, setCursorBoardPos] = useState({ x: 0, y: 0 });
  const [measureMode, setMeasureMode] = useState(false); // Interactive caliper distance measurement tool
  const [measureStart, setMeasureStart] = useState(null); // { x, y } in board mm
  const [measurePreview, setMeasurePreview] = useState(null); // { x, y } in board mm
  const [lockedMeasurements, setLockedMeasurements] = useState([]); // Array of locked calipers
  const [unitSystem, setUnitSystem] = useState('mm'); // 'mm' | 'mil'

  // Unit formatting helpers (mm & mil: 1 mm = 39.3701 mil)
  const formatDim = (valInMm, precision = 2) => {
    if (valInMm === undefined || valInMm === null || isNaN(valInMm)) return '-';
    if (unitSystem === 'mil') {
      const milVal = (valInMm * 39.3701).toFixed(1);
      return `${milVal} mil`;
    }
    return `${Number(valInMm).toFixed(precision)} mm`;
  };

  const formatDualDim = (valInMm, precision = 2) => {
    if (valInMm === undefined || valInMm === null || isNaN(valInMm)) return '-';
    const mmVal = Number(valInMm).toFixed(precision);
    const milVal = (valInMm * 39.3701).toFixed(1);
    if (unitSystem === 'mil') {
      return `${milVal} mil (${mmVal} mm)`;
    }
    return `${mmVal} mm (${milVal} mil)`;
  };

  // Screen to PCB Board (mm) Coordinate Conversion
  const getBoardCoordinates = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const svgX = ((e.clientX - rect.left) / rect.width) * 1000;
    const svgY = ((e.clientY - rect.top) / rect.height) * 600;
    const currentScale = pcbZoom * pcbBaseScale;
    const bx = (svgX - (500 + pcbPan.x)) / currentScale + boardWidth / 2;
    const by = (svgY - (300 + pcbPan.y)) / currentScale + boardHeight / 2;
    return {
      x: Math.round(bx * 100) / 100,
      y: Math.round(by * 100) / 100
    };
  };

  // Component Physical Dimensions Calculator
  const getComponentDimensions = (c) => {
    const pkg = (c.package || '').toUpperCase();
    const ref = (c.ref || '').toUpperCase();

    let w = 4.0;
    let h = 4.0;

    if (pkg.includes('SOT-223') || pkg.includes('SOT223')) {
      w = 6.5; h = 7.0;
    } else if (pkg.includes('SOT-23') || pkg.includes('SOT23')) {
      w = 2.9; h = 2.4;
    } else if (pkg.includes('TO-252') || pkg.includes('DPAK')) {
      w = 6.6; h = 10.0;
    } else if (pkg.includes('TO-220')) {
      w = 10.2; h = 4.6;
    } else if (pkg.includes('0805')) {
      w = 2.0; h = 1.25;
    } else if (pkg.includes('0603')) {
      w = 1.6; h = 0.8;
    } else if (pkg.includes('1206')) {
      w = 3.2; h = 1.6;
    } else if (pkg.includes('SMA') || pkg.includes('DO-214AC')) {
      w = 5.2; h = 2.6;
    } else if (pkg.includes('SMB') || pkg.includes('DO-214AA')) {
      w = 5.4; h = 3.6;
    } else if (pkg.includes('SMC') || pkg.includes('DO-214AB')) {
      w = 7.9; h = 5.9;
    } else if (pkg.includes('SOIC-8') || pkg.includes('SOIC8')) {
      w = 4.9; h = 6.0;
    } else if (pkg.includes('SOIC-16') || pkg.includes('SOIC16')) {
      w = 9.9; h = 6.0;
    } else if (pkg.includes('DIP-8') || pkg.includes('DIP8')) {
      w = 9.6; h = 7.62;
    } else if (pkg.includes('DIP-16') || pkg.includes('DIP16')) {
      w = 19.2; h = 7.62;
    } else if (pkg.includes('DIP-28') || pkg.includes('DIP28')) {
      w = 35.6; h = 7.62;
    } else if (pkg.includes('DIP-40') || pkg.includes('DIP40')) {
      w = 52.3; h = 15.24;
    } else if (pkg.includes('TQFP-32') || pkg.includes('TQFP32')) {
      w = 9.0; h = 9.0;
    } else if (pkg.includes('TQFP-44') || pkg.includes('TQFP44')) {
      w = 12.0; h = 12.0;
    } else if (pkg.includes('LQFP-48') || pkg.includes('LQFP48')) {
      w = 9.0; h = 9.0;
    } else if (pkg.includes('LQFP-64') || pkg.includes('LQFP64')) {
      w = 12.0; h = 12.0;
    } else if (pkg.includes('TYPE-C') || pkg.includes('USB')) {
      w = 8.9; h = 7.3;
    } else if (pkg.includes('CRYSTAL') || pkg.includes('HC-49')) {
      w = 11.4; h = 4.8;
    } else if (ref.startsWith('MH') || pkg.includes('MOUNT') || pkg.includes('HOLE')) {
      w = 5.2; h = 5.2;
    } else if (c.pads && c.pads.length > 0) {
      const xs = c.pads.map((p) => (p.x !== undefined ? p.x : c.position?.x || 0));
      const ys = c.pads.map((p) => (p.y !== undefined ? p.y : c.position?.y || 0));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      w = Math.max(maxX - minX + 1.6, 2.5);
      h = Math.max(maxY - minY + 1.6, 2.0);
    }

    const rot = Math.abs((c.position?.rotation || 0) % 360);
    if (rot === 90 || rot === 270) {
      return { width: h, height: w, rawWidth: w, rawHeight: h };
    }
    return { width: w, height: h, rawWidth: w, rawHeight: h };
  };

  const selectedCompData = useMemo(() => {
    if (!selectedComponent) return null;
    return components.find((c) => c.ref === selectedComponent) || null;
  }, [components, selectedComponent]);

  // Active solder mask color theme (defaults to Classic Green)
  const maskTheme = SOLDER_MASK_THEMES[maskThemeKey] || SOLDER_MASK_THEMES.green;

  const isLight = colorMode === 'light';

  // Responsive UI & Canvas Color Palette for Day & Dark Modes
  const themeColors = useMemo(() => {
    if (isLight) {
      return {
        bg: '#f8fafc',
        headerBg: '#ffffff',
        sidebarBg: '#ffffff',
        cardBg: '#f1f5f9',
        cardBorder: '#e2e8f0',
        border: 'rgba(0,0,0,0.1)',
        textPrimary: '#0f172a',
        textSecondary: '#64748b',
        textMuted: '#94a3b8',
        inputBg: '#f8fafc',
        gridStroke: 'rgba(0,0,0,0.07)',
        canvasBg: '#f1f5f9',
        hoverBg: 'rgba(0,0,0,0.04)',
        controlBg: 'rgba(255,255,255,0.95)',
        controlBorder: '#cbd5e1',
        controlText: '#0f172a'
      };
    }
    return {
      bg: '#090d16',
      headerBg: '#0f172a',
      sidebarBg: '#0f172a',
      cardBg: 'rgba(255,255,255,0.03)',
      cardBorder: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.1)',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      inputBg: '#1e293b',
      gridStroke: 'rgba(255,255,255,0.05)',
      canvasBg: maskTheme.bg,
      hoverBg: 'rgba(255,255,255,0.05)',
      controlBg: 'rgba(15, 23, 42, 0.85)',
      controlBorder: 'rgba(255,255,255,0.1)',
      controlText: '#f8fafc'
    };
  }, [isLight, maskTheme.bg]);

  // Dynamic auto-fit scale for 2D PCB Layout (fits comfortably inside viewBox without overflowing)
  const pcbBaseScale = useMemo(() => {
    const maxW = 650;
    const maxH = 420;
    const scaleX = maxW / Math.max(boardWidth, 20);
    const scaleY = maxH / Math.max(boardHeight, 20);
    return Math.min(scaleX, scaleY, 8.5);
  }, [boardWidth, boardHeight]);

  // Compute 3D auto-fit scale so the 3D board fits nicely into the container without overflowing
  const baseBoardScale = useMemo(() => {
    const maxW = 420;
    const maxH = 270;
    const scaleX = maxW / Math.max(boardWidth, 20);
    const scaleY = maxH / Math.max(boardHeight, 20);
    return Math.min(scaleX, scaleY, 6.5);
  }, [boardWidth, boardHeight]);

  const board3DWidth = boardWidth * baseBoardScale;
  const board3DHeight = boardHeight * baseBoardScale;

  // Extract all distinct electrical nets
  const allNets = useMemo(() => {
    const netSet = new Set();
    components.forEach((c) => {
      (c.pads || []).forEach((p) => {
        if (p.net) netSet.add(p.net);
      });
    });
    traces.forEach((t) => {
      if (t.net) netSet.add(t.net);
    });
    vias.forEach((v) => {
      if (v.net) netSet.add(v.net);
    });
    return Array.from(netSet).sort();
  }, [components, traces, vias]);

  // Compute DRC checks
  const drcResults = useMemo(() => {
    const warnings = [];
    const minWidth = rules.min_trace_width || 0.254;

    traces.forEach((t, idx) => {
      if (t.width && t.width < minWidth) {
        warnings.push({
          type: 'trace_width',
          severity: 'warning',
          message: `Trace on net '${t.net || `Trace #${idx + 1}`}' width (${t.width}mm) is below minimum rule (${minWidth}mm).`
        });
      }
    });

    const netPinCount = {};
    components.forEach((c) => {
      (c.pads || []).forEach((p) => {
        if (p.net) {
          netPinCount[p.net] = (netPinCount[p.net] || 0) + 1;
        }
      });
    });

    const routedNets = new Set(traces.map((t) => t.net));
    Object.entries(netPinCount).forEach(([net, count]) => {
      if (count > 1 && !routedNets.has(net) && net !== 'GND') {
        warnings.push({
          type: 'unrouted',
          severity: 'error',
          message: `Net '${net}' has ${count} pins connected but no routed copper traces.`
        });
      }
    });

    return warnings;
  }, [traces, components, rules]);

  // Compute Unrouted Airwires (Ratsnest)
  const airwires = useMemo(() => {
    if (!showRatsnest) return [];
    const padsByNet = {};
    components.forEach((c) => {
      (c.pads || []).forEach((p) => {
        if (p.net && p.net !== 'GND') {
          if (!padsByNet[p.net]) padsByNet[p.net] = [];
          padsByNet[p.net].push({
            x: p.x !== undefined ? p.x : c.position.x,
            y: p.y !== undefined ? p.y : c.position.y,
            net: p.net,
            ref: c.ref,
            pin: p.num
          });
        }
      });
    });

    const wires = [];
    Object.entries(padsByNet).forEach(([net, padList]) => {
      if (padList.length > 1) {
        for (let i = 0; i < padList.length - 1; i++) {
          wires.push({
            net,
            x1: padList[i].x,
            y1: padList[i].y,
            x2: padList[i + 1].x,
            y2: padList[i + 1].y
          });
        }
      }
    });
    return wires;
  }, [components, showRatsnest]);

  // SPICE Waveform Simulation Synthesizer
  const simData = useMemo(() => {
    const points = 120;
    const time = [];
    const vin = [];
    const vout = [];
    const iload = [];

    for (let i = 0; i < points; i++) {
      const t = (i / points) * 10;
      time.push(t);

      let v_in = 0;
      if (t >= 0.5) {
        v_in = 5.0 * (1 - Math.exp(-(t - 0.5) / 0.3)) + 0.04 * Math.sin(2 * Math.PI * 4 * t);
      }
      vin.push(v_in);

      let v_out = 0;
      if (t >= 0.8) {
        const dt = t - 0.8;
        const overshoot = 0.15 * Math.exp(-dt / 0.8) * Math.sin(2 * Math.PI * 2 * dt);
        v_out = Math.max(0, 3.30 * (1 - Math.exp(-dt / 0.4)) + overshoot);
      }
      vout.push(v_out);

      let i_l = 0;
      if (t >= 1.0 && t < 5.0) i_l = 0.25;
      else if (t >= 5.0) i_l = 0.50;
      iload.push(i_l);
    }

    return { time, vin, vout, iload };
  }, []);

  // Multi-Mode Mouse Interaction Handlers (2D Pan, Caliper Distance Measure & 3D Real-time Orbit)
  const handleMouseDown = (e) => {
    if (viewMode === 'pcb' && measureMode && e.button === 0) {
      const bPos = getBoardCoordinates(e);
      if (!measureStart) {
        setMeasureStart(bPos);
        setMeasurePreview(bPos);
      } else {
        const dx = bPos.x - measureStart.x;
        const dy = bPos.y - measureStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setLockedMeasurements((prev) => [
          ...prev,
          {
            p1: measureStart,
            p2: bPos,
            dist,
            dx: Math.abs(dx),
            dy: Math.abs(dy),
            id: Date.now()
          }
        ]);
        setMeasureStart(null);
        setMeasurePreview(null);
      }
      return;
    }

    setIsDragging(true);
    setDragButton(e.button);
    setStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (viewMode === 'pcb') {
      const bPos = getBoardCoordinates(e);
      setCursorBoardPos(bPos);
      if (measureMode && measureStart) {
        setMeasurePreview(bPos);
      }
    }

    if (!isDragging) return;
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;

    if (viewMode === '3d') {
      const isPanAction = tool3DMode === 'pan' || dragButton === 2 || dragButton === 1 || e.shiftKey || e.ctrlKey || e.metaKey;
      if (isPanAction) {
        // Move 3D board to any location on the screen
        setPan3D((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else {
        // Left Click: Natural 3D Orbit (Drag Left rotates Left, Drag Right rotates Right, Drag Up tilts Up)
        setRot3D((prev) => ({
          x: Math.max(-85, Math.min(85, prev.x - dy * 0.45)),
          y: 0,
          z: (prev.z - dx * 0.45) % 360
        }));
      }
    } else if (viewMode === 'schematic') {
      setSchPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    } else {
      // 2D PCB Pan
      setPcbPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }

    setStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const updateActiveZoom = (updater) => {
    if (viewMode === 'pcb') {
      setPcbZoom(updater);
    } else if (viewMode === 'schematic') {
      setSchZoom(updater);
    } else if (viewMode === '3d') {
      setZoom3D(updater);
    }
  };

  const resetView = () => {
    if (viewMode === 'pcb') {
      setPcbZoom(1);
      setPcbPan({ x: 0, y: 0 });
      setSelectedNet(null);
      setSelectedComponent(null);
    } else if (viewMode === 'schematic') {
      setSchZoom(1);
      setSchPan({ x: 0, y: 0 });
      setSelectedComponent(null);
    } else if (viewMode === '3d') {
      setZoom3D(1);
      setPan3D({ x: 0, y: 0 });
      setRot3D({ x: 0, y: 0, z: 0 });
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    updateActiveZoom((z) => Math.min(Math.max(z * factor, 0.3), 10.0));
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: themeColors.bg, color: themeColors.textPrimary, overflow: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Top Header Toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: themeColors.headerBg,
        borderBottom: `1px solid ${themeColors.border}`,
        zIndex: 10
      }}>
        {/* Left: View Mode Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setViewMode('pcb')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: viewMode === 'pcb' ? 'var(--primary-violet, #8b5cf6)' : themeColors.tabInactiveBg,
              color: viewMode === 'pcb' ? '#ffffff' : themeColors.textSecondary,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Layers size={15} />
            <span>2D PCB Layout</span>
          </button>

          <button
            onClick={() => setViewMode('schematic')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: viewMode === 'schematic' ? 'var(--primary-violet, #8b5cf6)' : themeColors.tabInactiveBg,
              color: viewMode === 'schematic' ? '#ffffff' : themeColors.textSecondary,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Compass size={15} />
            <span>Schematic</span>
          </button>

          <button
            onClick={() => setViewMode('simulation')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: viewMode === 'simulation' ? '#06b6d4' : themeColors.tabInactiveBg,
              color: viewMode === 'simulation' ? '#ffffff' : themeColors.textSecondary,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Activity size={15} />
            <span>SPICE Simulation</span>
          </button>

          <button
            onClick={() => setViewMode('3d')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: viewMode === '3d' ? '#10b981' : themeColors.tabInactiveBg,
              color: viewMode === '3d' ? '#ffffff' : themeColors.textSecondary,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Box size={15} />
            <span>3D Board & ICs</span>
          </button>
        </div>

        {/* Middle & Right: Theme, Display Options & Day/Dark Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: themeColors.textSecondary }}>Mask:</span>
            <select
              value={maskThemeKey}
              onChange={(e) => setMaskThemeKey(e.target.value)}
              style={{
                background: themeColors.inputBg,
                color: themeColors.textPrimary,
                border: `1px solid ${themeColors.border}`,
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              {Object.entries(SOLDER_MASK_THEMES).map(([k, v]) => (
                <option key={k} value={k}>{v.name}</option>
              ))}
            </select>
          </div>

          {viewMode === 'pcb' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: themeColors.textSecondary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showRatsnest}
                  onChange={(e) => setShowRatsnest(e.target.checked)}
                />
                <span>Ratsnest</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: themeColors.textSecondary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showTeardrops}
                  onChange={(e) => setShowTeardrops(e.target.checked)}
                />
                <span>Teardrops</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: themeColors.textSecondary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showCopperPours}
                  onChange={(e) => setShowCopperPours(e.target.checked)}
                />
                <span>Copper Pours</span>
              </label>
            </>
          )}

          <div style={{ width: '1px', height: '18px', background: themeColors.border, margin: '0 2px' }} />

          {/* Day (Light) / Dark Mode Switcher */}
          <button
            onClick={() => setColorMode(isLight ? 'dark' : 'light')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
              color: isLight ? '#0f172a' : '#f8fafc',
              border: `1px solid ${themeColors.border}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title={isLight ? 'Switch to Dark Mode (CAD Blueprint)' : 'Switch to Day Mode (Light Engineering View)'}
          >
            {isLight ? <Sun size={14} color="#f59e0b" /> : <Moon size={14} color="#38bdf8" />}
            <span>{isLight ? 'Day' : 'Dark'}</span>
          </button>
        </div>
      </div>

      {/* ── Main Work Area ── */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Left Sidebar: Layers / Props / Nets / BOM / DRC */}
        <div style={{
          width: '260px',
          background: themeColors.sidebarBg,
          borderRight: `1px solid ${themeColors.border}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10
        }}>
          {/* Sidebar Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${themeColors.border}` }}>
            {[
              { key: 'layers', label: 'Layers' },
              { key: 'props', label: selectedComponent ? `Prop (${selectedComponent})` : 'Props' },
              { key: 'nets', label: `Nets (${allNets.length})` },
              { key: 'bom', label: `BOM (${components.length})` },
              { key: 'drc', label: `DRC (${drcResults.length})` }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSidebarTab(tab.key)}
                style={{
                  flex: 1,
                  padding: '8px 2px',
                  background: sidebarTab === tab.key ? (isLight ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.08)') : 'transparent',
                  color: sidebarTab === tab.key ? (isLight ? '#7c3aed' : '#f8fafc') : themeColors.textSecondary,
                  border: 'none',
                  borderBottom: sidebarTab === tab.key ? '2px solid var(--primary-violet, #8b5cf6)' : '2px solid transparent',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sidebar Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {sidebarTab === 'layers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: themeColors.textSecondary, fontWeight: 'bold' }}>Stackup Layers</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setActiveLayers((prev) => {
                        const next = {};
                        Object.keys(prev).forEach(k => next[k] = true);
                        return next;
                      })}
                      style={{ padding: '2px 6px', background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)', border: `1px solid ${themeColors.border}`, borderRadius: '3px', fontSize: '0.65rem', color: themeColors.textPrimary, cursor: 'pointer' }}
                    >
                      All On
                    </button>
                    <button
                      onClick={() => setActiveLayers((prev) => {
                        const next = {};
                        Object.keys(prev).forEach(k => next[k] = (k === 'Edge.Cuts'));
                        return next;
                      })}
                      style={{ padding: '2px 6px', background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)', border: `1px solid ${themeColors.border}`, borderRadius: '3px', fontSize: '0.65rem', color: themeColors.textPrimary, cursor: 'pointer' }}
                    >
                      All Off
                    </button>
                  </div>
                </div>

                {/* Quick Presets: Top Only vs Bottom Only */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
                  <button
                    onClick={() => setActiveLayers({
                      'F.Cu': true,
                      'B.Cu': false,
                      'F.SilkS': true,
                      'B.SilkS': false,
                      'F.Mask': true,
                      'Edge.Cuts': true,
                      'Pads': true,
                      'Vias': true,
                      'Pours': true
                    })}
                    style={{ flex: 1, padding: '4px 6px', background: isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${isLight ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`, borderRadius: '4px', fontSize: '0.68rem', color: isLight ? '#dc2626' : '#fca5a5', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Top Layers
                  </button>
                  <button
                    onClick={() => setActiveLayers({
                      'F.Cu': false,
                      'B.Cu': true,
                      'F.SilkS': false,
                      'B.SilkS': true,
                      'F.Mask': false,
                      'Edge.Cuts': true,
                      'Pads': true,
                      'Vias': true,
                      'Pours': true
                    })}
                    style={{ flex: 1, padding: '4px 6px', background: isLight ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.15)', border: `1px solid ${isLight ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.4)'}`, borderRadius: '4px', fontSize: '0.68rem', color: isLight ? '#2563eb' : '#93c5fd', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Bottom Layers
                  </button>
                </div>

                {Object.keys(activeLayers).map((lKey) => {
                  const meta = LAYER_METADATA[lKey] || { name: lKey, color: '#e2e8f0', desc: '' };
                  const isVisible = activeLayers[lKey];
                  return (
                    <div
                      key={lKey}
                      onClick={() => setActiveLayers((prev) => ({ ...prev, [lKey]: !prev[lKey] }))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        background: isVisible ? (isLight ? '#f8fafc' : 'rgba(255,255,255,0.05)') : (isLight ? '#f1f5f9' : 'rgba(0,0,0,0.2)'),
                        border: isVisible ? `1px solid ${themeColors.border}` : '1px solid transparent',
                        borderRadius: '5px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        opacity: isVisible ? 1 : 0.55
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '3px',
                            background: meta.color,
                            boxShadow: isVisible ? `0 0 6px ${meta.color}88` : 'none',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: isVisible ? themeColors.textPrimary : themeColors.textMuted }}>{lKey}</span>
                          <span style={{ fontSize: '0.65rem', color: themeColors.textSecondary }}>{meta.name}</span>
                        </div>
                      </div>
                      {isVisible ? <Eye size={14} color="#10b981" /> : <EyeOff size={14} color={themeColors.textMuted} />}
                    </div>
                  );
                })}
              </div>
            )}

            {sidebarTab === 'props' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedCompData ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: themeColors.textPrimary }}>{selectedCompData.ref}</span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: isLight ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.25)', color: isLight ? '#7c3aed' : '#c084fc', borderRadius: '4px', border: `1px solid ${isLight ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.4)'}` }}>
                          {selectedCompData.package}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedComponent(null)}
                        style={{ background: 'none', border: 'none', color: themeColors.textSecondary, fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Clear
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.72rem', background: themeColors.cardBg, border: `1px solid ${themeColors.cardBorder}`, padding: '8px', borderRadius: '6px' }}>
                      <div>
                        <span style={{ color: themeColors.textSecondary, display: 'block' }}>Value / Part:</span>
                        <span style={{ color: themeColors.textPrimary, fontWeight: 600 }}>{selectedCompData.value || 'N/A'}</span>
                      </div>
                      <div>
                        <span style={{ color: themeColors.textSecondary, display: 'block' }}>Layer:</span>
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>Top (F.Cu)</span>
                      </div>
                      <div>
                        <span style={{ color: themeColors.textSecondary, display: 'block' }}>Position (X, Y):</span>
                        <span style={{ color: themeColors.textPrimary, fontFamily: 'monospace' }}>{selectedCompData.position?.x?.toFixed(1) || 0}, {selectedCompData.position?.y?.toFixed(1) || 0} mm</span>
                      </div>
                      <div>
                        <span style={{ color: themeColors.textSecondary, display: 'block' }}>Rotation:</span>
                        <span style={{ color: themeColors.textPrimary, fontFamily: 'monospace' }}>{selectedCompData.position?.rotation || 0}°</span>
                      </div>
                    </div>

                    {selectedCompData.lcsc_part && (
                      <div style={{ fontSize: '0.72rem', color: isLight ? '#059669' : '#10b981', background: isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${isLight ? 'rgba(16, 185, 129, 0.2)' : 'transparent'}`, padding: '6px 8px', borderRadius: '4px' }}>
                        LCSC Part: <b>{selectedCompData.lcsc_part}</b>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: themeColors.textSecondary, fontWeight: 'bold' }}>
                        Pads & Connected Nets ({(selectedCompData.pads || []).length})
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
                        {(selectedCompData.pads || []).map((p, idx) => (
                          <div
                            key={idx}
                            onClick={() => p.net && setSelectedNet(selectedNet === p.net ? null : p.net)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 6px',
                              background: selectedNet && p.net === selectedNet ? (isLight ? 'rgba(234, 179, 8, 0.2)' : 'rgba(250, 204, 21, 0.2)') : themeColors.cardBg,
                              border: selectedNet && p.net === selectedNet ? '1px solid #facc15' : `1px solid ${themeColors.cardBorder}`,
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              cursor: p.net ? 'pointer' : 'default'
                            }}
                          >
                            <span style={{ color: themeColors.textSecondary, fontFamily: 'monospace' }}>Pin {p.num}{p.name ? ` (${p.name})` : ''}</span>
                            <span style={{ color: p.net ? (isLight ? '#b45309' : '#facc15') : themeColors.textMuted, fontWeight: 600, fontFamily: 'monospace' }}>
                              {p.net || 'NC'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Info size={15} color="#38bdf8" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: themeColors.textPrimary }}>Board Properties</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.73rem', background: themeColors.cardBg, border: `1px solid ${themeColors.cardBorder}`, padding: '10px', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Board Size:</span>
                        <span style={{ color: themeColors.textPrimary, fontWeight: 600 }}>{boardWidth} × {boardHeight} mm</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Thickness:</span>
                        <span style={{ color: themeColors.textPrimary }}>{board.thickness || 1.6} mm</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Layer Count:</span>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{board.layers || 2} Layers (2-Side)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Solder Mask:</span>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>{maskTheme.name}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Components:</span>
                        <span style={{ color: themeColors.textPrimary }}>{components.length} Placed</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Signals / Nets:</span>
                        <span style={{ color: isLight ? '#b45309' : '#facc15', fontWeight: 600 }}>{allNets.length} Nets</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Copper Traces:</span>
                        <span style={{ color: '#ef4444' }}>{traces.length} Routed</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: themeColors.textSecondary }}>Plated Vias:</span>
                        <span style={{ color: '#d97706' }}>{vias.length} Vias</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: themeColors.textSecondary, fontWeight: 'bold' }}>Design Rules (DRC)</span>
                      <div style={{ fontSize: '0.7rem', color: themeColors.textSecondary, background: themeColors.cardBg, border: `1px solid ${themeColors.cardBorder}`, padding: '6px 8px', borderRadius: '4px' }}>
                        <div>Min Trace: <b>{rules.min_trace_width || 0.254} mm</b></div>
                        <div>Min Clearance: <b>{rules.min_clearance || 0.2} mm</b></div>
                        <div>Via Drill: <b>{rules.via_drill || 0.3} mm</b></div>
                        <div>Via Dia: <b>{rules.via_diameter || 0.6} mm</b></div>
                      </div>
                    </div>

                    <span style={{ fontSize: '0.68rem', color: themeColors.textMuted, fontStyle: 'italic' }}>
                      Tip: Click any component on the PCB layout to inspect its electrical properties and pins.
                    </span>
                  </>
                )}
              </div>
            )}

            {sidebarTab === 'nets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Filter nets..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{
                    background: themeColors.inputBg,
                    border: `1px solid ${themeColors.border}`,
                    borderRadius: '4px',
                    padding: '6px 8px',
                    fontSize: '0.75rem',
                    color: themeColors.textPrimary,
                    marginBottom: '6px'
                  }}
                />
                {allNets
                  .filter((n) => !searchFilter || n.toLowerCase().includes(searchFilter.toLowerCase()))
                  .map((net) => {
                    const isSel = selectedNet === net;
                    return (
                      <div
                        key={net}
                        onClick={() => setSelectedNet(isSel ? null : net)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: isSel ? (isLight ? 'rgba(234, 179, 8, 0.2)' : 'rgba(250, 204, 21, 0.2)') : themeColors.cardBg,
                          border: isSel ? '1px solid #facc15' : `1px solid ${themeColors.cardBorder}`,
                          color: isSel ? (isLight ? '#a16207' : '#fef08a') : themeColors.textPrimary,
                          fontSize: '0.76rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{net}</span>
                        <Zap size={12} color={isSel ? '#facc15' : themeColors.textMuted} />
                      </div>
                    );
                  })}
              </div>
            )}

            {sidebarTab === 'bom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {components.map((c) => (
                  <div
                    key={c.ref}
                    onClick={() => setSelectedComponent(selectedComponent === c.ref ? null : c.ref)}
                    style={{
                      padding: '8px',
                      background: selectedComponent === c.ref ? (isLight ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.2)') : themeColors.cardBg,
                      border: selectedComponent === c.ref ? '1px solid var(--primary-violet)' : `1px solid ${themeColors.cardBorder}`,
                      borderRadius: '5px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: themeColors.textPrimary }}>
                      <span>{c.ref}</span>
                      <span style={{ color: '#06b6d4' }}>{c.package}</span>
                    </div>
                    <div style={{ color: themeColors.textSecondary, fontSize: '0.7rem', marginTop: '2px' }}>{c.value || c.description || 'Component'}</div>
                    {c.lcsc_part && (
                      <div style={{ color: isLight ? '#059669' : '#10b981', fontSize: '0.68rem', marginTop: '2px', fontFamily: 'monospace' }}>LCSC: {c.lcsc_part}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {sidebarTab === 'drc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {drcResults.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isLight ? '#059669' : '#10b981', fontSize: '0.78rem', padding: '10px' }}>
                    <CheckCircle2 size={16} />
                    <span>All Design Rules Passed!</span>
                  </div>
                ) : (
                  drcResults.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px',
                        background: d.severity === 'error' ? (isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.15)') : (isLight ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.15)'),
                        borderLeft: `3px solid ${d.severity === 'error' ? '#ef4444' : '#f59e0b'}`,
                        border: `1px solid ${themeColors.cardBorder}`,
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        color: themeColors.textPrimary
                      }}
                    >
                      {d.message}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Canvas Area */}
        <div
          style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isDragging ? 'grabbing' : viewMode === '3d' ? 'grab' : measureMode ? 'crosshair' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* ── 2D PCB Layout View ── */}
          {viewMode === 'pcb' && (
            <svg
              ref={svgRef}
              style={{ width: '100%', height: '100%', background: isLight ? '#f1f5f9' : maskTheme.bg }}
              viewBox={`0 0 1000 600`}
            >
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke={themeColors.gridStroke} strokeWidth="0.5" />
                </pattern>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {showGrid && <rect width="100%" height="100%" fill="url(#grid)" />}

              {/* Main Board Group with Zoom & Pan */}
              <g transform={`translate(${500 + pcbPan.x}, ${300 + pcbPan.y}) scale(${pcbZoom * pcbBaseScale}) translate(${-boardWidth / 2}, ${-boardHeight / 2})`}>
                {/* Board Substrate Outline & Magenta Edge.Cuts */}
                {activeLayers['Edge.Cuts'] && (
                  <g>
                    {/* Substrate Base */}
                    <rect
                      x={0}
                      y={0}
                      width={boardWidth}
                      height={boardHeight}
                      rx={board.corner_radius || 3.5}
                      fill={maskThemeKey === 'cad_dark' ? '#060813' : maskTheme.mask}
                    />

                    {/* Outer Magenta Edge.Cuts Cutline */}
                    <rect
                      x={0.15}
                      y={0.15}
                      width={boardWidth - 0.3}
                      height={boardHeight - 0.3}
                      rx={board.corner_radius || 3.5}
                      fill="none"
                      stroke="#e879f9"
                      strokeWidth="0.3"
                    />

                    {/* Inner Offset Keepout Margin */}
                    <rect
                      x={0.8}
                      y={0.8}
                      width={boardWidth - 1.6}
                      height={boardHeight - 1.6}
                      rx={(board.corner_radius || 3.5) - 0.5}
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="0.1"
                      strokeDasharray="1.2,0.8"
                      opacity="0.6"
                    />
                  </g>
                )}

                {/* Ground Plane Copper Pour */}
                {showCopperPours && activeLayers['Pours'] && (
                  <rect
                    x={1.0}
                    y={1.0}
                    width={boardWidth - 2.0}
                    height={boardHeight - 2.0}
                    rx={(board.corner_radius || 3.5) - 0.8}
                    fill={maskTheme.copper}
                    opacity="0.15"
                  />
                )}

                {/* Bottom Copper Traces (B.Cu) - Blue */}
                {activeLayers['B.Cu'] && (
                  <g>
                    {traces
                      .filter((t) => t.layer === 'B.Cu')
                      .map((t, i) => {
                        const isNetMatch = selectedNet && t.net === selectedNet;
                        const pts = (t.segments || []).map((p) => `${p[0]},${p[1]}`).join(' ');
                        const trWidth = t.width || 0.4;
                        return (
                          <g key={`b_tr_group_${i}`}>
                            <polyline
                              key={`b_tr_${i}`}
                              points={pts}
                              fill="none"
                              stroke={isNetMatch ? '#facc15' : '#3b82f6'}
                              strokeWidth={trWidth}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              filter={isNetMatch ? 'url(#glow)' : undefined}
                              opacity={selectedNet && !isNetMatch ? 0.15 : 0.9}
                            />
                            {/* Transparent Segment Hitboxes for Live Hover Dimension Inspection */}
                            {(t.segments || []).slice(0, -1).map((p1, segIdx) => {
                              const p2 = t.segments[segIdx + 1];
                              const dx = p2[0] - p1[0];
                              const dy = p2[1] - p1[1];
                              const segLength = Math.sqrt(dx * dx + dy * dy);
                              return (
                                <line
                                  key={`b_tr_hit_${i}_${segIdx}`}
                                  x1={p1[0]}
                                  y1={p1[1]}
                                  x2={p2[0]}
                                  y2={p2[1]}
                                  stroke="transparent"
                                  strokeWidth={Math.max(trWidth + 0.8, 1.8)}
                                  strokeLinecap="round"
                                  style={{ cursor: measureMode ? 'crosshair' : 'pointer' }}
                                  onMouseEnter={() => {
                                    setHoveredItem({
                                      type: 'trace',
                                      layer: 'B.Cu',
                                      net: t.net || 'Unassigned',
                                      width: trWidth,
                                      length: segLength,
                                      p1: { x: p1[0], y: p1[1] },
                                      p2: { x: p2[0], y: p2[1] },
                                      traceIndex: i,
                                      segmentIndex: segIdx
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredItem((prev) =>
                                      prev?.type === 'trace' && prev?.traceIndex === i && prev?.segmentIndex === segIdx ? null : prev
                                    );
                                  }}
                                />
                              );
                            })}
                          </g>
                        );
                      })}
                  </g>
                )}

                {/* Top Copper Traces (F.Cu) - Solid Vivid CAD Red */}
                {activeLayers['F.Cu'] && (
                  <g>
                    {traces
                      .filter((t) => t.layer !== 'B.Cu')
                      .map((t, i) => {
                        const isNetMatch = selectedNet && t.net === selectedNet;
                        const pts = (t.segments || []).map((p) => `${p[0]},${p[1]}`).join(' ');
                        const trWidth = t.width || 0.35;
                        return (
                          <g key={`f_tr_group_${i}`}>
                            <polyline
                              key={`f_tr_${i}`}
                              points={pts}
                              fill="none"
                              stroke={isNetMatch ? '#facc15' : '#ef4444'}
                              strokeWidth={trWidth}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              filter={isNetMatch ? 'url(#glow)' : undefined}
                              opacity={selectedNet && !isNetMatch ? 0.15 : 1.0}
                            />
                            {/* Transparent Segment Hitboxes for Live Hover Dimension Inspection */}
                            {(t.segments || []).slice(0, -1).map((p1, segIdx) => {
                              const p2 = t.segments[segIdx + 1];
                              const dx = p2[0] - p1[0];
                              const dy = p2[1] - p1[1];
                              const segLength = Math.sqrt(dx * dx + dy * dy);
                              return (
                                <line
                                  key={`f_tr_hit_${i}_${segIdx}`}
                                  x1={p1[0]}
                                  y1={p1[1]}
                                  x2={p2[0]}
                                  y2={p2[1]}
                                  stroke="transparent"
                                  strokeWidth={Math.max(trWidth + 0.8, 1.8)}
                                  strokeLinecap="round"
                                  style={{ cursor: measureMode ? 'crosshair' : 'pointer' }}
                                  onMouseEnter={() => {
                                    setHoveredItem({
                                      type: 'trace',
                                      layer: 'F.Cu',
                                      net: t.net || 'Unassigned',
                                      width: trWidth,
                                      length: segLength,
                                      p1: { x: p1[0], y: p1[1] },
                                      p2: { x: p2[0], y: p2[1] },
                                      traceIndex: i,
                                      segmentIndex: segIdx
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredItem((prev) =>
                                      prev?.type === 'trace' && prev?.traceIndex === i && prev?.segmentIndex === segIdx ? null : prev
                                    );
                                  }}
                                />
                              );
                            })}
                          </g>
                        );
                      })}
                  </g>
                )}

                {/* Vias (Annular copper ring with drill hole & mask border) */}
                {activeLayers['Vias'] && (
                  <g>
                    {vias.map((v, i) => {
                      const isNetMatch = selectedNet && v.net === selectedNet;
                      const dia = v.diameter || 0.6;
                      const drill = v.drill || 0.3;
                      return (
                        <g
                          key={`via_${i}`}
                          style={{ cursor: measureMode ? 'crosshair' : 'pointer' }}
                          onMouseEnter={() => {
                            setHoveredItem({
                              type: 'via',
                              net: v.net || 'GND',
                              x: v.x,
                              y: v.y,
                              diameter: dia,
                              drill: drill,
                              viaIndex: i
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredItem((prev) => (prev?.type === 'via' && prev?.viaIndex === i ? null : prev));
                          }}
                        >
                          <circle cx={v.x} cy={v.y} r={dia / 2 + 0.05} fill="#e879f9" />
                          <circle
                            cx={v.x}
                            cy={v.y}
                            r={dia / 2}
                            fill={isNetMatch ? '#facc15' : '#ef4444'}
                            stroke="#d97706"
                            strokeWidth="0.04"
                          />
                          <circle cx={v.x} cy={v.y} r={drill / 2} fill="#060813" />
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Authentic Component Footprints (SMD / THT Pads, Yellow Silkscreen, Courtyards) */}
                {components.map((c) => {
                  const isCompSel = selectedComponent === c.ref;
                  const compDims = getComponentDimensions(c);
                  return (
                    <g
                      key={`comp_${c.ref}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedComponent(c.ref);
                        setSidebarTab('props');
                      }}
                      onMouseEnter={() => {
                        setHoveredItem({
                          type: 'component',
                          ref: c.ref,
                          package: c.package,
                          value: c.value,
                          x: c.position?.x || 0,
                          y: c.position?.y || 0,
                          rotation: c.position?.rotation || 0,
                          width: compDims.width,
                          height: compDims.height,
                          padsCount: (c.pads || []).length
                        });
                      }}
                      onMouseLeave={() => {
                        setHoveredItem((prev) => (prev?.type === 'component' && prev?.ref === c.ref ? null : prev));
                      }}
                      style={{ cursor: measureMode ? 'crosshair' : 'pointer' }}
                    >
                      <Component2D component={c} isSelected={isCompSel} maskTheme={maskTheme} activeLayers={activeLayers} />
                    </g>
                  );
                })}

                {/* Board Silkscreen Text Layer (F.SilkS / B.SilkS) */}
                {silkscreen && silkscreen.length > 0 && (
                  <g pointerEvents="none">
                    {silkscreen
                      .filter((s) => (s.layer === 'B.SilkS' ? activeLayers['B.SilkS'] : activeLayers['F.SilkS']))
                      .map((s, idx) => (
                        <text
                          key={`board_silk_${idx}`}
                          x={s.x}
                          y={s.y}
                          transform={s.rotation ? `rotate(${s.rotation}, ${s.x}, ${s.y})` : undefined}
                          fill={s.layer === 'B.SilkS' ? '#93c5fd' : '#fef08a'}
                          fontSize={s.size || 0.9}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                          opacity={0.88}
                        >
                          {s.text}
                        </text>
                      ))}
                  </g>
                )}

                {/* Ratsnest Airwires */}
                {showRatsnest && (
                  <g>
                    {airwires.map((w, idx) => (
                      <line
                        key={`air_${idx}`}
                        x1={w.x1}
                        y1={w.y1}
                        x2={w.x2}
                        y2={w.y2}
                        stroke="#38bdf8"
                        strokeWidth="0.15"
                        strokeDasharray="0.6,0.6"
                        opacity="0.8"
                      />
                    ))}
                  </g>
                )}

                {/* ── CAD Dimension & Inspection Overlays ── */}
                {/* 1. Hovered Trace Segment Dimension Callout */}
                {hoveredItem && hoveredItem.type === 'trace' && hoveredItem.p1 && hoveredItem.p2 && (() => {
                  const p1 = hoveredItem.p1;
                  const p2 = hoveredItem.p2;
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const len = hoveredItem.length;
                  if (len < 0.1) return null;
                  const nx = -dy / len;
                  const ny = dx / len;
                  const offDist = Math.max(hoveredItem.width / 2 + 1.2, 1.8);
                  const p1Off = { x: p1.x + nx * offDist, y: p1.y + ny * offDist };
                  const p2Off = { x: p2.x + nx * offDist, y: p2.y + ny * offDist };
                  const midX = (p1Off.x + p2Off.x) / 2;
                  const midY = (p1Off.y + p2Off.y) / 2;
                  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;

                  const badgeText = `L: ${formatDualDim(len, 2)} | W: ${formatDualDim(hoveredItem.width, 2)}`;
                  const pillW = Math.max(badgeText.length * 0.62 + 2.0, 16);

                  return (
                    <g pointerEvents="none">
                      {/* Luminous cyan highlight along the trace segment */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#38bdf8"
                        strokeWidth={hoveredItem.width + 0.3}
                        strokeLinecap="round"
                        opacity="0.85"
                      />
                      {/* Witness lines from trace to dimension line */}
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p1.x + nx * (offDist + 0.4)}
                        y2={p1.y + ny * (offDist + 0.4)}
                        stroke="#38bdf8"
                        strokeWidth="0.14"
                        strokeDasharray="0.4,0.4"
                      />
                      <line
                        x1={p2.x}
                        y1={p2.y}
                        x2={p2.x + nx * (offDist + 0.4)}
                        y2={p2.y + ny * (offDist + 0.4)}
                        stroke="#38bdf8"
                        strokeWidth="0.14"
                        strokeDasharray="0.4,0.4"
                      />
                      {/* Dimension line parallel to trace */}
                      <line
                        x1={p1Off.x}
                        y1={p1Off.y}
                        x2={p2Off.x}
                        y2={p2Off.y}
                        stroke="#38bdf8"
                        strokeWidth="0.18"
                      />
                      {/* 45° CAD Architectural Ticks at endpoints */}
                      <line
                        x1={p1Off.x - 0.25}
                        y1={p1Off.y - 0.25}
                        x2={p1Off.x + 0.25}
                        y2={p1Off.y + 0.25}
                        stroke="#38bdf8"
                        strokeWidth="0.22"
                      />
                      <line
                        x1={p2Off.x - 0.25}
                        y1={p2Off.y - 0.25}
                        x2={p2Off.x + 0.25}
                        y2={p2Off.y + 0.25}
                        stroke="#38bdf8"
                        strokeWidth="0.22"
                      />
                      {/* Dimension Text Badge Pill */}
                      <g transform={`translate(${midX}, ${midY}) rotate(${angle})`}>
                        <rect
                          x={-pillW / 2}
                          y="-1.5"
                          width={pillW}
                          height="3.0"
                          rx="0.6"
                          fill="#090d16"
                          stroke="#38bdf8"
                          strokeWidth="0.2"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="0.65"
                          fill="#38bdf8"
                          fontSize="1.1"
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {badgeText}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* 2. Hovered Component Physical Bounding Dimensions Callout */}
                {hoveredItem && hoveredItem.type === 'component' && (() => {
                  const cx = hoveredItem.x;
                  const cy = hoveredItem.y;
                  const w = hoveredItem.width;
                  const h = hoveredItem.height;
                  const hw = w / 2;
                  const hh = h / 2;
                  const topY = cy - hh - 1.2;
                  const rightX = cx + hw + 1.2;

                  const wText = `W: ${formatDualDim(w, 2)}`;
                  const hText = `H: ${formatDualDim(h, 2)}`;
                  const wPillW = Math.max(wText.length * 0.62 + 2.0, 12);
                  const hPillW = Math.max(hText.length * 0.62 + 2.0, 12);
                  const titleText = `${hoveredItem.ref} (${hoveredItem.package || 'Footprint'})`;
                  const titlePillW = Math.max(titleText.length * 0.62 + 2.4, 14);

                  return (
                    <g pointerEvents="none">
                      {/* Cyan dashed bounding box around component */}
                      <rect
                        x={cx - hw}
                        y={cy - hh}
                        width={w}
                        height={h}
                        fill="rgba(56, 189, 248, 0.08)"
                        stroke="#38bdf8"
                        strokeWidth="0.18"
                        strokeDasharray="0.8,0.5"
                        rx="0.3"
                      />
                      {/* Top Dimension: Width */}
                      <line x1={cx - hw} y1={cy - hh} x2={cx - hw} y2={topY - 0.4} stroke="#38bdf8" strokeWidth="0.12" strokeDasharray="0.4,0.4" />
                      <line x1={cx + hw} y1={cy - hh} x2={cx + hw} y2={topY - 0.4} stroke="#38bdf8" strokeWidth="0.12" strokeDasharray="0.4,0.4" />
                      <line x1={cx - hw} y1={topY} x2={cx + hw} y2={topY} stroke="#38bdf8" strokeWidth="0.16" />
                      <line x1={cx - hw - 0.2} y1={topY - 0.2} x2={cx - hw + 0.2} y2={topY + 0.2} stroke="#38bdf8" strokeWidth="0.22" />
                      <line x1={cx + hw - 0.2} y1={topY - 0.2} x2={cx + hw + 0.2} y2={topY + 0.2} stroke="#38bdf8" strokeWidth="0.22" />
                      <g transform={`translate(${cx}, ${topY - 0.9})`}>
                        <rect x={-wPillW / 2} y="-1.1" width={wPillW} height="2.2" rx="0.5" fill="#090d16" stroke="#38bdf8" strokeWidth="0.18" opacity="0.95" />
                        <text x="0" y="0.5" fill="#38bdf8" fontSize="0.95" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {wText}
                        </text>
                      </g>
                      {/* Right Dimension: Height */}
                      <line x1={cx + hw} y1={cy - hh} x2={rightX + 0.4} y2={cy - hh} stroke="#38bdf8" strokeWidth="0.12" strokeDasharray="0.4,0.4" />
                      <line x1={cx + hw} y1={cy + hh} x2={rightX + 0.4} y2={cy + hh} stroke="#38bdf8" strokeWidth="0.12" strokeDasharray="0.4,0.4" />
                      <line x1={rightX} y1={cy - hh} x2={rightX} y2={cy + hh} stroke="#38bdf8" strokeWidth="0.16" />
                      <line x1={rightX - 0.2} y1={cy - hh - 0.2} x2={rightX + 0.2} y2={cy - hh + 0.2} stroke="#38bdf8" strokeWidth="0.22" />
                      <line x1={rightX - 0.2} y1={cy + hh - 0.2} x2={rightX + 0.2} y2={cy + hh + 0.2} stroke="#38bdf8" strokeWidth="0.22" />
                      <g transform={`translate(${rightX + 0.9}, ${cy}) rotate(90)`}>
                        <rect x={-hPillW / 2} y="-1.1" width={hPillW} height="2.2" rx="0.5" fill="#090d16" stroke="#38bdf8" strokeWidth="0.18" opacity="0.95" />
                        <text x="0" y="0.5" fill="#38bdf8" fontSize="0.95" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {hText}
                        </text>
                      </g>
                      {/* Center Designator Badge */}
                      <g transform={`translate(${cx}, ${cy - hh - 2.8})`}>
                        <rect x={-titlePillW / 2} y="-1.1" width={titlePillW} height="2.2" rx="0.5" fill="rgba(14, 165, 233, 0.95)" stroke="#38bdf8" strokeWidth="0.15" />
                        <text x="0" y="0.5" fill="#ffffff" fontSize="0.9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {titleText}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* 3. Hovered Via Diameter Callout */}
                {hoveredItem && hoveredItem.type === 'via' && (() => {
                  const vx = hoveredItem.x;
                  const vy = hoveredItem.y;
                  const dia = hoveredItem.diameter;
                  const drill = hoveredItem.drill;
                  const viaText = `Via ⌀: ${formatDualDim(dia, 2)} (Drill: ${formatDim(drill, 2)})`;
                  const viaPillW = Math.max(viaText.length * 0.62 + 2.0, 16);
                  return (
                    <g pointerEvents="none">
                      <circle cx={vx} cy={vy} r={dia / 2 + 0.35} fill="none" stroke="#38bdf8" strokeWidth="0.18" strokeDasharray="0.6,0.4" />
                      <line x1={vx - dia / 2 - 0.4} y1={vy} x2={vx + dia / 2 + 0.4} y2={vy} stroke="#38bdf8" strokeWidth="0.14" />
                      <g transform={`translate(${vx}, ${vy - dia / 2 - 1.2})`}>
                        <rect x={-viaPillW / 2} y="-1.1" width={viaPillW} height="2.2" rx="0.5" fill="#090d16" stroke="#38bdf8" strokeWidth="0.18" opacity="0.95" />
                        <text x="0" y="0.5" fill="#38bdf8" fontSize="0.9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {viaText}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* 4. Active Caliper Distance Measuring Rubberband */}
                {measureMode && measureStart && measurePreview && (() => {
                  const p1 = measureStart;
                  const p2 = measurePreview;
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;

                  const calText = `D: ${formatDualDim(dist, 2)} (ΔX: ${formatDim(Math.abs(dx))}, ΔY: ${formatDim(Math.abs(dy))})`;
                  const calPillW = Math.max(calText.length * 0.62 + 2.0, 20);

                  return (
                    <g pointerEvents="none">
                      {/* Start and preview point markers */}
                      <circle cx={p1.x} cy={p1.y} r="0.5" fill="#a855f7" stroke="#ffffff" strokeWidth="0.15" />
                      <circle cx={p2.x} cy={p2.y} r="0.5" fill="#ec4899" stroke="#ffffff" strokeWidth="0.15" />
                      {/* Delta-X and Delta-Y orthogonal projection lines */}
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p1.y} stroke="#a855f7" strokeWidth="0.12" strokeDasharray="0.6,0.6" opacity="0.75" />
                      <line x1={p2.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ec4899" strokeWidth="0.12" strokeDasharray="0.6,0.6" opacity="0.75" />
                      {/* Direct distance line */}
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#f43f5e" strokeWidth="0.24" />
                      {/* Measurement badge */}
                      <g transform={`translate(${midX}, ${midY - 1.2}) rotate(${angle})`}>
                        <rect x={-calPillW / 2} y="-1.2" width={calPillW} height="2.4" rx="0.5" fill="#090d16" stroke="#f43f5e" strokeWidth="0.2" opacity="0.95" />
                        <text x="0" y="0.5" fill="#f43f5e" fontSize="0.95" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {calText}
                        </text>
                      </g>
                    </g>
                  );
                })()}

                {/* 5. Locked Caliper Measurements */}
                {lockedMeasurements.map((m) => {
                  const p1 = m.p1;
                  const p2 = m.p2;
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const dist = m.dist;
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;
                  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;

                  const lockedText = `${formatDualDim(dist, 2)} (ΔX:${formatDim(m.dx)}, ΔY:${formatDim(m.dy)})`;
                  const lockedPillW = Math.max(lockedText.length * 0.62 + 2.0, 18);

                  return (
                    <g key={`locked_meas_${m.id}`} pointerEvents="none">
                      <circle cx={p1.x} cy={p1.y} r="0.4" fill="#8b5cf6" stroke="#ffffff" strokeWidth="0.15" />
                      <circle cx={p2.x} cy={p2.y} r="0.4" fill="#8b5cf6" stroke="#ffffff" strokeWidth="0.15" />
                      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8b5cf6" strokeWidth="0.22" />
                      <line x1={p1.x - 0.25} y1={p1.y - 0.25} x2={p1.x + 0.25} y2={p1.y + 0.25} stroke="#8b5cf6" strokeWidth="0.2" />
                      <line x1={p2.x - 0.25} y1={p2.y - 0.25} x2={p2.x + 0.25} y2={p2.y + 0.25} stroke="#8b5cf6" strokeWidth="0.2" />
                      <g transform={`translate(${midX}, ${midY - 1.1}) rotate(${angle})`}>
                        <rect x={-lockedPillW / 2} y="-1.1" width={lockedPillW} height="2.2" rx="0.5" fill="#0f172a" stroke="#8b5cf6" strokeWidth="0.2" opacity="0.95" />
                        <text x="0" y="0.5" fill="#c084fc" fontSize="0.9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                          {lockedText}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* ── 2D PCB Dimension Inspection & Caliper Status Bar ── */}
          {viewMode === 'pcb' && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                right: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(12px)',
                padding: '8px 14px',
                borderRadius: '8px',
                border: `1px solid ${themeColors.controlBorder}`,
                boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.6)',
                fontSize: '0.78rem',
                zIndex: 20,
                pointerEvents: 'auto'
              }}
            >
              {/* Left: Live Coordinate & Hover Metrics */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', overflow: 'hidden' }}>
                {/* Board Coordinates Chip */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: themeColors.textPrimary,
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ color: '#8b5cf6' }}>X:</span> {formatDim(cursorBoardPos.x)}
                  <span style={{ color: '#8b5cf6', marginLeft: '4px' }}>Y:</span> {formatDim(cursorBoardPos.y)}
                </div>

                {/* Hover Inspection Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {hoveredItem ? (
                    <>
                      {hoveredItem.type === 'trace' && (
                        <>
                          <span
                            style={{
                              background: hoveredItem.layer === 'B.Cu' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: hoveredItem.layer === 'B.Cu' ? '#60a5fa' : '#f87171',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '0.72rem'
                            }}
                          >
                            {hoveredItem.layer} TRACE
                          </span>
                          <span style={{ color: themeColors.textSecondary }}>Net: <b style={{ color: themeColors.textPrimary }}>{hoveredItem.net}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Length: <b>{formatDualDim(hoveredItem.length)}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Width: <b>{formatDualDim(hoveredItem.width)}</b></span>
                        </>
                      )}

                      {hoveredItem.type === 'component' && (
                        <>
                          <span
                            style={{
                              background: 'rgba(168, 85, 247, 0.2)',
                              color: '#c084fc',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '0.72rem'
                            }}
                          >
                            COMP {hoveredItem.ref}
                          </span>
                          <span style={{ color: themeColors.textSecondary }}>Pkg: <b style={{ color: themeColors.textPrimary }}>{hoveredItem.package || 'Footprint'}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Width: <b>{formatDualDim(hoveredItem.width)}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Height: <b>{formatDualDim(hoveredItem.height)}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: themeColors.textSecondary }}>Pads: <b>{hoveredItem.padsCount}</b></span>
                        </>
                      )}

                      {hoveredItem.type === 'via' && (
                        <>
                          <span
                            style={{
                              background: 'rgba(217, 119, 6, 0.2)',
                              color: '#fbbf24',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '0.72rem'
                            }}
                          >
                            VIA
                          </span>
                          <span style={{ color: themeColors.textSecondary }}>Net: <b style={{ color: themeColors.textPrimary }}>{hoveredItem.net}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Outer ⌀: <b>{formatDualDim(hoveredItem.diameter)}</b></span>
                          <span style={{ color: themeColors.border }}>|</span>
                          <span style={{ color: '#38bdf8' }}>Drill ⌀: <b>{formatDualDim(hoveredItem.drill)}</b></span>
                        </>
                      )}
                    </>
                  ) : (
                    <span style={{ color: themeColors.textSecondary, fontSize: '0.75rem' }}>
                      {measureMode
                        ? measureStart
                          ? '📍 Caliper point 1 set. Click second point to lock distance measurement.'
                          : '📐 Caliper active. Click any pad or point to start measuring distance.'
                        : '💡 Hover over any trace, component or via to inspect exact lengths, widths and spacing.'}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Quick Tools (Measure Caliper & Unit Toggle) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {/* Interactive Caliper Measure Tool */}
                <button
                  onClick={() => {
                    setMeasureMode((prev) => !prev);
                    setMeasureStart(null);
                    setMeasurePreview(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    background: measureMode ? 'var(--primary-violet, #8b5cf6)' : (isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)'),
                    color: measureMode ? '#ffffff' : themeColors.textPrimary,
                    border: `1px solid ${measureMode ? 'transparent' : themeColors.border}`,
                    borderRadius: '5px',
                    cursor: 'pointer'
                  }}
                  title="Interactive Point-to-Point Caliper Measurement Tool"
                >
                  <Ruler size={13} />
                  <span>{measureMode ? 'Measuring...' : 'Measure'}</span>
                </button>

                {/* Clear Measurements Button */}
                {lockedMeasurements.length > 0 && (
                  <button
                    onClick={() => setLockedMeasurements([])}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                    title="Clear all locked caliper measurements"
                  >
                    Clear ({lockedMeasurements.length})
                  </button>
                )}

                {/* Unit Toggle (mm / mil) */}
                <button
                  onClick={() => setUnitSystem((prev) => (prev === 'mm' ? 'mil' : 'mm'))}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                    color: themeColors.textPrimary,
                    border: `1px solid ${themeColors.border}`,
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}
                  title="Toggle Unit System (mm / mil)"
                >
                  {unitSystem.toUpperCase()}
                </button>
              </div>
            </div>
          )}

          {/* ── Schematic View (Connected Electrical Circuit Diagram) ── */}
          {viewMode === 'schematic' && (
            <SchematicView
              pcbData={pcbData}
              pan={schPan}
              zoom={schZoom}
              selectedComponent={selectedComponent}
              setSelectedComponent={setSelectedComponent}
              colorMode={colorMode}
            />
          )}

          {/* ── SPICE Waveform Simulation View ── */}
          {viewMode === 'simulation' && (
            <SimulationOscilloscope
              simActiveChannels={simActiveChannels}
              setSimActiveChannels={setSimActiveChannels}
              simData={simData}
              colorMode={colorMode}
            />
          )}

          {/* ── 3D Board View with Real-time 360° Three.js WebGL Engine ── */}
          {viewMode === '3d' && (
            <PcbViewer3D
              pcbData={pcbData}
              maskThemeKey={maskThemeKey}
              colorMode={colorMode}
            />
          )}

          {/* Floating HUD Controls */}
          {viewMode !== '3d' && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                display: 'flex',
                gap: '6px',
                background: themeColors.controlBg,
                backdropFilter: 'blur(12px)',
                padding: '4px',
                borderRadius: '8px',
                border: `1px solid ${themeColors.controlBorder}`,
                boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 20
              }}
            >
              <button
                onClick={() => updateActiveZoom((z) => Math.min(z * 1.2, 10.0))}
                style={{
                  padding: '6px 10px',
                  background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '6px',
                  color: themeColors.controlText,
                  cursor: 'pointer'
                }}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => updateActiveZoom((z) => Math.max(z * 0.8, 0.3))}
                style={{
                  padding: '6px 10px',
                  background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '6px',
                  color: themeColors.controlText,
                  cursor: 'pointer'
                }}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={resetView}
                style={{
                  padding: '6px 10px',
                  background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '6px',
                  color: themeColors.controlText,
                  cursor: 'pointer'
                }}
                title="Fit to Screen"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          )}

          {/* Isolated Net Badge */}
          {selectedNet && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: isLight ? 'rgba(254, 240, 138, 0.85)' : 'rgba(250, 204, 21, 0.2)',
                border: '1px solid #facc15',
                padding: '6px 12px',
                borderRadius: '8px',
                color: isLight ? '#854d0e' : '#fef08a',
                fontSize: '0.8rem',
                fontWeight: 600,
                backdropFilter: 'blur(8px)',
                boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                zIndex: 20
              }}
            >
              <Zap size={14} color={isLight ? '#b45309' : '#facc15'} />
              <span>Isolated Net: <b>{selectedNet}</b></span>
              <button
                onClick={() => setSelectedNet(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isLight ? '#854d0e' : '#fef08a',
                  cursor: 'pointer',
                  marginLeft: '4px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
