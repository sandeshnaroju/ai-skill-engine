import { DEFAULT_PCB_FALLBACK } from './constants';

/**
 * Robust Circuit & PCB Data Parser for .pcb.json, .kicad_pcb, .eda.json, or raw JSON
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
  } catch (e) {
    if (rawContent.includes('(kicad_pcb') || rawContent.includes('(footprint') || rawContent.includes('(segment')) {
      return parseKiCadPcbToCircuitJson(rawContent, DEFAULT_PCB_FALLBACK);
    }
  }

  return DEFAULT_PCB_FALLBACK;
}

/**
 * EDA JSON to Circuit JSON Translator
 */
export function parseEdaToCircuitJson(edaData, fallback) {
  const SCALE = 0.254; // 10 mil to mm
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

/**
 * KiCad S-Expression to Circuit JSON Translator
 */
export function parseKiCadPcbToCircuitJson(sExprText, fallback) {
  const data = { ...fallback, components: [], traces: [], vias: [] };
  try {
    const segRegex = /\(segment\s+\(start\s+([\d.-]+)\s+([\d.-]+)\)\s+\(end\s+([\d.-]+)\s+([\d.-]+)\)\s+\(width\s+([\d.-]+)\)\s+\(layer\s+"([^"]+)"\)\s+\(net\s+(\d+)\)/g;
    let match;
    while ((match = segRegex.exec(sExprText)) !== null) {
      data.traces.push({
        net: `Net_${match[7]}`,
        layer: match[6] === 'B.Cu' ? 'B.Cu' : 'F.Cu',
        width: parseFloat(match[5]) || 0.3,
        segments: [
          [parseFloat(match[1]), parseFloat(match[2])],
          [parseFloat(match[3]), parseFloat(match[4])]
        ]
      });
    }

    const fpRegex = /\(footprint\s+"([^"]+)"[\s\S]*?\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)[\s\S]*?\(fp_text\s+reference\s+"([^"]+)"/g;
    while ((match = fpRegex.exec(sExprText)) !== null) {
      data.components.push({
        ref: match[5] || 'U1',
        value: match[1],
        package: match[1].split(':').pop() || 'SMD',
        position: { x: parseFloat(match[2]) || 20, y: parseFloat(match[3]) || 20, rotation: parseFloat(match[4]) || 0 },
        layer: 'F.Cu',
        pads: [
          { num: '1', name: '1', type: 'smd', x: parseFloat(match[2]) - 1.2, y: parseFloat(match[3]), w: 1.0, h: 1.4, net: 'GND' },
          { num: '2', name: '2', type: 'smd', x: parseFloat(match[2]) + 1.2, y: parseFloat(match[3]), w: 1.0, h: 1.4, net: 'VCC' }
        ]
      });
    }
  } catch (err) {
    console.warn('KiCad parsing fallback used:', err);
  }
  return data;
}
