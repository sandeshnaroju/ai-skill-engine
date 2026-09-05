import React from 'react';

/**
 * Extract YouTube Video ID from standard, short, embed, or shorts URLs
 */
export function getYouTubeVideoId(url) {
  if (!url) return null;
  const decoded = url.replace(/&amp;/g, '&');
  const match = decoded.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  return match ? match[1] : null;
}

export function isAudioUrl(url) {
  return /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(url || '');
}

export function isVideoUrl(url) {
  return /\.(mp4|webm|mov|mkv|ogv)(\?.*)?$/i.test(url || '');
}

/**
 * Universal Markdown Parser & Renderer
 * Converts GFM Markdown into clean, secure HTML with full support for:
 * - Audio & Video players (.mp3, .wav, .mp4, .webm, etc.)
 * - YouTube auto-embed responsive player
 * - Images (![alt](url))
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

  // Helper to render responsive YouTube player
  const renderYouTubeEmbed = (videoId) => {
    return `<div class="media-embed media-youtube" style="position: relative; width: 100%; max-width: 680px; padding-bottom: 56.25%; height: 0; margin: 12px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); background: #000;">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; top:0; left: 0; width: 100%; height: 100%; border: none;"></iframe>
    </div>`;
  };

  // Helper to render HTML5 Audio Player
  const renderAudioPlayer = (url, label = '') => {
    return `<div class="media-embed media-audio" style="margin: 10px 0; max-width: 540px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1)); border-radius: 10px; padding: 10px 14px;">
      ${label ? `<div style="font-size: 11px; font-weight: 600; color: var(--text-secondary, #94a3b8); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;"><span>🎵</span> <span>${label}</span></div>` : ''}
      <audio controls src="${url}" preload="metadata" style="width: 100%; border-radius: 6px; outline: none; height: 36px;"></audio>
    </div>`;
  };

  // Helper to render HTML5 Video Player
  const renderVideoPlayer = (url, label = '') => {
    return `<div class="media-embed media-video" style="margin: 12px 0; max-width: 680px; border-radius: 12px; overflow: hidden; background: #000; box-shadow: 0 4px 16px rgba(0,0,0,0.25); border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));">
      ${label ? `<div style="padding: 6px 12px; font-size: 11px; font-weight: 600; background: rgba(0,0,0,0.6); color: #cbd5e1;">🎬 ${label}</div>` : ''}
      <video controls preload="metadata" style="width: 100%; max-height: 460px; display: block; background: #000;" src="${url}">
        Your browser does not support the video tag.
      </video>
    </div>`;
  };

  // 1. Escape HTML
  let html = String(src)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Inline formatting helper
  const formatInline = (text) => {
    if (!text) return '';
    let s = text;

    // 1. Images & Media: ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      const cleanUrl = url.trim();
      const ytId = getYouTubeVideoId(cleanUrl);
      if (ytId) return renderYouTubeEmbed(ytId);
      if (isAudioUrl(cleanUrl)) return renderAudioPlayer(cleanUrl, alt);
      if (isVideoUrl(cleanUrl)) return renderVideoPlayer(cleanUrl, alt);
      return `<img src="${cleanUrl}" alt="${alt}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; display: block;" loading="lazy" />`;
    });

    // 2. Inline Code
    s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // 3. Bold, Strikethrough, Italic
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 4. Standard Links [label](url) with media detection
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
      const cleanUrl = url.trim();
      const ytId = getYouTubeVideoId(cleanUrl);
      if (ytId) {
        return `<span style="display: block;">${renderYouTubeEmbed(ytId)}<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; font-size: 12px; text-decoration: underline;">${label} ↗</a></span>`;
      }
      if (isAudioUrl(cleanUrl)) {
        return renderAudioPlayer(cleanUrl, label);
      }
      if (isVideoUrl(cleanUrl)) {
        return renderVideoPlayer(cleanUrl, label);
      }
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline; font-weight: 500;">${label}</a>`;
    });

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

    // Standalone Raw Media URLs (e.g. YouTube, audio file, video file)
    if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
      flushList();
      flushBlockquote();
      flushTable();
      const ytId = getYouTubeVideoId(trimmed);
      if (ytId) {
        out.push(renderYouTubeEmbed(ytId));
        continue;
      }
      if (isAudioUrl(trimmed)) {
        out.push(renderAudioPlayer(trimmed));
        continue;
      }
      if (isVideoUrl(trimmed)) {
        out.push(renderVideoPlayer(trimmed));
        continue;
      }
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
