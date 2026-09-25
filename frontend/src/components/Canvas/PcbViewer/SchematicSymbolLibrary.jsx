import React from 'react';

/**
 * Standard IEEE / IEC Electronic Schematic Symbol Library
 * Renders authentic electrical schematic symbols:
 * - Resistors: IEEE Zigzag (Horizontal & Vertical)
 * - Capacitors: Ceramic & Polarized Electrolytic (Horizontal & Vertical)
 * - Diodes & LEDs: Triangle with cathode bar & light emission arrows
 * - Power MOSFETs: N-Channel & P-Channel with Gate, Drain, Source
 * - BJTs: NPN & PNP with Emitter Arrow
 * - Linear Regulators & Op-Amps
 * - ICs & Microcontrollers with named functional pins
 * - Connectors, Terminals, DC Jacks
 * - Power & Ground Symbols
 */

export function SchematicSymbol({ symbol: s, isSelected, colorMode = 'dark' }) {
  const isLight = colorMode === 'light';
  const x = s.gridX !== undefined ? s.gridX : s.x || 0;
  const y = s.gridY !== undefined ? s.gridY : s.y || 0;
  const rot = s.rotation || 0;
  const ref = s.ref || 'U1';
  const val = s.value || s.name || '';
  const pkg = (s.package || '').toUpperCase();
  const isVertical = s.orientation === 'vertical' || rot === 90 || rot === 270;

  const refColor = isLight ? '#b45309' : '#facc15';
  const valColor = isLight ? '#475569' : '#94a3b8';
  const wireColor = isLight ? '#059669' : '#10b981';
  const termColor = isLight ? '#d97706' : '#facc15';
  const symbolStroke = isSelected ? '#a855f7' : (isLight ? '#0284c7' : '#38bdf8');

  // 1. Resistors (R1, R2...) - IEEE Zigzag
  if (ref.startsWith('R') || s.type === 'resistor') {
    return (
      <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
        {/* Terminal Wires */}
        <line x1="-35" y1="0" x2="-20" y2="0" stroke={wireColor} strokeWidth="2" />
        <line x1="20" y1="0" x2="35" y2="0" stroke={wireColor} strokeWidth="2" />
        <circle cx="-35" cy="0" r="2.5" fill={termColor} />
        <circle cx="35" cy="0" r="2.5" fill={termColor} />

        {/* Zigzag Body */}
        <path
          d="M -20 0 L -15 -8 L -7 8 L 0 -8 L 7 8 L 15 -8 L 20 0"
          fill="none"
          stroke={symbolStroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Labels */}
        <text
          x="0"
          y={isVertical ? 0 : -14}
          dx={isVertical ? 18 : 0}
          fill={refColor}
          fontSize="10"
          fontWeight="bold"
          textAnchor={isVertical ? 'start' : 'middle'}
        >
          {ref}
        </text>
        <text
          x="0"
          y={isVertical ? 12 : 20}
          dx={isVertical ? 18 : 0}
          fill={valColor}
          fontSize="9"
          fontWeight="bold"
          textAnchor={isVertical ? 'start' : 'middle'}
        >
          {val || '10k'}
        </text>
      </g>
    );
  }

  // 2. Capacitors (C1, C2...)
  if (ref.startsWith('C') || s.type === 'capacitor') {
    const isPolar = val.includes('uF') || val.includes('UF') || pkg.includes('RADIAL') || pkg.includes('ELEC');
    return (
      <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
        {/* Terminal Wires */}
        <line x1="-30" y1="0" x2="-6" y2="0" stroke={wireColor} strokeWidth="2" />
        <line x1="6" y1="0" x2="30" y2="0" stroke={wireColor} strokeWidth="2" />
        <circle cx="-30" cy="0" r="2.5" fill={termColor} />
        <circle cx="30" cy="0" r="2.5" fill={termColor} />

        {/* Plates */}
        {isPolar ? (
          <>
            {/* Positive flat plate */}
            <line x1="-6" y1="-14" x2="-6" y2="14" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
            <text x="-14" y="-6" fill="#ef4444" fontSize="10" fontWeight="bold">+</text>
            {/* Negative curved plate */}
            <path d="M 6 -14 A 16 16 0 0 1 6 14" fill="none" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            {/* Non-polarized parallel plates */}
            <line x1="-6" y1="-14" x2="-6" y2="14" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="6" y1="-14" x2="6" y2="14" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}

        {/* Labels */}
        <text
          x="0"
          y={isVertical ? 0 : -18}
          dx={isVertical ? 18 : 0}
          fill={refColor}
          fontSize="10"
          fontWeight="bold"
          textAnchor={isVertical ? 'start' : 'middle'}
        >
          {ref}
        </text>
        <text
          x="0"
          y={isVertical ? 12 : 24}
          dx={isVertical ? 18 : 0}
          fill={valColor}
          fontSize="9"
          fontWeight="bold"
          textAnchor={isVertical ? 'start' : 'middle'}
        >
          {val || '100nF'}
        </text>
      </g>
    );
  }

  // 3. Diodes & LEDs (D1, LED1...)
  if (ref.startsWith('D') || ref.startsWith('LED') || s.type === 'diode') {
    const isLed = ref.startsWith('LED') || val.toLowerCase().includes('led');
    return (
      <g transform={`translate(${x}, ${y}) rotate(${rot})`}>
        {/* Terminal Wires */}
        <line x1="-30" y1="0" x2="-12" y2="0" stroke={wireColor} strokeWidth="2" />
        <line x1="12" y1="0" x2="30" y2="0" stroke={wireColor} strokeWidth="2" />
        <circle cx="-30" cy="0" r="2.5" fill={termColor} />
        <circle cx="30" cy="0" r="2.5" fill={termColor} />

        {/* Diode Triangle (Anode -> Cathode) */}
        <polygon points="-12,-12 -12,12 12,0" fill={symbolStroke} stroke={symbolStroke} strokeWidth="1.5" />
        {/* Cathode Bar */}
        <line x1="12" y1="-12" x2="12" y2="12" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />

        {/* LED Emission Arrows */}
        {isLed && (
          <g stroke="#ef4444" strokeWidth="1.5" fill="none">
            <line x1="-2" y1="-12" x2="6" y2="-19" />
            <line x1="4" y1="-10" x2="12" y2="-17" />
            <polygon points="6,-20 2,-17 5,-14" fill="#ef4444" />
            <polygon points="12,-18 8,-15 11,-12" fill="#ef4444" />
          </g>
        )}

        {/* Labels */}
        <text x="0" y="-16" fill={refColor} fontSize="10" fontWeight="bold" textAnchor="middle">
          {ref}
        </text>
        <text x="0" y="24" fill={valColor} fontSize="9" fontWeight="bold" textAnchor="middle">
          {val || '1N4148'}
        </text>
      </g>
    );
  }

  // 4. Power MOSFET (Q1, Q2...)
  if (ref.startsWith('Q') || s.type === 'mosfet' || s.type === 'transistor') {
    return (
      <g transform={`translate(${x}, ${y})`}>
        {/* Gate Pin */}
        <line x1="-30" y1="10" x2="-8" y2="10" stroke={wireColor} strokeWidth="2" />
        <circle cx="-30" cy="10" r="2.5" fill={termColor} />
        <text x="-22" y="5" fill={valColor} fontSize="7">G</text>

        {/* Drain Pin (Top) */}
        <line x1="14" y1="-28" x2="14" y2="-10" stroke={wireColor} strokeWidth="2" />
        <line x1="14" y1="-10" x2="0" y2="-10" stroke={symbolStroke} strokeWidth="2" />
        <circle cx="14" cy="-28" r="2.5" fill={termColor} />
        <text x="20" y="-18" fill={valColor} fontSize="7">D</text>

        {/* Source Pin (Bottom) */}
        <line x1="14" y1="28" x2="14" y2="10" stroke={wireColor} strokeWidth="2" />
        <line x1="14" y1="10" x2="0" y2="10" stroke={symbolStroke} strokeWidth="2" />
        <circle cx="14" cy="28" r="2.5" fill={termColor} />
        <text x="20" y="22" fill={valColor} fontSize="7">S</text>

        {/* Gate Isolated Bar */}
        <line x1="-8" y1="-14" x2="-8" y2="14" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />

        {/* 3 Channel Segments */}
        <line x1="-3" y1="-14" x2="-3" y2="-7" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="-3" y1="-3.5" x2="-3" y2="3.5" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="-3" y1="7" x2="-3" y2="14" stroke={symbolStroke} strokeWidth="2.5" strokeLinecap="round" />

        {/* Substrate Arrow */}
        <line x1="-3" y1="0" x2="14" y2="0" stroke={symbolStroke} strokeWidth="1.5" />
        <line x1="14" y1="0" x2="14" y2="10" stroke={symbolStroke} strokeWidth="1.5" />
        <polygon points="-3,0 4,-3.5 4,3.5" fill={symbolStroke} />

        {/* Labels */}
        <text x="-16" y="-18" fill={refColor} fontSize="10" fontWeight="bold" textAnchor="middle">
          {ref}
        </text>
        <text x="-16" y="28" fill={valColor} fontSize="8" fontWeight="bold" textAnchor="middle">
          {val || 'MOSFET'}
        </text>
      </g>
    );
  }

  // 5. Linear Voltage Regulator (U1 with LM7805 / AMS1117)
  if (val.includes('7805') || val.includes('1117') || val.includes('LDO') || val.includes('LM317')) {
    return (
      <g transform={`translate(${x}, ${y})`}>
        <rect x="-42" y="-24" width="84" height="48" rx="4" fill={isLight ? '#ffffff' : '#1e293b'} stroke={isLight ? '#2563eb' : '#3b82f6'} strokeWidth="2" />
        <rect x="-42" y="-24" width="84" height="16" rx="4" fill={isLight ? '#f1f5f9' : '#0f172a'} />
        <text x="0" y="-12" fill={refColor} fontSize="9" fontWeight="bold" textAnchor="middle">
          {ref} ({val || 'REG'})
        </text>

        {/* VIN Pin (Left) */}
        <line x1="-62" y1="6" x2="-42" y2="6" stroke={wireColor} strokeWidth="2" />
        <circle cx="-62" cy="6" r="2.5" fill={termColor} />
        <text x="-38" y="9" fill={isLight ? '#0f172a' : '#f8fafc'} fontSize="7.5">VIN</text>

        {/* VOUT Pin (Right) */}
        <line x1="42" y1="6" x2="62" y2="6" stroke={wireColor} strokeWidth="2" />
        <circle cx="62" cy="6" r="2.5" fill={termColor} />
        <text x="38" y="9" fill={isLight ? '#0f172a' : '#f8fafc'} fontSize="7.5" textAnchor="end">VOUT</text>

        {/* GND Pin (Bottom) */}
        <line x1="0" y1="24" x2="0" y2="44" stroke={wireColor} strokeWidth="2" />
        <circle cx="0" cy="44" r="2.5" fill={termColor} />
        <text x="0" y="20" fill={isLight ? '#0f172a' : '#f8fafc'} fontSize="7.5" textAnchor="middle">GND</text>
      </g>
    );
  }

  // 6. Connectors & Terminals (DC1, P1, P2...)
  if (ref.startsWith('P') || ref.startsWith('J') || ref.startsWith('DC') || ref.startsWith('TB')) {
    const pinCount = pkg.includes('4') ? 4 : pkg.includes('3') ? 3 : 2;
    const boxH = pinCount * 20 + 10;

    return (
      <g transform={`translate(${x}, ${y})`}>
        <rect x="-20" y={-boxH / 2} width="40" height={boxH} rx="4" fill={isLight ? '#ffffff' : '#0f172a'} stroke={wireColor} strokeWidth="2" />
        <text x="0" y={-boxH / 2 - 5} fill={refColor} fontSize="9" fontWeight="bold" textAnchor="middle">
          {ref}
        </text>

        {Array.from({ length: pinCount }).map((_, i) => {
          const py = -boxH / 2 + 14 + i * 20;
          return (
            <g key={`con_${i}`}>
              <circle cx="0" cy={py} r="4" fill={isLight ? '#f1f5f9' : '#1e293b'} stroke={termColor} strokeWidth="1.5" />
              <line x1="20" y1={py} x2="36" y2={py} stroke={wireColor} strokeWidth="2" />
              <circle cx="36" cy={py} r="2.5" fill={termColor} />
              <text x="-8" y={py + 3} fill={valColor} fontSize="7" textAnchor="end">{i + 1}</text>
            </g>
          );
        })}
      </g>
    );
  }

  // 7. Microcontrollers & Multi-Pin ICs (ATmega16, STM32, NE555, LM358...)
  const is555 = val.includes('555') || ref.includes('555');
  const isAtmega16 = val.toLowerCase().includes('mega16') || val.toLowerCase().includes('atmega16') || (pkg.includes('40') && val.toLowerCase().includes('mega'));

  let pinsLeft = [];
  let pinsRight = [];

  if (isAtmega16) {
    // Complete 40-Pin DIP ATmega16 Functional Pinout
    pinsLeft = [
      { num: 1, name: 'PB0 (XCK)' },
      { num: 2, name: 'PB1 (T1)' },
      { num: 3, name: 'PB2 (INT2)' },
      { num: 4, name: 'PB3 (OC0)' },
      { num: 5, name: 'PB4 (SS)' },
      { num: 6, name: 'PB5 (MOSI)' },
      { num: 7, name: 'PB6 (MISO)' },
      { num: 8, name: 'PB7 (SCK)' },
      { num: 9, name: 'RESET' },
      { num: 10, name: 'VCC (+5V)' },
      { num: 11, name: 'GND' },
      { num: 12, name: 'XTAL2' },
      { num: 13, name: 'XTAL1' },
      { num: 14, name: 'PD0 (RXD)' },
      { num: 15, name: 'PD1 (TXD)' },
      { num: 16, name: 'PD2 (INT0)' },
      { num: 17, name: 'PD3 (INT1)' },
      { num: 18, name: 'PD4 (OC1B)' },
      { num: 19, name: 'PD5 (OC1A)' },
      { num: 20, name: 'PD6 (ICP)' }
    ];
    pinsRight = [
      { num: 40, name: 'PA0 (ADC0)' },
      { num: 39, name: 'PA1 (ADC1)' },
      { num: 38, name: 'PA2 (ADC2)' },
      { num: 37, name: 'PA3 (ADC3)' },
      { num: 36, name: 'PA4 (ADC4)' },
      { num: 35, name: 'PA5 (ADC5)' },
      { num: 34, name: 'PA6 (ADC6)' },
      { num: 33, name: 'PA7 (ADC7)' },
      { num: 32, name: 'AREF' },
      { num: 31, name: 'GND' },
      { num: 30, name: 'AVCC' },
      { num: 29, name: 'PC7 (TOSC2)' },
      { num: 28, name: 'PC6 (TOSC1)' },
      { num: 27, name: 'PC5 (TDI)' },
      { num: 26, name: 'PC4 (TDO)' },
      { num: 25, name: 'PC3 (TMS)' },
      { num: 24, name: 'PC2 (TCK)' },
      { num: 23, name: 'PC1 (SDA)' },
      { num: 22, name: 'PC0 (SCL)' },
      { num: 21, name: 'PD7 (OC2)' }
    ];
  } else if (Array.isArray(s.pads) && s.pads.length > 8) {
    const total = s.pads.length;
    const half = Math.ceil(total / 2);
    pinsLeft = s.pads.slice(0, half).map((p, idx) => ({
      num: p.num || `${idx + 1}`,
      name: p.name || p.net || `P${p.num || idx + 1}`
    }));
    pinsRight = s.pads.slice(half).map((p, idx) => ({
      num: p.num || `${half + idx + 1}`,
      name: p.name || p.net || `P${p.num || half + idx + 1}`
    }));
  } else if (is555) {
    pinsLeft = [{ num: 8, name: 'VCC' }, { num: 4, name: 'RST' }, { num: 2, name: 'TRIG' }, { num: 6, name: 'THRS' }];
    pinsRight = [{ num: 3, name: 'OUT' }, { num: 7, name: 'DISC' }, { num: 5, name: 'CONT' }, { num: 1, name: 'GND' }];
  } else {
    pinsLeft = [{ num: 1, name: 'IN+' }, { num: 2, name: 'IN-' }, { num: 3, name: 'V+' }, { num: 4, name: 'GND' }];
    pinsRight = [{ num: 5, name: 'OUT1' }, { num: 6, name: 'OUT2' }, { num: 7, name: 'NC' }, { num: 8, name: 'V-' }];
  }

  const maxPins = Math.max(pinsLeft.length, pinsRight.length);
  const pinPitch = maxPins > 12 ? 15 : 20;
  const boxH = Math.max(maxPins * pinPitch + 35, 90);
  const boxW = maxPins > 12 ? 140 : 100;
  const startY = -boxH / 2 + 30;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} rx="4" fill={isLight ? '#ffffff' : '#1e293b'} stroke={isSelected ? '#a855f7' : (isLight ? '#2563eb' : '#3b82f6')} strokeWidth={isSelected ? '3' : '2'} />
      <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height="22" rx="4" fill={isLight ? '#f1f5f9' : '#0f172a'} />
      <text x="0" y={-boxH / 2 + 15} fill={refColor} fontSize={maxPins > 12 ? '9' : '10'} fontWeight="bold" textAnchor="middle">
        {ref} ({val || 'MCU'})
      </text>

      {/* Left Pins */}
      {pinsLeft.map((p, i) => {
        const py = startY + i * pinPitch;
        return (
          <g key={`pl_${i}`}>
            <line x1={-boxW / 2 - 20} y1={py} x2={-boxW / 2} y2={py} stroke={wireColor} strokeWidth="2" />
            <circle cx={-boxW / 2 - 20} cy={py} r="2.5" fill={termColor} />
            <text x={-boxW / 2 + 6} y={py + 3} fill={isLight ? '#0f172a' : '#f8fafc'} fontSize={maxPins > 12 ? '6.8' : '7.5'} fontWeight="bold">{p.name}</text>
            <text x={-boxW / 2 - 10} y={py - 3} fill={valColor} fontSize="6.5">{p.num}</text>
          </g>
        );
      })}

      {/* Right Pins */}
      {pinsRight.map((p, i) => {
        const py = startY + i * pinPitch;
        return (
          <g key={`pr_${i}`}>
            <line x1={boxW / 2} y1={py} x2={boxW / 2 + 20} y2={py} stroke={wireColor} strokeWidth="2" />
            <circle cx={boxW / 2 + 20} cy={py} r="2.5" fill={termColor} />
            <text x={boxW / 2 - 6} y={py + 3} fill={isLight ? '#0f172a' : '#f8fafc'} fontSize={maxPins > 12 ? '6.8' : '7.5'} fontWeight="bold" textAnchor="end">{p.name}</text>
            <text x={boxW / 2 + 10} y={py - 3} fill={valColor} fontSize="6.5">{p.num}</text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Standard Ground Power Port (⏚)
 */
export function GroundSymbol({ x, y, label = 'GND', colorMode = 'dark' }) {
  const isLight = colorMode === 'light';
  const strokeColor = isLight ? '#059669' : '#10b981';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <line x1="0" y1="0" x2="0" y2="12" stroke={strokeColor} strokeWidth="2" />
      <line x1="-12" y1="12" x2="12" y2="12" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="-7" y1="17" x2="7" y2="17" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
      <line x1="-2" y1="22" x2="2" y2="22" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
      {label && <text x="0" y="32" fill={isLight ? '#475569' : '#94a3b8'} fontSize="8" fontWeight="bold" textAnchor="middle">{label}</text>}
    </g>
  );
}

/**
 * Standard Power Rail Flag (▲)
 */
export function PowerPort({ x, y, label = '+5V' }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <line x1="0" y1="0" x2="0" y2="-12" stroke="#ef4444" strokeWidth="2" />
      <polygon points="0,-22 -7,-12 7,-12" fill="#ef4444" />
      <text x="0" y="-26" fill="#ef4444" fontSize="9" fontWeight="bold" textAnchor="middle">{label}</text>
    </g>
  );
}

/**
 * Standard Wire Junction Dot (●)
 */
export function JunctionDot({ x, y, colorMode = 'dark' }) {
  const isLight = colorMode === 'light';
  return <circle cx={x} cy={y} r="3.5" fill={isLight ? '#059669' : '#10b981'} stroke={isLight ? '#ffffff' : '#090d16'} strokeWidth="1" />;
}

export default SchematicSymbol;
