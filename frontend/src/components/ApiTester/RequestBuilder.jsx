import React from 'react';
import { Play, ToggleRight, ToggleLeft, X } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';

export default function RequestBuilder({
  systemPrompt,
  setSystemPrompt,
  selectedTenantId,
  setSelectedTenantId,
  tenants,
  setTenants,
  model,
  setModel,
  tenantModels,
  appId,
  setAppId,
  apps,
  setApps,
  prochatModel,
  setProchatModel,
  stream,
  setStream,
  uploadedFile,
  setUploadedFile,
  uploading,
  handleFileUpload,
  attachMode,
  setAttachMode,
  selectedSkillNames,
  setSelectedSkillNames,
  selectedTemplateId,
  handleTemplateChange,
  templates,
  setTemplates,
  userDataPairs,
  handleUserDataPairChange,
  handleRemoveUserDataPair,
  handleAddUserDataPair,
  currentMessage,
  setCurrentMessage,
  handleSend,
  loading,
  selectedTenantKey,
  isPaused,
  togglePause
}) {
  return (
    <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ fontSize: '1.02rem', fontWeight: '600', color: 'var(--text-main)' }}>
        Request Configuration
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>System Prompt</label>
        <textarea
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt..."
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '10px', color: 'var(--text-main)',
            resize: 'vertical', fontSize: '0.88rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Auth Tenant Key</label>
        <div style={{ width: '220px' }}>
          <AsyncSearchableDropdown
            value={selectedTenantId}
            onChange={(val) => setSelectedTenantId(val)}
            initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `${tenants.find(t => t.id === selectedTenantId).name} (••••${(tenants.find(t => t.id === selectedTenantId).api_key || '').slice(-4)})` : ''}
            fetchOptions={async (searchTerm) => {
              const url = `/api/v1/tenants?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
              const res = await fetch(url);
              const data = await res.json();
              setTenants(prev => {
                const newTs = [...prev];
                (data.items || []).forEach(t => {
                  if (!newTs.find(existing => existing.id === t.id)) newTs.push(t);
                });
                return newTs;
              });
              return (data.items || []).map(t => ({
                value: t.id,
                label: `${t.name} (••••${t.api_key.slice(-4)})`
              }));
            }}
            placeholder="Select Tenant"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Model</label>
          <div style={{ width: '100%' }}>
            <AsyncSearchableDropdown
              value={model}
              onChange={(val) => setModel(val)}
              fetchOptions={async (searchTerm) => {
                if (!selectedTenantKey) return [];
                const url = `/api/v1/tenant/llms?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${selectedTenantKey}` } });
                const data = await res.json();
                return (data.items || [])
                  .filter(m => m.provider !== 'prochat' && !m.model_name.toLowerCase().includes('genui'))
                  .map(m => ({
                    value: m.model_name,
                    label: `${m.model_name} (${m.provider})`
                  }));
              }}
              placeholder={tenantModels.length === 0 ? "No models configured" : "Select Model"}
              disabled={!selectedTenantKey}
            />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>App Scope (Optional)</label>
          <div style={{ width: '100%' }}>
            <AsyncSearchableDropdown
              value={appId}
              onChange={(val) => setAppId(val)}
              initialLabel={apps.find(a => a.id === appId)?.name ? `📦 ${apps.find(a => a.id === appId).name}` : ''}
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
                  { value: "", label: "No App Filter (All Skills)" },
                  ...(data.items || []).map(a => ({
                    value: a.id,
                    label: a.name
                  }))
                ];
              }}
              placeholder="No App Filter (All Skills)"
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>ProChat UI Model (Optional)</label>
        <select
          value={prochatModel}
          onChange={(e) => setProchatModel(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-input)',
            color: 'var(--text-main)',
            fontSize: '0.88rem',
            outline: 'none',
            transition: 'border-color 0.2s',
            cursor: 'pointer'
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
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-main)' }}>Enable SSE Event Stream</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Streams tool execution reasoning in real time</div>
        </div>
        <button
          onClick={() => setStream(!stream)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {stream ? (
            <ToggleRight size={38} color="var(--primary-emerald)" />
          ) : (
            <ToggleLeft size={38} color="var(--text-muted)" />
          )}
        </button>
      </div>

      {/* File Upload Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px dashed var(--border-subtle)', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Attach File to API Call</label>

        {!uploadedFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="file"
              id="api-tester-file-upload"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <label
              htmlFor="api-tester-file-upload"
              className="btn-outline"
              style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {uploading ? 'Uploading...' : 'Choose File'}
            </label>
            {uploading && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Syncing with cloud...</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-main)', background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '6px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                📎 {uploadedFile.name}
              </span>
              <button
                type="button"
                onClick={() => setUploadedFile(null)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.76rem' }}
              >
                Remove
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.7er', color: 'var(--text-muted)', fontWeight: '600' }}>Attachment Mode</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="attachMode"
                    value="text"
                    checked={attachMode === 'text'}
                    onChange={() => setAttachMode('text')}
                  />
                  Inject URL in Prompt
                </label>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="attachMode"
                    value="image"
                    checked={attachMode === 'image'}
                    onChange={() => setAttachMode('image')}
                  />
                  Multimodal Image Block
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Skill Filter (Optional)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
          {selectedSkillNames.map(name => (
            <span key={name} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem',
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              color: 'var(--primary-violet)'
            }}>
              🧩 {name}
              <button type="button" onClick={() => setSelectedSkillNames(prev => prev.filter(s => s !== name))}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <AsyncSearchableDropdown
          value=''
          onChange={(val) => { if (val && !selectedSkillNames.includes(val)) setSelectedSkillNames(prev => [...prev, val]); }}
          fetchOptions={async (searchTerm) => {
            const res = await fetch(`/api/v1/skills?search=${encodeURIComponent(searchTerm || '')}&page_size=30&page=1`);
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
            return items.filter(s => !selectedSkillNames.includes(s.name)).map(s => ({ value: s.name, label: `🧩 ${s.name}` }));
          }}
          placeholder="Add skill to filter..."
        />
        {selectedSkillNames.length > 0 && (
          <button type="button" onClick={() => setSelectedSkillNames([])}
            style={{ alignSelf: 'flex-start', fontSize: '0.71rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            Clear all filters
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>User Data Context (Optional)</label>
        <div style={{ position: 'relative', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <AsyncSearchableDropdown
              value={selectedTemplateId}
              onChange={handleTemplateChange}
              initialLabel={selectedTemplateId ? `📋 ${templates.find(t => t.id === selectedTemplateId)?.name || 'Loading Profile...'}` : ''}
              fetchOptions={async (searchTerm) => {
                const url = `/api/v1/user_data_templates?search=${encodeURIComponent(searchTerm || '')}&page_size=20&page=1`;
                const res = await fetch(url);
                const data = await res.json();
                setTemplates(prev => {
                  const newTs = [...prev];
                  (data.items || []).forEach(t => {
                    if (!newTs.find(existing => existing.id === t.id)) newTs.push(t);
                  });
                  return newTs;
                });
                return (data.items || []).map(t => ({
                  value: t.id,
                  label: `📋 ${t.name}`
                }));
              }}
              placeholder="Load User Data Profile..."
            />
          </div>
          {selectedTemplateId && (
            <button
              type="button"
              onClick={() => handleTemplateChange('')}
              title="Clear profile template"
              style={{
                padding: '7px 8px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {userDataPairs.map((pair, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  padding: '8px 10px',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem'
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
                  padding: '8px 10px',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem'
                }}
              />
              <button
                type="button"
                onClick={() => handleRemoveUserDataPair(idx)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-outline"
            onClick={handleAddUserDataPair}
            style={{ padding: '6px 12px', fontSize: '0.78rem', alignSelf: 'flex-start' }}
          >
            + Add Pair
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>User Message</label>
        <textarea
          rows={4}
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Enter your next message here..."
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '10px', color: 'var(--text-main)',
            resize: 'vertical', fontSize: '0.88rem'
          }}
        />
      </div>

      <button
        className={loading ? "btn-outline" : "btn-gradient"}
        onClick={loading ? togglePause : handleSend}
        disabled={(!loading && !selectedTenantKey) || uploading}
        style={{
          width: '100%',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          ...(loading && {
            color: 'var(--accent-rose)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            background: 'rgba(244, 63, 94, 0.06)'
          })
        }}
      >
        {loading ? <X size={16} /> : <Play size={16} />}
        {loading ? 'Stop Execution' : 'Execute Request'}
      </button>
    </div>
  );
}
