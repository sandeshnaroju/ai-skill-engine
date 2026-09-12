import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, Pause,
  History, Sparkles, MessageSquare, Edit3, Save, X, Code, Check,
  Type, Eye, CheckCircle2, RotateCcw
} from 'lucide-react';
import { artifactsApi } from '../../api';

function safeStr(val, fallback = '') {
  if (val == null) return fallback;
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (typeof val === 'object') return val.title || val.name || val.text || val.label || val.value || JSON.stringify(val);
  return String(val);
}

export default function SlidePlayer({
  blocks = [],
  artifactId,
  token,
  theme: appTheme,
  onOpenHistory,
  onBlockUpdated
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showTextDrawer, setShowTextDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState('text'); // 'text' | 'html' | 'notes'
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | null
  const [notesEdit, setNotesEdit] = useState('');
  const [htmlEdit, setHtmlEdit] = useState('');

  const slideStageRef = useRef(null);
  const stageContainerRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);
  const autoplayTimerRef = useRef(null);
  const autoSaveDebounceRef = useRef(null);
  const isInternalUpdateRef = useRef(false);

  // ── Proportional Vector Scaling for 16:9 Slide Canvas (1280 x 720 base) ──
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateScale = () => {
      if (stageContainerRef.current) {
        const rect = stageContainerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          // 1280px is our reference 16:9 presentation coordinate width
          setStageScale(rect.width / 1280);
        }
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    window.addEventListener('resize', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isFullscreen]);

  // ── Normalize and Parse Generative Slide Blocks ──
  const parsedSlides = useMemo(() => {
    if (!blocks || blocks.length === 0) {
      return [{
        id: 'slide_1',
        block_key: 'slide_1',
        title: 'Generative Presentation Stage',
        notes: '',
        html: `<div style="width: 100%; height: 100%; background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #090d16 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 48px; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: #ffffff;">
          <div style="padding: 6px 16px; border-radius: 999px; background: rgba(129, 140, 248, 0.15); border: 1px solid rgba(129, 140, 248, 0.4); color: #818cf8; font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 24px;">Autonomous Generative Canvas</div>
          <h1 style="font-size: 48px; font-weight: 800; margin: 0 0 16px 0; background: linear-gradient(135deg, #ffffff 40%, #818cf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Ready to Create Bespoke Decks</h1>
          <p style="font-size: 18px; color: #94a3b8; max-width: 600px; line-height: 1.6; margin: 0;">Ask the AI agent to draft an executive presentation. The AI designs the visual layout dynamically at runtime.</p>
        </div>`,
        rawPayload: {}
      }];
    }

    return blocks.map((b, idx) => {
      const raw = String(b.content || '').trim();
      let slideTitle = b.title || `Slide ${idx + 1}`;
      let slideHtml = '';
      let slideNotes = '';
      let rawPayload = {};

      try {
        const parsed = JSON.parse(raw);
        rawPayload = parsed;
        slideTitle = parsed.title || b.title || `Slide ${idx + 1}`;
        slideNotes = parsed.notes || parsed.speaker_notes || '';

        if (parsed.html || parsed.custom_html) {
          slideHtml = parsed.html || parsed.custom_html;
        } else {
          // If a JSON block has title/content without explicit html, generate clean bespoke card HTML
          const bullets = Array.isArray(parsed.bullets)
            ? parsed.bullets
            : Array.isArray(parsed.content)
              ? parsed.content
              : (parsed.subtitle ? [parsed.subtitle] : []);

          slideHtml = `
            <div style="width: 100%; height: 100%; background: radial-gradient(circle at 50% 25%, #1e1b4b 0%, #090d16 100%); display: flex; flex-direction: column; justify-content: center; padding: 56px; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: #ffffff;">
              <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: rgba(129, 140, 248, 0.15); border: 1px solid rgba(129, 140, 248, 0.4); color: #818cf8; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; width: fit-content;">Slide ${idx + 1}</div>
              <h1 style="font-size: 42px; font-weight: 800; line-height: 1.2; margin: 0 0 20px 0; background: linear-gradient(135deg, #ffffff 40%, #818cf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${slideTitle}</h1>
              ${parsed.subtitle ? `<p style="font-size: 18px; color: #94a3b8; margin: 0 0 28px 0; max-width: 720px; line-height: 1.6;">${parsed.subtitle}</p>` : ''}
              ${bullets.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 14px; max-width: 720px;">
                  ${bullets.map(it => `
                    <div class="card" style="display: flex; align-items: baseline; gap: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 16px 20px; border-radius: 12px; backdrop-filter: blur(8px);">
                      <div style="width: 8px; height: 8px; border-radius: 50%; background: #818cf8; flex-shrink: 0; margin-top: 6px;"></div>
                      <p style="font-size: 16px; color: #f1f5f9; margin: 0; line-height: 1.5;">${it}</p>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        }
      } catch {
        // Raw HTML or Markdown
        if (raw.startsWith('<')) {
          slideHtml = raw;
        } else {
          // Markdown to sleek executive card
          const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
          slideHtml = `
            <div style="width: 100%; height: 100%; background: radial-gradient(circle at 50% 25%, #1e1b4b 0%, #090d16 100%); display: flex; flex-direction: column; justify-content: center; padding: 56px; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: #ffffff;">
              <h1 style="font-size: 40px; font-weight: 800; margin: 0 0 24px 0; background: linear-gradient(135deg, #ffffff 40%, #818cf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${slideTitle}</h1>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${lines.map(line => `
                  <div class="card" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 14px 18px; border-radius: 10px; font-size: 16px; color: #cbd5e1;">
                    ${line.replace(/^[-*•]\s*/, '')}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      return {
        id: b.id || b.block_key || `slide_${idx + 1}`,
        block_key: b.block_key || `slide_${idx + 1}`,
        title: slideTitle,
        notes: slideNotes,
        html: slideHtml,
        rawPayload
      };
    });
  }, [blocks]);

  const currentSlide = parsedSlides[currentIndex] || parsedSlides[0];

  // Sync edit states when slide changes
  useEffect(() => {
    setNotesEdit(currentSlide?.notes || '');
    setHtmlEdit(currentSlide?.html || '');
  }, [currentIndex, currentSlide]);

  // ── Make Text Elements Directly Editable on Stage ──
  const setupEditableElements = useCallback(() => {
    if (!slideStageRef.current) return;
    const container = slideStageRef.current;

    // Find semantic text nodes
    const textElements = container.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, li, blockquote, span, strong, em, [class*="badge"], [class*="pill"], [class*="stat"], [class*="title"], [class*="label"], [class*="metric"], [class*="desc"]'
    );

    textElements.forEach((el) => {
      // Avoid making structural containers or SVG tags directly editable if they have children with text
      if (el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'path') return;
      if (el.children.length > 0 && Array.from(el.children).some(c => ['H1', 'H2', 'H3', 'H4', 'P', 'DIV'].includes(c.tagName))) {
        return;
      }

      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      el.classList.add('slide-editable-text');

      // Attach blur and input handlers for real-time live sync
      el.onblur = handleStageTextChange;
      el.oninput = handleStageTextInputDebounced;
    });
  }, [currentIndex]);

  // Render generative HTML into the stage container
  useEffect(() => {
    if (!slideStageRef.current || !currentSlide) return;
    isInternalUpdateRef.current = true;
    slideStageRef.current.innerHTML = currentSlide.html || '';
    setupEditableElements();
    isInternalUpdateRef.current = false;
  }, [currentIndex, currentSlide?.html, setupEditableElements]);

  // ── Auto-Save Slide Content (DOM -> Block update) ──
  const persistSlideChanges = async (newHtml, newNotes = null) => {
    if (!artifactId || !token || !currentSlide) return;

    try {
      setSaveStatus('saving');

      const targetNotes = newNotes !== null ? newNotes : currentSlide.notes;
      const targetBlockKey = currentSlide.block_key;

      // Maintain block structure: JSON payload with updated html & notes
      const updatedPayload = {
        ...(currentSlide.rawPayload || {}),
        title: currentSlide.title,
        html: newHtml,
        notes: targetNotes,
        speaker_notes: targetNotes
      };

      const serialized = JSON.stringify(updatedPayload, null, 2);

      await artifactsApi.updateBlock(
        artifactId,
        targetBlockKey,
        serialized,
        `Updated slide ${currentIndex + 1} content`,
        token
      );

      if (onBlockUpdated) {
        onBlockUpdated(targetBlockKey, serialized);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error('Failed to save slide text changes:', err);
      setSaveStatus(null);
    }
  };

  const handleStageTextChange = () => {
    if (!slideStageRef.current) return;
    const updatedHtml = slideStageRef.current.innerHTML;
    setHtmlEdit(updatedHtml);
    persistSlideChanges(updatedHtml);
  };

  const handleStageTextInputDebounced = () => {
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      if (!slideStageRef.current) return;
      const updatedHtml = slideStageRef.current.innerHTML;
      setHtmlEdit(updatedHtml);
      persistSlideChanges(updatedHtml);
    }, 1200);
  };

  // ── Manual Drawer Save Handlers ──
  const handleSaveHtmlFromDrawer = async () => {
    if (!slideStageRef.current) return;
    slideStageRef.current.innerHTML = htmlEdit;
    setupEditableElements();
    await persistSlideChanges(htmlEdit, notesEdit);
  };

  const handleSaveNotesFromDrawer = async () => {
    if (!slideStageRef.current) return;
    const currentHtml = slideStageRef.current.innerHTML;
    await persistSlideChanges(currentHtml, notesEdit);
  };

  // Extract text fields for the Quick Text form
  const extractedTextFields = useMemo(() => {
    if (!currentSlide || !currentSlide.html) return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(currentSlide.html, 'text/html');
      const nodes = doc.querySelectorAll('h1, h2, h3, h4, p, li, [class*="stat"], [class*="badge"]');
      const fields = [];

      nodes.forEach((n, idx) => {
        const text = n.textContent.trim();
        if (!text) return;
        const tag = n.tagName.toLowerCase();
        let label = 'Text Block';
        if (tag === 'h1') label = 'Primary Heading (H1)';
        else if (tag === 'h2') label = 'Subheading (H2)';
        else if (tag === 'h3') label = 'Section Header (H3)';
        else if (tag === 'p') label = 'Paragraph';
        else if (tag === 'li') label = `List Item ${idx + 1}`;
        else if (n.className && n.className.includes('badge')) label = 'Badge / Tag';
        else if (n.className && n.className.includes('stat')) label = 'Metric Callout';

        fields.push({
          id: `field_${idx}`,
          tag,
          label,
          text
        });
      });
      return fields;
    } catch {
      return [];
    }
  }, [currentSlide]);

  const handleQuickTextItemChange = (idx, newText) => {
    if (!slideStageRef.current) return;
    const textNodes = slideStageRef.current.querySelectorAll('h1, h2, h3, h4, p, li, [class*="stat"], [class*="badge"]');
    if (textNodes[idx]) {
      textNodes[idx].textContent = newText;
      handleStageTextInputDebounced();
    }
  };

  // ── Autoplay Loop ──
  useEffect(() => {
    if (isPlaying) {
      autoplayTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= parsedSlides.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 5000);
    } else {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    }
    return () => {
      if (autoplayTimerRef.current) clearInterval(autoplayTimerRef.current);
    };
  }, [isPlaying, parsedSlides.length]);

  // ── Keyboard Navigation ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept keys while typing in input/textarea or editable text node
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(parsedSlides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(f => !f);
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes(n => !n);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [parsedSlides.length, isFullscreen]);

  return (
    <div
      className={`slide-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      data-theme={appTheme || 'dark'}
    >
      {/* ── Slide Canvas & 16:9 Stage ── */}
      <div className="slide-canvas">
        {/* Top Floating Controls */}
        <div className="slide-top-actions">
          <div className="slide-generative-pill">
            <Sparkles size={13} className="slide-pill-sparkle" />
            <span>Generative Slide {currentIndex + 1} of {parsedSlides.length}</span>
          </div>

          <div className="slide-top-actions-right">
            {saveStatus === 'saving' && (
              <span className="slide-save-indicator saving">
                <span className="slide-spinner-dot" /> Saving text...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="slide-save-indicator saved">
                <CheckCircle2 size={13} /> Text saved
              </span>
            )}

            <button
              className={`canvas-action-btn ${showTextDrawer ? 'active' : ''}`}
              onClick={() => setShowTextDrawer(!showTextDrawer)}
              title="Quick Text & Content Inspector"
            >
              <Type size={14} /> Quick Text
            </button>

            <button
              className={`canvas-action-btn ${showNotes ? 'active' : ''}`}
              onClick={() => setShowNotes(!showNotes)}
              title="Toggle Speaker Notes"
            >
              <MessageSquare size={14} /> Notes
            </button>

            {onOpenHistory && (
              <button
                className="canvas-action-btn"
                onClick={() => onOpenHistory(currentSlide?.block_key, currentSlide?.title)}
                title="View Slide Version History"
              >
                <History size={14} />
              </button>
            )}

            <button
              className="canvas-action-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* ── Responsive 16:9 Slide Stage ── */}
        <div className="slide-stage-wrapper">
          <div ref={stageContainerRef} className="slide-stage-16-9">
            {/* Proportional Scaling Wrapper for 1280x720 Generative Stage */}
            <div
              className="slide-stage-scaler"
              style={{
                width: '1280px',
                height: '720px',
                transform: `scale(${stageScale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              {/* The LLM Generative Bespoke HTML Stage */}
              <div
                ref={slideStageRef}
                className="slide-generative-viewport"
                tabIndex={0}
              />
            </div>
          </div>

          {/* Floating Instruction Hint */}
          <div className="slide-wysiwyg-hint">
            <Edit3 size={12} />
            <span>Click any text to edit directly on slide</span>
          </div>
        </div>
      </div>

      {/* ── Quick Text & Source Inspector Drawer ── */}
      {showTextDrawer && (
        <div className="slide-drawer-backdrop" onClick={() => setShowTextDrawer(false)}>
          <div
            className="slide-quick-drawer"
            data-theme={appTheme || 'dark'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="slide-drawer-header">
              <div className="slide-drawer-title">
                <Type size={16} className="text-indigo-400" />
                <span>Slide Text Inspector & Content</span>
              </div>
              <button
                className="slide-drawer-close"
                onClick={() => setShowTextDrawer(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="slide-drawer-tabs">
              <button
                className={`slide-drawer-tab ${drawerTab === 'text' ? 'active' : ''}`}
                onClick={() => setDrawerTab('text')}
              >
                <Type size={13} /> Text Fields
              </button>
              <button
                className={`slide-drawer-tab ${drawerTab === 'notes' ? 'active' : ''}`}
                onClick={() => setDrawerTab('notes')}
              >
                <MessageSquare size={13} /> Speaker Notes
              </button>
              <button
                className={`slide-drawer-tab ${drawerTab === 'html' ? 'active' : ''}`}
                onClick={() => setDrawerTab('html')}
              >
                <Code size={13} /> Design Source (HTML)
              </button>
            </div>

            <div className="slide-drawer-body">
              {drawerTab === 'text' && (
                <div className="slide-drawer-fields-list">
                  <p className="slide-drawer-help">
                    Edit slide text fields directly below. Wording updates seamlessly reflow on the visual canvas.
                  </p>
                  {extractedTextFields.length === 0 ? (
                    <div className="slide-drawer-empty">
                      Click directly on any text inside the slide stage to edit.
                    </div>
                  ) : (
                    extractedTextFields.map((f, i) => (
                      <div key={f.id} className="slide-drawer-field">
                        <label className="slide-drawer-label">{f.label}</label>
                        {f.text.length > 80 ? (
                          <textarea
                            rows={3}
                            className="slide-drawer-textarea"
                            defaultValue={f.text}
                            onChange={(e) => handleQuickTextItemChange(i, e.target.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            className="slide-drawer-input"
                            defaultValue={f.text}
                            onChange={(e) => handleQuickTextItemChange(i, e.target.value)}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {drawerTab === 'notes' && (
                <div className="slide-drawer-notes-pane">
                  <label className="slide-drawer-label">Speaker Notes & Presentation Talking Points</label>
                  <textarea
                    rows={8}
                    className="slide-drawer-textarea"
                    placeholder="Talking points, narrative cues, or transition nuances for this slide..."
                    value={notesEdit}
                    onChange={(e) => setNotesEdit(e.target.value)}
                  />
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="canvas-btn canvas-btn-primary"
                      onClick={handleSaveNotesFromDrawer}
                    >
                      <Save size={13} style={{ marginRight: '4px' }} /> Save Notes
                    </button>
                  </div>
                </div>
              )}

              {drawerTab === 'html' && (
                <div className="slide-drawer-html-pane">
                  <label className="slide-drawer-label">Generative HTML5 / Inline CSS</label>
                  <textarea
                    rows={12}
                    className="slide-drawer-textarea slide-drawer-code"
                    value={htmlEdit}
                    onChange={(e) => setHtmlEdit(e.target.value)}
                  />
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="canvas-btn canvas-btn-primary"
                      onClick={handleSaveHtmlFromDrawer}
                    >
                      <Save size={13} style={{ marginRight: '4px' }} /> Apply HTML Updates
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Speaker Notes Drawer / Presenter Teleprompter Card ── */}
      {showNotes && (
        <div className="slide-notes-drawer">
          <div className="slide-notes-header">
            <div className="slide-notes-header-left">
              <MessageSquare size={13} className="text-indigo-400" />
              <span>Speaker Notes &bull; Slide {currentIndex + 1}</span>
            </div>
            <button
              className="slide-notes-close-btn"
              onClick={() => setShowNotes(false)}
              title="Close notes (N)"
            >
              <X size={14} />
            </button>
          </div>
          <div className="slide-notes-body">
            {currentSlide?.notes && currentSlide.notes.trim() ? (
              <p className="slide-notes-text">{currentSlide.notes}</p>
            ) : (
              <div className="slide-notes-empty">
                <span>No speaker notes recorded for this slide yet.</span>
                <button
                  className="canvas-btn canvas-btn-secondary slide-notes-add-btn"
                  onClick={() => {
                    setDrawerTab('notes');
                    setShowTextDrawer(true);
                  }}
                >
                  <Edit3 size={11} /> Add Talking Points
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Presentation Navigation Toolbar ── */}
      <div className="slide-controls">
        <button
          className="canvas-btn canvas-btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} /> Prev
        </button>

        <span className="slide-controls-counter">
          {currentIndex + 1} / {parsedSlides.length}
        </span>

        <button
          className={`canvas-btn ${isPlaying ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause Presentation' : 'Start Autoplay'}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          {isPlaying ? 'Pause' : 'Autoplay'}
        </button>

        <button
          className="canvas-btn canvas-btn-secondary"
          disabled={currentIndex >= parsedSlides.length - 1}
          onClick={() => setCurrentIndex((i) => Math.min(parsedSlides.length - 1, i + 1))}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Slide Deck Thumbnail Strip ── */}
      <div className="slide-thumbnails-strip">
        {parsedSlides.map((s, idx) => (
          <button
            key={s.id || idx}
            onClick={() => setCurrentIndex(idx)}
            className={`slide-thumb-card ${idx === currentIndex ? 'active' : ''}`}
          >
            <div className="slide-thumb-num">0{idx + 1}</div>
            <div className="slide-thumb-title">{s.title}</div>
            <div className="slide-thumb-type">Generative</div>
          </button>
        ))}
      </div>
    </div>
  );
}
