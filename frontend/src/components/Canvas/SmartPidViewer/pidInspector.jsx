import React from 'react';
import { X, Crosshair, Tag, ArrowRightLeft, Cpu } from 'lucide-react';

export default function PidInspector({
  item,
  parsed,
  onSelectItem,
  onFocusItem,
  onClose,
  isDark = true,
}) {
  if (!item) return null;

  const panelBg = isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)';
  const borderCol = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';

  const parentSymbol =
    item.kind === 'symbol'
      ? item
      : item.symbol_id
        ? parsed.symbolById.get(item.symbol_id)
        : null;

  const linkedTags = parentSymbol ? parsed.tagsBySymbolId.get(parentSymbol.id) || [] : [];
  const linkedConnectors = parentSymbol ? parsed.connectorsBySymbolId.get(parentSymbol.id) || [] : [];

  return (
    <div
      style={{
        position: 'absolute',
        top: '56px',
        right: '12px',
        width: '290px',
        background: panelBg,
        backdropFilter: 'blur(14px)',
        border: `1px solid ${borderCol}`,
        borderRadius: '10px',
        padding: '12px',
        zIndex: 30,
        boxShadow: '0 16px 32px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '2px',
              background: item.color,
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
            {item.kind} • {item.id}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => onFocusItem(item)}
            title="Zoom to element"
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#38bdf8' : '#0284c7',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <Crosshair size={14} />
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

      {/* Traced Vector SVG Preview when available */}
      {parentSymbol?.svg && !parentSymbol.svg.includes('data-engine="empty"') && (
        <div
          style={{
            height: '84px',
            borderRadius: '8px',
            border: `1px solid ${borderCol}`,
            background: isDark ? '#f8fafc' : '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            color: '#0f172a',
          }}
          dangerouslySetInnerHTML={{
            __html: parentSymbol.svg.replace(
              '<svg ',
              '<svg style="max-width:64px; max-height:64px; width:auto; height:auto;" '
            ),
          }}
        />
      )}

      <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {item.kind === 'symbol' ? (
          <>
            <div>
              <span style={{ color: mutedCol }}>Type: </span>
              <strong>{item.name}</strong>
            </div>
            {item.tag_no && (
              <div>
                <span style={{ color: mutedCol }}>Tag No: </span>
                <strong>{item.tag_no}</strong>
              </div>
            )}
            <div>
              <span style={{ color: mutedCol }}>Category: </span>
              <span>{item.category}</span>
            </div>
          </>
        ) : (
          <div>
            <span style={{ color: mutedCol }}>Text: </span>
            <strong>{item.text}</strong>
          </div>
        )}
        <div style={{ fontSize: '11px', color: mutedCol }}>
          Bounds: ({item.x0}, {item.y0}) → ({item.x1}, {item.y1})
        </div>
      </div>

      {/* Linked Symbol / Tags / Connectors */}
      {item.kind !== 'symbol' && parentSymbol && (
        <button
          type="button"
          onClick={() => onSelectItem(parentSymbol)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            borderRadius: '6px',
            border: `1px solid ${borderCol}`,
            background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
            color: 'inherit',
            fontSize: '11.5px',
            cursor: 'pointer',
          }}
        >
          <Cpu size={12} />
          <span>Parent Symbol: <strong>{parentSymbol.name}</strong> ({parentSymbol.id})</span>
        </button>
      )}

      {linkedTags.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: mutedCol, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Tag size={11} /> Linked Tags ({linkedTags.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {linkedTags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectItem(t)}
                style={{
                  padding: '3px 7px',
                  borderRadius: '999px',
                  border: `1px solid ${t.color}`,
                  background: 'rgba(236, 72, 153, 0.12)',
                  color: 'inherit',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {t.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {linkedConnectors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: mutedCol, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowRightLeft size={11} /> Linked Connectors ({linkedConnectors.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {linkedConnectors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectItem(c)}
                style={{
                  padding: '3px 7px',
                  borderRadius: '999px',
                  border: `1px solid ${c.color}`,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'inherit',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {c.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
