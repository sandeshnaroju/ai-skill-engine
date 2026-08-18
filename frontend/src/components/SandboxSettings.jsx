import React, { useState, useEffect } from 'react';
import { HardDrive, Server, Shield, Cloud, Save, Eye, EyeOff, Loader, Check, X } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { systemApi, tenantsApi, apiClient } from '../api';

const PROVIDERS = [
  {
    id: 'none',
    label: 'Docker / Local Process (Default)',
    icon: HardDrive,
    description: 'Runs execution inside local Docker containers on the server host. If Docker is unavailable, falls back to running as a subprocess on the local host filesystem.',
    color: 'var(--primary-violet)',
  },
  {
    id: 'e2b',
    label: 'E2B Sandboxes',
    icon: Shield,
    description: 'Run code dynamically in E2B\'s cloud-managed Firecracker micro-VMs. Highly secure, ephemeral, and starts in milliseconds.',
    color: '#FF7043',
  },
  {
    id: 'azure',
    label: 'Azure Container Apps',
    icon: Server,
    description: 'Utilize Azure Container Apps Dynamic Sessions pool. Provides secure, Hyper-V isolated serverless Python runtimes.',
    color: '#0078D4',
  },
  {
    id: 'fly',
    label: 'Fly.io Machines',
    icon: Cloud,
    description: 'Execute sandbox commands remotely inside a Fly.io machine instance using the Fly.io Machines client API.',
    color: '#3F51B5',
  },
  {
    id: 'lambda',
    label: 'AWS Lambda',
    icon: Cloud,
    description: 'Route execution calls serverlessly using AWS Lambda functions. Provides quick isolated scale-out.',
    color: '#FF9900',
  },
];

function MaskedInput({ id, label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '9px 38px 9px 12px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-main)',
            fontSize: '0.86rem',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '9px 12px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          color: 'var(--text-main)',
          fontSize: '0.86rem',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function SandboxSettings() {
  const [provider, setProvider] = useState('none');
  const [tenantName, setTenantName] = useState('Global');
  const [form, setForm] = useState({
    e2b_api_key: '',
    azure_client_id: '',
    azure_client_secret: '',
    azure_tenant_id: '',
    azure_session_pool_endpoint: '',
    fly_api_token: '',
    fly_app_name: '',
    aws_access_key: '',
    aws_secret_key: '',
    aws_region: 'us-east-1',
    aws_function_name: '',
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'success' | 'error'
  const [saveMessage, setSaveMessage] = useState('');

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const fetchTenants = async () => {
    try {
      const data = await tenantsApi.list();
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      setTenants(items);
      if (items.length > 0) {
        setSelectedTenantId(items[0].id);
      }
    } catch (e) {
      console.error('Failed to fetch tenants', e);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;
    (async () => {
      setLoading(true);
      try {
        const data = await apiClient.get('/api/v1/sandbox/config', { params: { tenant_id: selectedTenantId } });
        setProvider(data.provider || 'none');
        setTenantName(data.tenant_name || 'Global');
        setForm(prev => ({
          ...prev,
          e2b_api_key: data.e2b_api_key || '',
          azure_client_id: data.azure_client_id || '',
          azure_client_secret: data.azure_client_secret || '',
          azure_tenant_id: data.azure_tenant_id || '',
          azure_session_pool_endpoint: data.azure_session_pool_endpoint || '',
          fly_api_token: data.fly_api_token || '',
          fly_app_name: data.fly_app_name || '',
          aws_access_key: data.aws_access_key || '',
          aws_secret_key: data.aws_secret_key || '',
          aws_region: data.aws_region || 'us-east-1',
          aws_function_name: data.aws_function_name || '',
        }));
      } catch (e) {
        console.error('Failed to load sandbox config', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedTenantId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    setSaveMessage('');

    try {
      const data = await apiClient.put('/api/v1/sandbox/config', {
        provider,
        ...form,
        tenant_id: selectedTenantId,
      });

      setSaveStatus('success');
      setSaveMessage(data.message || 'Sandbox configuration saved successfully.');
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage(err.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
            Sandbox Configuration
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Configure remote runtimes to execute python commands, compile packages, and test generated code inside secure, isolated sandboxes.
          </p>
        </div>
        <span className="badge-tag tag-shell" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Workspace: {tenantName}
        </span>
      </div>

      {/* Tenant Selector Dropdown */}
      {tenants && tenants.length > 0 && (
        <div className="glass-box" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Configure Sandbox for Workspace / Tenant</div>
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader className="spin" size={32} style={{ color: 'var(--primary-violet)' }} />
        </div>
      ) : (
        <form onSubmit={handleSave}>
          {/* Provider Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {PROVIDERS.map(p => {
              const Icon = p.icon;
              const isSelected = provider === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    border: isSelected ? `2px solid ${p.color}` : '1.5px solid var(--border-subtle)',
                    background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <div style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: isSelected ? p.color + '15' : 'var(--bg-input)',
                      color: isSelected ? p.color : 'var(--text-muted)',
                      display: 'flex',
                    }}>
                      <Icon size={20} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.94rem', color: isSelected ? 'var(--text-main)' : 'var(--text-muted)' }}>
                      {p.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Configuration Form Cards */}
          {provider !== 'none' && (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '28px',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Configure {PROVIDERS.find(p => p.id === provider)?.label}
              </h3>

              {provider === 'e2b' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                  <MaskedInput
                    id="e2b_api_key"
                    label="E2B API Key"
                    value={form.e2b_api_key}
                    onChange={v => setField('e2b_api_key', v)}
                    placeholder="e2b_..."
                  />
                </div>
              )}

              {provider === 'azure' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <Field
                      id="azure_session_pool_endpoint"
                      label="Session Pool Endpoint"
                      value={form.azure_session_pool_endpoint}
                      onChange={v => setField('azure_session_pool_endpoint', v)}
                      placeholder="https://<pool-name>.<env-id>.<region>.azurecontainerapps.io"
                    />
                  </div>
                  <Field
                    id="azure_tenant_id"
                    label="Entra ID Tenant ID"
                    value={form.azure_tenant_id}
                    onChange={v => setField('azure_tenant_id', v)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                  <Field
                    id="azure_client_id"
                    label="Entra ID App Client ID"
                    value={form.azure_client_id}
                    onChange={v => setField('azure_client_id', v)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                  <div style={{ gridColumn: 'span 2' }}>
                    <MaskedInput
                      id="azure_client_secret"
                      label="Entra ID Client Secret"
                      value={form.azure_client_secret}
                      onChange={v => setField('azure_client_secret', v)}
                      placeholder="Client Secret Value"
                    />
                  </div>
                </div>
              )}

              {provider === 'fly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <Field
                    id="fly_app_name"
                    label="Fly.io App Name"
                    value={form.fly_app_name}
                    onChange={v => setField('fly_app_name', v)}
                    placeholder="my-fly-sandbox-app"
                  />
                  <MaskedInput
                    id="fly_api_token"
                    label="Fly.io API Token"
                    value={form.fly_api_token}
                    onChange={v => setField('fly_api_token', v)}
                    placeholder="Fly V1 App Token"
                  />
                </div>
              )}

              {provider === 'lambda' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <Field
                    id="aws_function_name"
                    label="AWS Lambda Function Name"
                    value={form.aws_function_name}
                    onChange={v => setField('aws_function_name', v)}
                    placeholder="my-lambda-python-sandbox"
                  />
                  <Field
                    id="aws_region"
                    label="AWS Region"
                    value={form.aws_region}
                    onChange={v => setField('aws_region', v)}
                    placeholder="us-east-1"
                  />
                  <MaskedInput
                    id="aws_access_key"
                    label="AWS Access Key ID"
                    value={form.aws_access_key}
                    onChange={v => setField('aws_access_key', v)}
                    placeholder="AKIA..."
                  />
                  <MaskedInput
                    id="aws_secret_key"
                    label="AWS Secret Access Key"
                    value={form.aws_secret_key}
                    onChange={v => setField('aws_secret_key', v)}
                    placeholder="Secret Key"
                  />
                </div>
              )}
            </div>
          )}

          {/* Feedback Messages */}
          {saveStatus && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '0.86rem',
              marginBottom: '20px',
              background: saveStatus === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
              border: saveStatus === 'success' ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(244, 67, 54, 0.3)',
              color: saveStatus === 'success' ? '#81C784' : '#E57373',
            }}>
              {saveStatus === 'success' ? <Check size={16} /> : <X size={16} />}
              <span>{saveMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                background: 'var(--primary-violet)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader className="spin" size={16} /> : <Save size={16} />}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
