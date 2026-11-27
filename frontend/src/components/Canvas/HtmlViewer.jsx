import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Eye,
  Code,
  RefreshCw,
  Monitor,
  Tablet,
  Smartphone,
  Copy,
  CheckCheck,
  Edit2,
  Save,
  History,
  ExternalLink,
  Download
} from 'lucide-react';
import { artifactsApi } from '../../api';

const ROW_HEIGHT = 21;
const OVERSCAN = 15;

export default function HtmlViewer({
  fullContent = '',
  blocks = [],
  artifactId,
  filename = 'index.html',
  token,
  theme = 'dark',
  onOpenHistory,
  onBlockUpdated
}) {
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'source'
  const [deviceView, setDeviceView] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [code, setCode] = useState(fullContent);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollContainerRef = useRef(null);

  const mainBlock = blocks[0] || { block_key: 'main_block', title: 'HTML Document' };

  const cleanHtml = (raw) => {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      const fenceMatch = trimmed.match(/^```(?:html|xml)?\s*([\s\S]*?)```$/i);
      if (fenceMatch) return fenceMatch[1].trim();
    }
    return trimmed;
  };

  const rawHtml = useMemo(
    () => cleanHtml(isEditing ? code : fullContent),
    [isEditing, code, fullContent]
  );

  useEffect(() => {
    if (!isEditing) {
      setCode(cleanHtml(fullContent));
    }
  }, [fullContent, isEditing]);

  // Use Blob Object URL for large HTML (>= 200KB) to avoid 20MB srcDoc fiber duplication
  const isLargeHtml = rawHtml.length >= 200000;
  const [blobPreviewUrl, setBlobPreviewUrl] = useState(null);

  useEffect(() => {
    if (!isLargeHtml) {
      setBlobPreviewUrl(null);
      return;
    }
    const blob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [rawHtml, isLargeHtml]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) setViewportHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, isEditing]);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'index.html';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await artifactsApi.updateBlock(
        artifactId,
        mainBlock.block_key,
        code,
        'Updated HTML code in Canvas',
        token
      );
      setIsEditing(false);
      if (onBlockUpdated) {
        onBlockUpdated(mainBlock.block_key, code);
      }
    } catch (err) {
      alert(err.message || 'Failed to save HTML');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInNewTab = () => {
    const blob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const getContainerWidth = () => {
    if (deviceView === 'mobile') return '375px';
    if (deviceView === 'tablet') return '768px';
    return '100%';
  };

  const lines = useMemo(() => String(rawHtml || '').split(/\r?\n/), [rawHtml]);
  const useVirtual = lines.length > 200;
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIdx = useVirtual
    ? Math.min(lines.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    : lines.length;
  const topPad = useVirtual ? startIdx * ROW_HEIGHT : 0;
  const bottomPad = useVirtual ? Math.max(0, (lines.length - endIdx) * ROW_HEIGHT) : 0;
  const visibleSlice = useMemo(() => lines.slice(startIdx, endIdx), [lines, startIdx, endIdx]);

  return (
    <div className="html-viewer-container">
      {/* ── Top Toolbar ── */}
      <div className="html-toolbar">
        {/* Left: Mode Toggle */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className={`canvas-btn ${viewMode === 'preview' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11px', padding: '5px 10px' }}
            onClick={() => { setViewMode('preview'); setIsEditing(false); }}
          >
            <Eye size={13} /> Live Preview
          </button>
          <button
            className={`canvas-btn ${viewMode === 'source' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
            style={{ fontSize: '11px', padding: '5px 10px' }}
            onClick={() => setViewMode('source')}
          >
            <Code size={13} /> HTML Source
          </button>
        </div>

        {/* Center: Responsive Device Switcher (when in preview mode) */}
        {viewMode === 'preview' && (
          <div className="html-device-switcher">
            <button
              className={`canvas-btn-icon ${deviceView === 'desktop' ? 'active' : ''}`}
              title="Desktop View (100%)"
              onClick={() => setDeviceView('desktop')}
            >
              <Monitor size={13} />
            </button>
            <button
              className={`canvas-btn-icon ${deviceView === 'tablet' ? 'active' : ''}`}
              title="Tablet View (768px)"
              onClick={() => setDeviceView('tablet')}
            >
              <Tablet size={13} />
            </button>
            <button
              className={`canvas-btn-icon ${deviceView === 'mobile' ? 'active' : ''}`}
              title="Mobile View (375px)"
              onClick={() => setDeviceView('mobile')}
            >
              <Smartphone size={13} />
            </button>
            <div style={{ width: '1px', height: '16px', background: 'var(--canvas-border)', margin: '0 2px' }} />
            <button
              className="canvas-btn-icon"
              title="Reload Frame"
              onClick={() => setIframeKey(k => k + 1)}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        )}

        {/* Right: Actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={handleDownload}
            title="Download HTML File"
          >
            <Download size={13} />
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={handleOpenInNewTab}
            title="Open Live HTML in New Tab"
          >
            <ExternalLink size={13} /> Open Tab
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={() => onOpenHistory && onOpenHistory(mainBlock.block_key, filename)}
            title="Inspect HTML Revisions"
          >
            <History size={13} /> History
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={handleCopy}
            title="Copy HTML"
          >
            {copied ? <CheckCheck size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {viewMode === 'source' && (
            !isEditing ? (
              <button
                className="canvas-btn canvas-btn-primary"
                style={{ fontSize: '11px' }}
                onClick={() => { setIsEditing(true); setCode(rawHtml); }}
                title="Edit HTML"
              >
                <Edit2 size={13} /> Edit
              </button>
            ) : (
              <>
                <button
                  className="canvas-btn canvas-btn-secondary"
                  style={{ fontSize: '11px' }}
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="canvas-btn canvas-btn-primary"
                  style={{ fontSize: '11px' }}
                  onClick={handleSave}
                  disabled={saving}
                  title="Save HTML Changes"
                >
                  <Save size={13} /> {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* ── Viewport Area ── */}
      {viewMode === 'preview' ? (
        <div className="html-preview-stage">
          <div
            className="html-frame-wrapper"
            style={{
              width: getContainerWidth(),
              transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <iframe
              key={`${iframeKey}_${isLargeHtml ? 'blob' : 'srcdoc'}`}
              title="HTML Live Preview"
              src={isLargeHtml && blobPreviewUrl ? blobPreviewUrl : undefined}
              srcDoc={!isLargeHtml ? rawHtml : undefined}
              className="html-preview-iframe"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            />
          </div>
        </div>
      ) : (
        isEditing ? (
          <textarea
            style={{
              width: '100%',
              background: 'var(--doc-textarea-bg)',
              color: 'var(--doc-textarea-text)',
              fontFamily: '"Fira Code", Monaco, Consolas, "Courier New", monospace',
              fontSize: '13px',
              lineHeight: '1.6',
              padding: '16px',
              border: 'none',
              outline: 'none',
              minHeight: '450px',
              maxHeight: 'calc(100vh - 140px)',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        ) : (
          <pre
            ref={scrollContainerRef}
            className="code-pre"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{
              overflowY: 'auto',
              overflowX: 'auto',
              maxHeight: 'calc(100vh - 130px)'
            }}
          >
            <table>
              <tbody>
                {topPad > 0 && (
                  <tr style={{ height: `${topPad}px` }}>
                    <td colSpan={2} style={{ padding: 0, border: 'none' }} />
                  </tr>
                )}
                {visibleSlice.map((line, offset) => {
                  const lineIdx = startIdx + offset;
                  return (
                    <tr key={lineIdx} style={{ height: useVirtual ? `${ROW_HEIGHT}px` : 'auto' }}>
                      <td className="code-line-number">{lineIdx + 1}</td>
                      <td className="code-line-content">{line || ' '}</td>
                    </tr>
                  );
                })}
                {bottomPad > 0 && (
                  <tr style={{ height: `${bottomPad}px` }}>
                    <td colSpan={2} style={{ padding: 0, border: 'none' }} />
                  </tr>
                )}
              </tbody>
            </table>
          </pre>
        )
      )}
    </div>
  );
}
