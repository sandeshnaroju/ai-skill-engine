import React, { useState, useMemo } from 'react';
import { Eye, EyeOff, Search, Crosshair, Box } from 'lucide-react';

/**
 * cad3dTreePanel.jsx
 * Interactive Model / Assembly Tree sidebar for 3D CAD & BIM models.
 * Supports searching parts, toggling visibility, isolating a part, and showing triangle counts.
 */
export default function Cad3dTreePanel({
  parts = [],
  hiddenPartIds,
  selectedPartId,
  onTogglePart,
  onIsolatePart,
  onShowAll,
  onSelectPart,
  onClose,
  isDark = true
}) {
  const [search, setSearch] = useState('');

  const filteredParts = useMemo(() => {
    if (!search.trim()) return parts;
    const q = search.toLowerCase().trim();
    return parts.filter((p) => p.name.toLowerCase().includes(q));
  }, [parts, search]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        width: '270px',
        maxHeight: 'calc(100% - 24px)',
        background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
        borderRadius: '10px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          fontWeight: 650,
          fontSize: '0.82rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Box size={14} color="#38bdf8" />
          <span>Assembly Tree ({parts.length})</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            opacity: 0.6
          }}
        >
          ✕
        </button>
      </div>

      {/* Search & Show All */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <div style={{ position: 'relative' }}>
          <Search
            size={12}
            style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
          />
          <input
            type="text"
            placeholder="Filter parts / components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px 5px 26px',
              borderRadius: '6px',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
              background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
              color: 'inherit',
              fontSize: '0.74rem',
              boxSizing: 'border-box'
            }}
          />
        </div>
        {hiddenPartIds.size > 0 && (
          <button
            onClick={onShowAll}
            style={{
              padding: '4px',
              fontSize: '0.7rem',
              fontWeight: 600,
              borderRadius: '5px',
              border: 'none',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              cursor: 'pointer'
            }}
          >
            Show All Parts ({parts.length})
          </button>
        )}
      </div>

      {/* Parts List */}
      <div style={{ overflowY: 'auto', padding: '6px', flex: 1 }}>
        {filteredParts.map((part) => {
          const isHidden = hiddenPartIds.has(part.id);
          const isSelected = selectedPartId === part.id;
          return (
            <div
              key={part.id}
              onClick={() => onSelectPart(part)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isSelected
                  ? 'rgba(56, 189, 248, 0.18)'
                  : isDark
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(0,0,0,0.02)',
                border: isSelected ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid transparent',
                opacity: isHidden ? 0.42 : 1,
                marginBottom: '2px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '6px' }}>
                <div
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '2px',
                    background: part.color || '#38bdf8',
                    flexShrink: 0
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 650 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {part.name}
                  </div>
                  <div style={{ fontSize: '0.66rem', opacity: 0.6 }}>
                    {part.triangles.toLocaleString()} tris
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onIsolatePart(part.id);
                  }}
                  title="Isolate Part"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: '3px',
                    opacity: 0.65
                  }}
                >
                  <Crosshair size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePart(part.id);
                  }}
                  title={isHidden ? 'Show Part' : 'Hide Part'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isHidden ? 'inherit' : '#38bdf8',
                    cursor: 'pointer',
                    padding: '3px'
                  }}
                >
                  {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
