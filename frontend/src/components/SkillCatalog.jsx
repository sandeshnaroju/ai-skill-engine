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
  const pageSize = parseInt(searchParams.get('page_size') || '15', 10);
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

  // Generator Wizard State
  const [showGenModal, setShowGenModal] = useState(false);
  const [genStep, setGenStep] = useState(1);
  const [genModels, setGenModels] = useState([]);
  const [genModelIndex, setGenModelIndex] = useState('');
  const [genName, setGenName] = useState('');
  const [genDesc, setGenDesc] = useState('');
  const [genApiCalls, setGenApiCalls] = useState([]);
  const [genInputsSecrets, setGenInputsSecrets] = useState('');
  const [genBehavior, setGenBehavior] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const handleOpenGenerator = async () => {
    setGenStep(1);
    setGenName('');
    setGenDesc('');
    setGenApiCalls([]);
    setGenInputsSecrets('');
    setGenBehavior('');
    setGenModelIndex('');
    setShowGenModal(true);

    try {
      const res = await fetch('/api/v1/generator/models');
      if (res.ok) {
        const data = await res.json();
        setGenModels(data || []);
        if (data && data.length > 0) {
          setGenModelIndex('0');
        }
      }
    } catch (err) {
      console.error('Failed to load generator models:', err);
    }
  };

  const handleAddApiCall = () => {
    setGenApiCalls([...genApiCalls, { method: 'GET', url: '', headers: [], query_params: [], body: '' }]);
  };

  const handleRemoveApiCall = (index) => {
    const updated = [...genApiCalls];
    updated.splice(index, 1);
    setGenApiCalls(updated);
  };

  const handleApiFieldChange = (index, field, value) => {
    const updated = [...genApiCalls];
    updated[index][field] = value;
    setGenApiCalls(updated);
  };

  const handleAddKeyValue = (apiIndex, type) => {
    const updated = [...genApiCalls];
    if (!updated[apiIndex][type]) {
      updated[apiIndex][type] = [];
    }
    updated[apiIndex][type].push({ key: '', value: '' });
    setGenApiCalls(updated);
  };

  const handleRemoveKeyValue = (apiIndex, type, kvIndex) => {
    const updated = [...genApiCalls];
    updated[apiIndex][type].splice(kvIndex, 1);
    setGenApiCalls(updated);
  };

  const handleKeyValueChange = (apiIndex, type, kvIndex, field, value) => {
    const updated = [...genApiCalls];
    updated[apiIndex][type][kvIndex][field] = value;
    setGenApiCalls(updated);
  };

  const handleGenerateSkill = async () => {
    if (!genModelIndex || genModels.length === 0) {
      alert('Please select a model.');
      return;
    }
    if (!genName.trim()) {
      alert('Please enter a skill name.');
      return;
    }
    setGenerating(true);
    const selectedModel = genModels[parseInt(genModelIndex, 10)];
    try {
      const res = await fetch('/api/v1/generator/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: selectedModel.tenant_id,
          model_name: selectedModel.model_name,
          skill_name: genName,
          description: genDesc,
          api_calls: genApiCalls,
          inputs_secrets: genInputsSecrets,
          behavior: genBehavior
        })
      });
      if (res.ok) {
        const data = await res.json();
        setShowGenModal(false);
        setSkillNameInput(genName.trim().toLowerCase().replace(" ", "_"));
        setSkillContentInput(data.content || '');
        setIsEditing(false);
        setShowModal(true);
      } else {
        const errData = await res.json();
        alert(`Generation failed: ${errData.detail || 'unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to generate skill:', e);
      alert('Network or Server error generating skill.');
    } finally {
      setGenerating(false);
    }
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
    const nameValid = /^[a-z0-9_]+$/.test(skillNameInput.trim());
    if (!nameValid) {
      alert('Skill name can only contain lowercase letters, numbers, and underscores (_). No spaces or special characters allowed.');
      return;
    }
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

          <button className="btn-outline" onClick={handleOpenGenerator} style={{ color: 'var(--primary-cyan)', borderColor: 'rgba(6, 182, 212, 0.4)' }}>
            <Cpu size={16} /> Interactive Generator
          </button>
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
                  onChange={(e) => {
                    // Only allow lowercase letters, numbers, and underscores
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
                  <button type="submit" className="btn-gradient" disabled={saving || !skillNameInput.trim() || !/^[a-z0-9_]+$/.test(skillNameInput.trim())} style={{ padding: '8px 20px' }}>
                    {saving ? 'Saving...' : 'Save Skill'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generator Wizard Modal */}
      {showGenModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '960px', width: '98%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="var(--primary-cyan)" /> Interactive Skill Generator
              </h3>
              <button className="btn-outline" onClick={() => setShowGenModal(false)} style={{ padding: '6px', borderRadius: '8px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Steps indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px' }}>
              {['1. Select Model', '2. Core Details', '3. Actions', '4. Behavior'].map((label, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    color: genStep === idx + 1 ? 'var(--primary-cyan)' : 'var(--text-muted)'
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Step 1: Model Selection */}
            {genStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Select Tenant & Model</label>
                  {genModels.length === 0 ? (
                    <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '0.86rem', color: 'var(--accent-rose)' }}>
                      No active models found. Please configure a Model under **Tenants & Keys** first.
                    </div>
                  ) : (
                    <select
                      value={genModelIndex}
                      onChange={(e) => setGenModelIndex(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}
                    >
                      {genModels.map((m, idx) => (
                        <option key={idx} value={idx}>
                          🔑 {m.tenant_name} — {m.model_name} ({m.provider})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={() => setShowGenModal(false)}>Cancel</button>
                  <button type="button" className="btn-gradient" disabled={genModels.length === 0} onClick={() => setGenStep(2)}>Next Step</button>
                </div>
              </div>
            )}

            {/* Step 2: Core Details */}
            {genStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Skill Name</label>
                  <input
                    type="text"
                    placeholder="e.g. check_weather"
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Description (What does it do?)</label>
                  <textarea
                    placeholder="e.g. Fetches current weather reports and forecasts for a location."
                    value={genDesc}
                    onChange={(e) => setGenDesc(e.target.value)}
                    style={{ height: '80px', resize: 'none' }}
                  />
                </div>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={() => setGenStep(1)}>Back</button>
                  <button type="button" className="btn-gradient" disabled={!genName.trim()} onClick={() => setGenStep(3)}>Next Step</button>
                </div>
              </div>
            )}

            {/* Step 3: Tooling requirements */}
            {genStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-sub)' }}>API Calls / Tools</span>
                  <button type="button" className="btn-outline" onClick={handleAddApiCall} style={{ padding: '4px 10px', fontSize: '0.76rem' }}>
                    <Plus size={12} /> Add API Call
                  </button>
                </div>

                {genApiCalls.length === 0 ? (
                  <div style={{ padding: '16px', border: '1px dashed var(--border-subtle)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    No API calls added yet. Click "Add API Call" to register HTTP tools for this skill.
                  </div>
                ) : (
                  genApiCalls.map((api, apiIdx) => (
                    <div key={apiIdx} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--primary-cyan)' }}>API Call #{apiIdx + 1}</span>
                        <button type="button" className="btn-outline" onClick={() => handleRemoveApiCall(apiIdx)} style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                          value={api.method}
                          onChange={(e) => handleApiFieldChange(apiIdx, 'method', e.target.value)}
                          style={{ width: '100px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}
                        >
                          <option>GET</option>
                          <option>POST</option>
                          <option>PUT</option>
                          <option>DELETE</option>
                        </select>
                        <input
                          type="text"
                          placeholder="https://api.example.com/endpoint"
                          value={api.url}
                          onChange={(e) => handleApiFieldChange(apiIdx, 'url', e.target.value)}
                          style={{ flex: 1 }}
                        />
                      </div>

                      {/* Headers Key-Value list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Headers (e.g. Content-Type, Authorization)</span>
                          <button type="button" onClick={() => handleAddKeyValue(apiIdx, 'headers')} style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}>
                            + Add Header
                          </button>
                        </div>
                        {(api.headers || []).map((kv, kvIdx) => (
                          <div key={kvIdx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Header Key"
                              value={kv.key}
                              onChange={(e) => handleKeyValueChange(apiIdx, 'headers', kvIdx, 'key', e.target.value)}
                              list="common-headers"
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.84rem' }}
                            />
                            <datalist id="common-headers">
                              <option value="Authorization" />
                              <option value="Content-Type" />
                              <option value="Accept" />
                              <option value="User-Agent" />
                              <option value="X-API-Key" />
                              <option value="Cache-Control" />
                              <option value="Origin" />
                            </datalist>
                            <input
                              type="text"
                              placeholder="Value (or {{user_data.my_secret}})"
                              value={kv.value}
                              onChange={(e) => handleKeyValueChange(apiIdx, 'headers', kvIdx, 'value', e.target.value)}
                              style={{ flex: 2, padding: '8px 12px', fontSize: '0.84rem' }}
                            />
                            <button type="button" onClick={() => handleRemoveKeyValue(apiIdx, 'headers', kvIdx)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '4px' }}>
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Query Parameters Key-Value list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Query Parameters (e.g. units, api_key)</span>
                          <button type="button" onClick={() => handleAddKeyValue(apiIdx, 'query_params')} style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}>
                            + Add Query Param
                          </button>
                        </div>
                        {(api.query_params || []).map((kv, kvIdx) => (
                          <div key={kvIdx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Param Key"
                              value={kv.key}
                              onChange={(e) => handleKeyValueChange(apiIdx, 'query_params', kvIdx, 'key', e.target.value)}
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.84rem' }}
                            />
                            <input
                              type="text"
                              placeholder="Value (or {{user_data.my_secret}})"
                              value={kv.value}
                              onChange={(e) => handleKeyValueChange(apiIdx, 'query_params', kvIdx, 'value', e.target.value)}
                              style={{ flex: 2, padding: '8px 12px', fontSize: '0.84rem' }}
                            />
                            <button type="button" onClick={() => handleRemoveKeyValue(apiIdx, 'query_params', kvIdx)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '4px' }}>
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Body payload (for POST/PUT etc) */}
                      {['POST', 'PUT', 'PATCH', 'DELETE'].includes(api.method) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Request Body / Payload description</span>
                          <textarea
                            placeholder="JSON structure or parameters for the API call"
                            value={api.body || ''}
                            onChange={(e) => handleApiFieldChange(apiIdx, 'body', e.target.value)}
                            style={{ height: '50px', resize: 'none', fontSize: '0.78rem' }}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Inputs & Secrets mapping */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Credentials/Secrets needed (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. openweathermap_api_key, bearer_token (from user_data)"
                    value={genInputsSecrets}
                    onChange={(e) => setGenInputsSecrets(e.target.value)}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={() => setGenStep(2)}>Back</button>
                  <button type="button" className="btn-gradient" onClick={() => setGenStep(4)}>Next Step</button>
                </div>
              </div>
            )}

            {/* Step 4: Behavior Rules & Generate */}
            {genStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Behavior & Performance Rules</label>
                  <textarea
                    placeholder="Describe how the skill behaves (e.g. If the API returns celsius, convert it to fahrenheit before answering the user. If request fails, explain why elegantly.)"
                    value={genBehavior}
                    onChange={(e) => setGenBehavior(e.target.value)}
                    style={{ height: '140px', resize: 'none' }}
                  />
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-outline" onClick={() => setGenStep(3)}>Back</button>
                  <button
                    type="button"
                    className="btn-gradient"
                    disabled={generating}
                    onClick={handleGenerateSkill}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {generating ? 'Generating...' : 'Generate Skill Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
