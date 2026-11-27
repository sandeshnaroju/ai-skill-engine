import React, { useState, useMemo } from 'react';
import { Search, Crosshair, X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * gisAttributeTable.jsx
 * Paginated, searchable Attribute Table drawer for 20MB+ GIS datasets.
 * Clicking a row selects the feature and pans/zooms the map directly to it.
 */
export default function GisAttributeTable({
  features = [],
  selectedFeature,
  onSelectAndZoom,
  onClose,
  isDark = true
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 80;

  // Discover top property columns across sample features
  const columns = useMemo(() => {
    const colSet = new Set();
    const limit = Math.min(features.length, 200);
    for (let i = 0; i < limit; i++) {
      const props = features[i].properties || {};
      Object.keys(props).forEach((k) => colSet.add(k));
    }
    return Array.from(colSet).slice(0, 6);
  }, [features]);

  const filtered = useMemo(() => {
    if (!search.trim()) return features;
    const q = search.toLowerCase().trim();
    return features.filter((f) => {
      if ((f.geometry?.type || '').toLowerCase().includes(q)) return true;
      const vals = Object.values(f.properties || {});
      return vals.some((v) => String(v).toLowerCase().includes(q));
    });
  }, [features, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '260px',
        background: isDark ? 'rgba(11, 16, 27, 0.96)' : 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(16px)',
        borderTop: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 35,
        boxShadow: '0 -10px 30px rgba(0,0,0,0.35)'
      }}
    >
      {/* Table Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399' }}>
            Attribute Table ({filtered.length.toLocaleString()} features)
          </span>
          <div style={{ position: 'relative' }}>
            <Search
              size={12}
              style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
            />
            <input
              type="text"
              placeholder="Search attributes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '4px 10px 4px 26px',
                borderRadius: '6px',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
                background: isDark ? '#0f172a' : '#f8fafc',
                color: 'inherit',
                fontSize: '0.74rem',
                width: '210px'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem' }}>
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              padding: '3px 7px',
              borderRadius: '4px',
              border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
              background: 'transparent',
              color: 'inherit',
              cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
              opacity: safePage <= 1 ? 0.4 : 1
            }}
          >
            <ChevronLeft size={13} />
          </button>
          <span>
            Page {safePage} / {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              padding: '3px 7px',
              borderRadius: '4px',
              border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
              background: 'transparent',
              color: 'inherit',
              cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
              opacity: safePage >= totalPages ? 0.4 : 1
            }}
          >
            <ChevronRight size={13} />
          </button>
          <button
            onClick={onClose}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              opacity: 0.7
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
          <thead style={{ position: 'sticky', top: 0, background: isDark ? '#0f172a' : '#f1f5f9', zIndex: 2 }}>
            <tr style={{ borderBottom: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0' }}>
              <th style={{ padding: '7px 12px', width: '50px' }}>#</th>
              <th style={{ padding: '7px 12px', width: '110px' }}>Geometry</th>
              {columns.map((c) => (
                <th key={c} style={{ padding: '7px 12px' }}>
                  {c}
                </th>
              ))}
              <th style={{ padding: '7px 12px', width: '70px', textAlign: 'center' }}>Locate</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((f) => {
              const isSel = selectedFeature && selectedFeature.id === f.id;
              return (
                <tr
                  key={f.id}
                  onClick={() => onSelectAndZoom(f)}
                  style={{
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                    background: isSel ? 'rgba(245, 158, 11, 0.16)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <td style={{ padding: '6px 12px', opacity: 0.6 }}>{f.id + 1}</td>
                  <td style={{ padding: '6px 12px', fontWeight: 600, color: '#34d399' }}>
                    {f.geometry?.type}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c}
                      style={{
                        padding: '6px 12px',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {f.properties?.[c] !== undefined ? String(f.properties[c]) : '—'}
                    </td>
                  ))}
                  <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                    <Crosshair size={13} color="#34d399" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
