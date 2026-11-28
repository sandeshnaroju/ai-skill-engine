/**
 * pointCloudParser.js
 * Loads .ply (via Three.js PLYLoader) and .las / .laz (via backend-normalized subsampled payload
 * or pure-JS DataView fallback), computes centered Three.js buffers, ASPRS classification
 * palettes, elevation/intensity color ramps, and CSV summary export.
 */
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader';

export const ASPRS_CLASS_INFO = {
  0: { name: 'Never Classified', hex: '#94a3b8', rgb: [0.58, 0.64, 0.72] },
  1: { name: 'Unclassified', hex: '#64748b', rgb: [0.39, 0.45, 0.55] },
  2: { name: 'Ground', hex: '#a16207', rgb: [0.63, 0.38, 0.03] },
  3: { name: 'Low Vegetation', hex: '#84cc16', rgb: [0.52, 0.8, 0.09] },
  4: { name: 'Medium Vegetation', hex: '#22c55e', rgb: [0.13, 0.77, 0.37] },
  5: { name: 'High Vegetation', hex: '#15803d', rgb: [0.08, 0.5, 0.24] },
  6: { name: 'Building', hex: '#ef4444', rgb: [0.94, 0.27, 0.27] },
  7: { name: 'Low Point (Noise)', hex: '#ec4899', rgb: [0.93, 0.28, 0.6] },
  8: { name: 'Model Key-point', hex: '#f59e0b', rgb: [0.96, 0.62, 0.04] },
  9: { name: 'Water', hex: '#3b82f6', rgb: [0.23, 0.51, 0.96] },
  10: { name: 'Rail', hex: '#a855f7', rgb: [0.66, 0.33, 0.97] },
  11: { name: 'Road Surface', hex: '#475569', rgb: [0.28, 0.33, 0.41] },
  12: { name: 'Overlap Points', hex: '#06b6d4', rgb: [0.02, 0.71, 0.83] },
  13: { name: 'Wire - Guard', hex: '#eab308', rgb: [0.92, 0.7, 0.03] },
  14: { name: 'Wire - Conductor', hex: '#f97316', rgb: [0.98, 0.45, 0.09] },
  15: { name: 'Transmission Tower', hex: '#8b5cf6', rgb: [0.55, 0.36, 0.96] },
  17: { name: 'Bridge Deck', hex: '#14b8a6', rgb: [0.08, 0.72, 0.65] },
  18: { name: 'High Noise', hex: '#f43f5e', rgb: [0.96, 0.25, 0.37] },
};

export function getAsprsClassInfo(code) {
  return ASPRS_CLASS_INFO[code] || { name: `Class ${code}`, hex: '#64748b', rgb: [0.39, 0.45, 0.55] };
}

function elevationRampRgb(t) {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) {
    const k = c / 0.25;
    return [0.1, 0.25 + 0.65 * k, 0.95];
  }
  if (c < 0.5) {
    const k = (c - 0.25) / 0.25;
    return [0.1 + 0.1 * k, 0.9, 0.95 - 0.75 * k];
  }
  if (c < 0.75) {
    const k = (c - 0.5) / 0.25;
    return [0.2 + 0.78 * k, 0.9 - 0.05 * k, 0.2 - 0.15 * k];
  }
  const k = (c - 0.75) / 0.25;
  return [0.98, 0.85 - 0.7 * k, 0.05];
}

function normalizeAndCenterFromArrays(rawPositions, rawColors, intensities, classifications, meta = {}) {
  const count = Math.floor(rawPositions.length / 3);
  if (count === 0) {
    return {
      ...meta,
      count: 0,
      positions: new Float32Array(0),
      rgbColors: null,
      intensities: null,
      classifications: null,
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
      centeredBounds: { minY: -0.5, maxY: 0.5, radius: 1 },
    };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < count; i++) {
    const x = rawPositions[i * 3];
    const y = rawPositions[i * 3 + 1];
    const z = rawPositions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  // Map (X, Y, Z) -> Three.js (X - cx, Z - cz, -(Y - cy)) so LiDAR Z elevation is +Y up
  const positions = new Float32Array(count * 3);
  let cMinY = Infinity, cMaxY = -Infinity;

  for (let i = 0; i < count; i++) {
    const px = rawPositions[i * 3] - cx;
    const py = rawPositions[i * 3 + 2] - cz;
    const pz = -(rawPositions[i * 3 + 1] - cy);
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
    if (py < cMinY) cMinY = py;
    if (py > cMaxY) cMaxY = py;
  }

  let rgbColors = null;
  if (rawColors && rawColors.length === count * 3) {
    rgbColors = new Float32Array(count * 3);
    const needsNorm = rawColors[0] > 1.0 || rawColors[1] > 1.0 || rawColors[2] > 1.0;
    const div = needsNorm ? 255.0 : 1.0;
    for (let i = 0; i < count * 3; i++) {
      rgbColors[i] = rawColors[i] / div;
    }
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const radius = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2);

  return {
    ...meta,
    count,
    positions,
    rgbColors,
    intensities: intensities && intensities.length === count ? new Float32Array(intensities) : null,
    classifications: classifications && classifications.length === count ? new Uint8Array(classifications) : null,
    bounds: meta.bounds || { minX, maxX, minY, maxY, minZ, maxZ },
    centeredBounds: { minY: cMinY, maxY: cMaxY, radius },
  };
}

export async function loadPointCloudData({ fullContent, mediaUrl, filename = 'scan.ply' }) {
  const isPly = /\.ply$/i.test(filename);
  let metaJson = null;

  if (fullContent && typeof fullContent === 'string' && fullContent.trim().startsWith('{')) {
    try {
      metaJson = JSON.parse(fullContent);
    } catch {
      metaJson = null;
    }
  }

  // 1. PLY via Three.js PLYLoader (ASCII or Binary)
  if (isPly || (fullContent && fullContent.trim().startsWith('ply'))) {
    const loader = new PLYLoader();
    let geometry = null;

    if (fullContent && fullContent.trim().startsWith('ply')) {
      geometry = loader.parse(fullContent);
    } else if (mediaUrl) {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(mediaUrl, { headers });
      if (!resp.ok) throw new Error(`Failed to fetch PLY file (${resp.status})`);
      const buf = await resp.arrayBuffer();
      geometry = loader.parse(buf);
    }

    if (!geometry || !geometry.attributes?.position) {
      throw new Error('PLY file contains no vertex positions.');
    }

    const posArr = geometry.attributes.position.array;
    const colArr = geometry.attributes.color ? geometry.attributes.color.array : null;
    const count = geometry.attributes.position.count;

    return normalizeAndCenterFromArrays(posArr, colArr, null, null, {
      sourceExt: '.ply',
      filename,
      totalPoints: metaJson?.totalPoints || count,
      renderedPoints: count,
      hasColor: Boolean(colArr),
      classificationCounts: {},
    });
  }

  // 2. LAS / LAZ from backend-normalized JSON payload
  if (metaJson && Array.isArray(metaJson.positions)) {
    return normalizeAndCenterFromArrays(
      metaJson.positions,
      metaJson.colors,
      metaJson.intensities,
      metaJson.classifications,
      {
        sourceExt: metaJson.sourceExt || '.las',
        filename: metaJson.filename || filename,
        lasVersion: metaJson.lasVersion || '',
        pointFormat: metaJson.pointFormat,
        totalPoints: metaJson.totalPoints || metaJson.positions.length / 3,
        renderedPoints: metaJson.renderedPoints || metaJson.positions.length / 3,
        hasColor: Boolean(metaJson.hasColor),
        bounds: metaJson.bounds,
        classificationCounts: metaJson.classificationCounts || {},
      }
    );
  }

  throw new Error('Unsupported or empty point cloud payload.');
}

export function buildPointCloudColors(data, mode = 'elevation', hiddenClasses = new Set()) {
  const { count, positions, rgbColors, intensities, classifications, centeredBounds } = data;
  const out = new Float32Array(count * 3);
  const minY = centeredBounds.minY;
  const spanY = Math.max(0.0001, centeredBounds.maxY - minY);

  for (let i = 0; i < count; i++) {
    let r = 0.6, g = 0.7, b = 0.85;

    if (mode === 'rgb' && rgbColors) {
      r = rgbColors[i * 3];
      g = rgbColors[i * 3 + 1];
      b = rgbColors[i * 3 + 2];
    } else if (mode === 'intensity' && intensities) {
      const v = Math.max(0.08, Math.min(1, intensities[i]));
      r = v;
      g = v;
      b = v;
    } else if (mode === 'classification' && classifications) {
      const cls = classifications[i];
      if (hiddenClasses.has(cls)) {
        r = 0.05;
        g = 0.05;
        b = 0.05;
      } else {
        const info = getAsprsClassInfo(cls);
        [r, g, b] = info.rgb;
      }
    } else {
      const t = (positions[i * 3 + 1] - minY) / spanY;
      [r, g, b] = elevationRampRgb(t);
    }

    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }

  return out;
}

export function exportPointCloudStatsCsv(data, filename = 'point_cloud_summary.csv') {
  const rows = [
    ['Metric', 'Value'],
    ['Filename', data.filename || ''],
    ['Format', data.sourceExt || ''],
    ['Total Points', data.totalPoints ?? data.count],
    ['Rendered Points', data.count],
    ['Min X', data.bounds?.minX ?? ''],
    ['Max X', data.bounds?.maxX ?? ''],
    ['Min Y', data.bounds?.minY ?? ''],
    ['Max Y', data.bounds?.maxY ?? ''],
    ['Min Z', data.bounds?.minZ ?? ''],
    ['Max Z', data.bounds?.maxZ ?? ''],
    ['', ''],
    ['ASPRS Class ID', 'Class Name', 'Sampled Point Count'],
  ];

  for (const [k, v] of Object.entries(data.classificationCounts || {})) {
    const info = getAsprsClassInfo(Number(k));
    rows.push([k, info.name, v]);
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
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
