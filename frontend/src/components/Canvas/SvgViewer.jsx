import React, { useState } from 'react';
import { Code, Eye, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function SvgViewer({ fullContent = '', blocks = [] }) {
  const [viewSource, setViewSource] = useState(false);
  const [zoom, setZoom] = useState(1);

  const rawSvg = fullContent || (blocks[0]?.content) || '';

  return (
    <div style={{ width: '100%', maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#111827', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
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
            <Code size={13} /> SVG XML Source
          </button>
        </div>

        {!viewSource && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
              <ZoomIn size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
              <ZoomOut size={13} />
            </button>
            <button className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setZoom(1)}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        )}
      </div>

      {viewSource ? (
        <pre className="code-pre" style={{ background: '#090d16', borderRadius: '8px', padding: '16px' }}>
          {rawSvg}
        </pre>
      ) : (
        <div
          style={{
            background: 'radial-gradient(circle, #1f2937 10%, #111827 90%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            minHeight: '400px'
          }}
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
            dangerouslySetInnerHTML={{ __html: rawSvg }}
          />
        </div>
      )}
    </div>
  );
}
