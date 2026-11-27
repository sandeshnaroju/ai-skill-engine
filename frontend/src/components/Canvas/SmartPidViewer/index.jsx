import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Tag,
  GitBranch,
  ArrowRightLeft,
  Cpu,
  Download,
  Sun,
  Moon,
  Eye,
  ClipboardList,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import { parseSmartPidJson, exportPidBomCsv } from './pidParser';
import {
  exportLineListCsv,
  exportInstrumentIndexCsv,
  exportValveScheduleCsv,
  exportAnnotatedPidPng,
} from './pidAnalytics';
import PidSidebar from './pidSidebar';
import PidInspector from './pidInspector';
import PidEngineeringPanel from './pidEngineeringPanel';

const DISPLAY_MODE_OPTIONS = [
  { value: 'hybrid', label: 'Raster + Smart Overlay' },
  { value: 'dimmed', label: 'Dimmed Raster + Vectors' },
  { value: 'vector', label: 'Vector Symbols Only' },
];

const EXPORT_OPTIONS = [
  { value: 'bom', label: 'Full BOM & Tag Register (CSV)' },
  { value: 'lines', label: 'Line List (CSV)' },
  { value: 'instruments', label: 'Instrument Index (CSV)' },
  { value: 'valves', label: 'Valve & Isolation Schedule (CSV)' },
  { value: 'png', label: 'Annotated P&ID Snapshot (PNG)' },
];

function svgToDataUri(svgMarkup) {
  if (!svgMarkup || svgMarkup.includes('data-engine="empty"')) return null;
  try {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  } catch {
    return null;
  }
}

const MemoizedPidOverlay = React.memo(function MemoizedPidOverlay({
  worldWidth,
  worldHeight,
  parsed,
  layers,
  displayMode,
  selectedId,
  selectedKind,
  linkedHighlightId,
  highlightedIds,
  onSelectItem,
  onHoverChange,
}) {
  const showVectors = displayMode !== 'hybrid';

  return (
    <svg
      width={worldWidth}
      height={worldHeight}
      viewBox={`0 0 ${worldWidth} ${worldHeight}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'visible',
      }}
    >
      {/* Symbols Layer */}
      {layers.symbols &&
        parsed.symbols.map((s) => {
          const w = Math.max(4, s.x1 - s.x0);
          const h = Math.max(4, s.y1 - s.y0);
          const isSel = selectedId === s.id && selectedKind === 'symbol';
          const isLinked = linkedHighlightId === s.id || (highlightedIds && highlightedIds.has(s.id));
          const svgUri = showVectors ? svgToDataUri(s.svg) : null;

          return (
            <g
              key={`sym-${s.id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverChange(s)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(s);
              }}
            >
              {svgUri && (
                <image
                  href={svgUri}
                  x={s.x0}
                  y={s.y0}
                  width={w}
                  height={h}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <rect
                x={s.x0}
                y={s.y0}
                width={w}
                height={h}
                fill={isSel || isLinked ? `${s.color}33` : `${s.color}0a`}
                stroke={s.color}
                strokeWidth={isSel || isLinked ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                rx={3}
              />
            </g>
          );
        })}

      {/* Tags Layer */}
      {layers.tags &&
        parsed.tags.map((t) => {
          const w = Math.max(4, t.x1 - t.x0);
          const h = Math.max(4, t.y1 - t.y0);
          const isSel = selectedId === t.id && selectedKind === 'tag';
          const isLinked = linkedHighlightId && t.symbol_id === linkedHighlightId;
          return (
            <g
              key={`tag-${t.id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverChange(t)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(t);
              }}
            >
              <rect
                x={t.x0}
                y={t.y0}
                width={w}
                height={h}
                fill={isSel || isLinked ? `${t.color}38` : `${t.color}12`}
                stroke={t.color}
                strokeWidth={isSel || isLinked ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                rx={2}
              />
              {displayMode === 'vector' && (
                <text x={t.x0} y={t.y1} fontSize={Math.max(10, h * 0.85)} fill="#0f172a" fontWeight="600">
                  {t.text}
                </text>
              )}
            </g>
          );
        })}

      {/* Line Numbers Layer */}
      {layers.lines &&
        parsed.lineNumbers.map((l) => {
          const w = Math.max(4, l.x1 - l.x0);
          const h = Math.max(4, l.y1 - l.y0);
          const isSel = selectedId === l.id && selectedKind === 'line';
          return (
            <g
              key={`line-${l.id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverChange(l)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(l);
              }}
            >
              <rect
                x={l.x0}
                y={l.y0}
                width={w}
                height={h}
                fill={isSel ? `${l.color}38` : `${l.color}14`}
                stroke={l.color}
                strokeWidth={isSel ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                rx={2}
              />
              {displayMode === 'vector' && (
                <text x={l.x0} y={l.y1} fontSize={Math.max(10, h * 0.9)} fill="#1d4ed8" fontWeight="600">
                  {l.text}
                </text>
              )}
            </g>
          );
        })}

      {/* Connectors Layer */}
      {layers.connectors &&
        parsed.connectors.map((c) => {
          const w = Math.max(4, c.x1 - c.x0);
          const h = Math.max(4, c.y1 - c.y0);
          const isSel = selectedId === c.id && selectedKind === 'connector';
          const isLinked = linkedHighlightId && c.symbol_id === linkedHighlightId;
          return (
            <g
              key={`conn-${c.id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverChange(c)}
              onMouseLeave={() => onHoverChange(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(c);
              }}
            >
              <rect
                x={c.x0}
                y={c.y0}
                width={w}
                height={h}
                fill={isSel || isLinked ? `${c.color}38` : `${c.color}14`}
                stroke={c.color}
                strokeWidth={isSel || isLinked ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="6 3"
                rx={2}
              />
            </g>
          );
        })}
    </svg>
  );
});

export default function SmartPidViewer({
  fullContent,
  artifact,
  mediaUrl,
  filename = 'drawing.pandid.json',
  theme: propTheme,
}) {
  const viewportRef = useRef(null);
  const stageTransformRef = useRef(null);
  const imgRef = useRef(null);
  const rasterCanvasRef = useRef(null);
  const tooltipRef = useRef(null);

  const [theme, setTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setTheme(propTheme);
  }, [propTheme]);
  const isDark = theme !== 'light';

  const parsed = useMemo(
    () => parseSmartPidJson(fullContent, mediaUrl || artifact?.media_url || ''),
    [fullContent, mediaUrl, artifact?.media_url]
  );

  const [imgDims, setImgDims] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [fallbackImgUrl, setFallbackImgUrl] = useState('');
  const [loadProgress, setLoadProgress] = useState({
    loading: false,
    percent: 0,
    loadedBytes: 0,
    totalBytes: 0,
    stage: '',
  });
  const bitmapRef = useRef(null);

  // Stream large P&ID images with progress + off-main-thread createImageBitmap into GPU-safe canvas
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setImgDims(null);
    setImgError(false);
    setFallbackImgUrl('');
    if (bitmapRef.current) {
      try { bitmapRef.current.close(); } catch {}
      bitmapRef.current = null;
    }

    const srcUrl = parsed.imageUrl;
    if (!srcUrl) {
      setLoadProgress({ loading: false, percent: 0, loadedBytes: 0, totalBytes: 0, stage: '' });
      return () => {};
    }

    async function streamAndDecode() {
      setLoadProgress({ loading: true, percent: 5, loadedBytes: 0, totalBytes: 0, stage: 'Downloading P&ID sheet...' });
      try {
        const resp = await fetch(srcUrl, { signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10) || 0;
        let blob;

        if (resp.body && typeof resp.body.getReader === 'function') {
          const reader = resp.body.getReader();
          const chunks = [];
          let loadedBytes = 0;
          let lastTick = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loadedBytes += value.byteLength;
              const now = performance.now();
              if (!cancelled && (now - lastTick > 60 || loadedBytes === totalBytes)) {
                lastTick = now;
                const pct = totalBytes > 0 ? Math.min(92, Math.round((loadedBytes / totalBytes) * 92)) : 50;
                setLoadProgress({
                  loading: true,
                  percent: pct,
                  loadedBytes,
                  totalBytes,
                  stage: 'Downloading P&ID sheet...',
                });
              }
            }
          }
          blob = new Blob(chunks, { type: resp.headers.get('content-type') || 'image/jpeg' });
        } else {
          blob = await resp.blob();
        }

        if (cancelled) return;
        setLoadProgress((p) => ({ ...p, percent: 95, stage: 'Decoding high-res sheet...' }));

        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(blob);
          if (cancelled) {
            try { bmp.close(); } catch {}
            return;
          }
          bitmapRef.current = bmp;
          setImgDims({ width: bmp.width, height: bmp.height });
          setLoadProgress({ loading: false, percent: 100, loadedBytes: blob.size, totalBytes: blob.size, stage: '' });
        } else {
          const objUrl = URL.createObjectURL(blob);
          setFallbackImgUrl(objUrl);
        }
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled) return;
        // Fallback to direct <img> (handles cross-origin URLs without CORS headers)
        setFallbackImgUrl(srcUrl);
        setLoadProgress({ loading: false, percent: 0, loadedBytes: 0, totalBytes: 0, stage: '' });
      }
    }

    streamAndDecode();

    return () => {
      cancelled = true;
      controller.abort();
      if (bitmapRef.current) {
        try { bitmapRef.current.close(); } catch {}
        bitmapRef.current = null;
      }
    };
  }, [parsed.imageUrl]);

  // Paint decoded ImageBitmap into GPU-safe (<=4096px) canvas while preserving natural worldWidth x worldHeight
  useEffect(() => {
    const canvas = rasterCanvasRef.current;
    const bmp = bitmapRef.current;
    if (!canvas || !bmp || !imgDims) return;
    const maxTex = 4096;
    const scale = Math.min(1, maxTex / Math.max(bmp.width, bmp.height));
    const cw = Math.max(1, Math.round(bmp.width * scale));
    const ch = Math.max(1, Math.round(bmp.height * scale));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(bmp, 0, 0, cw, ch);
    requestAnimationFrame(() => fitToScreen());
  }, [imgDims]);

  const worldWidth = imgDims?.width || parsed.bounds.width;
  const worldHeight = imgDims?.height || parsed.bounds.height;

  // Imperative pan/zoom refs for zero-lag 60fps interaction without re-rendering 400+ SVG nodes
  const viewRef = useRef({ x: 20, y: 20, scale: 0.25 });
  const rafRef = useRef(null);
  const zoomDebounceRef = useRef(null);
  const [zoomPercent, setZoomPercent] = useState(25);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  const [displayMode, setDisplayMode] = useState(() =>
    parsed.imageUrl ? 'hybrid' : 'vector'
  );
  useEffect(() => {
    if (!parsed.imageUrl && displayMode !== 'vector') {
      setDisplayMode('vector');
    } else if (parsed.imageUrl && displayMode === 'vector') {
      setDisplayMode('hybrid');
    }
  }, [parsed.imageUrl]);

  const [showSidebar, setShowSidebar] = useState(false);
  const [showEngineering, setShowEngineering] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState(() => new Set());
  const [layers, setLayers] = useState({
    symbols: true,
    tags: true,
    lines: true,
    connectors: true,
  });
  const [selectedItem, setSelectedItem] = useState(null);

  const handleExportAction = useCallback(
    (action) => {
      if (action === 'bom') exportPidBomCsv(parsed, filename);
      else if (action === 'lines') exportLineListCsv(parsed, filename);
      else if (action === 'instruments') exportInstrumentIndexCsv(parsed, filename);
      else if (action === 'valves') exportValveScheduleCsv(parsed, filename);
      else if (action === 'png') {
        exportAnnotatedPidPng({
          imgEl: rasterCanvasRef.current || imgRef.current,
          worldWidth,
          worldHeight,
          parsed,
          layers,
          filename,
        });
      }
    },
    [parsed, filename, worldWidth, worldHeight, layers]
  );

  const applyViewTransform = useCallback((nextView) => {
    viewRef.current = nextView;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (stageTransformRef.current) {
        stageTransformRef.current.style.transform = `translate3d(${nextView.x}px, ${nextView.y}px, 0) scale(${nextView.scale})`;
      }
    });
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      setZoomPercent(Math.round(nextView.scale * 100));
    }, 90);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    };
  }, []);

  const fitToScreen = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !worldWidth || !worldHeight) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pad = 40;
    const scale = Math.min(
      (rect.width - pad) / worldWidth,
      (rect.height - pad) / worldHeight
    );
    const clampedScale = Math.max(0.03, Math.min(2.5, scale));
    const x = (rect.width - worldWidth * clampedScale) / 2;
    const y = (rect.height - worldHeight * clampedScale) / 2;
    applyViewTransform({ x, y, scale: clampedScale });
  }, [worldWidth, worldHeight, applyViewTransform]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => fitToScreen());
    obs.observe(el);
    return () => obs.disconnect();
  }, [fitToScreen]);

  const focusOnItem = useCallback((item) => {
    const el = viewportRef.current;
    if (!el || !item) return;
    const rect = el.getBoundingClientRect();
    const bw = Math.max(24, item.x1 - item.x0);
    const bh = Math.max(24, item.y1 - item.y0);
    const cx = (item.x0 + item.x1) / 2;
    const cy = (item.y0 + item.y1) / 2;
    const targetScale = Math.max(
      0.25,
      Math.min(3.5, Math.min(rect.width / (bw * 6), rect.height / (bh * 6)))
    );
    applyViewTransform({
      x: rect.width / 2 - cx * targetScale,
      y: rect.height / 2 - cy * targetScale,
      scale: targetScale,
    });
  }, [applyViewTransform]);

  const handleSelectItem = useCallback(
    (item) => {
      setSelectedItem(item);
      focusOnItem(item);
    },
    [focusOnItem]
  );

  // Direct DOM hover tooltip (zero React re-render on mousemove across symbols)
  const handleHoverChange = useCallback((item) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    if (!item) {
      tip.style.display = 'none';
      return;
    }
    tip.textContent = `${item.kind.toUpperCase()}: ${item.tag_no || item.text || item.name} (${item.id})`;
    tip.style.borderColor = item.color;
    tip.style.display = 'block';
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const prev = viewRef.current;
    const nextScale = Math.max(0.03, Math.min(8, prev.scale * factor));
    const ratio = nextScale / prev.scale;
    applyViewTransform({
      scale: nextScale,
      x: mx - (mx - prev.x) * ratio,
      y: my - (my - prev.y) * ratio,
    });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    const cur = viewRef.current;
    panStartRef.current = { x: e.clientX, y: e.clientY, vx: cur.x, vy: cur.y };
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    applyViewTransform({
      ...viewRef.current,
      x: panStartRef.current.vx + dx,
      y: panStartRef.current.vy + dy,
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  const zoomBy = (factor) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const prev = viewRef.current;
    const nextScale = Math.max(0.03, Math.min(8, prev.scale * factor));
    const ratio = nextScale / prev.scale;
    applyViewTransform({
      scale: nextScale,
      x: cx - (cx - prev.x) * ratio,
      y: cy - (cy - prev.y) * ratio,
    });
  };

  const linkedHighlightId = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.kind === 'symbol') return selectedItem.id;
    return selectedItem.symbol_id || null;
  }, [selectedItem]);

  const bgColor = isDark ? '#090d14' : '#f1f5f9';
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
        background: bgColor,
        color: isDark ? '#f1f5f9' : '#0f172a',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Smart P&ID Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          background: toolbarBg,
          backdropFilter: 'blur(12px)',
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
              background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(5, 150, 105, 0.1)',
              color: isDark ? '#34d399' : '#059669',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Cpu size={14} /> Smart P&ID
          </div>
          {parsed.pandidNo && (
            <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.85 }}>
              {parsed.pandidNo}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSidebar((s) => !s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: `1px solid ${showSidebar ? '#38bdf8' : borderCol}`,
              background: showSidebar ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: 'inherit',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Layers size={13} /> Index ({parsed.symbols.length + parsed.tags.length + parsed.lineNumbers.length})
          </button>
          <ModernSelect
            value={displayMode}
            onChange={setDisplayMode}
            options={DISPLAY_MODE_OPTIONS}
            icon={Eye}
            isDark={isDark}
            minWidth="170px"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'symbols', label: 'Symbols', icon: Cpu, color: '#06b6d4' },
            { key: 'tags', label: 'Tags', icon: Tag, color: '#ec4899' },
            { key: 'lines', label: 'Lines', icon: GitBranch, color: '#3b82f6' },
            { key: 'connectors', label: 'Conn', icon: ArrowRightLeft, color: '#10b981' },
          ].map((l) => {
            const Icon = l.icon;
            const on = layers[l.key];
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayers((prev) => ({ ...prev, [l.key]: !prev[l.key] }))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${on ? l.color : borderCol}`,
                  background: on ? `${l.color}22` : 'transparent',
                  color: 'inherit',
                  fontSize: '11.5px',
                  opacity: on ? 1 : 0.55,
                  cursor: 'pointer',
                }}
              >
                <Icon size={12} /> {l.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowEngineering((e) => !e)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: `1px solid ${showEngineering ? '#10b981' : borderCol}`,
              background: showEngineering ? 'rgba(16, 185, 129, 0.16)' : 'transparent',
              color: 'inherit',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ClipboardList size={13} /> Engineering
          </button>

          <ModernSelect
            value="bom"
            onChange={handleExportAction}
            options={EXPORT_OPTIONS}
            icon={Download}
            placeholder="Export..."
            isDark={isDark}
            minWidth="140px"
          />

          <button type="button" onClick={() => zoomBy(1.25)} title="Zoom In" style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <ZoomIn size={15} />
          </button>
          <button type="button" onClick={() => zoomBy(0.8)} title="Zoom Out" style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <ZoomOut size={15} />
          </button>
          <button type="button" onClick={fitToScreen} title="Fit to Screen" style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Toggle Theme"
            style={{ padding: '5px', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Interactive Pan/Zoom P&ID Canvas */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
      >
        <div
          ref={stageTransformRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${worldWidth}px`,
            height: `${worldHeight}px`,
            transform: `translate3d(${viewRef.current.x}px, ${viewRef.current.y}px, 0) scale(${viewRef.current.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            contain: 'layout style paint',
            background: displayMode === 'vector' ? '#ffffff' : 'transparent',
            borderRadius: '4px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
          }}
        >
          {/* High-res Backing Raster Sheet (GPU-safe canvas or CORS fallback img) */}
          {parsed.imageUrl && !imgError && displayMode !== 'vector' && (
            bitmapRef.current && imgDims ? (
              <canvas
                ref={rasterCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${imgDims.width}px`,
                  height: `${imgDims.height}px`,
                  display: 'block',
                  opacity: displayMode === 'dimmed' ? 0.25 : 1,
                  pointerEvents: 'none',
                }}
              />
            ) : fallbackImgUrl ? (
              <img
                ref={imgRef}
                src={fallbackImgUrl}
                alt={parsed.title}
                decoding="async"
                draggable={false}
                onLoad={(e) => {
                  const nw = e.currentTarget.naturalWidth;
                  const nh = e.currentTarget.naturalHeight;
                  if (nw > 0 && nh > 0) {
                    setImgDims({ width: nw, height: nh });
                    setLoadProgress({ loading: false, percent: 100, loadedBytes: 0, totalBytes: 0, stage: '' });
                    requestAnimationFrame(() => fitToScreen());
                  }
                }}
                onError={() => {
                  setImgError(true);
                  setLoadProgress({ loading: false, percent: 0, loadedBytes: 0, totalBytes: 0, stage: '' });
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: imgDims ? `${imgDims.width}px` : 'auto',
                  height: imgDims ? `${imgDims.height}px` : 'auto',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  display: 'block',
                  opacity: displayMode === 'dimmed' ? 0.25 : 1,
                  pointerEvents: 'none',
                }}
              />
            ) : null
          )}

          {/* Memoized GPU-Friendly SVG Overlay */}
          <MemoizedPidOverlay
            worldWidth={worldWidth}
            worldHeight={worldHeight}
            parsed={parsed}
            layers={layers}
            displayMode={displayMode}
            selectedId={selectedItem?.id || null}
            selectedKind={selectedItem?.kind || null}
            linkedHighlightId={linkedHighlightId}
            highlightedIds={highlightedIds}
            onSelectItem={setSelectedItem}
            onHoverChange={handleHoverChange}
          />
        </div>

        {/* Streaming Image Progress Overlay */}
        {loadProgress.loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isDark ? 'rgba(9, 13, 20, 0.72)' : 'rgba(241, 245, 249, 0.78)',
              backdropFilter: 'blur(4px)',
              zIndex: 40,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '320px',
                padding: '18px 20px',
                borderRadius: '12px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: `1px solid ${borderCol}`,
                boxShadow: '0 16px 32px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                {loadProgress.stage || 'Loading P&ID Sheet...'}
              </div>
              <div style={{ height: '7px', width: '100%', background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${loadProgress.percent}%`,
                    background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 100%)',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', opacity: 0.78 }}>
                <span>
                  {loadProgress.loadedBytes > 0
                    ? `${(loadProgress.loadedBytes / (1024 * 1024)).toFixed(1)} MB${loadProgress.totalBytes > 0 ? ` / ${(loadProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB` : ''}`
                    : 'Connecting...'}
                </span>
                <span style={{ fontWeight: 700 }}>{loadProgress.percent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Imperative Hover Tooltip (no React re-render on hover) */}
        <div
          ref={tooltipRef}
          style={{
            display: 'none',
            position: 'absolute',
            bottom: '44px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 12px',
            borderRadius: '999px',
            background: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #38bdf8',
            fontSize: '12px',
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 35,
            boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          }}
        />
      </div>

      {/* Left Searchable Index Sidebar */}
      {showSidebar && (
        <PidSidebar
          parsed={parsed}
          selectedItem={selectedItem}
          onSelectItem={handleSelectItem}
          onExportCsv={() => exportPidBomCsv(parsed, filename)}
          onClose={() => setShowSidebar(false)}
          isDark={isDark}
        />
      )}

      {/* Right Selected Object Inspector */}
      {selectedItem && !showEngineering && (
        <PidInspector
          item={selectedItem}
          parsed={parsed}
          onSelectItem={handleSelectItem}
          onFocusItem={focusOnItem}
          onClose={() => setSelectedItem(null)}
          isDark={isDark}
        />
      )}

      {/* Right Engineering Deliverables & QA Panel */}
      {showEngineering && (
        <PidEngineeringPanel
          parsed={parsed}
          onSelectItem={handleSelectItem}
          onHighlightSet={setHighlightedIds}
          onClose={() => {
            setShowEngineering(false);
            setHighlightedIds(new Set());
          }}
          isDark={isDark}
        />
      )}

      {/* Bottom Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 14px',
          background: toolbarBg,
          borderTop: `1px solid ${borderCol}`,
          fontSize: '11px',
          opacity: 0.85,
          zIndex: 25,
        }}
      >
        <span>
          {parsed.title} {parsed.documentNo ? `• Doc ${parsed.documentNo}` : ''}
        </span>
        <span>
          {worldWidth}×{worldHeight}px • Zoom {zoomPercent}%
        </span>
      </div>
    </div>
  );
}
