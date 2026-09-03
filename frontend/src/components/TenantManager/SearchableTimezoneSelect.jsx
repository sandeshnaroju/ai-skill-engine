import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, Globe, X } from 'lucide-react';

// Common popular timezones displayed at the top
const POPULAR_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

// Helper to get formatted GMT offset
function getTzOffset(tz) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch (e) {
    return '';
  }
}

export default function SearchableTimezoneSelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Collect all official IANA world timezones once
  const allTimezones = useMemo(() => {
    let list = [];
    try {
      if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
        list = Intl.supportedValuesOf('timeZone');
      }
    } catch (e) {}

    if (!list || list.length === 0) {
      list = POPULAR_TIMEZONES;
    }

    // Keep only Asia/Kolkata and remove legacy alias Asia/Calcutta
    list = list.filter((tz) => tz !== 'Asia/Calcutta');
    if (!list.includes('Asia/Kolkata')) list.push('Asia/Kolkata');
    const effectiveValue = value === 'Asia/Calcutta' ? 'Asia/Kolkata' : value;
    if (effectiveValue && !list.includes(effectiveValue)) list.unshift(effectiveValue);

    return list.map((tz) => {
      const offset = getTzOffset(tz);
      return {
        value: tz,
        label: offset ? `${tz} (${offset})` : tz,
        offset,
        searchKey: `${tz} ${offset} ${tz.replace('/', ' ')} ${tz.replace('_', ' ')}`.toLowerCase(),
      };
    });
  }, [value]);

  // Current selected label
  const selectedItem = useMemo(() => {
    const found = allTimezones.find((item) => item.value === value);
    if (found) return found;
    const offset = getTzOffset(value);
    return {
      value,
      label: offset ? `${value} (${offset})` : value,
    };
  }, [value, allTimezones]);

  // Filtered list based on search query
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return allTimezones;
    }
    // Match against city, continent, alias, or offset (e.g., "5:30", "india", "calcutta", "kolkata")
    return allTimezones.filter((item) => {
      if (item.searchKey.includes(q)) return true;
      if (q === 'india' && (item.value === 'Asia/Kolkata' || item.value === 'Asia/Calcutta')) return true;
      return false;
    });
  }, [search, allTimezones]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto focus search input when opened
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation: Escape to close
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (tzValue) => {
    // Normalize Asia/Calcutta to Asia/Kolkata if selected, or keep exact
    const finalVal = tzValue === 'Asia/Calcutta' ? 'Asia/Kolkata' : tzValue;
    onChange(finalVal);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: '280px', maxWidth: '380px', flex: '1 1 auto' }} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`timezone-select-toggle ${isOpen ? 'open' : ''}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <Globe size={15} color="var(--primary-cyan)" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }}>
            {selectedItem.label}
          </span>
        </div>
        <ChevronDown
          size={15}
          color="var(--text-muted)"
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="timezone-select-menu">
          {/* Search Box Header */}
          <div className="timezone-select-search">
            <Search size={15} color="var(--primary-cyan)" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search city, region, or offset (e.g. Kolkata, New York, +5:30)..."
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Timezone List */}
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {filteredList.length === 0 ? (
              <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                No matching timezones found
              </div>
            ) : (
              filteredList.map((item) => {
                const isSelected = item.value === value || (value === 'Asia/Calcutta' && item.value === 'Asia/Kolkata');
                return (
                  <div
                    key={item.value}
                    onClick={() => handleSelect(item.value)}
                    className={`timezone-select-option ${isSelected ? 'selected' : ''}`}
                  >
                    <span>{item.label}</span>
                    {isSelected && <Check size={14} color="var(--primary-cyan)" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="timezone-select-footer">
            <span>Showing {filteredList.length} of {allTimezones.length} world timezones</span>
            <span>Supports all IANA regions</span>
          </div>
        </div>
      )}
    </div>
  );
}
