import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, History } from 'lucide-react';

export default function SlidePlayer({
  blocks = [],
  artifactId,
  token,
  onOpenHistory
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const slides = blocks.map((b) => {
    try {
      const parsed = JSON.parse(b.content);
      return {
        title: parsed.title || b.title,
        bullets: parsed.bullets || parsed.content || [],
        notes: parsed.notes || '',
        block_key: b.block_key
      };
    } catch {
      return {
        title: b.title,
        bullets: String(b.content || '').split('\n').filter(Boolean),
        notes: '',
        block_key: b.block_key
      };
    }
  });

  const currentSlide = slides[currentIndex] || { title: 'No Slides', bullets: [] };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setCurrentIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, isFullscreen]);

  return (
    <div className="slide-player-container" style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 1000, maxWidth: 'none', background: '#090d16', padding: '24px' } : {}}>
      <div className="slide-canvas">
        <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={() => onOpenHistory && onOpenHistory(currentSlide.block_key, currentSlide.title)}
          >
            <History size={12} /> Slide History
          </button>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ padding: '6px' }}
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        <div className="slide-canvas-title">{currentSlide.title}</div>
        <div className="slide-canvas-body">
          {Array.isArray(currentSlide.bullets) ? (
            <ul style={{ textAlign: 'left', display: 'inline-block', margin: 0, paddingLeft: '20px' }}>
              {currentSlide.bullets.map((b, idx) => (
                <li key={idx} style={{ marginBottom: '8px' }}>{b}</li>
              ))}
            </ul>
          ) : (
            <p>{String(currentSlide.bullets)}</p>
          )}
        </div>
      </div>

      <div className="slide-controls">
        <button
          className="canvas-btn canvas-btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} /> Previous
        </button>

        <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>
          Slide {currentIndex + 1} of {slides.length}
        </span>

        <button
          className="canvas-btn canvas-btn-secondary"
          disabled={currentIndex >= slides.length - 1}
          onClick={() => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      {/* Thumbnail Bar */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px 0', justifyContent: 'center' }}>
        {slides.map((s, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            style={{
              width: '80px',
              height: '45px',
              borderRadius: '6px',
              border: idx === currentIndex ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
              background: idx === currentIndex ? '#1e1b4b' : '#111827',
              color: '#d1d5db',
              fontSize: '10px',
              padding: '4px',
              overflow: 'hidden',
              cursor: 'pointer',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {idx + 1}. {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}
