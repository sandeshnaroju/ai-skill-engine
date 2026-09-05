import React, { useState, useEffect } from 'react';
import { Plus, History, Save, Trash2, X, Edit3, FileSpreadsheet } from 'lucide-react';
import { artifactsApi } from '../../api';

export default function SheetGrid({
  blocks = [],
  artifactId,
  token,
  onOpenHistory,
  onBlockUpdated
}) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editingColIdx, setEditingColIdx] = useState(null);
  const [editingSheetIdx, setEditingSheetIdx] = useState(null);

  const sanitizeCol = (c, i) => {
    if (c === null || c === undefined) return `Col ${i + 1}`;
    if (typeof c === 'string' || typeof c === 'number') return String(c);
    if (typeof c === 'object') return c.name || c.title || c.label || c.header || `Col ${i + 1}`;
    return String(c);
  };

  const sanitizeCell = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object') {
      if (val.value !== undefined) return String(val.value);
      if (val.name !== undefined) return String(val.name);
      if (val.text !== undefined) return String(val.text);
      if (val.label !== undefined) return String(val.label);
      return JSON.stringify(val);
    }
    return String(val);
  };

  const sanitizeRows = (rows, cols) => {
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => {
      if (Array.isArray(r)) {
        return r.map(sanitizeCell);
      }
      if (typeof r === 'object' && r !== null) {
        return cols.map((c) => {
          const colKey = typeof c === 'string' ? c : (c.name || c.title || '');
          const val = r[colKey] !== undefined ? r[colKey] : r[c] !== undefined ? r[c] : Object.values(r)[0];
          return sanitizeCell(val);
        });
      }
      return [sanitizeCell(r)];
    });
  };

  const parseBlockToSheet = (b) => {
    const raw = String(b.content || '').trim();
    // 1. Try parsing JSON format: { sheet_name, columns, rows } or { sheets: [...] }
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (Array.isArray(data.sheets) && data.sheets.length > 0) {
          return data.sheets.map((s, idx) => {
            const rawCols = Array.isArray(s.columns) && s.columns.length > 0 ? s.columns : ['Col A', 'Col B', 'Col C'];
            const cols = rawCols.map(sanitizeCol);
            return {
              block_key: b.block_key,
              name: s.sheet_name || s.name || `Sheet ${idx + 1}`,
              columns: cols,
              rows: sanitizeRows(s.rows, rawCols)
            };
          });
        }
        const rawCols = Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : ['Col A', 'Col B', 'Col C'];
        const cols = rawCols.map(sanitizeCol);
        return [{
          block_key: b.block_key,
          name: data.sheet_name || data.name || b.title || 'Sheet 1',
          columns: cols,
          rows: sanitizeRows(data.rows, rawCols)
        }];
      }
    } catch { }

    // 2. Try parsing Markdown table format:
    if (raw.includes('|')) {
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'));
      if (lines.length >= 2) {
        const parseRow = (line) => line.slice(1, -1).split('|').map(c => c.trim());
        const header = parseRow(lines[0]);
        const startIdx = lines[1].includes('---') ? 2 : 1;
        const rows = lines.slice(startIdx).map(parseRow);
        const cols = (header.length > 0 ? header : ['Col A', 'Col B', 'Col C']).map(sanitizeCol);
        return [{
          block_key: b.block_key,
          name: b.title || 'Sheet 1',
          columns: cols,
          rows: rows.map(r => r.map(sanitizeCell))
        }];
      }
    }

    // 3. Fallback: parse CSV / TSV lines
    const lines = raw.split('\n').filter(Boolean).map((l) => {
      if (l.includes('\t')) return l.split('\t').map(c => c.trim());
      return l.split(',').map(c => c.trim());
    });
    const rawColumns = lines[0] && lines[0].length > 0 ? lines[0] : ['Col A', 'Col B', 'Col C'];
    const columns = rawColumns.map(sanitizeCol);
    const rows = lines.slice(1).map(r => r.map(sanitizeCell));
    return [{
      block_key: b.block_key,
      name: b.title || 'Sheet 1',
      columns,
      rows
    }];
  };

  const getParsedSheets = () => {
    if (!blocks || blocks.length === 0) {
      return [{ block_key: 'sheet_1', name: 'Sheet 1', columns: ['Col A', 'Col B', 'Col C'], rows: [['', '', ''], ['', '', '']] }];
    }
    const all = [];
    blocks.forEach(b => {
      all.push(...parseBlockToSheet(b));
    });
    return all.length > 0 ? all : [{ block_key: 'sheet_1', name: 'Sheet 1', columns: ['Col A', 'Col B', 'Col C'], rows: [['', '', ''], ['', '', '']] }];
  };

  const [sheets, setSheets] = useState(getParsedSheets);

  // Sync state whenever external blocks prop changes
  useEffect(() => {
    setSheets(getParsedSheets());
  }, [blocks]);

  const currentSheet = sheets[activeSheetIndex] || sheets[0] || { columns: ['Col A', 'Col B', 'Col C'], rows: [], block_key: 'sheet_1', name: 'Sheet 1' };

  // ── Cell Value Editing ──
  const handleCellChange = (rowIdx, colIdx, value) => {
    const updated = [...sheets];
    const newRows = [...(updated[activeSheetIndex]?.rows || [])];
    newRows[rowIdx] = [...(newRows[rowIdx] || [])];
    newRows[rowIdx][colIdx] = value;
    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      rows: newRows
    };
    setSheets(updated);
  };

  // ── Row Operations ──
  const handleAddRow = () => {
    const updated = [...sheets];
    const colsCount = currentSheet.columns.length || 3;
    const newRow = new Array(colsCount).fill('');
    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      rows: [...(currentSheet.rows || []), newRow]
    };
    setSheets(updated);
  };

  const handleDeleteRow = (rowIdx) => {
    const updated = [...sheets];
    const newRows = (currentSheet.rows || []).filter((_, idx) => idx !== rowIdx);
    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      rows: newRows
    };
    setSheets(updated);
  };

  // ── Column Operations ──
  const handleAddColumn = () => {
    const updated = [...sheets];
    const nextColNum = currentSheet.columns.length + 1;
    const newColName = `Col ${colLetter(currentSheet.columns.length)}`;
    const newColumns = [...currentSheet.columns, newColName];
    const newRows = (currentSheet.rows || []).map(row => [...(row || []), '']);

    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      columns: newColumns,
      rows: newRows
    };
    setSheets(updated);
  };

  const handleDeleteColumn = (colIdx) => {
    if (currentSheet.columns.length <= 1) {
      alert('Spreadsheet must have at least one column.');
      return;
    }
    const updated = [...sheets];
    const newColumns = currentSheet.columns.filter((_, idx) => idx !== colIdx);
    const newRows = (currentSheet.rows || []).map(row => (row || []).filter((_, idx) => idx !== colIdx));

    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      columns: newColumns,
      rows: newRows
    };
    setSheets(updated);
  };

  const handleRenameColumn = (colIdx, newName) => {
    const updated = [...sheets];
    const newColumns = [...currentSheet.columns];
    newColumns[colIdx] = newName || `Col ${colLetter(colIdx)}`;
    updated[activeSheetIndex] = {
      ...updated[activeSheetIndex],
      columns: newColumns
    };
    setSheets(updated);
  };

  // ── Sheet Tab Operations ──
  const handleAddSheet = () => {
    const newSheetName = `Sheet ${sheets.length + 1}`;
    const newSheet = {
      block_key: currentSheet.block_key || 'sheet_1',
      name: newSheetName,
      columns: ['Col A', 'Col B', 'Col C'],
      rows: [['', '', ''], ['', '', ''], ['', '', '']]
    };
    const updated = [...sheets, newSheet];
    setSheets(updated);
    setActiveSheetIndex(updated.length - 1);
  };

  const handleDeleteSheet = (sheetIdx, e) => {
    e.stopPropagation();
    if (sheets.length <= 1) {
      alert('At least one sheet is required.');
      return;
    }
    const updated = sheets.filter((_, idx) => idx !== sheetIdx);
    setSheets(updated);
    if (activeSheetIndex >= updated.length) {
      setActiveSheetIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleRenameSheet = (sheetIdx, newName) => {
    const updated = [...sheets];
    updated[sheetIdx] = {
      ...updated[sheetIdx],
      name: newName || `Sheet ${sheetIdx + 1}`
    };
    setSheets(updated);
  };

  // ── Save All Sheets to Backend ──
  const handleSaveSheet = async () => {
    try {
      setSaving(true);
      let payload;
      if (sheets.length > 1) {
        payload = {
          sheets: sheets.map(s => ({
            sheet_name: s.name,
            columns: s.columns,
            rows: s.rows
          }))
        };
      } else {
        payload = {
          sheet_name: currentSheet.name,
          columns: currentSheet.columns,
          rows: currentSheet.rows
        };
      }

      const targetBlockKey = currentSheet.block_key || (blocks[0] ? blocks[0].block_key : 'sheet_1');
      await artifactsApi.updateBlock(
        artifactId,
        targetBlockKey,
        JSON.stringify(payload, null, 2),
        'Updated spreadsheet sheets, rows, and columns',
        token
      );

      if (onBlockUpdated) {
        onBlockUpdated(targetBlockKey, JSON.stringify(payload));
      }
    } catch (err) {
      alert(err.message || 'Failed to save sheet changes');
    } finally {
      setSaving(false);
    }
  };

  // Generate column labels A, B, C...
  const colLetter = (idx) => {
    if (idx < 26) return String.fromCharCode(65 + idx);
    const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
    const second = String.fromCharCode(65 + (idx % 26));
    return `${first}${second}`;
  };

  return (
    <div className="sheet-container">
      {/* ── Top Sheet Bar (Tabs + Action Toolbar) ── */}
      <div className="sheet-toolbar">
        {/* Sheet Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', overflowX: 'auto', minWidth: 0, padding: '2px 0' }}>
          {sheets.map((s, idx) => (
            <div
              key={idx}
              className={`sheet-tab-item ${idx === activeSheetIndex ? 'active' : ''}`}
              onClick={() => setActiveSheetIndex(idx)}
            >
              <FileSpreadsheet size={12} style={{ flexShrink: 0, opacity: 0.8 }} />
              {editingSheetIdx === idx ? (
                <input
                  type="text"
                  className="sheet-tab-input"
                  defaultValue={s.name}
                  autoFocus
                  onBlur={(e) => {
                    handleRenameSheet(idx, e.target.value.trim());
                    setEditingSheetIdx(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRenameSheet(idx, e.currentTarget.value.trim());
                      setEditingSheetIdx(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  onDoubleClick={() => setEditingSheetIdx(idx)}
                  title="Double-click to rename sheet"
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}
                >
                  {s.name}
                </span>
              )}

              {sheets.length > 1 && (
                <button
                  className="sheet-tab-close-btn"
                  title="Delete Sheet"
                  onClick={(e) => handleDeleteSheet(idx, e)}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}

          {/* Add Sheet Button */}
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', flexShrink: 0 }}
            onClick={handleAddSheet}
            title="Add New Sheet"
          >
            <Plus size={12} /> Sheet
          </button>
        </div>

        {/* Global Toolbar Actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px', padding: '5px 9px' }}
            onClick={() => onOpenHistory && onOpenHistory(currentSheet.block_key, currentSheet.name)}
            title="Inspect Sheet Revisions"
          >
            <History size={13} /> History
          </button>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px', padding: '5px 9px' }}
            onClick={handleAddColumn}
            title="Add Column"
          >
            <Plus size={13} /> Column
          </button>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px', padding: '5px 9px' }}
            onClick={handleAddRow}
            title="Add Row"
          >
            <Plus size={13} /> Row
          </button>
          <button
            className="canvas-btn canvas-btn-primary"
            style={{ fontSize: '11px', padding: '5px 12px' }}
            onClick={handleSaveSheet}
            disabled={saving}
            title="Save Spreadsheet"
          >
            <Save size={13} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Table Grid ── */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', width: '100%', maxHeight: 'calc(100vh - 160px)', minHeight: '320px' }}>
        <table className="sheet-table">
          <thead>
            <tr>
              <th style={{ width: '42px', textAlign: 'center', userSelect: 'none' }}>#</th>
              {currentSheet.columns.map((col, idx) => (
                <th key={idx} className="sheet-col-header">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                      <span className="sheet-col-letter">{colLetter(idx)}</span>
                      {editingColIdx === idx ? (
                        <input
                          type="text"
                          className="sheet-col-input"
                          defaultValue={typeof col === 'object' && col !== null ? (col.name || col.title || col.label || '') : String(col || '')}
                          autoFocus
                          onBlur={(e) => {
                            handleRenameColumn(idx, e.target.value.trim());
                            setEditingColIdx(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRenameColumn(idx, e.currentTarget.value.trim());
                              setEditingColIdx(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="sheet-col-title"
                          onDoubleClick={() => setEditingColIdx(idx)}
                          title="Double-click to rename column"
                        >
                          {typeof col === 'object' && col !== null ? (col.name || col.title || col.label || '') : String(col || '')}
                        </span>
                      )}
                    </div>
                    {currentSheet.columns.length > 1 && (
                      <button
                        className="sheet-col-delete-btn"
                        onClick={() => handleDeleteColumn(idx)}
                        title={`Delete Column ${colLetter(idx)}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(currentSheet.rows || []).map((row, rowIdx) => (
              <tr key={rowIdx} className="sheet-row-tr">
                <td className="sheet-row-number">
                  <span className="sheet-row-index-text">{rowIdx + 1}</span>
                  <button
                    className="sheet-row-delete-btn"
                    onClick={() => handleDeleteRow(rowIdx)}
                    title={`Delete Row ${rowIdx + 1}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
                {currentSheet.columns.map((_, colIdx) => {
                  const cellVal = row && row[colIdx] !== undefined ? row[colIdx] : '';
                  const displayVal = typeof cellVal === 'object' && cellVal !== null
                    ? (cellVal.value !== undefined ? String(cellVal.value) : cellVal.name || cellVal.text || JSON.stringify(cellVal))
                    : String(cellVal ?? '');
                  return (
                    <td key={colIdx}>
                      <input
                        type="text"
                        value={displayVal}
                        onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bottom Quick Add Row Strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--sheet-header-bg)', borderTop: '1px solid var(--sheet-cell-border)' }}>
        <button
          className="canvas-btn canvas-btn-secondary"
          style={{ fontSize: '11px', padding: '3px 8px' }}
          onClick={handleAddRow}
        >
          <Plus size={12} /> Add Row
        </button>
        <span style={{ fontSize: '11px', color: 'var(--doc-text-muted)' }}>
          {currentSheet.rows.length} {currentSheet.rows.length === 1 ? 'row' : 'rows'} • {currentSheet.columns.length} columns
        </span>
      </div>
    </div>
  );
}

