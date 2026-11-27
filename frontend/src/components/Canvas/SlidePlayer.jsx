import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2, Play, Pause,
  History, Sparkles, MessageSquare, Edit3, Save, X, Code,
  Type, CheckCircle2, Search
} from 'lucide-react';
import { artifactsApi } from '../../api';

const THUMB_WINDOW_SIZE = 24;
const MAX_CACHED_SLIDES = 24;

function addAsyncImageHints(html) {
  if (!html || !html.includes('<img')) return html;
  return html.replace(/<img(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"');
}

function parseSingleSlide(b, idx) {
  const raw = String(b?.content || '').trim();
  let slideTitle = b?.title || `Slide ${idx + 1}`;
  let slideHtml = '';
  let slideNotes = '';
  let rawPayload = {};

  try {
    const parsed = JSON.parse(raw);
    rawPayload = parsed;
    slideTitle = parsed.title || b?.title || `Slide ${idx + 1}`;
    slideNotes = parsed.notes || parsed.speaker_notes || '';

    if (parsed.html || parsed.custom_html) {
      slideHtml = parsed.html || parsed.custom_html;
    } else {
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
    if (raw.startsWith('<')) {
      slideHtml = raw;
    } else {
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
    id: b?.id || b?.block_key || `slide_${idx + 1}`,
    block_key: b?.block_key || `slide_${idx + 1}`,
    title: slideTitle,
    notes: slideNotes,
    html: addAsyncImageHints(slideHtml),
    rawPayload,
  };
}

const DEFAULT_PLACEHOLDER_SLIDE = {
  id: 'slide_1',
  block_key: 'slide_1',
  title: 'Generative Presentation Stage',
  notes: '',
  html: `<div style="width: 100%; height: 100%; background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #090d16 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 48px; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: #ffffff;">
    <div style="padding: 6px 16px; border-radius: 999px; background: rgba(129, 140, 248, 0.15); border: 1px solid rgba(129, 140, 248, 0.4); color: #818cf8; font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 24px;">Autonomous Generative Canvas</div>
    <h1 style="font-size: 48px; font-weight: 800; margin: 0 0 16px 0; background: linear-gradient(135deg, #ffffff 40%, #818cf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Ready to Create Bespoke Decks</h1>
    <p style="font-size: 18px; color: #94a3b8; max-width: 600px; line-height: 1.6; margin: 0;">Ask the AI agent to draft an executive presentation. The AI designs the visual layout dynamically at runtime.</p>
  </div>`,
  rawPayload: {},
};

export default function SlidePlayer({
  blocks = [],
  fullContent = '',
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
  const [slideFilter, setSlideFilter] = useState('');
  const [jumpInput, setJumpInput] = useState('');
  const [thumbWindowStart, setThumbWindowStart] = useState(0);

  const slideStageRef = useRef(null);
  const stageContainerRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);
  const autoplayTimerRef = useRef(null);
  const autoSaveDebounceRef = useRef(null);
  const isInternalUpdateRef = useRef(false);
  const slideCacheRef = useRef(new Map());

  // ── Proportional Vector Scaling for 16:9 Slide Canvas (1280 x 720 base) ──
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateScale = () => {
      if (stageContainerRef.current) {
        const rect = stageContainerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
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

  // ── Lightweight Slide Metadata Index (avoids parsing all 20MB+ slides upfront) ──
  const slideIndex = useMemo(() => {
    let sourceBlocks = Array.isArray(blocks) && blocks.length > 0 ? blocks : [];

    if (sourceBlocks.length === 0 && typeof fullContent === 'string' && fullContent.trim()) {
      const chunks = fullContent.split(/\n---\s*\n/).map(s => s.trim()).filter(Boolean);
      sourceBlocks = chunks.map((chunk, idx) => ({
        id: `slide_${idx + 1}`,
        block_key: `slide_${idx + 1}`,
        title: `Slide ${idx + 1}`,
        content: chunk,
      }));
    }

    if (sourceBlocks.length === 0) return [];

    return sourceBlocks.map((b, idx) => {
      const contentStr = String(b.content || '');
      let title = b.title || `Slide ${idx + 1}`;
      // Fast title peek for JSON blocks without full JSON.parse
      if (!b.title && contentStr.trimStart().startsWith('{')) {
        const m = contentStr.match(/"title"\s*:\s*"([^"]{1,140})"/);
        if (m && m[1]) title = m[1];
      }
      return {
        id: b.id || b.block_key || `slide_${idx + 1}`,
        block_key: b.block_key || `slide_${idx + 1}`,
        title,
        index: idx,
        rawBlock: b,
        cacheKey: `${b.block_key || idx}:${b.title || ''}:${contentStr.length}:${contentStr.slice(0, 64)}:${contentStr.slice(-32)}`,
      };
    });
  }, [blocks, fullContent]);

  const totalSlides = slideIndex.length || 1;

  // Clamp currentIndex if deck shrinks
  useEffect(() => {
    if (currentIndex >= totalSlides) {
      setCurrentIndex(Math.max(0, totalSlides - 1));
    }
  }, [totalSlides, currentIndex]);

  // Keep thumbnail window synced with active slide
  useEffect(() => {
    const targetStart = Math.floor(currentIndex / THUMB_WINDOW_SIZE) * THUMB_WINDOW_SIZE;
    setThumbWindowStart(targetStart);
  }, [currentIndex]);

  // Lazy-parse ONLY the active slide with bounded LRU cache
  const currentSlide = useMemo(() => {
    if (slideIndex.length === 0) return DEFAULT_PLACEHOLDER_SLIDE;
    const entry = slideIndex[currentIndex] || slideIndex[0];
    if (!entry) return DEFAULT_PLACEHOLDER_SLIDE;

    const cache = slideCacheRef.current;
    if (cache.has(entry.cacheKey)) {
      return cache.get(entry.cacheKey);
    }

    const parsed = parseSingleSlide(entry.rawBlock, entry.index);
    if (cache.size >= MAX_CACHED_SLIDES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(entry.cacheKey, parsed);
    return parsed;
  }, [slideIndex, currentIndex]);

  // Clear pending debounce timer on slide change or unmount to prevent stale saves
  useEffect(() => {
    return () => {
      if (autoSaveDebounceRef.current) {
        clearTimeout(autoSaveDebounceRef.current);
        autoSaveDebounceRef.current = null;
      }
    };
  }, [currentIndex]);

  // Sync edit states when slide changes
  useEffect(() => {
    setNotesEdit(currentSlide?.notes || '');
    setHtmlEdit(currentSlide?.html || '');
  }, [currentIndex, currentSlide]);

  // ── Auto-Save Slide Content (DOM -> Block update) ──
  const persistSlideChanges = useCallback(async (newHtml, newNotes = null) => {
    if (!artifactId || !token || !currentSlide) return;

    try {
      setSaveStatus('saving');

      const targetNotes = newNotes !== null ? newNotes : currentSlide.notes;
      const targetBlockKey = currentSlide.block_key;

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
  }, [artifactId, token, currentSlide, currentIndex, onBlockUpdated]);

  const handleStageTextChange = useCallback(() => {
    if (!slideStageRef.current) return;
    const updatedHtml = slideStageRef.current.innerHTML;
    setHtmlEdit(updatedHtml);
    persistSlideChanges(updatedHtml);
  }, [persistSlideChanges]);

  const handleStageTextInputDebounced = useCallback(() => {
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      if (!slideStageRef.current) return;
      const updatedHtml = slideStageRef.current.innerHTML;
      setHtmlEdit(updatedHtml);
      persistSlideChanges(updatedHtml);
    }, 1200);
  }, [persistSlideChanges]);

  // ── Make Text Elements Directly Editable on Stage ──
  const setupEditableElements = useCallback(() => {
    if (!slideStageRef.current) return;
    const container = slideStageRef.current;

    const textElements = container.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, li, blockquote, span, strong, em, [class*="badge"], [class*="pill"], [class*="stat"], [class*="title"], [class*="label"], [class*="metric"], [class*="desc"]'
    );

    textElements.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'svg' || tag === 'path') return;
      if (el.children.length > 0 && Array.from(el.children).some(c => ['H1', 'H2', 'H3', 'H4', 'P', 'DIV'].includes(c.tagName))) {
        return;
      }

      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      el.classList.add('slide-editable-text');

      el.onblur = handleStageTextChange;
      el.oninput = handleStageTextInputDebounced;
    });
  }, [handleStageTextChange, handleStageTextInputDebounced]);

  // Render generative HTML into the stage container
  useEffect(() => {
    if (!slideStageRef.current || !currentSlide) return;
    isInternalUpdateRef.current = true;
    slideStageRef.current.innerHTML = currentSlide.html || '';
    setupEditableElements();
    isInternalUpdateRef.current = false;
  }, [currentIndex, currentSlide?.html, setupEditableElements]);

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

  // Lazy DOMParser: only parse text fields when Quick Text tab is actually open
  const extractedTextFields = useMemo(() => {
    if (!showTextDrawer || drawerTab !== 'text' || !currentSlide || !currentSlide.html) return [];
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
        else if (n.className && String(n.className).includes('badge')) label = 'Badge / Tag';
        else if (n.className && String(n.className).includes('stat')) label = 'Metric Callout';

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
  }, [showTextDrawer, drawerTab, currentSlide]);

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
          if (prev >= totalSlides - 1) {
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
  }, [isPlaying, totalSlides]);

  // ── Keyboard Navigation ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(totalSlides - 1, i + 1));
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
  }, [totalSlides, isFullscreen]);

  // Windowed / filtered thumbnails for large decks
  const visibleThumbnails = useMemo(() => {
    const list = slideIndex.length > 0
      ? slideIndex
      : [{ ...DEFAULT_PLACEHOLDER_SLIDE, index: 0 }];
    const q = slideFilter.trim().toLowerCase();
    if (q) {
      return list
        .filter((s) => s.title.toLowerCase().includes(q) || String(s.index + 1).includes(q))
        .slice(0, THUMB_WINDOW_SIZE);
    }
    return list.slice(thumbWindowStart, thumbWindowStart + THUMB_WINDOW_SIZE);
  }, [slideIndex, slideFilter, thumbWindowStart]);

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const num = parseInt(jumpInput, 10);
    if (!Number.isNaN(num)) {
      const target = Math.max(0, Math.min(totalSlides - 1, num - 1));
      setCurrentIndex(target);
      setJumpInput('');
    }
  };

  return (
    <div
      className={`slide-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      data-theme={appTheme || 'dark'}
    >
      {/* ── Slide Canvas & 16:9 Stage ── */}
      <div className="slide-canvas">
        <div className="slide-top-actions">
          <div className="slide-generative-pill">
            <Sparkles size={13} className="slide-pill-sparkle" />
            <span>Slide {currentIndex + 1} of {totalSlides}</span>
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
              <div
                ref={slideStageRef}
                className="slide-generative-viewport"
                tabIndex={0}
              />
            </div>
          </div>

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
      <div className="slide-controls" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <button
          className="canvas-btn canvas-btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} /> Prev
        </button>

        <span className="slide-controls-counter">
          {currentIndex + 1} / {totalSlides}
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
          disabled={currentIndex >= totalSlides - 1}
          onClick={() => setCurrentIndex((i) => Math.min(totalSlides - 1, i + 1))}
        >
          Next <ChevronRight size={16} />
        </button>

        {totalSlides > 8 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={12} style={{ position: 'absolute', left: '8px', opacity: 0.55 }} />
              <input
                type="text"
                value={slideFilter}
                onChange={(e) => setSlideFilter(e.target.value)}
                placeholder="Filter slides..."
                style={{
                  padding: '4px 8px 4px 24px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'transparent',
                  color: 'inherit',
                  width: '130px',
                }}
              />
            </div>
            <form onSubmit={handleJumpSubmit} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min={1}
                max={totalSlides}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                placeholder={`1-${totalSlides}`}
                style={{
                  padding: '4px 6px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'transparent',
                  color: 'inherit',
                  width: '64px',
                }}
              />
              <button type="submit" className="canvas-btn canvas-btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                Go
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ── Windowed Slide Deck Thumbnail Strip ── */}
      {totalSlides > THUMB_WINDOW_SIZE && !slideFilter.trim() && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 0', fontSize: '11px', opacity: 0.75 }}>
          <span>
            Showing slides {thumbWindowStart + 1}–{Math.min(totalSlides, thumbWindowStart + THUMB_WINDOW_SIZE)} of {totalSlides}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="canvas-btn canvas-btn-secondary"
              disabled={thumbWindowStart === 0}
              onClick={() => setThumbWindowStart((s) => Math.max(0, s - THUMB_WINDOW_SIZE))}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              Prev {THUMB_WINDOW_SIZE}
            </button>
            <button
              type="button"
              className="canvas-btn canvas-btn-secondary"
              disabled={thumbWindowStart + THUMB_WINDOW_SIZE >= totalSlides}
              onClick={() => setThumbWindowStart((s) => s + THUMB_WINDOW_SIZE)}
              style={{ padding: '2px 8px', fontSize: '11px' }}
            >
              Next {THUMB_WINDOW_SIZE}
            </button>
          </div>
        </div>
      )}

      <div className="slide-thumbnails-strip">
        {visibleThumbnails.map((s) => (
          <button
            key={s.id || s.index}
            onClick={() => setCurrentIndex(s.index)}
            className={`slide-thumb-card ${s.index === currentIndex ? 'active' : ''}`}
          >
            <div className="slide-thumb-num">{String(s.index + 1).padStart(2, '0')}</div>
            <div className="slide-thumb-title">{s.title}</div>
            <div className="slide-thumb-type">Slide {s.index + 1}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
