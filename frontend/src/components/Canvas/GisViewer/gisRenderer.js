/**
 * gisRenderer.js
 * Hardware-accelerated Canvas2D GIS renderer with:
 * - True cosine-latitude aspect ratio projection
 * - O(1) viewport bounding-box culling for 20MB+ datasets (100k+ features)
 * - Full support for Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection
 * - Fast spatial hit-testing for click-to-select feature inspection
 */

export function createGeoProjector(viewState, canvasWidth, canvasHeight, centerLatDeg = 0) {
  const cosLat = Math.max(0.15, Math.cos((centerLatDeg * Math.PI) / 180));
  const { centerLng, centerLat, scale } = viewState; // scale = pixels per degree of latitude

  const toScreen = (lng, lat) => ({
    x: canvasWidth / 2 + (lng - centerLng) * cosLat * scale,
    y: canvasHeight / 2 - (lat - centerLat) * scale
  });

  const toWorld = (sx, sy) => ({
    lng: centerLng + (sx - canvasWidth / 2) / (cosLat * scale),
    lat: centerLat - (sy - canvasHeight / 2) / scale
  });

  return { toScreen, toWorld, cosLat };
}

export function renderGisCanvas(canvasEl, features, viewState, centerLatDeg, options) {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (canvasEl.width !== width * dpr || canvasEl.height !== height * dpr) {
    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
  }

  const ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const { isDark, selectedFeature, visibleCategories, showGrid } = options;

  // Subtle spatial grid
  if (showGrid) {
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    const step = 48;
    ctx.beginPath();
    for (let x = 0; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  if (!features || features.length === 0) return;

  const { toScreen, toWorld } = createGeoProjector(viewState, width, height, centerLatDeg);
  const topLeft = toWorld(0, 0);
  const bottomRight = toWorld(width, height);
  const viewMinLng = Math.min(topLeft.lng, bottomRight.lng);
  const viewMaxLng = Math.max(topLeft.lng, bottomRight.lng);
  const viewMinLat = Math.min(topLeft.lat, bottomRight.lat);
  const viewMaxLat = Math.max(topLeft.lat, bottomRight.lat);

  const defaultStroke = isDark ? '#34d399' : '#059669';
  const defaultFill = isDark ? 'rgba(52, 211, 153, 0.22)' : 'rgba(5, 150, 105, 0.18)';
  const selectedStroke = '#f59e0b';
  const selectedFill = 'rgba(245, 158, 11, 0.35)';

  const drawPolygonRings = (rings, isSelected) => {
    ctx.beginPath();
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      if (!ring || ring.length < 2) continue;
      const p0 = toScreen(ring[0][0], ring[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let k = 1; k < ring.length; k++) {
        const pk = toScreen(ring[k][0], ring[k][1]);
        ctx.lineTo(pk.x, pk.y);
      }
      ctx.closePath();
    }
    ctx.fillStyle = isSelected ? selectedFill : defaultFill;
    ctx.fill('evenodd');
    ctx.strokeStyle = isSelected ? selectedStroke : defaultStroke;
    ctx.lineWidth = isSelected ? 2.5 : 1.25;
    ctx.stroke();
  };

  const drawLineCoords = (coords, isSelected) => {
    if (!coords || coords.length < 2) return;
    ctx.beginPath();
    const p0 = toScreen(coords[0][0], coords[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let k = 1; k < coords.length; k++) {
      const pk = toScreen(coords[k][0], coords[k][1]);
      ctx.lineTo(pk.x, pk.y);
    }
    ctx.strokeStyle = isSelected ? selectedStroke : defaultStroke;
    ctx.lineWidth = isSelected ? 3 : 1.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const drawPointCoord = (coord, isSelected) => {
    const pt = toScreen(coord[0], coord[1]);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isSelected ? 6.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? selectedStroke : defaultStroke;
    ctx.fill();
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      ctx.strokeStyle = selectedStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  const drawGeometry = (geom, isSelected) => {
    if (!geom) return;
    const t = geom.type;
    if (t === 'Point') {
      drawPointCoord(geom.coordinates, isSelected);
    } else if (t === 'MultiPoint') {
      for (let i = 0; i < geom.coordinates.length; i++) drawPointCoord(geom.coordinates[i], isSelected);
    } else if (t === 'LineString') {
      drawLineCoords(geom.coordinates, isSelected);
    } else if (t === 'MultiLineString') {
      for (let i = 0; i < geom.coordinates.length; i++) drawLineCoords(geom.coordinates[i], isSelected);
    } else if (t === 'Polygon') {
      drawPolygonRings(geom.coordinates, isSelected);
    } else if (t === 'MultiPolygon') {
      for (let i = 0; i < geom.coordinates.length; i++) drawPolygonRings(geom.coordinates[i], isSelected);
    } else if (t === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (let i = 0; i < geom.geometries.length; i++) drawGeometry(geom.geometries[i], isSelected);
    }
  };

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (visibleCategories && !visibleCategories.has(f.category)) continue;

    // O(1) Viewport bounding-box culling
    const b = f.bbox;
    if (b[2] < viewMinLng || b[0] > viewMaxLng || b[3] < viewMinLat || b[1] > viewMaxLat) {
      continue;
    }

    const isSelected = selectedFeature && selectedFeature.id === f.id;
    drawGeometry(f.geometry, isSelected);
  }
}

/**
 * Spatial hit-testing on click using bounding-box pre-filter
 */
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2;
}

export function hitTestGisFeature(sx, sy, canvasEl, features, viewState, centerLatDeg, visibleCategories) {
  if (!canvasEl || !features || features.length === 0) return null;
  const rect = canvasEl.getBoundingClientRect();
  const { toScreen, toWorld } = createGeoProjector(viewState, rect.width, rect.height, centerLatDeg);
  const w = toWorld(sx, sy);

  // Tolerance in degrees (~10 pixels)
  const tolWorld = 10 / Math.max(1e-6, viewState.scale);
  const tolPxSq = 100; // 10px radius squared

  const matchesGeometry = (geom) => {
    if (!geom) return false;
    const t = geom.type;
    if (t === 'Point') {
      const pt = toScreen(geom.coordinates[0], geom.coordinates[1]);
      return (pt.x - sx) ** 2 + (pt.y - sy) ** 2 <= tolPxSq;
    }
    if (t === 'MultiPoint') {
      return geom.coordinates.some((c) => {
        const pt = toScreen(c[0], c[1]);
        return (pt.x - sx) ** 2 + (pt.y - sy) ** 2 <= tolPxSq;
      });
    }
    if (t === 'LineString') {
      for (let i = 0; i < geom.coordinates.length - 1; i++) {
        const p1 = toScreen(geom.coordinates[i][0], geom.coordinates[i][1]);
        const p2 = toScreen(geom.coordinates[i + 1][0], geom.coordinates[i + 1][1]);
        if (distToSegmentSq(sx, sy, p1.x, p1.y, p2.x, p2.y) <= tolPxSq) return true;
      }
      return false;
    }
    if (t === 'MultiLineString') {
      return geom.coordinates.some((line) => {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = toScreen(line[i][0], line[i][1]);
          const p2 = toScreen(line[i + 1][0], line[i + 1][1]);
          if (distToSegmentSq(sx, sy, p1.x, p1.y, p2.x, p2.y) <= tolPxSq) return true;
        }
        return false;
      });
    }
    if (t === 'Polygon') {
      return geom.coordinates.length > 0 && pointInRing(w.lng, w.lat, geom.coordinates[0]);
    }
    if (t === 'MultiPolygon') {
      return geom.coordinates.some((poly) => poly.length > 0 && pointInRing(w.lng, w.lat, poly[0]));
    }
    if (t === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      return geom.geometries.some(matchesGeometry);
    }
    return false;
  };

  // Search top-down (points/lines checked first via reverse order or priority)
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    if (visibleCategories && !visibleCategories.has(f.category)) continue;
    const b = f.bbox;
    if (w.lng < b[0] - tolWorld || w.lng > b[2] + tolWorld || w.lat < b[1] - tolWorld || w.lat > b[3] + tolWorld) {
      continue;
    }
    if (matchesGeometry(f.geometry)) {
      return f;
    }
  }
  return null;
}
