import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// Simple debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Dropdown menu rendered via portal directly into document.body
// so it is never clipped by parent overflow or stacking contexts
function DropdownPortal({ anchorRef, isOpen, children }) {
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuMaxHeight = 260;

    // If not enough space below, open upwards
    if (spaceBelow < menuMaxHeight && rect.top > menuMaxHeight) {
      setStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
        maxWidth: 320,
        zIndex: 99999,
      });
    } else {
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
        maxWidth: 320,
        zIndex: 99999,
      });
    }
  }, [isOpen, anchorRef]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="async-dropdown-menu" style={style}>
      {children}
    </div>,
    document.body
  );
}

const AsyncSearchableDropdown = ({
  value,
  onChange,
  fetchOptions,
  placeholder = "Select an option...",
  disabled = false,
  className = "",
  initialLabel = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(
    initialLabel || (value ? String(value) : placeholder)
  );

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Store fetchOptions in a ref to avoid effect re-runs
  const fetchOptionsRef = useRef(fetchOptions);
  useEffect(() => { fetchOptionsRef.current = fetchOptions; }, [fetchOptions]);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        // Also check if click is inside the portal menu
        const portalMenu = document.querySelector('.async-dropdown-menu');
        if (portalMenu && portalMenu.contains(e.target)) return;
        close();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on resize so menu tracks anchor correctly
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => close();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setSearchTerm('');
  }

  // Fetch options when dropdown opens or search changes
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const results = await fetchOptionsRef.current(debouncedSearchTerm);
        if (!cancelled) setOptions(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error('AsyncSearchableDropdown fetch error:', err);
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen, debouncedSearchTerm]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Sync displayed label
  useEffect(() => {
    if (value === null || value === undefined || value === '') {
      setCurrentLabel(initialLabel || placeholder);
    } else {
      const match = options.find(o => String(o.value) === String(value));
      if (match) {
        setCurrentLabel(match.label);
      } else if (initialLabel) {
        setCurrentLabel(initialLabel);
      } else {
        setCurrentLabel(String(value));
      }
    }
  }, [value, options, placeholder, initialLabel]);

  // Update label when initialLabel resolves asynchronously
  useEffect(() => {
    if (initialLabel) setCurrentLabel(initialLabel);
  }, [initialLabel]);

  const menuContent = (
    <>
      {/* Search bar */}
      <div className="async-dropdown-search-wrapper">
        <svg className="async-dropdown-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          className="async-dropdown-search-input"
          placeholder="Search..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setSearchTerm(''); }}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {/* Options list */}
      <div className="async-dropdown-options">
        {isLoading ? (
          <div className="async-dropdown-loading">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" className="spin">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Loading...
          </div>
        ) : options.length > 0 ? (
          options.map((option, idx) => (
            <div
              key={`${option.value}-${idx}`}
              className={`async-dropdown-option ${String(value) === String(option.value) ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setCurrentLabel(option.label);
                close();
              }}
            >
              {option.label}
            </div>
          ))
        ) : (
          <div className="async-dropdown-no-results">
            {searchTerm ? `No results for "${searchTerm}"` : 'No options available'}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className={`async-dropdown-container ${className}`} ref={containerRef}>
      {/* Toggle button */}
      <button
        type="button"
        className={`async-dropdown-toggle ${disabled ? 'disabled' : ''}`}
        onClick={() => { if (!disabled) { isOpen ? close() : setIsOpen(true); } }}
        disabled={disabled}
      >
        <span className="truncate">{currentLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Dropdown menu rendered via portal to escape stacking contexts */}
      <DropdownPortal anchorRef={containerRef} isOpen={isOpen}>
        {menuContent}
      </DropdownPortal>
    </div>
  );
};

export default AsyncSearchableDropdown;
