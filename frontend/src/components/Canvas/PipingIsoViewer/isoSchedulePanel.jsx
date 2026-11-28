import React, { useState, useMemo } from 'react';
import { X, Search, Download, Flame, Layers, Package } from 'lucide-react';
import { exportIsoMtoCsv, exportIsoWeldLogCsv } from './pcfIdfParser';

export default function IsoSchedulePanel({
  parsed,
  filename,
  selectedSpoolId,
  onSelectSpool,
  onFocusComponent,
  onClose,
  isDark = true,
}) {
  const [tab, setTab] = useState('mto'); // 'mto' | 'welds' | 'spools'
  const [query, setQuery] = useState('');

  const panelBg = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)';
  const borderCol = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';
  const rowBg = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';

  const lenDiv = parsed.unitsCoords === 'INCH' ? 12 : 1000;
  const lenUnit = parsed.unitsCoords === 'INCH' ? 'ft' : 'm';
  const q = query.trim().toLowerCase();

  const mtoRows = useMemo(
    () =>
      parsed.mtoSummary.filter(
        (m) =>
          !q ||
          m.type.toLowerCase().includes(q) ||
          m.itemCode.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      ),
    [parsed.mtoSummary, q]
  );

  const weldRows = useMemo(
    () =>
      parsed.weldLog.filter(
        (w) =>
          !q ||
          w.id.toLowerCase().includes(q) ||
          w.spoolId.toLowerCase().includes(q) ||
          w.shopField.toLowerCase().includes(q)
      ),
    [parsed.weldLog, q]
  );

  const spoolRows = useMemo(
    () =>
      parsed.spools.filter((s) => !q || s.spoolId.toLowerCase().includes(q)),
    [parsed.spools, q]
  );

  const tabs = [
    { id: 'mto', label: `MTO (${parsed.mtoSummary.length})`, icon: Package },
    { id: 'welds', label: `Welds (${parsed.weldLog.length})`, icon: Flame },
    { id: 'spools', label: `Spools (${parsed.spools.length})`, icon: Layers },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '56px',
        left: '12px',
        bottom: '42px',
        width: '340px',
        background: panelBg,
        backdropFilter: 'blur(14px)',
        border: `1px solid ${borderCol}`,
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        boxShadow: '0 16px 32px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: `1px solid ${borderCol}` }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Isometric Engineering Data</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => (tab === 'welds' ? exportIsoWeldLogCsv(parsed, filename) : exportIsoMtoCsv(parsed, filename))}
            title="Export CSV"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '5px',
              border: `1px solid ${borderCol}`,
              background: isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.1)',
              color: isDark ? '#38bdf8' : '#0284c7',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={11} /> CSV
          </button>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.65, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', padding: '6px 8px', borderBottom: `1px solid ${borderCol}` }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 4px',
                borderRadius: '6px',
                border: 'none',
                background: active ? (isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(2, 132, 199, 0.12)') : 'transparent',
                color: active ? (isDark ? '#38bdf8' : '#0284c7') : mutedCol,
                fontSize: '11px',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '8px', borderBottom: `1px solid ${borderCol}` }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: '9px', opacity: 0.55 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}...`}
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              fontSize: '12px',
              borderRadius: '6px',
              border: `1px solid ${borderCol}`,
              background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
              color: 'inherit',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {tab === 'mto' &&
          mtoRows.map((m, idx) => (
            <div key={idx} style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${borderCol}`, background: rowBg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
                <span>{m.type}</span>
                <span style={{ color: '#38bdf8' }}>
                  {m.totalLength > 0 ? `${(m.totalLength / lenDiv).toFixed(2)} ${lenUnit}` : `Qty: ${m.qty}`}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: mutedCol, marginTop: '2px' }}>
                {m.description} • Bore {m.bore} {parsed.unitsBore} • Code: {m.itemCode}
              </div>
            </div>
          ))}

        {tab === 'welds' &&
          weldRows.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onFocusComponent(w.component)}
              style={{
                textAlign: 'left',
                padding: '7px 10px',
                borderRadius: '7px',
                border: `1px solid ${borderCol}`,
                background: rowBg,
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{w.id} • Spool {w.spoolId}</div>
                <div style={{ fontSize: '10.5px', color: mutedCol }}>Bore {w.bore} {parsed.unitsBore}</div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: w.shopField === 'FIELD' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                  color: w.shopField === 'FIELD' ? '#10b981' : '#ef4444',
                }}
              >
                {w.shopField}
              </span>
            </button>
          ))}

        {tab === 'spools' &&
          spoolRows.map((sp) => {
            const active = selectedSpoolId === sp.spoolId;
            return (
              <button
                key={sp.spoolId}
                type="button"
                onClick={() => onSelectSpool(active ? null : sp.spoolId)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${active ? sp.color : borderCol}`,
                  background: active ? `${sp.color}22` : rowBg,
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: sp.color }} />
                    {sp.spoolId}
                  </span>
                  <span style={{ fontSize: '11px', color: mutedCol }}>{sp.components.length} items</span>
                </div>
                <div style={{ fontSize: '10.5px', color: mutedCol, marginTop: '3px' }}>
                  Pipe: {(sp.pipeLength / lenDiv).toFixed(2)} {lenUnit} • Welds: {sp.weldCount}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
