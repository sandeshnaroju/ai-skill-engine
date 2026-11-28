import React, { useState, useMemo } from 'react';
import { Search, Download, X } from 'lucide-react';
import {
  exportDexpiEquipmentCsv,
  exportDexpiLinesCsv,
  exportDexpiValvesCsv,
  exportDexpiInstrumentsCsv,
} from './dexpiParser';

export default function DexpiSchedulePanel({
  model,
  selectedId,
  onSelectEntity,
  onClose,
  isDark,
  baseName = 'dexpi',
}) {
  const [activeTab, setActiveTab] = useState('equipment');
  const [query, setQuery] = useState('');

  const colors = {
    bg: isDark ? '#111827' : '#ffffff',
    surfaceAlt: isDark ? '#161f30' : '#f1f5f9',
    border: isDark ? '#1f2937' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#3b82f6',
    accentSoft: isDark ? 'rgba(59, 130, 246, 0.16)' : '#eff6ff',
  };

  const tabs = [
    { key: 'equipment', label: `Equipment (${model.equipmentList.length})` },
    { key: 'lines', label: `Line List (${model.lineList.length})` },
    { key: 'valves', label: `Valves (${model.valveList.length})` },
    { key: 'instruments', label: `Instruments (${model.instrumentList.length})` },
  ];

  const q = query.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    const src =
      activeTab === 'equipment'
        ? model.equipmentList
        : activeTab === 'lines'
        ? model.lineList
        : activeTab === 'valves'
        ? model.valveList
        : model.instrumentList;
    if (!q) return src;
    return src.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [activeTab, model, q]);

  const handleExport = () => {
    if (activeTab === 'equipment') exportDexpiEquipmentCsv(filteredRows, `${baseName}_equipment.csv`);
    else if (activeTab === 'lines') exportDexpiLinesCsv(filteredRows, `${baseName}_line_list.csv`);
    else if (activeTab === 'valves') exportDexpiValvesCsv(filteredRows, `${baseName}_valves.csv`);
    else exportDexpiInstrumentsCsv(filteredRows, `${baseName}_instruments.csv`);
  };

  return (
    <div
      style={{
        height: 250,
        minHeight: 190,
        borderTop: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${activeTab === t.key ? colors.accent : colors.border}`,
                background: activeTab === t.key ? colors.accentSoft : colors.surfaceAlt,
                color: activeTab === t.key ? colors.accent : colors.text,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter rows..."
              style={{
                padding: '4px 8px 4px 24px',
                fontSize: 11,
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.surfaceAlt,
                color: colors.text,
                outline: 'none',
                width: 170,
              }}
            />
          </div>
          <button
            onClick={handleExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 9px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceAlt,
              color: colors.text,
              cursor: 'pointer',
            }}
          >
            <Download size={12} /> CSV
          </button>
          <button
            onClick={onClose}
            title="Close Schedule Drawer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: colors.surfaceAlt,
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead style={{ position: 'sticky', top: 0, background: colors.surfaceAlt, zIndex: 1 }}>
            <tr>
              {activeTab === 'equipment' &&
                ['TagName', 'Class', 'Service', 'Material', 'Design P', 'Design T', 'Nozzles'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              {activeTab === 'lines' &&
                ['Line Tag', 'DN', 'Piping Class', 'Fluid', 'Insulation', 'Segments', 'Connections'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              {activeTab === 'valves' &&
                ['TagName', 'Class', 'Line Tag', 'DN', 'Piping Class', 'Fail Action'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              {activeTab === 'instruments' &&
                ['TagName', 'Class', 'Measured Variable', 'Loop ID', 'Location'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: colors.textMuted }}>
                  No records found.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isSel = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelectEntity(row.id)}
                    style={{
                      cursor: 'pointer',
                      background: isSel ? colors.accentSoft : 'transparent',
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    {activeTab === 'equipment' && (
                      <>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{row.tagName}</td>
                        <td style={{ padding: '6px 10px' }}>{row.componentClass}</td>
                        <td style={{ padding: '6px 10px', color: colors.textMuted }}>{row.service || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.material || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.designPressure || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.designTemp || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.nozzleCount}</td>
                      </>
                    )}
                    {activeTab === 'lines' && (
                      <>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{row.lineTag}</td>
                        <td style={{ padding: '6px 10px' }}>{row.nominalDiameter || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.pipingClass || '—'}</td>
                        <td style={{ padding: '6px 10px', color: colors.textMuted }}>{row.fluid || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.insulation || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.segmentCount}</td>
                        <td style={{ padding: '6px 10px' }}>{row.connections}</td>
                      </>
                    )}
                    {activeTab === 'valves' && (
                      <>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{row.tagName}</td>
                        <td style={{ padding: '6px 10px' }}>{row.componentClass}</td>
                        <td style={{ padding: '6px 10px' }}>{row.lineTag || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.nominalDiameter || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.pipingClass || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.failAction || '—'}</td>
                      </>
                    )}
                    {activeTab === 'instruments' && (
                      <>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{row.tagName}</td>
                        <td style={{ padding: '6px 10px' }}>{row.componentClass}</td>
                        <td style={{ padding: '6px 10px' }}>{row.measuredVariable || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.loopId || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{row.location || '—'}</td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
