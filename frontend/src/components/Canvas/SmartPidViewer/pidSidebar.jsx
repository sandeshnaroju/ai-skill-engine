import React, { useState, useMemo } from 'react';
import { Search, Download, X, Tag, GitBranch, Cpu, ArrowRightLeft } from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'instrument', label: 'Instruments' },
  { value: 'valve', label: 'Valves' },
  { value: 'piping', label: 'Piping / Fittings' },
  { value: 'connector', label: 'Connectors' },
  { value: 'other', label: 'Other' },
];

export default function PidSidebar({
  parsed,
  selectedItem,
  onSelectItem,
  onExportCsv,
  onClose,
  isDark = true,
}) {
  const [activeTab, setActiveTab] = useState('symbols'); // 'symbols' | 'tags' | 'lines' | 'connectors'
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [];
    if (activeTab === 'symbols') {
      list = parsed.symbols.filter((s) => categoryFilter === 'all' || s.category === categoryFilter);
    } else if (activeTab === 'tags') {
      list = parsed.tags;
    } else if (activeTab === 'lines') {
      list = parsed.lineNumbers;
    } else {
      list = parsed.connectors;
    }

    if (!q) return list.slice(0, 300);
    return list
      .filter((item) => {
        const haystack = [item.id, item.name, item.tag_no, item.text, item.symbol_id, item.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 300);
  }, [activeTab, parsed, search, categoryFilter]);

  const panelBg = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)';
  const borderCol = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';

  const tabs = [
    { id: 'symbols', label: 'Symbols', count: parsed.symbols.length, icon: Cpu },
    { id: 'tags', label: 'Tags', count: parsed.tags.length, icon: Tag },
    { id: 'lines', label: 'Lines', count: parsed.lineNumbers.length, icon: GitBranch },
    { id: 'connectors', label: 'Conn', count: parsed.connectors.length, icon: ArrowRightLeft },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: '56px',
        left: '12px',
        bottom: '44px',
        width: '320px',
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <span style={{ fontSize: '12.5px', fontWeight: 700 }}>Smart P&ID Index</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={onExportCsv}
            title="Export Tag & Line Register (CSV)"
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
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              opacity: 0.65,
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px',
          padding: '6px 8px',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '5px 4px',
                borderRadius: '6px',
                border: 'none',
                background: active
                  ? isDark
                    ? 'rgba(56, 189, 248, 0.16)'
                    : 'rgba(2, 132, 199, 0.12)'
                  : 'transparent',
                color: active ? (isDark ? '#38bdf8' : '#0284c7') : mutedCol,
                fontSize: '10.5px',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Icon size={12} />
              <span>{t.label} ({t.count})</span>
            </button>
          );
        })}
      </div>

      {/* Search & Category Filter */}
      <div
        style={{
          padding: '8px',
          borderBottom: `1px solid ${borderCol}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={12} style={{ position: 'absolute', left: '9px', opacity: 0.55 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              fontSize: '12px',
              borderRadius: '6px',
              border: `1px solid ${borderCol}`,
              background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
              color: 'inherit',
              outline: 'none',
            }}
          />
        </div>

        {activeTab === 'symbols' && (
          <ModernSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={CATEGORY_OPTIONS}
            isDark={isDark}
            width="100%"
          />
        )}
      </div>

      {/* Items List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {items.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: mutedCol }}>
            No matching items found.
          </div>
        ) : (
          items.map((item) => {
            const isSel = selectedItem?.id === item.id && selectedItem?.kind === item.kind;
            const primary =
              item.kind === 'symbol'
                ? item.tag_no || item.name
                : item.text || item.id;
            const secondary =
              item.kind === 'symbol'
                ? `${item.name} • ${item.id}`
                : item.symbol_id
                  ? `Linked: ${item.symbol_id}`
                  : item.id;

            return (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => onSelectItem(item)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  marginBottom: '3px',
                  borderRadius: '6px',
                  border: isSel ? `1px solid ${item.color}` : '1px solid transparent',
                  background: isSel
                    ? isDark
                      ? 'rgba(56, 189, 248, 0.14)'
                      : 'rgba(2, 132, 199, 0.08)'
                    : 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {primary}
                  </div>
                  <div
                    style={{
                      fontSize: '10.5px',
                      color: mutedCol,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {secondary}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
