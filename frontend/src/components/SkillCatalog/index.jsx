import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Cpu, RefreshCw, Layers, Search, Code, Plus, Edit, Trash2, X, Check, Save, FileText, Database, HardDrive, Box, Filter, ChevronLeft, ChevronRight, Key } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';

import SkillEditorModal from './SkillEditorModal';
import SkillGeneratorModal from './SkillGeneratorModal';
import SkillCard from './SkillCard';
export default function SkillCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [skills, setSkills] = useState([]);
  const [toolsSchema, setToolsSchema] = useState([]);
  const [apps, setApps] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

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
      const headers = {};
      if (selectedTenantId) {
        headers['X-Tenant-ID'] = selectedTenantId;
      }
      const [skillsRes] = await Promise.all([
        fetch(`/api/v1/skills?${queryParams.toString()}`, { headers })
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

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/v1/tenants');
      if (res.ok) {
        const data = await res.json();
        setTenants(data || []);
        if (data && data.length > 0 && !selectedTenantId) {
          setSelectedTenantId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch tenants', e);
    }
  };

  useEffect(() => {
    fetchSkillsAndApps();
  }, [page, pageSize, selectedTenantId]);

  useEffect(() => {
    setSelectedAppId('');
  }, [selectedTenantId]);

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleOpenCreateModal = () => {
    setSkillNameInput('');
    setSkillContentInput(defaultSkillTemplate);
    if (tenants && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
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
      const headers = {};
      if (selectedTenantId) {
        headers['X-Tenant-ID'] = selectedTenantId;
      }
      const res = await fetch(`/api/v1/skills/${encodeURIComponent(skill.name)}`, { headers });
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
      const headers = { 'Content-Type': 'application/json' };
      if (selectedTenantId) {
        headers['X-Tenant-ID'] = selectedTenantId;
      }
      const res = await fetch('/api/v1/skills', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          skill_name: skillNameInput,
          content: skillContentInput,
          tenant_id: selectedTenantId,
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
      const headers = {};
      if (selectedTenantId) {
        headers['X-Tenant-ID'] = selectedTenantId;
      }
      const res = await fetch(`/api/v1/skills/${name}`, { method: 'DELETE', headers });
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
          {/* Tenant Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={15} color="var(--text-muted)" />
            <div style={{ width: '210px' }}>
              <AsyncSearchableDropdown
                value={selectedTenantId}
                onChange={(val) => setSelectedTenantId(val)}
                fetchOptions={async (searchTerm) => {
                  const url = `/api/v1/tenants?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                  const res = await fetch(url);
                  const data = await res.json();
                  const list = data.items || data || [];
                  setTenants(prev => {
                    const newTenants = [...prev];
                    list.forEach(t => {
                      if (!newTenants.find(existing => existing.id === t.id)) newTenants.push(t);
                    });
                    return newTenants;
                  });
                  return list.map(t => ({
                    value: t.id,
                    label: `🔑 ${t.name}`
                  }));
                }}
                initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `🔑 ${tenants.find(t => t.id === selectedTenantId).name}` : ''}
                placeholder="Select Tenant Workspace"
              />
            </div>
          </div>

          {/* App Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <div style={{ width: '210px' }}>
              <AsyncSearchableDropdown
                value={selectedAppId}
                onChange={(val) => setSelectedAppId(val)}
                fetchOptions={async (searchTerm) => {
                  const url = `/api/v1/apps?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                  const headers = {};
                  if (selectedTenantId) {
                    headers['X-Tenant-ID'] = selectedTenantId;
                  }
                  const res = await fetch(url, { headers });
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
              <SkillCard
                key={s.name}
                skill={s}
                handleOpenEditModal={handleOpenEditModal}
                handleDeleteSkill={handleDeleteSkill}
              />
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
      <SkillEditorModal
        showModal={showModal}
        setShowModal={setShowModal}
        isEditing={isEditing}
        skills={skills}
        editingSkillName={editingSkillName}
        skillNameInput={skillNameInput}
        setSkillNameInput={setSkillNameInput}
        skillContentInput={skillContentInput}
        setSkillContentInput={setSkillContentInput}
        handleSaveSkill={handleSaveSkill}
        saving={saving}
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        setSelectedTenantId={setSelectedTenantId}
      />

      {/* Generator Wizard Modal */}
      <SkillGeneratorModal
        showGenModal={showGenModal}
        setShowGenModal={setShowGenModal}
        genStep={genStep}
        setGenStep={setGenStep}
        genModels={genModels}
        genModelIndex={genModelIndex}
        setGenModelIndex={setGenModelIndex}
        genName={genName}
        setGenName={setGenName}
        genDesc={genDesc}
        setGenDesc={setGenDesc}
        genApiCalls={genApiCalls}
        setGenApiCalls={setGenApiCalls}
        handleAddApiCall={handleAddApiCall}
        handleRemoveApiCall={handleRemoveApiCall}
        handleApiFieldChange={handleApiFieldChange}
        handleAddKeyValue={handleAddKeyValue}
        handleRemoveKeyValue={handleRemoveKeyValue}
        handleKeyValueChange={handleKeyValueChange}
        genInputsSecrets={genInputsSecrets}
        setGenInputsSecrets={setGenInputsSecrets}
        genBehavior={genBehavior}
        setGenBehavior={setGenBehavior}
        generating={generating}
        handleGenerateSkill={handleGenerateSkill}
      />
    </div>
  );
}
