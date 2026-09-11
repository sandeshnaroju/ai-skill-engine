import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize2,
  Minimize2, Download, Copy, Check, Grid, Image as ImageIcon,
  AlertCircle, RefreshCw
} from 'lucide-react';
import { artifactsApi } from '../../api';

export default function ImageViewer({ artifact, token }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showCheckerboard, setShowCheckerboard] = useState(true);
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Determine media URL
  const rawUrl = artifact?.media_url || (artifact?.id ? artifactsApi.getExportUrl(artifact.id, token) : '');
  const [imgSrc, setImgSrc] = useState(rawUrl);

  useEffect(() => {
    const url = artifact?.media_url || (artifact?.id ? artifactsApi.getExportUrl(artifact.id, token) : '');
    setImgSrc(url);
    setImgError(false);
    setLoading(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, [artifact?.id, artifact?.media_url, token]);

  const handleImageLoad = (e) => {
    setLoading(false);
    setImgError(false);
    if (e.target) {
      setNaturalDimensions({
        width: e.target.naturalWidth,
        height: e.target.naturalHeight
      });
    }
  };

  const handleImageError = () => {
    setLoading(false);
    setImgError(true);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(Number((z * 1.25).toFixed(2)), 10));
  const handleZoomOut = () => setZoom((z) => Math.max(Number((z / 1.25).toFixed(2)), 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };
  const handleActualSize = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const handleRotateCw = () => setRotation((r) => (r + 90) % 360);
  const handleRotateCcw = () => setRotation((r) => (r - 90 + 360) % 360);

  // Wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => {
      const next = prev * factor;
      return Math.min(Math.max(Number(next.toFixed(2)), 0.1), 10);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Drag to pan
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoom === 1) {
      setZoom(2);
    } else {
      handleResetZoom();
    }
  };

  const handleCopyUrl = () => {
    if (!imgSrc) return;
    const fullUrl = imgSrc.startsWith('http') ? imgSrc : `${window.location.origin}${imgSrc}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filename = artifact?.filename || 'image.png';
  const format = filename.split('.').pop().toUpperCase();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#090d16',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* ── Top Floating Toolbar ── */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(17, 24, 39, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '4px 10px',
          zIndex: 15,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
        }}
      >
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <ZoomOut size={16} />
        </button>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#93c5fd',
            minWidth: '45px',
            textAlign: 'center',
            cursor: 'pointer'
          }}
          onClick={handleResetZoom}
          title="Click to reset zoom"
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <ZoomIn size={16} />
        </button>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 2px' }} />

        <button
          type="button"
          onClick={handleActualSize}
          title="Actual Size (1:1)"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <Maximize2 size={15} />
        </button>

        <button
          type="button"
          onClick={handleResetZoom}
          title="Fit to Screen"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <Minimize2 size={15} />
        </button>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 2px' }} />

        <button
          type="button"
          onClick={handleRotateCcw}
          title="Rotate 90° Left"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <RotateCcw size={15} />
        </button>

        <button
          type="button"
          onClick={handleRotateCw}
          title="Rotate 90° Right"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', cursor: 'pointer' }}
        >
          <RotateCw size={15} />
        </button>

        <button
          type="button"
          onClick={() => setShowCheckerboard(prev => !prev)}
          title={showCheckerboard ? 'Hide Checkerboard' : 'Show Transparency Checkerboard'}
          className="canvas-btn-icon"
          style={{
            padding: '6px',
            borderRadius: '50%',
            background: showCheckerboard ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
            border: 'none',
            color: showCheckerboard ? '#a5b4fc' : '#e5e7eb',
            cursor: 'pointer'
          }}
        >
          <Grid size={15} />
        </button>

        <div style={{ width: '1px', height: '18px', background: 'rgba(255, 255, 255, 0.12)', margin: '0 2px' }} />

        <button
          type="button"
          onClick={handleCopyUrl}
          title="Copy Image URL"
          className="canvas-btn-icon"
          style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: copied ? '#34d399' : '#e5e7eb', cursor: 'pointer' }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>

        {artifact?.id && (
          <a
            href={artifactsApi.getExportUrl(artifact.id, token)}
            download={filename}
            title="Download Image"
            className="canvas-btn-icon"
            style={{ padding: '6px', borderRadius: '50%', background: 'transparent', border: 'none', color: '#e5e7eb', display: 'flex', alignItems: 'center' }}
          >
            <Download size={15} />
          </a>
        )}
      </div>

      {/* ── Main Viewport Canvas ── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#0a0f1d',
          backgroundImage: showCheckerboard
            ? 'linear-gradient(45deg, #111827 25%, transparent 25%), linear-gradient(-45deg, #111827 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #111827 75%), linear-gradient(-45deg, transparent 75%, #111827 75%)'
            : 'none',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
        }}
      >
        {loading && (
          <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#9ca3af', zIndex: 5 }}>
            <RefreshCw size={28} className="spin-animation" style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '13px' }}>Loading image...</span>
          </div>
        )}

        {imgError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', maxWidth: '400px', textAlign: 'center', padding: '24px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', zIndex: 10 }}>
            <AlertCircle size={36} color="#ef4444" />
            <div style={{ color: '#f87171', fontWeight: 600, fontSize: '15px' }}>Unable to load image file</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.5 }}>
              The image source could not be resolved or downloaded. Verify that the file exists in storage.
            </div>
            {artifact?.id && (
              <a
                href={artifactsApi.getExportUrl(artifact.id, token)}
                download={filename}
                className="canvas-btn canvas-btn-primary"
                style={{ textDecoration: 'none', fontSize: '12px', marginTop: '6px' }}
              >
                <Download size={13} /> Try Direct Download
              </a>
            )}
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transformOrigin: 'center center'
            }}
          >
            <img
              src={imgSrc}
              alt={artifact?.title || filename}
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: '4px',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                pointerEvents: 'none'
              }}
            />
          </div>
        )}
      </div>

      {/* ── Bottom HUD Footer ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '16px',
          right: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 15
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(17, 24, 39, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '4px 12px',
            fontSize: '11px',
            color: '#9ca3af',
            pointerEvents: 'auto'
          }}
        >
          <ImageIcon size={13} color="#818cf8" />
          <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{filename}</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
          <span style={{ textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 600 }}>{format}</span>
          {naturalDimensions && (
            <>
              <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
              <span>{naturalDimensions.width} × {naturalDimensions.height} px</span>
            </>
          )}
        </div>

        {rotation !== 0 && (
          <div
            style={{
              background: 'rgba(17, 24, 39, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '4px 12px',
              fontSize: '11px',
              color: '#f59e0b',
              fontWeight: 600,
              pointerEvents: 'auto'
            }}
          >
            Rotated {rotation}°
          </div>
        )}
      </div>
    </div>
  );
}
