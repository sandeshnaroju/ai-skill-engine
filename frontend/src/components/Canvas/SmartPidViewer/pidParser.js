/**
 * pidParser.js
 * Parses Smart P&ID JSON payloads, categorizes symbols, builds cross-reference maps
 * (symbol_id <-> tags & connectors), computes coordinate bounds, and exports BOM CSV.
 */

export const PID_CATEGORY_COLORS = {
  instrument: '#06b6d4', // Cyan
  valve: '#f59e0b',      // Amber
  piping: '#8b5cf6',     // Violet
  connector: '#10b981',  // Emerald
  tag: '#ec4899',        // Pink
  line: '#3b82f6',       // Blue
  other: '#64748b',      // Slate
};

export function classifySymbolCategory(name = '') {
  const n = String(name).toLowerCase();
  if (!n) return 'other';
  if (n.includes('connector') || n.includes('tie-in') || n.includes('spec break')) return 'connector';
  if (n.includes('instrument') || n.includes('interlock') || n.includes('analyzer') || n.includes('transmitter') || n.includes('indicator')) return 'instrument';
  if (n.includes('valve') || n.includes('actuator')) return 'valve';
  if (
    n.includes('flange') ||
    n.includes('reducer') ||
    n.includes('blind') ||
    n.includes('fitting') ||
    n.includes('cap') ||
    n.includes('orifice') ||
    n.includes('strainer') ||
    n.includes('arrow')
  ) {
    return 'piping';
  }
  return 'other';
}

export function isSmartPidPayload(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return false;
  return (
    (trimmed.includes('"pandid_no"') || trimmed.includes('"document_no"')) &&
    (trimmed.includes('"symbols"') || trimmed.includes('"line_numbers"'))
  );
}

export function parseSmartPidJson(rawContent, artifactMediaUrl = '') {
  let raw = {};
  if (typeof rawContent === 'string' && rawContent.trim()) {
    try {
      raw = JSON.parse(rawContent);
    } catch {
      raw = {};
    }
  } else if (rawContent && typeof rawContent === 'object') {
    raw = rawContent;
  }

  const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const lineNumbers = Array.isArray(raw.line_numbers) ? raw.line_numbers : [];
  const connectors = Array.isArray(raw.connectors) ? raw.connectors : [];
  const connections = Array.isArray(raw.connections) ? raw.connections : [];

  const symbolById = new Map();
  const tagsBySymbolId = new Map();
  const connectorsBySymbolId = new Map();

  let maxX = 0;
  let maxY = 0;
  const trackBounds = (item) => {
    const x1 = Number(item?.x1 ?? item?.x0 ?? 0);
    const y1 = Number(item?.y1 ?? item?.y0 ?? 0);
    if (Number.isFinite(x1) && x1 > maxX) maxX = x1;
    if (Number.isFinite(y1) && y1 > maxY) maxY = y1;
  };

  const normalizedSymbols = symbols.map((s, idx) => {
    const category = classifySymbolCategory(s.name);
    const item = {
      ...s,
      id: s.id || `sym_${idx + 1}`,
      name: s.name || 'symbol',
      tag_no: s.tag_no || '',
      category,
      color: PID_CATEGORY_COLORS[category] || PID_CATEGORY_COLORS.other,
      x0: Number(s.x0 || 0),
      y0: Number(s.y0 || 0),
      x1: Number(s.x1 || 0),
      y1: Number(s.y1 || 0),
      kind: 'symbol',
    };
    symbolById.set(item.id, item);
    trackBounds(item);
    return item;
  });

  const normalizedTags = tags.map((t, idx) => {
    const item = {
      ...t,
      id: t.id || `tag_${idx + 1}`,
      text: t.text || '',
      symbol_id: t.symbol_id || '',
      color: PID_CATEGORY_COLORS.tag,
      x0: Number(t.x0 || 0),
      y0: Number(t.y0 || 0),
      x1: Number(t.x1 || 0),
      y1: Number(t.y1 || 0),
      kind: 'tag',
    };
    if (item.symbol_id) {
      if (!tagsBySymbolId.has(item.symbol_id)) tagsBySymbolId.set(item.symbol_id, []);
      tagsBySymbolId.get(item.symbol_id).push(item);
    }
    trackBounds(item);
    return item;
  });

  const normalizedLines = lineNumbers.map((l, idx) => {
    const item = {
      ...l,
      id: l.id || `line_${idx + 1}`,
      text: l.text || '',
      color: PID_CATEGORY_COLORS.line,
      x0: Number(l.x0 || 0),
      y0: Number(l.y0 || 0),
      x1: Number(l.x1 || 0),
      y1: Number(l.y1 || 0),
      kind: 'line',
    };
    trackBounds(item);
    return item;
  });

  const normalizedConnectors = connectors.map((c, idx) => {
    const item = {
      ...c,
      id: c.id || `conn_${idx + 1}`,
      text: c.text || '',
      symbol_id: c.symbol_id || '',
      color: PID_CATEGORY_COLORS.connector,
      x0: Number(c.x0 || 0),
      y0: Number(c.y0 || 0),
      x1: Number(c.x1 || 0),
      y1: Number(c.y1 || 0),
      kind: 'connector',
    };
    if (item.symbol_id) {
      if (!connectorsBySymbolId.has(item.symbol_id)) connectorsBySymbolId.set(item.symbol_id, []);
      connectorsBySymbolId.get(item.symbol_id).push(item);
    }
    trackBounds(item);
    return item;
  });

  let imageUrl =
    raw.image_url ||
    raw.image_data_uri ||
    raw.image ||
    artifactMediaUrl ||
    '';
  if (
    imageUrl &&
    !imageUrl.startsWith('/') &&
    !imageUrl.startsWith('http://') &&
    !imageUrl.startsWith('https://') &&
    !imageUrl.startsWith('data:') &&
    !imageUrl.startsWith('blob:')
  ) {
    imageUrl = `/api/v1/files/download/${encodeURIComponent(imageUrl)}`;
  }

  return {
    title: raw.title || 'Smart P&ID Diagram',
    documentNo: raw.document_no || '',
    pandidNo: raw.pandid_no || '',
    imageUrl,
    symbols: normalizedSymbols,
    tags: normalizedTags,
    lineNumbers: normalizedLines,
    connectors: normalizedConnectors,
    connections,
    symbolById,
    tagsBySymbolId,
    connectorsBySymbolId,
    bounds: {
      width: Math.max(maxX + 60, 1200),
      height: Math.max(maxY + 60, 800),
    },
  };
}

export function exportPidBomCsv(parsed, filename = 'pandid_register.csv') {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Type', 'ID', 'Name / Text', 'Category', 'Tag No', 'Linked Symbol ID', 'X0', 'Y0', 'X1', 'Y1']];

  parsed.symbols.forEach((s) => {
    const linkedTags = (parsed.tagsBySymbolId.get(s.id) || []).map((t) => t.text).join('; ');
    rows.push(['Symbol', s.id, s.name, s.category, s.tag_no || linkedTags, s.id, s.x0, s.y0, s.x1, s.y1]);
  });
  parsed.tags.forEach((t) => {
    rows.push(['Tag', t.id, t.text, 'tag', t.text, t.symbol_id, t.x0, t.y0, t.x1, t.y1]);
  });
  parsed.lineNumbers.forEach((l) => {
    rows.push(['Line Number', l.id, l.text, 'line', '', '', l.x0, l.y0, l.x1, l.y1]);
  });
  parsed.connectors.forEach((c) => {
    rows.push(['Connector', c.id, c.text, 'connector', '', c.symbol_id, c.x0, c.y0, c.x1, c.y1]);
  });

  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename.replace(/\.[^/.]+$/, '')}_register.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
