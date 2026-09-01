import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, Plus, Trash2, Edit, Save, X, RefreshCw, ChevronLeft, ChevronRight, HelpCircle, Key } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { userDataApi, tenantsApi } from '../api';
import { useToast } from '../context/ToastContext';

export default function UserDataTemplates() {
  const { showError, showWarning, showSuccess, confirmAction } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  // Syncing with URL parameters
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '5', 10);

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

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Form states
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pairs, setPairs] = useState([{ key: '', value: '' }]);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [inputMode, setInputMode] = useState('pairs'); // 'pairs' or 'json'
  const [jsonText, setJsonText] = useState('{\n  "api_key": "example_secret_key"\n}');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await userDataApi.list({ page, page_size: pageSize, tenant_id: selectedTenantId || undefined });

      if (data && data.items !== undefined) {
        setTemplates(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalItems(data.total || 0);
      } else {
        setTemplates(data || []);
        setTotalPages(1);
        setTotalItems(data ? data.length : 0);
      }
    } catch (e) {
      console.error('Failed to fetch User Data templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const data = await tenantsApi.list();
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      setTenants(items);
      if (items.length > 0 && !selectedTenantId) {
        setSelectedTenantId(items[0].id);
      }
    } catch (e) {
      console.error('Failed to fetch tenants', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [page, pageSize, selectedTenantId]);

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleAddPair = () => {
    setPairs([...pairs, { key: '', value: '' }]);
  };

  const handleRemovePair = (index) => {
    const next = [...pairs];
    next.splice(index, 1);
    setPairs(next.length > 0 ? next : [{ key: '', value: '' }]);
  };

  const handlePairChange = (index, field, val) => {
    const next = [...pairs];
    next[index][field] = val;
    setPairs(next);
  };

  const handleEdit = (tpl) => {
    setEditingId(tpl.id);
    setName(tpl.name);
    setDescription(tpl.description || '');
    const dataObj = tpl.data || {};
    const mapped = Object.entries(dataObj).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    }));
    setPairs(mapped.length > 0 ? mapped : [{ key: '', value: '' }]);
    setJsonText(JSON.stringify(dataObj, null, 2));
    setInputMode('pairs');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPairs([{ key: '', value: '' }]);
    setJsonText('{\n  "api_key": "example_secret_key"\n}');
    setInputMode('pairs');
  };

  const handleToggleMode = (targetMode) => {
    if (targetMode === inputMode) return;
    if (targetMode === 'json') {
      const obj = {};
      pairs.forEach(p => {
        if (p.key.trim()) {
          obj[p.key.trim()] = p.value;
        }
      });
      setJsonText(JSON.stringify(obj, null, 2));
      setInputMode('json');
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          showWarning('JSON must be a valid key-value object (e.g. { "key": "value" })');
          return;
        }
        const mapped = Object.entries(parsed).map(([key, value]) => ({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value)
        }));
        setPairs(mapped.length > 0 ? mapped : [{ key: '', value: '' }]);
        setInputMode('pairs');
      } catch (err) {
        showWarning(`Invalid JSON format: ${err.message}. Please fix the JSON before switching back to key-value list mode.`);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    let dataDict = {};
    if (inputMode === 'pairs') {
      pairs.forEach(p => {
        if (p.key.trim()) {
          dataDict[p.key.trim()] = p.value;
        }
      });
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          showWarning('JSON must be a valid key-value object (e.g. { "key": "value" })');
          return;
        }
        dataDict = parsed;
      } catch (err) {
        showWarning(`Invalid JSON: ${err.message}. Please correct it before saving.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (editingId) {
        await userDataApi.update(editingId, name.trim(), description.trim() || null, dataDict);
      } else {
        await userDataApi.create(name.trim(), description.trim() || null, dataDict, selectedTenantId);
      }

      showSuccess(`User Data profile "${name.trim()}" saved successfully`);
      handleCancelEdit();
      fetchTemplates();
    } catch (err) {
      console.error('Save template error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, tplName) => {
    confirmAction({
      title: 'Delete User Data Profile',
      message: `Are you sure you want to delete User Data template "${tplName}"?`,
      confirmText: 'Delete Profile',
      onConfirm: async () => {
        try {
          await userDataApi.delete(id);
          fetchTemplates();
          showSuccess(`User Data template "${tplName}" deleted successfully`);
        } catch (err) {
          console.error('Delete template error:', err);
        }
      }
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
      {/* Left Column: Configured templates */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="glass-box" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="var(--primary-cyan)" /> User Data Profiles ({totalItems})
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '200px' }}>
                <AsyncSearchableDropdown
                  value={selectedTenantId}
                  onChange={(val) => setSelectedTenantId(val)}
                  fetchOptions={async (query) => {
                    try {
                      const data = await tenantsApi.list({ search: query, page_size: 20 });
                      const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                      return items.map(t => ({ value: t.id, label: t.name }));
                    } catch (e) {
                      console.error('Error fetching tenant options:', e);
                    }
                    return [];
                  }}
                  placeholder="Filter by tenant..."
                  initialLabel={tenants.find(t => t.id === selectedTenantId)?.name || ''}
                />
              </div>
              <button className="btn-outline" onClick={fetchTemplates} disabled={loading} style={{ padding: '6px 12px' }}>
                <RefreshCw size={14} className={loading ? 'spin' : ''} /> Reload
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No predefined User Data templates found. Create one using the form.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {templates.map((t) => (
                <div key={t.id} style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{t.name}</strong>
                        <span className="badge-tag tag-shell" style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                          Workspace: {t.tenant_name || 'Global'}
                        </span>
                      </div>
                      {t.description && (
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.description}</p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-outline"
                        onClick={() => handleEdit(t)}
                        style={{ padding: '4px 8px', color: 'var(--primary-cyan)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => handleDelete(t.id, t.name)}
                        style={{ padding: '4px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.84rem', color: 'var(--text-sub)', background: 'rgba(0, 0, 0, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {Object.entries(t.data || {}).map(([k, v]) => (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}:</span>
                          <code style={{ color: 'var(--primary-cyan)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Page {page} of {totalPages} ({totalItems} templates total)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Add / Edit Template Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <form className="glass-box" onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Plus size={20} color="var(--primary-cyan)" /> {editingId ? 'Edit User Data Profile' : 'Add User Data Profile'}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)' }}>Profile Name</label>
            <input
              type="text"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. OpenWeatherMap Keys"
              required
              style={{ width: '100%' }}
            />
          </div>

          {!editingId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)' }}>Workspace / Tenant</label>
              <AsyncSearchableDropdown
                value={selectedTenantId}
                onChange={(val) => setSelectedTenantId(val)}
                fetchOptions={async (query) => {
                  try {
                    const data = await tenantsApi.list({ search: query, page_size: 20 });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)' }}>Description (Optional)</label>
            <input
              type="text"
              className="text-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Used in sandbox and weather fetching tools..."
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Profile Credentials / Variables</span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => handleToggleMode('pairs')}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: inputMode === 'pairs' ? 'var(--bg-main)' : 'transparent',
                    color: inputMode === 'pairs' ? 'var(--primary-cyan)' : 'var(--text-muted)'
                  }}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleMode('json')}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: inputMode === 'json' ? 'var(--bg-main)' : 'transparent',
                    color: inputMode === 'json' ? 'var(--primary-cyan)' : 'var(--text-muted)'
                  }}
                >
                  JSON Object
                </button>
              </div>
            </label>

            {inputMode === 'pairs' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2px' }}>
                  <button type="button" className="btn-outline" onClick={handleAddPair} style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                    + Add Variable
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                  {pairs.map((pair, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr auto', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="text-input"
                        value={pair.key}
                        onChange={(e) => handlePairChange(idx, 'key', e.target.value)}
                        placeholder="Key (e.g. api_key)"
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      />
                      <input
                        type="text"
                        className="text-input"
                        value={pair.value}
                        onChange={(e) => handlePairChange(idx, 'value', e.target.value)}
                        placeholder="Value / Secret"
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => handleRemovePair(idx)}
                        disabled={pairs.length === 1}
                        style={{ padding: '6px 8px', color: 'var(--accent-rose)', borderColor: 'transparent' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <textarea
                  className="text-input"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='{\n  "api_key": "my_secret_key"\n}'
                  style={{
                    height: '240px',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    background: '#04070d',
                    color: '#93c5fd',
                    border: '1px solid var(--border-subtle)',
                    padding: '12px',
                    resize: 'none',
                    width: '100%'
                  }}
                  required
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Paste a valid JSON flat object (only strings, numbers, or booleans as values).
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="submit" className="btn-gradient" disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Profile'}
            </button>
            {editingId && (
              <button type="button" className="btn-outline" onClick={handleCancelEdit} style={{ flex: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <X size={16} /> Cancel
              </button>
            )}
          </div>
        </form>

        <div className="glass-box" style={{ padding: '20px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
          <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HelpCircle size={16} color="var(--primary-cyan)" /> How does User Data work?
          </h4>
          <p style={{ margin: '0 0 8px 0', lineHeight: '1.4' }}>
            User Data profiles allow you to bundle API keys, bearer tokens, or user-specific configurations securely.
          </p>
          <p style={{ margin: '0 0 8px 0', lineHeight: '1.4' }}>
            These variables are dynamically resolved inside custom Skills containing placeholders like <code>{`{{user_data.api_key}}`}</code>.
          </p>
          <p style={{ margin: 0, lineHeight: '1.4' }}>
            By using User Data, credentials remain hidden from the LLM model and are only injected during local or remote tool execution.
          </p>
        </div>
      </div>
    </div>
  );
}
