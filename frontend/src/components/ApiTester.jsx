import React, { useState, useEffect } from 'react';
import { Terminal, Send, Play, Copy, Check, Info, Cpu, Code2, ToggleLeft, ToggleRight, Database } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';

export default function ApiTester() {
  const [tenants, setTenants] = useState([]);
  const [apps, setApps] = useState([]);
  const [selectedTenantKey, setSelectedTenantKey] = useState('');
  const [model, setModel] = useState('');
  const [appId, setAppId] = useState('');
  const [message, setMessage] = useState('Check disk space and system uptime');
  const [stream, setStream] = useState(true);
  
  // Custom tenant models list
  const [tenantModels, setTenantModels] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'request' or 'response'
  
  // Terminal log output
  const [logs, setLogs] = useState([]);

  const loadMetaData = async () => {
    try {
      const [tenantsRes, appsRes] = await Promise.all([
        fetch('/api/v1/tenants'),
        fetch('/api/v1/apps')
      ]);
      const tenantsData = await tenantsRes.json();
      const appsData = await appsRes.json();
      
      setTenants(tenantsData || []);
      setApps(appsData || []);
      
      if (tenantsData && tenantsData.length > 0) {
        setSelectedTenantKey(tenantsData[0].api_key);
      }
    } catch (e) {
      console.error('Failed to load metadata:', e);
    }
  };

  useEffect(() => {
    loadMetaData();
  }, []);

  const fetchTenantModels = async (key) => {
    if (!key) return;
    try {
      const res = await fetch('/api/v1/tenant/llms', {
        headers: { 'X-API-Key': key }
      });
      if (res.ok) {
        const data = await res.json();
        setTenantModels(data || []);
        if (data && data.length > 0) {
          setModel(data[0].model_name);
        } else {
          setModel('');
        }
      }
    } catch (e) {
      console.error('Failed to fetch tenant models:', e);
    }
  };

  useEffect(() => {
    if (selectedTenantKey) {
      fetchTenantModels(selectedTenantKey);
    }
  }, [selectedTenantKey]);

  const handleSend = async () => {
    if (loading) return;
    setLoading(false);
    setLogs([]);
    
    const startTime = Date.now();
    const logText = (text) => {
      setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
    };
    
    logText(`Preparing API request to POST /api/v1/chat/completions`);
    setLoading(true);

    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': selectedTenantKey.trim(),
      'X-Request-Source': 'api'
    };

    const payload = {
      messages: [{ role: 'user', content: message }],
      model: model.trim(),
      stream: stream
    };

    if (appId) {
      payload.app_id = appId;
    }

    try {
      logText(`Sending HTTP request...`);
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        logText(`HTTP Error: status ${res.status} - ${errorText}`);
        setLoading(false);
        return;
      }

      if (stream) {
        logText(`Connection established. Listening to SSE Event Stream...`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const evtBlock of events) {
            if (!evtBlock.trim()) continue;
            const lines = evtBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const rawData = line.replace('data: ', '').trim();
                logText(`data: ${rawData}`);
              }
            }
          }
        }
        // Flush remaining decoder buffer
        const rest = decoder.decode();
        if (rest.trim()) {
          logText(`data: ${rest.trim()}`);
        }
        logText(`Stream finished. Duration: ${Date.now() - startTime}ms`);
      } else {
        const data = await res.json();
        logText(`Response JSON:\n${JSON.stringify(data, null, 2)}`);
        logText(`Request finished. Duration: ${Date.now() - startTime}ms`);
      }

    } catch (err) {
      logText(`Network Exception: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Build current cURL command representation
  const requestPayload = {
    messages: [{ role: 'user', content: message }],
    model: model,
    stream: stream,
    ...(appId && { app_id: appId })
  };

  const curlCommand = `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-Request-Source: api" \\
  -H "X-API-Key: ${selectedTenantKey || 'YOUR_API_KEY'}" \\
  -d '${JSON.stringify(requestPayload, null, 2)}'`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Banner */}
      <div className="glass-box" style={{ padding: '20px 24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Terminal size={22} color="var(--primary-cyan)" /> Developer API Client Tester
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '4px' }}>
          Directly execute raw HTTP requests against the `/api/v1/chat/completions` gateway endpoint to audit SSE events and payload schemas.
        </p>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '24px' }}>
        
        {/* Column 1: Config Form */}
        <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.02rem', fontWeight: '600', color: 'var(--text-main)' }}>
            Request Configuration
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Auth Tenant Key</label>
            <div style={{ width: '220px' }}>
              <AsyncSearchableDropdown
                value={selectedTenantKey}
                onChange={(val) => setSelectedTenantKey(val)}
                initialLabel={tenants.find(t => t.api_key === selectedTenantKey)?.name ? `${tenants.find(t => t.api_key === selectedTenantKey).name} (${selectedTenantKey.substring(0, 10)}...)` : ''}
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
                    value: t.api_key,
                    label: `${t.name} (${t.api_key.substring(0, 10)}...)`
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
                    const res = await fetch(url, { headers: { 'X-API-Key': selectedTenantKey }});
                    const data = await res.json();
                    return (data.items || []).map(m => ({
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
                  fetchOptions={async (searchTerm) => {
                    const url = `/api/v1/apps?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                    const res = await fetch(url);
                    const data = await res.json();
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Prompt / Query</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your testing prompt here..."
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '10px',
                color: 'var(--text-main)',
                resize: 'vertical',
                fontSize: '0.88rem'
              }}
            />
          </div>

          <button
            className="btn-gradient"
            onClick={handleSend}
            disabled={loading || !selectedTenantKey}
            style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Play size={16} /> {loading ? 'Executing request...' : 'Execute Request'}
          </button>
        </div>

        {/* Column 2: Request & Response Tabs */}
        <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Tabs header */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: '16px', paddingBottom: '4px' }}>
            <button
              onClick={() => setActiveTab('response')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'response' ? '2px solid var(--primary-cyan)' : '2px solid transparent',
                color: activeTab === 'response' ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: '600',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Response Console
            </button>
            <button
              onClick={() => setActiveTab('request')}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'request' ? '2px solid var(--primary-cyan)' : '2px solid transparent',
                color: activeTab === 'request' ? 'var(--text-main)' : 'var(--text-muted)',
                fontWeight: '600',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Request cURL / Body
            </button>
          </div>

          {/* Response Console Display */}
          {activeTab === 'response' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                  RAW TERMINAL STREAM OUTPUT
                </span>
                <button
                  className="btn-outline"
                  onClick={() => setLogs([])}
                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                >
                  Clear Console
                </button>
              </div>

              <div
                style={{
                  background: '#04070e',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '16px',
                  flex: 1,
                  minHeight: '380px',
                  maxHeight: '480px',
                  overflowY: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.76rem',
                  color: '#34d399',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.5',
                  boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.9)'
                }}
              >
                {logs.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Terminal idle. Set your configs and click "Execute Request" to stream logs.
                  </span>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)', paddingBottom: '4px', marginBottom: '4px' }}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Request cURL/Body tab */}
          {activeTab === 'request' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                  EQUIVALENT CURL COMMAND
                </span>
                <button
                  className="btn-outline"
                  onClick={() => {
                    navigator.clipboard.writeText(curlCommand);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 1500);
                  }}
                  style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {copiedKey ? <Check size={12} color="var(--accent-emerald)" /> : 'Copy cURL'}
                </button>
              </div>

              <pre className="code-display" style={{ minHeight: '350px', maxHeight: '460px', overflowY: 'auto', fontSize: '0.78rem' }}>
                {curlCommand}
              </pre>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
