import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { tenantsApi } from '../../api';

export default function DeleteTenantModal({ tenant, onClose, onDeleteSuccess }) {
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!tenant) return null;

  const targetName = tenant.name ? tenant.name.trim() : '';
  const isMatched = confirmInput.trim() === targetName;

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!isMatched) return;
    setDeleting(true);
    setErrorMsg('');

    try {
      await tenantsApi.delete(tenant.id, confirmInput.trim());
      onDeleteSuccess();
      onClose();
    } catch (err) {
      console.error('Delete tenant error:', err);
      setErrorMsg(err.message || 'Network error occurred while attempting deletion');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div className="glass-box" style={{
        maxWidth: '520px', width: '100%', padding: '28px',
        border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-rose)' }}>
            <AlertTriangle size={24} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>Delete Workspace Permanently</h3>
          </div>
          <button onClick={onClose} className="btn-outline" style={{ padding: '4px', border: 'none', background: 'transparent' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)', lineHeight: '1.5', marginBottom: '16px' }}>
          This action <strong>cannot be undone</strong>. Deleting the <strong>{tenant.name}</strong> workspace will permanently destroy:
        </p>

        <ul style={{
          fontSize: '0.84rem', color: 'var(--text-sub)', paddingLeft: '20px',
          marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px'
        }}>
          <li>All chat sessions, prompt history, and message logs</li>
          <li>All configured LLM model API credentials</li>
          <li>All custom database skills and active MCP servers</li>
          <li>All custom App groupings, user data templates, and storage configs</li>
        </ul>

        {errorMsg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
            background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)',
            color: 'var(--accent-rose)', fontSize: '0.85rem'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: '600' }}>
            To confirm, type <code style={{ color: 'var(--accent-rose)', background: 'rgba(244, 63, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{tenant.name}</code> below:
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={tenant.name}
            style={{
              borderColor: isMatched ? 'var(--accent-rose)' : 'var(--border-subtle)',
              boxShadow: isMatched ? '0 0 10px rgba(244, 63, 94, 0.3)' : 'none'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="btn-outline" onClick={onClose} disabled={deleting}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isMatched || deleting}
              style={{
                padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: '600',
                background: isMatched ? 'var(--accent-rose)' : 'rgba(255, 255, 255, 0.08)',
                color: isMatched ? '#fff' : 'var(--text-muted)',
                cursor: isMatched ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease'
              }}
            >
              <Trash2 size={16} /> {deleting ? 'Deleting Workspace...' : 'Delete Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
