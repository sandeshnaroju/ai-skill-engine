import React, { useState, useEffect } from 'react';
import { Key, Plus, ShieldCheck, Copy, Check, Server, Terminal, Code, Trash2, Cpu, Layers, Globe, Activity, X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function TenantManager() {
  const [tenants, setTenants] = useState([]);
  const [newTenantName, setNewTenantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // Tenants Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // LLM Registry state
  const [tenantLlms, setTenantLlms] = useState([]);
  const [provider, setProvider] = useState('openai');
  const [modelName, setModelName] = useState('');
  const [modelApiKey, setModelApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [registryLoading, setRegistryLoading] = useState(false);
  
  // Model Configs Pagination state
  const [modelPage, setModelPage] = useState(1);
  const [modelPageSize, setModelPageSize] = useState(4);
  const [modelTotalPages, setModelTotalPages] = useState(1);
  const [modelTotalItems, setModelTotalItems] = useState(0);
  
  // Modal visibility
  const [showManageModal, setShowManageModal] = useState(false);

  const fetchTenants = async () => {
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      });
      const res = await fetch(`/api/v1/tenants?${queryParams.toString()}`);
      const data = await res.json();
      if (data && data.items !== undefined) {
        setTenants(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalItems(data.total || 0);
      } else {
        setTenants(data || []);
        setTotalPages(1);
        setTotalItems(data ? data.length : 0);
      }
    } catch (e) {
      console.error('Failed to fetch tenants:', e);
    }
  };

  const fetchTenantLlms = async (activeTenant) => {
    if (!activeTenant) return;
    try {
      const queryParams = new URLSearchParams({
        page: modelPage.toString(),
        page_size: modelPageSize.toString()
      });
      const res = await fetch(`/api/v1/tenant/llms?${queryParams.toString()}`, {
        headers: { 'X-API-Key': activeTenant.api_key }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.items !== undefined) {
          setTenantLlms(data.items || []);
          setModelTotalPages(data.pages || 1);
          setModelTotalItems(data.total || 0);
        } else {
          setTenantLlms(data || []);
          setModelTotalPages(1);
          setModelTotalItems(data ? data.length : 0);
        }
      }
    } catch (e) {
      console.error('Failed to fetch tenant LLMs:', e);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [page, pageSize]);

  useEffect(() => {
    if (selectedTenant) {
      fetchTenantLlms(selectedTenant);
    }
  }, [selectedTenant, modelPage, modelPageSize]);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTenantName }),
      });
      if (res.ok) {
        setNewTenantName('');
        setPage(1);
        fetchTenants();
      }
    } catch (err) {
      console.error('Create tenant error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete tenant "${name}"? This deletes all their model configs.`)) return;
    try {
      const res = await fetch(`/api/v1/tenants/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTenants();
      }
    } catch (err) {
      console.error('Delete tenant error:', err);
    }
  };

  const handleAddLlm = async (e) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setRegistryLoading(true);
    try {
      const res = await fetch('/api/v1/tenant/llms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': selectedTenant.api_key
        },
        body: JSON.stringify({
          provider,
          model_name: modelName,
          api_key: modelApiKey,
          base_url: baseUrl || null
        })
      });
      if (res.ok) {
        setModelName('');
        setModelApiKey('');
        setBaseUrl('');
        setModelPage(1);
        fetchTenantLlms(selectedTenant);
        // Refresh tenants to update card models count
        fetchTenants();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to register model'}`);
      }
    } catch (err) {
      console.error('Add model config error:', err);
    } finally {
      setRegistryLoading(false);
    }
  };

  const handleDeleteLlm = async (llmId) => {
    if (!selectedTenant || !window.confirm('Delete this LLM model configuration?')) return;
    try {
      const res = await fetch(`/api/v1/tenant/llms/${llmId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': selectedTenant.api_key }
      });
      if (res.ok) {
        fetchTenantLlms(selectedTenant);
        fetchTenants(); // Refresh cards counts
      }
    } catch (err) {
      console.error('Delete model error:', err);
    }
  };

  const copyToClipboard = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const snippetCurl = `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${selectedTenant?.api_key || 'YOUR_TENANT_API_KEY'}" \\
  -d '\''{
    "messages": [{"role": "user", "content": "Check server uptime"}],
    "session_id": "chatbot_user_101",
    "model": "${tenantLlms[0]?.model_name || 'gemini-2.5-flash'}"
  }'\''`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner & Creation Form */}
      <div className="glass-box" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Key size={22} color="var(--primary-cyan)" /> Register Enterprise Tenant
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginBottom: '20px' }}>
          Businesses connect their chatbots to `AI Skill Engine` using dedicated tenant API keys for isolated skill execution and audit logging.
        </p>

        <form onSubmit={handleCreateTenant} style={{ display: 'flex', gap: '12px', maxWidth: '640px' }}>
          <input
            type="text"
            placeholder="Business / Tenant Name (e.g. Acme Corp Support Bot)"
            value={newTenantName}
            onChange={(e) => setNewTenantName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-gradient" disabled={loading}>
            <Plus size={18} /> {loading ? 'Generating...' : 'Generate API Key'}
          </button>
        </form>
      </div>

      {/* Simplified Tenants List Grid */}
      <div className="glass-box" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '18px', color: 'var(--text-main)' }}>
          Registered Tenants ({totalItems})
        </h3>

        {tenants.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '32px' }}>
            No tenants registered yet. Register a new tenant above to get started!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
              {tenants.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.94rem' }}>{t.name}</span>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Models Configured: <strong style={{ color: 'var(--primary-cyan)' }}>{t.models_count || 0}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className="btn-gradient"
                        onClick={() => {
                          setSelectedTenant(t);
                          setModelPage(1);
                          setShowManageModal(true);
                        }}
                        style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                        title="Manage Models & Integration"
                      >
                        <Cpu size={12} /> Manage
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => handleDeleteTenant(t.id, t.name)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '8px' }}>
                    <code style={{ fontSize: '0.8rem', color: 'var(--primary-cyan)', flex: 1, wordBreak: 'break-all' }}>
                      {t.api_key}
                    </code>
                    <button
                      className="btn-outline"
                      onClick={() => copyToClipboard(t.api_key)}
                      style={{ padding: '6px' }}
                      title="Copy Key"
                    >
                      {copiedKey === t.api_key ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages} ({totalItems} tenants total)
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

      {/* Unified Manage Model & Integration Modal */}
      {showManageModal && selectedTenant && (
        <div className="modal-overlay" onClick={() => { setShowManageModal(false); setSelectedTenant(null); }}>
          <div className="modal-box" style={{ maxWidth: '960px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cpu size={22} color="var(--primary-cyan)" /> Tenant Settings: {selectedTenant.name}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
                  Manage dynamic LLM configurations and integrate API connections for this tenant.
                </p>
              </div>
              <button className="btn-outline" onClick={() => { setShowManageModal(false); setSelectedTenant(null); }} style={{ padding: '6px', borderRadius: '8px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
              
              {/* Left Column: LLM Configurations Manager */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Form to Add Model */}
                <form onSubmit={handleAddLlm} autoComplete="off" style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Decoy fields to intercept browser autofill */}
                  <input type="text" name="decoy_username" style={{ display: 'none' }} autoComplete="off" />
                  <input type="password" name="decoy_password" style={{ display: 'none' }} autoComplete="new-password" />

                  <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={15} color="var(--primary-cyan)" /> Register New Model
                  </h4>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Provider</label>
                      <select
                        value={provider}
                        onChange={(e) => {
                          const val = e.target.value;
                          setProvider(val);
                          if (val === 'prochat') {
                            setModelName('genui-mars-0.1');
                            setBaseUrl('https://www.prochat.dev/apps/api/v1');
                          } else {
                            setModelName('');
                            setBaseUrl('');
                          }
                        }}
                        style={{ padding: '8px' }}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="prochat">ProChat (Gen UI)</option>
                        <option value="custom">Custom Endpoint</option>
                      </select>
                    </div>

                    <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Model Name</label>
                      <input
                        type="text"
                        placeholder="e.g. gpt-4o"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        style={{ padding: '8px', fontSize: '0.82rem' }}
                        autoComplete="off"
                        name="model_name_entry"
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>API Key</label>
                    <input
                      type="password"
                      placeholder="Enter Provider API Key"
                      value={modelApiKey}
                      onChange={(e) => setModelApiKey(e.target.value)}
                      style={{ padding: '8px', fontSize: '0.82rem' }}
                      autoComplete="new-password"
                      name="model_key_entry"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Base URL (Optional)</label>
                    <input
                      type="text"
                      placeholder={provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : (provider === 'anthropic' ? 'e.g. https://api.anthropic.com/v1 (or proxy URL)' : 'Defaults to provider default')}
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      style={{ padding: '8px', fontSize: '0.82rem' }}
                    />
                  </div>

                  <button type="submit" className="btn-gradient" style={{ padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px' }} disabled={registryLoading}>
                    <Plus size={16} /> {registryLoading ? 'Registering...' : 'Register Model Config'}
                  </button>
                </form>

                {/* Configured Models list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)' }}>
                    Active Registered Models ({modelTotalItems})
                  </h4>

                  {tenantLlms.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px dotted var(--border-subtle)' }}>
                      No custom models registered for this tenant. Gateway default configurations will be used.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                        {tenantLlms.map((l) => (
                          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <div>
                              <div style={{ fontSize: '0.86rem', fontWeight: '600', color: 'var(--text-main)' }}>{l.model_name}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <span className="badge-tag tag-docker" style={{ padding: '1px 4px', fontSize: '0.62rem' }}>{l.provider}</span>
                                {l.base_url && <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }}>{l.base_url}</span>}
                              </div>
                            </div>

                            <button
                              className="btn-outline"
                              onClick={() => handleDeleteLlm(l.id)}
                              style={{ padding: '4px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Models list pagination */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          Page {modelPage} of {modelTotalPages} ({modelTotalItems} models)
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" className="btn-outline" onClick={() => setModelPage(p => Math.max(1, p - 1))} disabled={modelPage <= 1} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                            Prev
                          </button>
                          <button type="button" className="btn-outline" onClick={() => setModelPage(p => Math.min(modelTotalPages, p + 1))} disabled={modelPage >= modelTotalPages} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: API Integration Snippet & Live Tester */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'var(--bg-input)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Code size={15} color="var(--primary-cyan)" /> Integration Snippet
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Use the following cURL connection to send requests directly from your customer application using this tenant key:
                  </p>
                  <pre className="code-display" style={{ fontSize: '0.76rem', margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                    {snippetCurl}
                  </pre>
                  <button
                    className="btn-outline"
                    onClick={() => copyToClipboard(snippetCurl)}
                    style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.78rem' }}
                  >
                    {copiedKey === snippetCurl ? 'Copied Snippet!' : 'Copy Integration cURL'}
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
