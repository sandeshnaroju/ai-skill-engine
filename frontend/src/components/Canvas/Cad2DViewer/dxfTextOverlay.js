/**
 * dxfTextOverlay.js
 * GPU-safe synchronized 2D Canvas text renderer for TEXT, MTEXT, and ATTRIB entities.
 *
 * Eliminates the WebGL texture exhaustion caused by creating thousands of THREE.CanvasTexture sprites.
 * Uses camera frustum culling and sub-pixel LOD filtering for 60 FPS pan/zoom on 20MB+ drawings.
 */

function cleanAutoCadText(raw) {
  if (!raw) return '';
  return raw
    .replace(/\{\\f[^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\[A-Za-z0-9]+;?/g, '')
    .replace(/%%c/gi, '∅')
    .replace(/%%d/gi, '°')
    .replace(/%%p/gi, '±')
    .replace(/%%[A-Za-z0-9]/g, '')
    .replace(/\\P/g, '\n')
    .trim();
}

export function renderDxfTextOverlay(canvasEl, textEntities, camera, activeLayerNames, isDark) {
  if (!canvasEl || !camera) return;

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

  if (!textEntities || textEntities.length === 0) return;

  const viewW = camera.right - camera.left;
  const viewH = camera.top - camera.bottom;
  if (viewW <= 0 || viewH <= 0) return;

  const worldLeft = camera.position.x + camera.left;
  const worldRight = camera.position.x + camera.right;
  const worldBottom = camera.position.y + camera.bottom;
  const worldTop = camera.position.y + camera.top;

  const pxPerUnitX = width / viewW;
  const pxPerUnitY = height / viewH;

  // Margin in world units so labels near edges don't pop abruptly
  const marginX = viewW * 0.15;
  const marginY = viewH * 0.15;

  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';

  const defaultColor = isDark ? '#f8fafc' : '#0f172a';
  let drawnCount = 0;
  const maxLabelsPerFrame = 2500; // Safety cap when zoomed all the way out on massive plans

  for (let i = 0; i < textEntities.length; i++) {
    const ent = textEntities[i];
    if (activeLayerNames && !activeLayerNames.has(ent.layer || '0')) continue;

    const wx = ent.x ?? 0;
    const wy = ent.y ?? 0;

    // 1. O(1) Frustum culling
    if (
      wx < worldLeft - marginX ||
      wx > worldRight + marginX ||
      wy < worldBottom - marginY ||
      wy > worldTop + marginY
    ) {
      continue;
    }

    // 2. LOD sub-pixel culling
    const textH = ent.textHeight && ent.textHeight > 0 ? ent.textHeight : 8;
    const pxHeight = textH * pxPerUnitY;
    if (pxHeight < 3.0) continue; // Too tiny to read at current zoom

    const clean = cleanAutoCadText(ent.text);
    if (!clean) continue;

    // 3. Project world -> screen pixels
    const sx = (wx - worldLeft) * pxPerUnitX;
    const sy = (worldTop - wy) * pxPerUnitY;

    let color = ent.color || defaultColor;
    if (!isDark && (color === '#ffffff' || color === '#f8fafc')) {
      color = '#0f172a';
    } else if (isDark && (color === '#000000' || color === '#0f172a')) {
      color = '#f8fafc';
    }

    const fontPx = Math.min(72, Math.max(8, pxHeight));
    ctx.font = `500 ${fontPx.toFixed(1)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = color;

    const lines = clean.split('\n');
    const rotRad = ent.rotation ? (-ent.rotation * Math.PI) / 180 : 0;

    ctx.save();
    ctx.translate(sx, sy);
    if (rotRad !== 0) ctx.rotate(rotRad);

    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], 0, l * fontPx * 1.25);
    }
    ctx.restore();

    drawnCount += 1;
    if (drawnCount >= maxLabelsPerFrame) break;
  }
}
