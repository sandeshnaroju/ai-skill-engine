/**
 * dxfColors.js
 * Complete AutoCAD Color Index (ACI 1-255) palette and 24-bit TrueColor (group code 420) resolver.
 */

// Standard ACI 1-9 primary colors
const ACI_PRIMARY = {
  1: '#ef4444', // Red
  2: '#eab308', // Yellow
  3: '#22c55e', // Green
  4: '#06b6d4', // Cyan
  5: '#3b82f6', // Blue
  6: '#ec4899', // Magenta
  7: '#f8fafc', // White / Black (theme adaptive)
  8: '#64748b', // Dark Gray
  9: '#94a3b8', // Light Gray
};

// ACI 250-255 grayscale ramp
const ACI_GRAYS = {
  250: '#333333',
  251: '#505050',
  252: '#696969',
  253: '#828282',
  254: '#bebebe',
  255: '#ffffff',
};

// Generate standard 240-color AutoCAD hue/saturation/value table (ACI 10..249)
const ACI_EXTENDED = {};
(function buildExtendedAci() {
  // 24 base hues x 10 shades (5 lightness levels x 2 saturation levels)
  for (let i = 10; i <= 249; i++) {
    const idx = i - 10;
    const hueStep = Math.floor(idx / 10); // 0..23
    const shadeIdx = idx % 10; // 0..9
    const hue = (hueStep * 15) % 360;
    const isMuted = shadeIdx % 2 === 1;
    const level = Math.floor(shadeIdx / 2); // 0 (brightest) .. 4 (darkest)
    const sat = isMuted ? 50 : 95;
    const lightMap = [52, 68, 42, 32, 22];
    const light = lightMap[level] || 50;
    ACI_EXTENDED[i] = `hsl(${hue}, ${sat}%, ${light}%)`;
  }
})();

/**
 * Resolve an AutoCAD Color Index (1-255) to a CSS hex/hsl color string.
 */
export function resolveAciColor(aciRaw) {
  if (aciRaw === undefined || aciRaw === null || aciRaw === '') return null;
  const aci = Math.abs(parseInt(aciRaw, 10));
  if (isNaN(aci) || aci === 0 || aci === 256) return null; // 0 = BYBLOCK, 256 = BYLAYER
  if (ACI_PRIMARY[aci]) return ACI_PRIMARY[aci];
  if (ACI_GRAYS[aci]) return ACI_GRAYS[aci];
  if (ACI_EXTENDED[aci]) return ACI_EXTENDED[aci];
  return '#38bdf8';
}

/**
 * Resolve a 24-bit TrueColor integer (DXF group code 420) to a CSS #RRGGBB string.
 */
export function resolveTrueColor(code420) {
  if (code420 === undefined || code420 === null || code420 === '') return null;
  const num = parseInt(code420, 10);
  if (isNaN(num)) return null;
  const hex = (num & 0xffffff).toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Resolve final entity color using TrueColor -> Entity ACI -> Layer Color -> Default fallback.
 */
export function resolveEntityColor(trueColorRaw, aciRaw, layerColor = '#38bdf8') {
  const tc = resolveTrueColor(trueColorRaw);
  if (tc) return tc;
  const aci = resolveAciColor(aciRaw);
  if (aci) return aci;
  return layerColor || '#38bdf8';
}
