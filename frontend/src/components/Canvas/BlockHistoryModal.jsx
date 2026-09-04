import React, { useState, useEffect } from 'react';
import { X, RotateCcw, GitCommit, User, Bot, Clock } from 'lucide-react';
import { artifactsApi } from '../../api';

export default function BlockHistoryModal({ artifactId, blockKey, blockTitle, token, onClose, onRollbackComplete }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchCommits() {
      try {
        setLoading(true);
        const data = await artifactsApi.getCommits(artifactId, blockKey, token);
        if (isMounted) setCommits(data);
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load block history');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchCommits();
    return () => { isMounted = false; };
  }, [artifactId, blockKey, token]);

  const handleRollback = async (targetVersion) => {
    if (!window.confirm(`Revert "${blockTitle || blockKey}" to state at Version ${targetVersion}?`)) return;
    try {
      setRollingBack(targetVersion);
      await artifactsApi.rollbackBlock(artifactId, blockKey, targetVersion, token);
      if (onRollbackComplete) onRollbackComplete(targetVersion);
      onClose();
    } catch (err) {
      alert(err.message || 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  };

  const renderDiffLines = (patch) => {
    if (!patch) return <div className="diff-ctx">No diff recorded</div>;
    return String(patch || '').split('\n').map((line, idx) => {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
        return <span key={idx} className="diff-ctx" style={{ color: '#6366f1' }}>{line}</span>;
      }
      if (line.startsWith('+')) {
        return <span key={idx} className="diff-add">{line}</span>;
      }
      if (line.startsWith('-')) {
        return <span key={idx} className="diff-del">{line}</span>;
      }
      return <span key={idx} className="diff-ctx">{line}</span>;
    });
  };

  return (
    <div className="history-modal-overlay" onClick={onClose}>
      <div className="history-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <div>
            <div className="history-modal-title">Version History: {blockTitle || blockKey}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Zero-snapshot patch log. Rollback any block with non-destructive commits.
            </div>
          </div>
          <button className="doc-action-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="history-commits-list">
          {loading && <div style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>Loading history...</div>}
          {error && <div style={{ color: '#f87171', padding: '16px' }}>{error}</div>}
          {!loading && commits.length === 0 && (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: '24px' }}>No commits found for this block.</div>
          )}

          {commits.map((c) => (
            <div key={c.id} className="history-commit-item">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="canvas-version-pill">v{c.version}</span>
                  {c.author === 'assistant' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#818cf8', fontSize: '11px' }}>
                      <Bot size={13} /> AI Assistant
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34d399', fontSize: '11px' }}>
                      <User size={13} /> User Edit
                    </span>
                  )}
                  <span style={{ color: '#6b7280', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Clock size={11} /> {c.created_at ? new Date(c.created_at).toLocaleTimeString() : ''}
                  </span>
                </div>

                {blockKey && (
                  <button
                    className="canvas-btn canvas-btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={() => handleRollback(c.version)}
                    disabled={rollingBack === c.version}
                  >
                    <RotateCcw size={12} /> {rollingBack === c.version ? 'Reverting...' : 'Rollback to here'}
                  </button>
                )}
              </div>

              <div style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb' }}>
                {c.summary || 'Commit patch'}
              </div>

              <div className="history-diff-box">
                {renderDiffLines(c.patch)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
