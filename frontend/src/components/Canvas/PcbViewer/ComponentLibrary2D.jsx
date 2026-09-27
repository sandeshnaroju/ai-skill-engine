import React from 'react';

/**
 * Authentic EDA CAD 2D Component Footprint Library
 * Faithfully matches real EDA tools (EasyEDA, KiCad, Altium Designer):
 * - Top Layer Copper (F.Cu): Solid vivid CAD Red (#ef4444 / #dc2626)
 * - Solder Mask Openings: Crisp Magenta / Pink collar (#e879f9 / #d946ef)
 * - Pad Numbers / Pin Names inside pads (1, 2, GND, +, -)
 * - Pin 1 Square THT pad distinction & annular rings for other pins with center drill holes
 * - Silkscreen Designators (F.SilkS): High-legibility CAD Yellow (#fef08a / #facc15)
 * - Courtyard outlines: Thin Magenta (#e879f9) / Yellow (#fef08a)
 * - Corner Mounting Holes: Cyan/Teal multi-ring plating (#06b6d4 / #22d3ee)
 * - Active Layer Filtering & Selection Halos
 */

function SelectionHalo({ width, height }) {
  const w = width + 0.8;
  const h = height + 0.8;
  return (
    <g pointerEvents="none">
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill="rgba(139, 92, 246, 0.22)"
        stroke="#a855f7"
        strokeWidth="0.26"
        strokeDasharray="1.2, 0.8"
        rx="0.4"
      />
      <circle cx={-w / 2} cy={-h / 2} r="0.3" fill="#c084fc" />
      <circle cx={w / 2} cy={-h / 2} r="0.3" fill="#c084fc" />
      <circle cx={-w / 2} cy={h / 2} r="0.3" fill="#c084fc" />
      <circle cx={w / 2} cy={h / 2} r="0.3" fill="#c084fc" />
    </g>
  );
}

export function Component2D({ component: c, isSelected, maskTheme, activeLayers = {} }) {
  const cx = c.position?.x || 0;
  const cy = c.position?.y || 0;
  const rot = c.position?.rotation || 0;
  const pkg = (c.package || '').toUpperCase();
  const val = c.value || c.ref || '';
  const ref = c.ref || '';

  const showSilk = activeLayers['F.SilkS'] !== false;
  const showPads = activeLayers['Pads'] !== false;
  const showMask = activeLayers['F.Mask'] !== false;

  const silkStyle = { display: showSilk ? 'inline' : 'none' };
  const padStyle = { display: showPads ? 'inline' : 'none' };
  const maskStyle = { display: showMask ? 'inline' : 'none' };

  // 0. Mounting Holes (MH1, MH2, MH3, MH4, or pkg MOUNT/HOLE)
  if (ref.startsWith('MH') || pkg.includes('MOUNT') || pkg.includes('HOLE')) {
    const padR = 2.6;
    const holeR = 1.5;
    return (
      <g transform={`translate(${cx}, ${cy})`}>
        {isSelected && <SelectionHalo width={padR * 2 + 1.2} height={padR * 2 + 1.2} />}
        <g style={padStyle}>
          {/* Outer Cyan Plated Collar */}
          <circle cx="0" cy="0" r={padR + 0.6} fill="none" stroke="#06b6d4" strokeWidth="0.2" opacity="0.9" />
          <circle cx="0" cy="0" r={padR} fill="#0891b2" stroke="#22d3ee" strokeWidth="0.15" />
          <circle cx="0" cy="0" r={padR - 0.4} fill="#06b6d4" opacity="0.6" />
          {/* Center Drill Void */}
          <circle cx="0" cy="0" r={holeR} fill="#060813" stroke="#000000" strokeWidth="0.1" />
        </g>
        {/* Silkscreen text */}
        <text x="0" y={-padR - 0.8} fill="#fef08a" fontSize="0.75" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 1. Crystal Oscillator (Y1, HC-49SMD / 3225 / 5032)
  if (ref.startsWith('Y') || pkg.includes('CRYSTAL') || pkg.includes('HC-49') || pkg.includes('OSC')) {
    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={11.4} height={6.8} />}
        {/* Yellow Courtyard Box */}
        <rect x="-5.5" y="-3.2" width="11.0" height="6.4" fill="none" stroke="#fef08a" strokeWidth="0.14" style={silkStyle} />
        
        {/* Pad 1: HSE_IN */}
        <g>
          <rect x="-5.0" y="-1.6" width="2.4" height="3.2" rx="0.1" fill="#e879f9" style={maskStyle} />
          <rect x="-4.9" y="-1.5" width="2.2" height="3.0" rx="0.08" fill="#ef4444" style={padStyle} />
          <text x="-3.8" y="-0.2" fill="#ffffff" fontSize="0.6" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>1</text>
          <text x="-3.8" y="0.7" fill="#ffffff" fontSize="0.4" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>HSE_IN</text>
        </g>

        {/* Pad 2: HSE_OUT */}
        <g>
          <rect x="2.6" y="-1.6" width="2.4" height="3.2" rx="0.1" fill="#e879f9" style={maskStyle} />
          <rect x="2.7" y="-1.5" width="2.2" height="3.0" rx="0.08" fill="#ef4444" style={padStyle} />
          <text x="3.8" y="-0.2" fill="#ffffff" fontSize="0.6" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>2</text>
          <text x="3.8" y="0.7" fill="#ffffff" fontSize="0.4" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>HSE_OUT</text>
        </g>

        {/* Silkscreen Label */}
        <text x="-3.5" y="-3.6" fill="#fef08a" fontSize="0.85" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 1.5 Dual In-Line Package (DIP-40 for ATmega16, DIP-28, DIP-16, DIP-8)
  if (pkg.includes('DIP') || pkg.includes('PDIP') || val.toLowerCase().includes('mega16') || val.toLowerCase().includes('atmega')) {
    const is40 = pkg.includes('40') || val.toLowerCase().includes('16') || (c.pads || []).length >= 40;
    const is28 = pkg.includes('28') || val.toLowerCase().includes('328') || (c.pads || []).length === 28;
    const pinCount = is40 ? 40 : is28 ? 28 : (c.pads || []).length || 16;
    const pinsPerSide = pinCount / 2;
    const pitch = 2.54; // Standard 100 mil pitch
    const rowSpan = is40 ? 15.24 : 7.62; // 600 mil row spacing for DIP-40
    const bodyLength = pinsPerSide * pitch + 2.0;
    const bodyWidth = rowSpan - 2.0;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={rowSpan + 4.0} height={bodyLength + 2.0} />}
        {/* Chip Body & Silkscreen Outline (Clean transparent EDA standard) */}
        <g style={silkStyle}>
          <rect x={-bodyWidth / 2} y={-bodyLength / 2} width={bodyWidth} height={bodyLength} rx="1.0" fill="none" stroke="#fef08a" strokeWidth="0.14" />
          {/* Pin 1 Half-Circle Notch at Top */}
          <path d={`M -1.8 ${-bodyLength / 2} A 1.8 1.8 0 0 0 1.8 ${-bodyLength / 2}`} fill="none" stroke="#fef08a" strokeWidth="0.14" />
          <circle cx={-bodyWidth / 2 + 1.2} cy={-bodyLength / 2 + 1.6} r="0.4" fill="#fef08a" />
          <text x="0" y="0" fill="#fef08a" fontSize="0.9" textAnchor="middle" fontWeight="bold" fontFamily="monospace" transform="rotate(-90)">
            {ref} {val || (is40 ? 'ATmega16' : 'DIP')}
          </text>
        </g>

        {/* Through-Hole Pin Rows (Left Pins 1 to N/2, Right Pins N down to N/2 + 1) */}
        {Array.from({ length: pinsPerSide }).map((_, i) => {
          const py = -((pinsPerSide - 1) * pitch) / 2 + i * pitch;
          const lx = -rowSpan / 2;
          const rx = rowSpan / 2;
          const isPin1 = i === 0;
          const padR = 1.0;
          const drillR = 0.5;

          return (
            <g key={`dip_row_${i}`}>
              {/* Left Pin (1 to N/2) */}
              <g>
                <g style={maskStyle}>
                  {isPin1 ? (
                    <rect x={lx - padR - 0.08} y={py - padR - 0.08} width={(padR + 0.08) * 2} height={(padR + 0.08) * 2} rx="0.08" fill="#e879f9" />
                  ) : (
                    <circle cx={lx} cy={py} r={padR + 0.08} fill="#e879f9" />
                  )}
                </g>
                <g style={padStyle}>
                  {isPin1 ? (
                    <rect x={lx - padR} y={py - padR} width={padR * 2} height={padR * 2} rx="0.05" fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
                  ) : (
                    <circle cx={lx} cy={py} r={padR} fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
                  )}
                  <circle cx={lx} cy={py} r={drillR} fill="#060813" />
                </g>
                <text x={lx + padR + 0.8} y={py + 0.3} fill="#ffffff" fontSize="0.45" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
                  {i + 1}
                </text>
              </g>

              {/* Right Pin (PinCount down to N/2 + 1) */}
              <g>
                <g style={maskStyle}>
                  <circle cx={rx} cy={py} r={padR + 0.08} fill="#e879f9" />
                </g>
                <g style={padStyle}>
                  <circle cx={rx} cy={py} r={padR} fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
                  <circle cx={rx} cy={py} r={drillR} fill="#060813" />
                </g>
                <text x={rx - padR - 0.8} y={py + 0.3} fill="#ffffff" fontSize="0.45" textAnchor="end" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
                  {pinCount - i}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    );
  }

  // 2. Dense Quad Flat Package (QFP-32 / QFP-48 / QFP-64 / MCU / U1)
  if (pkg.includes('QFP') || pkg.includes('LQFP') || pkg.includes('TQFP') || pkg.includes('QFN') || (ref.startsWith('U') && (c.pads || []).length > 16)) {
    const isBig = pkg.includes('48') || pkg.includes('64') || (c.pads || []).length >= 48;
    const sz = isBig ? 8.4 : 6.4;
    const pinCountSide = isBig ? 12 : 8;
    const pinPitch = isBig ? 0.5 : 0.65;
    const padW = 0.32;
    const padH = 1.1;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={sz + padH * 2 + 0.8} height={sz + padH * 2 + 0.8} />}
        {/* Magenta Inner IC Frame with Pin 1 Notch */}
        <g style={silkStyle}>
          <rect x={-sz / 2} y={-sz / 2} width={sz} height={sz} fill="none" stroke="#e879f9" strokeWidth="0.12" />
          <circle cx={-sz / 2 + 0.8} cy={-sz / 2 + 0.8} r="0.3" fill="#fef08a" />
        </g>
        
        {/* Center Exposed Ground / Thermal Pad with Cross Relief */}
        <g style={padStyle}>
          <rect x="-1.8" y="-1.8" width="3.6" height="3.6" fill="#ef4444" stroke="#e879f9" strokeWidth="0.1" />
          <line x1="-1.8" y1="0" x2="1.8" y2="0" stroke="#060813" strokeWidth="0.2" />
          <line x1="0" y1="-1.8" x2="0" y2="1.8" stroke="#060813" strokeWidth="0.2" />
        </g>

        {/* Top & Bottom Pad Arrays (Red with Pink Mask Margin & Pin Numbers) */}
        {Array.from({ length: pinCountSide }).map((_, i) => {
          const px = -((pinCountSide - 1) * pinPitch) / 2 + i * pinPitch;
          return (
            <g key={`qfp_tb_${i}`}>
              {/* Top Pad */}
              <rect x={px - padW / 2 - 0.04} y={-sz / 2 - padH + 0.2 - 0.04} width={padW + 0.08} height={padH + 0.08} rx="0.05" fill="#e879f9" style={maskStyle} />
              <rect x={px - padW / 2} y={-sz / 2 - padH + 0.2} width={padW} height={padH} rx="0.04" fill="#ef4444" style={padStyle} />
              {/* Bottom Pad */}
              <rect x={px - padW / 2 - 0.04} y={sz / 2 - 0.2 - 0.04} width={padW + 0.08} height={padH + 0.08} rx="0.05" fill="#e879f9" style={maskStyle} />
              <rect x={px - padW / 2} y={sz / 2 - 0.2} width={padW} height={padH} rx="0.04" fill="#ef4444" style={padStyle} />
            </g>
          );
        })}

        {/* Left & Right Pad Arrays */}
        {Array.from({ length: pinCountSide }).map((_, i) => {
          const py = -((pinCountSide - 1) * pinPitch) / 2 + i * pinPitch;
          return (
            <g key={`qfp_lr_${i}`}>
              {/* Left Pad */}
              <rect x={-sz / 2 - padH + 0.2 - 0.04} y={py - padW / 2 - 0.04} width={padH + 0.08} height={padW + 0.08} rx="0.05" fill="#e879f9" style={maskStyle} />
              <rect x={-sz / 2 - padH + 0.2} y={py - padW / 2} width={padH} height={padW} rx="0.04" fill="#ef4444" style={padStyle} />
              {/* Right Pad */}
              <rect x={sz / 2 - 0.2 - 0.04} y={py - padW / 2 - 0.04} width={padH + 0.08} height={padW + 0.08} rx="0.05" fill="#e879f9" style={maskStyle} />
              <rect x={sz / 2 - 0.2} y={py - padW / 2} width={padH} height={padW} rx="0.04" fill="#ef4444" style={padStyle} />
            </g>
          );
        })}

        {/* Silkscreen Ref Label */}
        <text x="0" y="0.3" fill="#fef08a" fontSize="0.9" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 3. Voltage Regulator / LDO / SOT-223 / SOT-89
  if (pkg.includes('SOT-223') || pkg.includes('SOT223') || pkg.includes('DPAK') || ref.startsWith('LDO') || pkg.includes('REG')) {
    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={7.8} height={7.8} />}
        {/* Magenta Courtyard Frame */}
        <rect x="-3.6" y="-3.8" width="7.2" height="7.2" fill="none" stroke="#e879f9" strokeWidth="0.12" style={silkStyle} />
        
        {/* Large Thermal Tab (Pad 2 GND) */}
        <rect x="-3.1" y="-3.3" width="6.2" height="2.6" rx="0.1" fill="#e879f9" style={maskStyle} />
        <rect x="-3.0" y="-3.2" width="6.0" height="2.4" rx="0.08" fill="#ef4444" style={padStyle} />
        <text x="0" y="-1.8" fill="#ffffff" fontSize="0.55" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>2 GND</text>

        {/* 3 Lower SMD Pads (1, 2, 3) */}
        {[-2.3, 0, 2.3].map((px, idx) => (
          <g key={`sot_pad_${idx}`}>
            <rect x={px - 0.65} y="1.35" width="1.3" height="1.8" rx="0.1" fill="#e879f9" style={maskStyle} />
            <rect x={px - 0.55} y="1.45" width="1.1" height="1.6" rx="0.08" fill="#ef4444" style={padStyle} />
            <text x={px} y="2.4" fill="#ffffff" fontSize="0.5" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
              {idx === 0 ? '1' : idx === 1 ? '2' : '3'}
            </text>
          </g>
        ))}

        {/* Silkscreen Label */}
        <text x="-3.2" y="-4.2" fill="#fef08a" fontSize="0.8" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref || 'LDO'}
        </text>
      </g>
    );
  }

  // 4. Pushbutton Switch / Boot Switch (PB, SW-Boot0, Tact Switch 4-pin)
  if (ref.startsWith('SW') || ref.startsWith('PB') || ref.startsWith('BTN') || pkg.includes('SWITCH') || pkg.includes('TACT') || pkg.includes('BUTTON')) {
    const isBoot = ref.includes('Boot') || val.includes('Boot');
    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={6.8} height={4.8} />}
        {/* Magenta Courtyard Frame */}
        <rect x="-3.2" y="-2.2" width="6.4" height="4.4" fill="none" stroke="#e879f9" strokeWidth="0.12" style={silkStyle} />
        
        {/* 4 Corner SMD Pads */}
        {[
          { x: -2.4, y: -1.4, num: '1' },
          { x: 2.4, y: -1.4, num: '2' },
          { x: -2.4, y: 1.4, num: '3' },
          { x: 2.4, y: 1.4, num: '4' }
        ].map((p, i) => (
          <g key={`sw_p_${i}`}>
            <rect x={p.x - 0.65} y={p.y - 0.55} width="1.3" height="1.1" rx="0.08" fill="#e879f9" style={maskStyle} />
            <rect x={p.x - 0.55} y={p.y - 0.45} width="1.1" height="0.9" rx="0.06" fill="#ef4444" style={padStyle} />
            <circle cx={p.x} cy={p.y} r="0.15" fill="#ffffff" style={silkStyle} />
          </g>
        ))}

        {/* Central Switch Outline (Silkscreen mark) */}
        <g style={silkStyle}>
          <circle cx="0" cy="0" r="1.1" fill="none" stroke="#fef08a" strokeWidth="0.12" />
          <circle cx="0" cy="0" r="0.6" fill="none" stroke="#fef08a" strokeWidth="0.08" strokeDasharray="0.3,0.3" />
        </g>

        {/* Silkscreen Label */}
        <text x="0" y="3.1" fill="#fef08a" fontSize="0.75" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 5. Connectors & Pin Headers (J1, J2, J3, J4, J5, J6, J7, J8, J9)
  if (ref.startsWith('J') || ref.startsWith('P') || ref.startsWith('CONN') || pkg.includes('HEADER') || pkg.includes('CONN')) {
    const padList = c.pads && c.pads.length > 0 ? c.pads : [{ num: '1' }, { num: '2' }, { num: '3' }];
    const pinCount = padList.length;
    const isVertical = padList.length > 2 && Math.abs((padList[0]?.x || 0) - (padList[1]?.x || 0)) < 0.5;
    const pitch = 2.54;
    const bW = isVertical ? 3.4 : pinCount * pitch + 0.8;
    const bH = isVertical ? pinCount * pitch + 0.8 : 3.4;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={bW + 0.6} height={bH + 0.6} />}
        {/* Yellow Courtyard Box */}
        <rect x={-bW / 2} y={-bH / 2} width={bW} height={bH} fill="none" stroke="#fef08a" strokeWidth="0.14" style={silkStyle} />

        {padList.map((p, idx) => {
          const isPin1 = idx === 0;
          const px = isVertical ? 0 : -((pinCount - 1) * pitch) / 2 + idx * pitch;
          const py = isVertical ? -((pinCount - 1) * pitch) / 2 + idx * pitch : 0;
          const padR = 1.0;
          const drillR = 0.5;

          return (
            <g key={`hdr_p_${idx}`}>
              {/* Outer Magenta Mask Collar */}
              <g style={maskStyle}>
                {isPin1 ? (
                  <rect x={px - padR - 0.08} y={py - padR - 0.08} width={(padR + 0.08) * 2} height={(padR + 0.08) * 2} rx="0.08" fill="#e879f9" />
                ) : (
                  <circle cx={px} cy={py} r={padR + 0.08} fill="#e879f9" />
                )}
              </g>

              {/* Red Copper Pad (Square for Pin 1, Circle for Pins 2..N) */}
              <g style={padStyle}>
                {isPin1 ? (
                  <rect x={px - padR} y={py - padR} width={padR * 2} height={padR * 2} rx="0.05" fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
                ) : (
                  <circle cx={px} cy={py} r={padR} fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
                )}
              </g>

              {/* Inner Annular Golden Highlight Ring */}
              <circle cx={px} cy={py} r={padR - 0.25} fill="none" stroke="#fef08a" strokeWidth="0.08" opacity="0.7" style={silkStyle} />

              {/* Black Drill Hole Void */}
              <circle cx={px} cy={py} r={drillR} fill="#060813" stroke="#000000" strokeWidth="0.06" style={padStyle} />

              {/* Pin Number */}
              <text x={px} y={py + 0.2} fill="#ffffff" fontSize="0.45" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
                {idx + 1}
              </text>
            </g>
          );
        })}

        {/* Silkscreen Ref Label */}
        <text x={isVertical ? -bW / 2 - 0.6 : 0} y={isVertical ? -bH / 2 - 0.4 : -bH / 2 - 0.5} fill="#fef08a" fontSize="0.8" textAnchor={isVertical ? 'end' : 'middle'} fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 6. Surface Mount Passives: 0805, 0603, 1206 Resistors (R) & Capacitors (C)
  if (ref.startsWith('R') || ref.startsWith('C') || pkg.includes('0805') || pkg.includes('0603') || pkg.includes('1206')) {
    const isCap = ref.startsWith('C');
    const is0603 = pkg.includes('0603');
    const is1206 = pkg.includes('1206');
    const padW = is1206 ? 1.0 : is0603 ? 0.6 : 0.8;
    const padH = is1206 ? 1.4 : is0603 ? 0.8 : 1.2;
    const gap = is1206 ? 1.8 : is0603 ? 0.9 : 1.2;
    const boxW = gap + padW * 2 + 0.6;
    const boxH = padH + 0.6;

    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={boxW + 0.6} height={boxH + 0.6} />}
        {/* Magenta Courtyard Bounding Outline */}
        <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} fill="none" stroke="#e879f9" strokeWidth="0.1" style={silkStyle} />

        {/* Left Pad 1 (Red with Pink Mask Margin & Pin 1 label) */}
        <g>
          <rect x={-gap / 2 - padW - 0.05} y={-padH / 2 - 0.05} width={padW + 0.1} height={padH + 0.1} rx="0.06" fill="#e879f9" style={maskStyle} />
          <rect x={-gap / 2 - padW} y={-padH / 2} width={padW} height={padH} rx="0.04" fill="#ef4444" style={padStyle} />
          <text x={-gap / 2 - padW / 2} y="0.2" fill="#ffffff" fontSize="0.45" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
            {isCap ? '+' : '1'}
          </text>
        </g>

        {/* Right Pad 2 (Red with Pink Mask Margin & Pin 2 label) */}
        <g>
          <rect x={gap / 2 - 0.05} y={-padH / 2 - 0.05} width={padW + 0.1} height={padH + 0.1} rx="0.06" fill="#e879f9" style={maskStyle} />
          <rect x={gap / 2} y={-padH / 2} width={padW} height={padH} rx="0.04" fill="#ef4444" style={padStyle} />
          <text x={gap / 2 + padW / 2} y="0.2" fill="#ffffff" fontSize="0.45" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
            {isCap ? '-' : '2'}
          </text>
        </g>

        {/* Center Silkscreen Body Outline (Transparent bare-board standard) */}
        <rect
          x={-gap / 2 + 0.05}
          y={-padH / 2 + 0.1}
          width={gap - 0.1}
          height={padH - 0.2}
          rx="0.04"
          fill="none"
          stroke="#e879f9"
          strokeWidth="0.06"
          strokeDasharray="0.4,0.3"
          style={silkStyle}
        />

        {/* Yellow Silkscreen Ref Label */}
        <text x="0" y={-boxH / 2 - 0.4} fill="#fef08a" fontSize="0.75" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref}
        </text>
      </g>
    );
  }

  // 7. Power LED / Indicator (PWR, LED1, etc.)
  if (ref.startsWith('PWR') || ref.startsWith('LED') || pkg.includes('LED')) {
    return (
      <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
        {isSelected && <SelectionHalo width={4.2} height={3.0} />}
        <rect x="-1.8" y="-1.2" width="3.6" height="2.4" fill="none" stroke="#fef08a" strokeWidth="0.1" style={silkStyle} />
        <rect x="-1.5" y="-0.8" width="0.9" height="1.6" rx="0.06" fill="#e879f9" style={maskStyle} />
        <rect x="-1.4" y="-0.7" width="0.7" height="1.4" rx="0.04" fill="#ef4444" style={padStyle} />
        <rect x="0.6" y="-0.8" width="0.9" height="1.6" rx="0.06" fill="#e879f9" style={maskStyle} />
        <rect x="0.7" y="-0.7" width="0.7" height="1.4" rx="0.04" fill="#ef4444" style={padStyle} />
        <polygon points="-0.4,-0.5 0.4,0 -0.4,0.5" fill="none" stroke="#fef08a" strokeWidth="0.1" style={silkStyle} />
        <text x="0" y="-1.6" fill="#fef08a" fontSize="0.7" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
          {ref || 'PWR'}
        </text>
      </g>
    );
  }

  // 8. Fully Parametric Data-Driven Footprint (for ANY chip, sensor, connector, or MCU)
  const rawPads = c.pads || [
    { num: '1', x: -1.2, y: 0, w: 1.0, h: 1.2 },
    { num: '2', x: 1.2, y: 0, w: 1.0, h: 1.2 }
  ];

  // Convert pads to local footprint origin
  const normalizedPads = rawPads.map((p, idx) => {
    let px = p.x !== undefined ? p.x : -1.2 + idx * 2.4;
    let py = p.y !== undefined ? p.y : 0;
    // If pad coordinates are given as absolute board coordinates, convert to relative:
    if (Math.abs(px - cx) < 60 && Math.abs(px) > 20) px -= cx;
    if (Math.abs(py - cy) < 60 && Math.abs(py) > 20) py -= cy;

    return {
      num: p.num || `${idx + 1}`,
      name: p.name || '',
      x: px,
      y: py,
      w: p.w || 1.1,
      h: p.h || 1.3,
      drill: p.drill || (p.type === 'tht' ? 0.8 : 0),
      isPin1: idx === 0 || p.num === '1'
    };
  });

  const xs = normalizedPads.map((p) => p.x);
  const ys = normalizedPads.map((p) => p.y);
  const minPadX = Math.min(...xs, -1.5);
  const maxPadX = Math.max(...xs, 1.5);
  const minPadY = Math.min(...ys, -1.0);
  const maxPadY = Math.max(...ys, 1.0);

  const spanW = maxPadX - minPadX;
  const spanH = maxPadY - minPadY;
  const boxW = Math.max(spanW + 2.0, c.width || 4.8);
  const boxH = Math.max(spanH + 2.0, c.height || 3.2);

  return (
    <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
      {isSelected && <SelectionHalo width={boxW + 0.8} height={boxH + 0.8} />}
      
      {/* Silkscreen Courtyard & Chip Body */}
      <g style={silkStyle}>
        <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx="0.4" fill="none" stroke="#e879f9" strokeWidth="0.12" />
        <circle cx={-boxW / 2 + 0.8} cy={-boxH / 2 + 0.8} r="0.3" fill="#fef08a" />
        <text x="0" y={-boxH / 2 - 0.5} fill="#fef08a" fontSize="0.75" textAnchor="middle" fontWeight="bold" fontFamily="monospace">
          {ref} {val ? `(${val})` : ''}
        </text>
      </g>

      {/* Parametric Pads */}
      {normalizedPads.map((p, idx) => {
        const isTht = p.drill > 0;
        return (
          <g key={`param_p_${idx}`}>
            {/* Mask Opening Collar */}
            <g style={maskStyle}>
              {p.isPin1 && isTht ? (
                <rect x={p.x - p.w / 2 - 0.08} y={p.y - p.h / 2 - 0.08} width={p.w + 0.16} height={p.h + 0.16} rx="0.08" fill="#e879f9" />
              ) : isTht ? (
                <circle cx={p.x} cy={p.y} r={p.w / 2 + 0.08} fill="#e879f9" />
              ) : (
                <rect x={p.x - p.w / 2 - 0.06} y={p.y - p.h / 2 - 0.06} width={p.w + 0.12} height={p.h + 0.12} rx="0.06" fill="#e879f9" />
              )}
            </g>

            {/* Copper Pad */}
            <g style={padStyle}>
              {p.isPin1 && isTht ? (
                <rect x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx="0.05" fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
              ) : isTht ? (
                <circle cx={p.x} cy={p.y} r={p.w / 2} fill="#ef4444" stroke="#d97706" strokeWidth="0.06" />
              ) : (
                <rect x={p.x - p.w / 2} y={p.y - p.h / 2} width={p.w} height={p.h} rx="0.05" fill="#ef4444" />
              )}
              {isTht && <circle cx={p.x} cy={p.y} r={p.drill / 2} fill="#060813" />}
            </g>

            {/* Pin Number */}
            <text x={p.x} y={p.y + 0.2} fill="#ffffff" fontSize="0.42" textAnchor="middle" fontWeight="bold" fontFamily="monospace" style={silkStyle}>
              {p.num}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default Component2D;
