import React from 'react';

/**
 * Photorealistic 3D Component Renderer (matching industry standard 3D EDA Viewers)
 * Supports:
 * - Screw Terminal Blocks (Blue 2/3-pin blocks with silver terminal screws)
 * - 5mm & SMD LEDs (Glossy translucent dome with base rim)
 * - DC Barrel Power Jacks & Connectors
 * - Radial Electrolytic Capacitors (Aluminum cylindrical cans with polarity stripe)
 * - Axial Resistors (Tan cylindrical ceramic body with colored bands)
 * - DIP ICs (DIP-8, DIP-14, DIP-16 molded chip with Pin 1 notch)
 * - SOIC / SOP ICs (Flat epoxy body with gullwing leads)
 * - Power MOSFETs (TO-220 with metal tab, DPAK / SOT-223 with drain tab)
 * - Pin Headers (Black plastic strip with gold square posts)
 * - Checkered Cube fallback for unassigned 3D models
 */
export function Component3D({ component: c, boardWidth, boardHeight }) {
  const leftPct = ((c.position?.x || 0) / boardWidth) * 100;
  const topPct = ((c.position?.y || 0) / boardHeight) * 100;
  const rot = c.position?.rotation || 0;
  const pkg = (c.package || '').toUpperCase();
  const val = c.value || c.ref || '';
  const ref = c.ref || '';

  // 0. Mounting Holes (MH1, MH2, etc.)
  if (ref.startsWith('MH') || pkg.includes('MOUNT') || pkg.includes('HOLE')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: 'translate(-50%, -50%)',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #090d16 35%, #facc15 36%, #d97706 75%, transparent 76%)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9)',
          pointerEvents: 'none'
        }}
      />
    );
  }

  // 1. Screw Terminal Block (e.g. 2-pin / 3-pin 5.08mm terminal connector)
  if (pkg.includes('TERMINAL') || pkg.includes('SCREW') || pkg.includes('TB') || ref.startsWith('J_TB') || ref.startsWith('TB')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          width: '42px',
          height: '28px',
          background: 'linear-gradient(180deg, #1d4ed8 0%, #1e40af 100%)',
          borderRadius: '3px',
          boxShadow: '0 12px 24px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '4px',
          border: '1px solid #3b82f6',
          pointerEvents: 'none'
        }}
      >
        {/* Terminal Screw 1 */}
        <div style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #f1f5f9 20%, #94a3b8 80%)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ width: '8px', height: '2px', background: '#334155' }} />
        </div>
        {/* Terminal Screw 2 */}
        <div style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #f1f5f9 20%, #94a3b8 80%)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ width: '8px', height: '2px', background: '#334155' }} />
        </div>
      </div>
    );
  }

  // 2. 5mm Through-Hole LED (e.g. LED1 Red/Green/Blue)
  if (pkg.includes('LED') || ref.startsWith('LED') || ref.startsWith('D_LED')) {
    const isRed = val.toLowerCase().includes('red') || ref.includes('1') || !val;
    const ledColor = isRed ? '#ef4444' : '#10b981';
    const ledGlow = isRed ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)';

    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* 3D Glossy Dome */}
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${ledColor} 50%, #7f1d1d 100%)`,
          boxShadow: `0 8px 16px rgba(0,0,0,0.7), 0 0 14px ${ledGlow}`,
          border: '1px solid rgba(255,255,255,0.4)',
          position: 'relative'
        }}>
          {/* Internal LED Anode/Cathode Reflector Cup */}
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '6px',
            width: '8px',
            height: '6px',
            background: 'rgba(255,255,255,0.3)',
            borderRadius: '1px'
          }} />
        </div>
        {/* Base Flange Rim */}
        <div style={{
          width: '24px',
          height: '4px',
          background: ledColor,
          borderRadius: '2px',
          opacity: 0.9,
          marginTop: '-2px'
        }} />
      </div>
    );
  }

  // 3. DC Power Barrel Jack (DC1 / J_DC)
  if (pkg.includes('DC') || pkg.includes('BARREL') || ref.startsWith('DC')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          width: '38px',
          height: '28px',
          background: 'linear-gradient(180deg, #27272a 0%, #09090b 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '3px',
          boxShadow: '0 12px 24px rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* Barrel Hole with Center Pin */}
        <div style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#000000',
          border: '2px solid #52525b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fbbf24' }} />
        </div>
      </div>
    );
  }

  // 4. Radial Electrolytic Capacitors (Cylindrical Aluminum Can)
  if ((pkg.includes('RADIAL') || pkg.includes('ELEC') || (ref.startsWith('C') && (val.includes('uF') || val.includes('UF'))))) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* Cylindrical Aluminum Top with Safety Vent Stamp */}
        <div style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 40%, #ffffff 0%, #cbd5e1 50%, #475569 100%)',
          boxShadow: '0 10px 20px rgba(0,0,0,0.8)',
          border: '1px solid #94a3b8',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Top 'K' or 'X' Vent Impression */}
          <div style={{ width: '14px', height: '1.5px', background: '#64748b' }} />
          <div style={{ width: '1.5px', height: '14px', background: '#64748b', position: 'absolute' }} />
          {/* Cathode Negative Stripe Indicator */}
          <div style={{
            position: 'absolute',
            left: '0',
            top: '0',
            bottom: '0',
            width: '6px',
            background: '#1e293b',
            borderRadius: '50% 0 0 50%',
            opacity: 0.85
          }} />
        </div>
      </div>
    );
  }

  // 5. Axial Through-Hole Resistors (Ceramic Cylinder with Color Bands)
  if (pkg.includes('AXIAL') || (ref.startsWith('R') && !pkg.includes('0805') && !pkg.includes('0603') && !pkg.includes('1206'))) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* Left Lead Wire */}
        <div style={{ width: '6px', height: '2px', background: '#cbd5e1' }} />
        {/* Tan Ceramic Body with Color Bands */}
        <div style={{
          width: '24px',
          height: '10px',
          background: 'linear-gradient(180deg, #fef08a 0%, #d97706 70%, #92400e 100%)',
          borderRadius: '3px',
          boxShadow: '0 6px 12px rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          padding: '0 2px'
        }}>
          <div style={{ width: '2px', height: '100%', background: '#b91c1c' }} />
          <div style={{ width: '2px', height: '100%', background: '#1e293b' }} />
          <div style={{ width: '2px', height: '100%', background: '#d97706' }} />
          <div style={{ width: '2px', height: '100%', background: '#fbbf24' }} />
        </div>
        {/* Right Lead Wire */}
        <div style={{ width: '6px', height: '2px', background: '#cbd5e1' }} />
      </div>
    );
  }

  // 6. Dual In-Line Package IC (DIP-40 for ATmega16, DIP-28, DIP-16, DIP-8)
  if (pkg.includes('DIP') || ref.startsWith('U_DIP') || val.toLowerCase().includes('mega16') || val.toLowerCase().includes('atmega')) {
    const is40 = pkg.includes('40') || val.toLowerCase().includes('16') || (c.pads || []).length >= 40;
    const is28 = pkg.includes('28') || val.toLowerCase().includes('328') || (c.pads || []).length === 28;
    const is16 = pkg.includes('14') || pkg.includes('16');
    const widthPx = is40 ? '58px' : '42px';
    const heightPx = is40 ? '118px' : is28 ? '86px' : is16 ? '68px' : '44px';

    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* Molded DIP Body */}
        <div style={{
          width: widthPx,
          height: heightPx,
          background: 'linear-gradient(135deg, #27272a 0%, #09090b 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '3px',
          boxShadow: '0 12px 24px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          color: '#f8fafc',
          fontSize: is40 ? '0.72rem' : '0.65rem',
          fontWeight: 'bold',
          fontFamily: 'monospace'
        }}>
          {/* Half-Moon Pin 1 Index Notch */}
          <div style={{
            position: 'absolute',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '12px',
            height: '6px',
            borderRadius: '0 0 6px 6px',
            background: '#090d16',
            borderBottom: '1px solid #52525b'
          }} />
          <span>{ref}</span>
          <span style={{ fontSize: '0.52rem', color: '#38bdf8' }}>{val ? val.substring(0, 10) : (is40 ? 'ATmega16' : 'DIP')}</span>
        </div>
      </div>
    );
  }

  // 7. Pin Headers (P3, P4, P5, P6 - Gold Posts on Black Strip)
  if (pkg.includes('HEADER') || pkg.includes('PIN') || ref.startsWith('P') || ref.startsWith('HDR')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          background: '#18181b',
          padding: '3px',
          borderRadius: '2px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.8)',
          border: '1px solid #3f3f46',
          pointerEvents: 'none'
        }}
      >
        {[1, 2, 3].map((pin) => (
          <div key={`hp_${pin}`} style={{
            width: '8px',
            height: '8px',
            background: 'linear-gradient(135deg, #fef08a 0%, #eab308 100%)',
            borderRadius: '1px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.6)'
          }} />
        ))}
      </div>
    );
  }

  // 8. Heavy Power MOSFET: TO-220
  if (pkg.includes('TO-220') || pkg.includes('TO220')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        {/* Massive Shiny Metal Heat Sink Backplate with Hole */}
        <div style={{
          width: '54px',
          height: '20px',
          background: 'linear-gradient(180deg, #f1f5f9, #94a3b8)',
          borderRadius: '3px 3px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 8px rgba(0,0,0,0.6)'
        }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#090d16', border: '1px solid #cbd5e1' }} />
        </div>
        {/* Epoxy Power Block */}
        <div style={{
          width: '54px',
          height: '28px',
          background: 'linear-gradient(135deg, #27272a, #09090b)',
          border: '1px solid #52525b',
          borderRadius: '2px',
          boxShadow: '0 10px 20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f4f4f5',
          fontSize: '0.62rem',
          fontWeight: 'bold',
          fontFamily: 'monospace'
        }}>
          <span>{val || 'POWER MOS'}</span>
          <span style={{ fontSize: '0.5rem', color: '#10b981' }}>{ref}</span>
        </div>
      </div>
    );
  }

  // 9. SMD Power MOSFET / LDO (SOT-223 / DPAK / TO-252)
  if (pkg.includes('SOT-223') || pkg.includes('DPAK') || pkg.includes('TO-252')) {
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        <div style={{
          width: '38px',
          height: '10px',
          background: 'linear-gradient(180deg, #e2e8f0, #94a3b8)',
          borderRadius: '2px 2px 0 0',
          boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
        }} />
        <div style={{
          width: '46px',
          height: '24px',
          background: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '2px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e4e4e7',
          fontSize: '0.55rem',
          fontWeight: 'bold',
          fontFamily: 'monospace'
        }}>
          <span>{ref}</span>
          <span style={{ fontSize: '0.45rem', color: '#a1a1aa' }}>{val.substring(0, 10)}</span>
        </div>
      </div>
    );
  }

  // 10. SOIC / SOP Integrated Circuit
  if (pkg.includes('SOIC') || pkg.includes('SOP') || pkg.includes('QFN')) {
    const is16 = pkg.includes('14') || pkg.includes('16');
    const widthPx = is16 ? '58px' : '42px';
    const heightPx = '30px';

    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        <div style={{
          width: widthPx,
          height: heightPx,
          background: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
          border: '1px solid #3f3f46',
          borderRadius: '3px',
          boxShadow: '0 8px 16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          color: '#e4e4e7',
          fontSize: '0.62rem',
          fontWeight: 'bold',
          fontFamily: 'monospace'
        }}>
          <div style={{ position: 'absolute', top: '3px', left: '4px', width: '4px', height: '4px', borderRadius: '50%', background: '#38bdf8' }} />
          <span>{ref}</span>
          <span style={{ fontSize: '0.48rem', color: '#a1a1aa' }}>{val.substring(0, 8)}</span>
        </div>
      </div>
    );
  }

  // 11. Passives: 0805 Resistors / Capacitors
  if (pkg.includes('0805') || pkg.includes('0603') || pkg.includes('1206')) {
    const isCap = ref.startsWith('C');
    return (
      <div
        key={`3d_${ref}`}
        style={{
          position: 'absolute',
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
          pointerEvents: 'none'
        }}
      >
        <div style={{ width: '4px', height: '12px', background: '#cbd5e1', borderRadius: '1px 0 0 1px' }} />
        <div style={{
          width: '14px',
          height: '12px',
          background: isCap ? 'linear-gradient(135deg, #d97706, #92400e)' : 'linear-gradient(135deg, #27272a, #18181b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f8fafc',
          fontSize: '0.42rem',
          fontWeight: 'bold'
        }}>
          {ref}
        </div>
        <div style={{ width: '4px', height: '12px', background: '#cbd5e1', borderRadius: '0 1px 1px 0' }} />
      </div>
    );
  }

  // 12. Checkered Cube Fallback (Standard EDA 3D missing-model representation as seen in screenshot)
  return (
    <div
      key={`3d_${ref}`}
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
        width: '28px',
        height: '28px',
        background: 'repeating-conic-gradient(#ffffff 0% 25%, #18181b 0% 50%) 50% / 14px 14px',
        border: '1px solid #000000',
        borderRadius: '2px',
        boxShadow: '0 8px 16px rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#facc15',
        fontSize: '0.5rem',
        fontWeight: 'bold',
        textShadow: '0 1px 2px #000000',
        pointerEvents: 'none'
      }}
    >
      {ref}
    </div>
  );
}

export default Component3D;
