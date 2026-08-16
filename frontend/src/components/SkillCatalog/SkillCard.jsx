import React from 'react';
import { Cpu, Edit, Trash2, HardDrive, Database } from 'lucide-react';

export default function SkillCard({ skill, handleOpenEditModal, handleDeleteSkill }) {
  return (
    <div className="glass-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{skill.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span className={`badge-tag tag-${skill.source}`}>
              {skill.source === 'file' ? <HardDrive size={11} /> : <Database size={11} />} {skill.source}
            </span>
            <span className="badge-tag tag-shell" style={{ fontSize: '0.72rem', opacity: 0.85 }}>
              Workspace: {skill.tenant_name || 'Global'}
            </span>
          </div>
        </div>

        <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', marginTop: '6px', lineHeight: '1.4' }}>
          {skill.description || 'No description provided.'}
        </p>

        {/* Registered Tools inside this Skill */}
        {skill.tools && skill.tools.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600' }}>Tools Registered:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {skill.tools.map((t) => (
                <span key={t.name} className="badge-tag tag-shell" style={{ fontSize: '0.74rem' }}>
                  <Cpu size={10} /> {t.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', marginTop: '4px' }}>
        <button className="btn-outline" onClick={() => handleOpenEditModal(skill)} style={{ flex: 1, padding: '5px 10px', fontSize: '0.78rem' }}>
          <Edit size={12} /> {skill.source === 'file' ? 'View Schema' : 'Edit Skill'}
        </button>
        {skill.source === 'database' && (
          <button
            className="btn-outline"
            onClick={() => handleDeleteSkill(skill.name)}
            style={{ padding: '5px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
            title="Delete Custom Skill"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
