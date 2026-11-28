/**
 * pcfIdfParser.js
 * Parses Piping Component Files (.pcf) and ISOGEN Intermediate Data Files (.idf)
 * into a unified 3D piping model with MTO / BOM, Shop vs. Field Weld Log,
 * Spool Summary, and CSV exporters.
 */

export const ISO_CATEGORY_COLORS = {
  pipe: '#38bdf8',       // Sky Blue
  fitting: '#06b6d4',    // Cyan (Elbow, Tee, Reducer, Olet, Cap)
  flange: '#a855f7',     // Purple
  valve: '#f59e0b',      // Amber
  weld: '#ef4444',       // Red (Shop) / Emerald (Field)
  support: '#ec4899',    // Pink
  instrument: '#10b981', // Emerald
  other: '#94a3b8',      // Slate
};

export const SPOOL_PALETTE = [
  '#38bdf8', '#f59e0b', '#10b981', '#a855f7', '#ec4899',
  '#22d3ee', '#fb7185', '#84cc16', '#f97316', '#818cf8',
];

function classifyComponentCategory(type = '') {
  const t = String(type).toUpperCase();
  if (t === 'PIPE' || t.includes('PIPE-FIXED')) return 'pipe';
  if (t.includes('VALVE')) return 'valve';
  if (t.includes('FLANGE') || t.includes('BLIND')) return 'flange';
  if (t.includes('WELD')) return 'weld';
  if (t.includes('SUPPORT')) return 'support';
  if (t.includes('INSTRUMENT')) return 'instrument';
  if (
    t.includes('ELBOW') ||
    t.includes('BEND') ||
    t.includes('TEE') ||
    t.includes('REDUCER') ||
    t.includes('OLET') ||
    t.includes('CAP') ||
    t.includes('COUPLING') ||
    t.includes('UNION')
  ) {
    return 'fitting';
  }
  return 'other';
}

export function isPcfOrIdf(text = '', filename = '') {
  const fn = String(filename || '').toLowerCase();
  if (fn.endsWith('.pcf') || fn.endsWith('.idf')) return true;
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 4000);
  return (
    /ISOGEN-FILES|PIPELINE-REFERENCE/i.test(head) ||
    (/END-POINT\s+[-.\d]+\s+[-.\d]+\s+[-.\d]+/i.test(head) && /PIPE|ELBOW|FLANGE|VALVE/i.test(head))
  );
}

function dist3(a, b) {
  if (!a || !b) return 0;
  const dx = (b.x || 0) - (a.x || 0);
  const dy = (b.y || 0) - (a.y || 0);
  const dz = (b.z || 0) - (a.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function parsePcf(text) {
  const lines = text.split(/\r?\n/);
  let pipelineRef = 'Piping Isometric';
  let pipingSpec = '';
  let unitsBore = 'MM';
  let unitsCoords = 'MM';

  const materialsMap = new Map(); // itemCode -> description
  const components = [];
  let inMaterials = false;
  let currentItemCode = '';
  let currentComp = null;

  const flushComp = () => {
    if (!currentComp) return;
    const ep = currentComp.endPoints;
    const p1 = ep[0] || currentComp.center || null;
    const p2 = ep[1] || ep[0] || currentComp.center || null;
    if (p1 || p2) {
      const cat = classifyComponentCategory(currentComp.type);
      const length = ep.length >= 2 ? dist3(ep[0], ep[1]) : 0;
      components.push({
        id: `ISO-${components.length + 1}`,
        type: currentComp.type,
        category: cat,
        p1: p1 || p2,
        p2: p2 || p1,
        center: currentComp.center || null,
        branch: currentComp.branch || null,
        bore: currentComp.bore || (p1 && p1.bore) || 50,
        itemCode: currentComp.itemCode || '',
        description: currentComp.description || '',
        spoolId: currentComp.spoolId || 'UNASSIGNED',
        shopField: currentComp.shopField || (cat === 'weld' ? 'SHOP' : ''),
        spec: currentComp.spec || pipingSpec,
        length,
      });
    }
    currentComp = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const isIndented = /^\s+/.test(raw);

    if (!isIndented) {
      flushComp();
      const upper = trimmed.toUpperCase();

      if (upper === 'MATERIALS') {
        inMaterials = true;
        continue;
      }
      inMaterials = false;

      if (upper.startsWith('PIPELINE-REFERENCE')) {
        pipelineRef = trimmed.slice('PIPELINE-REFERENCE'.length).trim() || pipelineRef;
        continue;
      }
      if (upper.startsWith('PIPING-SPEC')) {
        pipingSpec = trimmed.slice('PIPING-SPEC'.length).trim();
        continue;
      }
      if (upper.startsWith('UNITS-BORE')) {
        unitsBore = trimmed.slice('UNITS-BORE'.length).trim() || 'MM';
        continue;
      }
      if (upper.startsWith('UNITS-CO-ORDS')) {
        unitsCoords = trimmed.slice('UNITS-CO-ORDS'.length).trim() || 'MM';
        continue;
      }

      // Skip global header directives
      if (
        upper.startsWith('ISOGEN-FILES') ||
        upper.startsWith('UNITS-') ||
        upper.startsWith('PROJECT-') ||
        upper.startsWith('AREA') ||
        upper.startsWith('REVISION') ||
        upper.startsWith('DATE-') ||
        upper.startsWith('INSULATION-') ||
        upper.startsWith('PAINTING-') ||
        upper.startsWith('TRACING-') ||
        upper.startsWith('ATTRIBUTE')
      ) {
        continue;
      }

      // Start new component block
      currentComp = {
        type: trimmed.split(/\s+/)[0].toUpperCase(),
        endPoints: [],
        center: null,
        branch: null,
        bore: 0,
        itemCode: '',
        description: '',
        spoolId: '',
        shopField: '',
        spec: pipingSpec,
      };
      continue;
    }

    // Indented attribute line
    if (inMaterials) {
      if (trimmed.toUpperCase().startsWith('ITEM-CODE')) {
        currentItemCode = trimmed.slice('ITEM-CODE'.length).trim();
      } else if (trimmed.toUpperCase().startsWith('DESCRIPTION') && currentItemCode) {
        materialsMap.set(currentItemCode, trimmed.slice('DESCRIPTION'.length).trim());
      }
      continue;
    }

    if (!currentComp) continue;
    const parts = trimmed.split(/\s+/);
    const key = parts[0].toUpperCase();

    if (key === 'END-POINT' && parts.length >= 4) {
      const pt = {
        x: parseFloat(parts[1]) || 0,
        y: parseFloat(parts[2]) || 0,
        z: parseFloat(parts[3]) || 0,
        bore: parseFloat(parts[4] || '0') || 0,
      };
      currentComp.endPoints.push(pt);
      if (!currentComp.bore && pt.bore) currentComp.bore = pt.bore;
    } else if ((key === 'CENTRE-POINT' || key === 'CO-ORDS') && parts.length >= 4) {
      currentComp.center = {
        x: parseFloat(parts[1]) || 0,
        y: parseFloat(parts[2]) || 0,
        z: parseFloat(parts[3]) || 0,
        bore: parseFloat(parts[4] || '0') || 0,
      };
      if (!currentComp.bore && currentComp.center.bore) currentComp.bore = currentComp.center.bore;
    } else if (key === 'BRANCH1-POINT' && parts.length >= 4) {
      currentComp.branch = {
        x: parseFloat(parts[1]) || 0,
        y: parseFloat(parts[2]) || 0,
        z: parseFloat(parts[3]) || 0,
        bore: parseFloat(parts[4] || '0') || 0,
      };
    } else if (key === 'ITEM-CODE') {
      currentComp.itemCode = parts.slice(1).join(' ');
    } else if (key === 'DESCRIPTION') {
      currentComp.description = parts.slice(1).join(' ');
    } else if (key === 'SPOOL-IDENTIFIER') {
      currentComp.spoolId = parts.slice(1).join(' ');
    } else if (key === 'PIPING-SPEC') {
      currentComp.spec = parts.slice(1).join(' ');
    } else if (key === 'FABRICATION-ITEM') {
      currentComp.shopField = 'SHOP';
    } else if (key === 'ERECTION-ITEM') {
      currentComp.shopField = 'FIELD';
    } else if (key === 'CATEGORY') {
      const val = parts.slice(1).join(' ').toUpperCase();
      if (val.includes('ERECTION') || val.includes('FIELD')) currentComp.shopField = 'FIELD';
      else if (val.includes('FABRICATION') || val.includes('SHOP')) currentComp.shopField = 'SHOP';
    }
  }
  flushComp();

  // Backfill descriptions from MATERIALS section
  components.forEach((c) => {
    if (!c.description && c.itemCode && materialsMap.has(c.itemCode)) {
      c.description = materialsMap.get(c.itemCode);
    }
  });

  return { pipelineRef, pipingSpec, unitsBore, unitsCoords, components };
}

function parseIdf(text) {
  const lines = text.split(/\r?\n/);
  let pipelineRef = 'ISOGEN IDF Pipeline';
  let pipingSpec = '';
  const components = [];

  const recTypeMap = {
    '100': 'PIPE',
    '35': 'ELBOW',
    '36': 'BEND',
    '45': 'TEE',
    '50': 'FLANGE',
    '60': 'REDUCER-CONCENTRIC',
    '70': 'VALVE',
    '75': 'OLET',
    '105': 'WELD',
    '110': 'GASKET',
    '115': 'BOLT',
    '130': 'SUPPORT',
    '140': 'CAP',
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const code = parts[0];

    if (code === '-6' && parts.length > 1) {
      pipelineRef = parts.slice(1).join(' ');
      continue;
    }
    if (code === '-21' && parts.length > 1) {
      pipingSpec = parts[1];
      continue;
    }

    const compType = recTypeMap[code];
    if (!compType) continue;

    // Standard IDF coordinate layout: code x1 y1 z1 [x2 y2 z2] [bore] [itemCode]
    const nums = [];
    const tokens = [];
    for (let k = 1; k < parts.length; k++) {
      const v = parseFloat(parts[k]);
      if (!Number.isNaN(v) && /^-?\d+(\.\d+)?$/.test(parts[k])) nums.push(v);
      else tokens.push(parts[k]);
    }

    if (nums.length >= 3) {
      const p1 = { x: nums[0], y: nums[1], z: nums[2] };
      const hasP2 = nums.length >= 6;
      const p2 = hasP2 ? { x: nums[3], y: nums[4], z: nums[5] } : p1;
      const bore = hasP2 ? (nums[6] || 50) : (nums[3] || 50);
      const cat = classifyComponentCategory(compType);
      components.push({
        id: `IDF-${components.length + 1}`,
        type: compType,
        category: cat,
        p1,
        p2,
        center: null,
        branch: null,
        bore,
        itemCode: tokens[0] || '',
        description: tokens.slice(1).join(' '),
        spoolId: 'SP-01',
        shopField: cat === 'weld' ? 'SHOP' : '',
        spec: pipingSpec,
        length: hasP2 ? dist3(p1, p2) : 0,
      });
    }
  }

  return { pipelineRef, pipingSpec, unitsBore: 'MM', unitsCoords: 'MM', components };
}

export function parsePcfOrIdf(text = '', filename = '') {
  const fn = String(filename || '').toLowerCase();
  const isIdf = fn.endsWith('.idf') || (!/END-POINT/i.test(text.slice(0, 4000)) && /^\s*-?\d+\s+/m.test(text));
  const raw = isIdf ? parseIdf(text) : parsePcf(text);

  // Build MTO, Weld Log, Spools, and 3D Bounds
  const mtoMap = new Map();
  const spoolMap = new Map();
  const weldLog = [];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const trackPt = (pt) => {
    if (!pt) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
    if (pt.z > maxZ) maxZ = pt.z;
  };

  let totalPipeLength = 0;

  raw.components.forEach((c) => {
    trackPt(c.p1);
    trackPt(c.p2);
    trackPt(c.center);
    trackPt(c.branch);

    if (c.category === 'pipe') totalPipeLength += c.length;

    if (c.category === 'weld') {
      weldLog.push({
        id: c.id,
        type: c.type,
        shopField: c.shopField || 'SHOP',
        spoolId: c.spoolId || 'UNASSIGNED',
        bore: c.bore,
        x: c.p1?.x || 0,
        y: c.p1?.y || 0,
        z: c.p1?.z || 0,
        component: c,
      });
    } else if (c.category !== 'support') {
      const mKey = `${c.type}|${c.itemCode || '-'}|${c.bore}`;
      if (!mtoMap.has(mKey)) {
        mtoMap.set(mKey, {
          type: c.type,
          category: c.category,
          itemCode: c.itemCode || '-',
          description: c.description || c.type,
          bore: c.bore,
          qty: 0,
          totalLength: 0,
        });
      }
      const m = mtoMap.get(mKey);
      m.qty += 1;
      m.totalLength += c.length;
    }

    const spId = c.spoolId || 'UNASSIGNED';
    if (!spoolMap.has(spId)) {
      spoolMap.set(spId, {
        spoolId: spId,
        color: SPOOL_PALETTE[spoolMap.size % SPOOL_PALETTE.length],
        components: [],
        pipeLength: 0,
        weldCount: 0,
      });
    }
    const sp = spoolMap.get(spId);
    sp.components.push(c);
    if (c.category === 'pipe') sp.pipeLength += c.length;
    if (c.category === 'weld') sp.weldCount += 1;
  });

  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; minZ = 0;
    maxX = 1000; maxY = 1000; maxZ = 1000;
  }

  return {
    ...raw,
    format: isIdf ? 'IDF' : 'PCF',
    mtoSummary: Array.from(mtoMap.values()),
    weldLog,
    spools: Array.from(spoolMap.values()),
    spoolColorMap: new Map(Array.from(spoolMap.values()).map((s) => [s.spoolId, s.color])),
    totalPipeLength,
    bounds: {
      minX, minY, minZ, maxX, maxY, maxZ,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + maxZ) / 2,
      span: Math.max(100, maxX - minX, maxY - minY, maxZ - minZ),
    },
  };
}

function downloadCsv(headers, rows, filename) {
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

export function exportIsoMtoCsv(parsed, filename = 'isometric.pcf') {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const unit = parsed.unitsCoords === 'INCH' ? 'ft' : 'm';
  const div = parsed.unitsCoords === 'INCH' ? 12 : 1000;
  const rows = parsed.mtoSummary.map((m) => [
    m.type,
    m.category,
    m.itemCode,
    m.description,
    m.bore,
    m.qty,
    m.totalLength > 0 ? `${(m.totalLength / div).toFixed(2)} ${unit}` : '-',
  ]);
  downloadCsv(
    ['Type', 'Category', 'Item Code', 'Description', `Bore (${parsed.unitsBore})`, 'Qty', `Total Length (${unit})`],
    rows,
    `${clean}_MTO.csv`
  );
}

export function exportIsoWeldLogCsv(parsed, filename = 'isometric.pcf') {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const rows = parsed.weldLog.map((w) => [
    w.id,
    w.type,
    w.shopField,
    w.spoolId,
    w.bore,
    w.x.toFixed(1),
    w.y.toFixed(1),
    w.z.toFixed(1),
  ]);
  downloadCsv(
    ['Weld ID', 'Type', 'Shop / Field', 'Spool ID', `Bore (${parsed.unitsBore})`, 'X', 'Y', 'Z'],
    rows,
    `${clean}_WeldLog.csv`
  );
}
