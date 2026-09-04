import React, { useState, useRef } from 'react';
import { Edit2, Check, X, History, Copy, CheckCheck, Clock, AlignLeft, Sparkles } from 'lucide-react';
import { artifactsApi } from '../../api';

// ── Lightweight Document Markdown Formatter ──────────────────────────────────
function formatInline(str) {
  if (str == null) return '';
  const textStr = typeof str === 'string' ? str : String(str);
  if (!textStr) return '';

  const tokens = textStr.split(/(\*\*.*?\*\*|`.*?`|\*[^*\n]+?\*)/g);
  if (tokens.length <= 1) return textStr;

  return tokens.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx} className="doc-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function renderMarkdownContent(text, sectionTitle) {
  if (text == null) return null;
  const textStr = typeof text === 'string' ? text : String(text);
  const lines = textStr.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];
  let checkedFirstHeading = false;

  const normalizeTitle = (t) => (t || '').toLowerCase().replace(/^[#\s\d\.\-–—]+/, '').replace(/[^a-z0-9]/g, '');
  const normSecTitle = normalizeTitle(sectionTitle);

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="doc-list">
          {listItems.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = typeof line === 'string' ? line.trim() : '';
    if (!trimmed) {
      flushList();
      return;
    }

    // Skip initial heading line if it duplicates the section header title
    if (!checkedFirstHeading && normSecTitle && (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### '))) {
      checkedFirstHeading = true;
      const headingText = trimmed.replace(/^#{1,3}\s+/, '');
      if (normalizeTitle(headingText) === normSecTitle) {
        return;
      }
    }
    checkedFirstHeading = true;

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={idx} className="doc-subheading">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={idx} className="doc-section-h3">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={idx} className="doc-section-h2">{formatInline(trimmed.slice(2))}</h2>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      inList = true;
      listItems.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      const numMatch = trimmed.match(/^\d+\./);
      const bullet = numMatch ? numMatch[0] : '';
      elements.push(
        <div key={idx} className="doc-numbered-item">
          <span className="doc-num-bullet">{bullet}</span>
          <span>{formatInline(trimmed.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      );
    } else if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={idx} className="doc-quote">
          {formatInline(trimmed.slice(2))}
        </blockquote>
      );
    } else {
      flushList();
      elements.push(
        <p key={idx} className="doc-paragraph">
          {formatInline(trimmed)}
        </p>
      );
    }
  });

  flushList();
  return elements;
}

export default function PagedDocViewer({
  artifact,
  blocks = [],
  artifactId,
  token,
  theme,
  updatedBlockKey,
  onOpenHistory,
  onBlockUpdated
}) {
  const [editingKey, setEditingKey] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const blockRefs = useRef({});

  const handleStartEdit = (block) => {
    setEditingKey(block.block_key);
    setEditContent(block.content || '');
  };

  const handleSaveEdit = async (blockKey) => {
    try {
      setSaving(true);
      await artifactsApi.updateBlock(artifactId, blockKey, editContent, 'Manual edit from Canvas', token);
      setEditingKey(null);
      if (onBlockUpdated) {
        onBlockUpdated(blockKey, editContent);
      }
    } catch (err) {
      alert(err.message || 'Failed to save block edits');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (blockKey, content) => {
    navigator.clipboard.writeText(content || '');
    setCopiedKey(blockKey);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Compute document statistics
  const totalWords = (blocks || []).reduce((acc, b) => {
    return acc + (typeof b?.content === 'string' ? b.content.split(/\s+/).filter(Boolean).length : 0);
  }, 0);
  const readingTime = Math.max(1, Math.ceil(totalWords / 200));

  return (
    <div className="doc-desk-viewport">
      {/* ── Continuous Paper Document Sheet ── */}
      <article className="doc-paper-sheet">
        {/* Document Title Header (Clean & Minimal) */}
        <header className="doc-sheet-header">
          <h1 className="doc-sheet-title">
            {artifact?.title || 'Untitled Document'}
          </h1>

          <div className="doc-sheet-meta">
            <span className="doc-meta-item">
              <Clock size={11} />
              <span>{readingTime} min</span>
            </span>
            <span className="doc-meta-dot">•</span>
            <span className="doc-meta-item">
              <AlignLeft size={11} />
              <span>{totalWords.toLocaleString()} words</span>
            </span>
            <span className="doc-meta-dot">•</span>
            <span className="doc-meta-item">
              <span className="doc-version-pill">v{artifact?.current_version || 1}</span>
            </span>
          </div>

          <div className="doc-sheet-divider" />
        </header>

        {/* Document Sections Flow */}
        <div className="doc-sheet-body">
          {blocks.length === 0 ? (
            <div className="doc-empty-state">
              <Sparkles size={28} style={{ color: 'var(--doc-text-muted)' }} />
              <p>Document is ready. Start asking questions or editing sections.</p>
            </div>
          ) : (
            blocks.map((block, idx) => {
              const isEditing = editingKey === block.block_key;
              const isJustUpdated = updatedBlockKey === block.block_key;

              return (
                <section
                  key={block.block_key}
                  id={`block-${block.block_key}`}
                  ref={(el) => (blockRefs.current[block.block_key] = el)}
                  className={`doc-section-flow ${isJustUpdated ? 'just-updated' : ''}`}
                >
                  {/* Section Heading & Floating Hover Actions */}
                  <div className="doc-section-header">
                    <h2 className="doc-section-heading">
                      {block.title || block.block_key}
                    </h2>

                    {/* Floating Action Pill on Hover */}
                    <div className="doc-section-hover-actions">
                      <button
                        className="doc-mini-btn"
                        title="Copy Section Markdown"
                        onClick={() => handleCopy(block.block_key, block.content)}
                      >
                        {copiedKey === block.block_key ? (
                          <CheckCheck size={13} style={{ color: '#10b981' }} />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>

                      <button
                        className="doc-mini-btn"
                        title="View Section Diff History"
                        onClick={() => onOpenHistory && onOpenHistory(block.block_key, block.title)}
                      >
                        <History size={13} />
                      </button>

                      {!isEditing ? (
                        <button
                          className="doc-mini-btn doc-edit-btn"
                          title="Edit Section"
                          onClick={() => handleStartEdit(block)}
                        >
                          <Edit2 size={12} />
                          <span>Edit</span>
                        </button>
                      ) : (
                        <>
                          <button
                            className="doc-mini-btn"
                            title="Save Changes"
                            disabled={saving}
                            onClick={() => handleSaveEdit(block.block_key)}
                            style={{ color: '#10b981' }}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="doc-mini-btn"
                            title="Cancel"
                            disabled={saving}
                            onClick={() => setEditingKey(null)}
                            style={{ color: '#ef4444' }}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Section Content or Inline Editor */}
                  {isEditing ? (
                    <div className="doc-inline-editor">
                      <textarea
                        className="doc-paper-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={saving}
                        rows={Math.max(6, String(editContent || '').split('\n').length + 2)}
                        placeholder="Write your section content here..."
                        autoFocus
                      />
                      <div className="doc-editor-actions">
                        <button
                          className="doc-btn-ghost"
                          onClick={() => setEditingKey(null)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          className="doc-btn-save"
                          onClick={() => handleSaveEdit(block.block_key)}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="doc-prose-content">
                      {renderMarkdownContent(block.content, block.title)}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </article>
    </div>
  );
}
