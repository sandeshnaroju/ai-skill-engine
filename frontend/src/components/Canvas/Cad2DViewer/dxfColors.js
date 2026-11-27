/**
 * dxfColors.js
 * Complete AutoCAD Color Index (ACI 1-255) palette, 24-bit TrueColor (group code 420) resolver,
 * and theme-aware perceptual contrast adaptation for Light/White & Dark backgrounds.
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

// ── Theme-Adaptive Perceptual Contrast Helper ────────────────────────────────

const THEME_COLOR_CACHE = new Map();

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function parseColorRgb(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }
  const hslMatch = trimmed.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (hslMatch) {
    return hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]) / 100, parseFloat(hslMatch[3]) / 100);
  }
  return null;
}

function relativeLuminance(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    Math.max(0, Math.min(255, r)).toString(16).padStart(2, '0') +
    Math.max(0, Math.min(255, g)).toString(16).padStart(2, '0') +
    Math.max(0, Math.min(255, b)).toString(16).padStart(2, '0')
  );
}

/**
 * Adapt any DXF color (ACI, TrueColor, HSL) so it maintains legible contrast
 * on both White/Light (#f8fafc) and AutoCAD Night/Dark (#0b0f17) backgrounds.
 * Preserves hue while darkening light/yellow/cyan/pastel colors on white backgrounds.
 */
export function adaptColorForTheme(colorStr, isDark) {
  if (!colorStr) return isDark ? '#e2e8f0' : '#0f172a';
  const cacheKey = `${isDark ? 'D' : 'L'}:${colorStr}`;
  const cached = THEME_COLOR_CACHE.get(cacheKey);
  if (cached) return cached;

  const rgb = parseColorRgb(colorStr);
  if (!rgb || rgb.some(Number.isNaN)) {
    return colorStr;
  }

  const [r, g, b] = rgb;
  const lum = relativeLuminance(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);

  let out = colorStr;

  if (!isDark) {
    // Light / White background (#f8fafc, lum ~0.96)
    if (s < 0.08 && l >= 0.9) {
      // Pure white / ACI 7 / ACI 255 -> crisp dark slate
      out = '#0f172a';
    } else if (lum > 0.22) {
      // Darken yellow, cyan, light green, light gray, and bright pastels until lum <= 0.20
      const targetSat = s < 0.08 ? s : Math.min(1, s * 1.08);
      let lo = 0.08;
      let hi = l;
      for (let iter = 0; iter < 7; iter++) {
        const mid = (lo + hi) * 0.5;
        const [tr, tg, tb] = hslToRgb(h, targetSat, mid);
        if (relativeLuminance(tr, tg, tb) > 0.2) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      const [fr, fg, fb] = hslToRgb(h, targetSat, lo);
      out = rgbToHex(fr, fg, fb);
    } else {
      out = rgbToHex(r, g, b);
    }
  } else {
    // Dark background (#0b0f17, lum ~0.007)
    if (s < 0.08 && l <= 0.08) {
      out = '#f8fafc';
    } else if (lum < 0.1) {
      // Brighten very dark colors (ACI 250 or 22%-lightness shades) so they stay visible
      let lo = l;
      let hi = 0.85;
      for (let iter = 0; iter < 7; iter++) {
        const mid = (lo + hi) * 0.5;
        const [tr, tg, tb] = hslToRgb(h, s, mid);
        if (relativeLuminance(tr, tg, tb) < 0.12) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const [fr, fg, fb] = hslToRgb(h, s, hi);
      out = rgbToHex(fr, fg, fb);
    } else {
      out = rgbToHex(r, g, b);
    }
  }

  THEME_COLOR_CACHE.set(cacheKey, out);
  return out;
}
