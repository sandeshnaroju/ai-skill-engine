/**
 * dexpiV1Parser.js
 * Parser for DEXPI 1.x / Proteus XML (<PlantModel> / XMpLantSchema.xsd).
 */
import {
  localName,
  childElements,
  firstChild,
  numAttr,
  applyTransform,
  combineTransforms,
  classifyPipingComponent,
  buildAdjacency,
  computeSafeBounds,
} from './dexpiCommon';

function extractLocation(elem) {
  if (!elem) return null;
  const pos = firstChild(elem, 'Position') || elem;
  const loc = firstChild(pos, 'Location');
  if (loc) {
    return { x: numAttr(loc, 'X', 0), y: numAttr(loc, 'Y', 0) };
  }
  if (elem.hasAttribute('X') && elem.hasAttribute('Y')) {
    return { x: numAttr(elem, 'X', 0), y: numAttr(elem, 'Y', 0) };
  }
  return null;
}

function extractTransform(elem) {
  const pos = firstChild(elem, 'Position') || elem;
  const loc = firstChild(pos, 'Location');
  const axis = firstChild(pos, 'Axis');
  const ref = firstChild(pos, 'Reference');
  const scaleEl = firstChild(elem, 'Scale');

  const tx = loc ? numAttr(loc, 'X', 0) : 0;
  const ty = loc ? numAttr(loc, 'Y', 0) : 0;
  const sx = scaleEl ? numAttr(scaleEl, 'X', 1) : 1;
  const sy = scaleEl ? numAttr(scaleEl, 'Y', 1) : 1;

  let angleRad = 0;
  if (ref) {
    const rx = numAttr(ref, 'X', 1);
    const ry = numAttr(ref, 'Y', 0);
    angleRad = Math.atan2(ry, rx);
  } else if (axis) {
    const ax = numAttr(axis, 'X', 0);
    const ay = numAttr(axis, 'Y', 0);
    if (ax !== 0 || ay !== 0) angleRad = Math.atan2(ay, ax);
  }

  return { tx, ty, sx, sy, angleRad };
}

function extractAttributes(elem) {
  const attrs = [];
  for (const ga of childElements(elem, 'GenericAttributes')) {
    for (const item of childElements(ga, 'GenericAttribute')) {
      const name = item.getAttribute('Name') || '';
      const value = item.getAttribute('Value') ?? '';
      const uri = item.getAttribute('AttributeURI') || '';
      if (name) attrs.push({ name, value, uri });
    }
  }
  return attrs;
}

function attrMap(attrs) {
  const m = {};
  for (const a of attrs) m[a.name.toLowerCase()] = a.value;
  return m;
}

function parsePresentation(elem) {
  const pres = firstChild(elem, 'Presentation');
  if (!pres) return { strokeColor: null, strokeWidth: null, dashStyle: 'Solid' };
  const rAttr = pres.getAttribute('R');
  const gAttr = pres.getAttribute('G');
  const bAttr = pres.getAttribute('B');
  let strokeColor = null;
  if (rAttr != null && gAttr != null && bAttr != null) {
    let r = Number(rAttr) || 0;
    let g = Number(gAttr) || 0;
    let b = Number(bAttr) || 0;
    if (r <= 1 && g <= 1 && b <= 1) {
      r = Math.round(r * 255);
      g = Math.round(g * 255);
      b = Math.round(b * 255);
    }
    strokeColor = `rgb(${r},${g},${b})`;
  }
  const lw = Number(pres.getAttribute('LineWeight') || 0) || null;
  const dashStyle = pres.getAttribute('LineType') || 'Solid';
  return { strokeColor, strokeWidth: lw, dashStyle };
}

function isReasonablePt(p) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6;
}

function extractLocalPrimitives(elem) {
  const prims = { polylines: [], polygons: [], circles: [], arcs: [], texts: [], shapes: [] };

  for (const child of elem.children) {
    const tag = localName(child);
    if (tag === 'Line' || tag === 'PolyLine' || tag === 'CenterLine') {
      const pts = childElements(child, 'Coordinate')
        .map((c) => ({ x: numAttr(c, 'X', 0), y: numAttr(c, 'Y', 0) }))
        .filter(isReasonablePt);
      if (pts.length >= 2) {
        const pres = parsePresentation(child);
        prims.polylines.push({
          points: pts,
          isCenterLine: tag === 'CenterLine',
          lineType: pres.dashStyle,
          ...pres,
        });
      }
    } else if (tag === 'Polygon') {
      const pts = childElements(child, 'Coordinate')
        .map((c) => ({ x: numAttr(c, 'X', 0), y: numAttr(c, 'Y', 0) }))
        .filter(isReasonablePt);
      if (pts.length >= 3) {
        prims.polygons.push({ points: pts, ...parsePresentation(child) });
      }
    } else if (tag === 'Circle') {
      const c = extractLocation(child) || { x: 0, y: 0 };
      const r = numAttr(child, 'Radius', 1);
      if (isReasonablePt(c) && Math.abs(r) < 1e5) {
        prims.circles.push({ cx: c.x, cy: c.y, r, rx: r, ry: r, rotation: 0, ...parsePresentation(child) });
      }
    } else if (tag === 'Ellipse') {
      const c = extractLocation(child) || { x: 0, y: 0 };
      const tr = extractTransform(child);
      const rx = numAttr(child, 'PrimaryAxis', 2) / 2;
      const ry = numAttr(child, 'SecondaryAxis', rx * 2) / 2;
      if (isReasonablePt(c) && Math.abs(rx) < 1e5) {
        prims.circles.push({
          cx: c.x,
          cy: c.y,
          r: (rx + ry) / 2,
          rx,
          ry,
          rotation: (tr.angleRad * 180) / Math.PI,
          ...parsePresentation(child),
        });
      }
    } else if (tag === 'TrimmedCurve') {
      const circleChild = firstChild(child, 'Circle');
      const ellipseChild = firstChild(child, 'Ellipse');
      const startDeg = numAttr(child, 'StartAngle', 0);
      const endDeg = numAttr(child, 'EndAngle', 180);
      if (circleChild) {
        const c = extractLocation(circleChild) || { x: 0, y: 0 };
        const r = numAttr(circleChild, 'Radius', 1);
        if (isReasonablePt(c)) {
          prims.arcs.push({ cx: c.x, cy: c.y, r, rx: r, ry: r, startDeg, endDeg, ...parsePresentation(circleChild) });
        }
      } else if (ellipseChild) {
        const c = extractLocation(ellipseChild) || { x: 0, y: 0 };
        const tr = extractTransform(ellipseChild);
        const rx = numAttr(ellipseChild, 'PrimaryAxis', 2) / 2;
        const ry = numAttr(ellipseChild, 'SecondaryAxis', rx * 2) / 2;
        const rotDeg = (tr.angleRad * 180) / Math.PI;
        if (isReasonablePt(c)) {
          prims.arcs.push({
            cx: c.x,
            cy: c.y,
            r: (rx + ry) / 2,
            rx,
            ry,
            startDeg: startDeg + rotDeg,
            endDeg: endDeg + rotDeg,
            ...parsePresentation(ellipseChild),
          });
        }
      }
    } else if (tag === 'Text') {
      const loc = extractLocation(child);
      const str = child.getAttribute('String') || (child.textContent || '').trim();
      const height = numAttr(child, 'Height', 2.5);
      if (str && loc && isReasonablePt(loc)) {
        prims.texts.push({ x: loc.x, y: loc.y, text: str, height });
      }
    } else if (tag === 'Shape') {
      const ref = child.getAttribute('Reference') || child.getAttribute('Name') || '';
      if (ref) prims.shapes.push({ ref, transform: extractTransform(child) });
    }
  }

  return prims;
}

function resolvePrimitives(elem, shapeCatalog, parentTransform = null, depth = 0) {
  if (!elem || depth > 5) {
    return { polylines: [], polygons: [], circles: [], arcs: [], texts: [] };
  }
  const local = extractLocalPrimitives(elem);
  const out = {
    polylines: local.polylines.map((pl) => ({
      ...pl,
      points: pl.points.map((p) => applyTransform(p, parentTransform)).filter(isReasonablePt),
    })).filter((pl) => pl.points.length >= 2),
    polygons: local.polygons.map((pg) => ({
      ...pg,
      points: pg.points.map((p) => applyTransform(p, parentTransform)).filter(isReasonablePt),
    })).filter((pg) => pg.points.length >= 3),
    circles: local.circles.map((c) => {
      const center = applyTransform({ x: c.cx, y: c.cy }, parentTransform);
      const sx = parentTransform ? Math.abs(parentTransform.sx) : 1;
      const sy = parentTransform ? Math.abs(parentTransform.sy) : 1;
      const rotDeg = parentTransform ? (parentTransform.angleRad * 180) / Math.PI : 0;
      const rx = (c.rx ?? c.r) * sx;
      const ry = (c.ry ?? c.r) * sy;
      return { ...c, cx: center.x, cy: center.y, r: (rx + ry) / 2, rx, ry, rotation: (c.rotation || 0) + rotDeg };
    }).filter((c) => isReasonablePt({ x: c.cx, y: c.cy })),
    arcs: local.arcs.map((a) => {
      const center = applyTransform({ x: a.cx, y: a.cy }, parentTransform);
      const sx = parentTransform ? Math.abs(parentTransform.sx) : 1;
      const sy = parentTransform ? Math.abs(parentTransform.sy) : 1;
      const rotDeg = parentTransform ? (parentTransform.angleRad * 180) / Math.PI : 0;
      const rx = (a.rx ?? a.r) * sx;
      const ry = (a.ry ?? a.r) * sy;
      return { ...a, cx: center.x, cy: center.y, r: (rx + ry) / 2, rx, ry, startDeg: a.startDeg + rotDeg, endDeg: a.endDeg + rotDeg };
    }).filter((a) => isReasonablePt({ x: a.cx, y: a.cy })),
    texts: local.texts.map((t) => {
      const p = applyTransform({ x: t.x, y: t.y }, parentTransform);
      const scale = parentTransform ? Math.abs(parentTransform.sy) : 1;
      return { ...t, x: p.x, y: p.y, height: t.height * scale };
    }).filter((t) => isReasonablePt({ x: t.x, y: t.y })),
  };

  for (const sh of local.shapes) {
    const tmpl = shapeCatalog[sh.ref];
    if (tmpl) {
      const nextTr = combineTransforms(parentTransform, sh.transform);
      const sub = resolvePrimitives(tmpl, shapeCatalog, nextTr, depth + 1);
      out.polylines.push(...sub.polylines);
      out.polygons.push(...sub.polygons);
      out.circles.push(...sub.circles);
      out.arcs.push(...sub.arcs);
      out.texts.push(...sub.texts);
    }
  }

  // Proteus XMpLant instances reference ShapeCatalogue via ComponentName attribute
  if (depth === 0) {
    const compName = elem.getAttribute('ComponentName');
    if (compName && shapeCatalog[compName] && shapeCatalog[compName] !== elem) {
      const instTr = combineTransforms(parentTransform, extractTransform(elem));
      const sub = resolvePrimitives(shapeCatalog[compName], shapeCatalog, instTr, depth + 1);
      out.polylines.push(...sub.polylines);
      out.polygons.push(...sub.polygons);
      out.circles.push(...sub.circles);
      out.arcs.push(...sub.arcs);
      out.texts.push(...sub.texts);
    }
  }

  return out;
}

export function parseDexpiV1(root) {
  const plantInfo = firstChild(root, 'PlantInformation');
  const drawingEl = firstChild(root, 'Drawing');
  const meta = {
    originatingSystem: plantInfo?.getAttribute('OriginatingSystem') || root.getAttribute('OriginatingSystem') || 'DEXPI Proteus',
    version: plantInfo?.getAttribute('SchemaVersion') || root.getAttribute('SchemaVersion') || '4.0',
    discipline: plantInfo?.getAttribute('Discipline') || 'Process P&ID',
    drawingName: drawingEl?.getAttribute('Name') || 'P&ID',
    drawingTitle: drawingEl?.getAttribute('Title') || '',
  };

  const shapeCatalog = {};
  const scEl = firstChild(root, 'ShapeCatalogue');
  if (scEl) {
    for (const ch of scEl.children) {
      const id = ch.getAttribute('ID');
      const name = ch.getAttribute('Name');
      const compName = ch.getAttribute('ComponentName');
      if (id) shapeCatalog[id] = ch;
      if (name) shapeCatalog[name] = ch;
      if (compName) shapeCatalog[compName] = ch;
    }
  }

  const entities = [];
  const connections = [];
  const equipmentList = [];
  const lineList = [];
  const valveList = [];
  const instrumentList = [];

  let autoIdx = 1;
  const nextId = (prefix) => `${prefix}-${autoIdx++}`;

  // 1. Equipment & Nozzles
  for (const eq of childElements(root, 'Equipment')) {
    const id = eq.getAttribute('ID') || nextId('eq');
    const tagName = eq.getAttribute('TagName') || eq.getAttribute('Name') || id;
    const componentClass = eq.getAttribute('ComponentClass') || 'Equipment';
    const componentClassURI = eq.getAttribute('ComponentClassURI') || '';
    const attrs = extractAttributes(eq);
    const aMap = attrMap(attrs);
    const pos = extractLocation(eq);
    const geometry = resolvePrimitives(eq, shapeCatalog);

    const nozzles = childElements(eq, 'Nozzle').map((nz) => {
      const nId = nz.getAttribute('ID') || nextId('noz');
      const nTag = nz.getAttribute('TagName') || nId;
      const nGeom = resolvePrimitives(nz, shapeCatalog);
      geometry.polylines.push(...nGeom.polylines);
      geometry.circles.push(...nGeom.circles);
      geometry.texts.push(...nGeom.texts);
      return {
        id: nId,
        tagName: nTag,
        componentClass: nz.getAttribute('ComponentClass') || 'Nozzle',
        position: extractLocation(nz),
      };
    });

    entities.push({
      id,
      tagName,
      componentClass,
      componentClassURI,
      category: 'equipment',
      position: pos,
      attributes: attrs,
      nozzles,
      geometry,
    });
    equipmentList.push({
      id,
      tagName,
      componentClass,
      service: aMap.service || aMap.description || aMap.processfunction || '',
      material: aMap.material || aMap.materialofconstruction || '',
      designPressure: aMap.designpressure || aMap.operatingpressure || '',
      designTemp: aMap.designtemperature || aMap.operatingtemperature || '',
      nozzleCount: nozzles.length,
    });
  }

  // 2. PipingNetworkSystem -> PipingNetworkSegment -> PipingComponent
  for (const pns of childElements(root, 'PipingNetworkSystem')) {
    const sysId = pns.getAttribute('ID') || nextId('pns');
    const lineTag = pns.getAttribute('TagName') || pns.getAttribute('Name') || sysId;
    const sysAttrs = extractAttributes(pns);
    const sysMap = attrMap(sysAttrs);
    const pipingClass = sysMap.pipingclass || sysMap.pipingspec || sysMap.spec || '';
    const nominalDiameter = sysMap.nominaldiameter || sysMap.size || sysMap.dn || '';
    const insulation = sysMap.insulationtype || sysMap.insulation || '';
    const fluid = sysMap.fluidcode || sysMap.medium || sysMap.service || '';

    const segments = childElements(pns, 'PipingNetworkSegment');
    const segGeom = { polylines: [], polygons: [], circles: [], arcs: [], texts: [] };
    const segTargets = [];

    for (const seg of segments) {
      const segId = seg.getAttribute('ID') || nextId('seg');
      const sg = resolvePrimitives(seg, shapeCatalog);
      segGeom.polylines.push(...sg.polylines);
      segGeom.polygons.push(...sg.polygons);
      segGeom.circles.push(...sg.circles);
      segGeom.arcs.push(...sg.arcs);
      segGeom.texts.push(...sg.texts);

      const conn = firstChild(seg, 'Connection');
      if (conn) {
        const fromId = conn.getAttribute('FromID') || '';
        const toId = conn.getAttribute('ToID') || '';
        if (fromId || toId) {
          connections.push({ segmentId: segId, lineId: sysId, lineTag, fromId, toId });
          if (fromId) segTargets.push(fromId);
          if (toId) segTargets.push(toId);
        }
      }

      for (const pc of childElements(seg, 'PipingComponent')) {
        const pcId = pc.getAttribute('ID') || nextId('pc');
        const pcTag = pc.getAttribute('TagName') || pc.getAttribute('Name') || pcId;
        const pcClass = pc.getAttribute('ComponentClass') || 'PipingComponent';
        const pcURI = pc.getAttribute('ComponentClassURI') || '';
        const pcAttrs = extractAttributes(pc);
        const pcMap = attrMap(pcAttrs);
        const cat = classifyPipingComponent(pcClass, pcTag);
        const pcGeom = resolvePrimitives(pc, shapeCatalog);
        const pcPos = extractLocation(pc);

        entities.push({
          id: pcId,
          tagName: pcTag,
          componentClass: pcClass,
          componentClassURI: pcURI,
          category: cat,
          lineTag,
          pipingClass,
          position: pcPos,
          attributes: pcAttrs,
          geometry: pcGeom,
        });

        if (cat === 'valve') {
          valveList.push({
            id: pcId,
            tagName: pcTag,
            componentClass: pcClass,
            lineTag,
            nominalDiameter: pcMap.nominaldiameter || nominalDiameter,
            pipingClass: pcMap.pipingclass || pipingClass,
            failAction: pcMap.failaction || pcMap.failuremode || '',
          });
        }
      }
    }

    for (const pc of childElements(pns, 'PipingComponent')) {
      const pcId = pc.getAttribute('ID') || nextId('pc');
      const pcTag = pc.getAttribute('TagName') || pc.getAttribute('Name') || pcId;
      const pcClass = pc.getAttribute('ComponentClass') || 'PipingComponent';
      const pcURI = pc.getAttribute('ComponentClassURI') || '';
      const cat = classifyPipingComponent(pcClass, pcTag);
      entities.push({
        id: pcId,
        tagName: pcTag,
        componentClass: pcClass,
        componentClassURI: pcURI,
        category: cat,
        lineTag,
        pipingClass,
        position: extractLocation(pc),
        attributes: extractAttributes(pc),
        geometry: resolvePrimitives(pc, shapeCatalog),
      });
    }

    const sysGeom = resolvePrimitives(pns, shapeCatalog);
    sysGeom.polylines.push(...segGeom.polylines);
    sysGeom.polygons.push(...segGeom.polygons);
    sysGeom.circles.push(...segGeom.circles);
    sysGeom.arcs.push(...segGeom.arcs);
    sysGeom.texts.push(...segGeom.texts);

    entities.push({
      id: sysId,
      tagName: lineTag,
      componentClass: pns.getAttribute('ComponentClass') || 'PipingNetworkSystem',
      componentClassURI: pns.getAttribute('ComponentClassURI') || '',
      category: 'piping',
      pipingClass,
      position: null,
      attributes: sysAttrs,
      geometry: sysGeom,
    });

    lineList.push({
      id: sysId,
      lineTag,
      nominalDiameter,
      pipingClass,
      fluid,
      insulation,
      segmentCount: segments.length,
      connections: segTargets.length,
    });
  }

  // 3. Instrumentation & Signals
  for (const tag of ['ProcessInstrumentationFunction', 'InstrumentationLoopFunction', 'ActuatingSystem', 'SignalLine']) {
    for (const el of childElements(root, tag)) {
      const id = el.getAttribute('ID') || nextId('inst');
      const tagName = el.getAttribute('TagName') || el.getAttribute('Name') || id;
      const compClass = el.getAttribute('ComponentClass') || tag;
      const compURI = el.getAttribute('ComponentClassURI') || '';
      const attrs = extractAttributes(el);
      const aMap = attrMap(attrs);
      const isSig = tag === 'SignalLine' || compClass.toLowerCase().includes('signal');

      entities.push({
        id,
        tagName,
        componentClass: compClass,
        componentClassURI: compURI,
        category: isSig ? 'signal' : 'instrument',
        position: extractLocation(el),
        attributes: attrs,
        geometry: resolvePrimitives(el, shapeCatalog),
      });

      if (!isSig) {
        instrumentList.push({
          id,
          tagName,
          componentClass: compClass,
          measuredVariable: aMap.measuredvariable || aMap.processvariable || '',
          loopId: aMap.loopid || aMap.loop || '',
          location: aMap.location || aMap.mounting || '',
        });
      }
    }
  }

  // 4. DrawingBorder / standalone annotations
  if (drawingEl) {
    const borderGeom = resolvePrimitives(drawingEl, shapeCatalog);
    if (borderGeom.polylines.length || borderGeom.texts.length) {
      entities.push({
        id: 'drawing-border',
        tagName: meta.drawingName,
        componentClass: 'Drawing',
        componentClassURI: '',
        category: 'annotation',
        position: null,
        attributes: extractAttributes(drawingEl),
        geometry: borderGeom,
      });
    }
  }

  // Read explicit <Extent> from <Drawing> or <PlantModel>
  let explicitExtent = null;
  const extentEl = firstChild(drawingEl || root, 'Extent') || firstChild(root, 'Extent');
  if (extentEl) {
    const minEl = firstChild(extentEl, 'Min');
    const maxEl = firstChild(extentEl, 'Max');
    if (minEl && maxEl) {
      explicitExtent = {
        minX: numAttr(minEl, 'X', 0),
        minY: numAttr(minEl, 'Y', 0),
        maxX: numAttr(maxEl, 'X', 420),
        maxY: numAttr(maxEl, 'Y', 297),
      };
    }
  }

  return {
    meta,
    yAxisUp: true,
    entities,
    connections,
    connectionsById: buildAdjacency(connections),
    equipmentList,
    lineList,
    valveList,
    instrumentList,
    bounds: computeSafeBounds(entities, explicitExtent),
    error: null,
  };
}
