import React, { useState, useRef } from 'react';
import {
  Edit2, Check, X, History, Copy, CheckCheck, Clock, AlignLeft, AlignCenter, AlignRight, AlignJustify, MoveVertical, Sparkles,
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Table, Link as LinkIcon, Image as ImageIcon,
  Quote, AlertCircle, Palette, Minus, ExternalLink, Eye, Columns, Plus,
  Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Grid, ChevronDown
} from 'lucide-react';
import { artifactsApi } from '../../api';
import { replaceMathAndSymbols } from '../MarkdownViewer';

// ── Lightweight Rich Inline Markdown Formatter ───────────────────────────────
function formatInline(str) {
  if (str == null) return '';
  if (typeof str === 'object') {
    return str.name || str.title || str.label || str.text || str.value || JSON.stringify(str);
  }
  const processedStr = replaceMathAndSymbols(String(str));
  const textStr = processedStr;
  if (!textStr) return '';

  // Regex capturing:
  // 1. Images: !\[([^\]]*)\]\(([^)]+)\)
  // 2. Links: \[([^\]]+)\]\(([^)]+)\)
  // 3. Bold: \*\*([^*]+)\*\*
  // 4. Strikethrough: ~~([^~]+)~~
  // 5. Inline code: `([^`]+)`
  // 6. Italic: \*([^*]+)\*
  // 7. HTML Highlight/Color/Inline tags: <br>, <span...>, <mark...>, <b>, <strong>, <i>, <em>, <u>, <font...>
  const tokenRegex = /(!\[(?:[^\]]*)\]\((?:[^)]+)\)|\[(?:[^\]]+)\]\((?:[^)]+)\)|\*\*(?:[^*]+)\*\*|~~(?:[^~]+)~~|`(?:[^`]+)`|\*(?:[^*]+)\*|<br\s*\/?>|<(?:span|mark|b|strong|i|em|u|font|del)[^>]*>[\s\S]*?<\/(?:span|mark|b|strong|i|em|u|font|del)>)/gi;
  const parts = textStr.split(tokenRegex);

  if (parts.length <= 1) {
    if (/^<br\s*\/?>$/i.test(textStr.trim())) {
      return <br />;
    }
    // Check if whole string has HTML tags
    if (/<(?:span|mark|b|strong|i|em|u|font|del)/i.test(textStr)) {
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

    // Line break: <br> or <br/>
    if (/^<br\s*\/?>$/i.test(part)) {
      return <br key={idx} />;
    }

    // HTML inline tags (span, mark, b, strong, i, em, u, font, del)
    if (/^<(?:span|mark|b|strong|i|em|u|font|del)/i.test(part)) {
      return <span key={idx} dangerouslySetInnerHTML={{ __html: part }} />;
    }

    return part;
  });
}

// ── Helper to sanitize and format HTML Table markup safely ──
function formatHtmlTable(htmlStr) {
  if (!htmlStr) return '';
  // Ensure the table element has doc-render-table class
  let cleaned = htmlStr.trim();
  if (/<table(?![^>]*class=)/i.test(cleaned)) {
    cleaned = cleaned.replace(/<table/i, '<table class="doc-render-table"');
  } else {
    cleaned = cleaned.replace(/<table([^>]*class=["'])([^"']*)(["'])/i, (m, p1, p2, p3) => {
      const cls = p2.includes('doc-render-table') ? p2 : `${p2} doc-render-table`.trim();
      return `<table${p1}${cls}${p3}`;
    });
  }
  return cleaned;
}

// ── Parse Raw HTML Table into Structured Table Object ──
function parseHtmlTableToObject(tableHtml) {
  if (!tableHtml) return null;
  const headers = [];
  const rows = [];

  // Match thead / first tr ths
  const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  let thMatch;
  while ((thMatch = thRegex.exec(tableHtml)) !== null) {
    headers.push(thMatch[1].replace(/<[^>]+>/g, '').trim());
  }

  // Match tbody trs or all trs
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  let isFirstRow = true;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const rowContent = trMatch[1];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const rowCells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
      rowCells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (rowCells.length > 0) {
      rows.push(rowCells);
    } else if (headers.length === 0 && isFirstRow) {
      // Maybe th was inside this tr
      const innerThRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let innerTh;
      while ((innerTh = innerThRegex.exec(rowContent)) !== null) {
        headers.push(innerTh[1].replace(/<[^>]+>/g, '').trim());
      }
    }
    isFirstRow = false;
  }

  if (headers.length === 0 && rows.length === 0) return null;

  // Normalize column count
  const maxCols = Math.max(headers.length, ...rows.map(r => r.length), 1);
  while (headers.length < maxCols) {
    headers.push(`Column ${headers.length + 1}`);
  }
  const normalizedRows = rows.map(r => {
    const newR = [...r];
    while (newR.length < maxCols) newR.push('');
    return newR.slice(0, maxCols);
  });

  return { headers, rows: normalizedRows };
}

// ── Parse Markdown Table into Structured Table Object ──
function parseMarkdownTableToObject(tableText) {
  if (!tableText) return null;
  const lines = tableText.trim().split('\n');
  if (lines.length < 2) return null;

  const parseLine = (line) => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim());
  };

  const headers = parseLine(lines[0]);
  let dataLines = lines.slice(1);
  // Skip divider line if present
  if (dataLines.length > 0 && parseLine(dataLines[0]).every(c => /^:?-+:?$/.test(c))) {
    dataLines = dataLines.slice(1);
  }

  const rows = dataLines.map(line => parseLine(line));
  const maxCols = Math.max(headers.length, ...rows.map(r => r.length), 1);

  while (headers.length < maxCols) {
    headers.push(`Column ${headers.length + 1}`);
  }
  const normalizedRows = rows.map(r => {
    const newR = [...r];
    while (newR.length < maxCols) newR.push('');
    return newR.slice(0, maxCols);
  });

  return { headers, rows: normalizedRows };
}

// Convert inline markdown styles (**bold**, *italic*, `code`, [link](url)) to HTML tags
function formatInlineToHtml(text) {
  if (!text) return '';
  let res = String(text);

  // Preserve existing HTML spans/marks/links/imgs as-is
  // Replace Markdown bold: **text**
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Replace Markdown strikethrough: ~~text~~
  res = res.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Replace Markdown italic: *text* (avoiding inner tags)
  res = res.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Replace Markdown inline code: `code`
  res = res.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Replace Markdown links: [text](url)
  res = res.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="doc-link">$1</a>');
  // Replace Markdown images: ![alt](url)
  res = res.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:6px; margin:8px 0; display:block;" />');

  return res;
}

// ── Convert raw section text (markdown + html) to rich HTML for WYSIWYG editing ──
function rawTextToWysiwygHtml(text) {
  if (!text) return '<p><br></p>';
  const str = String(text);
  const lines = str.split('\n');
  const outLines = [];
  let inList = false;
  let listType = 'ul';
  let inMdTable = false;
  let mdTableLines = [];
  let inHtmlTable = false;
  let htmlTableLines = [];
  let inHtmlBlock = false;
  let htmlBlockTag = '';
  let htmlBlockLines = [];

  const closeList = () => {
    if (inList) {
      outLines.push(listType === 'ol' ? '</ol>' : '</ul>');
      inList = false;
    }
  };

  const flushMdTable = () => {
    if (inMdTable && mdTableLines.length > 0) {
      const tableObj = parseMarkdownTableToObject(mdTableLines.join('\n'));
      if (tableObj) {
        const ths = tableObj.headers.map(h => `<th>${formatInlineToHtml(h) || '&nbsp;'}</th>`).join('');
        const trs = tableObj.rows.map(row => {
          const tds = row.map(c => `<td>${formatInlineToHtml(c) || '<br>'}</td>`).join('');
          return `<tr>${tds}</tr>`;
        }).join('');
        outLines.push(`<table class="doc-render-table doc-editor-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table><p><br></p>`);
      } else {
        mdTableLines.forEach(l => outLines.push(`<p>${formatInlineToHtml(l)}</p>`));
      }
      mdTableLines = [];
      inMdTable = false;
    }
  };

  const flushHtmlTable = () => {
    if (inHtmlTable && htmlTableLines.length > 0) {
      let rawHtml = htmlTableLines.join('\n');
      if (/<table(?![^>]*class=)/i.test(rawHtml)) {
        rawHtml = rawHtml.replace(/<table/i, '<table class="doc-render-table doc-editor-table"');
      } else {
        rawHtml = rawHtml.replace(/<table([^>]*class=["'])([^"']*)(["'])/i, (m, p1, p2, p3) => {
          const cls = p2.includes('doc-editor-table') ? p2 : `${p2} doc-render-table doc-editor-table`.trim();
          return `<table${p1}${cls}${p3}`;
        });
      }
      rawHtml = rawHtml.replace(/<td>\s*<\/td>/gi, '<td><br></td>').replace(/<th>\s*<\/th>/gi, '<th><br></th>');
      outLines.push(`${rawHtml}<p><br></p>`);
      htmlTableLines = [];
      inHtmlTable = false;
    }
  };

  const flushHtmlBlock = () => {
    if (inHtmlBlock && htmlBlockLines.length > 0) {
      const raw = htmlBlockLines.join('\n');
      const m = raw.match(new RegExp(`^<(${htmlBlockTag})(\\s+[^>]*)?>(.*?)<\\/\\1>$`, 'is'));
      if (m) {
        const attrs = m[2] || '';
        const inner = m[3];
        if (htmlBlockTag === 'center') {
          outLines.push(`<p style="text-align: center;">${formatInlineToHtml(inner)}</p>`);
        } else {
          outLines.push(`<${htmlBlockTag}${attrs}>${formatInlineToHtml(inner)}</${htmlBlockTag}>`);
        }
      } else {
        outLines.push(raw);
      }
      inHtmlBlock = false;
      htmlBlockTag = '';
      htmlBlockLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // HTML Block multi-line continuation
    if (inHtmlBlock) {
      htmlBlockLines.push(rawLine);
      if (new RegExp(`</${htmlBlockTag}>`, 'i').test(trimmed)) {
        flushHtmlBlock();
      }
      continue;
    }

    // HTML Table check
    if (inHtmlTable) {
      htmlTableLines.push(rawLine);
      if (/<\/table>/i.test(trimmed)) {
        flushHtmlTable();
      }
      continue;
    }
    if (/<table[\s>]/i.test(trimmed)) {
      closeList();
      flushMdTable();
      inHtmlTable = true;
      htmlTableLines = [rawLine];
      if (/<\/table>/i.test(trimmed)) {
        flushHtmlTable();
      }
      continue;
    }

    // Markdown Table check
    const isPipeRow = (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
      (trimmed.includes('|') && (inMdTable || (i + 1 < lines.length && /^[ \t]*\|?[-:\s|]+?\|?[ \t]*$/.test(lines[i + 1].trim()))));

    if (isPipeRow) {
      closeList();
      if (!inMdTable) {
        inMdTable = true;
      }
      mdTableLines.push(rawLine);
      continue;
    } else if (inMdTable) {
      flushMdTable();
    }

    if (!trimmed) {
      closeList();
      outLines.push('<p><br></p>');
      continue;
    }

    // HTML Block with alignment or general HTML element (p, h1-h6, div, blockquote, center)
    const openBlockMatch = trimmed.match(/^<(p|h[1-6]|div|blockquote|center)(\s+[^>]*)?>/i);
    if (openBlockMatch) {
      closeList();
      flushMdTable();
      const tagName = openBlockMatch[1].toLowerCase();
      if (new RegExp(`</${tagName}>$`, 'i').test(trimmed)) {
        const fullMatch = trimmed.match(new RegExp(`^<${tagName}(\\s+[^>]*)?>(.*?)<\\/${tagName}>$`, 'is'));
        if (fullMatch) {
          const attrs = fullMatch[1] || '';
          const inner = fullMatch[2];
          if (tagName === 'center') {
            outLines.push(`<p style="text-align: center;">${formatInlineToHtml(inner)}</p>`);
          } else {
            outLines.push(`<${tagName}${attrs}>${formatInlineToHtml(inner)}</${tagName}>`);
          }
        } else {
          outLines.push(trimmed);
        }
      } else {
        inHtmlBlock = true;
        htmlBlockTag = tagName;
        htmlBlockLines = [rawLine];
      }
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      closeList();
      outLines.push(`<h3>${formatInlineToHtml(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      outLines.push(`<h2>${formatInlineToHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      outLines.push(`<h1>${formatInlineToHtml(trimmed.slice(2))}</h1>`);
      continue;
    }

    // Bullet Lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      if (!inList || listType !== 'ul') {
        closeList();
        outLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      outLines.push(`<li>${formatInlineToHtml(trimmed.slice(2))}</li>`);
      continue;
    }

    // Numbered Lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        outLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      outLines.push(`<li>${formatInlineToHtml(numMatch[2])}</li>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      closeList();
      outLines.push(`<blockquote>${formatInlineToHtml(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Horizontal Rule
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      outLines.push('<hr>');
      continue;
    }

    // Regular paragraph
    closeList();
    outLines.push(`<p>${formatInlineToHtml(trimmed)}</p>`);
  }

  closeList();
  flushMdTable();
  flushHtmlTable();
  flushHtmlBlock();

  return outLines.join('') || '<p><br></p>';
}

// ── Convert WYSIWYG HTML back to clean readable markdown/html ──
function wysiwygHtmlToContent(html) {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  const nodeToText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    // Table conversion
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const headTr = node.querySelector('thead tr') || rows[0];
      const headCells = Array.from(headTr.querySelectorAll('th, td')).map(c => c.textContent.trim() || ' ');
      const bodyTrs = node.querySelector('thead tr') 
        ? Array.from(node.querySelectorAll('tbody tr')) 
        : rows.slice(1);

      const headThs = headCells.map(h => `    <th>${h}</th>`).join('\n');
      const trs = bodyTrs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td, th')).map(c => {
          const content = c.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
          return `    <td>${content || ''}</td>`;
        }).join('\n');
        return `  <tr>\n${tds}\n  </tr>`;
      }).join('\n');

      return `\n\n<table class="doc-render-table">\n  <thead>\n  <tr>\n${headThs}\n  </tr>\n  </thead>\n  <tbody>\n${trs}\n  </tbody>\n</table>\n\n`;
    }

    const childrenText = Array.from(node.childNodes).map(nodeToText).join('');

    if (tag === 'strong' || tag === 'b') {
      return childrenText ? `**${childrenText.trim()}**` : '';
    }
    if (tag === 'em' || tag === 'i') {
      return childrenText ? `*${childrenText.trim()}*` : '';
    }
    if (tag === 'del' || tag === 'strike' || tag === 's') {
      return childrenText ? `~~${childrenText.trim()}~~` : '';
    }
    if (tag === 'code') {
      return childrenText ? `\`${childrenText}\`` : '';
    }
    if (tag === 'a') {
      const href = node.getAttribute('href') || '#';
      return `[${childrenText.trim() || href}](${href})`;
    }
    if (tag === 'img') {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      return `\n![${alt}](${src})\n`;
    }

    // Extract alignment, line-height, and margins from style or attributes
    const align = (node.style?.textAlign || node.getAttribute?.('align') || '').toLowerCase();
    const hasSpecialAlign = ['center', 'right', 'justify'].includes(align);
    const lineHeight = node.style?.lineHeight || '';
    const marginBottom = node.style?.marginBottom || '';
    const marginTop = node.style?.marginTop || '';

    const styles = [];
    if (hasSpecialAlign) styles.push(`text-align: ${align}`);
    if (lineHeight) styles.push(`line-height: ${lineHeight}`);
    if (marginBottom) styles.push(`margin-bottom: ${marginBottom}`);
    if (marginTop) styles.push(`margin-top: ${marginTop}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    if (tag === 'h1') {
      if (styles.length > 0) return `\n<h1${styleAttr}>${childrenText.trim()}</h1>\n`;
      return `\n# ${childrenText.trim()}\n`;
    }
    if (tag === 'h2') {
      if (styles.length > 0) return `\n<h2${styleAttr}>${childrenText.trim()}</h2>\n`;
      return `\n## ${childrenText.trim()}\n`;
    }
    if (tag === 'h3') {
      if (styles.length > 0) return `\n<h3${styleAttr}>${childrenText.trim()}</h3>\n`;
      return `\n### ${childrenText.trim()}\n`;
    }
    if (tag === 'blockquote') {
      if (styles.length > 0) return `\n<blockquote${styleAttr}>${childrenText.trim()}</blockquote>\n`;
      return `\n> ${childrenText.trim()}\n`;
    }
    if (tag === 'hr') return '\n---\n';
    if (tag === 'br') return '\n';

    if (tag === 'li') {
      return `\n- ${childrenText.trim()}`;
    }
    if (tag === 'ul' || tag === 'ol') {
      return `${childrenText}\n`;
    }

    // Color or highlight span
    if (tag === 'span' && (node.style.color || node.style.backgroundColor || node.getAttribute('style'))) {
      const style = node.getAttribute('style');
      return `<span style="${style}">${childrenText}</span>`;
    }
    if (tag === 'mark') {
      const style = node.getAttribute('style');
      return `<mark${style ? ` style="${style}"` : ''}>${childrenText}</mark>`;
    }
    if (tag === 'font') {
      const color = node.getAttribute('color');
      if (color) {
        return `<span style="color: ${color};">${childrenText}</span>`;
      }
      return childrenText;
    }

    if (tag === 'div' || tag === 'p') {
      const isParaEmpty = !childrenText.trim() || childrenText === '\n';
      if (isParaEmpty) {
        return `\n<p${styleAttr}><br></p>\n`;
      }
      if (styles.length > 0) {
        return `\n<p${styleAttr}>${childrenText}</p>\n`;
      }
      return `\n\n${childrenText}\n\n`;
    }

    return childrenText;
  };

  let output = Array.from(root.childNodes).map(nodeToText).join('');
  output = output.replace(/\n{4,}/g, '\n\n\n').trim();
  return output;
}

// ── Visual Desktop WYSIWYG Text Segment Surface ──
function WysiwygTextSegment({ segmentId, initialContent, onChange, onFocus, onSelectCaret, disabled, placeholder }) {
  const editorRef = useRef(null);
  const isInternalUpdate = useRef(false);

  // Initialize HTML once or when segment changes externally
  React.useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      const convertedHtml = rawTextToWysiwygHtml(initialContent);
      editorRef.current.innerHTML = convertedHtml;
    }
    isInternalUpdate.current = false;
  }, [segmentId]);

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const currentHtml = editorRef.current.innerHTML;
    const serializedText = wysiwygHtmlToContent(currentHtml);
    onChange(serializedText);
    if (onSelectCaret) onSelectCaret(editorRef.current);
  };

  const handleBlur = () => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const serializedText = wysiwygHtmlToContent(currentHtml);
    onChange(serializedText);
  };

  const handleCaretChange = () => {
    if (onSelectCaret && editorRef.current) {
      onSelectCaret(editorRef.current);
    }
  };

  return (
    <div className="doc-segment-text-wrapper">
      <div
        ref={editorRef}
        data-segment-id={segmentId}
        className="doc-segment-wysiwyg"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        onFocus={(e) => {
          if (onFocus) onFocus(e);
          handleCaretChange();
        }}
        onKeyUp={handleCaretChange}
        onMouseUp={handleCaretChange}
        data-placeholder={placeholder || "Type document content here (formatting like bold, colors & highlights apply visually)..."}
      />
    </div>
  );
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
  let inHtmlTable = false;
  let htmlTableLines = [];
  let inHtmlBlock = false;
  let htmlBlockTag = '';
  let htmlBlockAttrs = '';
  let htmlBlockLines = [];
  let paragraphLines = [];
  let consecutiveBlankLines = 0;

  const normalizeTitle = (t) => (t || '').toLowerCase().replace(/^[#\s\d\.\-–—]+/, '').replace(/[^a-z0-9]/g, '');
  const normSecTitle = normalizeTitle(sectionTitle);

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const pIdx = elements.length;
      const content = paragraphLines.map((l, lIdx) => (
        <React.Fragment key={lIdx}>
          {lIdx > 0 && <br />}
          {formatInline(l)}
        </React.Fragment>
      ));
      elements.push(
        <p key={`p-${pIdx}`} className="doc-paragraph">
          {content}
        </p>
      );
      paragraphLines = [];
    }
  };

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

  const flushHtmlTable = () => {
    if (inHtmlTable && htmlTableLines.length > 0) {
      const rawHtml = htmlTableLines.join('\n');
      const formattedHtml = formatHtmlTable(rawHtml);
      elements.push(
        <div
          key={`html-table-${elements.length}`}
          className="doc-table-wrapper doc-html-table-wrapper"
          dangerouslySetInnerHTML={{ __html: formattedHtml }}
        />
      );
      htmlTableLines = [];
      inHtmlTable = false;
    }
  };

  const flushHtmlBlock = () => {
    if (inHtmlBlock && htmlBlockLines.length > 0) {
      flushParagraph();
      flushList();
      flushTable();
      const rawHtml = htmlBlockLines.join('\n');
      const innerMatch = rawHtml.match(new RegExp(`^<(${htmlBlockTag})(\\s+[^>]*)?>(.*?)<\\/\\1>$`, 'is'));
      const innerText = innerMatch ? innerMatch[3] : htmlBlockLines.join('\n');
      const attrs = innerMatch ? (innerMatch[2] || '') : htmlBlockAttrs;

      let styleObj = {};
      const styleAttrMatch = attrs.match(/style=["']([^"']*)["']/i);
      if (styleAttrMatch) {
        const rules = styleAttrMatch[1].split(';');
        for (const rule of rules) {
          const colonIdx = rule.indexOf(':');
          if (colonIdx > 0) {
            const prop = rule.slice(0, colonIdx).trim().toLowerCase();
            const val = rule.slice(colonIdx + 1).trim();
            if (prop === 'text-align') styleObj.textAlign = val;
            else if (prop === 'line-height') styleObj.lineHeight = val;
            else if (prop === 'margin-bottom') styleObj.marginBottom = val;
            else if (prop === 'margin-top') styleObj.marginTop = val;
            else if (prop === 'padding') styleObj.padding = val;
            else if (prop === 'font-size') styleObj.fontSize = val;
            else if (prop === 'font-weight') styleObj.fontWeight = val;
            else if (prop === 'color') styleObj.color = val;
          }
        }
      }
      const attrAlign = attrs.match(/align=["']?(left|center|right|justify)["']?/i);
      if (attrAlign && !styleObj.textAlign) {
        styleObj.textAlign = attrAlign[1].toLowerCase();
      }
      if (htmlBlockTag === 'center' && !styleObj.textAlign) {
        styleObj.textAlign = 'center';
      }

      const trimmedInner = innerText.trim();
      const isEmptyPara = !trimmedInner || trimmedInner === '<br>' || trimmedInner === '<br/>' || trimmedInner === '<br />';
      const inlineFormatted = isEmptyPara ? <br /> : formatInline(innerText);
      const idx = elements.length;

      const styleProp = Object.keys(styleObj).length > 0 ? styleObj : undefined;
      const emptyClass = isEmptyPara ? ' doc-empty-paragraph' : '';

      if (htmlBlockTag === 'h1') {
        elements.push(<h2 key={idx} className="doc-section-h2" style={styleProp}>{inlineFormatted}</h2>);
      } else if (htmlBlockTag === 'h2') {
        elements.push(<h3 key={idx} className="doc-section-h3" style={styleProp}>{inlineFormatted}</h3>);
      } else if (htmlBlockTag === 'h3' || htmlBlockTag === 'h4') {
        elements.push(<h4 key={idx} className="doc-subheading" style={styleProp}>{inlineFormatted}</h4>);
      } else if (htmlBlockTag === 'blockquote') {
        elements.push(<blockquote key={idx} className="doc-quote" style={styleProp}>{inlineFormatted}</blockquote>);
      } else {
        elements.push(<p key={idx} className={`doc-paragraph${emptyClass}`} style={styleProp}>{inlineFormatted}</p>);
      }

      inHtmlBlock = false;
      htmlBlockTag = '';
      htmlBlockAttrs = '';
      htmlBlockLines = [];
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
      flushParagraph();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        flushTable();
        flushHtmlTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Handle Multi-line HTML block continuation
    if (inHtmlBlock) {
      htmlBlockLines.push(line);
      if (new RegExp(`</${htmlBlockTag}>`, 'i').test(trimmed)) {
        flushHtmlBlock();
      }
      continue;
    }

    // Handle Raw HTML Table block (<table ... </table>)
    if (inHtmlTable) {
      htmlTableLines.push(line);
      if (/<\/table>/i.test(trimmed)) {
        flushHtmlTable();
      }
      continue;
    }

    if (/<table[\s>]/i.test(trimmed)) {
      flushParagraph();
      flushList();
      flushTable();
      inHtmlTable = true;
      htmlTableLines = [line];
      if (/<\/table>/i.test(trimmed)) {
        flushHtmlTable();
      }
      continue;
    }

    // Empty line flushes active blocks & handles gaps
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      consecutiveBlankLines++;
      if (consecutiveBlankLines >= 2) {
        elements.push(<div key={`gap-${idx}`} className="doc-paragraph-gap" />);
      }
      continue;
    }
    consecutiveBlankLines = 0;

    // Markdown Table lines: supports | cell | cell | as well as cell | cell
    const isPipeRow = (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
      (trimmed.includes('|') && (inTable || (idx + 1 < lines.length && /^[ \t]*\|?[-:\s|]+?\|?[ \t]*$/.test(lines[idx + 1].trim()))));

    if (isPipeRow) {
      flushParagraph();
      flushList();
      flushHtmlTable();
      // Clean leading and trailing pipes
      const cleanLine = trimmed.replace(/^\|/, '').replace(/\|$/, '');
      const cells = cleanLine.split('|').map(c => c.trim());
      // Check if divider row |---|---|
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        // Divider row, indicates active table mode
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
      flushParagraph();
      flushList();
      elements.push(<hr key={idx} className="doc-hr" />);
      continue;
    }

    // Standalone Image: ![alt](url)
    const standAloneImgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standAloneImgMatch) {
      flushParagraph();
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

    // HTML element with alignment or styling (<p style="text-align: ...">, <h1 ...>, <center>, etc.)
    const openHtmlMatch = trimmed.match(/^<(p|h[1-6]|div|blockquote|center)(\s+[^>]*)?>/i);
    if (openHtmlMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const tagName = openHtmlMatch[1].toLowerCase();
      inHtmlBlock = true;
      htmlBlockTag = tagName;
      htmlBlockAttrs = openHtmlMatch[2] || '';
      htmlBlockLines = [line];
      if (new RegExp(`</${tagName}>$`, 'i').test(trimmed)) {
        flushHtmlBlock();
      }
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      flushParagraph();
      flushList();
      elements.push(<h4 key={idx} className="doc-subheading">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      elements.push(<h3 key={idx} className="doc-section-h3">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushParagraph();
      flushList();
      elements.push(<h2 key={idx} className="doc-section-h2">{formatInline(trimmed.slice(2))}</h2>);
    }

    // Task Checkboxes: - [ ] or - [x]
    else if (/^[-*]\s+\[([ xX])\]\s+(.*)/.test(trimmed)) {
      flushParagraph();
      const match = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
      inList = true;
      listType = 'ul';
      listItems.push({ isTask: true, checked: match[1].toLowerCase() === 'x', text: match[2] });
    }

    // Bullet Lists: - item or * item
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      flushParagraph();
      inList = true;
      listType = 'ul';
      listItems.push({ isTask: false, text: trimmed.slice(2) });
    }

    // Numbered Lists: 1. item
    else if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      inList = true;
      listType = 'ol';
      listItems.push(trimmed.replace(/^\d+\.\s*/, ''));
    }

    // GitHub-Style Alerts: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION]
    else if (trimmed.startsWith('> [!') || trimmed.startsWith('>')) {
      flushParagraph();
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
      paragraphLines.push(trimmed);
    }
  }

  flushParagraph();
  flushList();
  flushTable();
  flushHtmlTable();
  flushHtmlBlock();
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
  const [editorInitialHtml, setEditorInitialHtml] = useState('');
  const [activeTableInfo, setActiveTableInfo] = useState(null);
  const unifiedEditorRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tableRowsCount, setTableRowsCount] = useState(3);
  const [tableColsCount, setTableColsCount] = useState(3);
  const [editPreviewMode, setEditPreviewMode] = useState(false);
  const [currentAlignment, setCurrentAlignment] = useState('left');
  const [currentLineHeight, setCurrentLineHeight] = useState('normal');
  const [currentParagraphSpacing, setCurrentParagraphSpacing] = useState('normal');
  const [showSpacingMenu, setShowSpacingMenu] = useState(false);
  const activeTextareaRef = useRef(null);
  const savedRangeRef = useRef(null); // Preserves exact user caret position across modal/toolbar clicks
  const savedCaretOffsetRef = useRef(null); // { startOff, endOff } as character counts
  const blockRefs = useRef({});

  // Initialize unified editor HTML whenever a block enters edit mode
  React.useEffect(() => {
    if (editingKey && unifiedEditorRef.current) {
      unifiedEditorRef.current.innerHTML = editorInitialHtml;
      activeTextareaRef.current = unifiedEditorRef.current;
      checkActiveTable();
      checkCurrentAlignment();
      checkCurrentSpacing();
    }
  }, [editingKey, editorInitialHtml]);

  // Get absolute character offset of a DOM position within a container.
  // Handles BOTH text nodes (nodeOffset = char index) AND element nodes (nodeOffset = child index).
  const getCharOffset = (container, targetNode, targetOffset) => {
    let chars = 0;

    function visit(node) {
      // Found the target node
      if (node === targetNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          // text node: add character offset within it
          chars += targetOffset;
        } else {
          // element node: targetOffset = child count BEFORE cursor; sum their text lengths
          for (let i = 0; i < Math.min(targetOffset, node.childNodes.length); i++) {
            chars += node.childNodes[i].textContent.length;
          }
        }
        return true; // stop
      }

      if (node.nodeType === Node.TEXT_NODE) {
        chars += node.length;
        return false;
      }

      // Visit element's children
      for (let i = 0; i < node.childNodes.length; i++) {
        if (visit(node.childNodes[i])) return true;
      }
      return false;
    }

    visit(container);
    return chars;
  };

  // Walk DOM text nodes to find the node+offset for a given absolute char offset.
  const findNodeAtOffset = (container, targetOffset) => {
    let offset = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const current = walker.currentNode;
      const len = current.length;
      if (offset + len >= targetOffset) {
        return { node: current, offset: targetOffset - offset };
      }
      offset += len;
    }
    // Fallback: place at very end of last text node, or container end
    const lastWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let lastText = null;
    while (lastWalker.nextNode()) lastText = lastWalker.currentNode;
    if (lastText) return { node: lastText, offset: lastText.length };
    return { node: container, offset: container.childNodes.length };
  };

  // Helper to save selection inside active contenteditable
  const saveCurrentSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let node = range.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const editorEl = node?.closest?.('.doc-unified-wysiwyg');
      if (editorEl) {
        activeTextareaRef.current = editorEl;
        savedRangeRef.current = range.cloneRange();
        try {
          const startOff = getCharOffset(editorEl, range.startContainer, range.startOffset);
          const endOff   = getCharOffset(editorEl, range.endContainer,   range.endOffset);
          savedCaretOffsetRef.current = { startOff, endOff };
        } catch (_) {}
      }
    }
  };

  // Restore selection — prefers cloned Range, with offset-based fallback
  const restoreSavedSelection = () => {
    const activeEl = unifiedEditorRef.current || activeTextareaRef.current;
    if (!activeEl) return;

    if (savedRangeRef.current) {
      try {
        const sel = window.getSelection();
        if (sel && activeEl.contains(savedRangeRef.current.commonAncestorContainer)) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
          return;
        }
      } catch (_) {}
    }

    if (savedCaretOffsetRef.current) {
      try {
        const { startOff, endOff } = savedCaretOffsetRef.current;
        const startPos = findNodeAtOffset(activeEl, startOff);
        const endPos   = findNodeAtOffset(activeEl, endOff);
        const newRange = document.createRange();
        newRange.setStart(startPos.node, startPos.offset);
        newRange.setEnd(endPos.node, endPos.offset);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedRangeRef.current = newRange.cloneRange();
          return;
        }
      } catch (_) {}
    }
  };

  const handleStartEdit = (block) => {
    setEditingKey(block.block_key);
    const html = rawTextToWysiwygHtml(block.content || '');
    setEditorInitialHtml(html);
    setEditPreviewMode(false);
    setShowLinkModal(false);
    setShowImageModal(false);
    setShowTableModal(false);
    setActiveTableInfo(null);
    savedRangeRef.current = null;
    savedCaretOffsetRef.current = null;
  };

  const handleSaveEdit = async (blockKey) => {
    try {
      setSaving(true);
      const html = unifiedEditorRef.current ? unifiedEditorRef.current.innerHTML : editorInitialHtml;
      const serialized = wysiwygHtmlToContent(html);
      await artifactsApi.updateBlock(artifactId, blockKey, serialized, 'Manual edit from Canvas', token);
      setEditingKey(null);
      if (onBlockUpdated) {
        onBlockUpdated(blockKey, serialized);
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

  // ── Table Context & Keyboard Navigation Helpers ──
  const focusCell = (cell) => {
    if (!cell) return;
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    cell.focus?.();
    savedRangeRef.current = range.cloneRange();
  };

  const getActiveTableContext = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    const cell = node?.closest('td, th');
    const row = node?.closest('tr');
    const table = node?.closest('table');
    if (!table || !unifiedEditorRef.current?.contains(table)) return null;
    return { table, row, cell, range };
  };

  const checkActiveTable = () => {
    const ctx = getActiveTableContext();
    if (ctx && ctx.table) {
      setActiveTableInfo({ table: ctx.table });
    } else {
      setActiveTableInfo(null);
    }
  };

  const checkCurrentAlignment = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const blockEl = node?.closest?.('p, h1, h2, h3, h4, div, blockquote, th, td');
      if (blockEl && blockEl !== unifiedEditorRef.current && unifiedEditorRef.current?.contains(blockEl)) {
        const align = (blockEl.style?.textAlign || window.getComputedStyle(blockEl).textAlign || '').toLowerCase();
        if (['center', 'right', 'justify'].includes(align)) {
          setCurrentAlignment(align);
          return;
        }
      }
    }
    setCurrentAlignment('left');
  };

  const handleSetAlignment = (align) => {
    const editor = unifiedEditorRef.current;
    if (!editor) return;

    restoreSavedSelection();
    editor.focus({ preventScroll: true });
    restoreSavedSelection();

    const cmdMap = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull'
    };

    const cmd = cmdMap[align] || 'justifyLeft';
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, null);
    } catch (_) {}

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (node === editor) {
        Array.from(editor.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && sel.containsNode(child, true)) {
            if (align === 'left') {
              child.style.textAlign = '';
            } else {
              child.style.textAlign = align;
            }
          }
        });
      } else {
        const blockEl = node?.closest?.('p, h1, h2, h3, h4, div, blockquote, th, td');
        if (blockEl && blockEl !== editor && editor.contains(blockEl)) {
          if (align === 'left') {
            blockEl.style.textAlign = '';
          } else {
            blockEl.style.textAlign = align;
          }
        }
      }
    }

    setCurrentAlignment(align);
    saveCurrentSelection();
  };

  const checkCurrentSpacing = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const blockEl = node?.closest?.('p, h1, h2, h3, h4, div, blockquote, th, td');
      if (blockEl && blockEl !== unifiedEditorRef.current && unifiedEditorRef.current?.contains(blockEl)) {
        const lh = blockEl.style?.lineHeight || '';
        setCurrentLineHeight(lh || 'normal');
        const mb = blockEl.style?.marginBottom || '';
        setCurrentParagraphSpacing(mb || 'normal');
        return;
      }
    }
    setCurrentLineHeight('normal');
    setCurrentParagraphSpacing('normal');
  };

  const handleSetLineSpacing = (lh) => {
    const editor = unifiedEditorRef.current;
    if (!editor) return;

    restoreSavedSelection();
    editor.focus({ preventScroll: true });
    restoreSavedSelection();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (node === editor) {
        Array.from(editor.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && sel.containsNode(child, true)) {
            child.style.lineHeight = lh === 'normal' ? '' : lh;
          }
        });
      } else {
        const blockEl = node?.closest?.('p, h1, h2, h3, h4, div, blockquote, th, td');
        if (blockEl && blockEl !== editor && editor.contains(blockEl)) {
          blockEl.style.lineHeight = lh === 'normal' ? '' : lh;
        }
      }
    }

    setCurrentLineHeight(lh);
    setShowSpacingMenu(false);
    saveCurrentSelection();
  };

  const handleSetParagraphSpacing = (mb) => {
    const editor = unifiedEditorRef.current;
    if (!editor) return;

    restoreSavedSelection();
    editor.focus({ preventScroll: true });
    restoreSavedSelection();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

      if (node === editor) {
        Array.from(editor.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE && sel.containsNode(child, true)) {
            child.style.marginBottom = mb === 'normal' ? '' : mb;
          }
        });
      } else {
        const blockEl = node?.closest?.('p, h1, h2, h3, h4, div, blockquote, th, td');
        if (blockEl && blockEl !== editor && editor.contains(blockEl)) {
          blockEl.style.marginBottom = mb === 'normal' ? '' : mb;
        }
      }
    }

    setCurrentParagraphSpacing(mb);
    setShowSpacingMenu(false);
    saveCurrentSelection();
  };

  const handleAddTableRow = () => {
    const ctx = getActiveTableContext();
    if (!ctx || !ctx.table) return;
    const { table, row } = ctx;
    const theadThs = table.querySelectorAll('thead th, thead td');
    const colCount = theadThs.length > 0
      ? theadThs.length
      : (table.querySelector('tr')?.children.length || 3);

    const newTr = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      newTr.appendChild(td);
    }

    if (row && row.parentNode) {
      if (row.parentNode.tagName === 'THEAD') {
        const tbody = table.querySelector('tbody');
        if (tbody && tbody.firstChild) {
          tbody.insertBefore(newTr, tbody.firstChild);
        } else if (tbody) {
          tbody.appendChild(newTr);
        } else {
          row.parentNode.insertBefore(newTr, row.nextSibling);
        }
      } else {
        row.parentNode.insertBefore(newTr, row.nextSibling);
      }
    } else {
      const tbody = table.querySelector('tbody') || table;
      tbody.appendChild(newTr);
    }

    focusCell(newTr.children[0]);
    checkActiveTable();
  };

  const handleDeleteTableRow = () => {
    const ctx = getActiveTableContext();
    if (!ctx || !ctx.table || !ctx.row) return;
    const { table, row } = ctx;
    const allRows = table.querySelectorAll('tr');
    if (allRows.length <= 1) {
      handleDeleteTable();
      return;
    }
    const nextRow = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (nextRow) {
      focusCell(nextRow.querySelector('td, th'));
    }
    checkActiveTable();
  };

  const handleAddTableCol = () => {
    const ctx = getActiveTableContext();
    if (!ctx || !ctx.table) return;
    const { table, cell } = ctx;
    const colIndex = cell ? Array.from(cell.parentNode.children).indexOf(cell) : -1;
    const rows = table.querySelectorAll('tr');

    rows.forEach((tr, rIdx) => {
      const isHead = tr.parentNode.tagName === 'THEAD' || rIdx === 0;
      const newCell = document.createElement(isHead ? 'th' : 'td');
      if (isHead) {
        newCell.textContent = `Column ${tr.children.length + 1}`;
      } else {
        newCell.innerHTML = '<br>';
      }

      if (colIndex >= 0 && colIndex < tr.children.length) {
        tr.insertBefore(newCell, tr.children[colIndex].nextSibling);
      } else {
        tr.appendChild(newCell);
      }
    });

    if (cell && cell.nextElementSibling) {
      focusCell(cell.nextElementSibling);
    }
    checkActiveTable();
  };

  const handleDeleteTableCol = () => {
    const ctx = getActiveTableContext();
    if (!ctx || !ctx.table || !ctx.cell) return;
    const { table, cell } = ctx;
    const colIndex = Array.from(cell.parentNode.children).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    const firstRowCols = rows[0]?.children.length || 0;

    if (firstRowCols <= 1) {
      handleDeleteTable();
      return;
    }

    rows.forEach(tr => {
      if (tr.children[colIndex]) {
        tr.children[colIndex].remove();
      }
    });

    checkActiveTable();
  };

  const handleDeleteTable = () => {
    const ctx = getActiveTableContext();
    if (!ctx || !ctx.table) return;
    const { table } = ctx;
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    table.parentNode.insertBefore(p, table);
    table.remove();
    focusCell(p);
    setActiveTableInfo(null);
  };

  // Helper: Get the exact Range inside the editor where the user placed their cursor
  const getEffectiveRange = (editorEl) => {
    if (!editorEl) return null;

    // Priority 1: savedRangeRef if valid and inside editor
    if (savedRangeRef.current) {
      try {
        const sc = savedRangeRef.current.startContainer;
        if (sc && (sc === editorEl || editorEl.contains(sc)) && sc.isConnected) {
          // If sc is editorEl and offset is 0, only accept if editor has no children
          if (sc !== editorEl || editorEl.childNodes.length === 0 || savedRangeRef.current.startOffset > 0) {
            return savedRangeRef.current.cloneRange();
          }
        }
      } catch (_) {}
    }

    // Priority 2: savedCaretOffsetRef character index
    if (savedCaretOffsetRef.current) {
      try {
        const { startOff, endOff } = savedCaretOffsetRef.current;
        const startPos = findNodeAtOffset(editorEl, startOff);
        const endPos = findNodeAtOffset(editorEl, endOff);
        if (startPos && startPos.node && endPos && endPos.node) {
          const rng = document.createRange();
          rng.setStart(startPos.node, startPos.offset);
          rng.setEnd(endPos.node, endPos.offset);
          return rng;
        }
      } catch (_) {}
    }

    // Priority 3: current active window selection
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rng = sel.getRangeAt(0);
      const sc = rng.startContainer;
      if (sc && (sc === editorEl || editorEl.contains(sc)) && sc.isConnected) {
        return rng.cloneRange();
      }
    }

    return null;
  };

  // Helper: Insert a DOM node/fragment at the exact effective range inside the editor
  const insertNodeAtEffectiveRange = (editorEl, nodeToInsert, placeCaretAfter = true) => {
    const range = getEffectiveRange(editorEl);
    const sel = window.getSelection();

    if (range) {
      range.deleteContents();
      range.insertNode(nodeToInsert);

      if (placeCaretAfter && sel) {
        const newRange = document.createRange();
        newRange.setStartAfter(nodeToInsert);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
        try {
          const startOff = getCharOffset(editorEl, newRange.startContainer, newRange.startOffset);
          savedCaretOffsetRef.current = { startOff, endOff: startOff };
        } catch (_) {}
      }
    } else {
      editorEl.appendChild(nodeToInsert);
      if (placeCaretAfter && sel) {
        const newRange = document.createRange();
        newRange.setStartAfter(nodeToInsert);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        savedRangeRef.current = newRange.cloneRange();
      }
    }
  };

  // ── Directly Insert Visual Table at Cursor (100% Inside Editor Box, Seamless) ──
  const handleInsertUnifiedTable = (customRows, customCols) => {
    const rows = Math.max(1, Math.min(20, parseInt(customRows || tableRowsCount, 10) || 3));
    const cols = Math.max(1, Math.min(10, parseInt(customCols || tableColsCount, 10) || 3));

    const editor = unifiedEditorRef.current;
    if (!editor) return;

    const table = document.createElement('table');
    table.className = 'doc-render-table doc-editor-table';

    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    for (let c = 1; c <= cols; c++) {
      const th = document.createElement('th');
      th.textContent = `Column ${c}`;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r <= rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 1; c <= cols; c++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const pAfter = document.createElement('p');
    pAfter.innerHTML = '<br>';

    const frag = document.createDocumentFragment();
    frag.appendChild(table);
    frag.appendChild(pAfter);

    insertNodeAtEffectiveRange(editor, frag, false);

    const firstCell = table.querySelector('tbody td') || table.querySelector('th');
    if (firstCell) {
      focusCell(firstCell);
    }

    setShowTableModal(false);
    checkActiveTable();
  };

  const handleUnifiedKeyDown = (e) => {
    if (e.key === 'Tab') {
      const ctx = getActiveTableContext();
      if (ctx && ctx.cell && ctx.table) {
        e.preventDefault();
        const allCells = Array.from(ctx.table.querySelectorAll('th, td'));
        const currIdx = allCells.indexOf(ctx.cell);
        if (e.shiftKey) {
          if (currIdx > 0) {
            focusCell(allCells[currIdx - 1]);
          }
        } else {
          if (currIdx < allCells.length - 1) {
            focusCell(allCells[currIdx + 1]);
          } else {
            handleAddTableRow();
          }
        }
        return;
      }
    }
  };

  // ── Document Toolbar Insertion Helpers ──
  const insertTextAtCursor = (prefix, suffix = '', defaultText = '') => {
    const activeEl = unifiedEditorRef.current || activeTextareaRef.current;
    if (activeEl) {
      const range = getEffectiveRange(activeEl);
      const selectedText = (range && !range.collapsed) ? range.toString() : defaultText;
      const htmlToInsert = formatInlineToHtml(`${prefix}${selectedText}${suffix}`);
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlToInsert;
      const frag = document.createDocumentFragment();
      while (tempDiv.firstChild) {
        frag.appendChild(tempDiv.firstChild);
      }
      insertNodeAtEffectiveRange(activeEl, frag, true);
      activeEl.focus({ preventScroll: true });
      saveCurrentSelection();
    }
  };

  // ── Non-blocking Inline Popovers for Link & Image ──
  const openLinkModal = () => {
    saveCurrentSelection();
    let textFromRange = '';
    if (savedRangeRef.current && !savedRangeRef.current.collapsed) {
      textFromRange = savedRangeRef.current.toString();
    } else {
      const sel = window.getSelection();
      if (sel && sel.toString()) {
        textFromRange = sel.toString();
      } else if (activeTextareaRef.current?.tagName === 'TEXTAREA') {
        const textarea = activeTextareaRef.current;
        textFromRange = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      }
    }
    if (textFromRange) setLinkText(textFromRange);
    setShowLinkModal(true);
    setShowImageModal(false);
    setShowTableModal(false);
  };

  const handleConfirmInsertLink = (e) => {
    e?.preventDefault();
    const url = linkUrl.trim() || 'https://';
    const text = linkText.trim() || url;
    
    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      const linkEl = document.createElement('a');
      linkEl.href = url;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.className = 'doc-link';
      linkEl.textContent = text;

      const spaceNode = document.createTextNode('\u00A0');
      const frag = document.createDocumentFragment();
      frag.appendChild(linkEl);
      frag.appendChild(spaceNode);

      insertNodeAtEffectiveRange(activeEl, frag, true);
      activeEl.focus({ preventScroll: true });
      saveCurrentSelection();
    }

    setLinkText('');
    setLinkUrl('');
    setShowLinkModal(false);
  };

  const openImageModal = () => {
    saveCurrentSelection();
    setShowImageModal(true);
    setShowLinkModal(false);
    setShowTableModal(false);
  };

  const handleConfirmInsertImage = (e) => {
    e?.preventDefault();
    const url = imageUrl.trim() || 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800';
    const alt = imageAlt.trim() || 'Image description';

    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      const p = document.createElement('p');
      p.className = 'doc-editor-img-para';
      const img = document.createElement('img');
      img.src = url;
      img.alt = alt;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '6px';
      img.style.margin = '8px 0';
      img.style.display = 'block';
      p.appendChild(img);

      const pAfter = document.createElement('p');
      pAfter.innerHTML = '<br>';

      const frag = document.createDocumentFragment();
      frag.appendChild(p);
      frag.appendChild(pAfter);

      insertNodeAtEffectiveRange(activeEl, frag, true);
      activeEl.focus({ preventScroll: true });
      saveCurrentSelection();
    }

    setImageUrl('');
    setImageAlt('');
    setShowImageModal(false);
  };

  const executeWysiwygCommand = (command, value = null) => {
    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      restoreSavedSelection();
      activeEl.focus({ preventScroll: true });
      restoreSavedSelection();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(command, false, value);
      saveCurrentSelection();
      checkActiveTable();
      return true;
    }
    return false;
  };

  const insertColorHighlight = (colorCode) => {
    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      restoreSavedSelection();
      activeEl.focus({ preventScroll: true });
      restoreSavedSelection();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, colorCode);
      setShowColorMenu(false);
      saveCurrentSelection();
    }
  };

  const insertBgHighlight = (bgColor) => {
    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      restoreSavedSelection();
      activeEl.focus({ preventScroll: true });
      restoreSavedSelection();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, bgColor);
      setShowColorMenu(false);
      saveCurrentSelection();
    }
  };

  const insertAlertTemplate = (type = 'NOTE') => {
    const activeEl = unifiedEditorRef.current;
    if (activeEl) {
      restoreSavedSelection();
      activeEl.focus({ preventScroll: true });
      restoreSavedSelection();
      document.execCommand('insertHTML', false, `<blockquote><strong>[!${type}]</strong> Callout text here...</blockquote><p><br></p>`);
      saveCurrentSelection();
    }
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
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('bold')) {
                                insertTextAtCursor('**', '**', 'bold text');
                              }
                            }}
                            title="Bold (Ctrl+B)"
                          >
                            <Bold size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('italic')) {
                                insertTextAtCursor('*', '*', 'italic text');
                              }
                            }}
                            title="Italic (Ctrl+I)"
                          >
                            <Italic size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('strikeThrough')) {
                                insertTextAtCursor('~~', '~~', 'strikethrough');
                              }
                            }}
                            title="Strikethrough"
                          >
                            <Strikethrough size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const sel = window.getSelection();
                              if (sel && sel.rangeCount > 0 && !sel.isCollapsed && activeTextareaRef.current?.isContentEditable) {
                                executeWysiwygCommand('insertHTML', `<code>${sel.toString()}</code>`);
                              } else {
                                insertTextAtCursor('`', '`', 'code');
                              }
                            }}
                            title="Inline Code"
                          >
                            <Code size={13} />
                          </button>
                        </div>

                        {/* Headings */}
                        <div className="doc-toolbar-group">
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('formatBlock', '<h2>')) {
                                insertTextAtCursor('## ', '', 'Heading 2');
                              }
                            }}
                            title="Heading 2"
                          >
                            <Heading2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('formatBlock', '<h3>')) {
                                insertTextAtCursor('### ', '', 'Heading 3');
                              }
                            }}
                            title="Heading 3"
                          >
                            <Heading3 size={13} />
                          </button>
                        </div>

                        {/* Lists */}
                        <div className="doc-toolbar-group">
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('insertUnorderedList')) {
                                insertTextAtCursor('- ', '', 'List item');
                              }
                            }}
                            title="Bullet List"
                          >
                            <List size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!executeWysiwygCommand('insertOrderedList')) {
                                insertTextAtCursor('1. ', '', 'Numbered item');
                              }
                            }}
                            title="Numbered List"
                          >
                            <ListOrdered size={13} />
                          </button>
                          <button
                            type="button"
                            className="doc-toolbar-btn"
                            onMouseDown={(e) => { e.preventDefault(); insertTextAtCursor('- [ ] ', '', 'Task item'); }}
                            title="Task Checkbox"
                          >
                            <CheckSquare size={13} />
                          </button>
                        </div>

                        {/* Text Alignment */}
                        <div className="doc-toolbar-group">
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${currentAlignment === 'left' ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSetAlignment('left');
                            }}
                            title="Align Left"
                          >
                            <AlignLeft size={13} />
                          </button>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${currentAlignment === 'center' ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSetAlignment('center');
                            }}
                            title="Align Center"
                          >
                            <AlignCenter size={13} />
                          </button>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${currentAlignment === 'right' ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSetAlignment('right');
                            }}
                            title="Align Right"
                          >
                            <AlignRight size={13} />
                          </button>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${currentAlignment === 'justify' ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSetAlignment('justify');
                            }}
                            title="Justify"
                          >
                            <AlignJustify size={13} />
                          </button>
                        </div>

                        {/* Line & Paragraph Spacing */}
                        <div className="doc-toolbar-group" style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${showSpacingMenu ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              saveCurrentSelection();
                              setShowSpacingMenu(prev => !prev);
                              setShowTableModal(false);
                              setShowLinkModal(false);
                              setShowImageModal(false);
                            }}
                            title="Line & Paragraph Spacing"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <MoveVertical size={13} />
                            <ChevronDown size={10} />
                          </button>

                          {showSpacingMenu && (
                            <div
                              className="doc-line-spacing-menu"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="doc-spacing-section-title">Line Height</div>
                              {[
                                { label: 'Default (1.7)', value: 'normal' },
                                { label: 'Single (1.0)', value: '1' },
                                { label: 'Compact (1.2)', value: '1.2' },
                                { label: 'Standard (1.5)', value: '1.5' },
                                { label: 'Relaxed (1.8)', value: '1.8' },
                                { label: 'Double (2.0)', value: '2' },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`doc-spacing-option ${currentLineHeight === opt.value ? 'selected' : ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSetLineSpacing(opt.value);
                                  }}
                                >
                                  <span>{opt.label}</span>
                                  {currentLineHeight === opt.value && <span className="doc-spacing-check">✓</span>}
                                </button>
                              ))}

                              <div className="doc-spacing-divider" />
                              <div className="doc-spacing-section-title">Paragraph Space After</div>
                              {[
                                { label: 'Default (12px)', value: 'normal' },
                                { label: 'None (0px)', value: '0px' },
                                { label: 'Tight (6px)', value: '6px' },
                                { label: 'Medium (12px)', value: '12px' },
                                { label: 'Loose (18px)', value: '18px' },
                                { label: 'Wide (24px)', value: '24px' },
                              ].map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`doc-spacing-option ${currentParagraphSpacing === opt.value ? 'selected' : ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSetParagraphSpacing(opt.value);
                                  }}
                                >
                                  <span>{opt.label}</span>
                                  {currentParagraphSpacing === opt.value && <span className="doc-spacing-check">✓</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Rich Insertions (Table, Image, Link, Callout, Colors) */}
                        <div className="doc-toolbar-group" style={{ position: 'relative' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                            <button
                              type="button"
                              className="doc-toolbar-btn doc-toolbar-btn-highlight"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                saveCurrentSelection();
                                handleInsertUnifiedTable(3, 3);
                              }}
                              title="Insert 3x3 Table at Cursor"
                              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, marginRight: 0 }}
                            >
                              <Table size={13} /> Table
                            </button>
                            <button
                              type="button"
                              className={`doc-toolbar-btn ${showTableModal ? 'active' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                saveCurrentSelection();
                                setShowTableModal(prev => !prev);
                                setShowSpacingMenu(false);
                                setShowLinkModal(false);
                                setShowImageModal(false);
                              }}
                              title="Custom Table Dimensions (Rows & Columns)"
                              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '4px 5px', marginLeft: '-1px' }}
                            >
                              <ChevronDown size={11} />
                            </button>

                            {showTableModal && (
                              <div className="doc-table-builder-popover">
                                <div className="doc-table-builder-header">
                                  <span>Custom Table Size</span>
                                  <button type="button" className="doc-mini-btn" onClick={() => setShowTableModal(false)}><X size={12} /></button>
                                </div>
                                <div className="doc-table-builder-body">
                                  <div className="doc-table-builder-grid">
                                    <div className="doc-table-builder-field">
                                      <label>Columns:</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="8"
                                        value={tableColsCount}
                                        onChange={(e) => setTableColsCount(e.target.value)}
                                        className="doc-table-input"
                                      />
                                    </div>
                                    <div className="doc-table-builder-field">
                                      <label>Rows:</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="15"
                                        value={tableRowsCount}
                                        onChange={(e) => setTableRowsCount(e.target.value)}
                                        className="doc-table-input"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="doc-table-insert-btn"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleInsertUnifiedTable();
                                    }}
                                  >
                                    <Plus size={13} /> Insert at Cursor
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Link Button & Non-blocking Inline Popover */}
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              type="button"
                              className={`doc-toolbar-btn ${showLinkModal ? 'active' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                saveCurrentSelection();
                                let textFromRange = '';
                                if (savedRangeRef.current && !savedRangeRef.current.collapsed) {
                                  textFromRange = savedRangeRef.current.toString();
                                }
                                if (textFromRange) setLinkText(textFromRange);
                                setShowLinkModal(prev => !prev);
                                setShowImageModal(false);
                                setShowTableModal(false);
                                setShowSpacingMenu(false);
                              }}
                              title="Insert Link"
                            >
                              <LinkIcon size={13} /> Link
                            </button>

                            {showLinkModal && (
                              <div className="doc-toolbar-popover">
                                <div className="doc-toolbar-popover-header">
                                  <span>Insert Hyperlink</span>
                                  <button type="button" className="doc-mini-btn" onClick={() => setShowLinkModal(false)}><X size={12} /></button>
                                </div>
                                <form className="doc-toolbar-popover-body" onSubmit={handleConfirmInsertLink}>
                                  <div className="doc-toolbar-popover-field">
                                    <label>Text:</label>
                                    <input
                                      type="text"
                                      className="doc-toolbar-popover-input"
                                      value={linkText}
                                      placeholder="Link text"
                                      onChange={(e) => setLinkText(e.target.value)}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="doc-toolbar-popover-field">
                                    <label>URL:</label>
                                    <input
                                      type="text"
                                      className="doc-toolbar-popover-input"
                                      value={linkUrl}
                                      placeholder="https://example.com"
                                      onChange={(e) => setLinkUrl(e.target.value)}
                                    />
                                  </div>
                                  <button type="submit" className="doc-toolbar-popover-submit">
                                    <Check size={12} /> Add Link
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>

                          {/* Image Button & Non-blocking Inline Popover */}
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              type="button"
                              className={`doc-toolbar-btn ${showImageModal ? 'active' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                saveCurrentSelection();
                                setShowImageModal(prev => !prev);
                                setShowLinkModal(false);
                                setShowTableModal(false);
                                setShowSpacingMenu(false);
                              }}
                              title="Insert Image"
                            >
                              <ImageIcon size={13} /> Image
                            </button>

                            {showImageModal && (
                              <div className="doc-toolbar-popover">
                                <div className="doc-toolbar-popover-header">
                                  <span>Insert Image</span>
                                  <button type="button" className="doc-mini-btn" onClick={() => setShowImageModal(false)}><X size={12} /></button>
                                </div>
                                <form className="doc-toolbar-popover-body" onSubmit={handleConfirmInsertImage}>
                                  <div className="doc-toolbar-popover-field">
                                    <label>Description / Alt:</label>
                                    <input
                                      type="text"
                                      className="doc-toolbar-popover-input"
                                      value={imageAlt}
                                      placeholder="Image description"
                                      onChange={(e) => setImageAlt(e.target.value)}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="doc-toolbar-popover-field">
                                    <label>Image URL:</label>
                                    <input
                                      type="text"
                                      className="doc-toolbar-popover-input"
                                      value={imageUrl}
                                      placeholder="https://images.unsplash.com/..."
                                      onChange={(e) => setImageUrl(e.target.value)}
                                    />
                                  </div>
                                  <button type="submit" className="doc-toolbar-popover-submit">
                                    <Check size={12} /> Add Image
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>

                          <button type="button" className="doc-toolbar-btn" onMouseDown={(e) => { e.preventDefault(); saveCurrentSelection(); insertAlertTemplate('NOTE'); }} title="Insert Callout Alert">
                            <AlertCircle size={13} /> Note
                          </button>
                          <button type="button" className="doc-toolbar-btn" onMouseDown={(e) => { e.preventDefault(); saveCurrentSelection(); insertTextAtCursor('> ', '', 'Quote text'); }} title="Blockquote">
                            <Quote size={13} />
                          </button>
                          <button type="button" className="doc-toolbar-btn" onMouseDown={(e) => { e.preventDefault(); saveCurrentSelection(); insertTextAtCursor('\n---\n', ''); }} title="Divider">
                            <Minus size={13} />
                          </button>
                        </div>

                        {/* Color Highlight Dropdown */}
                        <div className="doc-toolbar-group" style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${showColorMenu ? 'active' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              saveCurrentSelection();
                              setShowColorMenu(prev => !prev);
                            }}
                            title="Colors & Highlights"
                          >
                            <Palette size={13} /> Colors
                          </button>

                          {showColorMenu && (
                            <div className="doc-color-picker-menu">
                              <div className="doc-color-menu-title">Text Colors</div>
                              <div className="doc-color-swatches">
                                <button type="button" className="doc-color-circle" style={{ background: '#6366f1' }} title="Indigo" onMouseDown={(e) => { e.preventDefault(); insertColorHighlight('#6366f1'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: '#10b981' }} title="Emerald" onMouseDown={(e) => { e.preventDefault(); insertColorHighlight('#10b981'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: '#f59e0b' }} title="Amber" onMouseDown={(e) => { e.preventDefault(); insertColorHighlight('#f59e0b'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: '#ec4899' }} title="Rose" onMouseDown={(e) => { e.preventDefault(); insertColorHighlight('#ec4899'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: '#06b6d4' }} title="Cyan" onMouseDown={(e) => { e.preventDefault(); insertColorHighlight('#06b6d4'); }} />
                              </div>
                              <div className="doc-color-menu-title" style={{ marginTop: '8px' }}>Background Highlights</div>
                              <div className="doc-color-swatches">
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(99, 102, 241, 0.25)', border: '1px solid #6366f1' }} title="Purple Highlight" onMouseDown={(e) => { e.preventDefault(); insertBgHighlight('rgba(99, 102, 241, 0.2)'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10b981' }} title="Green Highlight" onMouseDown={(e) => { e.preventDefault(); insertBgHighlight('rgba(16, 185, 129, 0.2)'); }} />
                                <button type="button" className="doc-color-circle" style={{ background: 'rgba(245, 158, 11, 0.25)', border: '1px solid #f59e0b' }} title="Yellow Highlight" onMouseDown={(e) => { e.preventDefault(); insertBgHighlight('rgba(245, 158, 11, 0.2)'); }} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Live Preview Toggle Button */}
                        <div className="doc-toolbar-group" style={{ marginLeft: 'auto', borderRight: 'none' }}>
                          <button
                            type="button"
                            className={`doc-toolbar-btn ${editPreviewMode ? 'active' : ''}`}
                            onClick={() => {
                              if (!editPreviewMode && unifiedEditorRef.current) {
                                setEditorInitialHtml(unifiedEditorRef.current.innerHTML);
                              }
                              setEditPreviewMode(!editPreviewMode);
                            }}
                            title="Toggle Live Rendered Preview"
                            style={{ gap: '5px' }}
                          >
                            <Eye size={13} /> {editPreviewMode ? 'Edit Mode' : 'Live Preview'}
                          </button>
                        </div>
                      </div>

                      {/* Contextual Table Tools bar (visible when cursor is inside any table cell) */}
                      {activeTableInfo && (
                        <div className="doc-table-context-bar">
                          <span className="doc-table-context-title"><Table size={12} /> Table Tools:</span>
                          <button type="button" className="doc-table-context-btn" onMouseDown={(e) => { e.preventDefault(); handleAddTableRow(); }} title="Add Row Below"><Plus size={11} /> Row</button>
                          <button type="button" className="doc-table-context-btn" onMouseDown={(e) => { e.preventDefault(); handleDeleteTableRow(); }} title="Delete Current Row"><Minus size={11} /> Row</button>
                          <button type="button" className="doc-table-context-btn" onMouseDown={(e) => { e.preventDefault(); handleAddTableCol(); }} title="Add Column Right"><Plus size={11} /> Col</button>
                          <button type="button" className="doc-table-context-btn" onMouseDown={(e) => { e.preventDefault(); handleDeleteTableCol(); }} title="Delete Current Column"><Minus size={11} /> Col</button>
                          <button type="button" className="doc-table-context-btn danger" onMouseDown={(e) => { e.preventDefault(); handleDeleteTable(); }} title="Delete Entire Table"><Trash2 size={11} /> Delete Table</button>
                        </div>
                      )}

                      {/* Single Unified Visual Editor Surface or Live Preview */}
                      {editPreviewMode ? (
                        <div className="doc-edit-live-preview">
                          <div className="doc-live-preview-badge">Live Preview Mode</div>
                          <div className="doc-prose-content">
                            {renderMarkdownContent(wysiwygHtmlToContent(unifiedEditorRef.current ? unifiedEditorRef.current.innerHTML : editorInitialHtml), block.title)}
                          </div>
                        </div>
                      ) : (
                        <div
                          ref={unifiedEditorRef}
                          className="doc-unified-wysiwyg"
                          contentEditable={!saving}
                          suppressContentEditableWarning
                          onInput={() => {
                            saveCurrentSelection();
                            checkActiveTable();
                            checkCurrentAlignment();
                            checkCurrentSpacing();
                          }}
                          onBlur={() => {
                            saveCurrentSelection();
                            checkActiveTable();
                            checkCurrentAlignment();
                            checkCurrentSpacing();
                          }}
                          onFocus={(e) => {
                            activeTextareaRef.current = e.target;
                            saveCurrentSelection();
                            checkActiveTable();
                            checkCurrentAlignment();
                            checkCurrentSpacing();
                          }}
                          onKeyUp={() => {
                            saveCurrentSelection();
                            checkActiveTable();
                            checkCurrentAlignment();
                            checkCurrentSpacing();
                          }}
                          onMouseUp={() => {
                            saveCurrentSelection();
                            checkActiveTable();
                            checkCurrentAlignment();
                            checkCurrentSpacing();
                          }}
                          onKeyDown={handleUnifiedKeyDown}
                          data-placeholder="Type your document content here (supports formatting, tables, images, links)..."
                        />
                      )}

                      <div className="doc-editor-bottombar">
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

