import React, { useState } from 'react';
import {
  X, Sliders, Key, Box, Cpu, Sparkles, Database, Plus, Trash2,
  Check, FileText, Download, Terminal, History, Shield, Zap
} from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import { tenantsApi, appsApi, skillsApi, userDataApi } from '../../api';

export default function ConfigDrawer({
  isOpen,
  onClose,
  selectedTenantId,
  setSelectedTenantId,
  tenants,
  setTenants,
  selectedModel,
  setSelectedModel,
  tenantModels,
  selectedAppId,
  setSelectedAppId,
  apps,
  setApps,
  prochatModel,
  setProchatModel,
  selectedSkillNames,
  setSelectedSkillNames,
  templates,
  setTemplates,
  selectedTemplateId,
  handleTemplateChange,
  userDataPairs,
  handleUserDataPairChange,
  handleAddUserDataPair,
  handleRemoveUserDataPair,
  systemPrompt,
  setSystemPrompt,
  onOpenHistory,
  onOpenAudit,
  onExportTranscript,
  onClearConsole,
  sessionsCount,
  executedToolsCount
}) {
  const [activeTab, setActiveTab] = useState('agent'); // 'agent' | 'userdata' | 'skills' | 'system'

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1100,
      display: 'flex',
      justifyContent: 'flex-end',
      background: 'rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.15s ease'
    }}>
      {/* Backdrop Click */}
      <div style={{ flex: 1 }} onClick={onClose} />

      {/* Slide-out Drawer Box */}
      <div style={{
        width: '420px',
        maxWidth: '92vw',
        height: '100%',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1101,
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Drawer Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'rgba(139, 92, 246, 0.15)',
              padding: '7px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sliders size={18} color="var(--primary-violet)" />
            </div>
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-main)' }}>
                Session Configuration
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Model parameters, secrets & skills
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-outline"
            style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
            title="Close Settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(0, 0, 0, 0.15)',
          padding: '0 8px'
        }}>
          {[
            { id: 'agent', label: 'Agent & Model', icon: Cpu },
            { id: 'userdata', label: 'User Data', icon: Database },
            { id: 'skills', label: 'Skills Filter', icon: Zap },
            { id: 'system', label: 'System Prompt', icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '11px 4px',
                  fontSize: '0.74rem',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? 'var(--primary-violet)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? 'var(--primary-violet)' : 'transparent'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* TAB 1: Agent & Model */}
          {activeTab === 'agent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Tenant Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Tenant Access Key
                </label>
                <AsyncSearchableDropdown
                  value={selectedTenantId}
                  onChange={(val) => setSelectedTenantId(val)}
                  initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `🔑 ${tenants.find(t => t.id === selectedTenantId).name}` : ''}
                  fetchOptions={async (searchTerm) => {
                    const data = await tenantsApi.list({ search: searchTerm || '', page_size: 10, page: 1 });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    setTenants(prev => {
                      const newTs = [...prev];
                      items.forEach(t => {
                        if (!newTs.find(existing => existing.id === t.id)) newTs.push(t);
                      });
                      return newTs;
                    });
                    return items.map(t => ({
                      value: t.id,
                      label: `🔑 ${t.name}`
                    }));
                  }}
                  placeholder="Select Tenant"
                />
              </div>

              {/* Execution Model */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  LLM Execution Model
                </label>
                <AsyncSearchableDropdown
                  value={selectedModel}
                  onChange={(val) => setSelectedModel(val)}
                  fetchOptions={async (searchTerm) => {
                    const data = await tenantsApi.listLlms(null, { search: searchTerm || '', page_size: 10, page: 1, tenant_id: selectedTenantId || undefined });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    return items
                      .filter(m => m.provider !== 'prochat' && !m.model_name.toLowerCase().includes('genui'))
                      .map(m => ({
                        value: m.model_name,
                        label: `${m.model_name} (${m.provider})`
                      }));
                  }}
                  placeholder={tenantModels.length === 0 ? "No models" : "Select Model"}
                  disabled={!selectedTenantId}
                />
              </div>

              {/* Application Scope */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Application Scope
                </label>
                <AsyncSearchableDropdown
                  value={selectedAppId}
                  onChange={(val) => setSelectedAppId(val)}
                  initialLabel={apps.find(a => a.id === selectedAppId)?.name ? `📦 ${apps.find(a => a.id === selectedAppId).name}` : ''}
                  fetchOptions={async (searchTerm) => {
                    const data = await appsApi.list({ search: searchTerm || '', page_size: 10, page: 1, tenant_id: selectedTenantId || undefined });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    setApps(prev => {
                      const newApps = [...prev];
                      items.forEach(a => {
                        if (!newApps.find(existing => existing.id === a.id)) newApps.push(a);
                      });
                      return newApps;
                    });
                    return items.map(a => ({
                      value: a.id,
                      label: `📦 ${a.name} (${a.skills_count || (a.skill_names ? a.skill_names.length : 0)} skills)`
                    }));
                  }}
                  placeholder="Select Application..."
                />
              </div>

              {/* Generative UI Model */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={12} color={prochatModel.trim() ? 'var(--primary-violet)' : 'var(--text-muted)'} />
                    Generative UI (ProChat)
                  </span>
                </label>
                <div style={{ position: 'relative', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={prochatModel}
                    onChange={(e) => setProchatModel(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: '0.82rem',
                      borderRadius: '8px',
                      border: `1px solid ${prochatModel.trim() ? 'rgba(139, 92, 246, 0.5)' : 'var(--border-subtle)'}`,
                      background: prochatModel.trim() ? 'rgba(139, 92, 246, 0.06)' : 'var(--bg-input)',
                      color: prochatModel.trim() ? 'var(--primary-violet)' : 'var(--text-sub)',
                      outline: 'none',
                    }}
                  >
                    <option value="">— disabled —</option>
                    {tenantModels
                      .filter(m => m.provider === 'prochat' || m.model_name.toLowerCase().includes('genui'))
                      .map(m => (
                        <option key={m.id} value={m.model_name}>
                          {m.model_name}
                        </option>
                      ))}
                  </select>
                  {prochatModel.trim() && (
                    <button
                      onClick={() => setProchatModel('')}
                      title="Clear ProChat model"
                      className="btn-outline"
                      style={{ padding: '6px', borderRadius: '8px' }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: User Data */}
          {activeTab === 'userdata' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Load Profile Template
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <AsyncSearchableDropdown
                      value={selectedTemplateId}
                      onChange={handleTemplateChange}
                      initialLabel={selectedTemplateId ? `📋 ${templates.find(t => t.id === selectedTemplateId)?.name || 'Loading Profile...'}` : ''}
                      fetchOptions={async (searchTerm) => {
                        const data = await userDataApi.list({ search: searchTerm || '', page_size: 20, page: 1, tenant_id: selectedTenantId || undefined });
                        const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                        setTemplates(prev => {
                          const newTs = [...prev];
                          items.forEach(t => {
                            if (!newTs.find(existing => existing.id === t.id)) newTs.push(t);
                          });
                          return newTs;
                        });
                        return items.map(t => ({
                          value: t.id,
                          label: `📋 ${t.name}`
                        }));
                      }}
                      placeholder="Select user data profile..."
                    />
                  </div>
                  {selectedTemplateId && (
                    <button
                      type="button"
                      onClick={() => handleTemplateChange('')}
                      className="btn-outline"
                      style={{ padding: '7px 8px', borderRadius: '8px' }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Key-Value Pairs (Injected into Sandbox)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {userDataPairs.map((pair, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Key"
                        value={pair.key}
                        onChange={(e) => handleUserDataPairChange(idx, 'key', e.target.value)}
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          color: 'var(--text-main)',
                          fontSize: '0.78rem',
                          outline: 'none'
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={pair.value}
                        onChange={(e) => handleUserDataPairChange(idx, 'value', e.target.value)}
                        style={{
                          flex: 1.2,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '7px 10px',
                          color: 'var(--text-main)',
                          fontSize: '0.78rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveUserDataPair(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent-rose)',
                          cursor: 'pointer',
                          padding: '4px',
                          fontSize: '0.9rem'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleAddUserDataPair}
                    style={{ padding: '6px 12px', fontSize: '0.76rem', alignSelf: 'flex-start', marginTop: '4px' }}
                  >
                    <Plus size={13} /> Add Key-Value
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Skills Filter */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Filter Active Skills
                </label>
                <AsyncSearchableDropdown
                  value=''
                  onChange={(val) => { if (val && !selectedSkillNames.includes(val)) setSelectedSkillNames(prev => [...prev, val]); }}
                  fetchOptions={async (searchTerm) => {
                    const data = await skillsApi.list({ search: searchTerm || '', page_size: 30, page: 1, tenant_id: selectedTenantId || undefined });
                    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
                    return items.filter(s => !selectedSkillNames.includes(s.name)).map(s => ({ value: s.name, label: `🧩 ${s.name}` }));
                  }}
                  placeholder="Search and add skill..."
                />
              </div>

              {selectedSkillNames.length > 0 ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Selected ({selectedSkillNames.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSkillNames([])}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-rose)', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedSkillNames.map(name => (
                      <span key={name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px', borderRadius: '16px', fontSize: '0.74rem',
                        background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
                        color: 'var(--primary-violet)'
                      }}>
                        🧩 {name}
                        <button type="button" onClick={() => setSelectedSkillNames(prev => prev.filter(s => s !== name))}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0', display: 'flex', alignItems: 'center' }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--border-subtle)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  No skill filter applied. All skills in the selected app scope are enabled by default.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: System Prompt */}
          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                System Instructions
              </label>
              <textarea
                value={systemPrompt || ''}
                onChange={(e) => setSystemPrompt && setSystemPrompt(e.target.value)}
                placeholder="You are AI Skill Engine, equipped with advanced sandboxes..."
                rows={8}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  lineHeight: '1.5',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Defines the persona, constraints, and instructions for the agent during this session.
              </span>
            </div>
          )}

        </div>

        {/* Drawer Footer Actions */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={onOpenHistory}
              style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '8px' }}
            >
              <History size={14} color="var(--primary-violet)" /> History ({sessionsCount || 0})
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={onOpenAudit}
              style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '8px' }}
            >
              <Terminal size={14} color="var(--primary-emerald)" /> Audit Logs ({executedToolsCount || 0})
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={onExportTranscript}
              style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '8px' }}
            >
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={onClearConsole}
              style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '8px', color: 'var(--accent-rose)' }}
            >
              <Trash2 size={14} /> Clear Chat
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
