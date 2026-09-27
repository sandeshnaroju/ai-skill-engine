import React from 'react';
import { Activity } from 'lucide-react';

/**
 * Interactive SPICE Oscilloscope View for Transient & Frequency Simulation
 */
export function SimulationOscilloscope({
  simActiveChannels,
  setSimActiveChannels,
  simData,
  colorMode = 'dark'
}) {
  const isLight = colorMode === 'light';

  return (
    <div style={{ width: '100%', height: '100%', background: isLight ? '#f8fafc' : '#090d16', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={20} color="#06b6d4" />
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLight ? '#0f172a' : '#f8fafc' }}>
            Transient & Frequency SPICE Oscilloscope
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={simActiveChannels.vin}
              onChange={(e) => setSimActiveChannels((prev) => ({ ...prev, vin: e.target.checked }))}
            />
            <span>CH1: VIN (5.0V Input)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: isLight ? '#059669' : '#10b981', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={simActiveChannels.vout}
              onChange={(e) => setSimActiveChannels((prev) => ({ ...prev, vout: e.target.checked }))}
            />
            <span>CH2: VOUT (3.3V Regulated)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={simActiveChannels.iload}
              onChange={(e) => setSimActiveChannels((prev) => ({ ...prev, iload: e.target.checked }))}
            />
            <span>CH3: IOUT (Load Step)</span>
          </label>
        </div>
      </div>

      {/* Waveform Graph Canvas */}
      <div style={{
        flex: 1,
        background: isLight ? '#ffffff' : '#0b0f19',
        border: `1px solid ${isLight ? '#cbd5e1' : '#1e293b'}`,
        borderRadius: '8px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isLight ? 'inset 0 1px 3px rgba(0,0,0,0.04)' : 'none'
      }}>
        <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 800 350" preserveAspectRatio="none">
          {/* Grid lines */}
          <g stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'} strokeWidth="1">
            {[50, 100, 150, 200, 250, 300].map((y) => (
              <line key={`gy_${y}`} x1="50" y1={y} x2="750" y2={y} />
            ))}
            {[100, 200, 300, 400, 500, 600, 700].map((x) => (
              <line key={`gx_${x}`} x1={x} y1="30" x2={x} y2="300" />
            ))}
          </g>

          {/* Y Axis Labels */}
          <text x="40" y="55" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10" textAnchor="end">5.0V</text>
          <text x="40" y="140" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10" textAnchor="end">3.3V</text>
          <text x="40" y="225" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10" textAnchor="end">1.5V</text>
          <text x="40" y="300" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10" textAnchor="end">0.0V</text>

          {/* X Axis Time Labels */}
          <text x="50" y="325" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10">0ms</text>
          <text x="225" y="325" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10">2.5ms</text>
          <text x="400" y="325" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10">5.0ms</text>
          <text x="575" y="325" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10">7.5ms</text>
          <text x="750" y="325" fill={isLight ? '#64748b' : '#94a3b8'} fontSize="10">10ms</text>

          {/* CH1 Waveform */}
          {simActiveChannels.vin && simData?.time && (
            <polyline
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              points={simData.time
                .map((t, idx) => {
                  const x = 50 + (t / 10) * 700;
                  const y = 300 - (simData.vin[idx] / 5.5) * 250;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          )}

          {/* CH2 Waveform */}
          {simActiveChannels.vout && simData?.time && (
            <polyline
              fill="none"
              stroke={isLight ? '#059669' : '#10b981'}
              strokeWidth="2.5"
              points={simData.time
                .map((t, idx) => {
                  const x = 50 + (t / 10) * 700;
                  const y = 300 - (simData.vout[idx] / 5.5) * 250;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          )}

          {/* CH3 Waveform */}
          {simActiveChannels.iload && simData?.time && (
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="4,2"
              points={simData.time
                .map((t, idx) => {
                  const x = 50 + (t / 10) * 700;
                  const y = 300 - (simData.iload[idx] / 0.6) * 100;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          )}
        </svg>
      </div>

      {/* Readout Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <div style={{ background: isLight ? '#ffffff' : '#1e293b', border: isLight ? '1px solid #e2e8f0' : 'none', padding: '12px', borderRadius: '6px', boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
          <div style={{ fontSize: '0.75rem', color: isLight ? '#64748b' : '#94a3b8' }}>VOUT Steady State</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLight ? '#059669' : '#10b981' }}>3.302 V</div>
        </div>
        <div style={{ background: isLight ? '#ffffff' : '#1e293b', border: isLight ? '1px solid #e2e8f0' : 'none', padding: '12px', borderRadius: '6px', boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
          <div style={{ fontSize: '0.75rem', color: isLight ? '#64748b' : '#94a3b8' }}>Transient Settling Time</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#06b6d4' }}>0.42 ms</div>
        </div>
        <div style={{ background: isLight ? '#ffffff' : '#1e293b', border: isLight ? '1px solid #e2e8f0' : 'none', padding: '12px', borderRadius: '6px', boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
          <div style={{ fontSize: '0.75rem', color: isLight ? '#64748b' : '#94a3b8' }}>Ripple Voltage (Vpk-pk)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>12.4 mV</div>
        </div>
        <div style={{ background: isLight ? '#ffffff' : '#1e293b', border: isLight ? '1px solid #e2e8f0' : 'none', padding: '12px', borderRadius: '6px', boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}>
          <div style={{ fontSize: '0.75rem', color: isLight ? '#64748b' : '#94a3b8' }}>PSRR @ 100kHz</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#a855f7' }}>-54.2 dB</div>
        </div>
      </div>
    </div>
  );
}

export default SimulationOscilloscope;
