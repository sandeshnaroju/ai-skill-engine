/**
 * dexpiV2Parser.js
 * Parser for DEXPI 2.0 XML (<Model> / Core/EngineeringModel / Core/Diagram.*).
 */
import {
  localName,
  childElements,
  applyTransform,
  combineTransforms,
  classifyPipingComponent,
  buildAdjacency,
  computeSafeBounds,
} from './dexpiCommon';

function v2ReadScalar(el) {
  if (!el) return '';
  for (const ch of el.children) {
    const t = localName(ch);
    if (t === 'String' || t === 'Double' || t === 'Integer' || t === 'Boolean') {
      return (ch.textContent || '').trim();
    }
    if (t === 'DataReference') {
      const ref = ch.getAttribute('data') || '';
      return ref.split('.').pop() || ref;
    }
    if (t === 'AggregatedDataValue') {
      const vt = ch.getAttribute('type') || '';
      if (vt.endsWith('Point')) {
        let x = 0, y = 0;
        for (const d of childElements(ch, 'Data')) {
          const p = d.getAttribute('property');
          if (p === 'X') x = Number(v2ReadScalar(d)) || 0;
          if (p === 'Y') y = Number(v2ReadScalar(d)) || 0;
        }
        return { x, y };
      }
      if (vt.endsWith('Color')) {
        let r = 0, g = 0, b = 0;
        for (const d of childElements(ch, 'Data')) {
          const p = d.getAttribute('property');
          if (p === 'R') r = Number(v2ReadScalar(d)) || 0;
          if (p === 'G') g = Number(v2ReadScalar(d)) || 0;
          if (p === 'B') b = Number(v2ReadScalar(d)) || 0;
        }
        return `rgb(${r},${g},${b})`;
      }
      if (vt.endsWith('Stroke')) {
        let color = null, width = null, dashStyle = 'Solid';
        for (const d of childElements(ch, 'Data')) {
          const p = d.getAttribute('property');
          if (p === 'Color') color = v2ReadScalar(d);
          if (p === 'Width') width = Number(v2ReadScalar(d)) || null;
          if (p === 'DashStyle') dashStyle = v2ReadScalar(d) || 'Solid';
        }
        return { color, width, dashStyle };
      }
      if (vt.endsWith('PhysicalQuantity')) {
        let val = '', unit = '';
        for (const d of childElements(ch, 'Data')) {
          const p = d.getAttribute('property');
          if (p === 'Value') val = v2ReadScalar(d);
          if (p === 'Unit') unit = v2ReadScalar(d);
        }
        return unit ? `${val} ${unit}` : String(val);
      }
      if (vt.endsWith('MultiLanguageString') || vt.endsWith('SingleLanguageString')) {
        const s = ch.querySelector('String');
        if (s) return (s.textContent || '').trim();
      }
    }
  }
  return (el.textContent || '').trim();
}

function v2DataMap(objEl) {
  const map = {};
  const attrs = [];
  for (const d of childElements(objEl, 'Data')) {
    const prop = d.getAttribute('property') || '';
    if (!prop) continue;
    if (prop === 'Points' || prop === 'InnerPoints') {
      const pts = [];
      for (const adv of childElements(d, 'AggregatedDataValue')) {
        let x = 0, y = 0;
        for (const pd of childElements(adv, 'Data')) {
          if (pd.getAttribute('property') === 'X') x = Number(v2ReadScalar(pd)) || 0;
          if (pd.getAttribute('property') === 'Y') y = Number(v2ReadScalar(pd)) || 0;
        }
        pts.push({ x, y });
      }
      map[prop] = pts;
      continue;
    }
    const val = v2ReadScalar(d);
    map[prop] = val;
    if (typeof val === 'string' && val !== '') {
      attrs.push({ name: prop, value: val, uri: '' });
    }
  }
  return { map, attrs };
}

function v2RefsMap(objEl) {
  const refs = {};
  for (const r of childElements(objEl, 'References')) {
    const prop = r.getAttribute('property') || '';
    const objs = (r.getAttribute('objects') || '')
      .split(/\s+/)
      .map((s) => s.replace(/^#/, '').trim())
      .filter(Boolean);
    if (prop && objs.length) {
      refs[prop] = (refs[prop] || []).concat(objs);
    }
  }
  return refs;
}

function v2ExtractPrimitives(objEl, shapeCatalogV2, nodePosMap = {}, tr = null, depth = 0) {
  const out = { polylines: [], polygons: [], circles: [], arcs: [], texts: [] };
  if (!objEl || depth > 6) return out;

  const objType = objEl.getAttribute('type') || '';
  const { map } = v2DataMap(objEl);
  const refs = v2RefsMap(objEl);
  const stroke = map.Stroke && typeof map.Stroke === 'object' ? map.Stroke : null;

  if (objType === 'Core/Diagram.PolyLine' || objType === 'Core/Diagram.PipeFlowArrow') {
    const pts = Array.isArray(map.Points) ? map.Points : [];
    if (pts.length >= 2) {
      out.polylines.push({
        points: pts.map((p) => applyTransform(p, tr)),
        isCenterLine: false,
        strokeColor: stroke?.color || null,
        strokeWidth: stroke?.width || null,
        dashStyle: stroke?.dashStyle || 'Solid',
      });
    }
  } else if (objType === 'Core/Diagram.ConnectorLine') {
    const srcId = refs.Source?.[0];
    const tgtId = refs.Target?.[0];
    const pts = [];
    if (srcId && nodePosMap[srcId]) pts.push(nodePosMap[srcId]);
    if (Array.isArray(map.Points)) pts.push(...map.Points);
    if (Array.isArray(map.InnerPoints)) pts.push(...map.InnerPoints);
    if (tgtId && nodePosMap[tgtId]) pts.push(nodePosMap[tgtId]);
    if (pts.length >= 2) {
      out.polylines.push({
        points: pts.map((p) => applyTransform(p, tr)),
        isCenterLine: true,
        strokeColor: stroke?.color || null,
        strokeWidth: stroke?.width || null,
        dashStyle: stroke?.dashStyle || 'Solid',
      });
    }
  } else if (objType === 'Core/Diagram.Ellipse') {
    const c = map.Center && typeof map.Center === 'object' ? map.Center : { x: 0, y: 0 };
    const rx = Number(map.HorizontalSemiAxis || map.Radius || 1);
    const ry = Number(map.VerticalSemiAxis || rx);
    const center = applyTransform(c, tr);
    const sx = tr ? Math.abs(tr.sx) : 1;
    const sy = tr ? Math.abs(tr.sy) : 1;
    const rotDeg = (Number(map.Rotation || 0)) + (tr ? (tr.angleRad * 180) / Math.PI : 0);
    out.circles.push({
      cx: center.x,
      cy: center.y,
      r: (rx * sx + ry * sy) / 2,
      rx: rx * sx,
      ry: ry * sy,
      rotation: rotDeg,
      strokeColor: stroke?.color || null,
      strokeWidth: stroke?.width || null,
      fillStyle: map.FillStyle || 'Transparent',
    });
  } else if (objType === 'Core/Diagram.EllipseArc') {
    const c = map.Center && typeof map.Center === 'object' ? map.Center : { x: 0, y: 0 };
    const rx = Number(map.HorizontalSemiAxis || 1);
    const ry = Number(map.VerticalSemiAxis || rx);
    const startDeg = Number(map.StartAngle || 0);
    const endDeg = Number(map.EndAngle ?? 180);
    const center = applyTransform(c, tr);
    const sx = tr ? Math.abs(tr.sx) : 1;
    const sy = tr ? Math.abs(tr.sy) : 1;
    const rotDeg = (Number(map.Rotation || 0)) + (tr ? (tr.angleRad * 180) / Math.PI : 0);
    out.arcs.push({
      cx: center.x,
      cy: center.y,
      r: (rx * sx + ry * sy) / 2,
      rx: rx * sx,
      ry: ry * sy,
      startDeg: startDeg + rotDeg,
      endDeg: endDeg + rotDeg,
      strokeColor: stroke?.color || null,
      strokeWidth: stroke?.width || null,
    });
  } else if (objType === 'Core/Diagram.Text' || objType === 'Core/Diagram.LiteralText') {
    const pos = map.Position && typeof map.Position === 'object' ? map.Position : null;
    const str = map.Text || map.LiteralText || map.String || '';
    if (pos && str && typeof str === 'string') {
      const p = applyTransform(pos, tr);
      const scale = tr ? Math.abs(tr.sy) : 1;
      const rotDeg = (Number(map.Rotation || 0)) + (tr ? (tr.angleRad * 180) / Math.PI : 0);
      out.texts.push({
        x: p.x,
        y: p.y,
        text: str,
        height: (Number(map.Size || map.Height) || 2.5) * scale,
        rotation: rotDeg,
        alignment: map.Alignment || 'CenterCenter',
        color: typeof map.Color === 'string' ? map.Color : null,
      });
    }
  } else if (objType === 'Core/Diagram.ShapeUsage') {
    const pos = map.Position && typeof map.Position === 'object' ? map.Position : { x: 0, y: 0 };
    const angleDeg = Number(map.Rotation ?? map.RotationAngle ?? 0);
    const sx = Number(map.ScaleX || 1) * (map.IsMirrored === 'true' ? -1 : 1);
    const sy = Number(map.ScaleY || 1);
    const localTr = { tx: pos.x, ty: pos.y, sx, sy, angleRad: (angleDeg * Math.PI) / 180 };
    const nextTr = combineTransforms(tr, localTr);
    for (const sid of refs.Shape || []) {
      const tmpl = shapeCatalogV2[sid];
      if (tmpl) {
        const sub = v2ExtractPrimitives(tmpl, shapeCatalogV2, nodePosMap, nextTr, depth + 1);
        out.polylines.push(...sub.polylines);
        out.polygons.push(...sub.polygons);
        out.circles.push(...sub.circles);
        out.arcs.push(...sub.arcs);
        out.texts.push(...sub.texts);
      }
    }
  }

  for (const comp of childElements(objEl, 'Components')) {
    for (const childObj of childElements(comp, 'Object')) {
      const sub = v2ExtractPrimitives(childObj, shapeCatalogV2, nodePosMap, tr, depth + 1);
      out.polylines.push(...sub.polylines);
      out.polygons.push(...sub.polygons);
      out.circles.push(...sub.circles);
      out.arcs.push(...sub.arcs);
      out.texts.push(...sub.texts);
    }
  }

  return out;
}

export function parseDexpiV2(root) {
  const allObjects = Array.from(root.querySelectorAll('Object'));
  const shapeCatalogV2 = {};
  const nodePosMap = {};
  const entitiesById = {};
  const entities = [];
  const connections = [];
  const equipmentList = [];
  const lineList = [];
  const valveList = [];
  const instrumentList = [];

  const meta = {
    originatingSystem: 'DEXPI 2.0',
    version: '2.0.0',
    discipline: 'Process P&ID',
    drawingName: root.getAttribute('name') || 'DEXPI 2.0 P&ID',
    drawingTitle: '',
  };

  let autoIdx = 1;
  const nextId = (prefix) => `${prefix}-${autoIdx++}`;

  for (const obj of allObjects) {
    const t = obj.getAttribute('type') || '';
    const id = obj.getAttribute('id') || '';
    if (t === 'Core/Diagram.Shape' && id) {
      shapeCatalogV2[id] = obj;
    } else if (t === 'Core/Diagram.Diagram') {
      const { map } = v2DataMap(obj);
      if (map.DrawingName || map.Name) meta.drawingName = map.DrawingName || map.Name;
      if (map.DrawingSubTitle) meta.drawingTitle = map.DrawingSubTitle;
    } else if (id && (t.endsWith('NodePosition') || t.includes('Position'))) {
      const { map } = v2DataMap(obj);
      if (map.Position && typeof map.Position === 'object') {
        nodePosMap[id] = map.Position;
      }
    }
  }

  const ensureEntity = (id, tagName, componentClass, category, attrs = [], extra = {}) => {
    if (entitiesById[id]) return entitiesById[id];
    const ent = {
      id,
      tagName: tagName || id,
      componentClass: componentClass || 'PlantItem',
      componentClassURI: `https://data.dexpi.org/models/2.0.0/${componentClass}`,
      category,
      position: null,
      attributes: attrs,
      geometry: { polylines: [], polygons: [], circles: [], arcs: [], texts: [] },
      ...extra,
    };
    entitiesById[id] = ent;
    entities.push(ent);
    return ent;
  };

  for (const obj of allObjects) {
    const t = obj.getAttribute('type') || '';
    if (!t.startsWith('Plant/') || t.startsWith('Plant/Diagram.') || t === 'Plant/PlantModel') continue;
    const id = obj.getAttribute('id') || nextId('v2');
    const shortClass = t.split('.').pop() || t;
    const { map, attrs } = v2DataMap(obj);
    const refs = v2RefsMap(obj);
    const tagName =
      map.TagName ||
      map.PipingNetworkSystemNumber ||
      map.ActuatingSystemNumber ||
      map.InstrumentationLoopFunctionNumber ||
      map.SubTagName ||
      id;

    if (t.startsWith('Plant/Equipment.')) {
      ensureEntity(id, tagName, shortClass, 'equipment', attrs);
      equipmentList.push({
        id,
        tagName,
        componentClass: shortClass,
        service: map.ServiceDescription || map.DeviceTypeName || '',
        material: map.MaterialOfConstructionCode || '',
        designPressure: map.UpperLimitDesignPressure || '',
        designTemp: map.UpperLimitDesignTemperature || '',
        nozzleCount: 0,
      });
    } else if (t === 'Plant/Piping.PipingNetworkSystem') {
      ensureEntity(id, tagName, shortClass, 'piping', attrs, { pipingClass: map.PipingClassCode || '' });
      lineList.push({
        id,
        lineTag: tagName,
        nominalDiameter: map.NominalDiameter || '',
        pipingClass: map.PipingClassCode || '',
        fluid: map.FluidCode || '',
        insulation: map.InsulationThickness || '',
        segmentCount: 0,
        connections: 0,
      });
    } else if (t.startsWith('Plant/Piping.')) {
      const cat = classifyPipingComponent(shortClass, tagName);
      ensureEntity(id, tagName, shortClass, cat, attrs);
      if (cat === 'valve') {
        valveList.push({
          id,
          tagName,
          componentClass: shortClass,
          lineTag: '',
          nominalDiameter: map.NominalDiameter || '',
          pipingClass: map.PipingClassCode || '',
          failAction: map.FailAction || '',
        });
      }
    } else if (t.startsWith('Plant/Instrumentation.')) {
      const isSig = t.includes('Signal');
      ensureEntity(id, tagName, shortClass, isSig ? 'signal' : 'instrument', attrs);
      if (!isSig && (t.includes('ProcessInstrumentationFunction') || t.includes('InstrumentationLoopFunction') || t.includes('ActuatingSystem'))) {
        instrumentList.push({
          id,
          tagName,
          componentClass: shortClass,
          measuredVariable: map.MeasuredVariableCode || '',
          loopId: map.InstrumentationLoopFunctionNumber || '',
          location: map.Location || '',
        });
      }
      for (const vid of refs.Valve || []) {
        connections.push({ segmentId: id, lineId: id, lineTag: tagName, fromId: id, toId: vid });
      }
      for (const pid of refs.ProcessInstrumentationFunctions || []) {
        connections.push({ segmentId: id, lineId: id, lineTag: tagName, fromId: id, toId: pid });
      }
    }
  }

  const diagramObjs = allObjects.filter((o) => o.getAttribute('type') === 'Core/Diagram.Diagram');
  for (const diag of diagramObjs) {
    const elemContainers = childElements(diag, 'Components').filter((c) =>
      ['Elements', 'Groups', 'Fragments', 'Border'].includes(c.getAttribute('property'))
    );

    const walkDiagramNode = (node, inheritedRepId = null) => {
      const t = node.getAttribute('type') || '';
      const refs = v2RefsMap(node);
      const repId = (refs.Represented && refs.Represented[0]) || inheritedRepId;

      if (
        t === 'Core/Diagram.ShapeUsage' ||
        t === 'Core/Diagram.PolyLine' ||
        t === 'Core/Diagram.ConnectorLine' ||
        t === 'Core/Diagram.Ellipse' ||
        t === 'Core/Diagram.EllipseArc' ||
        t === 'Core/Diagram.Text' ||
        t === 'Core/Diagram.PipeFlowArrow' ||
        t.endsWith('Label')
      ) {
        const geom = v2ExtractPrimitives(node, shapeCatalogV2, nodePosMap);
        const target = repId && entitiesById[repId] ? entitiesById[repId] : ensureEntity('diagram-graphics', meta.drawingName, 'Diagram', 'annotation');
        target.geometry.polylines.push(...geom.polylines);
        target.geometry.polygons.push(...geom.polygons);
        target.geometry.circles.push(...geom.circles);
        target.geometry.arcs.push(...geom.arcs);
        target.geometry.texts.push(...geom.texts);
        return;
      }

      for (const comp of childElements(node, 'Components')) {
        for (const ch of childElements(comp, 'Object')) {
          walkDiagramNode(ch, repId);
        }
      }
    };

    for (const cont of elemContainers) {
      for (const ch of childElements(cont, 'Object')) {
        walkDiagramNode(ch, null);
      }
    }
  }

  return {
    meta,
    yAxisUp: false,
    entities,
    connections,
    connectionsById: buildAdjacency(connections),
    equipmentList,
    lineList,
    valveList,
    instrumentList,
    bounds: computeSafeBounds(entities, null),
    error: null,
  };
}
