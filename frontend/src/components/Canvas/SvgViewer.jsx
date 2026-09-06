import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Code, Eye, ZoomIn, ZoomOut, RotateCcw,
  Move, Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';

export default function SvgViewer({ fullContent = '', blocks = [] }) {
  const [viewSource, setViewSource] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // 1. Extract content from fullContent, blocks, or markdown code fences
  let rawContent = fullContent || (blocks && blocks[0] ? blocks[0].content : '') || '';

  // If content is wrapped in markdown ```xml or ```svg code fences, extract the inner code
  const cleanSvgCode = (str) => {
    if (!str) return '';
    let cleaned = str.trim();
    // Check for markdown code fences
    const fenceMatch = cleaned.match(/```(?:xml|svg|html)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    // Extract <svg>...</svg> block if surrounding text exists
    const svgTagMatch = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgTagMatch) {
      return svgTagMatch[0];
    }
    // In case of incomplete SVG during stream or if start tag is present without closing tag
    if (cleaned.includes('<svg')) {
      const startIdx = cleaned.indexOf('<svg');
      let extracted = cleaned.substring(startIdx);
      if (!extracted.includes('</svg>')) {
        extracted += '</svg>';
      }
      return extracted;
    }
    return cleaned;
  };

  const svgMarkup = cleanSvgCode(rawContent);

  // ── Mouse Drag & Pan Handlers ──
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y
    };
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse up / move listener while dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ── Touch Drag & Pan Handlers ──
  const touchStartRef = useRef({ x: 0, y: 0, dist: 0 });

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current.dist = dist;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartRef.current.dist > 0) {
        const factor = dist / touchStartRef.current.dist;
        setZoom((z) => Math.min(5, Math.max(0.2, +(z * factor).toFixed(2))));
        touchStartRef.current.dist = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartRef.current.dist = 0;
  };

  // ── Mouse Wheel Zoom & Pan ──
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl/Cmd + Wheel
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setZoom((z) => Math.min(6, Math.max(0.15, +(z + delta).toFixed(2))));
    } else if (e.shiftKey) {
      // Horizontal pan with Shift + Wheel
      setPan((p) => ({ ...p, x: p.x - e.deltaY }));
    } else {
      // Normal pan with Wheel
      setPan((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY
      }));
    }
  };

  // ── Pan Nudge Actions ──
  const nudgePan = (dx, dy) => {
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  // ── Reset View (Center & 100% Zoom) ──
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box' }}>
      {/* Top Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--canvas-header-bg)',
        padding: '8px 14px',
        borderRadius: '8px',
        border: '1px solid var(--canvas-border)',
        flexWrap: 'wrap',
        gap: '8px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`canvas-btn ${!viewSource ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11.5px', padding: '5px 12px' }}
            onClick={() => setViewSource(false)}
          >
            <Eye size={13} /> Visual Canvas
          </button>
          <button
            className={`canvas-btn ${viewSource ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11.5px', padding: '5px 12px' }}
            onClick={() => setViewSource(true)}
          >
            <Code size={13} /> SVG Source
          </button>
        </div>

        {!viewSource && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Directional Pan Nudge Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--canvas-btn-bg)', padding: '2px 4px', borderRadius: '6px', border: '1px solid var(--canvas-btn-border)' }}>
              <button className="canvas-btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => nudgePan(40, 0)} title="Pan Left">
                <ArrowLeft size={12} />
              </button>
              <button className="canvas-btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => nudgePan(0, 40)} title="Pan Up">
                <ArrowUp size={12} />
              </button>
              <button className="canvas-btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => nudgePan(0, -40)} title="Pan Down">
                <ArrowDown size={12} />
              </button>
              <button className="canvas-btn-icon" style={{ width: '22px', height: '22px' }} onClick={() => nudgePan(-40, 0)} title="Pan Right">
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Zoom Controls */}
            <span style={{ fontSize: '11.5px', color: 'var(--doc-text-muted)', margin: '0 4px', fontWeight: 600, minWidth: '42px', textAlign: 'right' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.min(6, +(z + 0.2).toFixed(2)))} title="Zoom In">
              <ZoomIn size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.max(0.15, +(z - 0.2).toFixed(2)))} title="Zoom Out">
              <ZoomOut size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={handleReset} title="Reset Zoom & Pan (Center View)">
              <RotateCcw size={13} /> <span style={{ fontSize: '11px' }}>Reset</span>
            </button>
          </div>
        )}
      </div>

      {viewSource ? (
        <pre className="code-pre" style={{ background: 'var(--code-container-bg)', border: '1px solid var(--canvas-border)', borderRadius: '8px', padding: '16px', color: 'var(--doc-text-color)', overflowX: 'auto', maxHeight: '600px', fontSize: '12px', fontFamily: 'monospace' }}>
          {svgMarkup || rawContent}
        </pre>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{
            background: 'var(--doc-paper-bg)',
            border: '1px solid var(--doc-paper-border)',
            boxShadow: 'var(--doc-paper-shadow)',
            borderRadius: '12px',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '440px',
            height: 'calc(100vh - 170px)',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            backgroundImage: `radial-gradient(var(--doc-divider, rgba(255,255,255,0.08)) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {svgMarkup ? (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none' // Allows drag events to seamlessly hit the outer viewport
              }}
              className="canvas-svg-container"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : (
            <div style={{ color: 'var(--doc-text-muted)', fontSize: '13px', fontStyle: 'italic', pointerEvents: 'none' }}>
              No valid SVG graphics content found.
            </div>
          )}

          {/* Floating Pan & Zoom Instructions Pill */}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'var(--canvas-header-bg)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--canvas-border)',
            borderRadius: '20px',
            padding: '4px 10px',
            fontSize: '10.5px',
            color: 'var(--doc-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            <Move size={11} color="#818cf8" />
            <span>Click & drag to pan • Scroll or pinch to zoom</span>
          </div>

          {/* Quick Center Floating Reset Button (When panned far or zoomed) */}
          {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) && (
            <button
              type="button"
              className="canvas-btn canvas-btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                padding: '4px 10px',
                fontSize: '11px',
                borderRadius: '20px',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                zIndex: 5
              }}
              title="Recenter Canvas"
            >
              <Maximize2 size={12} /> Center View
            </button>
          )}
        </div>
      )}
    </div>
  );
}


