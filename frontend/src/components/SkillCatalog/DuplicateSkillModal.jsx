import React, { useState } from 'react';
import { Copy, X, Check, Building2, Layers } from 'lucide-react';

export default function DuplicateSkillModal({
  showModal,
  setShowModal,
  skill,
  tenants,
  currentTenantId,
  onDuplicate
}) {
  if (!showModal || !skill) return null;

  const currentSourceTenantId = skill.tenant_id || currentTenantId;
  const destinationTenants = tenants.filter(t => t.id !== currentSourceTenantId);

  const [newSkillName, setNewSkillName] = useState(skill.name);
  const [selectedTenantIds, setSelectedTenantIds] = useState(
    destinationTenants.length > 0 ? [destinationTenants[0].id] : []
  );
  const [submitting, setSubmitting] = useState(false);

  const toggleTenant = (tid) => {
    if (selectedTenantIds.includes(tid)) {
      setSelectedTenantIds(selectedTenantIds.filter(id => id !== tid));
    } else {
      setSelectedTenantIds([...selectedTenantIds, tid]);
    }
  };

  const selectAllTenants = () => {
    setSelectedTenantIds(destinationTenants.map(t => t.id));
  };

  const deselectAllTenants = () => {
    setSelectedTenantIds([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    if (selectedTenantIds.length === 0) return;

    setSubmitting(true);
    try {
      await onDuplicate(skill.name, selectedTenantIds, newSkillName.trim());
      setShowModal(false);
    } catch (err) {
      console.error('Duplicate skill error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowModal(false)}>
      <div
        className="modal-box glass-box"
        style={{ maxWidth: '540px', width: '95%', padding: '24px', borderRadius: '16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Copy size={18} color="var(--primary-cyan)" /> Duplicate Skill Across Workspaces
          </h3>
          <button className="toast-close-btn" onClick={() => setShowModal(false)}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '6px' }}>
              Target Skill Name
            </label>
            <input
              type="text"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="skill_name"
              required
              className="glass-input"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.88rem' }}
            />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Lowercase letters, numbers, and underscores only.
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)', margin: 0 }}>
                Select Destination Workspaces ({selectedTenantIds.length} selected)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={selectAllTenants}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                >
                  Select All
                </button>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <button
                  type="button"
                  onClick={deselectAllTenants}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {destinationTenants.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '12px' }}>
                  No other destination workspaces available.
                </div>
              ) : (
                destinationTenants.map((t) => {
                  const isChecked = selectedTenantIds.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleTenant(t.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: isChecked ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                        border: isChecked ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid transparent',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={15} color={isChecked ? 'var(--primary-cyan)' : 'var(--text-muted)'} />
                        <span style={{ fontSize: '0.85rem', fontWeight: isChecked ? '600' : '400', color: isChecked ? 'var(--text-main)' : 'var(--text-sub)' }}>
                          {t.name}
                        </span>
                      </div>
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isChecked ? '1px solid var(--primary-cyan)' : '1px solid var(--border-subtle)',
                        background: isChecked ? 'var(--primary-cyan)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isChecked && <Check size={12} color="#000" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setShowModal(false)}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-gradient"
              disabled={submitting || selectedTenantIds.length === 0 || !newSkillName.trim()}
              style={{ padding: '8px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Copy size={15} />
              {submitting ? 'Duplicating...' : `Duplicate to ${selectedTenantIds.length} Workspace${selectedTenantIds.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
