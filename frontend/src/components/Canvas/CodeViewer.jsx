import React, { useState } from 'react';
import { Copy, CheckCheck, Edit2, Check, X, History } from 'lucide-react';
import { artifactsApi } from '../../api';

export default function CodeViewer({
  fullContent = '',
  blocks = [],
  artifactId,
  language = 'python',
  filename = 'code.py',
  token,
  onOpenHistory,
  onBlockUpdated
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState(fullContent);
  const [saving, setSaving] = useState(false);

  const mainBlock = blocks[0] || { block_key: 'main_block', title: 'Main Code' };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await artifactsApi.updateBlock(artifactId, mainBlock.block_key, code, 'Edited code in Canvas', token);
      setIsEditing(false);
      if (onBlockUpdated) {
        onBlockUpdated(mainBlock.block_key, code);
      }
    } catch (err) {
      alert(err.message || 'Failed to save code');
    } finally {
      setSaving(false);
    }
  };

  const lines = String(isEditing ? (code ?? '') : (fullContent ?? '')).split('\n');

  return (
    <div className="code-viewer-container">
      <div className="code-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6' }}>{filename}</span>
          <span className="canvas-version-pill">{language}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="canvas-btn canvas-btn-secondary"
            title="View Code Diff History"
            onClick={() => onOpenHistory && onOpenHistory(mainBlock.block_key, filename)}
          >
            <History size={13} /> History
          </button>

          <button
            className="canvas-btn canvas-btn-secondary"
            onClick={handleCopy}
          >
            {copied ? <CheckCheck size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {!isEditing ? (
            <button
              className="canvas-btn canvas-btn-primary"
              onClick={() => { setIsEditing(true); setCode(fullContent); }}
            >
              <Edit2 size={13} /> Edit
            </button>
          ) : (
            <>
              <button
                className="canvas-btn canvas-btn-secondary"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="canvas-btn canvas-btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          style={{
            width: '100%',
            background: '#090d16',
            color: '#f3f4f6',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '16px',
            border: 'none',
            outline: 'none',
            minHeight: '400px',
            resize: 'vertical'
          }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      ) : (
        <pre className="code-pre">
          <table>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx}>
                  <td style={{ color: '#4b5563', paddingRight: '16px', userSelect: 'none', textAlign: 'right', width: '36px' }}>
                    {idx + 1}
                  </td>
                  <td style={{ color: '#e2e8f0', whiteSpace: 'pre' }}>
                    {line || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </pre>
      )}
    </div>
  );
}
