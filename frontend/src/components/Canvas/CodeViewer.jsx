import React, { useState, useEffect } from 'react';
import { Copy, CheckCheck, Edit2, Check, X, History, Eye, Code as CodeIcon, ExternalLink } from 'lucide-react';
import { artifactsApi } from '../../api';

export default function CodeViewer({
  fullContent = '',
  blocks = [],
  artifactId,
  language = 'python',
  filename = 'code.py',
  token,
  theme = 'dark',
  onOpenHistory,
  onBlockUpdated
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [code, setCode] = useState(fullContent);
  const [saving, setSaving] = useState(false);

  const isHtml = language === 'html' || language === 'htm' || filename.endsWith('.html') || filename.endsWith('.htm') || (typeof fullContent === 'string' && (fullContent.includes('<!DOCTYPE html>') || fullContent.includes('<html')));
  const [activeTab, setActiveTab] = useState(isHtml ? 'preview' : 'code'); // 'code' | 'preview'

  useEffect(() => {
    if (!isEditing) {
      setCode(fullContent);
    }
  }, [fullContent, isEditing]);

  const mainBlock = blocks[0] || { block_key: 'main_block', title: 'Main Code' };

  const handleCopy = () => {
    navigator.clipboard.writeText(code || fullContent || '');
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

  const cleanHtmlCode = (str) => {
    if (!str) return '';
    let cleaned = str.trim();
    const match = cleaned.match(/```(?:html|xml)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : cleaned;
  };

  const lines = String(isEditing ? (code ?? '') : (fullContent ?? '')).split('\n');

  return (
    <div className="code-viewer-container">
      <div className="code-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--doc-title-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {filename}
          </span>
          <span className="canvas-version-pill">{language}</span>

          {isHtml && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
              <button
                className={`canvas-btn ${activeTab === 'preview' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => { setActiveTab('preview'); setIsEditing(false); }}
              >
                <Eye size={12} /> Live Preview
              </button>
              <button
                className={`canvas-btn ${activeTab === 'code' ? 'canvas-btn-primary' : 'canvas-btn-secondary'}`}
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={() => setActiveTab('code')}
              >
                <CodeIcon size={12} /> Code
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isHtml && activeTab === 'preview' && (
            <button
              className="canvas-btn canvas-btn-secondary"
              style={{ fontSize: '11px' }}
              onClick={() => {
                const blob = new Blob([cleanHtmlCode(code || fullContent)], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              }}
              title="Open in new tab"
            >
              <ExternalLink size={12} /> Open Tab
            </button>
          )}

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
            title="Copy Code"
          >
            {copied ? <CheckCheck size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {!isEditing ? (
            <button
              className="canvas-btn canvas-btn-primary"
              onClick={() => { setIsEditing(true); setCode(fullContent); setActiveTab('code'); }}
              title="Edit Code"
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

      {isHtml && activeTab === 'preview' && !isEditing ? (
        <div className="html-preview-stage" style={{ minHeight: '450px' }}>
          <div className="html-frame-wrapper" style={{ width: '100%' }}>
            <iframe
              title="HTML Live Preview"
              srcDoc={cleanHtmlCode(code || fullContent)}
              className="html-preview-iframe"
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
            />
          </div>
        </div>
      ) : isEditing ? (
        <textarea
          style={{
            width: '100%',
            background: 'var(--doc-textarea-bg)',
            color: 'var(--doc-textarea-text)',
            fontFamily: '"Fira Code", Monaco, Consolas, "Courier New", monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            padding: '16px',
            border: 'none',
            outline: 'none',
            minHeight: '400px',
            maxHeight: 'calc(100vh - 140px)',
            resize: 'vertical',
            boxSizing: 'border-box'
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
                  <td className="code-line-number">
                    {idx + 1}
                  </td>
                  <td className="code-line-content">
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
