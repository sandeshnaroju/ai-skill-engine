import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal, Send, Play, Copy, Check, Info, Cpu, Code2, ToggleLeft, ToggleRight, Database, X } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import ProChat from 'prochat';

export default function ApiTester() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState([]);
  const [apps, setApps] = useState([]);
  const selectedTenantId = searchParams.get('tenant') || '';
  const setSelectedTenantId = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('tenant', val);
    else nextParams.delete('tenant');
    setSearchParams(nextParams);
  };
  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];
  const selectedTenantKey = activeTenant ? activeTenant.api_key : '';

  // URL State Sync
  const model = searchParams.get('model') || '';
  const appId = searchParams.get('app_id') || '';
  const prochatModel = searchParams.get('prochat_model') || '';
  const message = searchParams.has('message') ? (searchParams.get('message') ?? '') : 'Check disk space and system uptime';
  const stream = searchParams.get('stream') !== 'false';

  const setModel = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('model', val);
    else nextParams.delete('model');
    setSearchParams(nextParams);
  };

  const setAppId = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('app_id', val);
    else nextParams.delete('app_id');
    setSearchParams(nextParams);
  };

  const setProchatModel = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('prochat_model', val);
    else nextParams.delete('prochat_model');
    setSearchParams(nextParams);
  };

  const setMessage = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('message', val);
    setSearchParams(nextParams);
  };

  const setStream = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('stream', val ? 'true' : 'false');
    setSearchParams(nextParams);
  };

  const [userDataPairs, setUserDataPairs] = useState([{ key: 'api_key', value: 'example_secret_key' }]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSkillNames, setSelectedSkillNames] = useState([]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/v1/user_data_templates?page_size=100&page=1');
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      setTemplates(items);
    } catch (e) {
      console.error('Failed to fetch User Data templates:', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    let dataObj = {};
    if (typeof tpl.data === 'string') {
      try { dataObj = JSON.parse(tpl.data); } catch (e) { dataObj = {}; }
    } else if (tpl.data && typeof tpl.data === 'object') {
      dataObj = tpl.data;
    }
    const mapped = Object.entries(dataObj).map(([key, value]) => ({ key, value: String(value) }));
    setUserDataPairs(mapped.length > 0 ? mapped : [{ key: '', value: '' }]);
  };

  const handleTemplateChange = async (tplId) => {
    setSelectedTemplateId(tplId);
    if (!tplId) {
      setUserDataPairs([{ key: '', value: '' }]);
      return;
    }
    // First try the already-fetched list
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (tpl) {
      applyTemplate(tpl);
      return;
    }
    // If not in list (e.g. search result not in initial fetch), fetch by ID directly
    try {
      const res = await fetch(`/api/v1/user_data_templates?search=&page=1&page_size=100`);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      setTemplates(items);
      const found = items.find(t => String(t.id) === String(tplId));
      if (found) applyTemplate(found);
    } catch (e) {
      console.error('Failed to fetch template by id:', e);
    }
  };

  const handleAddUserDataPair = () => {
    setUserDataPairs([...userDataPairs, { key: '', value: '' }]);
  };

  const handleRemoveUserDataPair = (index) => {
    setUserDataPairs(userDataPairs.filter((_, idx) => idx !== index));
  };

  const handleUserDataPairChange = (index, field, value) => {
    const updated = [...userDataPairs];
    updated[index][field] = value;
    setUserDataPairs(updated);
  };

  const getUserDataPayload = () => {
    const obj = {};
    userDataPairs.forEach(p => {
      if (p.key.trim()) {
        obj[p.key.trim()] = p.value;
      }
    });
    return Object.keys(obj).length > 0 ? obj : null;
  };

  // File upload state for testing
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null); // null | { name, url, sandboxPath, type }
  const [attachMode, setAttachMode] = useState('text'); // 'text' | 'image'

  // Custom tenant models list
  const [tenantModels, setTenantModels] = useState([]);

  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'request' or 'response'
  const [consoleViewMode, setConsoleViewMode] = useState('formatted'); // 'formatted' | 'raw'

  // Parsed real-time stream data
  const [streamContent, setStreamContent] = useState('');
  const [streamReasoning, setStreamReasoning] = useState([]);
  const [streamTools, setStreamTools] = useState([]);
  const [prochatUiJson, setProchatUiJson] = useState(null);
  const [prochatUiCode, setProchatUiCode] = useState('');

  // Terminal log output
  const [logs, setLogs] = useState([]);

  const logText = (text) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
  };

  const renderMarkdown = (src) => {
    if (!src) return '';
    // 1. Escape HTML
    let html = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Parse Code Blocks ```lang ... ```
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    html = html.replace(codeBlockRegex, (match, lang, code) => {
      return `<pre class="code-block"><div class="code-header">${lang || 'code'}</div><code>${code.trim()}</code></pre>`;
    });

    // 3. Parse Inline Code `code`
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    // 4. Parse Bold **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. Parse Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5.5 Parse Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary-cyan); text-decoration: underline; font-weight: 500;">$1</a>');

    // 6. Parse Headings (H1 to H6)
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');

    // 7. Parse Bullet lists
    html = html.replace(/^\s*[-*+]\s+(.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // 8. Convert newlines to breaks
    const paragraphs = html.split('\n\n').map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('<ul') || trimmed.startsWith('<li')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    });

    return paragraphs.join('\n');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    logText(`Uploading file '${file.name}' to storage...`);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      if (selectedTenantKey) {
        headers['Authorization'] = `Bearer ${selectedTenantKey.trim()}`;
      }

      const res = await fetch('/api/v1/files/upload', {
        method: 'POST',
        headers,
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setUploadedFile({
          name: file.name,
          url: data.url,
          sandboxPath: data.sandbox_path,
          type: file.type
        });
        logText(`File uploaded successfully! URL: ${data.url}`);
      } else {
        const errText = await res.text();
        logText(`Upload failed: ${errText}`);
      }
    } catch (err) {
      logText(`Upload exception: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const loadMetaData = async () => {
    try {
      const [tenantsRes, appsRes] = await Promise.all([
        fetch('/api/v1/tenants'),
        fetch('/api/v1/apps')
      ]);
      const tenantsData = await tenantsRes.json();
      const appsData = await appsRes.json();

      const appsList = appsData?.items || appsData || [];
      setTenants(tenantsData || []);
      setApps(appsList);

      // Auto-select first tenant if none selected
      let tenantIdToUse = selectedTenantId;
      if (tenantsData && tenantsData.length > 0 && !selectedTenantId) {
        tenantIdToUse = tenantsData[0].id;
        setSelectedTenantId(tenantIdToUse);
      }

      // Resolve key from selected/default tenant and load its models
      const activeT = tenantsData.find(t => t.id === tenantIdToUse) || tenantsData[0];
      const keyToUse = activeT ? activeT.api_key : '';
      if (keyToUse) {
        fetchTenantModels(keyToUse);
      }

      // Auto-select first app if none is in URL
      if (appsList.length > 0 && !appId) {
        setAppId(appsList[0].id);
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
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTenantModels(data || []);
        const nonProchat = (data || []).filter(
          m => m.provider !== 'prochat' && !m.model_name.toLowerCase().includes('genui')
        );
        // Only auto-select first model if no model is set or URL model doesn't exist in list
        const urlModelExists = model && nonProchat.some(m => m.model_name === model);
        if (!urlModelExists) {
          if (nonProchat.length > 0) {
            setModel(nonProchat[0].model_name);
          } else {
            setModel('');
          }
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
    setStreamContent('');
    setStreamReasoning([]);
    setStreamTools([]);
    setProchatUiJson(null);
    setProchatUiCode('');

    const startTime = Date.now();

    logText(`Preparing API request to POST /api/v1/chat/completions`);
    setLoading(true);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${selectedTenantKey.trim()}`,
      'X-Request-Source': 'api'
    };

    let requestMessageContent = message;
    if (uploadedFile) {
      if (attachMode === 'text') {
        requestMessageContent = `[Attached File: ${uploadedFile.name} (URL: ${uploadedFile.url})]\n\n${message}`;
      } else if (attachMode === 'image') {
        requestMessageContent = [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: uploadedFile.url } }
        ];
      }
    }

    const payload = {
      messages: [{ role: 'user', content: requestMessageContent }],
      model: model.trim(),
      stream: stream
    };

    if (appId) {
      payload.app_id = appId;
    }

    if (prochatModel.trim()) {
      payload.prochat_model = prochatModel.trim();
    }

    const userDataPayload = getUserDataPayload();
    if (userDataPayload) {
      payload.user_data = userDataPayload;
    }
    if (selectedSkillNames.length > 0) {
      payload.skill_names = selectedSkillNames;
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

                if (rawData !== '[DONE]') {
                  try {
                    const dataJson = JSON.parse(rawData);
                    if (dataJson.choices && dataJson.choices[0] && dataJson.choices[0].delta) {
                      const delta = dataJson.choices[0].delta;
                      if (delta.reasoning) {
                        setStreamReasoning(prev => [...prev, delta.reasoning]);
                      }
                      if (delta.tool_call) {
                        setStreamTools(prev => [...prev, { type: 'call', ...delta.tool_call }]);
                      }
                      if (delta.tool_result) {
                        setStreamTools(prev => [...prev, { type: 'result', ...delta.tool_result }]);
                      }
                      if (delta.content) {
                        setStreamContent(prev => prev + delta.content);
                      }
                      if (delta.json) {
                        if (typeof delta.json === 'string') {
                          try {
                            setProchatUiJson(JSON.parse(delta.json));
                          } catch (e) {
                            setProchatUiJson(delta.json);
                          }
                        } else {
                          setProchatUiJson(delta.json);
                        }
                      }
                      if (delta.code) {
                        setProchatUiCode(prev => prev + delta.code);
                      }
                    }
                  } catch (e) { }
                }
              }
            }
          }
        }
        const rest = decoder.decode();
        if (rest.trim()) {
          logText(`data: ${rest.trim()}`);
        }
        logText(`Stream finished. Duration: ${Date.now() - startTime}ms`);
      } else {
        const data = await res.json();
        logText(`Response JSON:\n${JSON.stringify(data, null, 2)}`);

        const assistantMessage = data.choices?.[0]?.message;
        if (assistantMessage) {
          setStreamContent(assistantMessage.content || '');
          if (assistantMessage.json) {
            setProchatUiJson(assistantMessage.json);
          }
          if (assistantMessage.code) {
            setProchatUiCode(assistantMessage.code);
          }
        }
        if (data.reasoning) {
          setStreamReasoning([data.reasoning]);
        }
        if (data.executed_tools) {
          setStreamTools(data.executed_tools.map(t => ({ type: 'result', ...t })));
        }
        logText(`Request finished. Duration: ${Date.now() - startTime}ms`);
      }

    } catch (err) {
      logText(`Network Exception: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Build current cURL command representation
  let curlContent = message;
  if (uploadedFile) {
    if (attachMode === 'text') {
      curlContent = `[Attached File: ${uploadedFile.name} (URL: ${uploadedFile.url})]\n\n${message}`;
    } else if (attachMode === 'image') {
      curlContent = [
        { type: 'text', text: message },
        { type: 'image_url', image_url: { url: uploadedFile.url } }
      ];
    }
  }

  const userDataPayloadForCurl = getUserDataPayload();

  const requestPayload = {
    messages: [{ role: 'user', content: curlContent }],
    model: model,
    stream: stream,
    ...(appId && { app_id: appId }),
    ...(prochatModel.trim() && { prochat_model: prochatModel.trim() }),
    ...(userDataPayloadForCurl && { user_data: userDataPayloadForCurl }),
    ...(selectedSkillNames.length > 0 && { skill_names: selectedSkillNames })
  };

  const curlCommand = `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-Request-Source: api" \\
  -H "Authorization: Bearer ${selectedTenantKey || 'YOUR_API_KEY'}" \\
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
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Attachment Mode</label>
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
          {activeTab === 'response' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setConsoleViewMode('formatted')}
                    className={consoleViewMode === 'formatted' ? 'btn-gradient' : 'btn-outline'}
                    style={{ padding: '4px 10px', fontSize: '0.74rem', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Formatted View
                  </button>
                  <button
                    onClick={() => setConsoleViewMode('raw')}
                    className={consoleViewMode === 'raw' ? 'btn-gradient' : 'btn-outline'}
                    style={{ padding: '4px 10px', fontSize: '0.74rem', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Raw SSE Stream
                  </button>
                </div>
                <button
                  className="btn-outline"
                  onClick={() => {
                    setLogs([]);
                    setStreamContent('');
                    setStreamReasoning([]);
                    setStreamTools([]);
                  }}
                  style={{ padding: '4px 10px', fontSize: '0.74rem', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Clear Console
                </button>
              </div>

              {consoleViewMode === 'raw' ? (
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
              ) : (
                <div
                  style={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px',
                    flex: 1,
                    minHeight: '380px',
                    maxHeight: '480px',
                    overflowY: 'auto',
                    fontSize: '0.84rem',
                    color: 'var(--text-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: 'var(--shadow-card)'
                  }}
                >
                  {/* Reasoning thoughts & tool calls */}
                  {(streamReasoning.length > 0 || streamTools.length > 0) && (
                    <div style={{ background: 'rgba(139, 92, 246, 0.04)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--primary-violet)', letterSpacing: '0.05em', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', paddingBottom: '4px', marginBottom: '4px' }}>
                        ENGINE TRACES & REASONING
                      </div>
                      {streamReasoning.map((thought, idx) => (
                        <div key={`thought-${idx}`} style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontStyle: 'italic', marginBottom: '4px' }}>
                          💭 {typeof thought === 'object' ? JSON.stringify(thought) : String(thought)}
                        </div>
                      ))}
                      {streamTools.map((tool, idx) => {
                        if (tool.type === 'call') {
                          const renderArgs = typeof tool.arguments === 'object'
                            ? JSON.stringify(tool.arguments, null, 2)
                            : String(tool.arguments || '');
                          return (
                            <div key={`call-${idx}`} style={{ fontSize: '0.78rem', color: 'var(--primary-emerald)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                              🛠️ Calling Tool: <strong>{tool.name || 'unknown'}</strong>
                              {renderArgs && renderArgs !== '{}' && (
                                <pre style={{ margin: '4px 0 0 0', padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-sub)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                  {renderArgs}
                                </pre>
                              )}
                            </div>
                          );
                        }
                        if (tool.type === 'result') {
                          const toolName = tool.tool_name || tool.toolName || tool.title || 'unknown';
                          const outputVal = tool.stdout || tool.output || '';
                          const renderOutput = typeof outputVal === 'object'
                            ? JSON.stringify(outputVal, null, 2)
                            : String(outputVal || 'No output.');
                          return (
                            <div key={`result-${idx}`} style={{ fontSize: '0.78rem', color: 'var(--primary-amber)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                              ⚡ Tool <strong>{toolName}</strong> Finished ({tool.execution_time_ms || tool.executionTimeMs || 0}ms, Exit: {tool.exit_code ?? 0}) Output:
                              <pre style={{ margin: '4px 0 0 0', padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-sub)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', overflowY: 'auto' }}>
                                {renderOutput}
                              </pre>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}

                  {/* Final text response content */}
                  <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--primary-cyan)', letterSpacing: '0.05em', borderBottom: '1px solid rgba(6, 182, 212, 0.15)', paddingBottom: '4px', marginBottom: '8px' }}>
                      FINAL RESPONSE CONTENT
                    </div>
                    {streamContent ? (
                      <div className="markdown-body" style={{ lineHeight: '1.6', fontSize: '0.9rem', color: 'var(--text-main)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamContent) }} />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {loading ? 'Assistant is typing...' : 'Console idle. Run request to see output.'}
                      </span>
                    )}
                  </div>

                  {(prochatUiJson || prochatUiCode) && (
                    <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', width: '100%', boxSizing: 'border-box' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--primary-violet)', letterSpacing: '0.05em', borderBottom: '1px solid rgba(139, 92, 246, 0.15)', paddingBottom: '4px', marginBottom: '8px' }}>
                        GENERATED PROCHAT UI
                      </div>
                      <ProChat
                        id="prochat-api-tester"
                        json={(() => {
                          if (typeof prochatUiJson === 'string') {
                            return prochatUiJson;
                          }
                          if (prochatUiJson && typeof prochatUiJson === 'object') {
                            return JSON.stringify(prochatUiJson);
                          }
                          return null;
                        })()}
                        width={"100%"}
                        debug={true}
                      />
                    </div>
                  )}
                </div>
              )}
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
