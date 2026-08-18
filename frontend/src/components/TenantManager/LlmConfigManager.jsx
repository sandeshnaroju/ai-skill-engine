import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { tenantsApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function LlmConfigManager({
  selectedTenant,
  tenantLlms,
  modelTotalItems,
  modelTotalPages,
  modelPage,
  setModelPage,
  fetchTenantLlms,
  fetchTenants
}) {
  const { showSuccess, confirmAction } = useToast();
  const [provider, setProvider] = useState('openai');
  const [modelName, setModelName] = useState('');
  const [modelApiKey, setModelApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [inputRate, setInputRate] = useState(1.0);
  const [outputRate, setOutputRate] = useState(2.0);
  const [audioInputRate, setAudioInputRate] = useState(10.0);
  const [audioOutputRate, setAudioOutputRate] = useState(20.0);
  const [showAdvancedRates, setShowAdvancedRates] = useState(false);
  const [editingLlmId, setEditingLlmId] = useState(null);
  const [registryLoading, setRegistryLoading] = useState(false);

  const handleAddLlm = async (e) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setRegistryLoading(true);
    try {
      const payload = {
        provider,
        model_name: modelName.trim(),
        api_key: modelApiKey.trim(),
        base_url: baseUrl.trim() || null,
        input_rate: parseFloat(inputRate),
        output_rate: parseFloat(outputRate),
        audio_input_rate: parseFloat(audioInputRate),
        audio_output_rate: parseFloat(audioOutputRate)
      };

      await tenantsApi.createLlm(payload, selectedTenant.api_key);
      showSuccess(`LLM model "${modelName}" registered successfully`);
      cancelEdit();
      setModelPage(1);
      fetchTenantLlms(selectedTenant);
      fetchTenants();
    } catch (err) {
      console.error('Add model config error:', err);
    } finally {
      setRegistryLoading(false);
    }
  };

  const handleEditLlmClick = (l) => {
    setEditingLlmId(l.id);
    setProvider(l.provider || 'openai');
    setModelName(l.model_name || '');
    setModelApiKey(''); 
    setBaseUrl(l.base_url || '');
    setInputRate(l.input_rate !== undefined ? l.input_rate : 1.0);
    setOutputRate(l.output_rate !== undefined ? l.output_rate : 2.0);
    setAudioInputRate(l.audio_input_rate !== undefined ? l.audio_input_rate : 10.0);
    setAudioOutputRate(l.audio_output_rate !== undefined ? l.audio_output_rate : 20.0);
  };

  const cancelEdit = () => {
    setEditingLlmId(null);
    setProvider('openai');
    setModelName('');
    setModelApiKey('');
    setBaseUrl('');
    setInputRate(1.0);
    setOutputRate(2.0);
    setAudioInputRate(10.0);
    setAudioOutputRate(20.0);
  };

  const handleDeleteLlm = (llmId) => {
    if (!selectedTenant) return;
    confirmAction({
      title: 'Delete Model Configuration',
      message: 'Are you sure you want to delete this LLM model configuration?',
      confirmText: 'Delete Model',
      onConfirm: async () => {
        try {
          await tenantsApi.deleteLlm(llmId, selectedTenant.api_key);
          fetchTenantLlms(selectedTenant);
          fetchTenants();
          showSuccess('Model configuration deleted successfully');
        } catch (err) {
          console.error('Delete model error:', err);
        }
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <form onSubmit={handleAddLlm} autoComplete="off" style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input type="text" name="decoy_username" style={{ display: 'none' }} autoComplete="off" />
        <input type="password" name="decoy_password" style={{ display: 'none' }} autoComplete="new-password" />

        <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={15} color="var(--primary-cyan)" /> {editingLlmId ? 'Edit Model Configuration' : 'Register New Model'}
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

        {editingLlmId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>API Key</label>
            <input
              type="password"
              placeholder="••••••••••••••••"
              value="hidden_preserved"
              disabled
              style={{ padding: '8px', fontSize: '0.82rem', opacity: 0.6, cursor: 'not-allowed' }}
            />
          </div>
        ) : (
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
        )}

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

        <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: '600' }}>Pricing Configuration (USD per 1M Tokens)</label>
            <button 
              type="button" 
              onClick={() => setShowAdvancedRates(!showAdvancedRates)}
              style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.74rem', cursor: 'pointer', fontWeight: '600' }}
            >
              {showAdvancedRates ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-sub)' }}>Input Rate</label>
              <input
                type="number"
                step="0.01"
                value={inputRate}
                onChange={(e) => setInputRate(e.target.value)}
                style={{ padding: '6px', fontSize: '0.8rem' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-sub)' }}>Output Rate</label>
              <input
                type="number"
                step="0.01"
                value={outputRate}
                onChange={(e) => setOutputRate(e.target.value)}
                style={{ padding: '6px', fontSize: '0.8rem' }}
              />
            </div>
          </div>

          {showAdvancedRates && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-sub)' }}>Audio Input Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={audioInputRate}
                  onChange={(e) => setAudioInputRate(e.target.value)}
                  style={{ padding: '6px', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-sub)' }}>Audio Output Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={audioOutputRate}
                  onChange={(e) => setAudioOutputRate(e.target.value)}
                  style={{ padding: '6px', fontSize: '0.8rem' }}
                />
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button type="submit" className="btn-gradient" style={{ flex: 1, padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} disabled={registryLoading}>
            <Plus size={16} /> {registryLoading ? 'Saving...' : (editingLlmId ? 'Update Model Config' : 'Register Model Config')}
          </button>
          {editingLlmId && (
            <button type="button" onClick={cancelEdit} className="btn-outline" style={{ padding: '10px 16px', fontSize: '0.82rem' }}>
              Cancel
            </button>
          )}
        </div>
      </form>

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

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-outline"
                      onClick={() => handleEditLlmClick(l)}
                      style={{ padding: '4px 8px', color: 'var(--primary-cyan)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => handleDeleteLlm(l.id)}
                      style={{ padding: '4px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

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
  );
}
