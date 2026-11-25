/**
 * gisParser.js
 * High-performance asynchronous GIS parser for 20MB+ spatial datasets.
 * Supports:
 * - GeoJSON (Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection)
 * - KML (Point, LineString, Polygon with outer/inner rings, MultiGeometry, ExtendedData/SimpleData)
 * - Binary ESRI Shapefile (.shp) via DataView (Types 1, 3, 5, 11, 13, 15)
 *
 * Pre-computes per-feature bounding boxes [minLng, minLat, maxLng, maxLat] for O(1) viewport culling.
 */

function computeFeatureBbox(geometry) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const scanCoords = (c) => {
    if (!c) return;
    if (typeof c[0] === 'number') {
      const lng = c[0];
      const lat = c[1];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    } else if (Array.isArray(c)) {
      for (let i = 0; i < c.length; i++) {
        scanCoords(c[i]);
      }
    }
  };

  if (geometry) {
    if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach((g) => {
        if (g.coordinates) scanCoords(g.coordinates);
      });
    } else if (geometry.coordinates) {
      scanCoords(geometry.coordinates);
    }
  }

  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function parseKmlCoordString(coordStr) {
  if (!coordStr) return [];
  const tokens = coordStr.trim().split(/\s+/);
  const pts = [];
  for (let i = 0; i < tokens.length; i++) {
    const parts = tokens[i].split(',');
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      pts.push([lng, lat]);
    }
  }
  return pts;
}

async function parseKmlAsync(kmlText, onProgress) {
  const features = [];
  let pos = 0;
  const len = kmlText.length;
  let count = 0;

  while (pos < len) {
    const start = kmlText.indexOf('<Placemark', pos);
    if (start === -1) break;
    const end = kmlText.indexOf('</Placemark>', start);
    if (end === -1) break;

    const pm = kmlText.slice(start, end + 12);
    pos = end + 12;

    const nameMatch = pm.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
    const name = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : `Placemark ${count + 1}`;
    const props = { name };

    // Extract ExtendedData / SimpleData attributes
    const dataRegex = /<(?:Data|SimpleData)\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:Data|SimpleData)>/gi;
    let dm;
    while ((dm = dataRegex.exec(pm)) !== null) {
      const valMatch = dm[2].match(/<value[^>]*>([\s\S]*?)<\/value>/i);
      props[dm[1]] = (valMatch ? valMatch[1] : dm[2]).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    }

    const geometries = [];

    // Polygons
    const polyRegex = /<Polygon[\s\S]*?<\/Polygon>/gi;
    let polyMatch;
    while ((polyMatch = polyRegex.exec(pm)) !== null) {
      const polyBlock = polyMatch[0];
      const rings = [];
      const outerMatch = polyBlock.match(/<outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>/i);
      if (outerMatch) {
        const ring = parseKmlCoordString(outerMatch[1]);
        if (ring.length >= 3) rings.push(ring);
      }
      const innerRegex = /<innerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/innerBoundaryIs>/gi;
      let innerM;
      while ((innerM = innerRegex.exec(polyBlock)) !== null) {
        const ring = parseKmlCoordString(innerM[1]);
        if (ring.length >= 3) rings.push(ring);
      }
      if (rings.length > 0) {
        geometries.push({ type: 'Polygon', coordinates: rings });
      }
    }

    // LineStrings (outside Polygons)
    const strippedPoly = pm.replace(/<Polygon[\s\S]*?<\/Polygon>/gi, '');
    const lineRegex = /<LineString[\s\S]*?<\/LineString>/gi;
    let lineMatch;
    while ((lineMatch = lineRegex.exec(strippedPoly)) !== null) {
      const cMatch = lineMatch[0].match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (cMatch) {
        const pts = parseKmlCoordString(cMatch[1]);
        if (pts.length >= 2) geometries.push({ type: 'LineString', coordinates: pts });
      }
    }

    // Points
    const pointRegex = /<Point[\s\S]*?<\/Point>/gi;
    let ptMatch;
    while ((ptMatch = pointRegex.exec(strippedPoly)) !== null) {
      const cMatch = ptMatch[0].match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (cMatch) {
        const pts = parseKmlCoordString(cMatch[1]);
        if (pts.length >= 1) geometries.push({ type: 'Point', coordinates: pts[0] });
      }
    }

    if (geometries.length === 1) {
      features.push({ type: 'Feature', geometry: geometries[0], properties: props });
    } else if (geometries.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'GeometryCollection', geometries }, properties: props });
    }

    count += 1;
    if (count % 2000 === 0) {
      if (onProgress) onProgress({ percent: Math.round((pos / len) * 85), stage: 'Parsing KML Placemarks', count });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Pure-JS Binary ESRI Shapefile (.shp) DataView Parser
 * Supports Point (1/11), PolyLine (3/13), Polygon (5/15)
 */
async function parseShpAsync(content, onProgress) {
  let buffer = null;
  if (content instanceof ArrayBuffer) {
    buffer = content;
  } else if (typeof content === 'string') {
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xff;
    buffer = bytes.buffer;
  }

  if (!buffer || buffer.byteLength < 100) {
    return { type: 'FeatureCollection', features: [] };
  }

  const view = new DataView(buffer);
  const fileCode = view.getInt32(0, false); // Big-endian magic 9994
  if (fileCode !== 9994) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = [];
  let offset = 100;
  let count = 0;

  while (offset + 8 <= buffer.byteLength) {
    const recordNum = view.getInt32(offset, false);
    const contentLenWords = view.getInt32(offset + 4, false);
    const recStart = offset + 8;
    const recEnd = recStart + contentLenWords * 2;
    if (recEnd > buffer.byteLength || contentLenWords < 2) break;

    const shapeType = view.getInt32(recStart, true);
    if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      const x = view.getFloat64(recStart + 4, true);
      const y = view.getFloat64(recStart + 12, true);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [x, y] },
        properties: { recordId: recordNum, shapeType: 'Point' }
      });
    } else if (shapeType === 3 || shapeType === 5 || shapeType === 13 || shapeType === 15) {
      const numParts = view.getInt32(recStart + 36, true);
      const numPoints = view.getInt32(recStart + 40, true);
      const partsOffset = recStart + 44;
      const pointsOffset = partsOffset + numParts * 4;

      if (pointsOffset + numPoints * 16 <= recEnd) {
        const partIndices = [];
        for (let p = 0; p < numParts; p++) {
          partIndices.push(view.getInt32(partsOffset + p * 4, true));
        }
        const rings = [];
        for (let p = 0; p < numParts; p++) {
          const startIdx = partIndices[p];
          const endIdx = p + 1 < numParts ? partIndices[p + 1] : numPoints;
          const ring = [];
          for (let k = startIdx; k < endIdx; k++) {
            const ptOff = pointsOffset + k * 16;
            ring.push([view.getFloat64(ptOff, true), view.getFloat64(ptOff + 8, true)]);
          }
          if (ring.length > 0) rings.push(ring);
        }

        const isPoly = shapeType === 5 || shapeType === 15;
        if (rings.length === 1) {
          features.push({
            type: 'Feature',
            geometry: { type: isPoly ? 'Polygon' : 'LineString', coordinates: isPoly ? [rings[0]] : rings[0] },
            properties: { recordId: recordNum, shapeType: isPoly ? 'Polygon' : 'PolyLine' }
          });
        } else if (rings.length > 1) {
          features.push({
            type: 'Feature',
            geometry: { type: isPoly ? 'MultiPolygon' : 'MultiLineString', coordinates: isPoly ? rings.map((r) => [r]) : rings },
            properties: { recordId: recordNum, shapeType: isPoly ? 'MultiPolygon' : 'MultiLineString' }
          });
        }
      }
    }

    offset = recEnd;
    count += 1;
    if (count % 3000 === 0) {
      if (onProgress) onProgress({ percent: Math.round((offset / buffer.byteLength) * 85), stage: 'Decoding Binary Shapefile', count });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Unified async GIS parser with bounding-box pre-indexing
 */
export async function parseGeoDataAsync(rawContent, filename = '', onProgress) {
  let fc = { type: 'FeatureCollection', features: [] };

  if (!rawContent) {
    return { features: [], bounds: { minLng: -122.5, maxLng: -122.3, minLat: 37.7, maxLat: 37.9 }, counts: { point: 0, line: 0, polygon: 0 } };
  }

  const fn = (filename || '').toLowerCase();

  if (typeof rawContent === 'object' && !(rawContent instanceof ArrayBuffer)) {
    fc = rawContent;
  } else if (fn.endsWith('.shp') || (rawContent instanceof ArrayBuffer)) {
    fc = await parseShpAsync(rawContent, onProgress);
  } else if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      if (onProgress) onProgress({ percent: 25, stage: 'Parsing GeoJSON', count: 0 });
      await new Promise((r) => setTimeout(r, 0));
      const parsed = JSON.parse(trimmed);
      if (parsed.type === 'FeatureCollection') fc = parsed;
      else if (parsed.type === 'Feature') fc = { type: 'FeatureCollection', features: [parsed] };
      else if (parsed.geometry) fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: parsed.geometry, properties: {} }] };
    } else if (trimmed.includes('<kml') || trimmed.includes('<Placemark')) {
      fc = await parseKmlAsync(rawContent, onProgress);
    } else {
      // Try binary SHP fallback if string contains raw SHP bytes
      fc = await parseShpAsync(rawContent, onProgress);
    }
  }

  const rawFeatures = Array.isArray(fc.features) ? fc.features : [];
  const indexedFeatures = [];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const counts = { point: 0, line: 0, polygon: 0 };

  for (let i = 0; i < rawFeatures.length; i++) {
    const f = rawFeatures[i];
    if (!f || !f.geometry) continue;

    const bbox = computeFeatureBbox(f.geometry);
    if (!bbox) continue;

    if (bbox[0] < minLng) minLng = bbox[0];
    if (bbox[1] < minLat) minLat = bbox[1];
    if (bbox[2] > maxLng) maxLng = bbox[2];
    if (bbox[3] > maxLat) maxLat = bbox[3];

    const gt = f.geometry.type;
    let category = 'point';
    if (gt === 'LineString' || gt === 'MultiLineString') {
      category = 'line';
      counts.line += 1;
    } else if (gt === 'Polygon' || gt === 'MultiPolygon') {
      category = 'polygon';
      counts.polygon += 1;
    } else if (gt === 'GeometryCollection') {
      category = 'polygon';
      counts.polygon += 1;
    } else {
      counts.point += 1;
    }

    indexedFeatures.push({
      id: i,
      geometry: f.geometry,
      properties: f.properties || {},
      bbox,
      category
    });

    if (i > 0 && i % 8000 === 0) {
      if (onProgress) {
        onProgress({
          percent: 85 + Math.round((i / rawFeatures.length) * 15),
          stage: 'Indexing Spatial Bounds',
          count: i
        });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (minLng === Infinity) {
    minLng = -122.5;
    maxLng = -122.3;
    minLat = 37.7;
    maxLat = 37.9;
  }

  if (onProgress) onProgress({ percent: 100, stage: 'Complete', count: indexedFeatures.length });

  return {
    features: indexedFeatures,
    bounds: { minLng, maxLng, minLat, maxLat },
    counts
  };
}
