import React, { useState, useMemo } from 'react';
import { TrendingUp, Download, Search, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { computeEvmAndSCurve, formatMetricValue, exportEvmCsv } from './evmEngine';

export default function ManagementVisibilityView({ xerData, filename, isDark = true }) {
  const [search, setSearch] = useState('');
  const [hoverIdx, setHoverIdx] = useState(null);
  const [series, setSeries] = useState({ pv: true, ev: true, ac: true });

  const evm = useMemo(() => computeEvmAndSCurve(xerData), [xerData]);

  const cardBg = isDark ? 'rgba(15, 23, 42, 0.72)' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';

  const kpis = [
    { label: 'BAC (Budget)', value: formatMetricValue(evm.bac, evm.unitMode), color: '#38bdf8' },
    { label: 'PV (Planned)', value: formatMetricValue(evm.pv, evm.unitMode), color: '#6366f1' },
    { label: 'EV (Earned)', value: formatMetricValue(evm.ev, evm.unitMode), color: '#10b981' },
    { label: 'AC (Actual)', value: formatMetricValue(evm.ac, evm.unitMode), color: '#f59e0b' },
    {
      label: 'SPI (Schedule)',
      value: evm.spi.toFixed(2),
      color: evm.spi >= 0.95 ? '#10b981' : evm.spi >= 0.85 ? '#f59e0b' : '#ef4444',
    },
    {
      label: 'CPI (Cost)',
      value: evm.ac > 0 ? evm.cpi.toFixed(2) : 'N/A',
      color: evm.ac === 0 ? mutedCol : evm.cpi >= 0.95 ? '#10b981' : evm.cpi >= 0.85 ? '#f59e0b' : '#ef4444',
    },
    { label: 'EAC (Forecast)', value: formatMetricValue(evm.eac, evm.unitMode), color: '#a855f7' },
    {
      label: 'Critical Exposure',
      value: `${evm.criticalCount} tasks (${formatMetricValue(evm.criticalExposure, evm.unitMode)})`,
      color: evm.criticalCount > 0 ? '#ef4444' : '#10b981',
    },
  ];

  // SVG S-Curve geometry
  const chartW = 760;
  const chartH = 220;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 32;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxY = useMemo(() => {
    let m = 1;
    evm.buckets.forEach((b) => {
      if (b.pv > m) m = b.pv;
      if (b.ev && b.ev > m) m = b.ev;
      if (b.ac && b.ac > m) m = b.ac;
    });
    return m * 1.08;
  }, [evm.buckets]);

  const toX = (i) => padL + (i / Math.max(1, evm.buckets.length - 1)) * plotW;
  const toY = (v) => padT + plotH - (v / maxY) * plotH;

  const buildPath = (key) => {
    const pts = [];
    evm.buckets.forEach((b, i) => {
      if (b[key] !== null && b[key] !== undefined) {
        pts.push(`${pts.length === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(b[key]).toFixed(1)}`);
      }
    });
    return pts.join(' ');
  };

  const filteredWbs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return evm.wbsRows.slice(0, 150);
    return evm.wbsRows
      .filter((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q))
      .slice(0, 150);
  }, [evm.wbsRows, search]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} color="#38bdf8" />
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Management Cost & Schedule Visibility (EVM)</div>
            <div style={{ fontSize: '0.75rem', color: mutedCol }}>
              Computed automatically from P6 .xer ({evm.unitMode.toUpperCase()} mode) • Data Date: {evm.dataDate.toLocaleDateString()}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => exportEvmCsv(evm, filename)}
          className="canvas-btn canvas-btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}
        >
          <Download size={13} /> Export EVM CSV
        </button>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              background: cardBg,
              border: `1px solid ${borderCol}`,
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: mutedCol, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 750, color: k.color, marginTop: '3px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Interactive SVG S-Curve */}
      <div
        style={{
          background: cardBg,
          border: `1px solid ${borderCol}`,
          borderRadius: '10px',
          padding: '14px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Cumulative S-Curve (PV vs. EV vs. AC)</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { key: 'pv', label: 'Planned (PV)', color: '#6366f1' },
              { key: 'ev', label: 'Earned (EV)', color: '#10b981' },
              { key: 'ac', label: 'Actual (AC)', color: '#f59e0b' },
            ].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeries((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${series[s.key] ? s.color : borderCol}`,
                  background: series[s.key] ? `${s.color}20` : 'transparent',
                  color: 'inherit',
                  fontSize: '0.72rem',
                  opacity: series[s.key] ? 1 : 0.5,
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', maxHeight: '240px', overflow: 'visible' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={borderCol} strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill={mutedCol}>
                  {formatMetricValue(maxY * frac, evm.unitMode)}
                </text>
              </g>
            );
          })}

          {series.pv && <path d={buildPath('pv')} fill="none" stroke="#6366f1" strokeWidth="2.2" />}
          {series.ev && <path d={buildPath('ev')} fill="none" stroke="#10b981" strokeWidth="2.5" />}
          {series.ac && <path d={buildPath('ac')} fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeDasharray="5 3" />}

          {evm.buckets.map((b, i) => {
            const x = toX(i);
            const showTick = i === 0 || i === evm.buckets.length - 1 || i % Math.ceil(evm.buckets.length / 6) === 0;
            return (
              <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                <rect x={x - 12} y={padT} width={24} height={plotH} fill="transparent" style={{ cursor: 'crosshair' }} />
                {showTick && (
                  <text x={x} y={chartH - 10} textAnchor="middle" fontSize="9.5" fill={mutedCol}>
                    {b.label}
                  </text>
                )}
                {hoverIdx === i && (
                  <>
                    <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#38bdf8" strokeWidth="1" />
                    {series.pv && <circle cx={x} cy={toY(b.pv)} r={4} fill="#6366f1" />}
                    {series.ev && b.ev !== null && <circle cx={x} cy={toY(b.ev)} r={4} fill="#10b981" />}
                    {series.ac && b.ac !== null && <circle cx={x} cy={toY(b.ac)} r={4} fill="#f59e0b" />}
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {hoverIdx !== null && evm.buckets[hoverIdx] && (
          <div style={{ marginTop: '6px', fontSize: '0.74rem', color: mutedCol, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <strong>{evm.buckets[hoverIdx].label}</strong>
            <span>PV: <strong style={{ color: '#6366f1' }}>{formatMetricValue(evm.buckets[hoverIdx].pv, evm.unitMode)}</strong></span>
            {evm.buckets[hoverIdx].ev !== null && (
              <span>EV: <strong style={{ color: '#10b981' }}>{formatMetricValue(evm.buckets[hoverIdx].ev, evm.unitMode)}</strong></span>
            )}
            {evm.buckets[hoverIdx].ac !== null && (
              <span>AC: <strong style={{ color: '#f59e0b' }}>{formatMetricValue(evm.buckets[hoverIdx].ac, evm.unitMode)}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* WBS Variance Table */}
      <div
        style={{
          background: cardBg,
          border: `1px solid ${borderCol}`,
          borderRadius: '10px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>WBS Cost & Schedule Variance ({evm.wbsRows.length})</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '9px', opacity: 0.55 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter WBS..."
              style={{
                padding: '5px 8px 5px 26px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                border: `1px solid ${borderCol}`,
                background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                color: 'inherit',
                width: '210px',
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${borderCol}`, color: mutedCol, textAlign: 'left' }}>
                <th style={{ padding: '7px 8px' }}>WBS</th>
                <th style={{ padding: '7px 8px' }}>Tasks</th>
                <th style={{ padding: '7px 8px' }}>%</th>
                <th style={{ padding: '7px 8px' }}>BAC</th>
                <th style={{ padding: '7px 8px' }}>PV</th>
                <th style={{ padding: '7px 8px' }}>EV</th>
                <th style={{ padding: '7px 8px' }}>AC</th>
                <th style={{ padding: '7px 8px' }}>SPI</th>
                <th style={{ padding: '7px 8px' }}>CPI</th>
                <th style={{ padding: '7px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredWbs.map((w) => {
                const badgeColor =
                  w.health === 'On Track' ? '#10b981' : w.health === 'Watch' ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={w.wbsId} style={{ borderBottom: `1px solid ${borderCol}` }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.name}>
                      {w.name}
                    </td>
                    <td style={{ padding: '7px 8px' }}>{w.taskCount}</td>
                    <td style={{ padding: '7px 8px' }}>{w.pct}%</td>
                    <td style={{ padding: '7px 8px' }}>{formatMetricValue(w.bac, evm.unitMode)}</td>
                    <td style={{ padding: '7px 8px' }}>{formatMetricValue(w.pv, evm.unitMode)}</td>
                    <td style={{ padding: '7px 8px' }}>{formatMetricValue(w.ev, evm.unitMode)}</td>
                    <td style={{ padding: '7px 8px' }}>{formatMetricValue(w.ac, evm.unitMode)}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 700, color: w.spi >= 0.95 ? '#10b981' : w.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>
                      {w.spi.toFixed(2)}
                    </td>
                    <td style={{ padding: '7px 8px', fontWeight: 700, color: w.ac === 0 ? mutedCol : w.cpi >= 0.95 ? '#10b981' : '#f59e0b' }}>
                      {w.ac > 0 ? w.cpi.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '999px',
                          background: `${badgeColor}20`,
                          color: badgeColor,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                        }}
                      >
                        {w.health === 'On Track' ? <CheckCircle2 size={10} /> : w.health === 'Watch' ? <Clock size={10} /> : <AlertTriangle size={10} />}
                        {w.health}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
