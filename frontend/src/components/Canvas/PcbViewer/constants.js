/**
 * Solder Mask Color Themes and Layer Constants
 */
export const SOLDER_MASK_THEMES = {
  green: { name: 'Classic Green', bg: '#081c10', mask: '#14452f', copper: '#b87333', pad: '#f59e0b', silk: '#f8fafc', core: '#05120a' },
  cad_dark: { name: 'EDA CAD Dark (High Contrast)', bg: '#060813', mask: '#060813', copper: '#ef4444', pad: '#ef4444', silk: '#fef08a', core: '#000000' },
  black: { name: 'Matte Black', bg: '#09090b', mask: '#18181b', copper: '#d97706', pad: '#fbbf24', silk: '#f4f4f5', core: '#050505' },
  blue: { name: 'Royal Blue', bg: '#082f49', mask: '#0369a1', copper: '#f59e0b', pad: '#fef08a', silk: '#ffffff', core: '#041c2c' },
  purple: { name: 'OSH Park Purple', bg: '#2e1065', mask: '#581c87', copper: '#fbbf24', pad: '#fde047', silk: '#faf5ff', core: '#1e0845' },
  red: { name: 'Ferrari Red', bg: '#450a0a', mask: '#991b1b', copper: '#fbbf24', pad: '#fef08a', silk: '#ffffff', core: '#2b0606' },
  white: { name: 'Glossy White', bg: '#f1f5f9', mask: '#e2e8f0', copper: '#b45309', pad: '#d97706', silk: '#0f172a', core: '#cbd5e1' }
};

export const DEFAULT_PCB_FALLBACK = {
  version: '1.0',
  title: 'STM32 MCU System Board',
  board: {
    width: 50.0,
    height: 50.0,
    corner_radius: 3.5,
    layers: 2,
    solder_mask_color: 'green',
    silkscreen_color: 'yellow',
    units: 'mm',
    thickness: 1.6
  },
  rules: {
    min_trace_width: 0.254,
    min_clearance: 0.2,
    via_drill: 0.3,
    via_diameter: 0.6
  },
  components: [
    // 4 Corner Mounting Holes (Cyan Plated)
    { ref: 'MH1', package: 'MOUNTING_HOLE', position: { x: 3.5, y: 3.5, rotation: 0 }, pads: [{ num: '1', net: 'GND', x: 3.5, y: 3.5, w: 3.2, h: 3.2 }] },
    { ref: 'MH2', package: 'MOUNTING_HOLE', position: { x: 46.5, y: 3.5, rotation: 0 }, pads: [{ num: '1', net: 'GND', x: 46.5, y: 3.5, w: 3.2, h: 3.2 }] },
    { ref: 'MH3', package: 'MOUNTING_HOLE', position: { x: 3.5, y: 46.5, rotation: 0 }, pads: [{ num: '1', net: 'GND', x: 3.5, y: 46.5, w: 3.2, h: 3.2 }] },
    { ref: 'MH4', package: 'MOUNTING_HOLE', position: { x: 46.5, y: 46.5, rotation: 0 }, pads: [{ num: '1', net: 'GND', x: 46.5, y: 46.5, w: 3.2, h: 3.2 }] },

    // Central MCU: U1 (QFP-32)
    {
      ref: 'U1',
      value: 'STM32F103C8T6',
      package: 'LQFP-32',
      position: { x: 32.5, y: 28.0, rotation: 0 },
      pads: Array.from({ length: 32 }).map((_, i) => ({
        num: `${i + 1}`,
        name: `PA${i}`,
        type: 'smd',
        net: i % 4 === 0 ? 'GND' : i % 4 === 1 ? '3V3' : `NET_PA${i}`,
        x: 32.5 + (i < 8 ? -4.2 : i < 16 ? -2.8 + (i - 8) * 0.7 : i < 24 ? 4.2 : 2.8 - (i - 24) * 0.7),
        y: 28.0 + (i < 8 ? -2.8 + i * 0.7 : i < 16 ? 4.2 : i < 24 ? 2.8 - (i - 16) * 0.7 : -4.2),
        w: 0.35,
        h: 1.0
      }))
    },

    // 8MHz Crystal Oscillator: Y1 + Load Caps C11, C12
    { ref: 'Y1', value: '8.000MHz', package: 'HC-49SMD', position: { x: 13.5, y: 19.5, rotation: 0 }, pads: [{ num: '1', net: 'HSE_IN', x: 9.7, y: 19.5, w: 2.2, h: 3.0 }, { num: '2', net: 'HSE_OUT', x: 17.3, y: 19.5, w: 2.2, h: 3.0 }] },
    { ref: 'C12', value: '22pF', package: '0805', position: { x: 21.0, y: 17.5, rotation: 90 }, pads: [{ num: '1', net: 'HSE_IN', x: 21.0, y: 16.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 21.0, y: 18.5, w: 0.8, h: 1.2 }] },
    { ref: 'C11', value: '22pF', package: '0805', position: { x: 21.0, y: 22.0, rotation: 90 }, pads: [{ num: '1', net: 'HSE_OUT', x: 21.0, y: 21.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 21.0, y: 23.0, w: 0.8, h: 1.2 }] },

    // Power Indicator: PWR LED + Resistors
    { ref: 'PWR', value: 'GREEN', package: '0805_LED', position: { x: 14.5, y: 9.5, rotation: 0 }, pads: [{ num: '1', net: '3V3', x: 13.5, y: 9.5, w: 0.8, h: 1.2 }, { num: '2', net: 'NET_LED', x: 15.5, y: 9.5, w: 0.8, h: 1.2 }] },
    { ref: 'R2', value: '1k', package: '0805', position: { x: 14.5, y: 12.5, rotation: 0 }, pads: [{ num: '1', net: 'NET_LED', x: 13.5, y: 12.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 15.5, y: 12.5, w: 0.8, h: 1.2 }] },
    { ref: 'C13', value: '100nF', package: '0805', position: { x: 17.8, y: 9.5, rotation: 0 }, pads: [{ num: '1', net: '3V3', x: 16.8, y: 9.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 18.8, y: 9.5, w: 0.8, h: 1.2 }] },
    { ref: 'R8', value: '10k', package: '0805', position: { x: 19.0, y: 12.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 19.0, y: 11.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 19.0, y: 13.5, w: 0.8, h: 1.2 }] },

    // LDO 3.3V Regulator + Filter Caps
    {
      ref: 'LDO',
      value: 'AMS1117-3.3',
      package: 'SOT-223',
      position: { x: 13.5, y: 35.5, rotation: 0 },
      pads: [
        { num: '1', name: 'VIN', net: 'VIN_5V', x: 11.2, y: 37.0, w: 1.1, h: 1.6 },
        { num: '2', name: 'GND', net: 'GND', x: 13.5, y: 37.0, w: 1.1, h: 1.6 },
        { num: '3', name: 'VOUT', net: '3V3', x: 15.8, y: 37.0, w: 1.1, h: 1.6 },
        { num: '4', name: 'TAB', net: 'GND', x: 13.5, y: 32.3, w: 6.0, h: 2.4 }
      ]
    },
    { ref: 'C7', value: '10uF', package: '0805', position: { x: 18.5, y: 32.0, rotation: 90 }, pads: [{ num: '1', net: 'VIN_5V', x: 18.5, y: 31.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 18.5, y: 33.0, w: 0.8, h: 1.2 }] },
    { ref: 'C6', value: '10uF', package: '0805', position: { x: 21.5, y: 32.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 21.5, y: 31.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 21.5, y: 33.0, w: 0.8, h: 1.2 }] },
    { ref: 'C2', value: '100nF', package: '0805', position: { x: 25.0, y: 32.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 25.0, y: 31.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 25.0, y: 33.0, w: 0.8, h: 1.2 }] },
    { ref: 'C8', value: '100nF', package: '0805', position: { x: 18.5, y: 36.0, rotation: 90 }, pads: [{ num: '1', net: 'VIN_5V', x: 18.5, y: 35.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 18.5, y: 37.0, w: 0.8, h: 1.2 }] },
    { ref: 'C9', value: '100nF', package: '0805', position: { x: 21.5, y: 36.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 21.5, y: 35.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 21.5, y: 37.0, w: 0.8, h: 1.2 }] },

    // Reset Pushbutton PB + Debounce C10, R1
    { ref: 'PB', value: 'RESET', package: 'SW_TACT', position: { x: 15.0, y: 27.0, rotation: 0 }, pads: [{ num: '1', net: 'NRST', x: 12.6, y: 25.6, w: 1.1, h: 0.9 }, { num: '2', net: 'GND', x: 17.4, y: 25.6, w: 1.1, h: 0.9 }] },
    { ref: 'R1', value: '10k', package: '0805', position: { x: 10.0, y: 27.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 10.0, y: 26.0, w: 0.8, h: 1.2 }, { num: '2', net: 'NRST', x: 10.0, y: 28.0, w: 0.8, h: 1.2 }] },
    { ref: 'C10', value: '100nF', package: '0805', position: { x: 21.0, y: 27.0, rotation: 0 }, pads: [{ num: '1', net: 'NRST', x: 20.0, y: 27.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 22.0, y: 27.0, w: 0.8, h: 1.2 }] },

    // Boot Control Switch & Pullups
    { ref: 'SW-Boot0', value: 'BOOT_SW', package: 'SW_SLIDE', position: { x: 39.0, y: 16.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 39.0, y: 14.5, w: 1.0, h: 1.2 }, { num: '2', net: 'BOOT0', x: 39.0, y: 16.5, w: 1.0, h: 1.2 }, { num: '3', net: 'GND', x: 39.0, y: 18.5, w: 1.0, h: 1.2 }] },
    { ref: 'R3', value: '10k', package: '0805', position: { x: 34.0, y: 22.5, rotation: 0 }, pads: [{ num: '1', net: 'BOOT0', x: 33.0, y: 22.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 35.0, y: 22.5, w: 0.8, h: 1.2 }] },
    { ref: 'R4', value: '10k', package: '0805', position: { x: 29.0, y: 17.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 29.0, y: 16.0, w: 0.8, h: 1.2 }, { num: '2', net: 'BOOT0', x: 29.0, y: 18.0, w: 0.8, h: 1.2 }] },
    { ref: 'C1', value: '100nF', package: '0805', position: { x: 29.0, y: 23.0, rotation: 90 }, pads: [{ num: '1', net: 'BOOT0', x: 29.0, y: 22.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 29.0, y: 24.0, w: 0.8, h: 1.2 }] },
    { ref: 'C5', value: '100nF', package: '0805', position: { x: 30.0, y: 20.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 30.0, y: 19.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 30.0, y: 21.0, w: 0.8, h: 1.2 }] },
    { ref: 'R5', value: '1k', package: '0805', position: { x: 35.0, y: 15.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 35.0, y: 14.0, w: 0.8, h: 1.2 }, { num: '2', net: 'NET_PA9', x: 35.0, y: 16.0, w: 0.8, h: 1.2 }] },

    // Right & Bottom Decoupling
    { ref: 'C4', value: '100nF', package: '0805', position: { x: 39.5, y: 27.0, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 39.5, y: 26.0, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 39.5, y: 28.0, w: 0.8, h: 1.2 }] },
    { ref: 'C3', value: '100nF', package: '0805', position: { x: 38.0, y: 34.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 38.0, y: 33.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 38.0, y: 35.5, w: 0.8, h: 1.2 }] },
    { ref: 'R7', value: '10k', package: '0805', position: { x: 38.5, y: 38.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 38.5, y: 37.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 38.5, y: 39.5, w: 0.8, h: 1.2 }] },
    { ref: 'R6', value: '10k', package: '0805', position: { x: 34.5, y: 38.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 34.5, y: 37.5, w: 0.8, h: 1.2 }, { num: '2', net: 'GND', x: 34.5, y: 39.5, w: 0.8, h: 1.2 }] },

    // IO Pin Header Connectors J1 - J9
    { ref: 'J6', package: 'HEADER_1X3', position: { x: 6.5, y: 13.5, rotation: 90 }, pads: [{ num: '1', net: 'VIN_5V', x: 6.5, y: 11.0, w: 1.8, h: 1.8 }, { num: '2', net: '3V3', x: 6.5, y: 13.5, w: 1.8, h: 1.8 }, { num: '3', net: 'GND', x: 6.5, y: 16.0, w: 1.8, h: 1.8 }] },
    { ref: 'J1', package: 'HEADER_1X3', position: { x: 6.5, y: 36.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 6.5, y: 34.0, w: 1.8, h: 1.8 }, { num: '2', net: 'GND', x: 6.5, y: 36.5, w: 1.8, h: 1.8 }, { num: '3', net: 'VIN_5V', x: 6.5, y: 39.0, w: 1.8, h: 1.8 }] },
    { ref: 'J8', package: 'HEADER_1X2', position: { x: 32.5, y: 6.0, rotation: 0 }, pads: [{ num: '1', net: '3V3', x: 31.2, y: 6.0, w: 1.8, h: 1.8 }, { num: '2', net: 'GND', x: 33.8, y: 6.0, w: 1.8, h: 1.8 }] },
    { ref: 'J7', package: 'HEADER_1X2', position: { x: 43.5, y: 13.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 43.5, y: 12.2, w: 1.8, h: 1.8 }, { num: '2', net: 'GND', x: 43.5, y: 14.8, w: 1.8, h: 1.8 }] },
    { ref: 'J5', package: 'HEADER_1X4', position: { x: 43.5, y: 26.5, rotation: 90 }, pads: [{ num: '1', net: '3V3', x: 43.5, y: 22.7, w: 1.8, h: 1.8 }, { num: '2', net: 'NET_PA1', x: 43.5, y: 25.2, w: 1.8, h: 1.8 }, { num: '3', net: 'NET_PA2', x: 43.5, y: 27.8, w: 1.8, h: 1.8 }, { num: '4', net: 'GND', x: 43.5, y: 30.3, w: 1.8, h: 1.8 }] },
    { ref: 'J2', package: 'HEADER_1X3', position: { x: 14.0, y: 43.5, rotation: 0 }, pads: [{ num: '1', net: 'VIN_5V', x: 11.5, y: 43.5, w: 1.8, h: 1.8 }, { num: '2', net: '3V3', x: 14.0, y: 43.5, w: 1.8, h: 1.8 }, { num: '3', net: 'GND', x: 16.5, y: 43.5, w: 1.8, h: 1.8 }] },
    { ref: 'J3', package: 'HEADER_1X6', position: { x: 27.0, y: 43.5, rotation: 0 }, pads: [{ num: '1', net: 'NET_PA3', x: 20.7, y: 43.5, w: 1.8, h: 1.8 }, { num: '2', net: 'NET_PA4', x: 23.2, y: 43.5, w: 1.8, h: 1.8 }, { num: '3', net: 'NET_PA5', x: 25.7, y: 43.5, w: 1.8, h: 1.8 }, { num: '4', net: 'NET_PA6', x: 28.2, y: 43.5, w: 1.8, h: 1.8 }, { num: '5', net: 'NET_PA7', x: 30.7, y: 43.5, w: 1.8, h: 1.8 }, { num: '6', net: 'GND', x: 33.2, y: 43.5, w: 1.8, h: 1.8 }] },
    { ref: 'J4', package: 'HEADER_1X2', position: { x: 39.5, y: 43.5, rotation: 0 }, pads: [{ num: '1', net: '3V3', x: 38.2, y: 43.5, w: 1.8, h: 1.8 }, { num: '2', net: 'GND', x: 40.8, y: 43.5, w: 1.8, h: 1.8 }] },
    { ref: 'J9', package: 'HEADER_1X2', position: { x: 44.0, y: 43.5, rotation: 0 }, pads: [{ num: '1', net: 'NET_PA8', x: 42.7, y: 43.5, w: 1.8, h: 1.8 }, { num: '2', net: 'GND', x: 45.3, y: 43.5, w: 1.8, h: 1.8 }] }
  ],
  traces: [
    // Top Power Rails (Red F.Cu with 45 degree bends)
    { net: 'VIN_5V', layer: 'F.Cu', width: 0.5, segments: [[6.5, 11.0], [6.5, 8.0], [26.0, 8.0], [26.0, 4.5], [42.0, 4.5], [42.0, 6.0], [33.8, 6.0]] },
    { net: '3V3', layer: 'F.Cu', width: 0.45, segments: [[13.5, 37.0], [13.5, 39.5], [6.5, 39.5], [6.5, 34.0]] },
    { net: 'VIN_5V', layer: 'F.Cu', width: 0.5, segments: [[6.5, 39.0], [4.5, 41.0], [4.5, 44.0], [11.5, 44.0], [11.5, 43.5]] },
    { net: '3V3', layer: 'F.Cu', width: 0.4, segments: [[14.0, 43.5], [14.0, 44.5], [38.2, 44.5], [38.2, 43.5]] },
    
    // Crystal Tracks (HSE_IN / HSE_OUT at 45 degree fanout to MCU)
    { net: 'HSE_IN', layer: 'F.Cu', width: 0.3, segments: [[9.7, 19.5], [9.7, 18.0], [16.0, 18.0], [21.0, 16.5], [23.5, 16.5], [28.3, 25.2]] },
    { net: 'HSE_OUT', layer: 'F.Cu', width: 0.3, segments: [[17.3, 19.5], [21.0, 21.0], [23.5, 21.0], [28.3, 26.0]] },

    // Reset Circuit Track
    { net: 'NRST', layer: 'F.Cu', width: 0.3, segments: [[10.0, 28.0], [12.6, 28.0], [12.6, 25.6], [20.0, 27.0], [24.0, 27.0], [28.3, 27.5]] },

    // LDO Output to Filter Caps and MCU
    { net: '3V3', layer: 'F.Cu', width: 0.45, segments: [[15.8, 37.0], [17.5, 37.0], [17.5, 35.0], [21.5, 35.0], [25.0, 31.0], [28.3, 29.5]] },

    // MCU Bus Tracks (Clean Radiating 45-degree Traces to Bottom Headers J2, J3, J4, J9)
    { net: 'NET_PA3', layer: 'F.Cu', width: 0.3, segments: [[29.7, 32.2], [28.5, 34.0], [20.7, 41.8], [20.7, 43.5]] },
    { net: 'NET_PA4', layer: 'F.Cu', width: 0.3, segments: [[30.4, 32.2], [29.5, 35.0], [23.2, 41.3], [23.2, 43.5]] },
    { net: 'NET_PA5', layer: 'F.Cu', width: 0.3, segments: [[31.1, 32.2], [30.5, 36.0], [25.7, 40.8], [25.7, 43.5]] },
    { net: 'NET_PA6', layer: 'F.Cu', width: 0.3, segments: [[31.8, 32.2], [31.5, 37.0], [28.2, 40.3], [28.2, 43.5]] },
    { net: 'NET_PA7', layer: 'F.Cu', width: 0.3, segments: [[32.5, 32.2], [32.5, 38.0], [30.7, 39.8], [30.7, 43.5]] },
    { net: 'NET_PA8', layer: 'F.Cu', width: 0.3, segments: [[33.2, 32.2], [35.0, 34.0], [42.7, 41.7], [42.7, 43.5]] },

    // MCU Right Side Fan-out to J5, J7, SW-Boot0, C3, C4
    { net: 'NET_PA1', layer: 'F.Cu', width: 0.3, segments: [[36.7, 26.0], [38.5, 26.0], [38.5, 25.2], [43.5, 25.2]] },
    { net: 'NET_PA2', layer: 'F.Cu', width: 0.3, segments: [[36.7, 27.5], [39.0, 27.5], [39.0, 27.8], [43.5, 27.8]] },
    { net: 'BOOT0', layer: 'F.Cu', width: 0.3, segments: [[36.7, 24.5], [37.5, 23.7], [37.5, 18.5], [39.0, 18.5], [39.0, 16.5]] },
    { net: '3V3', layer: 'F.Cu', width: 0.4, segments: [[36.7, 29.5], [38.0, 30.8], [38.0, 33.5], [39.5, 33.5], [39.5, 26.0]] },

    // MCU Top Fan-out to J8, R4, R5
    { net: '3V3', layer: 'F.Cu', width: 0.4, segments: [[31.1, 23.8], [31.1, 19.5], [31.2, 6.0]] },
    { net: 'NET_PA9', layer: 'F.Cu', width: 0.3, segments: [[32.5, 23.8], [33.5, 22.8], [33.5, 17.5], [35.0, 16.0]] },
    { net: 'NET_PA0', layer: 'F.Cu', width: 0.3, segments: [[33.9, 23.8], [36.0, 21.7], [43.5, 14.2], [43.5, 12.2]] },

    // Bottom Layer Traces (B.Cu - Royal Blue Ground Return Bus & Interconnects)
    { net: 'GND', layer: 'B.Cu', width: 0.6, segments: [[8.0, 3.5], [16.0, 3.5], [24.0, 3.5], [28.0, 3.5], [36.0, 3.5], [44.0, 3.5]] },
    { net: 'GND', layer: 'B.Cu', width: 0.6, segments: [[8.0, 46.5], [19.0, 46.5], [36.0, 46.5]] },
    { net: 'GND', layer: 'B.Cu', width: 0.5, segments: [[3.5, 8.0], [3.5, 20.0], [3.5, 24.0], [3.5, 28.0], [3.5, 42.0]] },
    { net: 'GND', layer: 'B.Cu', width: 0.5, segments: [[46.5, 8.0], [46.5, 18.0], [46.5, 34.0], [46.5, 38.0], [46.5, 42.0]] },
    { net: 'GND', layer: 'B.Cu', width: 0.45, segments: [[17.0, 34.0], [17.0, 38.0], [27.0, 38.0], [27.0, 21.5]] },
    { net: 'GND', layer: 'B.Cu', width: 0.45, segments: [[27.0, 21.5], [36.0, 21.5], [41.5, 21.5], [41.5, 38.5]] }
  ],
  vias: [
    // Perimeter Ground Stitching Vias (Top, Bottom, Left, Right)
    { net: 'GND', x: 8.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 12.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 16.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 20.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 24.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 28.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 36.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 40.0, y: 3.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 44.0, y: 3.5, drill: 0.3, diameter: 0.6 },

    { net: 'GND', x: 3.5, y: 8.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 3.5, y: 20.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 3.5, y: 24.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 3.5, y: 28.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 3.5, y: 42.0, drill: 0.3, diameter: 0.6 },

    { net: 'GND', x: 46.5, y: 8.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 46.5, y: 18.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 46.5, y: 34.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 46.5, y: 38.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 46.5, y: 42.0, drill: 0.3, diameter: 0.6 },

    { net: 'GND', x: 8.0, y: 46.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 19.0, y: 46.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 36.0, y: 46.5, drill: 0.3, diameter: 0.6 },

    // Internal Thermal & Bypass Vias
    { net: 'GND', x: 17.0, y: 34.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 17.0, y: 38.0, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 27.0, y: 21.5, drill: 0.3, diameter: 0.6 },
    { net: 'GND', x: 41.5, y: 38.5, drill: 0.3, diameter: 0.6 }
  ],
  zones: [{ net: 'GND', layer: 'B.Cu', type: 'copper_pour', thermal_spokes: 4 }],
  silkscreen: [
    { layer: 'F.SilkS', text: 'STM32F103 DEV BOARD v1.2', x: 25.0, y: 48.2, size: 0.9, rotation: 0 },
    { layer: 'F.SilkS', text: 'ARM CORTEX-M3 72MHz', x: 25.0, y: 2.2, size: 0.75, rotation: 0 },
    { layer: 'B.SilkS', text: 'DESIGNED WITH AI-SKILL-ENGINE • BOTTOM LAYER', x: 25.0, y: 25.0, size: 0.9, rotation: 0 }
  ],
  schematic: {
    symbols: [
      { ref: 'U1', name: 'STM32F103C8T6', type: 'ic', x: 35, y: 25, pins: ['VDD', 'VSS', 'NRST', 'BOOT0', 'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PA8', 'PA9'] },
      { ref: 'Y1', name: '8MHz', type: 'crystal', x: 15, y: 15, pins: ['1', '2'] },
      { ref: 'LDO', name: 'AMS1117-3.3', type: 'regulator', x: 15, y: 35, pins: ['VIN', 'GND', 'VOUT', 'TAB'] },
      { ref: 'PB', name: 'RESET', type: 'switch', x: 15, y: 25, pins: ['1', '2'] }
    ],
    wires: [
      { net: '3V3', from: 'LDO.VOUT', to: 'U1.VDD' },
      { net: 'GND', from: 'LDO.GND', to: 'U1.VSS' },
      { net: 'NRST', from: 'PB.1', to: 'U1.NRST' },
      { net: 'HSE_IN', from: 'Y1.1', to: 'U1.PA0' }
    ]
  },
  simulation: { t_stop: 0.010, points: 200 }
};
