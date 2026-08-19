import React from 'react';
import { X } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import { tenantsApi } from '../../api';

export default function SkillEditorModal({
  showModal,
  setShowModal,
  isEditing,
  skills,
  editingSkillName,
  skillNameInput,
  setSkillNameInput,
  skillContentInput,
  setSkillContentInput,
  handleSaveSkill,
  saving,
  tenants = [],
  selectedTenantId = '',
  setSelectedTenantId = () => {}
}) {
  if (!showModal) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '800px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>
            {isEditing ? (isEditing && skills.find(s=>s.name === editingSkillName)?.source === 'file' ? 'View Skill Details' : 'Edit Custom Skill') : 'Create Custom Skill'}
          </h3>
          <button className="btn-outline" onClick={() => setShowModal(false)} style={{ padding: '6px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveSkill} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Skill Identifier</label>
            <input
              type="text"
              placeholder="e.g. system_monitor"
              value={skillNameInput}
              onChange={(e) => {
                const filtered = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                setSkillNameInput(filtered);
              }}
              disabled={isEditing}
              required
            />
            {skillNameInput && !/^[a-z0-9_]+$/.test(skillNameInput) && (
              <span style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '3px' }}>
                Only letters (a–z), numbers, and underscores allowed — no spaces.
              </span>
            )}
          </div>

          {!isEditing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Workspace / Tenant</label>
              <AsyncSearchableDropdown
                value={selectedTenantId}
                onChange={(val) => setSelectedTenantId(val)}
                fetchOptions={async (query) => {
                  try {
                    const data = await tenantsApi.list({ search: query, page_size: 20 });
                    const items = data.items || data || [];
                    return items.map(t => ({ value: t.id, label: t.name }));
                  } catch (e) {
                    console.error('Error fetching tenant options:', e);
                  }
                  return [];
                }}
                placeholder="Search and select tenant..."
                initialLabel={tenants.find(t => t.id === selectedTenantId)?.name || ''}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Skill Content (YAML Frontmatter + Markdown instructions)</label>
            <textarea
              value={skillContentInput}
              onChange={(e) => setSkillContentInput(e.target.value)}
              disabled={isEditing && skills.find(s=>s.name === editingSkillName)?.source === 'file'}
              style={{ height: '360px', fontEncoding: 'utf-8', fontFamily: 'monospace', fontSize: '0.82rem', background: '#04070d', color: '#93c5fd', border: '1px solid var(--border-subtle)', padding: '12px', resize: 'none' }}
              required
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn-outline" onClick={() => setShowModal(false)} style={{ padding: '8px 16px' }}>
              {isEditing && skills.find(s => s.name === editingSkillName)?.source === 'file' ? 'Close' : 'Cancel'}
            </button>
            {(!isEditing || skills.find(s => s.name === editingSkillName)?.source !== 'file') && (
              <button type="submit" className="btn-gradient" disabled={saving || !skillNameInput.trim() || !/^[a-z0-9_]+$/.test(skillNameInput.trim())} style={{ padding: '8px 20px' }}>
                {saving ? 'Saving...' : 'Save Skill'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
