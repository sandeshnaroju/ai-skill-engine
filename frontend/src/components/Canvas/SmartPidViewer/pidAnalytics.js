/**
 * pidAnalytics.js
 * Pure-frontend engineering deliverables engine for Smart P&IDs:
 * - Line Number parser (Size, Service, Pipe Spec, Unit)
 * - ISA Instrument Index & Loop grouping
 * - Valve & Isolation Schedule
 * - Off-Page Connector & Interface Matrix
 * - QA / Completeness Audit (Untagged, Orphan, Duplicate tags)
 * - Dedicated CSV & Annotated PNG Snapshot exports
 */

function downloadCsvRows(headers, rows, filename) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function parseLineNumberMeta(rawText = '') {
  const text = String(rawText || '').trim();
  const tokens = text.split(/[-\s]+/).filter(Boolean);
  const sizeMatch = text.match(/(\d+(?:\.\d+)?(?:"|''|mm|DN\d+))/i);
  const size = sizeMatch ? sizeMatch[1] : '-';

  // Extract service/fluid code (2-4 uppercase letters) and piping spec/class
  const alphaTokens = tokens.filter((t) => /^[A-Z]{2,5}$/i.test(t));
  const service = alphaTokens[0] ? alphaTokens[0].toUpperCase() : '-';

  // Pipe spec typically looks like 31055S, A11A, B1A, 150#, etc. (avoid matching pure unit numbers)
  const specToken = tokens.find(
    (t) =>
      t !== size &&
      (/[A-Z]/i.test(t) && /\d/.test(t) && t.length >= 3 && t.length <= 8)
  );
  const pipeSpec = specToken || '-';
  const unit = tokens[0] && /^\d{2,4}$/.test(tokens[0]) ? tokens[0] : '-';

  return { text, unit, size, service, pipeSpec };
}

const ISA_VARIABLES = {
  F: 'Flow',
  P: 'Pressure',
  T: 'Temperature',
  L: 'Level',
  A: 'Analyzer',
  X: 'Safety / Interlock',
  Z: 'Safety / Shutdown',
  H: 'Hand / Manual',
  V: 'Vibration / Valve',
  S: 'Speed / Switch',
};

export function getEffectiveSymbolTag(sym, parsed) {
  if (sym.tag_no && sym.tag_no.trim()) return sym.tag_no.trim();
  const linked = parsed.tagsBySymbolId.get(sym.id) || [];
  if (linked.length > 0 && linked[0].text) return linked[0].text.trim();
  return '';
}

export function buildInstrumentLoops(parsed) {
  const instruments = [];
  const loopsMap = new Map();

  parsed.symbols.forEach((s) => {
    if (s.category !== 'instrument') return;
    const tag = getEffectiveSymbolTag(s, parsed);
    const isaMatch = tag.match(/^([A-Z]{1,5})[-\s]?(\d{2,6}[A-Z]?)/i);
    const funcCode = isaMatch ? isaMatch[1].toUpperCase() : '-';
    const loopId = isaMatch ? isaMatch[2].toUpperCase() : 'UNGROUPED';
    const variable = funcCode !== '-' ? (ISA_VARIABLES[funcCode[0]] || 'Other') : 'Other';

    const entry = {
      symbol: s,
      id: s.id,
      name: s.name,
      tag: tag || '(Untagged)',
      hasTag: Boolean(tag),
      funcCode,
      loopId,
      variable,
    };
    instruments.push(entry);

    if (!loopsMap.has(loopId)) {
      loopsMap.set(loopId, { loopId, variable, items: [] });
    }
    loopsMap.get(loopId).items.push(entry);
  });

  const loops = Array.from(loopsMap.values()).sort((a, b) => {
    if (a.loopId === 'UNGROUPED') return 1;
    if (b.loopId === 'UNGROUPED') return -1;
    return a.loopId.localeCompare(b.loopId);
  });

  return { instruments, loops };
}

export function classifyValveSubtype(name = '') {
  const n = name.toLowerCase();
  if (n.includes('control')) return 'Control Valve';
  if (n.includes('relief') || n.includes('psv') || n.includes('safety')) return 'Relief / PSV';
  if (n.includes('gate')) return 'Gate Valve';
  if (n.includes('check')) return 'Check Valve';
  if (n.includes('ball')) return 'Ball Valve';
  if (n.includes('butterfly')) return 'Butterfly Valve';
  if (n.includes('actuator')) return 'Actuator';
  if (n.includes('spectacle')) return 'Spectacle Blind';
  if (n.includes('blind')) return 'Blind Flange';
  if (n.includes('tie-in')) return 'Tie-In';
  if (n.includes('spec break')) return 'Spec Break';
  return 'Valve';
}

export function buildValveSchedule(parsed) {
  const counts = {};
  const items = [];

  parsed.symbols.forEach((s) => {
    const n = (s.name || '').toLowerCase();
    const isValveOrIsolation =
      s.category === 'valve' ||
      n.includes('spectacle') ||
      n.includes('blind') ||
      n.includes('tie-in') ||
      n.includes('spec break');
    if (!isValveOrIsolation) return;

    const subtype = classifyValveSubtype(s.name);
    const tag = getEffectiveSymbolTag(s, parsed);
    counts[subtype] = (counts[subtype] || 0) + 1;
    items.push({
      symbol: s,
      id: s.id,
      subtype,
      rawName: s.name,
      tag: tag || '(Untagged)',
      hasTag: Boolean(tag),
    });
  });

  return { counts, items };
}

export function buildConnectorMatrix(parsed) {
  const rows = [];
  const seen = new Set();

  parsed.connectors.forEach((c) => {
    const parentSym = c.symbol_id ? parsed.symbolById.get(c.symbol_id) : null;
    rows.push({
      id: c.id,
      text: c.text || '(No Label)',
      symbolId: c.symbol_id || '-',
      symbolName: parentSym?.name || 'off-page connector',
      targetItem: c,
    });
    if (c.symbol_id) seen.add(c.symbol_id);
  });

  parsed.symbols.forEach((s) => {
    if (s.category === 'connector' && !seen.has(s.id)) {
      const tag = getEffectiveSymbolTag(s, parsed);
      rows.push({
        id: s.id,
        text: tag || s.name,
        symbolId: s.id,
        symbolName: s.name,
        targetItem: s,
      });
    }
  });

  return rows;
}

export function runPidQaAudit(parsed) {
  const untaggedSymbols = [];
  const tagCounts = new Map();

  parsed.symbols.forEach((s) => {
    const tag = getEffectiveSymbolTag(s, parsed);
    const needsTag = s.category === 'instrument' || s.category === 'valve';
    if (needsTag && !tag) {
      untaggedSymbols.push(s);
    }
    if (tag) {
      const key = tag.toUpperCase();
      if (!tagCounts.has(key)) tagCounts.set(key, []);
      tagCounts.get(key).push({ tag, item: s });
    }
  });

  const orphanTags = parsed.tags.filter((t) => !t.symbol_id || !parsed.symbolById.has(t.symbol_id));

  const duplicateTags = [];
  tagCounts.forEach((entries, key) => {
    if (entries.length > 1) {
      duplicateTags.push({ tag: key, count: entries.length, items: entries.map((e) => e.item) });
    }
  });

  const totalChecked = Math.max(1, parsed.symbols.length + parsed.tags.length);
  const issueCount = untaggedSymbols.length + orphanTags.length + duplicateTags.length;
  const score = Math.max(0, Math.round(100 - (issueCount / totalChecked) * 100));

  return { untaggedSymbols, orphanTags, duplicateTags, issueCount, score };
}

export function exportLineListCsv(parsed, baseName = 'pandid') {
  const clean = baseName.replace(/\.[^/.]+$/, '');
  const rows = parsed.lineNumbers.map((l) => {
    const meta = parseLineNumberMeta(l.text);
    return [l.id, l.text, meta.unit, meta.size, meta.service, meta.pipeSpec, l.x0, l.y0, l.x1, l.y1];
  });
  downloadCsvRows(
    ['ID', 'Line Number', 'Unit', 'Size', 'Service', 'Pipe Spec', 'X0', 'Y0', 'X1', 'Y1'],
    rows,
    `${clean}_line_list.csv`
  );
}

export function exportInstrumentIndexCsv(parsed, baseName = 'pandid') {
  const clean = baseName.replace(/\.[^/.]+$/, '');
  const { instruments } = buildInstrumentLoops(parsed);
  const rows = instruments.map((inst) => [
    inst.id,
    inst.tag,
    inst.loopId,
    inst.funcCode,
    inst.variable,
    inst.name,
    inst.symbol.x0,
    inst.symbol.y0,
    inst.symbol.x1,
    inst.symbol.y1,
  ]);
  downloadCsvRows(
    ['Symbol ID', 'Tag', 'Loop ID', 'ISA Function', 'Measured Variable', 'Symbol Type', 'X0', 'Y0', 'X1', 'Y1'],
    rows,
    `${clean}_instrument_index.csv`
  );
}

export function exportValveScheduleCsv(parsed, baseName = 'pandid') {
  const clean = baseName.replace(/\.[^/.]+$/, '');
  const { items } = buildValveSchedule(parsed);
  const rows = items.map((v) => [
    v.id,
    v.subtype,
    v.tag,
    v.rawName,
    v.symbol.x0,
    v.symbol.y0,
    v.symbol.x1,
    v.symbol.y1,
  ]);
  downloadCsvRows(
    ['Symbol ID', 'Category / Subtype', 'Tag', 'Raw Type', 'X0', 'Y0', 'X1', 'Y1'],
    rows,
    `${clean}_valve_schedule.csv`
  );
}

export function exportAnnotatedPidPng({ imgEl, worldWidth, worldHeight, parsed, layers, filename = 'pandid.png' }) {
  const maxDim = 3600;
  const scale = Math.min(1, maxDim / Math.max(worldWidth, worldHeight));
  const cw = Math.max(1, Math.round(worldWidth * scale));
  const ch = Math.max(1, Math.round(worldHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  if (imgEl && (imgEl instanceof HTMLCanvasElement ? imgEl.width > 0 : (imgEl.complete && imgEl.naturalWidth > 0))) {
    try {
      ctx.drawImage(imgEl, 0, 0, cw, ch);
    } catch {
      // Cross-origin image fallback: render vector-only snapshot
    }
  }

  const drawBox = (item, dashed = false) => {
    const x = item.x0 * scale;
    const y = item.y0 * scale;
    const w = Math.max(3, (item.x1 - item.x0) * scale);
    const h = Math.max(3, (item.y1 - item.y0) * scale);
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = `${item.color}22`;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  };

  if (layers.symbols) parsed.symbols.forEach((s) => drawBox(s));
  if (layers.tags) parsed.tags.forEach((t) => drawBox(t));
  if (layers.lines) parsed.lineNumbers.forEach((l) => drawBox(l));
  if (layers.connectors) parsed.connectors.forEach((c) => drawBox(c, true));

  const link = document.createElement('a');
  link.download = `${filename.replace(/\.[^/.]+$/, '')}_annotated.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
