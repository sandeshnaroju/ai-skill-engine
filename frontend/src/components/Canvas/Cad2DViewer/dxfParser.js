/**
 * dxfParser.js
 * High-performance cursor-based streaming DXF parser (parseDxfAsync & parseDxfContent).
 *
 * Optimizations for 20MB+ architectural files:
 * - Zero giant array allocations: scans text in-place using indexOf('\n') cursor.
 * - Chunked asynchronous yielding every 5,000 entities with live progress updates.
 * - Full support for SPLINE, HATCH, DIMENSION (*D blocks + fallback), LEADER, MLEADER,
 *   LWPOLYLINE bulges (code 42), ELLIPSE partial arcs, XLINE/RAY, ATTRIB, and
 *   recursive nested INSERT block expansion.
 */

import { resolveAciColor, resolveTrueColor } from './dxfColors';

const SUPPORTED_ENTITIES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE',
  'SPLINE', 'HATCH', 'DIMENSION', 'LEADER', 'MLEADER',
  'SOLID', '3DFACE', 'TRACE', 'TEXT', 'MTEXT', 'ATTRIB',
  'INSERT', 'XLINE', 'RAY', 'POINT'
]);

/**
 * Detect if content is a proprietary binary DWG file rather than ASCII DXF.
 */
export function isBinaryDwg(text) {
  if (!text || typeof text !== 'string') return false;
  // AutoCAD binary DWG headers start with AC10xx followed by binary bytes
  return /^AC10\d{2}/.test(text.slice(0, 12)) && /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 128));
}

/**
 * In-place cursor scanner for DXF group-code / value pairs.
 * Avoids splitting 20MB strings into 2,000,000-element arrays.
 */
function createPairScanner(text) {
  const len = text.length;
  let pos = 0;

  function nextLine() {
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

  return {
    getProgress: () => (len > 0 ? Math.min(1, pos / len) : 1),
    nextPair: () => {
      while (pos < len) {
        const codeLine = nextLine();
        if (codeLine === null) return null;
        const code = parseInt(codeLine.trim(), 10);
        const valLine = nextLine();
        if (valLine === null) return null;
        if (!isNaN(code)) {
          return [code, valLine.trim()];
        }
      }
      return null;
    }
  };
}

/**
 * Read entity properties until the next group code 0.
 * Captures single properties, repeated vertices (LWPOLYLINE 10/20 + bulge 42),
 * SPLINE control points/knots, and HATCH boundary loops.
 */
function readEntityProps(scanner, initialType) {
  const props = {};
  const vertices = []; // { x, y, bulge }
  const splineControlPoints = [];
  const splineFitPoints = [];
  const splineKnots = [];
  const hatchLoops = [];

  let currentVertex = null;
  let pendingSplinePt = null;
  let pendingFitPt = null;

  // HATCH boundary parsing state
  let inHatch = initialType === 'HATCH';
  let currentLoop = null;
  let expectedLoopVerts = 0;
  let currentEdge = null;

  let pair = scanner.nextPair();
  while (pair !== null) {
    const code = pair[0];
    const val = pair[1];
    if (code === 0) {
      return {
        props,
        vertices,
        splineControlPoints,
        splineFitPoints,
        splineKnots,
        hatchLoops,
        nextPair: pair
      };
    }

    if (initialType === 'LWPOLYLINE') {
      if (code === 10) {
        currentVertex = { x: parseFloat(val) || 0, y: 0, bulge: 0 };
        vertices.push(currentVertex);
      } else if (code === 20 && currentVertex) {
        currentVertex.y = parseFloat(val) || 0;
      } else if (code === 42 && currentVertex) {
        currentVertex.bulge = parseFloat(val) || 0;
      } else if (props[code] === undefined) {
        props[code] = val;
      }
    } else if (initialType === 'SPLINE') {
      if (code === 10) {
        pendingSplinePt = { x: parseFloat(val) || 0, y: 0 };
        splineControlPoints.push(pendingSplinePt);
      } else if (code === 20 && pendingSplinePt) {
        pendingSplinePt.y = parseFloat(val) || 0;
      } else if (code === 11) {
        pendingFitPt = { x: parseFloat(val) || 0, y: 0 };
        splineFitPoints.push(pendingFitPt);
      } else if (code === 21 && pendingFitPt) {
        pendingFitPt.y = parseFloat(val) || 0;
      } else if (code === 40) {
        splineKnots.push(parseFloat(val) || 0);
      } else if (props[code] === undefined) {
        props[code] = val;
      }
    } else if (initialType === 'LEADER') {
      if (code === 10) {
        currentVertex = { x: parseFloat(val) || 0, y: 0, bulge: 0 };
        vertices.push(currentVertex);
      } else if (code === 20 && currentVertex) {
        currentVertex.y = parseFloat(val) || 0;
      } else if (props[code] === undefined) {
        props[code] = val;
      }
    } else if (inHatch) {
      if (code === 92) {
        // Start of a new boundary path
        const loopFlags = parseInt(val, 10) || 0;
        currentLoop = {
          isPolyline: (loopFlags & 2) !== 0,
          points: [],
          edges: []
        };
        hatchLoops.push(currentLoop);
        expectedLoopVerts = 0;
        currentEdge = null;
      } else if (code === 93 && currentLoop) {
        expectedLoopVerts = parseInt(val, 10) || 0;
      } else if (code === 72 && currentLoop && !currentLoop.isPolyline) {
        const edgeType = parseInt(val, 10); // 1=Line, 2=Arc, 3=Ellipse, 4=Spline
        currentEdge = { edgeType, x1: 0, y1: 0, x2: 0, y2: 0, r: 0, sa: 0, ea: 360 };
        currentLoop.edges.push(currentEdge);
      } else if (code === 10 && currentLoop) {
        if (currentLoop.isPolyline) {
          currentVertex = { x: parseFloat(val) || 0, y: 0, bulge: 0 };
          currentLoop.points.push(currentVertex);
        } else if (currentEdge) {
          currentEdge.x1 = parseFloat(val) || 0;
        }
      } else if (code === 20 && currentLoop) {
        if (currentLoop.isPolyline && currentVertex) {
          currentVertex.y = parseFloat(val) || 0;
        } else if (currentEdge) {
          currentEdge.y1 = parseFloat(val) || 0;
        }
      } else if (code === 42 && currentLoop && currentLoop.isPolyline && currentVertex) {
        currentVertex.bulge = parseFloat(val) || 0;
      } else if (code === 11 && currentEdge) {
        currentEdge.x2 = parseFloat(val) || 0;
      } else if (code === 21 && currentEdge) {
        currentEdge.y2 = parseFloat(val) || 0;
      } else if (code === 40 && currentEdge) {
        currentEdge.r = parseFloat(val) || 0;
      } else if (code === 50 && currentEdge) {
        currentEdge.sa = parseFloat(val) || 0;
      } else if (code === 51 && currentEdge) {
        currentEdge.ea = parseFloat(val) || 360;
      } else if (props[code] === undefined) {
        props[code] = val;
      }
    } else {
      if (props[code] === undefined) {
        props[code] = val;
      }
    }

    pair = scanner.nextPair();
  }

  return {
    props,
    vertices,
    splineControlPoints,
    splineFitPoints,
    splineKnots,
    hatchLoops,
    nextPair: null
  };
}

function buildEntityObject(entityType, parsed, layersMap) {
  const { props, vertices, splineControlPoints, splineFitPoints, splineKnots, hatchLoops } = parsed;
  const layer = props[8] || '0';
  const layerInfo = layersMap.get(layer);
  const explicitColor = resolveTrueColor(props[420]) || resolveAciColor(props[62]);

  const ent = {
    type: entityType,
    layer,
    color: explicitColor || (layerInfo ? layerInfo.color : null),
    linetype: (props[6] || (layerInfo ? layerInfo.linetype : 'CONTINUOUS')).toUpperCase(),
    x: props[10] != null ? parseFloat(props[10]) : 0,
    y: props[20] != null ? parseFloat(props[20]) : 0,
    z: props[30] != null ? parseFloat(props[30]) : 0,
    x2: props[11] != null ? parseFloat(props[11]) : undefined,
    y2: props[21] != null ? parseFloat(props[21]) : undefined,
    x3: props[12] != null ? parseFloat(props[12]) : undefined,
    y3: props[22] != null ? parseFloat(props[22]) : undefined,
    x4: props[13] != null ? parseFloat(props[13]) : undefined,
    y4: props[23] != null ? parseFloat(props[23]) : undefined,
    x5: props[14] != null ? parseFloat(props[14]) : undefined,
    y5: props[24] != null ? parseFloat(props[24]) : undefined,
    radius: props[40] != null ? parseFloat(props[40]) : undefined,
    textHeight: props[40] != null ? parseFloat(props[40]) : 8,
    startAngle: props[50] != null ? parseFloat(props[50]) : undefined,
    endAngle: props[51] != null ? parseFloat(props[51]) : undefined,
    rotation: props[50] != null ? parseFloat(props[50]) : 0,
    scaleX: props[41] != null ? parseFloat(props[41]) : 1,
    scaleY: props[42] != null ? parseFloat(props[42]) : 1,
    startParam: props[41] != null ? parseFloat(props[41]) : 0,
    endParam: props[42] != null ? parseFloat(props[42]) : Math.PI * 2,
    blockName: props[2] ? props[2].trim() : undefined,
    flags: props[70] != null ? parseInt(props[70], 10) : 0,
    degree: props[71] != null ? parseInt(props[71], 10) : 3,
    text: props[1] || props[3] || undefined,
    vertices: vertices || [],
    splineControlPoints: splineControlPoints || [],
    splineFitPoints: splineFitPoints || [],
    splineKnots: splineKnots || [],
    hatchLoops: hatchLoops || [],
    solidFill: props[70] === '1'
  };

  return ent;
}

/**
 * Recursively expand INSERT block references (up to maxDepth = 8)
 * with accumulated 2D affine transforms.
 */
function expandInsertEntity(insertEnt, blocksMap, layersMap, outEntities, depth = 0) {
  if (depth > 8 || !insertEnt.blockName || !blocksMap.has(insertEnt.blockName)) {
    return;
  }

  const blk = blocksMap.get(insertEnt.blockName);
  const rad = ((insertEnt.rotation || 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const sx = insertEnt.scaleX || 1;
  const sy = insertEnt.scaleY || 1;

  const transformPt = (px, py) => {
    const lx = (px - blk.baseX) * sx;
    const ly = (py - blk.baseY) * sy;
    return {
      x: insertEnt.x + (lx * cosR - ly * sinR),
      y: insertEnt.y + (lx * sinR + ly * cosR)
    };
  };

  for (let i = 0; i < blk.entities.length; i++) {
    const be = blk.entities[i];
    const inheritedLayer = insertEnt.layer && insertEnt.layer !== '0' ? insertEnt.layer : be.layer;
    const inheritedColor = be.color || insertEnt.color;

    if (be.type === 'INSERT') {
      const tp = transformPt(be.x || 0, be.y || 0);
      const nestedInsert = {
        ...be,
        layer: inheritedLayer,
        color: inheritedColor,
        x: tp.x,
        y: tp.y,
        scaleX: (be.scaleX || 1) * sx,
        scaleY: (be.scaleY || 1) * sy,
        rotation: (be.rotation || 0) + (insertEnt.rotation || 0)
      };
      expandInsertEntity(nestedInsert, blocksMap, layersMap, outEntities, depth + 1);
      continue;
    }

    const instEnt = { ...be, layer: inheritedLayer, color: inheritedColor };
    const tp1 = transformPt(be.x || 0, be.y || 0);
    instEnt.x = tp1.x;
    instEnt.y = tp1.y;

    if (be.x2 !== undefined && be.y2 !== undefined) {
      if (be.type === 'ELLIPSE') {
        // Major axis endpoint in ELLIPSE is a relative vector, rotate/scale without translation
        const lx = be.x2 * sx;
        const ly = be.y2 * sy;
        instEnt.x2 = lx * cosR - ly * sinR;
        instEnt.y2 = lx * sinR + ly * cosR;
      } else {
        const tp2 = transformPt(be.x2, be.y2);
        instEnt.x2 = tp2.x;
        instEnt.y2 = tp2.y;
      }
    }
    if (be.x3 !== undefined && be.y3 !== undefined) {
      const tp3 = transformPt(be.x3, be.y3);
      instEnt.x3 = tp3.x;
      instEnt.y3 = tp3.y;
    }
    if (be.x4 !== undefined && be.y4 !== undefined) {
      const tp4 = transformPt(be.x4, be.y4);
      instEnt.x4 = tp4.x;
      instEnt.y4 = tp4.y;
    }
    if (be.radius !== undefined) {
      instEnt.radius = be.radius * Math.abs(sx);
    }
    if (be.startAngle !== undefined) {
      instEnt.startAngle = be.startAngle + (insertEnt.rotation || 0);
    }
    if (be.endAngle !== undefined) {
      instEnt.endAngle = be.endAngle + (insertEnt.rotation || 0);
    }
    if (be.rotation !== undefined) {
      instEnt.rotation = (be.rotation || 0) + (insertEnt.rotation || 0);
    }
    if (be.vertices && be.vertices.length > 0) {
      instEnt.vertices = be.vertices.map((v) => {
        const tv = transformPt(v.x, v.y);
        return { x: tv.x, y: tv.y, bulge: v.bulge || 0 };
      });
    }
    if (be.splineControlPoints && be.splineControlPoints.length > 0) {
      instEnt.splineControlPoints = be.splineControlPoints.map((pt) => transformPt(pt.x, pt.y));
    }
    if (be.splineFitPoints && be.splineFitPoints.length > 0) {
      instEnt.splineFitPoints = be.splineFitPoints.map((pt) => transformPt(pt.x, pt.y));
    }
    if (be.hatchLoops && be.hatchLoops.length > 0) {
      instEnt.hatchLoops = be.hatchLoops.map((loop) => ({
        ...loop,
        points: loop.points.map((pt) => {
          const tv = transformPt(pt.x, pt.y);
          return { x: tv.x, y: tv.y, bulge: pt.bulge || 0 };
        }),
        edges: loop.edges.map((ed) => {
          const p1 = transformPt(ed.x1, ed.y1);
          const p2 = transformPt(ed.x2, ed.y2);
          return {
            ...ed,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            r: ed.r * Math.abs(sx)
          };
        })
      }));
    }

    if (!layersMap.has(instEnt.layer)) {
      layersMap.set(instEnt.layer, { name: instEnt.layer, color: '#38bdf8', linetype: 'CONTINUOUS', visible: true, count: 0 });
    }
    layersMap.get(instEnt.layer).count += 1;
    outEntities.push(instEnt);
  }
}

/**
 * Asynchronous non-blocking chunked DXF parser for 20MB+ files.
 */
export async function parseDxfAsync(dxfText, onProgress, chunkEntityInterval = 4000) {
  if (!dxfText || typeof dxfText !== 'string') {
    return { entities: [], layers: [], isBinaryDwg: false };
  }
  if (isBinaryDwg(dxfText)) {
    return { entities: [], layers: [], isBinaryDwg: true };
  }

  const scanner = createPairScanner(dxfText);
  const entities = [];
  const rawEntities = [];
  const layersMap = new Map();
  const blocksMap = new Map();

  let currentSection = null;
  let currentBlock = null;
  let processedRecords = 0;

  let pair = scanner.nextPair();
  while (pair !== null) {
    const code = pair[0];
    const val = pair[1];

    if (code !== 0) {
      pair = scanner.nextPair();
      continue;
    }

    const valUpper = val.toUpperCase();

    if (valUpper === 'SECTION') {
      const next = scanner.nextPair();
      if (next && next[0] === 2) {
        currentSection = next[1].toUpperCase();
        pair = scanner.nextPair();
      } else {
        pair = next;
      }
      continue;
    }

    if (valUpper === 'ENDSEC' || valUpper === 'EOF') {
      currentSection = null;
      currentBlock = null;
      pair = scanner.nextPair();
      continue;
    }

    // ── TABLES: Layer definitions ────────────────────────────────────────────
    if (currentSection === 'TABLES') {
      if (valUpper === 'LAYER') {
        const parsed = readEntityProps(scanner, 'LAYER');
        const layerName = parsed.props[2] || '0';
        const layerColor =
          resolveTrueColor(parsed.props[420]) ||
          resolveAciColor(parsed.props[62]) ||
          '#38bdf8';
        const linetype = (parsed.props[6] || 'CONTINUOUS').toUpperCase();
        layersMap.set(layerName, {
          name: layerName,
          color: layerColor,
          linetype,
          visible: true,
          count: 0
        });
        pair = parsed.nextPair;
      } else {
        pair = scanner.nextPair();
      }
      continue;
    }

    // ── BLOCKS: Component definitions & *D Dimension anonymous blocks ────────
    if (currentSection === 'BLOCKS') {
      if (valUpper === 'BLOCK') {
        const parsed = readEntityProps(scanner, 'BLOCK');
        const bName = (parsed.props[2] || '').trim();
        currentBlock = {
          name: bName,
          baseX: parsed.props[10] != null ? parseFloat(parsed.props[10]) : 0,
          baseY: parsed.props[20] != null ? parseFloat(parsed.props[20]) : 0,
          entities: []
        };
        if (bName) blocksMap.set(bName, currentBlock);
        pair = parsed.nextPair;
      } else if (valUpper === 'ENDBLK') {
        currentBlock = null;
        pair = scanner.nextPair();
      } else if (currentBlock && SUPPORTED_ENTITIES.has(valUpper)) {
        const parsed = readEntityProps(scanner, valUpper);
        const subEnt = buildEntityObject(valUpper, parsed, layersMap);
        // Handle R12 POLYLINE inside block
        if (valUpper === 'POLYLINE') {
          let subP = parsed.nextPair;
          while (subP && subP[0] === 0) {
            const subT = subP[1].toUpperCase();
            if (subT === 'SEQEND') {
              subP = scanner.nextPair();
              break;
            }
            if (subT === 'VERTEX') {
              const vp = readEntityProps(scanner, 'VERTEX');
              const vf = vp.props[70] != null ? parseInt(vp.props[70], 10) : 0;
              if (!(vf & 0x10) && !(vf & 0x20)) {
                subEnt.vertices.push({
                  x: vp.props[10] != null ? parseFloat(vp.props[10]) : 0,
                  y: vp.props[20] != null ? parseFloat(vp.props[20]) : 0,
                  bulge: vp.props[42] != null ? parseFloat(vp.props[42]) : 0
                });
              }
              subP = vp.nextPair;
            } else {
              break;
            }
          }
          pair = subP;
        } else {
          pair = parsed.nextPair;
        }
        currentBlock.entities.push(subEnt);
      } else {
        pair = scanner.nextPair();
      }
      continue;
    }

    // ── ENTITIES: Drawing geometry ───────────────────────────────────────────
    if (currentSection !== 'ENTITIES') {
      pair = scanner.nextPair();
      continue;
    }

    if (valUpper === 'VERTEX' || valUpper === 'SEQEND') {
      pair = scanner.nextPair();
      continue;
    }

    if (!SUPPORTED_ENTITIES.has(valUpper)) {
      const skipped = readEntityProps(scanner, valUpper);
      pair = skipped.nextPair;
      continue;
    }

    const parsed = readEntityProps(scanner, valUpper);
    const entity = buildEntityObject(valUpper, parsed, layersMap);

    if (valUpper === 'POLYLINE') {
      let subP = parsed.nextPair;
      while (subP && subP[0] === 0) {
        const subT = subP[1].toUpperCase();
        if (subT === 'SEQEND') {
          subP = scanner.nextPair();
          break;
        }
        if (subT === 'VERTEX') {
          const vp = readEntityProps(scanner, 'VERTEX');
          const vf = vp.props[70] != null ? parseInt(vp.props[70], 10) : 0;
          if (!(vf & 0x10) && !(vf & 0x20)) {
            entity.vertices.push({
              x: vp.props[10] != null ? parseFloat(vp.props[10]) : 0,
              y: vp.props[20] != null ? parseFloat(vp.props[20]) : 0,
              bulge: vp.props[42] != null ? parseFloat(vp.props[42]) : 0
            });
          }
          subP = vp.nextPair;
        } else {
          break;
        }
      }
      pair = subP;
    } else {
      pair = parsed.nextPair;
    }

    rawEntities.push(entity);
    processedRecords += 1;

    if (processedRecords % chunkEntityInterval === 0) {
      if (onProgress) {
        onProgress({
          percent: Math.min(88, Math.round(scanner.getProgress() * 88)),
          section: currentSection || 'ENTITIES',
          entityCount: processedRecords
        });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Expand INSERT and DIMENSION (*D anonymous blocks) after all BLOCKS are collected
  if (onProgress) {
    onProgress({ percent: 92, section: 'Expanding Blocks & Dimensions', entityCount: rawEntities.length });
  }

  for (let i = 0; i < rawEntities.length; i++) {
    const ent = rawEntities[i];

    if (ent.type === 'INSERT') {
      expandInsertEntity(ent, blocksMap, layersMap, entities, 0);
      continue;
    }

    if (ent.type === 'DIMENSION' && ent.blockName && blocksMap.has(ent.blockName)) {
      // AutoCAD stores pre-computed dimension lines, arrows, and text in *D... block
      expandInsertEntity({ ...ent, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, blocksMap, layersMap, entities, 0);
      continue;
    }

    if (!layersMap.has(ent.layer)) {
      layersMap.set(ent.layer, { name: ent.layer, color: '#38bdf8', linetype: 'CONTINUOUS', visible: true, count: 0 });
    }
    layersMap.get(ent.layer).count += 1;
    if (!ent.color) ent.color = layersMap.get(ent.layer).color;
    entities.push(ent);

    if (i > 0 && i % (chunkEntityInterval * 2) === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (layersMap.size === 0) {
    layersMap.set('0', { name: '0', color: '#38bdf8', linetype: 'CONTINUOUS', visible: true, count: entities.length });
  }

  if (onProgress) {
    onProgress({ percent: 100, section: 'Complete', entityCount: entities.length });
  }

  return {
    entities,
    layers: Array.from(layersMap.values()),
    isBinaryDwg: false
  };
}
