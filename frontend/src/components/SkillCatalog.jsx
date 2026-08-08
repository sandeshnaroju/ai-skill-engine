import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cpu, RefreshCw, Layers, Search, Code, Plus, Edit, Trash2, X, Check, Save, FileText, Database, HardDrive, Box, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';

export default function SkillCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [skills, setSkills] = useState([]);
  const [toolsSchema, setToolsSchema] = useState([]);
  const [apps, setApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [loading, setLoading] = useState(false);

  // Syncing with URL parameters
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '6', 10);
  const search = searchParams.get('search') || '';

  const setPage = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', typeof val === 'function' ? val(page).toString() : val.toString());
    setSearchParams(nextParams);
  };

  const setPageSize = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page_size', typeof val === 'function' ? val(pageSize).toString() : val.toString());
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSearch = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) {
      nextParams.set('search', val);
    } else {
      nextParams.delete('search');
    }
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Editor Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSkillName, setEditingSkillName] = useState('');
  const [skillNameInput, setSkillNameInput] = useState('');
  const [skillContentInput, setSkillContentInput] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultSkillTemplate = `---
name: my_new_skill
description: Skill description explaining when to trigger this skill.
tools:
  - name: my_shell_tool
    description: Description of what this tool does.
    command: echo "Executing tool command"
---

# Skill Guidelines & Instructions
Provide instructions for the LLM on how to resolve queries using this skill.
`;

  const dataToolsSchema = (schema) => {
    return schema || [];
  };

  const fetchSkillsAndApps = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      });
      const [skillsRes] = await Promise.all([
        fetch(`/api/v1/skills?${queryParams.toString()}`)
      ]);
      const skillsData = await skillsRes.json();

      if (skillsData && skillsData.items !== undefined) {
        setSkills(skillsData.items || []);
        setTotalPages(skillsData.pages || 1);
        setTotalItems(skillsData.total || 0);
        setToolsSchema(dataToolsSchema(skillsData.tools_schema || []));
      } else {
        setSkills(skillsData.skills || []);
        setTotalPages(1);
        setTotalItems(skillsData.skills ? skillsData.skills.length : 0);
        setToolsSchema(dataToolsSchema(skillsData.tools_schema || []));
      }

    } catch (e) {
      console.error('Failed to fetch skills catalog data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkillsAndApps();
  }, [page, pageSize]);

  const handleOpenCreateModal = () => {
    setSkillNameInput('');
    setSkillContentInput(defaultSkillTemplate);
    setIsEditing(false);
    setShowModal(true);
  };

  const handleOpenEditModal = async (skill) => {
    setEditingSkillName(skill.name);
    setSkillNameInput(skill.name);
    setSkillContentInput('');
    setIsEditing(true);
    setShowModal(true);

    try {
      const res = await fetch(`/api/v1/skills/${encodeURIComponent(skill.name)}`);
      if (res.ok) {
        const data = await res.json();
        setSkillContentInput(data.content || '');
      }
    } catch (err) {
      console.error('Failed to fetch skill content:', err);
    }
  };

  const handleSaveSkill = async (e) => {
    e.preventDefault();
    if (!skillNameInput.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_name: skillNameInput,
          content: skillContentInput,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setPage(1);
        fetchSkillsAndApps();
      } else {
        const data = await res.json();
        alert(`Error: ${data.detail || 'Failed to save skill'}`);
      }
    } catch (err) {
      console.error('Save skill error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSkill = async (name) => {
    if (!window.confirm(`Are you sure you want to delete custom skill "${name}"? This deletes the database record.`)) return;
    try {
      const res = await fetch(`/api/v1/skills/${name}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSkillsAndApps();
      }
    } catch (err) {
      console.error('Delete skill error:', err);
    }
  };

  // Resolve active App model details if one is selected
  const selectedAppObj = selectedAppId ? apps.find((a) => a.id === selectedAppId) : null;
  const allowedSkillNames = selectedAppObj ? selectedAppObj.skill_names : null;

  // Filter skills client-side based on App selection and Search Query
  const filteredSkills = skills.filter((s) => {
    // 1. App Scope Filter
    if (allowedSkillNames && !allowedSkillNames.includes(s.name)) {
      return false;
    }
    // 2. Search Text Filter
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      s.name.toLowerCase().includes(query) ||
      (s.description && s.description.toLowerCase().includes(query))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Filters */}
      <div className="glass-box" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={22} color="var(--primary-violet)" /> Active Skills Catalog
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginTop: '4px' }}>
            Hybrid skill registry combining file-based default skills (`skills/`), DB custom skills, and MCP tools.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* App Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <div style={{ width: '210px' }}>
              <AsyncSearchableDropdown
                value={selectedAppId}
                onChange={(val) => setSelectedAppId(val)}
                fetchOptions={async (searchTerm) => {
                  const url = `/api/v1/apps?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                  const res = await fetch(url);
                  const data = await res.json();
                  setApps(prev => {
                    const newApps = [...prev];
                    (data.items || []).forEach(a => {
                      if (!newApps.find(existing => existing.id === a.id)) newApps.push(a);
                    });
                    return newApps;
                  });
                  return [
                    { value: "", label: "🌐 All Apps & Global Skills" },
                    ...(data.items || []).map(a => ({
                      value: a.id,
                      label: `📦 ${a.name} (${a.skills_count} skills)`
                    }))
                  ];
                }}
                placeholder="🌐 All Apps & Global Skills"
              />
            </div>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', width: '200px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
            />
          </div>

          <button className="btn-gradient" onClick={handleOpenCreateModal}>
            <Plus size={16} /> Create Custom Skill
          </button>
          <button className="btn-outline" onClick={fetchSkillsAndApps} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Reload
          </button>
        </div>
      </div>

      {/* Selected App Filter Banner */}
      {selectedAppObj && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '12px 18px', borderRadius: '10px', fontSize: '0.88rem' }}>
          <Box size={16} color="var(--primary-cyan)" />
          <span>Showing only skills registered to App Container: <strong style={{ color: 'var(--text-main)' }}>{selectedAppObj.name}</strong> ({selectedAppObj.skills_count} skills active)</span>
          <button className="btn-outline" onClick={() => setSelectedAppId('')} style={{ padding: '2px 8px', fontSize: '0.74rem', marginLeft: 'auto' }}>Reset filter</button>
        </div>
      )}

      {/* Grid of Skills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {filteredSkills.length === 0 ? (
          <div className="glass-box" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No skills found in the catalog matching filters.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
            {filteredSkills.map((s) => (
              <div key={s.name} className="glass-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{s.name}</div>
                    <span className={`badge-tag tag-${s.source}`}>
                      {s.source === 'file' ? <HardDrive size={11} /> : <Database size={11} />} {s.source}
                    </span>
                  </div>

                  <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', marginTop: '6px', lineHeight: '1.4' }}>
                    {s.description || 'No description provided.'}
                  </p>

                  {/* Registered Tools inside this Skill */}
                  {s.tools && s.tools.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600' }}>Tools Registered:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {s.tools.map((t) => (
                          <span key={t.name} className="badge-tag tag-shell" style={{ fontSize: '0.74rem' }}>
                            <Cpu size={10} /> {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', marginTop: '4px' }}>
                  <button className="btn-outline" onClick={() => handleOpenEditModal(s)} style={{ flex: 1, padding: '5px 10px', fontSize: '0.78rem' }}>
                    <Edit size={12} /> {s.source === 'file' ? 'View Schema' : 'Edit Skill'}
                  </button>
                  {s.source === 'database' && (
                    <button
                      className="btn-outline"
                      onClick={() => handleDeleteSkill(s.name)}
                      style={{ padding: '5px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      title="Delete Custom Skill"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {skills.length > 0 && (
          <div className="glass-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Showing page <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{page}</span> of <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{totalPages}</span> ({totalItems} skills total)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button className="btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
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
                  onChange={(e) => setSkillNameInput(e.target.value)}
                  disabled={isEditing}
                  required
                />
              </div>

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
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                {(!isEditing || (isEditing && skills.find(s=>s.name === editingSkillName)?.source === 'database')) && (
                  <button type="submit" className="btn-gradient" disabled={saving || !skillNameInput.trim()} style={{ padding: '8px 20px' }}>
                    {saving ? 'Saving...' : 'Save Skill'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
