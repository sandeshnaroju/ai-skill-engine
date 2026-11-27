import { DEFAULT_PCB_FALLBACK } from './constants';

/**
 * Cursor-based line scanner to avoid splitting 20MB+ strings into giant arrays
 */
function createLineCursor(text) {
  const len = text.length;
  let pos = 0;
  return {
    getProgress: () => (len > 0 ? Math.min(1, pos / len) : 1),
    nextLine: () => {
      if (pos >= len) return null;
      const nl = text.indexOf('\n', pos);
      let line;
      if (nl === -1) {
        line = text.slice(pos);
        pos = len;
      } else {
        const end = nl > pos && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
        line = text.slice(pos, end);
        pos = nl + 1;
      }
      return line;
    }
  };
}

/**
 * Gerber RS-274X Parser (.gbr / .gerber)
 */
async function parseGerberAsync(text, filename, fallback, onProgress) {
  const traces = [];
  const pads = [];
  const apertures = new Map(); // D-code -> { type, w, h }

  let isInch = false;
  let intDigits = 2;
  let decDigits = 4;
  let currentAperture = '10';
  let curX = 0;
  let curY = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const fnLower = (filename || '').toLowerCase();
  const layer = fnLower.includes('b_cu') || fnLower.includes('bottom') || fnLower.includes('.gbl') ? 'B.Cu' : 'F.Cu';

  const parseCoord = (rawStr) => {
    if (!rawStr) return 0;
    const sign = rawStr.startsWith('-') ? -1 : 1;
    const digits = rawStr.replace(/^[+-]/, '');
    const padded = digits.padStart(intDigits + decDigits, '0');
    const val = parseFloat(padded.slice(0, padded.length - decDigits) + '.' + padded.slice(padded.length - decDigits)) * sign;
    return isInch ? val * 25.4 : val;
  };

  const trackBounds = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const cursor = createLineCursor(text);
  let lineCount = 0;
  let line = cursor.nextLine();

  while (line !== null) {
    const t = line.trim();
    if (t.includes('%MOIN')) isInch = true;
    else if (t.includes('%MOMM')) isInch = false;
    else if (t.startsWith('%FS')) {
      const fsMatch = t.match(/X(\d)(\d)Y(\d)(\d)/);
      if (fsMatch) {
        intDigits = parseInt(fsMatch[1], 10) || 2;
        decDigits = parseInt(fsMatch[2], 10) || 4;
      }
    } else if (t.startsWith('%ADD')) {
      const addMatch = t.match(/^%ADD(\d+)([CRO]),([^*%]+)/);
      if (addMatch) {
        const dCode = addMatch[1];
        const shape = addMatch[2];
        const params = addMatch[3].split('X').map((n) => parseFloat(n) * (isInch ? 25.4 : 1));
        const w = params[0] || 0.4;
        const h = params[1] || w;
        apertures.set(dCode, { shape, w, h });
      }
    } else if (t.startsWith('D') && /^\D?\d+\*$/.test(t)) {
      const dMatch = t.match(/^D(\d+)\*$/);
      if (dMatch && parseInt(dMatch[1], 10) >= 10) currentAperture = dMatch[1];
    } else if (t.includes('X') || t.includes('Y') || t.includes('D0')) {
      const xM = t.match(/X([+-]?\d+)/);
      const yM = t.match(/Y([+-]?\d+)/);
      const dM = t.match(/D0([123])/);
      const nx = xM ? parseCoord(xM[1]) : curX;
      const ny = yM ? parseCoord(yM[1]) : curY;
      const dOp = dM ? dM[1] : null;
      const ap = apertures.get(currentAperture) || { shape: 'C', w: 0.35, h: 0.35 };

      if (dOp === '1') {
        trackBounds(curX, curY);
        trackBounds(nx, ny);
        traces.push({
          net: 'GERBER',
          layer,
          width: Math.max(0.15, ap.w),
          segments: [[curX, curY], [nx, ny]]
        });
      } else if (dOp === '3') {
        trackBounds(nx, ny);
        pads.push({
          num: String(pads.length + 1),
          name: String(pads.length + 1),
          type: 'smd',
          x: nx,
          y: ny,
          w: ap.w,
          h: ap.h,
          net: 'PAD'
        });
      }
      curX = nx;
      curY = ny;
    }

    lineCount += 1;
    if (lineCount % 15000 === 0) {
      if (onProgress) onProgress({ percent: Math.round(cursor.getProgress() * 90), stage: 'Parsing Gerber RS-274X', count: lineCount });
      await new Promise((r) => setTimeout(r, 0));
    }
    line = cursor.nextLine();
  }

  const width = minX !== Infinity ? Math.max(20, maxX - minX + 6) : 65;
  const height = minY !== Infinity ? Math.max(20, maxY - minY + 6) : 45;
  const offX = minX !== Infinity ? -minX + 3 : 0;
  const offY = minY !== Infinity ? -minY + 3 : 0;

  traces.forEach((tr) => {
    tr.segments = tr.segments.map(([x, y]) => [x + offX, y + offY]);
  });
  const shiftedPads = pads.map((p) => ({ ...p, x: p.x + offX, y: p.y + offY }));

  const components =
    shiftedPads.length > 0
      ? [{ ref: 'GBR1', value: 'Gerber Pads', package: 'SMD', position: { x: width / 2, y: height / 2, rotation: 0 }, layer, pads: shiftedPads }]
      : [];

  return {
    ...fallback,
    board: { ...fallback.board, width, height },
    components,
    traces,
    vias: [],
    silkscreen: []
  };
}

/**
 * Excellon Drill Parser (.drl)
 */
async function parseExcellonAsync(text, fallback, onProgress) {
  const vias = [];
  const tools = new Map();
  let isInch = true;
  let currentTool = '1';
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const cursor = createLineCursor(text);
  let lineCount = 0;
  let line = cursor.nextLine();

  while (line !== null) {
    const t = line.trim();
    if (t.startsWith('METRIC')) isInch = false;
    else if (t.startsWith('INCH')) isInch = true;
    else if (/^T\d+C[\d.]+/.test(t)) {
      const m = t.match(/^T(\d+)C([\d.]+)/);
      if (m) tools.set(m[1], parseFloat(m[2]) * (isInch ? 25.4 : 1));
    } else if (/^T\d+$/.test(t)) {
      currentTool = t.slice(1);
    } else if (/^X[+-]?[\d.]+Y[+-]?[\d.]+/.test(t)) {
      const m = t.match(/^X([+-]?[\d.]+)Y([+-]?[\d.]+)/);
      if (m) {
        const scale = isInch ? 25.4 : 1;
        const rawX = m[1].includes('.') ? parseFloat(m[1]) : parseFloat(m[1]) / 10000;
        const rawY = m[2].includes('.') ? parseFloat(m[2]) : parseFloat(m[2]) / 10000;
        const x = rawX * scale;
        const y = rawY * scale;
        const drill = tools.get(currentTool) || 0.4;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        vias.push({ net: `T${currentTool}`, x, y, drill, diameter: drill * 1.7 });
      }
    }

    lineCount += 1;
    if (lineCount % 15000 === 0) {
      if (onProgress) onProgress({ percent: Math.round(cursor.getProgress() * 90), stage: 'Parsing Excellon Drill', count: lineCount });
      await new Promise((r) => setTimeout(r, 0));
    }
    line = cursor.nextLine();
  }

  const width = minX !== Infinity ? Math.max(20, maxX - minX + 6) : 65;
  const height = minY !== Infinity ? Math.max(20, maxY - minY + 6) : 45;
  const offX = minX !== Infinity ? -minX + 3 : 0;
  const offY = minY !== Infinity ? -minY + 3 : 0;
  vias.forEach((v) => {
    v.x += offX;
    v.y += offY;
  });

  return {
    ...fallback,
    board: { ...fallback.board, width, height },
    components: [],
    traces: [],
    vias,
    silkscreen: []
  };
}

/**
 * Non-blocking KiCad .kicad_pcb S-Expression Scanner
 * Extracts segments, vias, Edge.Cuts outline, copper zones, and real footprint pads.
 */
async function parseKiCadPcbAsync(sExprText, fallback, onProgress) {
  const traces = [];
  const vias = [];
  const components = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const track = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const cursor = createLineCursor(sExprText);
  let lineCount = 0;
  let currentFp = null;
  let fpDepth = 0;
  let line = cursor.nextLine();

  while (line !== null) {
    const t = line.trim();

    if (t.startsWith('(segment ')) {
      const m = t.match(/\(start\s+([\d.-]+)\s+([\d.-]+)\)\s+\(end\s+([\d.-]+)\s+([\d.-]+)\)\s+\(width\s+([\d.-]+)\)\s+\(layer\s+"([^"]+)"\)\s+\(net\s+(\d+)\)/);
      if (m) {
        const x1 = parseFloat(m[1]), y1 = parseFloat(m[2]), x2 = parseFloat(m[3]), y2 = parseFloat(m[4]);
        track(x1, y1);
        track(x2, y2);
        traces.push({
          net: `Net_${m[7]}`,
          layer: m[6] === 'B.Cu' ? 'B.Cu' : 'F.Cu',
          width: parseFloat(m[5]) || 0.3,
          segments: [[x1, y1], [x2, y2]]
        });
      }
    } else if (t.startsWith('(via ')) {
      const atM = t.match(/\(at\s+([\d.-]+)\s+([\d.-]+)\)/);
      const szM = t.match(/\(size\s+([\d.-]+)\)/);
      const drM = t.match(/\(drill\s+([\d.-]+)\)/);
      const netM = t.match(/\(net\s+(\d+)\)/);
      if (atM) {
        const vx = parseFloat(atM[1]), vy = parseFloat(atM[2]);
        track(vx, vy);
        vias.push({
          net: netM ? `Net_${netM[1]}` : 'GND',
          x: vx,
          y: vy,
          diameter: szM ? parseFloat(szM[1]) : 0.8,
          drill: drM ? parseFloat(drM[1]) : 0.4
        });
      }
    } else if (t.startsWith('(gr_line ') || t.startsWith('(gr_rect ')) {
      if (t.includes('Edge.Cuts')) {
        const sM = t.match(/\(start\s+([\d.-]+)\s+([\d.-]+)\)/);
        const eM = t.match(/\(end\s+([\d.-]+)\s+([\d.-]+)\)/);
        if (sM && eM) {
          track(parseFloat(sM[1]), parseFloat(sM[2]));
          track(parseFloat(eM[1]), parseFloat(eM[2]));
        }
      }
    } else if (t.startsWith('(footprint ') || t.startsWith('(module ')) {
      const nameM = t.match(/^\((?:footprint|module)\s+"([^"]+)"/);
      currentFp = {
        ref: `U${components.length + 1}`,
        value: nameM ? nameM[1].split(':').pop() : 'Part',
        package: nameM ? nameM[1].split(':').pop() : 'SMD',
        position: { x: 20, y: 20, rotation: 0 },
        layer: 'F.Cu',
        pads: []
      };
      fpDepth = 1;
    } else if (currentFp) {
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '(') fpDepth++;
        else if (t[i] === ')') fpDepth--;
      }

      if (t.startsWith('(at ') && fpDepth <= 2) {
        const atM = t.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
        if (atM) {
          currentFp.position = {
            x: parseFloat(atM[1]) || 0,
            y: parseFloat(atM[2]) || 0,
            rotation: parseFloat(atM[3]) || 0
          };
          track(currentFp.position.x, currentFp.position.y);
        }
      } else if (t.includes('fp_text reference')) {
        const refM = t.match(/reference\s+"([^"]+)"/);
        if (refM) currentFp.ref = refM[1];
      } else if (t.startsWith('(pad ')) {
        const pM = t.match(/^\(pad\s+"?([^"\s]+)"?\s+(\w+)\s+\w+\s+\(at\s+([\d.-]+)\s+([\d.-]+)[^)]*\)\s+\(size\s+([\d.-]+)\s+([\d.-]+)\)/);
        if (pM) {
          const rad = ((currentFp.position.rotation || 0) * Math.PI) / 180;
          const lx = parseFloat(pM[3]) || 0;
          const ly = parseFloat(pM[4]) || 0;
          const px = currentFp.position.x + lx * Math.cos(rad) - ly * Math.sin(rad);
          const py = currentFp.position.y + lx * Math.sin(rad) + ly * Math.cos(rad);
          const netM = t.match(/\(net\s+\d+\s+"([^"]+)"\)/);
          currentFp.pads.push({
            num: pM[1],
            name: pM[1],
            type: pM[2] === 'thru_hole' ? 'tht' : 'smd',
            x: px,
            y: py,
            w: parseFloat(pM[5]) || 1.0,
            h: parseFloat(pM[6]) || 1.0,
            net: netM ? netM[1] : 'NET'
          });
        }
      }

      if (fpDepth <= 0) {
        components.push(currentFp);
        currentFp = null;
      }
    }

    lineCount += 1;
    if (lineCount % 15000 === 0) {
      if (onProgress) onProgress({ percent: Math.round(cursor.getProgress() * 92), stage: 'Parsing KiCad PCB', count: lineCount });
      await new Promise((r) => setTimeout(r, 0));
    }
    line = cursor.nextLine();
  }

  if (currentFp) components.push(currentFp);

  const width = minX !== Infinity ? Math.max(30, maxX - minX + 10) : fallback.board.width;
  const height = minY !== Infinity ? Math.max(20, maxY - minY + 10) : fallback.board.height;
  const offX = minX !== Infinity ? -minX + 5 : 0;
  const offY = minY !== Infinity ? -minY + 5 : 0;

  traces.forEach((tr) => {
    tr.segments = tr.segments.map(([x, y]) => [x + offX, y + offY]);
  });
  vias.forEach((v) => {
    v.x += offX;
    v.y += offY;
  });
  components.forEach((c) => {
    c.position.x += offX;
    c.position.y += offY;
    c.pads.forEach((p) => {
      p.x += offX;
      p.y += offY;
    });
  });

  if (onProgress) onProgress({ percent: 100, stage: 'Complete', count: traces.length + components.length });

  return {
    ...fallback,
    board: { ...fallback.board, width, height },
    components,
    traces,
    vias
  };
}

/**
 * Synchronous parser (preserved for small files / backward compatibility)
 */
export function parsePcbData(rawContent, filename = '') {
  if (!rawContent) return DEFAULT_PCB_FALLBACK;

  if (typeof rawContent === 'object') {
    return {
      ...DEFAULT_PCB_FALLBACK,
      ...rawContent,
      board: { ...DEFAULT_PCB_FALLBACK.board, ...(rawContent.board || {}) }
    };
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.head && parsed.shape && Array.isArray(parsed.shape)) {
      return parseEdaToCircuitJson(parsed, DEFAULT_PCB_FALLBACK);
    }
    return {
      ...DEFAULT_PCB_FALLBACK,
      ...parsed,
      board: { ...DEFAULT_PCB_FALLBACK.board, ...(parsed.board || {}) }
    };
  } catch {
    return DEFAULT_PCB_FALLBACK;
  }
}

/**
 * Asynchronous non-blocking multi-format parser for 20MB+ PCBs
 */
export async function parsePcbDataAsync(rawContent, filename = '', onProgress) {
  if (!rawContent) return DEFAULT_PCB_FALLBACK;

  if (typeof rawContent === 'object') {
    return parsePcbData(rawContent, filename);
  }

  const fn = (filename || '').toLowerCase();
  const trimmed = rawContent.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (onProgress) onProgress({ percent: 40, stage: 'Parsing Circuit JSON', count: 0 });
    await new Promise((r) => setTimeout(r, 0));
    const res = parsePcbData(rawContent, filename);
    if (onProgress) onProgress({ percent: 100, stage: 'Complete', count: (res.traces || []).length });
    return res;
  }

  if (fn.endsWith('.drl') || trimmed.startsWith('M48') || /^T\d+C[\d.]+/m.test(trimmed.slice(0, 1024))) {
    return parseExcellonAsync(rawContent, DEFAULT_PCB_FALLBACK, onProgress);
  }

  if (fn.endsWith('.gbr') || fn.endsWith('.gerber') || trimmed.includes('%FSLA') || trimmed.includes('%ADD')) {
    return parseGerberAsync(rawContent, filename, DEFAULT_PCB_FALLBACK, onProgress);
  }

  if (fn.endsWith('.kicad_pcb') || trimmed.includes('(kicad_pcb') || trimmed.includes('(segment ')) {
    return parseKiCadPcbAsync(rawContent, DEFAULT_PCB_FALLBACK, onProgress);
  }

  return DEFAULT_PCB_FALLBACK;
}

/**
 * EDA JSON to Circuit JSON Translator
 */
export function parseEdaToCircuitJson(edaData, fallback) {
  const SCALE = 0.254;
  const shapes = edaData.shape || [];
  const components = [];
  const traces = [];
  const vias = [];
  const silkscreen = [];
  let w = 50, h = 35;

  shapes.forEach((item) => {
    if (typeof item !== 'string') return;
    const parts = item.split('~');
    const cmd = parts[0];
    if (cmd === 'TRACK') {
      const width = parseFloat(parts[1]) * SCALE || 0.3;
      const layerNum = parts[2];
      const net = parts[3] || 'NET';
      const layer = layerNum === '2' ? 'B.Cu' : 'F.Cu';
      const coords = [];
      const pts = (parts[5] || '').trim().split(/\s+/);
      for (let i = 0; i < pts.length; i += 2) {
        if (i + 1 < pts.length) {
          coords.push([parseFloat(pts[i]) * SCALE, parseFloat(pts[i + 1]) * SCALE]);
        }
      }
      if (layerNum === '10' && coords.length > 0) {
        const xs = coords.map((c) => c[0]);
        const ys = coords.map((c) => c[1]);
        w = Math.max(...xs) - Math.min(...xs);
        h = Math.max(...ys) - Math.min(...ys);
      } else if (coords.length >= 2) {
        traces.push({ net, layer, width, segments: coords });
      }
    } else if (cmd === 'PAD') {
      const px = parseFloat(parts[2]) * SCALE || 10;
      const py = parseFloat(parts[3]) * SCALE || 10;
      const pw = parseFloat(parts[4]) * SCALE || 1.2;
      const ph = parseFloat(parts[5]) * SCALE || 1.2;
      const pNet = parts[7] || '';
      const pNum = parts[8] || '1';
      const drill = parseFloat(parts[9]) * SCALE || 0;
      components.push({
        ref: `P${components.length + 1}`,
        value: 'Pad',
        package: 'SMD',
        position: { x: px, y: py, rotation: 0 },
        layer: 'F.Cu',
        pads: [{ num: pNum, name: pNum, type: drill > 0 ? 'tht' : 'smd', x: px, y: py, w: pw, h: ph, net: pNet }]
      });
    } else if (cmd === 'VIA') {
      const vx = parseFloat(parts[1]) * SCALE || 0;
      const vy = parseFloat(parts[2]) * SCALE || 0;
      const vdia = parseFloat(parts[3]) * SCALE || 0.6;
      const vnet = parts[4] || 'GND';
      vias.push({ net: vnet, x: vx, y: vy, drill: 0.3, diameter: vdia });
    }
  });

  return {
    ...fallback,
    board: { ...fallback.board, width: Math.max(w, 30), height: Math.max(h, 20) },
    components,
    traces,
    vias,
    silkscreen
  };
}
