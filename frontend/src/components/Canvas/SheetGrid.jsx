import React, { useState } from 'react';
import { Plus, History, Save } from 'lucide-react';
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

  const parsedSheets = blocks.map((b) => {
    try {
      const data = JSON.parse(b.content);
      return {
        block_key: b.block_key,
        name: data.sheet_name || b.title,
        columns: data.columns || [],
        rows: data.rows || []
      };
    } catch {
      // Fallback: parse CSV lines
      const lines = String(b.content || '').split('\n').filter(Boolean).map((l) => l.split(','));
      const columns = lines[0] || ['Col 1', 'Col 2', 'Col 3'];
      const rows = lines.slice(1);
      return {
        block_key: b.block_key,
        name: b.title,
        columns,
        rows
      };
    }
  });

  const [sheets, setSheets] = useState(parsedSheets);
  const currentSheet = sheets[activeSheetIndex] || { columns: [], rows: [], block_key: 'sheet_1' };

  const handleCellChange = (rowIdx, colIdx, value) => {
    const updated = [...sheets];
    const newRows = [...updated[activeSheetIndex].rows];
    newRows[rowIdx] = [...newRows[rowIdx]];
    newRows[rowIdx][colIdx] = value;
    updated[activeSheetIndex].rows = newRows;
    setSheets(updated);
  };

  const handleAddRow = () => {
    const updated = [...sheets];
    const newRow = new Array(currentSheet.columns.length).fill('');
    updated[activeSheetIndex].rows = [...currentSheet.rows, newRow];
    setSheets(updated);
  };

  const handleSaveSheet = async () => {
    try {
      setSaving(true);
      const sheetData = {
        sheet_name: currentSheet.name,
        columns: currentSheet.columns,
        rows: currentSheet.rows
      };
      await artifactsApi.updateBlock(artifactId, currentSheet.block_key, JSON.stringify(sheetData, null, 2), 'Edited spreadsheet rows', token);
      if (onBlockUpdated) {
        onBlockUpdated(currentSheet.block_key, JSON.stringify(sheetData));
      }
    } catch (err) {
      alert(err.message || 'Failed to save sheet changes');
    } finally {
      setSaving(false);
    }
  };

  // Generate column labels A, B, C...
  const colLetter = (idx) => String.fromCharCode(65 + idx);

  return (
    <div className="sheet-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1f2937', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {sheets.map((s, idx) => (
            <button
              key={idx}
              className={`canvas-btn ${idx === activeSheetIndex ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={() => setActiveSheetIndex(idx)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={() => onOpenHistory && onOpenHistory(currentSheet.block_key, currentSheet.name)}
          >
            <History size={13} /> Sheet History
          </button>
          <button
            className="canvas-btn canvas-btn-secondary"
            style={{ fontSize: '11px' }}
            onClick={handleAddRow}
          >
            <Plus size={13} /> Add Row
          </button>
          <button
            className="canvas-btn canvas-btn-primary"
            style={{ fontSize: '11px' }}
            onClick={handleSaveSheet}
            disabled={saving}
          >
            <Save size={13} /> {saving ? 'Saving...' : 'Save Sheet'}
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
        <table className="sheet-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
              {currentSheet.columns.map((col, idx) => (
                <th key={idx}>
                  <span style={{ color: '#818cf8', marginRight: '6px' }}>{colLetter(idx)}</span>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td style={{ textAlign: 'center', color: '#6b7280', background: '#171e2e', userSelect: 'none' }}>
                  {rowIdx + 1}
                </td>
                {currentSheet.columns.map((_, colIdx) => (
                  <td key={colIdx}>
                    <input
                      type="text"
                      value={row[colIdx] !== undefined ? row[colIdx] : ''}
                      onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
