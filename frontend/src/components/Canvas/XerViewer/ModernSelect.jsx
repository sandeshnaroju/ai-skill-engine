import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

/**
 * ModernSelect
 * Enterprise-grade floating select dropdown with search filtering, colored badges,
 * icons, item count pills, and theme awareness.
 */
export default function ModernSelect({
  value,
  onChange,
  options = [],
  icon: TriggerIcon,
  labelPrefix,
  placeholder = 'Select...',
  isDark = true,
  searchable = false,
  minWidth = '140px',
  maxWidth = '320px',
  width = 'auto',
  customTriggerStyle = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (o) =>
        (o.label && o.label.toLowerCase().includes(q)) ||
        (o.subtext && o.subtext.toLowerCase().includes(q))
    );
  }, [options, search, searchable]);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        display: width === '100%' ? 'block' : 'inline-block',
        width: width === '100%' ? '100%' : 'auto'
      }}
    >
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch('');
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          height: '34px',
          width: width === '100%' ? '100%' : 'auto',
          padding: '0 12px',
          borderRadius: '7px',
          border: isOpen
            ? (isDark ? '1.5px solid #3b82f6' : '1.5px solid #2563eb')
            : (isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.14)'),
          background: isOpen
            ? (isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)')
            : (isDark ? '#0f172a' : '#ffffff'),
          color: isDark ? '#f8fafc' : '#0f172a',
          fontSize: '0.8rem',
          fontWeight: 500,
          cursor: 'pointer',
          minWidth: width === '100%' ? '100%' : minWidth,
          maxWidth: width === '100%' ? '100%' : maxWidth,
          boxShadow: isOpen
            ? '0 0 0 2px rgba(59, 130, 246, 0.2)'
            : (isDark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.06)'),
          transition: 'all 0.15s ease',
          userSelect: 'none',
          boxSizing: 'border-box',
          ...customTriggerStyle
        }}
      >
        {TriggerIcon && (
          <TriggerIcon
            size={14}
            style={{ color: isOpen ? '#3b82f6' : (isDark ? '#94a3b8' : '#64748b'), flexShrink: 0 }}
          />
        )}
        {selectedOption?.icon && (
          <span style={{ flexShrink: 0, fontSize: '0.85rem' }}>{selectedOption.icon}</span>
        )}
        {selectedOption?.badgeColor && (
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: selectedOption.badgeColor,
              flexShrink: 0
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {labelPrefix ? (
            <span style={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b', marginRight: '4px' }}>
              {labelPrefix}:
            </span>
          ) : null}
          <span style={{ fontWeight: selectedOption?.value !== 'ALL' ? 600 : 450 }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: isDark ? '#94a3b8' : '#64748b',
            flexShrink: 0,
            opacity: 0.7
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 5px)',
            width: width === '100%' ? '100%' : 'auto',
            minWidth: width === '100%' ? '100%' : Math.max(220, parseInt(minWidth, 10) || 200),
            maxWidth: width === '100%' ? '100%' : '380px',
            maxHeight: '340px',
            overflowY: 'auto',
            background: isDark ? '#0b1120' : '#ffffff',
            border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.14)',
            borderRadius: '9px',
            boxShadow: isDark
              ? '0 16px 36px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
              : '0 16px 36px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
            backdropFilter: 'blur(16px)',
            zIndex: 9999,
            padding: '6px',
            boxSizing: 'border-box'
          }}
        >
          {searchable && (
            <div
              style={{
                padding: '4px 6px 6px 6px',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                marginBottom: '4px'
              }}
            >
              <div style={{ position: 'relative' }}>
                <Search
                  size={12}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    opacity: 0.5
                  }}
                />
                <input
                  type="text"
                  placeholder="Filter options..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '5px 8px 5px 26px',
                    borderRadius: '6px',
                    border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.15)',
                    background: isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                    color: 'inherit',
                    fontSize: '0.74rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px 10px', textAlign: 'center', fontSize: '0.74rem', opacity: 0.5 }}>
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={String(opt.value)}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? 650 : 450,
                      background: isSelected
                        ? (isDark ? 'rgba(59, 130, 246, 0.18)' : 'rgba(59, 130, 246, 0.12)')
                        : 'transparent',
                      color: isSelected ? '#3b82f6' : (isDark ? '#e2e8f0' : '#1e293b'),
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = isDark
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                        flex: 1,
                        paddingRight: '8px'
                      }}
                    >
                      {opt.icon && <span style={{ flexShrink: 0 }}>{opt.icon}</span>}
                      {opt.badgeColor && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: opt.badgeColor,
                            flexShrink: 0
                          }}
                        />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opt.label}
                        </span>
                        {opt.subtext && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              opacity: 0.6,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {opt.subtext}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {opt.count !== undefined && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            color: isDark ? '#94a3b8' : '#64748b',
                            fontWeight: 600
                          }}
                        >
                          {opt.count}
                        </span>
                      )}
                      {isSelected && <Check size={13} color="#3b82f6" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
