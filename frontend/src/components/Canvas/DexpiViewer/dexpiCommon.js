/**
 * dexpiCommon.js
 * Shared DEXPI helpers, detection, geometry bounds (with outlier protection),
 * transform utilities, and CSV/SVG exporters.
 */

export const DEXPI_CATEGORY_COLORS = {
  equipment: '#3b82f6',  // Blue
  piping: '#8b5cf6',     // Violet
  valve: '#f59e0b',      // Amber
  instrument: '#06b6d4', // Cyan
  signal: '#10b981',     // Emerald
  annotation: '#64748b', // Slate
};

export function isDexpiXml(rawContent, filename = '') {
  if (/\.(dexpi|dexpi\.xml)$/i.test(filename || '')) return true;
  if (!rawContent || typeof rawContent !== 'string') return false;
  const head = rawContent.slice(0, 12000);
  const isV1 =
    head.includes('<PlantModel') &&
    (head.includes('Proteus') ||
      head.includes('DEXPI') ||
      head.includes('<PipingNetworkSystem') ||
      head.includes('<Equipment') ||
      head.includes('<ShapeCatalogue'));
  const isV2 =
    head.includes('<Model') &&
    (head.includes('dexpi.org') ||
      head.includes('Plant/PlantModel') ||
      head.includes('Core/EngineeringModel'));
  return isV1 || isV2;
}

export function localName(node) {
  if (!node || !node.tagName) return '';
  const idx = node.tagName.indexOf(':');
  return idx >= 0 ? node.tagName.slice(idx + 1) : node.tagName;
}

export function childElements(parent, tag) {
  if (!parent) return [];
  const res = [];
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (!tag || localName(c) === tag) res.push(c);
  }
  return res;
}

export function firstChild(parent, tag) {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (localName(c) === tag) return c;
  }
  return null;
}

export function numAttr(elem, name, fallback = 0) {
  if (!elem) return fallback;
  const v = elem.getAttribute(name);
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function applyTransform(pt, tr) {
  if (!tr) return pt;
  const x = pt.x * tr.sx;
  const y = pt.y * tr.sy;
  const cos = Math.cos(tr.angleRad);
  const sin = Math.sin(tr.angleRad);
  return {
    x: x * cos - y * sin + tr.tx,
    y: x * sin + y * cos + tr.ty,
  };
}

export function combineTransforms(outer, inner) {
  if (!outer) return inner;
  if (!inner) return outer;
  const p = applyTransform({ x: inner.tx, y: inner.ty }, outer);
  return {
    tx: p.x,
    ty: p.y,
    sx: outer.sx * inner.sx,
    sy: outer.sy * inner.sy,
    angleRad: outer.angleRad + inner.angleRad,
  };
}

export function classifyPipingComponent(compClass = '', tag = '') {
  const s = `${compClass} ${tag}`.toLowerCase();
  if (s.includes('valve') || s.includes('actuator') || s.includes('damper') || s.includes('cock')) {
    return 'valve';
  }
  return 'piping';
}

export function buildAdjacency(connections) {
  const connectionsById = {};
  const link = (a, b) => {
    if (!a || !b) return;
    if (!connectionsById[a]) connectionsById[a] = [];
    if (!connectionsById[a].includes(b)) connectionsById[a].push(b);
  };
  for (const c of connections) {
    link(c.fromId, c.toId);
    link(c.toId, c.fromId);
    if (c.lineId) {
      link(c.lineId, c.fromId);
      link(c.lineId, c.toId);
    }
  }
  return connectionsById;
}

/**
 * Computes drawing bounds. If an explicit <Extent> is provided, uses it directly
 * (ignoring stray corrupt Visio/CAD outlier coordinates like 3.4e10).
 */
export function computeSafeBounds(entities, explicitExtent = null) {
  if (
    explicitExtent &&
    Number.isFinite(explicitExtent.minX) &&
    Number.isFinite(explicitExtent.maxX) &&
    Number.isFinite(explicitExtent.minY) &&
    Number.isFinite(explicitExtent.maxY) &&
    explicitExtent.maxX > explicitExtent.minX &&
    explicitExtent.maxY > explicitExtent.minY
  ) {
    const padX = (explicitExtent.maxX - explicitExtent.minX) * 0.03 || 10;
    const padY = (explicitExtent.maxY - explicitExtent.minY) * 0.03 || 10;
    return {
      minX: explicitExtent.minX - padX,
      maxX: explicitExtent.maxX + padX,
      minY: explicitExtent.minY - padY,
      maxY: explicitExtent.maxY + padY,
    };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const includePt = (x, y) => {
    // Reject obvious CAD/Visio corrupt sentinel coordinates (> 1e6)
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const ent of entities) {
    for (const pl of ent.geometry.polylines) for (const p of pl.points) includePt(p.x, p.y);
    for (const pg of ent.geometry.polygons) for (const p of pg.points) includePt(p.x, p.y);
    for (const c of ent.geometry.circles) {
      includePt(c.cx - c.r, c.cy - c.r);
      includePt(c.cx + c.r, c.cy + c.r);
    }
    for (const t of ent.geometry.texts) includePt(t.x, t.y);
  }

  if (!Number.isFinite(minX) || minX === maxX) {
    minX = 0; maxX = 420; minY = 0; maxY = 297;
  }
  const padX = (maxX - minX) * 0.04 || 10;
  const padY = (maxY - minY) * 0.04 || 10;
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsv(headers, rows, filename) {
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function exportDexpiEquipmentCsv(list, filename = 'dexpi_equipment.csv') {
  downloadCsv(
    ['ID', 'TagName', 'ComponentClass', 'Service', 'Material', 'Design Pressure', 'Design Temp', 'Nozzles'],
    list.map((e) => [e.id, e.tagName, e.componentClass, e.service, e.material, e.designPressure, e.designTemp, e.nozzleCount]),
    filename
  );
}

export function exportDexpiLinesCsv(list, filename = 'dexpi_line_list.csv') {
  downloadCsv(
    ['ID', 'Line Tag', 'Nominal Diameter', 'Piping Class', 'Fluid', 'Insulation', 'Segments', 'Connections'],
    list.map((l) => [l.id, l.lineTag, l.nominalDiameter, l.pipingClass, l.fluid, l.insulation, l.segmentCount, l.connections]),
    filename
  );
}

export function exportDexpiValvesCsv(list, filename = 'dexpi_valves.csv') {
  downloadCsv(
    ['ID', 'TagName', 'ComponentClass', 'Line Tag', 'Nominal Diameter', 'Piping Class', 'Fail Action'],
    list.map((v) => [v.id, v.tagName, v.componentClass, v.lineTag, v.nominalDiameter, v.pipingClass, v.failAction]),
    filename
  );
}

export function exportDexpiInstrumentsCsv(list, filename = 'dexpi_instruments.csv') {
  downloadCsv(
    ['ID', 'TagName', 'ComponentClass', 'Measured Variable', 'Loop ID', 'Location'],
    list.map((i) => [i.id, i.tagName, i.componentClass, i.measuredVariable, i.loopId, i.location]),
    filename
  );
}

export function exportDexpiSvg(svgElement, filename = 'dexpi_pid.svg') {
  if (!svgElement) return;
  const clone = svgElement.cloneNode(true);
  const serializer = new XMLSerializer();
  const str = serializer.serializeToString(clone);
  downloadBlob(new Blob([str], { type: 'image/svg+xml;charset=utf-8;' }), filename);
}
