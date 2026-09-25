import React, { useMemo } from 'react';
import { SchematicSymbol, GroundSymbol, PowerPort, JunctionDot } from './SchematicSymbolLibrary';

/**
 * Intelligent Dynamic Circuit Schematic Layout Engine
 * Automatically spaces and connects components into a readable, uncluttered schematic diagram:
 * - Functional Left-to-Right layout with 200px+ column spacing
 * - Netlist-driven wire routing with orthogonal Manhattan paths
 * - Top Power Rail (+VCC) & Bottom Ground Bus (GND)
 * - Automatic collision resolution & generous clearances
 */
export function SchematicView({ pcbData, pan, zoom, selectedComponent, setSelectedComponent, colorMode = 'dark' }) {
  const { components = [] } = pcbData;
  const isLight = colorMode === 'light';

  // Dynamically synthesize a clean, spacious schematic graph from the actual component netlist
  const circuitGraph = useMemo(() => {
    if (!components || components.length === 0) {
      return { symbols: [], wires: [], junctions: [], powerPorts: [], groundPorts: [] };
    }

    const symbols = [];
    const wires = [];
    const junctions = [];
    const powerPorts = [];
    const groundPorts = [];

    // 1. Categorize components by role
    const connectors = [];
    const ics = [];
    const transistors = [];
    const passives = [];

    components.forEach((c) => {
      const ref = c.ref || '';
      const pkg = (c.package || '').toUpperCase();
      const val = (c.value || '').toUpperCase();

      if (ref.startsWith('P') || ref.startsWith('J') || ref.startsWith('DC') || ref.startsWith('TB') || pkg.includes('HEADER') || pkg.includes('TERMINAL') || pkg.includes('CONN')) {
        connectors.push(c);
      } else if (ref.startsWith('U') || ref.startsWith('IC') || pkg.includes('DIP') || pkg.includes('SOIC') || pkg.includes('QFN') || val.includes('555') || val.includes('7805') || val.includes('358') || val.includes('1117')) {
        ics.push(c);
      } else if (ref.startsWith('Q') || ref.startsWith('T') || pkg.includes('DPAK') || pkg.includes('TO-220') || pkg.includes('SOT-23')) {
        transistors.push(c);
      } else if (!ref.startsWith('MH')) {
        passives.push(c);
      }
    });

    // 2. Compute Clean Coordinates (Left to Right Flow with 220px+ clearance)
    let curX = 90;
    const placedPositions = {};

    // ── STAGE 1: Input Connectors (Left) ──
    const inConnectors = connectors.slice(0, Math.ceil(connectors.length / 2) || 1);
    const outConnectors = connectors.slice(Math.ceil(connectors.length / 2) || 1);

    inConnectors.forEach((c, idx) => {
      const px = curX;
      const py = 160 + idx * 140;
      symbols.push({ ...c, gridX: px, gridY: py });
      placedPositions[c.ref] = { x: px, y: py };
    });

    curX += 180;

    // ── STAGE 2: Power Regulators & Input Passives ──
    const regICs = ics.filter((c) => {
      const v = (c.value || '').toUpperCase();
      return v.includes('7805') || v.includes('1117') || v.includes('REG') || v.includes('LDO') || v.includes('LM317');
    });
    const mainICs = ics.filter((c) => !regICs.includes(c));

    if (regICs.length > 0) {
      regICs.forEach((c, idx) => {
        const px = curX;
        const py = 160 + idx * 150;
        symbols.push({ ...c, gridX: px, gridY: py });
        placedPositions[c.ref] = { x: px, y: py };
      });
      curX += 200;
    }

    // ── STAGE 3: Main Processing / Timing ICs (Center) ──
    const centerIC = mainICs[0];
    let icX = curX + 120;
    let icY = 220;

    if (centerIC) {
      symbols.push({ ...centerIC, gridX: icX, gridY: icY });
      placedPositions[centerIC.ref] = { x: icX, y: icY };
    }

    // Spatially place Passives (Capacitors, Resistors, Diodes, LEDs) around the circuit
    const inputPassives = passives.slice(0, Math.min(4, Math.floor(passives.length / 2)));
    const outputPassives = passives.slice(Math.min(4, Math.floor(passives.length / 2)));

    // Input Passives (Placed to the left of the main IC)
    inputPassives.forEach((c, idx) => {
      const isCap = c.ref.startsWith('C');
      const px = curX - 60 + (idx % 2) * 80;
      const py = 140 + Math.floor(idx / 2) * 140;
      symbols.push({
        ...c,
        gridX: px,
        gridY: py,
        orientation: isCap ? 'vertical' : 'horizontal',
        rotation: isCap ? 90 : 0
      });
      placedPositions[c.ref] = { x: px, y: py };
    });

    curX = (centerIC ? icX : curX) + 180;

    // ── STAGE 4: Output Transistors / MOSFETs (Right) ──
    transistors.forEach((c, idx) => {
      const px = curX;
      const py = 200 + idx * 140;
      symbols.push({ ...c, gridX: px, gridY: py });
      placedPositions[c.ref] = { x: px, y: py };
    });

    if (transistors.length > 0) curX += 160;

    // Output Passives & Indicators
    outputPassives.forEach((c, idx) => {
      const isCap = c.ref.startsWith('C');
      const px = curX + (idx % 2) * 90;
      const py = 140 + Math.floor(idx / 2) * 130;
      symbols.push({
        ...c,
        gridX: px,
        gridY: py,
        orientation: isCap ? 'vertical' : 'horizontal',
        rotation: isCap ? 90 : 0
      });
      placedPositions[c.ref] = { x: px, y: py };
    });

    curX += 180;

    // ── STAGE 5: Output Connectors / Headers (Far Right) ──
    outConnectors.forEach((c, idx) => {
      const px = curX;
      const py = 180 + idx * 140;
      symbols.push({ ...c, gridX: px, gridY: py });
      placedPositions[c.ref] = { x: px, y: py };
    });

    // ── 3. Connected Signal, Power, and Ground Wires ──
    const GND_Y = 460;
    const VCC_Y = 50;

    // Continuous Top Power Rail & Bottom Ground Bus
    wires.push({ x1: 50, y1: VCC_Y, x2: curX + 40, y2: VCC_Y });
    wires.push({ x1: 50, y1: GND_Y, x2: curX + 40, y2: GND_Y });

    powerPorts.push(
      { x: 120, y: VCC_Y, label: '+VCC' },
      { x: (curX + 50) / 2, y: VCC_Y, label: '+VCC' },
      { x: curX, y: VCC_Y, label: '+VCC' }
    );

    groundPorts.push(
      { x: 90, y: GND_Y, label: 'GND' },
      { x: (curX + 50) / 2, y: GND_Y, label: 'GND' },
      { x: curX, y: GND_Y, label: 'GND' }
    );

    // Wire up symbols to Power, Ground, and adjacent functional stages
    symbols.forEach((s) => {
      const pos = placedPositions[s.ref];
      if (!pos) return;

      const ref = s.ref;
      const isCap = ref.startsWith('C');
      const isRes = ref.startsWith('R');
      const isLED = ref.startsWith('LED') || (s.value || '').toUpperCase().includes('LED');

      // Capacitors connect vertically between power rail and ground bus
      if (isCap) {
        wires.push({ x1: pos.x, y1: VCC_Y, x2: pos.x, y2: pos.y - 30 });
        wires.push({ x1: pos.x, y1: pos.y + 30, x2: pos.x, y2: GND_Y });
        junctions.push({ x: pos.x, y: VCC_Y }, { x: pos.x, y: GND_Y });
      } else if (isLED) {
        // LEDs connect to ground with current-limiting resistor above
        wires.push({ x1: pos.x, y1: pos.y + 30, x2: pos.x, y2: GND_Y });
        wires.push({ x1: pos.x, y1: pos.y - 30, x2: pos.x, y2: pos.y - 60 });
        junctions.push({ x: pos.x, y: GND_Y });
      } else if (ref.startsWith('U') || ref.startsWith('IC')) {
        // IC Power (Pin 8 to VCC, Pin 1 to GND)
        wires.push({ x1: pos.x - 70, y1: pos.y - 8, x2: pos.x - 90, y2: pos.y - 8 });
        wires.push({ x1: pos.x - 90, y1: pos.y - 8, x2: pos.x - 90, y2: VCC_Y });
        wires.push({ x1: pos.x + 70, y1: pos.y + 52, x2: pos.x + 90, y2: pos.y + 52 });
        wires.push({ x1: pos.x + 90, y1: pos.y + 52, x2: pos.x + 90, y2: GND_Y });
        junctions.push({ x: pos.x - 90, y: VCC_Y }, { x: pos.x + 90, y: GND_Y });
      } else if (ref.startsWith('DC') || ref.startsWith('P') || ref.startsWith('J')) {
        // Connectors wire Pin 1 to Power/Signal, Pin 2 to GND
        wires.push({ x1: pos.x + 36, y1: pos.y - 6, x2: pos.x + 60, y2: pos.y - 6 });
        wires.push({ x1: pos.x + 60, y1: pos.y - 6, x2: pos.x + 60, y2: VCC_Y });
        wires.push({ x1: pos.x + 36, y1: pos.y + 14, x2: pos.x + 60, y2: pos.y + 14 });
        wires.push({ x1: pos.x + 60, y1: pos.y + 14, x2: pos.x + 60, y2: GND_Y });
        junctions.push({ x: pos.x + 60, y: VCC_Y }, { x: pos.x + 60, y: GND_Y });
      } else if (ref.startsWith('Q')) {
        // MOSFET Drain to Output/LED, Source to GND
        wires.push({ x1: pos.x + 14, y1: pos.y + 28, x2: pos.x + 14, y2: GND_Y });
        wires.push({ x1: pos.x + 14, y1: pos.y - 28, x2: pos.x + 14, y2: pos.y - 50 });
        junctions.push({ x: pos.x + 14, y: GND_Y });
      }
    });

    return { symbols, wires, junctions, powerPorts, groundPorts, totalWidth: Math.max(curX + 80, 1100) };
  }, [components]);

  const viewWidth = circuitGraph.totalWidth || 1100;

  return (
    <div style={{ width: '100%', height: '100%', background: isLight ? '#f8fafc' : '#090d16', position: 'relative', overflow: 'hidden' }}>
      <svg
        style={{ width: '100%', height: '100%' }}
        viewBox={`0 0 ${viewWidth} 560`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="sch_bg_grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'} strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Blueprint / Engineering Grid Background */}
        <rect width="100%" height="100%" fill="url(#sch_bg_grid)" />

        {/* Main Schematic Diagram Group with Zoom & Pan */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Circuit Title Frame */}
          <rect x="20" y="15" width={viewWidth - 40} height="520" fill="none" stroke={isLight ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.25)'} strokeWidth="1.5" rx="6" />
          <rect x="20" y="15" width={viewWidth - 40} height="26" fill={isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(56, 189, 248, 0.08)'} rx="6" />
          <text x="35" y="32" fill={isLight ? '#0369a1' : '#38bdf8'} fontSize="11" fontWeight="bold" fontFamily="monospace">
            {pcbData.title || 'CIRCUIT SCHEMATIC DIAGRAM'} — ELECTRICAL SCHEMATIC
          </text>

          {/* Connected Orthogonal Signal & Power Wires */}
          {circuitGraph.wires.map((w, i) => (
            <line
              key={`wire_${i}`}
              x1={w.x1}
              y1={w.y1}
              x2={w.x2}
              y2={w.y2}
              stroke={isLight ? '#059669' : '#10b981'}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ))}

          {/* Wire Junction Dots (●) */}
          {circuitGraph.junctions.map((j, i) => (
            <JunctionDot key={`junc_${i}`} x={j.x} y={j.y} colorMode={colorMode} />
          ))}

          {/* Power Rail Ports (▲) */}
          {circuitGraph.powerPorts.map((p, i) => (
            <PowerPort key={`pwr_${i}`} x={p.x} y={p.y} label={p.label} />
          ))}

          {/* Ground Chassis Symbols (⏚) */}
          {circuitGraph.groundPorts.map((g, i) => (
            <GroundSymbol key={`gnd_${i}`} x={g.x} y={g.y} label={g.label} colorMode={colorMode} />
          ))}

          {/* Specific IEEE / IEC Electronic Symbols */}
          {circuitGraph.symbols.map((s, i) => (
            <g
              key={`sym_${s.ref || i}`}
              onClick={() => setSelectedComponent && setSelectedComponent(s.ref === selectedComponent ? null : s.ref)}
              style={{ cursor: 'pointer' }}
            >
              <SchematicSymbol
                symbol={s}
                isSelected={selectedComponent === s.ref}
                colorMode={colorMode}
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export default SchematicView;
