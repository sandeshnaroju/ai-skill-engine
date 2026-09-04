import React, { useState } from 'react';
import { Code, Eye, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function SvgViewer({ fullContent = '', blocks = [] }) {
  const [viewSource, setViewSource] = useState(false);
  const [zoom, setZoom] = useState(1);

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

  return (
    <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
      {/* Top Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--canvas-header-bg)',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid var(--canvas-border)',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`canvas-btn ${!viewSource ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11px' }}
            onClick={() => setViewSource(false)}
          >
            <Eye size={13} /> Visual Preview
          </button>
          <button
            className={`canvas-btn ${viewSource ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11px' }}
            onClick={() => setViewSource(true)}
          >
            <Code size={13} /> SVG Source
          </button>
        </div>

        {!viewSource && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--doc-text-muted)', marginRight: '4px', fontWeight: 600 }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(1)))} title="Zoom In">
              <ZoomIn size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.2).toFixed(1)))} title="Zoom Out">
              <ZoomOut size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom(1)} title="Reset Zoom">
              <RotateCcw size={13} />
            </button>
          </div>
        )}
      </div>

      {viewSource ? (
        <pre className="code-pre" style={{ background: 'var(--code-container-bg)', border: '1px solid var(--canvas-border)', borderRadius: '8px', padding: '16px', color: 'var(--doc-text-color)', overflowX: 'auto', maxHeight: '600px', fontSize: '12px' }}>
          {svgMarkup || rawContent}
        </pre>
      ) : (
        <div
          style={{
            background: 'var(--doc-paper-bg)',
            border: '1px solid var(--doc-paper-border)',
            boxShadow: 'var(--doc-paper-shadow)',
            borderRadius: '12px',
            padding: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            minHeight: '380px',
            maxHeight: 'calc(100vh - 180px)',
            position: 'relative'
          }}
        >
          {svgMarkup ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '100%',
                maxHeight: '100%'
              }}
              className="canvas-svg-container"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : (
            <div style={{ color: 'var(--doc-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              No valid SVG graphics content found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

