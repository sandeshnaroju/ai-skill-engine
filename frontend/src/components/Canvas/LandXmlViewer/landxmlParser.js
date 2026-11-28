/**
 * landxmlParser.js
 * Parses LandXML (.xml / .landxml) Civil & Earthworks files:
 * - Units & Project metadata
 * - TIN Surfaces (<Surfaces><Surface><Definition surfType="TIN">)
 * - Cut / Fill Earthworks volume estimation between two TIN surfaces
 * - Alignments (<Alignments><Alignment><CoordGeom> & <Profile><ProfAlign>)
 * - Pipe Networks (<PipeNetworks><PipeNetwork><Structs> & <Pipes>)
 * - Parcels & Survey Control Points (<Parcels>, <CgPoints>)
 * - CSV export helpers
 */

export function isLandXml(rawContent, filename = '') {
  if (/\.landxml$/i.test(filename || '')) return true;
  if (!rawContent || typeof rawContent !== 'string') return false;
  return rawContent.slice(0, 12000).includes('<LandXML');
}

function localName(node) {
  if (!node || !node.tagName) return '';
  const idx = node.tagName.indexOf(':');
  return idx >= 0 ? node.tagName.slice(idx + 1) : node.tagName;
}

function childElements(parent, tag) {
  if (!parent) return [];
  const res = [];
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (!tag || localName(c) === tag) res.push(c);
  }
  return res;
}

function firstChild(parent, tag) {
  if (!parent) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (localName(c) === tag) return c;
  }
  return null;
}

function parseNez(text) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return {
    n: parts[0],
    e: parts[1],
    z: parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : 0,
  };
}

function pointInTri2D(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax, v0y = cy - ay;
  const v1x = bx - ax, v1y = by - ay;
  const v2x = px - ax, v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
    return { wA: 1 - u - v, wB: v, wC: u };
  }
  return null;
}

export function estimateCutFill(baseSurf, compSurf, gridRes = 45) {
  if (!baseSurf || !compSurf || !baseSurf.triangles.length || !compSurf.triangles.length) {
    return { cutVolume: 0, fillVolume: 0, netVolume: 0, overlapArea: 0, samples: 0, gridDeltas: [] };
  }

  const minE = Math.max(baseSurf.bounds.minE, compSurf.bounds.minE);
  const maxE = Math.min(baseSurf.bounds.maxE, compSurf.bounds.maxE);
  const minN = Math.max(baseSurf.bounds.minN, compSurf.bounds.minN);
  const maxN = Math.min(baseSurf.bounds.maxN, compSurf.bounds.maxN);

  if (minE >= maxE || minN >= maxN) {
    return { cutVolume: 0, fillVolume: 0, netVolume: 0, overlapArea: 0, samples: 0, gridDeltas: [] };
  }

  const stepE = (maxE - minE) / gridRes;
  const stepN = (maxN - minN) / gridRes;
  const cellArea = stepE * stepN;

  const sampleSurfaceZ = (surf, e, n) => {
    for (const tri of surf.triangles) {
      if (e < tri.minE || e > tri.maxE || n < tri.minN || n > tri.maxN) continue;
      const b = pointInTri2D(e, n, tri.a.e, tri.a.n, tri.b.e, tri.b.n, tri.c.e, tri.c.n);
      if (b) {
        return b.wA * tri.a.z + b.wB * tri.b.z + b.wC * tri.c.z;
      }
    }
    return null;
  };

  let cutVolume = 0;
  let fillVolume = 0;
  let samples = 0;
  const gridDeltas = [];

  for (let i = 0; i < gridRes; i++) {
    const e = minE + (i + 0.5) * stepE;
    for (let j = 0; j < gridRes; j++) {
      const n = minN + (j + 0.5) * stepN;
      const zBase = sampleSurfaceZ(baseSurf, e, n);
      if (zBase == null) continue;
      const zComp = sampleSurfaceZ(compSurf, e, n);
      if (zComp == null) continue;

      const delta = zComp - zBase; // + => fill, - => cut
      samples++;
      if (delta > 0) fillVolume += delta * cellArea;
      else if (delta < 0) cutVolume += Math.abs(delta) * cellArea;
      gridDeltas.push({ e, n, zBase, zComp, delta });
    }
  }

  return {
    cutVolume,
    fillVolume,
    netVolume: fillVolume - cutVolume,
    overlapArea: samples * cellArea,
    samples,
    gridDeltas,
  };
}

export function parseLandXml(rawContent) {
  const empty = {
    meta: { project: 'LandXML Site', units: 'Metric', linearUnit: 'meter', volumeUnit: 'cubicMeter', areaUnit: 'squareMeter' },
    surfaces: [],
    alignments: [],
    pipeNetworks: [],
    parcels: [],
    cgPoints: [],
    bounds: { minE: 0, maxE: 100, minN: 0, maxN: 100, minZ: 0, maxZ: 10 },
    error: null,
  };

  if (!rawContent || typeof rawContent !== 'string') {
    return { ...empty, error: 'Empty LandXML content.' };
  }

  const doc = new DOMParser().parseFromString(rawContent, 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    return { ...empty, error: `Invalid XML: ${parseErr.textContent?.slice(0, 160) || 'Parse error'}` };
  }

  const root = doc.documentElement;
  if (!root || localName(root) !== 'LandXML') {
    return { ...empty, error: 'Root element <LandXML> not found.' };
  }

  const unitsEl = firstChild(root, 'Units');
  const metricEl = firstChild(unitsEl, 'Metric');
  const imperialEl = firstChild(unitsEl, 'Imperial');
  const uEl = metricEl || imperialEl;
  const projectEl = firstChild(root, 'Project');
  const meta = {
    project: projectEl?.getAttribute('name') || 'LandXML Site',
    units: metricEl ? 'Metric' : imperialEl ? 'Imperial' : 'Metric',
    linearUnit: uEl?.getAttribute('linearUnit') || (imperialEl ? 'foot' : 'meter'),
    areaUnit: uEl?.getAttribute('areaUnit') || (imperialEl ? 'squareFoot' : 'squareMeter'),
    volumeUnit: uEl?.getAttribute('volumeUnit') || (imperialEl ? 'cubicYard' : 'cubicMeter'),
  };

  let minE = Infinity, maxE = -Infinity;
  let minN = Infinity, maxN = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  const includePt = (e, n, z) => {
    if (!Number.isFinite(e) || !Number.isFinite(n)) return;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
    if (Number.isFinite(z)) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  };

  // 1. Surfaces (TIN)
  const surfaces = [];
  for (const surfsEl of childElements(root, 'Surfaces')) {
    for (const sEl of childElements(surfsEl, 'Surface')) {
      const name = sEl.getAttribute('name') || `Surface ${surfaces.length + 1}`;
      const defEl = firstChild(sEl, 'Definition');
      const pntsEl = firstChild(defEl, 'Pnts');
      const facesEl = firstChild(defEl, 'Faces');

      const pointMap = {};
      const ptsList = [];
      let sMinE = Infinity, sMaxE = -Infinity, sMinN = Infinity, sMaxN = -Infinity, sMinZ = Infinity, sMaxZ = -Infinity;
      let sumZ = 0;

      for (const pEl of childElements(pntsEl, 'P')) {
        const pid = pEl.getAttribute('id') || '';
        const nez = parseNez(pEl.textContent);
        if (!nez || !pid) continue;
        pointMap[pid] = nez;
        ptsList.push(nez);
        includePt(nez.e, nez.n, nez.z);
        if (nez.e < sMinE) sMinE = nez.e;
        if (nez.e > sMaxE) sMaxE = nez.e;
        if (nez.n < sMinN) sMinN = nez.n;
        if (nez.n > sMaxN) sMaxN = nez.n;
        if (nez.z < sMinZ) sMinZ = nez.z;
        if (nez.z > sMaxZ) sMaxZ = nez.z;
        sumZ += nez.z;
      }

      const triangles = [];
      let area2D = 0;
      let area3D = 0;

      for (const fEl of childElements(facesEl, 'F')) {
        if (fEl.getAttribute('i') === '1') continue; // invisible face
        const ids = (fEl.textContent || '').trim().split(/\s+/);
        if (ids.length < 3) continue;
        const a = pointMap[ids[0]];
        const b = pointMap[ids[1]];
        const c = pointMap[ids[2]];
        if (!a || !b || !c) continue;

        // 2D & 3D triangle area + slope %
        const abx = b.e - a.e, aby = b.n - a.n, abz = b.z - a.z;
        const acx = c.e - a.e, acy = c.n - a.n, acz = c.z - a.z;
        const a2 = Math.abs(abx * acy - aby * acx) * 0.5;
        const cx = aby * acz - abz * acy;
        const cy = abz * acx - abx * acz;
        const cz = abx * acy - aby * acx;
        const normLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const a3 = normLen * 0.5;
        const horiz = Math.sqrt(cx * cx + cy * cy);
        const slopePct = Math.abs(cz) > 1e-9 ? (horiz / Math.abs(cz)) * 100 : 100;

        area2D += a2;
        area3D += a3;

        triangles.push({
          a, b, c,
          slopePct: Math.min(200, slopePct),
          minE: Math.min(a.e, b.e, c.e),
          maxE: Math.max(a.e, b.e, c.e),
          minN: Math.min(a.n, b.n, c.n),
          maxN: Math.max(a.n, b.n, c.n),
        });
      }

      surfaces.push({
        name,
        pointCount: ptsList.length,
        faceCount: triangles.length,
        minZ: Number.isFinite(sMinZ) ? sMinZ : 0,
        maxZ: Number.isFinite(sMaxZ) ? sMaxZ : 0,
        meanZ: ptsList.length ? sumZ / ptsList.length : 0,
        area2D,
        area3D,
        bounds: { minE: sMinE, maxE: sMaxE, minN: sMinN, maxN: sMaxN, minZ: sMinZ, maxZ: sMaxZ },
        triangles,
      });
    }
  }

  // 2. Alignments
  const alignments = [];
  for (const alignsEl of childElements(root, 'Alignments')) {
    for (const aEl of childElements(alignsEl, 'Alignment')) {
      const name = aEl.getAttribute('name') || `Alignment ${alignments.length + 1}`;
      const length = Number(aEl.getAttribute('length') || 0);
      const staStart = Number(aEl.getAttribute('staStart') || 0);
      const segments = [];
      const cgEl = firstChild(aEl, 'CoordGeom');
      if (cgEl) {
        for (const g of cgEl.children) {
          const tag = localName(g);
          const s = parseNez(firstChild(g, 'Start')?.textContent);
          const e = parseNez(firstChild(g, 'End')?.textContent);
          const c = parseNez(firstChild(g, 'Center')?.textContent);
          if (s) includePt(s.e, s.n, s.z);
          if (e) includePt(e.e, e.n, e.z);
          if (s && e) {
            let pts = [s, e];
            if (tag === 'Curve' && c) {
              const r = Math.hypot(s.e - c.e, s.n - c.n);
              if (r > 1e-4) {
                const aStart = Math.atan2(s.n - c.n, s.e - c.e);
                const aEnd = Math.atan2(e.n - c.n, e.e - c.e);
                const rot = (g.getAttribute('rot') || 'ccw').toLowerCase();
                let diff = aEnd - aStart;
                if (rot === 'ccw') {
                  while (diff <= 0) diff += Math.PI * 2;
                } else {
                  while (diff >= 0) diff -= Math.PI * 2;
                }
                const steps = 24;
                pts = [];
                for (let k = 0; k <= steps; k++) {
                  const ang = aStart + (diff * k) / steps;
                  const ptE = c.e + r * Math.cos(ang);
                  const ptN = c.n + r * Math.sin(ang);
                  const ptZ = s.z + ((e.z - s.z) * k) / steps;
                  includePt(ptE, ptN, ptZ);
                  pts.push({ e: ptE, n: ptN, z: ptZ });
                }
              }
            }
            segments.push({ type: tag, start: s, end: e, points: pts, radius: Number(g.getAttribute('radius') || 0) });
          }
        }
      }

      const pvis = [];
      const profSurf = [];
      const profEl = firstChild(aEl, 'Profile');
      const paEl = firstChild(profEl, 'ProfAlign');
      if (paEl) {
        for (const ch of paEl.children) {
          const t = localName(ch);
          if (t === 'PVI' || t === 'ParaCurve') {
            const parts = (ch.textContent || '').trim().split(/\s+/).map(Number);
            if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
              pvis.push({ station: parts[0], elev: parts[1], type: t });
            }
          }
        }
      }
      const psEl = firstChild(profEl, 'ProfSurf');
      const pl2d = firstChild(psEl, 'PntList2D');
      if (pl2d) {
        const nums = (pl2d.textContent || '').trim().split(/\s+/).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
            profSurf.push({ station: nums[i], elev: nums[i + 1] });
          }
        }
      }

      alignments.push({ name, length, staStart, segments, pvis, profSurf });
    }
  }

  // 3. PipeNetworks
  const pipeNetworks = [];
  for (const pnsEl of childElements(root, 'PipeNetworks')) {
    for (const pnEl of childElements(pnsEl, 'PipeNetwork')) {
      const netName = pnEl.getAttribute('name') || `Network ${pipeNetworks.length + 1}`;
      const structs = {};
      const structsList = [];
      const structsEl = firstChild(pnEl, 'Structs');
      if (structsEl) {
        for (const st of childElements(structsEl, 'Struct')) {
          const sName = st.getAttribute('name') || '';
          const center = parseNez(firstChild(st, 'Center')?.textContent);
          const elevRim = Number(st.getAttribute('elevRim') || 0);
          const elevSump = Number(st.getAttribute('elevSump') || 0);
          if (center) {
            includePt(center.e, center.n, elevRim || center.z);
            const obj = { name: sName, e: center.e, n: center.n, elevRim, elevSump };
            structs[sName] = obj;
            structsList.push(obj);
          }
        }
      }

      const pipes = [];
      const pipesEl = firstChild(pnEl, 'Pipes');
      if (pipesEl) {
        for (const pEl of childElements(pipesEl, 'Pipe')) {
          const pName = pEl.getAttribute('name') || '';
          const refStart = pEl.getAttribute('refStart') || '';
          const refEnd = pEl.getAttribute('refEnd') || '';
          const length = Number(pEl.getAttribute('length') || 0);
          const slope = Number(pEl.getAttribute('slope') || 0);
          const circ = firstChild(pEl, 'CircPipe');
          const diameter = Number(circ?.getAttribute('diameter') || 0);
          const material = circ?.getAttribute('material') || '';
          pipes.push({
            name: pName,
            refStart,
            refEnd,
            length,
            slope,
            diameter,
            material,
            startStruct: structs[refStart] || null,
            endStruct: structs[refEnd] || null,
          });
        }
      }

      pipeNetworks.push({ name: netName, structs: structsList, pipes });
    }
  }

  // 4. Parcels
  const parcels = [];
  for (const parsEl of childElements(root, 'Parcels')) {
    for (const pEl of childElements(parsEl, 'Parcel')) {
      const name = pEl.getAttribute('name') || `Parcel ${parcels.length + 1}`;
      const area = Number(pEl.getAttribute('area') || 0);
      const pts = [];
      const cgEl = firstChild(pEl, 'CoordGeom');
      if (cgEl) {
        for (const g of cgEl.children) {
          const s = parseNez(firstChild(g, 'Start')?.textContent);
          const e = parseNez(firstChild(g, 'End')?.textContent);
          if (s) {
            includePt(s.e, s.n, s.z);
            pts.push(s);
          }
          if (e) includePt(e.e, e.n, e.z);
        }
      }
      parcels.push({ name, area, points: pts });
    }
  }

  // 5. CgPoints
  const cgPoints = [];
  for (const cgsEl of childElements(root, 'CgPoints')) {
    for (const ptEl of childElements(cgsEl, 'CgPoint')) {
      const name = ptEl.getAttribute('name') || `PT-${cgPoints.length + 1}`;
      const desc = ptEl.getAttribute('desc') || '';
      const nez = parseNez(ptEl.textContent);
      if (nez) {
        includePt(nez.e, nez.n, nez.z);
        cgPoints.push({ name, desc, ...nez });
      }
    }
  }

  if (!Number.isFinite(minE)) {
    minE = 0; maxE = 100; minN = 0; maxN = 100; minZ = 0; maxZ = 10;
  }
  if (!Number.isFinite(minZ)) {
    minZ = 0; maxZ = 10;
  }

  return {
    meta,
    surfaces,
    alignments,
    pipeNetworks,
    parcels,
    cgPoints,
    bounds: { minE, maxE, minN, maxN, minZ, maxZ },
    error: null,
  };
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(headers, rows, filename) {
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLandXmlSurfacesCsv(surfaces, cutFill = null, filename = 'landxml_surfaces.csv') {
  const headers = ['Surface', 'Points', 'Triangles', 'Min Elev', 'Max Elev', 'Mean Elev', '2D Area', '3D Area'];
  const rows = surfaces.map((s) => [
    s.name, s.pointCount, s.faceCount, s.minZ.toFixed(3), s.maxZ.toFixed(3), s.meanZ.toFixed(3), s.area2D.toFixed(2), s.area3D.toFixed(2),
  ]);
  if (cutFill) {
    rows.push([]);
    rows.push(['Cut Volume', cutFill.cutVolume.toFixed(2), 'Fill Volume', cutFill.fillVolume.toFixed(2), 'Net Volume', cutFill.netVolume.toFixed(2)]);
  }
  downloadCsv(headers, rows, filename);
}

export function exportLandXmlAlignmentsCsv(alignments, filename = 'landxml_alignments.csv') {
  downloadCsv(
    ['Alignment', 'Start Station', 'Length', 'Geometry Segments', 'Profile PVIs'],
    alignments.map((a) => [a.name, a.staStart, a.length.toFixed(3), a.segments.length, a.pvis.length]),
    filename
  );
}

export function exportLandXmlPipesCsv(pipeNetworks, filename = 'landxml_pipes.csv') {
  const rows = [];
  for (const net of pipeNetworks) {
    for (const p of net.pipes) {
      rows.push([net.name, p.name, p.refStart, p.refEnd, p.diameter, p.length.toFixed(3), p.slope.toFixed(3), p.material]);
    }
  }
  downloadCsv(['Network', 'Pipe', 'Start Struct', 'End Struct', 'Diameter', 'Length', 'Slope (%)', 'Material'], rows, filename);
}

export function exportLandXmlPointsCsv(cgPoints, filename = 'landxml_points.csv') {
  downloadCsv(
    ['Name', 'Easting', 'Northing', 'Elevation', 'Description'],
    cgPoints.map((p) => [p.name, p.e.toFixed(4), p.n.toFixed(4), p.z.toFixed(4), p.desc]),
    filename
  );
}
