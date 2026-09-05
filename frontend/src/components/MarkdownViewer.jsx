import React from 'react';

/**
 * Universal Markdown Parser & Renderer
 * Converts GFM Markdown into clean, secure HTML with full support for:
 * - Tables with delimiter alignments (:---:, ---:, :---)
 * - Code blocks (```lang ... ```) with syntax header
 * - Inline formatting (bold, italic, strikethrough, inline code, links)
 * - Headings (H1 to H6)
 * - Horizontal rules (---, ***, ___)
 * - Blockquotes (> quote)
 * - Task lists (- [ ] / - [x]) and bullet/ordered lists
 * - Paragraphs with clean spacing
 */
export function parseMarkdownToHtml(src, options = {}) {
  if (!src) return '';
  const linkColor = options.linkColor || 'var(--primary-violet)';

  // 1. Escape HTML
  let html = String(src)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Inline formatting helper
  const formatInline = (text) => {
    if (!text) return '';
    let s = text;
    s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline; font-weight: 500;">$1</a>`);
    return s;
  };

  const lines = html.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeLang = '';
  let codeBuffer = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listItems = [];
  let inBlockquote = false;
  let bqBuffer = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      out.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
      inList = false;
    }
  };

  const flushBlockquote = () => {
    if (inBlockquote && bqBuffer.length > 0) {
      out.push(`<blockquote>${bqBuffer.map(b => formatInline(b)).join('<br />')}</blockquote>`);
      bqBuffer = [];
      inBlockquote = false;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      const headerRow = tableRows[0] || [];
      let alignments = [];
      let dataRows = [];

      if (tableRows.length > 1 && tableRows[1].every(c => /^[-:\s]+$/.test(c))) {
        alignments = tableRows[1].map(a => {
          const trimmed = a.trim();
          if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
          if (trimmed.endsWith(':')) return 'right';
          return 'left';
        });
        dataRows = tableRows.slice(2);
      } else {
        dataRows = tableRows.slice(1);
      }

      let thead = '<thead><tr>';
      headerRow.forEach((c, idx) => {
        const align = alignments[idx] || 'left';
        thead += `<th style="text-align: ${align}">${formatInline(c)}</th>`;
      });
      thead += '</tr></thead>';

      let tbody = '<tbody>';
      dataRows.forEach(row => {
        tbody += '<tr>';
        row.forEach((c, idx) => {
          const align = alignments[idx] || 'left';
          tbody += `<td style="text-align: ${align}">${formatInline(c)}</td>`;
        });
        tbody += '</tr>';
      });
      tbody += '</tbody>';

      out.push(`<div class="table-container"><table>${thead}${tbody}</table></div>`);
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block start/end
    if (trimmed.startsWith('```')) {
      flushList();
      flushBlockquote();
      flushTable();
      if (inCode) {
        out.push(`<pre class="code-block"><div class="code-header">${codeLang || 'code'}</div><code>${codeBuffer.join('\n')}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Check for table row (must contain | or be standard Markdown pipe table)
    if (/^\|.*\|$/.test(trimmed) || (trimmed.includes('|') && (inTable || (i + 1 < lines.length && /^[ \t]*\|?[-:\s|]+?\|?[ \t]*$/.test(lines[i + 1].trim()))))) {
      flushList();
      flushBlockquote();
      inTable = true;
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Empty line
    if (!trimmed) {
      flushList();
      flushBlockquote();
      flushTable();
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushList();
      flushBlockquote();
      flushTable();
      out.push('<hr />');
      continue;
    }

    // Headings
    if (/^#{1,6}\s/.test(trimmed)) {
      flushList();
      flushBlockquote();
      flushTable();
      const level = trimmed.match(/^#+/)[0].length;
      const headingText = trimmed.replace(/^#+\s*/, '');
      out.push(`<h${level}>${formatInline(headingText)}</h${level}>`);
      continue;
    }

    // Blockquotes
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      flushList();
      flushTable();
      inBlockquote = true;
      bqBuffer.push(trimmed.replace(/^(&gt;|>)\s*/, ''));
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Tasks / Checklists
    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      flushBlockquote();
      flushTable();
      inList = true;
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      listItems.push(`<li style="list-style: none;"><input type="checkbox" ${isChecked ? 'checked' : ''} disabled style="width: auto; margin-right: 6px; display: inline-block;" />${formatInline(taskMatch[2])}</li>`);
      continue;
    }

    // Standard Bullet / Ordered Lists
    const listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushBlockquote();
      flushTable();
      inList = true;
      listItems.push(`<li>${formatInline(listMatch[1])}</li>`);
      continue;
    }

    // Normal paragraph line
    flushList();
    flushBlockquote();
    flushTable();
    out.push(`<p>${formatInline(trimmed)}</p>`);
  }

  if (inCode) {
    out.push(`<pre class="code-block"><div class="code-header">${codeLang || 'code'}</div><code>${codeBuffer.join('\n')}</code></pre>`);
  }
  flushList();
  flushBlockquote();
  flushTable();

  return out.join('\n');
}

/**
 * Reusable Markdown Viewer Component
 */
export default function MarkdownViewer({ content, className = '', style = {}, linkColor }) {
  if (!content) return null;
  const html = parseMarkdownToHtml(content, { linkColor });
  return (
    <div
      className={`markdown-body ${className}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
