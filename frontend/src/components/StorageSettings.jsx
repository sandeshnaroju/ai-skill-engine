import React, { useState, useEffect } from 'react';
import { HardDrive, UploadCloud, Server, Check, X, Loader, Save, Zap, Eye, EyeOff } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'local',
    label: 'Local Disk',
    icon: HardDrive,
    description: 'Store files on the server\'s local filesystem. Files are served via the built-in API. No external services required.',
    color: 'var(--primary-violet)',
  },
  {
    id: 'azure',
    label: 'Azure Blob Storage',
    icon: Server,
    description: 'Upload files to an Azure Blob container. Returns SAS token URLs or public blob URLs.',
    color: '#0078D4',
  },
  {
    id: 's3',
    label: 'AWS S3',
    icon: UploadCloud,
    description: 'Upload files directly to an AWS S3 bucket (or any S3-compatible service like MinIO). Returns public or pre-signed URLs.',
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

export default function StorageSettings() {
  const [provider, setProvider] = useState('local');
  const [form, setForm] = useState({
    bucket_name: '',
    region: 'us-east-1',
    access_key: '',
    secret_key: '',
    endpoint_url: '',
    container_name: '',
    account_name: '',
    account_key: '',
    use_presigned_urls: true,
    presigned_url_expires_seconds: 3600,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);   // null | 'success' | 'error'
  const [testResult, setTestResult] = useState(null);   // null | { success, message }
  const [saveError, setSaveError] = useState('');

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/storage/config');
        if (res.ok) {
          const data = await res.json();
          setProvider(data.provider || 'local');
          setForm(prev => ({
            ...prev,
            bucket_name: data.bucket_name || '',
            region: data.region || 'us-east-1',
            access_key: data.access_key || '',
            secret_key: data.secret_key || '',
            endpoint_url: data.endpoint_url || '',
            container_name: data.container_name || '',
            account_name: data.account_name || '',
            account_key: data.account_key || '',
            use_presigned_urls: data.use_presigned_urls !== false,
            presigned_url_expires_seconds: data.presigned_url_expires_seconds || 3600,
          }));
        }
      } catch (e) {
        console.error('Failed to load storage config', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [saveMessage, setSaveMessage] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    setSaveError('');
    setSaveMessage('');
    try {
      const res = await fetch('/api/v1/storage/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaveStatus('success');
        setSaveMessage(data.message || 'Configuration saved successfully.');
      } else {
        setSaveStatus('error');
        setSaveError(data.detail || 'Save failed.');
      }
    } catch (e) {
      setSaveStatus('error');
      setSaveError(String(e));
    } finally {
      setSaving(false);
      // Keep recommendation message visible longer
      setTimeout(() => setSaveStatus(null), 8000);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/v1/storage/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...form }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const activeProvider = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Active Provider Badge */}
      <div className="glass-box" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
        {React.createElement(activeProvider.icon, { size: 22, color: activeProvider.color })}
        <div>
          <div style={{ fontWeight: '700', fontSize: '0.96rem', color: 'var(--text-main)' }}>
            Active Storage: <span style={{ color: activeProvider.color }}>{activeProvider.label}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {activeProvider.description}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', padding: '24px 0' }}>
          <Loader size={18} className="spin" /> Loading configuration...
        </div>
      ) : (
        <>
          {/* Provider Selector */}
          <div className="glass-box" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '14px' }}>
              Storage Provider
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {PROVIDERS.map(p => {
                const Icon = p.icon;
                const isSelected = provider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      background: isSelected ? `rgba(139, 92, 246, 0.08)` : 'var(--bg-input)',
                      border: isSelected ? `2px solid var(--primary-violet)` : '2px solid var(--border-subtle)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ background: isSelected ? 'rgba(139,92,246,0.15)' : 'var(--bg-panel)', padding: '8px', borderRadius: '8px', flexShrink: 0 }}>
                      <Icon size={18} color={isSelected ? 'var(--primary-violet)' : 'var(--text-muted)'} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: isSelected ? 'var(--primary-violet)' : 'var(--text-main)' }}>
                        {p.label}
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{ marginLeft: 'auto' }}>
                        <Check size={16} color="var(--primary-violet)" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Form */}
          {provider !== 'local' && (
            <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                {provider === 's3' ? 'AWS S3 Configuration' : 'Azure Blob Configuration'}
              </div>

              {provider === 's3' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Field id="bucket_name" label="Bucket Name" value={form.bucket_name} onChange={v => setField('bucket_name', v)} placeholder="my-bucket" />
                    <Field id="region" label="Region" value={form.region} onChange={v => setField('region', v)} placeholder="us-east-1" />
                  </div>
                  <MaskedInput id="access_key" label="Access Key ID" value={form.access_key} onChange={v => setField('access_key', v)} placeholder="AKIAIOSFODNN7EXAMPLE" />
                  <MaskedInput id="secret_key" label="Secret Access Key" value={form.secret_key} onChange={v => setField('secret_key', v)} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" />
                  <Field id="endpoint_url" label="Custom Endpoint URL (optional — for MinIO, R2, etc.)" value={form.endpoint_url} onChange={v => setField('endpoint_url', v)} placeholder="https://s3.example.com" />
                </>
              )}

              {provider === 'azure' && (
                <>
                  <MaskedInput id="account_name" label="Storage Account Name" value={form.account_name} onChange={v => setField('account_name', v)} placeholder="mystorageaccount" />
                  <MaskedInput id="account_key" label="Account Key" value={form.account_key} onChange={v => setField('account_key', v)} placeholder="base64-encoded-account-key" />
                  <Field id="container_name" label="Container Name" value={form.container_name} onChange={v => setField('container_name', v)} placeholder="uploads" />
                </>
              )}

              {/* URL Mode Toggle */}
              <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.use_presigned_urls ? '12px' : 0 }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.86rem', color: 'var(--text-main)' }}>Pre-signed (Time-limited) URLs</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      When enabled, generated download links expire after the configured duration. Works with private buckets.
                    </div>
                  </div>
                  <button
                    onClick={() => setField('use_presigned_urls', !form.use_presigned_urls)}
                    style={{
                      flexShrink: 0,
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      border: 'none',
                      background: form.use_presigned_urls ? 'var(--primary-violet)' : 'var(--border-subtle)',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 0.2s',
                      marginLeft: '16px',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '3px',
                      left: form.use_presigned_urls ? '22px' : '3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
                {form.use_presigned_urls && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                    <label style={{ fontSize: '0.76rem', fontWeight: '600', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      Link Expiry (seconds):
                    </label>
                    <input
                      type="number"
                      min="60"
                      max="604800"
                      value={form.presigned_url_expires_seconds}
                      onChange={e => setField('presigned_url_expires_seconds', parseInt(e.target.value) || 3600)}
                      style={{
                        width: '100px',
                        padding: '6px 10px',
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: 'var(--text-main)',
                        fontSize: '0.86rem',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      ({Math.round((form.presigned_url_expires_seconds || 3600) / 60)} min)
                    </span>
                  </div>
                )}
                {!form.use_presigned_urls && (
                  <div style={{ marginTop: '8px', fontSize: '0.76rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ Public URLs require the bucket/container to have public read access enabled.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Local disk info */}
          {provider === 'local' && (
            <div className="glass-box" style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Local Storage Info
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Uploads path', value: 'sandbox/uploads/' },
                  { label: 'Outputs path', value: 'sandbox/outputs/' },
                  { label: 'Download proxy', value: '/api/v1/files/download/{filename}' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', minWidth: '130px' }}>{label}</span>
                    <code style={{ fontSize: '0.80rem', background: 'var(--bg-input)', padding: '3px 8px', borderRadius: '6px', color: 'var(--primary-violet)' }}>{value}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Connection Result */}
          {testResult && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              background: testResult.success ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.84rem',
            }}>
              {testResult.success
                ? <Check size={16} color="var(--primary-emerald)" />
                : <X size={16} color="#ef4444" />}
              <span style={{ color: testResult.success ? 'var(--primary-emerald)' : '#ef4444', fontWeight: '600' }}>
                {testResult.message}
              </span>
            </div>
          )}

          {/* Save Status */}
          {saveStatus === 'error' && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.84rem', color: '#ef4444' }}>
              {saveError}
            </div>
          )}
          {saveStatus === 'success' && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.84rem', color: 'var(--primary-emerald)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Check size={16} style={{ marginTop: '2px', flexShrink: 0 }} /> 
              <span>{saveMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {provider !== 'local' && (
              <button
                className="btn-outline"
                onClick={handleTest}
                disabled={testing}
                style={{ padding: '10px 20px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {testing ? <Loader size={15} className="spin" /> : <Zap size={15} color="var(--primary-violet)" />}
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
            )}
            <button
              className="btn-gradient"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '10px 24px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {saving ? <Loader size={15} className="spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
