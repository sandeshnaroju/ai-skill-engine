import React, { useState, useRef } from 'react';
import {
  Edit2, Check, X, History, Copy, CheckCheck, Clock, AlignLeft, Sparkles,
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Table, Link as LinkIcon, Image as ImageIcon,
  Quote, AlertCircle, Palette, Minus, ExternalLink
} from 'lucide-react';
import { artifactsApi } from '../../api';

// ── Lightweight Rich Inline Markdown Formatter ───────────────────────────────
function formatInline(str) {
  if (str == null) return '';
  const textStr = typeof str === 'string' ? str : String(str);
  if (!textStr) return '';

  // Regex capturing:
  // 1. Images: !\[([^\]]*)\]\(([^)]+)\)
  // 2. Links: \[([^\]]+)\]\(([^)]+)\)
  // 3. Bold: \*\*([^*]+)\*\*
  // 4. Strikethrough: ~~([^~]+)~~
  // 5. Inline code: `([^`]+)`
  // 6. Italic: \*([^*]+)\*
  // 7. HTML Highlight/Color tags: <span[^>]*>.*?<\/span> | <mark[^>]*>.*?<\/mark>
  const tokenRegex = /(!\[(?:[^\]]*)\]\((?:[^)]+)\)|\[(?:[^\]]+)\]\((?:[^)]+)\)|\*\*(?:[^*]+)\*\*|~~(?:[^~]+)~~|`(?:[^`]+)`|\*(?:[^*]+)\*|<span[^>]*>[\s\S]*?<\/span>|<mark[^>]*>[\s\S]*?<\/mark>)/g;
  const parts = textStr.split(tokenRegex);

  if (parts.length <= 1) {
    // Check if whole string has HTML tags
    if (textStr.includes('<span') || textStr.includes('<mark')) {
      return <span dangerouslySetInnerHTML={{ __html: textStr }} />;
    }
    return textStr;
  }

  return parts.map((part, idx) => {
    if (!part) return null;

    // Image: ![alt](url)
    const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      return (
        <span key={idx} className="doc-inline-img-wrapper">
          <img src={imgMatch[2]} alt={imgMatch[1]} className="doc-inline-img" loading="lazy" />
          {imgMatch[1] && <span className="doc-img-caption">{imgMatch[1]}</span>}
        </span>
      );
    }

    // Link: [title](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="doc-link"
          title={linkMatch[2]}
        >
          {linkMatch[1]}
          <ExternalLink size={10} style={{ display: 'inline', marginLeft: '3px', opacity: 0.7 }} />
        </a>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }

    // Strikethrough: ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return <del key={idx} style={{ opacity: 0.7 }}>{part.slice(2, -2)}</del>;
    }

    // Inline Code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={idx} className="doc-inline-code">{part.slice(1, -1)}</code>;
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }

    // HTML span / mark
    if (part.startsWith('<span') || part.startsWith('<mark')) {
      return <span key={idx} dangerouslySetInnerHTML={{ __html: part }} />;
    }

    return part;
  });
}

// ── Complete Markdown Block Renderer (Headings, Tables, Lists, Callouts, Images) ──
function renderMarkdownContent(text, sectionTitle) {
  if (text == null) return null;
  const textStr = typeof text === 'string' ? text : String(text);
  const lines = textStr.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];
  let listType = 'ul'; // 'ul' | 'ol'
  let checkedFirstHeading = false;
  let inTable = false;
  let tableRows = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];

  const normalizeTitle = (t) => (t || '').toLowerCase().replace(/^[#\s\d\.\-–—]+/, '').replace(/[^a-z0-9]/g, '');
  const normSecTitle = normalizeTitle(sectionTitle);

  const flushList = () => {
    if (inList && listItems.length > 0) {
      if (listType === 'ol') {
        elements.push(
          <ol key={`list-${elements.length}`} className="doc-ordered-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{formatInline(item)}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`list-${elements.length}`} className="doc-list">
            {listItems.map((item, idx) => {
              if (item.isTask) {
                return (
                  <li key={idx} className="doc-task-item">
                    <input type="checkbox" checked={item.checked} readOnly className="doc-task-checkbox" />
                    <span>{formatInline(item.text)}</span>
                  </li>
                );
              }
              return <li key={idx}>{formatInline(item.text)}</li>;
            })}
          </ul>
        );
      }
      listItems = [];
      inList = false;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0] || [];
      const dataRows = tableRows.slice(1);
      elements.push(
        <div key={`table-${elements.length}`} className="doc-table-wrapper">
          <table className="doc-render-table">
            <thead>
              <tr>
                {headerRow.map((cell, cIdx) => (
                  <th key={cIdx}>{formatInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{formatInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock) {
      const codeStr = codeBlockLines.join('\n');
      elements.push(
        <div key={`code-${elements.length}`} className="doc-code-block-container">
          <div className="doc-code-block-header">
            <span>{codeBlockLang || 'code'}</span>
          </div>
          <pre className="doc-code-block">
            <code>{codeStr}</code>
          </pre>
        </div>
      );
      codeBlockLines = [];
      inCodeBlock = false;
      codeBlockLang = '';
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = typeof line === 'string' ? line.trim() : '';

    // Handle Code Blocks ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty line flushes active blocks
    if (!trimmed) {
      flushList();
      flushTable();
      continue;
    }

    // Markdown Table lines: | cell | cell |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      // Check if divider row |---|---|
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        // Just divider, don't push as data row
        inTable = true;
      } else {
        inTable = true;
        tableRows.push(cells);
      }
      continue;
    } else {
      flushTable();
    }

    // Standalone Horizontal Rule --- or ***
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={idx} className="doc-hr" />);
      continue;
    }

    // Standalone Image: ![alt](url)
    const standAloneImgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standAloneImgMatch) {
      flushList();
      elements.push(
        <div key={idx} className="doc-full-img-container">
          <img src={standAloneImgMatch[2]} alt={standAloneImgMatch[1]} className="doc-rendered-img" />
          {standAloneImgMatch[1] && (
            <div className="doc-img-caption">{standAloneImgMatch[1]}</div>
          )}
        </div>
      );
      continue;
    }

    // Skip initial heading line if it duplicates the section header title
    if (!checkedFirstHeading && normSecTitle && (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### '))) {
      checkedFirstHeading = true;
      const headingText = trimmed.replace(/^#{1,3}\s+/, '');
      if (normalizeTitle(headingText) === normSecTitle) {
        continue;
      }
    }
    checkedFirstHeading = true;

    // Headings
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={idx} className="doc-subheading">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={idx} className="doc-section-h3">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={idx} className="doc-section-h2">{formatInline(trimmed.slice(2))}</h2>);
    }

    // Task Checkboxes: - [ ] or - [x]
    else if (/^[-*]\s+\[([ xX])\]\s+(.*)/.test(trimmed)) {
      const match = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
      inList = true;
      listType = 'ul';
      listItems.push({ isTask: true, checked: match[1].toLowerCase() === 'x', text: match[2] });
    }

    // Bullet Lists: - item or * item
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      inList = true;
      listType = 'ul';
      listItems.push({ isTask: false, text: trimmed.slice(2) });
    }

    // Numbered Lists: 1. item
    else if (/^\d+\.\s+/.test(trimmed)) {
      inList = true;
      listType = 'ol';
      listItems.push(trimmed.replace(/^\d+\.\s*/, ''));
    }

    // GitHub-Style Alerts: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION]
    else if (trimmed.startsWith('> [!') || trimmed.startsWith('>')) {
      flushList();
      const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)/i);
      if (alertMatch) {
        const type = alertMatch[1].toUpperCase();
        const text = alertMatch[2];
        elements.push(
          <div key={idx} className={`doc-alert-callout doc-alert-${type.toLowerCase()}`}>
            <div className="doc-alert-header">
              <AlertCircle size={14} />
              <span>{type}</span>
            </div>
            {text && <div className="doc-alert-body">{formatInline(text)}</div>}
          </div>
        );
      } else {
        elements.push(
          <blockquote key={idx} className="doc-quote">
            {formatInline(trimmed.replace(/^>\s?/, ''))}
          </blockquote>
        );
      }
    }

    // Regular Paragraph
    else {
      flushList();
      elements.push(
        <p key={idx} className="doc-paragraph">
          {formatInline(trimmed)}
        </p>
      );
    }
  }

  flushList();
  flushTable();
  flushCodeBlock();
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
  const [showColorMenu, setShowColorMenu] = useState(false);
  const textareaRef = useRef(null);
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

  // ── Document Toolbar Insertion Helpers ──
  const insertTextAtCursor = (prefix, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = editContent;
    const selectedText = currentVal.substring(start, end) || defaultText;

    const before = currentVal.substring(0, start);
    const after = currentVal.substring(end);
    const replacement = `${prefix}${selectedText}${suffix}`;
    const newVal = `${before}${replacement}${after}`;

    setEditContent(newVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  const insertTableTemplate = () => {
    const tableTemplate = `\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Item 1 | Value A | 100 |\n| Item 2 | Value B | 200 |\n`;
    insertTextAtCursor('', '', tableTemplate);
  };

  const insertLinkTemplate = () => {
    const url = prompt('Enter link URL (e.g., https://example.com):', 'https://');
    if (!url) return;
    insertTextAtCursor('[', `](${url})`, 'Link text');
  };

  const insertImageTemplate = () => {
    const url = prompt('Enter image URL:', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800');
    if (!url) return;
    insertTextAtCursor(`![Image description](${url})\n`, '');
  };

  const insertAlertTemplate = (type = 'NOTE') => {
    insertTextAtCursor(`> [!${type}]\n> `, '', 'Important detail description here...');
  };

  const insertColorHighlight = (colorCode, label) => {
    insertTextAtCursor(`<span style="color: ${colorCode}; font-weight: 600;">`, '</span>', label || 'Colored text');
    setShowColorMenu(false);
  };

  const insertBgHighlight = (bgColor, label) => {
    insertTextAtCursor(`<mark style="background: ${bgColor}; color: inherit; padding: 2px 6px; border-radius: 4px;">`, '</mark>', label || 'Highlighted text');
    setShowColorMenu(false);
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
        {/* Document Title Header */}
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

                  {/* Section Content or Inline Editor with Rich Formatting Toolbar */}
                  {isEditing ? (
                    <div className="doc-inline-editor">
                      {/* ── Document Formatting Toolbar ── */}
                      <div className="doc-toolbar-bar">
                        {/* Text Styles */}
                        <div className="doc-toolbar-group">
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('**', '**', 'bold text')} title="Bold (Ctrl+B)">
                            <Bold size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('*', '*', 'italic text')} title="Italic (Ctrl+I)">
                            <Italic size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('~~', '~~', 'strikethrough')} title="Strikethrough">
                            <Strikethrough size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('`', '`', 'code')} title="Inline Code">
                            <Code size={13} />
                          </button>
                        </div>

                        {/* Headings */}
                        <div className="doc-toolbar-group">
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('## ', '', 'Heading 2')} title="Heading 2">
                            <Heading2 size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('### ', '', 'Heading 3')} title="Heading 3">
                            <Heading3 size={13} />
                          </button>
                        </div>

                        {/* Lists */}
                        <div className="doc-toolbar-group">
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('- ', '', 'List item')} title="Bullet List">
                            <List size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('1. ', '', 'First item')} title="Numbered List">
                            <ListOrdered size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('- [ ] ', '', 'Task item')} title="Task Checkbox">
                            <CheckSquare size={13} />
                          </button>
                        </div>

                        {/* Rich Insertions (Table, Image, Link, Callout, Colors) */}
                        <div className="doc-toolbar-group">
                          <button type="button" className="doc-toolbar-btn doc-toolbar-btn-highlight" onClick={insertTableTemplate} title="Insert Markdown Table">
                            <Table size={13} /> Table
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={insertLinkTemplate} title="Insert Link">
                            <LinkIcon size={13} /> Link
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={insertImageTemplate} title="Insert Image">
                            <ImageIcon size={13} /> Image
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertAlertTemplate('NOTE')} title="Insert Callout Alert">
                            <AlertCircle size={13} /> Note
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('> ', '', 'Quote text')} title="Blockquote">
                            <Quote size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onClick={() => insertTextAtCursor('\n---\n', '')} title="Divider">
                            <Minus size={13} />
                          </button>
                        </div>

                        {/* Color Highlight Dropdown */}
                        <div className="doc-toolbar-group" style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${showColorMenu ? 'active' : ''}`}
                            onClick={() => setShowColorMenu(!showColorMenu)}
                            title="Colors & Highlights"
                          >
                            <Palette size={13} /> Colors
                          </button>

                          {showColorMenu && (
                            <div className="doc-color-picker-menu">
                              <div className="doc-color-menu-title">Text Colors</div>
                              <div className="doc-color-swatches">
                                <button type="button" className="doc-color-circle" style={{ background: '#6366f1' }} title="Indigo" onClick={() => insertColorHighlight('#6366f1', 'Indigo text')} />
                                <button type="button" className="doc-color-circle" style={{ background: '#10b981' }} title="Emerald" onClick={() => insertColorHighlight('#10b981', 'Emerald text')} />
                                <button type="button" className="doc-color-circle" style={{ background: '#f59e0b' }} title="Amber" onClick={() => insertColorHighlight('#f59e0b', 'Amber text')} />
                                <button type="button" className="doc-color-circle" style={{ background: '#ec4899' }} title="Rose" onClick={() => insertColorHighlight('#ec4899', 'Rose text')} />
                                <button type="button" className="doc-color-circle" style={{ background: '#06b6d4' }} title="Cyan" onClick={() => insertColorHighlight('#06b6d4', 'Cyan text')} />
                              </div>
                              <div className="doc-color-menu-title" style={{ marginTop: '8px' }}>Background Highlights</div>
                              <div className="doc-color-swatches">
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(99, 102, 241, 0.25)', border: '1px solid #6366f1' }} title="Purple Highlight" onClick={() => insertBgHighlight('rgba(99, 102, 241, 0.2)', 'Purple highlight')} />
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10b981' }} title="Green Highlight" onClick={() => insertBgHighlight('rgba(16, 185, 129, 0.2)', 'Green highlight')} />
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(245, 158, 11, 0.25)', border: '1px solid #f59e0b' }} title="Yellow Highlight" onClick={() => insertBgHighlight('rgba(245, 158, 11, 0.2)', 'Yellow highlight')} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Textarea Editor */}
                      <textarea
                        ref={textareaRef}
                        className="doc-paper-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        disabled={saving}
                        rows={Math.max(7, String(editContent || '').split('\n').length + 2)}
                        placeholder="Write your section content in Markdown (use the toolbar above for tables, images, links, alerts, colors)..."
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

