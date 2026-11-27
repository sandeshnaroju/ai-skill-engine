import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Copy,
  CheckCheck,
  Edit2,
  History,
  Eye,
  Code as CodeIcon,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
  WrapText,
  Download
} from 'lucide-react';
import { artifactsApi } from '../../api';

const ROW_HEIGHT = 21; // px per line for fixed-height virtual scrolling
const OVERSCAN = 15;

export default function CodeViewer({
  fullContent = '',
  blocks = [],
  artifactId,
  language = 'python',
  filename = 'code.py',
  token,
  theme = 'dark',
  onOpenHistory,
  onBlockUpdated
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState(fullContent);
  const [saving, setSaving] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollContainerRef = useRef(null);

  const isHtml =
    language === 'html' ||
    language === 'htm' ||
    filename.endsWith('.html') ||
    filename.endsWith('.htm') ||
    (typeof fullContent === 'string' && (fullContent.includes('<!DOCTYPE html>') || fullContent.includes('<html')));
  const [activeTab, setActiveTab] = useState(isHtml ? 'preview' : 'code');

  useEffect(() => {
    if (!isEditing) {
      setCode(fullContent);
    }
  }, [fullContent, isEditing]);

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
  }, [isEditing, activeTab]);

  const mainBlock = blocks[0] || { block_key: 'main_block', title: 'Main Code' };

  const handleCopy = () => {
    navigator.clipboard.writeText(code || fullContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = isEditing ? code : fullContent || '';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'code.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await artifactsApi.updateBlock(artifactId, mainBlock.block_key, code, 'Edited code in Canvas', token);
      setIsEditing(false);
      if (onBlockUpdated) {
        onBlockUpdated(mainBlock.block_key, code);
      }
    } catch (err) {
      alert(err.message || 'Failed to save code');
    } finally {
      setSaving(false);
    }
  };

  const cleanHtmlCode = (str) => {
    if (!str) return '';
    let cleaned = str.trim();
    const match = cleaned.match(/```(?:html|xml)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : cleaned;
  };

  // Memoize line splitting once per content change (handles 20MB+ files cleanly)
  const lines = useMemo(() => {
    const src = String(isEditing ? (code ?? '') : (fullContent ?? ''));
    return src.split(/\r?\n/);
  }, [isEditing, code, fullContent]);

  // Search matches across all lines
  const matchLineIndices = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push(i);
        if (hits.length >= 5000) break;
      }
    }
    return hits;
  }, [lines, searchTerm]);

  const jumpToMatch = (idx) => {
    if (matchLineIndices.length === 0) return;
    const wrapped = (idx + matchLineIndices.length) % matchLineIndices.length;
    setActiveMatchIdx(wrapped);
    const targetLine = matchLineIndices[wrapped];
    if (scrollContainerRef.current) {
      const targetY = Math.max(0, targetLine * ROW_HEIGHT - viewportHeight / 3);
      scrollContainerRef.current.scrollTop = targetY;
      setScrollTop(targetY);
    }
  };

  // Virtual window bounds (disable virtualization only if wordWrap is toggled on for small/medium files)
  const useVirtual = !wordWrap && lines.length > 200;
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIdx = useVirtual
    ? Math.min(lines.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
    : lines.length;

  const topPad = useVirtual ? startIdx * ROW_HEIGHT : 0;
  const bottomPad = useVirtual ? Math.max(0, (lines.length - endIdx) * ROW_HEIGHT) : 0;
  const visibleSlice = useMemo(() => lines.slice(startIdx, endIdx), [lines, startIdx, endIdx]);
  const highlightedLine = matchLineIndices.length > 0 ? matchLineIndices[activeMatchIdx % matchLineIndices.length] : -1;

  return (
    <div className="code-viewer-container">
      <div className="code-toolbar" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--doc-title-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {filename}
          </span>
          <span className="canvas-version-pill">{language}</span>
          <span style={{ fontSize: '11px', opacity: 0.65 }}>{lines.length.toLocaleString()} lines</span>

          {isHtml && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
              <button
                className={`canvas-btn ${activeTab === 'preview' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => { setActiveTab('preview'); setIsEditing(false); }}
              >
                <Eye size={12} /> Live Preview
              </button>
              <button
                className={`canvas-btn ${activeTab === 'code' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => setActiveTab('code')}
              >
                <CodeIcon size={12} /> Code
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {!isEditing && activeTab === 'code' && (
            <>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input
                  type="text"
                  placeholder="Find in file..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setActiveMatchIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') jumpToMatch(activeMatchIdx + (e.shiftKey ? -1 : 1));
                  }}
                  style={{
                    padding: '3px 8px 3px 26px',
                    borderRadius: '6px',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    background: 'rgba(148, 163, 184, 0.08)',
                    color: 'inherit',
                    fontSize: '11px',
                    width: '145px'
                  }}
                />
              </div>

              {searchTerm.trim() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}>
                  <span>{matchLineIndices.length > 0 ? `${(activeMatchIdx % matchLineIndices.length) + 1}/${matchLineIndices.length}` : '0/0'}</span>
                  <button
                    className="canvas-btn canvas-btn-secondary"
                    style={{ padding: '2px 5px' }}
                    onClick={() => jumpToMatch(activeMatchIdx - 1)}
                    disabled={matchLineIndices.length === 0}
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    className="canvas-btn canvas-btn-secondary"
                    style={{ padding: '2px 5px' }}
                    onClick={() => jumpToMatch(activeMatchIdx + 1)}
                    disabled={matchLineIndices.length === 0}
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}

              <button
                className={`canvas-btn ${wordWrap ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => setWordWrap((w) => !w)}
                title="Toggle Word Wrap"
              >
                <WrapText size={12} />
              </button>
            </>
          )}

          {isHtml && activeTab === 'preview' && (
            <button
              className="canvas-btn canvas-btn-secondary"
              style={{ fontSize: '11px' }}
              onClick={() => {
                const blob = new Blob([cleanHtmlCode(code || fullContent)], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              title="Open in new tab"
            >
              <ExternalLink size={12} /> Open Tab
            </button>
          )}

          <button
            className="canvas-btn canvas-btn-secondary"
            title="Download File"
            onClick={handleDownload}
          >
            <Download size={13} />
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            title="View Code Diff History"
            onClick={() => onOpenHistory && onOpenHistory(mainBlock.block_key, filename)}
          >
            <History size={13} /> History
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            onClick={handleCopy}
            title="Copy Code"
          >
            {copied ? <CheckCheck size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {!isEditing ? (
            <button
              className="canvas-btn canvas-btn-primary"
              onClick={() => { setIsEditing(true); setCode(fullContent); setActiveTab('code'); }}
              title="Edit Code"
            >
              <Edit2 size={13} /> Edit
            </button>
          ) : (
            <>
              <button
                className="canvas-btn canvas-btn-secondary"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="canvas-btn canvas-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {isHtml && activeTab === 'preview' && !isEditing ? (
        <div className="html-preview-stage" style={{ minHeight: '450px' }}>
          <div className="html-frame-wrapper" style={{ width: '100%' }}>
            <iframe
              title="HTML Live Preview"
              srcDoc={cleanHtmlCode(code || fullContent)}
              className="html-preview-iframe"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            />
          </div>
        </div>
      ) : isEditing ? (
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
            minHeight: '400px',
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
            overflowX: wordWrap ? 'hidden' : 'auto',
            maxHeight: 'calc(100vh - 130px)'
          }}
        >
          <table style={{ width: '100%', tableLayout: wordWrap ? 'fixed' : 'auto' }}>
            <tbody>
              {topPad > 0 && (
                <tr style={{ height: `${topPad}px` }}>
                  <td colSpan={2} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
              {visibleSlice.map((line, offset) => {
                const lineIdx = startIdx + offset;
                const isHit = lineIdx === highlightedLine;
                return (
                  <tr
                    key={lineIdx}
                    style={{
                      height: useVirtual ? `${ROW_HEIGHT}px` : 'auto',
                      background: isHit ? 'rgba(245, 158, 11, 0.2)' : 'transparent'
                    }}
                  >
                    <td className="code-line-number">{lineIdx + 1}</td>
                    <td
                      className="code-line-content"
                      style={{
                        whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                        wordBreak: wordWrap ? 'break-all' : 'normal'
                      }}
                    >
                      {line || ' '}
                    </td>
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
      )}
    </div>
  );
}
