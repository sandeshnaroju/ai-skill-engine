import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  ClipboardList,
  Copy,
  Check,
  GitBranch,
  AlertTriangle,
  Tag,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import {
  parseDexpiXml,
  DEXPI_CATEGORY_COLORS,
  exportDexpiEquipmentCsv,
  exportDexpiLinesCsv,
  exportDexpiValvesCsv,
  exportDexpiInstrumentsCsv,
  exportDexpiSvg,
} from './dexpiParser';
import DexpiSchedulePanel from './dexpiSchedulePanel';

const COLOR_MODE_OPTIONS = [
  { value: 'original', label: 'Original DEXPI Colors' },
  { value: 'discipline', label: 'Color by Discipline' },
  { value: 'pipingClass', label: 'Color by Piping Class' },
];

const EXPORT_OPTIONS = [
  { value: '', label: 'Export...' },
  { value: 'equipment', label: 'Equipment List (CSV)' },
  { value: 'lines', label: 'Line List (CSV)' },
  { value: 'valves', label: 'Valve Schedule (CSV)' },
  { value: 'instruments', label: 'Instrument Index (CSV)' },
  { value: 'svg', label: 'Vector Drawing (SVG)' },
];

const SPEC_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

function hashColor(str) {
  if (!str) return '#64748b';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return SPEC_PALETTE[h % SPEC_PALETTE.length];
}

function arcPath(cx, cy, rx, ry, startDeg, endDeg, flipY, yAxisUp = true) {
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x1 = cx + rx * Math.cos(s);
  const y1 = flipY(cy + ry * Math.sin(s));
  const x2 = cx + rx * Math.cos(e);
  const y2 = flipY(cy + ry * Math.sin(e));
  let diff = endDeg - startDeg;
  while (diff < 0) diff += 360;
  while (diff >= 360) diff -= 360;
  const largeArc = diff > 180 ? 1 : 0;
  const sweepFlag = yAxisUp ? 0 : 1;
  return `M ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

function adaptDexpiColor(c, isDark) {
  if (!c) return null;
  if (isDark && (c === 'rgb(0,0,0)' || c === '#000000' || c === '#000')) {
    return '#e2e8f0';
  }
  return c;
}

function textAlignAttrs(alignment = 'CenterCenter') {
  const a = String(alignment).toLowerCase();
  const anchor = a.includes('left') ? 'start' : a.includes('right') ? 'end' : 'middle';
  const baseline = a.includes('top') ? 'hanging' : a.includes('bottom') ? 'auto' : 'central';
  return { anchor, baseline };
}

export default function DexpiViewer({ fullContent, filename = 'pid.xml', theme: propTheme }) {
  const [localTheme, setLocalTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setLocalTheme(propTheme);
  }, [propTheme]);
  const isDark = localTheme !== 'light';

  const model = useMemo(() => parseDexpiXml(fullContent), [fullContent]);
  const baseName = (filename || 'dexpi_pid').replace(/\.(dexpi\.xml|dexpi|xml)$/i, '');

  const [colorMode, setColorMode] = useState('original');
  const [layers, setLayers] = useState({
    equipment: true,
    piping: true,
    valve: true,
    instrument: true,
    signal: true,
    labels: true,
  });

  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  // Pan / Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const svgRef = useRef(null);

  const worldW = model.bounds.maxX - model.bounds.minX;
  const worldH = model.bounds.maxY - model.bounds.minY;
  const yAxisUp = model.yAxisUp !== false;
  const flipY = useCallback(
    (y) => (yAxisUp ? model.bounds.maxY - (y - model.bounds.minY) : y),
    [model.bounds, yAxisUp]
  );

  const entityMap = useMemo(() => {
    const m = {};
    for (const e of model.entities) m[e.id] = e;
    return m;
  }, [model.entities]);

  const selectedEntity = selectedId ? entityMap[selectedId] || null : null;
  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set();
    return new Set(model.connectionsById[selectedId] || []);
  }, [selectedId, model.connectionsById]);

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.min(20, Math.max(0.2, z * factor)));
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };

  const handleMouseUp = () => {
    dragRef.current.active = false;
  };

  const handleExportChoice = (val) => {
    if (!val) return;
    if (val === 'equipment') exportDexpiEquipmentCsv(model.equipmentList, `${baseName}_equipment.csv`);
    else if (val === 'lines') exportDexpiLinesCsv(model.lineList, `${baseName}_line_list.csv`);
    else if (val === 'valves') exportDexpiValvesCsv(model.valveList, `${baseName}_valves.csv`);
    else if (val === 'instruments') exportDexpiInstrumentsCsv(model.instrumentList, `${baseName}_instruments.csv`);
    else if (val === 'svg') exportDexpiSvg(svgRef.current, `${baseName}.svg`);
  };

  const handleCopy = (val) => {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    setCopiedKey(val);
    setTimeout(() => setCopiedKey((prev) => (prev === val ? null : prev)), 1500);
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

  if (model.error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.text, padding: 24 }}>
        <div style={{ maxWidth: 460, padding: 24, borderRadius: 12, background: colors.surface, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unable to Parse DEXPI XML</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{model.error}</div>
        </div>
      </div>
    );
  }

  const baseStroke = Math.max(worldW, worldH) * 0.0022;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.bg, color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Toolbar */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{model.meta.drawingName || baseName}</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: colors.accentSoft, color: colors.accent }}>
                {model.meta.originatingSystem || 'DEXPI'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>
              {model.equipmentList.length} Equipment · {model.lineList.length} Lines · {model.valveList.length} Valves · {model.instrumentList.length} Instruments
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <ModernSelect value={colorMode} onChange={setColorMode} options={COLOR_MODE_OPTIONS} isDark={isDark} />

          {[
            { key: 'equipment', label: 'Equip' },
            { key: 'piping', label: 'Piping' },
            { key: 'valve', label: 'Valves' },
            { key: 'instrument', label: 'Instr' },
            { key: 'signal', label: 'Signal' },
            { key: 'labels', label: 'Labels' },
          ].map((l) => (
            <button
              key={l.key}
              onClick={() => setLayers((prev) => ({ ...prev, [l.key]: !prev[l.key] }))}
              style={{
                padding: '4px 8px',
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

          <button onClick={() => setZoom((z) => Math.min(20, z * 1.25))} title="Zoom In" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.2, z * 0.8))} title="Zoom Out" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ZoomOut size={14} />
          </button>
          <button onClick={handleResetView} title="Fit to Screen" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={14} />
          </button>

          <button
            onClick={() => setShowSchedule((s) => !s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${showSchedule ? colors.accent : colors.border}`,
              background: showSchedule ? colors.accentSoft : colors.surfaceAlt,
              color: showSchedule ? colors.accent : colors.text,
              cursor: 'pointer',
            }}
          >
            <ClipboardList size={13} /> Schedules
          </button>

          <ModernSelect value="" onChange={handleExportChoice} options={EXPORT_OPTIONS} isDark={isDark} />

          <button onClick={() => setLocalTheme(isDark ? 'light' : 'dark')} title="Toggle Theme" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* Main Canvas + Property Inspector */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Vector P&ID Viewport */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            background: isDark ? '#070b12' : '#f8fafc',
            cursor: dragRef.current.active ? 'grabbing' : 'grab',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`${model.bounds.minX} ${model.bounds.minY} ${worldW} ${worldH}`}
            style={{
              width: '100%',
              height: '100%',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {model.entities.map((ent) => {
              if (ent.category !== 'annotation' && layers[ent.category] === false) return null;

              const isSel = ent.id === selectedId;
              const isConn = connectedIds.has(ent.id);
              const isHover = ent.id === hoveredId;

              let stroke =
                colorMode === 'pipingClass' && ent.pipingClass
                  ? hashColor(ent.pipingClass)
                  : DEXPI_CATEGORY_COLORS[ent.category] || '#64748b';
              if (ent.category === 'annotation') {
                stroke = isDark ? '#334155' : '#cbd5e1';
              }
              if (isSel) stroke = '#facc15';
              else if (isConn) stroke = '#22c55e';
              else if (isHover) stroke = '#38bdf8';

              const sw = isSel || isConn ? baseStroke * 2.1 : ent.category === 'piping' ? baseStroke * 1.4 : baseStroke;
              const dash = ent.category === 'signal' ? `${baseStroke * 3} ${baseStroke * 2}` : undefined;

              const primStroke = (p) => {
                if (isSel) return '#facc15';
                if (isConn) return '#22c55e';
                if (isHover) return '#38bdf8';
                if (colorMode === 'original' && p?.strokeColor) {
                  return adaptDexpiColor(p.strokeColor, isDark);
                }
                return stroke;
              };
              const primWidth = (p) => {
                if (isSel || isConn) return baseStroke * 2.1;
                if (colorMode === 'original' && p?.strokeWidth) return Math.max(p.strokeWidth, baseStroke * 0.4);
                return sw;
              };
              const primDash = (p) => {
                const ds = String(p?.dashStyle || '').toLowerCase();
                if (ds.includes('dashdot')) return `${baseStroke * 4} ${baseStroke * 1.5} ${baseStroke * 1} ${baseStroke * 1.5}`;
                if (ds.includes('dash')) return `${baseStroke * 3} ${baseStroke * 2}`;
                if (ds.includes('dot')) return `${baseStroke * 1} ${baseStroke * 1.5}`;
                return dash;
              };

              return (
                <g
                  key={ent.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(ent.id);
                  }}
                  onMouseEnter={() => setHoveredId(ent.id)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === ent.id ? null : prev))}
                  style={{ cursor: 'pointer' }}
                >
                  {ent.geometry.polylines.map((pl, idx) => (
                    <polyline
                      key={`pl-${idx}`}
                      fill="none"
                      stroke={primStroke(pl)}
                      strokeWidth={primWidth(pl)}
                      strokeDasharray={primDash(pl)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pl.points.map((p) => `${p.x},${flipY(p.y)}`).join(' ')}
                    />
                  ))}
                  {ent.geometry.polygons.map((pg, idx) => (
                    <polygon
                      key={`pg-${idx}`}
                      fill={isSel ? 'rgba(250, 204, 21, 0.18)' : 'none'}
                      stroke={primStroke(pg)}
                      strokeWidth={primWidth(pg)}
                      points={pg.points.map((p) => `${p.x},${flipY(p.y)}`).join(' ')}
                    />
                  ))}
                  {ent.geometry.circles.map((c, idx) => {
                    const rx = Math.max(c.rx ?? c.r, baseStroke * 0.4);
                    const ry = Math.max(c.ry ?? c.r, baseStroke * 0.4);
                    const cyFlip = flipY(c.cy);
                    const rotDeg = yAxisUp ? -c.rotation : c.rotation;
                    const rot = c.rotation ? `rotate(${rotDeg} ${c.cx} ${cyFlip})` : undefined;
                    return (
                      <ellipse
                        key={`c-${idx}`}
                        cx={c.cx}
                        cy={cyFlip}
                        rx={rx}
                        ry={ry}
                        transform={rot}
                        fill={isSel ? 'rgba(250, 204, 21, 0.15)' : 'none'}
                        stroke={primStroke(c)}
                        strokeWidth={primWidth(c)}
                      />
                    );
                  })}
                  {ent.geometry.arcs.map((a, idx) => (
                    <path
                      key={`a-${idx}`}
                      d={arcPath(a.cx, a.cy, Math.max(a.rx ?? a.r, 0.1), Math.max(a.ry ?? a.r, 0.1), a.startDeg, a.endDeg, flipY, yAxisUp)}
                      fill="none"
                      stroke={primStroke(a)}
                      strokeWidth={primWidth(a)}
                    />
                  ))}
                  {layers.labels &&
                    ent.geometry.texts.map((t, idx) => {
                      const { anchor, baseline } = textAlignAttrs(t.alignment);
                      const tyFlip = flipY(t.y);
                      const rotDeg = yAxisUp ? -t.rotation : t.rotation;
                      const rot = t.rotation ? `rotate(${rotDeg} ${t.x} ${tyFlip})` : undefined;
                      const txtFill = isSel
                        ? '#facc15'
                        : colorMode === 'original' && t.color
                        ? adaptDexpiColor(t.color, isDark)
                        : isDark
                        ? '#e2e8f0'
                        : '#0f172a';
                      return (
                        <text
                          key={`t-${idx}`}
                          x={t.x}
                          y={tyFlip}
                          transform={rot}
                          textAnchor={anchor}
                          dominantBaseline={baseline}
                          fill={txtFill}
                          fontSize={Math.max(t.height || baseStroke * 4, baseStroke * 2.2)}
                          fontFamily="Inter, system-ui, sans-serif"
                        >
                          {t.text}
                        </text>
                      );
                    })}
                  {layers.labels &&
                    ent.geometry.texts.length === 0 &&
                    ent.tagName &&
                    ent.tagName !== ent.id &&
                    ent.category !== 'annotation' &&
                    (() => {
                      let lx = ent.position?.x;
                      let ly = ent.position?.y;
                      if ((lx == null || ly == null) && ent.geometry.polylines.length > 0) {
                        const longest = ent.geometry.polylines.reduce(
                          (best, pl) => (pl.points.length > best.points.length ? pl : best),
                          ent.geometry.polylines[0]
                        );
                        if (longest?.points?.length >= 2) {
                          const mid = longest.points[Math.floor(longest.points.length / 2)];
                          lx = mid.x;
                          ly = mid.y;
                        }
                      }
                      if (lx == null || ly == null) return null;
                      return (
                        <text
                          x={lx}
                          y={flipY(ly)}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isSel ? '#facc15' : isDark ? '#e2e8f0' : '#0f172a'}
                          stroke={isDark ? '#070b12' : '#f8fafc'}
                          strokeWidth={baseStroke * 0.9}
                          paintOrder="stroke"
                          fontSize={baseStroke * 3.0}
                          fontWeight={600}
                          fontFamily="Inter, system-ui, sans-serif"
                        >
                          {ent.tagName}
                        </text>
                      );
                    })()}
                </g>
              );
            })}
          </svg>

          {/* Zoom HUD */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '4px 9px', borderRadius: 6, background: colors.surface, border: `1px solid ${colors.border}`, fontSize: 11, color: colors.textMuted }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Right Property Inspector */}
        <aside style={{ width: 310, minWidth: 260, borderLeft: `1px solid ${colors.border}`, background: colors.surface, overflowY: 'auto', minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedEntity ? (
            <div style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingTop: 32 }}>
              Click any equipment, pipe line, valve, or instrument on the P&ID or in the schedule drawer to inspect its ISO 15926 attributes and connections.
            </div>
          ) : (
            <>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Tag size={13} style={{ color: DEXPI_CATEGORY_COLORS[selectedEntity.category] || colors.accent }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: colors.textMuted }}>
                    {selectedEntity.category}
                  </span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedEntity.tagName}</div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{selectedEntity.componentClass}</div>
              </div>

              <div style={{ padding: 10, borderRadius: 8, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <span style={{ color: colors.textMuted }}>ID: </span>
                  <code>{selectedEntity.id}</code>
                </div>
                {selectedEntity.componentClassURI && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedEntity.componentClassURI}>
                      URI: {selectedEntity.componentClassURI}
                    </span>
                    <button onClick={() => handleCopy(selectedEntity.componentClassURI)} style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                      {copiedKey === selectedEntity.componentClassURI ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                )}
                {selectedEntity.lineTag && (
                  <div>
                    <span style={{ color: colors.textMuted }}>Line: </span>
                    <strong>{selectedEntity.lineTag}</strong>
                  </div>
                )}
              </div>

              {/* Connected Nodes */}
              {connectedIds.size > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <GitBranch size={13} style={{ color: '#22c55e' }} /> Connected Elements ({connectedIds.size})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from(connectedIds).map((cid) => {
                      const target = entityMap[cid];
                      return (
                        <button
                          key={cid}
                          onClick={() => setSelectedId(cid)}
                          style={{
                            padding: '3px 8px',
                            fontSize: 11,
                            borderRadius: 6,
                            border: `1px solid ${colors.border}`,
                            background: colors.surfaceAlt,
                            color: colors.text,
                            cursor: 'pointer',
                          }}
                        >
                          {target?.tagName || cid}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GenericAttributes Table */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                  Generic Attributes ({selectedEntity.attributes.length})
                </div>
                {selectedEntity.attributes.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: colors.textMuted }}>No generic attributes recorded.</div>
                ) : (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    {selectedEntity.attributes.map((a, idx) => (
                      <div
                        key={`${a.name}-${idx}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '6px 9px',
                          fontSize: 11,
                          borderBottom: idx < selectedEntity.attributes.length - 1 ? `1px solid ${colors.border}` : 'none',
                          background: idx % 2 === 0 ? 'transparent' : colors.surfaceAlt,
                        }}
                      >
                        <span style={{ color: colors.textMuted }}>{a.name}</span>
                        <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{a.value || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Collapsible Engineering Schedule Drawer */}
      {showSchedule && (
        <DexpiSchedulePanel
          model={model}
          selectedId={selectedId}
          onSelectEntity={(id) => setSelectedId(id)}
          onClose={() => setShowSchedule(false)}
          isDark={isDark}
          baseName={baseName}
        />
      )}
    </div>
  );
}
