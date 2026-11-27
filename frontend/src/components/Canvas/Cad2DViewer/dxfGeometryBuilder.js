/**
 * dxfGeometryBuilder.js
 * Converts parsed DXF entities into batched Three.js WebGL geometry per layer.
 * Supports: LINE, LWPOLYLINE/POLYLINE (with bulge arcs), CIRCLE, ARC, ELLIPSE (partial/full),
 * SPLINE (B-spline evaluation), HATCH (boundaries + solid poche), DIMENSION fallback,
 * LEADER/MLEADER, SOLID/3DFACE/TRACE, XLINE/RAY, and dashed/center linetypes.
 */

import * as THREE from 'three';
import { adaptColorForTheme } from './dxfColors';

/**
 * Tessellate a polyline segment with a DXF bulge factor (tan(theta / 4)) into arc points.
 */
function tessellateBulgeSegment(p1, p2, bulge, segments = 16) {
  if (!bulge || Math.abs(bulge) < 1e-6) {
    return [p1, p2];
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return [p1, p2];

  const theta = 4 * Math.atan(bulge); // included angle (signed)
  const halfChord = dist / 2;
  const radius = Math.abs(halfChord / Math.sin(theta / 2));
  if (!Number.isFinite(radius) || radius > 1e8) return [p1, p2];

  const apothem = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord));
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Normal unit vector perpendicular to chord
  const nx = -dy / dist;
  const ny = dx / dist;
  const sign = bulge > 0 ? 1 : -1;
  const centerSign = Math.abs(theta) > Math.PI ? -sign : sign;

  const cx = midX + nx * apothem * centerSign;
  const cy = midY + ny * apothem * centerSign;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const pts = [];
  const steps = Math.max(6, Math.min(36, Math.ceil((Math.abs(theta) / (Math.PI * 2)) * segments * 2)));

  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (i / steps) * theta;
    pts.push({
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius
    });
  }
  return pts;
}

/**
 * Evaluate B-Spline / NURBS curve using Cox-de Boor recursion.
 */
function evaluateBSpline(controlPoints, knots, degree = 3, numSamples = 48) {
  const n = controlPoints.length - 1;
  if (n < 1) return controlPoints;
  const p = Math.min(degree, n);

  // Synthesize uniform clamped knot vector if missing or malformed
  let U = knots;
  if (!U || U.length !== n + p + 2) {
    U = [];
    const totalKnots = n + p + 2;
    for (let i = 0; i < totalKnots; i++) {
      if (i <= p) U.push(0);
      else if (i >= totalKnots - p - 1) U.push(1);
      else U.push((i - p) / (totalKnots - 2 * p - 1));
    }
  }

  const tMin = U[p];
  const tMax = U[n + 1];
  if (tMax <= tMin) return controlPoints;

  function basis(i, k, t) {
    if (k === 0) {
      return t >= U[i] && t < U[i + 1] ? 1 : 0;
    }
    let left = 0;
    let right = 0;
    const d1 = U[i + k] - U[i];
    if (d1 > 1e-9) left = ((t - U[i]) / d1) * basis(i, k - 1, t);
    const d2 = U[i + k + 1] - U[i + 1];
    if (d2 > 1e-9) right = ((U[i + k + 1] - t) / d2) * basis(i + 1, k - 1, t);
    return left + right;
  }

  const samples = Math.max(24, Math.min(120, controlPoints.length * 4, numSamples));
  const result = [];
  for (let s = 0; s <= samples; s++) {
    if (s === samples) {
      result.push(controlPoints[n]);
      break;
    }
    const t = tMin + (s / samples) * (tMax - tMin);
    let x = 0;
    let y = 0;
    for (let i = 0; i <= n; i++) {
      const b = basis(i, p, t);
      if (b !== 0) {
        x += b * controlPoints[i].x;
        y += b * controlPoints[i].y;
      }
    }
    result.push({ x, y });
  }
  return result;
}

function isDashedLinetype(linetype = '') {
  return /DASH|CENTER|HIDDEN|DOT|PHANTOM|BORDER/.test(linetype);
}

/**
 * Build batched Three.js layer groups and collect text entities for the 2D HUD overlay.
 */
export function buildCadSceneGeometry(parsedData, activeLayerNames, isDark) {
  const { entities = [] } = parsedData || {};
  const layerBuckets = new Map();
  const textEntities = [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const updateBounds = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    if (ent.type === 'TEXT' || ent.type === 'MTEXT' || ent.type === 'ATTRIB') {
      if (ent.text && ent.text.trim()) {
        textEntities.push(ent);
        updateBounds(ent.x, ent.y);
      }
      continue;
    }

    const layerName = ent.layer || '0';
    if (!layerBuckets.has(layerName)) {
      layerBuckets.set(layerName, []);
    }
    layerBuckets.get(layerName).push(ent);
  }

  const defaultStrokeColor = isDark ? '#e2e8f0' : '#0f172a';
  const layerGroups = new Map();

  layerBuckets.forEach((layerEntities, layerName) => {
    const layerGroup = new THREE.Group();
    layerGroup.name = `layer_${layerName}`;

    const solidPositions = [];
    const solidColors = [];
    const dashedPositions = [];
    const dashedColors = [];
    const fillMeshes = [];

    const pushSeg = (x1, y1, x2, y2, c, dashed = false) => {
      updateBounds(x1, y1);
      updateBounds(x2, y2);
      if (dashed) {
        dashedPositions.push(x1, y1, 0, x2, y2, 0);
        dashedColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      } else {
        solidPositions.push(x1, y1, 0, x2, y2, 0);
        solidColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    };

    const pushPolyline = (pts, closed, c, dashed = false) => {
      if (!pts || pts.length < 2) return;
      for (let v = 0; v < pts.length - 1; v++) {
        const p1 = pts[v];
        const p2 = pts[v + 1];
        if (p1.bulge && Math.abs(p1.bulge) > 1e-6) {
          const arcPts = tessellateBulgeSegment(p1, p2, p1.bulge);
          for (let a = 0; a < arcPts.length - 1; a++) {
            pushSeg(arcPts[a].x, arcPts[a].y, arcPts[a + 1].x, arcPts[a + 1].y, c, dashed);
          }
        } else {
          pushSeg(p1.x, p1.y, p2.x, p2.y, c, dashed);
        }
      }
      if (closed && pts.length > 2) {
        const last = pts[pts.length - 1];
        const first = pts[0];
        if (last.bulge && Math.abs(last.bulge) > 1e-6) {
          const arcPts = tessellateBulgeSegment(last, first, last.bulge);
          for (let a = 0; a < arcPts.length - 1; a++) {
            pushSeg(arcPts[a].x, arcPts[a].y, arcPts[a + 1].x, arcPts[a + 1].y, c, dashed);
          }
        } else {
          pushSeg(last.x, last.y, first.x, first.y, c, dashed);
        }
      }
    };

    for (let i = 0; i < layerEntities.length; i++) {
      const ent = layerEntities[i];
      const adaptedHex = adaptColorForTheme(ent.color || defaultStrokeColor, isDark);
      const entColor = new THREE.Color(adaptedHex);

      const dashed = isDashedLinetype(ent.linetype);

      if (ent.type === 'LINE') {
        pushSeg(ent.x ?? 0, ent.y ?? 0, ent.x2 ?? 0, ent.y2 ?? 0, entColor, dashed);
      } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE' || ent.type === 'LEADER') {
        pushPolyline(ent.vertices, (ent.flags & 1) === 1, entColor, dashed);
      } else if (ent.type === 'CIRCLE') {
        const cx = ent.x ?? 0;
        const cy = ent.y ?? 0;
        const r = ent.radius || 5;
        const segments = 48;
        for (let s = 0; s < segments; s++) {
          const t1 = (s / segments) * Math.PI * 2;
          const t2 = ((s + 1) / segments) * Math.PI * 2;
          pushSeg(cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, cx + Math.cos(t2) * r, cy + Math.sin(t2) * r, entColor, dashed);
        }
      } else if (ent.type === 'ARC') {
        const cx = ent.x ?? 0;
        const cy = ent.y ?? 0;
        const r = ent.radius || 5;
        const sDeg = ent.startAngle || 0;
        const eDeg = ent.endAngle ?? 360;
        let span = eDeg - sDeg;
        if (span <= 0) span += 360;
        const segments = Math.max(12, Math.floor(span / 8));
        for (let s = 0; s < segments; s++) {
          const t1 = THREE.MathUtils.degToRad(sDeg + (s / segments) * span);
          const t2 = THREE.MathUtils.degToRad(sDeg + ((s + 1) / segments) * span);
          pushSeg(cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, cx + Math.cos(t2) * r, cy + Math.sin(t2) * r, entColor, dashed);
        }
      } else if (ent.type === 'ELLIPSE') {
        const cx = ent.x ?? 0;
        const cy = ent.y ?? 0;
        const mx = ent.x2 ?? 10;
        const my = ent.y2 ?? 0;
        const majorLen = Math.hypot(mx, my) || 10;
        const minorLen = majorLen * (ent.radius || 0.5);
        const majorAngle = Math.atan2(my, mx);
        const cosA = Math.cos(majorAngle);
        const sinA = Math.sin(majorAngle);

        const sParam = ent.startParam ?? 0;
        let eParam = ent.endParam ?? Math.PI * 2;
        if (eParam <= sParam) eParam += Math.PI * 2;
        const span = eParam - sParam;
        const segments = Math.max(16, Math.ceil((span / (Math.PI * 2)) * 48));

        for (let s = 0; s < segments; s++) {
          const t1 = sParam + (s / segments) * span;
          const t2 = sParam + ((s + 1) / segments) * span;
          const lx1 = Math.cos(t1) * majorLen;
          const ly1 = Math.sin(t1) * minorLen;
          const lx2 = Math.cos(t2) * majorLen;
          const ly2 = Math.sin(t2) * minorLen;
          pushSeg(
            cx + lx1 * cosA - ly1 * sinA,
            cy + lx1 * sinA + ly1 * cosA,
            cx + lx2 * cosA - ly2 * sinA,
            cy + lx2 * sinA + ly2 * cosA,
            entColor,
            dashed
          );
        }
      } else if (ent.type === 'SPLINE') {
        const pts =
          ent.splineControlPoints && ent.splineControlPoints.length >= 2
            ? evaluateBSpline(ent.splineControlPoints, ent.splineKnots, ent.degree || 3)
            : ent.splineFitPoints;
        pushPolyline(pts, (ent.flags & 1) === 1, entColor, dashed);
      } else if (ent.type === 'HATCH') {
        if (ent.hatchLoops && ent.hatchLoops.length > 0) {
          ent.hatchLoops.forEach((loop, loopIdx) => {
            const loopPts = [];
            if (loop.isPolyline && loop.points.length > 1) {
              pushPolyline(loop.points, true, entColor, false);
              loop.points.forEach((p) => loopPts.push(p));
            } else if (loop.edges && loop.edges.length > 0) {
              loop.edges.forEach((ed) => {
                if (ed.edgeType === 1) {
                  pushSeg(ed.x1, ed.y1, ed.x2, ed.y2, entColor, false);
                  loopPts.push({ x: ed.x1, y: ed.y1 }, { x: ed.x2, y: ed.y2 });
                } else if (ed.edgeType === 2) {
                  let span = ed.ea - ed.sa;
                  if (span <= 0) span += 360;
                  const segs = Math.max(8, Math.floor(span / 12));
                  for (let s = 0; s < segs; s++) {
                    const t1 = THREE.MathUtils.degToRad(ed.sa + (s / segs) * span);
                    const t2 = THREE.MathUtils.degToRad(ed.sa + ((s + 1) / segs) * span);
                    const px1 = ed.x1 + Math.cos(t1) * ed.r;
                    const py1 = ed.y1 + Math.sin(t1) * ed.r;
                    const px2 = ed.x1 + Math.cos(t2) * ed.r;
                    const py2 = ed.y1 + Math.sin(t2) * ed.r;
                    pushSeg(px1, py1, px2, py2, entColor, false);
                    loopPts.push({ x: px1, y: py1 });
                  }
                }
              });
            }

            // Solid poche fill on outer boundary loop (limit vertices for safety)
            if (ent.solidFill && loopIdx === 0 && loopPts.length >= 3 && loopPts.length <= 400) {
              try {
                const shape = new THREE.Shape();
                shape.moveTo(loopPts[0].x, loopPts[0].y);
                for (let k = 1; k < loopPts.length; k++) {
                  shape.lineTo(loopPts[k].x, loopPts[k].y);
                }
                shape.closePath();
                const geom = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({
                  color: entColor,
                  transparent: true,
                  opacity: 0.22,
                  side: THREE.DoubleSide,
                  depthWrite: false
                });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.position.z = -0.2;
                fillMeshes.push(mesh);
              } catch {
                // Skip degenerate hatch shapes gracefully
              }
            }
          });
        }
      } else if (ent.type === 'DIMENSION') {
        // Fallback if *D anonymous block wasn't present
        if (ent.x3 !== undefined && ent.y3 !== undefined && ent.x4 !== undefined && ent.y4 !== undefined) {
          pushSeg(ent.x3, ent.y3, ent.x4, ent.y4, entColor, false);
          if (ent.x !== undefined && ent.y !== undefined) {
            pushSeg(ent.x4, ent.y4, ent.x, ent.y, entColor, false);
          }
        }
      } else if (ent.type === 'SOLID' || ent.type === '3DFACE' || ent.type === 'TRACE') {
        const p1 = { x: ent.x ?? 0, y: ent.y ?? 0 };
        const p2 = { x: ent.x2 ?? 0, y: ent.y2 ?? 0 };
        const p3 = { x: ent.x3 !== undefined ? ent.x3 : p2.x, y: ent.y3 !== undefined ? ent.y3 : p2.y };
        const p4 = { x: ent.x4 !== undefined ? ent.x4 : p3.x, y: ent.y4 !== undefined ? ent.y4 : p3.y };
        pushSeg(p1.x, p1.y, p2.x, p2.y, entColor, false);
        pushSeg(p2.x, p2.y, p4.x, p4.y, entColor, false);
        pushSeg(p4.x, p4.y, p3.x, p3.y, entColor, false);
        pushSeg(p3.x, p3.y, p1.x, p1.y, entColor, false);
      } else if (ent.type === 'XLINE' || ent.type === 'RAY') {
        const dx = ent.x2 ?? 1;
        const dy = ent.y2 ?? 0;
        const mag = Math.hypot(dx, dy) || 1;
        const ux = dx / mag;
        const uy = dy / mag;
        const span = 500;
        const startX = ent.type === 'XLINE' ? (ent.x ?? 0) - ux * span : (ent.x ?? 0);
        const startY = ent.type === 'XLINE' ? (ent.y ?? 0) - uy * span : (ent.y ?? 0);
        pushSeg(startX, startY, (ent.x ?? 0) + ux * span, (ent.y ?? 0) + uy * span, entColor, true);
      }
    }

    if (solidPositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(solidColors, 3));
      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95
      });
      layerGroup.add(new THREE.LineSegments(geometry, material));
    }

    if (dashedPositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(dashedPositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(dashedColors, 3));
      const material = new THREE.LineDashedMaterial({
        vertexColors: true,
        dashSize: 3,
        gapSize: 1.5,
        transparent: true,
        opacity: 0.8
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.computeLineDistances();
      layerGroup.add(lines);
    }

    fillMeshes.forEach((m) => layerGroup.add(m));

    layerGroup.visible = activeLayerNames.has(layerName);
    layerGroups.set(layerName, layerGroup);
  });

  if (minX === Infinity) {
    minX = -50;
    maxX = 50;
    minY = -50;
    maxY = 50;
  }

  return {
    layerGroups,
    textEntities,
    bounds: { minX, maxX, minY, maxY }
  };
}
