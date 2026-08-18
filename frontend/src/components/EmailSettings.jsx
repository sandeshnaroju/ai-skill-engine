import React, { useState, useEffect } from 'react';
import { Mail, Save, Eye, EyeOff, Loader, Check, X, Send, Play } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { systemApi, authApi, tenantsApi, apiClient } from '../api';

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
          autoComplete="new-password"
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

function Field({ id, label, value, onChange, placeholder, type = 'text', autoComplete = 'off' }) {
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
        autoComplete={autoComplete}
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

export default function EmailSettings() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedTenantLabel, setSelectedTenantLabel] = useState('');
  
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_username: '',
    smtp_password: '',
    sender_email: '',
    use_tls: true,
    use_ssl: false
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'success' | 'error'
  const [saveMessage, setSaveMessage] = useState('');

  const [testing, setTesting] = useState(false);
  const [testReceiver, setTestReceiver] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'success' | 'error'
  const [testMessage, setTestMessage] = useState('');

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const user = await authApi.getProfile();
        setCurrentUser(user);
        
        const tenantsData = await tenantsApi.list({ page_size: 100, page: 1 });
        const items = Array.isArray(tenantsData) ? tenantsData : (tenantsData.items || []);
        setTenants(items);
        if (items.length > 0) {
          handleTenantChange(items[0].id, items[0].name);
        }
      } catch (e) {
        console.error('Failed to query user profile or tenants:', e);
      }
    })();
  }, []);

  const loadEmailConfig = async (tenantId) => {
    setLoading(true);
    setSaveStatus(null);
    setSaveMessage('');
    try {
      const data = await apiClient.get('/api/v1/email_config', { params: { tenant_id: tenantId } });
      setForm({
        smtp_host: data.smtp_host || '',
        smtp_port: String(data.smtp_port || '587'),
        smtp_username: data.smtp_username || '',
        smtp_password: '',
        sender_email: data.sender_email || '',
        use_tls: data.use_tls ?? true,
        use_ssl: data.use_ssl ?? false
      });
    } catch (e) {
      console.error('Failed to load email config:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTenantChange = (tenantId, label) => {
    setSelectedTenantId(tenantId);
    if (label) setSelectedTenantLabel(label);
    if (tenantId) {
      loadEmailConfig(tenantId);
    } else {
      setForm({
        smtp_host: '',
        smtp_port: '587',
        smtp_username: '',
        smtp_password: '',
        sender_email: '',
        use_tls: true,
        use_ssl: false
      });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.smtp_host || !form.smtp_port || !form.sender_email) {
      setSaveStatus('error');
      setSaveMessage('SMTP Host, Port, and Sender Email are required.');
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    setSaveMessage('');

    try {
      const payload = {
        tenant_id: selectedTenantId || null,
        smtp_host: form.smtp_host,
        smtp_port: parseInt(form.smtp_port, 10),
        smtp_username: form.smtp_username || null,
        sender_email: form.sender_email,
        use_tls: form.use_tls,
        use_ssl: form.use_ssl
      };

      if (form.smtp_password) {
        payload.smtp_password = form.smtp_password;
      }

      const data = await apiClient.post('/api/v1/email_config', payload);

      setSaveStatus('success');
      setSaveMessage('SMTP mail configuration saved successfully for this workspace!');
      // clear password input
      setForm(prev => ({ ...prev, smtp_password: '' }));
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage(err.message || 'Failed to save SMTP configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (e) => {
    e.preventDefault();
    if (!testReceiver) {
      setTestStatus('error');
      setTestMessage('Test recipient email address is required.');
      return;
    }

    setTesting(true);
    setTestStatus(null);
    setTestMessage('');

    try {
      const data = await apiClient.post('/api/v1/email_config/test', {
        tenant_id: selectedTenantId || null,
        test_receiver: testReceiver
      });

      setTestStatus('success');
      setTestMessage(data.detail || 'Connection test successful! Email delivered.');
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err.message || 'A network error occurred.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '30px' }}>
      
      {/* Description header */}
      <div className="glass-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Mail size={18} color="var(--primary-violet)" /> SMTP Mail Settings
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
          Setup your custom SMTP details to enable the emailing skill for chatbots. Chatbots can invoke this SMTP configuration to automatically send diagnostic summaries, execution logs, or files to any recipient.
        </p>
      </div>

      <div className="glass-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
          Select Tenant to Configure
        </label>
        <div style={{ maxWidth: '320px' }}>
          <AsyncSearchableDropdown
            value={selectedTenantId}
            onChange={(val) => {
              const found = tenants.find(t => t.id === val);
              handleTenantChange(val, found ? found.name : '');
            }}
            initialLabel={selectedTenantLabel || tenants.find(t => t.id === selectedTenantId)?.name || ''}
            fetchOptions={async (searchTerm) => {
              const data = await tenantsApi.list({ search: searchTerm || '', page_size: 30, page: 1 });
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
                label: t.name
              }));
            }}
            placeholder="Choose Tenant Scope..."
          />
        </div>
      </div>

      {selectedTenantId ? (
        <>
          <form className="glass-box" onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', margin: 0 }}>
              SMTP Server Configurations
            </h4>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
                <Loader className="spin" size={24} color="var(--primary-violet)" />
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                  <Field
                    id="smtp_host"
                    label="SMTP Server Host"
                    value={form.smtp_host}
                    onChange={val => setForm(p => ({ ...p, smtp_host: val }))}
                    placeholder="e.g. smtp.gmail.com"
                  />
                  <Field
                    id="smtp_port"
                    label="SMTP Port"
                    value={form.smtp_port}
                    onChange={val => setForm(p => ({ ...p, smtp_port: val }))}
                    placeholder="e.g. 587 or 465"
                    type="number"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Field
                    id="smtp_username"
                    label="SMTP Username"
                    value={form.smtp_username}
                    onChange={val => setForm(p => ({ ...p, smtp_username: val }))}
                    placeholder="Username or login email"
                  />
                  <MaskedInput
                    id="smtp_password"
                    label="SMTP Password"
                    value={form.smtp_password}
                    onChange={val => setForm(p => ({ ...p, smtp_password: val }))}
                    placeholder="••••••••••••"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
                  <Field
                    id="sender_email"
                    label="Sender Email Address"
                    value={form.sender_email}
                    onChange={val => setForm(p => ({ ...p, sender_email: val }))}
                    placeholder="e.g. bot@yourdomain.com"
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                      Encryption Protocol
                    </span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.use_tls}
                          onChange={e => setForm(p => ({ ...p, use_tls: e.target.checked, use_ssl: e.target.checked ? false : p.use_ssl }))}
                          style={{ accentColor: 'var(--primary-violet)' }}
                        />
                        TLS
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form.use_ssl}
                          onChange={e => setForm(p => ({ ...p, use_ssl: e.target.checked, use_tls: e.target.checked ? false : p.use_tls }))}
                          style={{ accentColor: 'var(--primary-violet)' }}
                        />
                        SSL
                      </label>
                    </div>
                  </div>
                </div>

                {saveStatus && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: saveStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: saveStatus === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    color: saveStatus === 'success' ? 'var(--accent-emerald)' : '#fca5a5',
                    fontSize: '0.82rem',
                  }}>
                    {saveStatus === 'success' ? <Check size={16} /> : <X size={16} />}
                    <span>{saveMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                  style={{ width: 'fit-content', padding: '10px 20px', borderRadius: '10px', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {saving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                  Save Server Configuration
                </button>
              </>
            )}
          </form>

          <form className="glass-box" onSubmit={handleTestConnection} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', margin: 0 }}>
              Verify Setup (Send Test Email)
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
              <Field
                id="test_receiver"
                label="Target Test Receiver Email"
                value={testReceiver}
                onChange={val => setTestReceiver(val)}
                placeholder="receiver@example.com"
              />

              <button
                type="submit"
                className="btn-outline"
                disabled={testing}
                style={{ height: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', justify: 'center', gap: '8px' }}
              >
                {testing ? <Loader className="spin" size={16} /> : <Send size={16} />}
                Send Test Mail
              </button>
            </div>

            {testStatus && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: testStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: testStatus === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                color: testStatus === 'success' ? 'var(--accent-emerald)' : '#fca5a5',
                fontSize: '0.82rem',
              }}>
                {testStatus === 'success' ? <Check size={16} /> : <X size={16} />}
                <span>{testMessage}</span>
              </div>
            )}
          </form>
        </>
      ) : null}

    </div>
  );
}
