import React, { useState, useEffect } from 'react';
import { Send, Bot, User, Terminal, Sparkles, Trash2, Check, Copy, Activity, Code2, Globe, Plus, MessageSquare, Brain, ChevronDown, ChevronUp, Cpu, ShieldCheck, Box, Key, Download, X, History, FileText, Sparkle, Sliders } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';

export default function ChatPlayground() {
  const [sessions, setSessions] = useState([
    { id: 'session_demo', name: 'Developer & Math Session', lastTime: 'Just now' },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('session_demo');

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Welcome to `AI Skill Engine` Enterprise Simulator! Select an App scope or API key, then ask any question requiring system diagnostics, sandboxed Python code execution, or MCP tool calls.',
      timestamp: new Date().toLocaleTimeString(),
      reasoning: 'Gateway initialized with active skills & MCP drivers.',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveThought, setLiveThought] = useState('');
  const [executedTools, setExecutedTools] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  
  // Custom tenant models list
  const [tenantModels, setTenantModels] = useState([]);

  const [apps, setApps] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [expandedReasoning, setExpandedReasoning] = useState({});

  // Collapsible configuration sidebar state
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  // Modal Popups State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [previewSessionId, setPreviewSessionId] = useState(null);
  const [previewMessages, setPreviewMessages] = useState([]);

  // Sessions Pagination
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsTotalPages, setSessionsTotalPages] = useState(1);
  const [sessionsTotalItems, setSessionsTotalItems] = useState(0);

  // Messages Pagination
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotalPages, setPreviewTotalPages] = useState(1);
  const [previewTotalItems, setPreviewTotalItems] = useState(0);

  const presets = [
    {
      label: 'Python Math Sandbox',
      icon: Code2,
      text: 'Calculate compound interest for 50,000 RS at 10.5% interest for 15 years in Python sandbox.',
    },
    {
      label: 'Server Uptime & Disk',
      icon: Activity,
      text: 'Check server uptime and disk space using system_diagnostics.',
    },
    {
      label: 'GitHub REST API',
      icon: Globe,
      text: 'Fetch a design philosophy quote using the sample_api skill.',
    },
  ];

  const fetchSessionsList = async (activeKey) => {
    try {
      const headers = {};
      const keyToUse = activeKey || apiKey;
      if (keyToUse) headers['X-API-Key'] = keyToUse;
      const queryParams = new URLSearchParams({
        page: sessionsPage.toString(),
        page_size: '6'
      });
      const res = await fetch(`/api/v1/sessions?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.items !== undefined) {
          const mapped = data.items.map((s) => ({
            id: s.id,
            name: s.title || `Session ${s.id}`,
            lastTime: s.created_at ? new Date(s.created_at).toLocaleTimeString() : 'Recent',
          }));
          setSessions(mapped);
          setSessionsTotalPages(data.pages || 1);
          setSessionsTotalItems(data.total || 0);
        } else {
          const mapped = data.map((s) => ({
            id: s.id,
            name: s.title || `Session ${s.id}`,
            lastTime: 'Recent',
          }));
          setSessions(mapped);
          setSessionsTotalPages(1);
          setSessionsTotalItems(data.length);
        }
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  };

  const fetchSessionMessages = async (sessionId, activeKey) => {
    try {
      const headers = {};
      const keyToUse = activeKey || apiKey;
      if (keyToUse) headers['X-API-Key'] = keyToUse;

      const res = await fetch(`/api/v1/sessions/${sessionId}/messages`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const loadedMsgs = data.map((m) => ({
            role: m.role,
            content: m.content || '',
            timestamp: m.timestamp || new Date().toLocaleTimeString(),
          }));
          setMessages(loadedMsgs);
        } else {
          setMessages([
            {
              role: 'assistant',
              content: `Switched to chat session (${sessionId}). How can I assist you?`,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch session messages:', e);
    }
  };

  const loadMetaData = async () => {
    try {
      const [appsRes, tenantsRes] = await Promise.all([
        fetch('/api/v1/apps'),
        fetch('/api/v1/tenants'),
      ]);
      const appsData = await appsRes.json();
      const tenantsData = await tenantsRes.json();

      setApps(appsData || []);
      setTenants(tenantsData || []);

      let keyToUse = apiKey;
      if (tenantsData.length > 0 && !apiKey) {
        keyToUse = tenantsData[0].api_key;
        setApiKey(keyToUse);
      }

      fetchSessionsList(keyToUse);
    } catch (e) {
      console.error('Failed to load playground metadata:', e);
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
          setSelectedModel(data[0].model_name);
        } else {
          setSelectedModel('');
        }
      }
    } catch (e) {
      console.error('Failed to fetch playground models:', e);
    }
  };

  useEffect(() => {
    if (apiKey) {
      fetchTenantModels(apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey) {
      fetchSessionsList(apiKey);
    }
  }, [sessionsPage, apiKey]);

  const fetchPreviewMessages = async (sessionId, activeKey) => {
    try {
      const headers = {};
      const keyToUse = activeKey || apiKey;
      if (keyToUse) headers['X-API-Key'] = keyToUse;
      const queryParams = new URLSearchParams({
        page: previewPage.toString(),
        page_size: '10'
      });
      const res = await fetch(`/api/v1/sessions/${sessionId}/messages?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.items !== undefined) {
          const loadedMsgs = data.items.map((m) => ({
            role: m.role,
            content: m.content || '',
            timestamp: m.timestamp || new Date().toLocaleTimeString(),
          }));
          setPreviewMessages(loadedMsgs);
          setPreviewTotalPages(data.pages || 1);
          setPreviewTotalItems(data.total || 0);
        } else {
          const loadedMsgs = data.map((m) => ({
            role: m.role,
            content: m.content || '',
            timestamp: m.timestamp || new Date().toLocaleTimeString(),
          }));
          setPreviewMessages(loadedMsgs);
          setPreviewTotalPages(1);
          setPreviewTotalItems(data.length);
        }
      }
    } catch (e) {
      console.error('Failed to fetch preview messages:', e);
    }
  };

  useEffect(() => {
    if (previewSessionId) {
      fetchPreviewMessages(previewSessionId, apiKey);
    }
  }, [previewPage, previewSessionId]);

  const handleSelectSession = (sessionId) => {
    setPreviewPage(1);
    setPreviewSessionId(sessionId);
    fetchPreviewMessages(sessionId, apiKey);
  };

  const handleContinueChat = () => {
    if (previewSessionId) {
      setActiveSessionId(previewSessionId);
      setMessages(previewMessages);
      setShowHistoryModal(false);
    }
  };

  const handleNewSession = () => {
    const newId = `session_${Date.now().toString().slice(-4)}`;
    const newName = `New Chat Session #${sessions.length + 1}`;
    setSessions([{ id: newId, name: newName, lastTime: 'Just now' }, ...sessions]);
    setActiveSessionId(newId);
    setMessages([
      {
        role: 'assistant',
        content: `New session initialized (${newId}). Ask a query to trigger sandboxed skills and tools!`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    setExecutedTools([]);
    setShowHistoryModal(false);
  };

  // LLM Thread Title Generator
  const generateLLMThreadTitle = async (queryText) => {
    try {
      const headers = { 
        'Content-Type': 'application/json',
        'X-Request-Source': 'dashboard'
      };
      if (apiKey.trim()) headers['X-API-Key'] = apiKey.trim();

      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Generate a concise, 3-5 word title summarizing a chat starting with user query: "${queryText}". Return ONLY the title string, no quotes or markdown.`,
            },
          ],
          model: selectedModel,
          stream: false,
        }),
      });

      const data = await res.json();
      const generatedTitle = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content.trim() : null;

      if (generatedTitle) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId ? { ...s, name: generatedTitle.replace(/^["']|["']$/g, '') } : s
          )
        );
      }
    } catch (e) {
      console.error('Failed to generate LLM thread title:', e);
    }
  };

  const handleSend = async (textToSend = null) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const currentSessionObj = sessions.find((s) => s.id === activeSessionId);
    if (currentSessionObj && (currentSessionObj.name.startsWith('New Chat Session') || currentSessionObj.name === 'Developer & Math Session')) {
      generateLLMThreadTitle(query);
    }

    const userTime = new Date().toLocaleTimeString();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: query, timestamp: userTime },
    ]);
    if (!textToSend) setInput('');
    setLoading(true);
    setLiveThought('Connecting to Skill Gateway...');

    try {
      const headers = { 
        'Content-Type': 'application/json',
        'X-Request-Source': 'dashboard'
      };
      if (apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }

      const payload = {
        messages: [{ role: 'user', content: query }],
        session_id: activeSessionId,
        model: selectedModel,
        stream: true,
      };
      if (selectedAppId) {
        payload.app_id = selectedAppId;
      }

      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let reasoningTraces = [];
      let finalContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evtBlock of events) {
          if (!evtBlock.trim()) continue;
          const lines = evtBlock.split('\n');
          let dataJson = null;

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.replace('data: ', '').trim();
              if (rawData === '[DONE]') continue;
              try {
                dataJson = JSON.parse(rawData);
              } catch (e) {}
            }
          }

          if (dataJson && dataJson.choices && dataJson.choices[0] && dataJson.choices[0].delta) {
            const delta = dataJson.choices[0].delta;
            if (delta.reasoning) {
              setLiveThought(delta.reasoning);
              reasoningTraces.push(`💭 ${delta.reasoning}`);
            }
            if (delta.tool_call) {
              setLiveThought(`Invoking tool ${delta.tool_call.name}...`);
              reasoningTraces.push(`🛠️ Invoking Tool: ${delta.tool_call.name}\nArgs: ${JSON.stringify(delta.tool_call.arguments)}`);
            }
            if (delta.tool_result) {
              setLiveThought(`Tool ${delta.tool_result.tool_name} finished in ${delta.tool_result.execution_time_ms}ms.`);
              reasoningTraces.push(`⚡ Executed in ${delta.tool_result.sandbox_type} sandbox (${delta.tool_result.execution_time_ms}ms, Exit: ${delta.tool_result.exit_code})\nOutput: ${(delta.tool_result.stdout || delta.tool_result.stderr || '').trim()}`);
              setExecutedTools((prev) => [...prev, delta.tool_result]);
            }
            if (delta.content) {
              finalContent += delta.content;
            }
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: finalContent || 'No response content emitted.',
          timestamp: new Date().toLocaleTimeString(),
          reasoning: reasoningTraces.join('\n\n'),
        },
      ]);

      // Refresh sessions list after message finishes
      fetchSessionsList(apiKey);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error connecting to gateway: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
      setLiveThought('');
    }
  };

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const toggleReasoning = (idx) => {
    setExpandedReasoning((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const exportTranscript = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(messages, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `chat_transcript_${activeSessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 105px)', width: '100%' }}>
      {/* Main Full-Width Simulator Console */}
      <div className="glass-box" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
        {/* Simulator Control Header Bar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '7px', borderRadius: '9px' }}>
              <Bot size={20} color="var(--primary-violet)" />
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.96rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeSessionObj ? activeSessionObj.name : 'Chatbot Simulator'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Session ID: {activeSessionId}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* New Chat Primary Button */}
            <button
              className="btn-gradient"
              onClick={handleNewSession}
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            >
              <Plus size={15} /> New Chat
            </button>

            {/* Toggle Settings Panel */}
            <button
              className="btn-outline"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              style={{ padding: '6px 12px', fontSize: '0.82rem', borderColor: isSettingsOpen ? 'var(--primary-violet)' : 'var(--border-subtle)', background: isSettingsOpen ? 'rgba(139, 92, 246, 0.08)' : 'transparent' }}
            >
              <Sliders size={15} color="var(--primary-violet)" />
              {isSettingsOpen ? ' Hide Config' : ' Config'}
            </button>
          </div>
        </div>

        {/* Outer Split Container */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
          
          {/* LEFT SECTION: Message Area (Takes up remaining flex space) */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
            
            {/* Quick Presets Bar */}
            <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-input)', display: 'flex', gap: '8px', overflowX: 'auto', flexShrink: 0 }}>
              {presets.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <button
                    key={idx}
                    className="btn-outline"
                    onClick={() => handleSend(p.text)}
                    disabled={loading}
                    style={{ padding: '4px 10px', fontSize: '0.76rem', borderRadius: '16px' }}
                  >
                    <Icon size={12} color="var(--primary-violet)" /> {p.label}
                  </button>
                );
              })}
            </div>

            {/* Message Stream Viewport */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {messages.map((m, idx) => {
                const isUser = m.role === 'user';
                const hasReasoning = Boolean(m.reasoning);
                const isExpanded = expandedReasoning[idx];

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    }}
                  >
                    {!isUser && (
                      <div style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '8px', borderRadius: '10px', height: 'fit-content' }}>
                        <Bot size={16} color="var(--primary-violet)" />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                      <div
                        style={{
                          background: isUser ? 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))' : 'var(--bg-input)',
                          color: isUser ? '#ffffff' : 'var(--text-main)',
                          border: isUser ? 'none' : '1px solid var(--border-subtle)',
                          padding: '12px 16px',
                          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          boxShadow: 'var(--shadow-card)',
                          fontSize: '0.9rem',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {m.content}
                      </div>

                      {/* Reasoning & Execution Traces Accordion */}
                      {hasReasoning && (
                        <div style={{ background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                          <button
                            onClick={() => toggleReasoning(idx)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--primary-violet)',
                              fontWeight: '600',
                              fontSize: '0.78rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Brain size={14} /> Skill Engine Reasoning & Tool Traces
                            </span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {isExpanded && (
                            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(139, 92, 246, 0.15)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-sub)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                              {m.reasoning}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'space-between', alignItems: 'center', padding: '0 4px' }}>
                        {!isUser && (
                          <button
                            onClick={() => copyText(m.content, idx)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem' }}
                          >
                            {copiedIdx === idx ? <Check size={12} color="var(--primary-emerald)" /> : <Copy size={12} />}
                            {copiedIdx === idx ? 'Copied' : 'Copy'}
                          </button>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.timestamp}</span>
                      </div>
                    </div>

                    {isUser && (
                      <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '8px', borderRadius: '10px', height: 'fit-content' }}>
                        <User size={16} color="var(--primary-emerald)" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Live Thought Stream Box */}
              {loading && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid var(--border-glow)', padding: '12px 16px', borderRadius: '12px' }}>
                  <Sparkles size={18} color="var(--primary-violet)" className="spin" />
                  <div style={{ fontSize: '0.85rem', color: 'var(--primary-violet)', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
                    {liveThought || 'Model thinking & executing tools...'}
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', flexShrink: 0 }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{ display: 'flex', gap: '10px' }}
              >
                <input
                  type="text"
                  placeholder={tenantModels.length === 0 ? "Please configure a model for this tenant first..." : "Ask a question (e.g. calculate compound interest in Python or check uptime)..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading || !selectedModel}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-gradient" disabled={loading || !input.trim() || !selectedModel}>
                  <Send size={16} /> Send
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT SECTION: Collapsible Settings Panel */}
          {isSettingsOpen && (
            <div style={{
              width: '280px',
              borderLeft: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              gap: '20px',
              overflowY: 'auto',
              flexShrink: 0
            }}>
              {/* Section 1: Tenant Key */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Tenant Access Key
                </label>
                <AsyncSearchableDropdown
                  value={apiKey}
                  onChange={(val) => {
                    setApiKey(val);
                    fetchSessionsList(val);
                    fetchTenantModels(val);
                  }}
                  initialLabel={tenants.find(t => t.api_key === apiKey)?.name ? `🔑 ${tenants.find(t => t.api_key === apiKey).name}` : ''}
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
                      label: `🔑 ${t.name}`
                    }));
                  }}
                  placeholder="Select Tenant"
                />
              </div>

              {/* Section 2: LLM Model */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Execution Model
                </label>
                <AsyncSearchableDropdown
                  value={selectedModel}
                  onChange={(val) => setSelectedModel(val)}
                  fetchOptions={async (searchTerm) => {
                    if (!apiKey) return [];
                    const url = `/api/v1/tenant/llms?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
                    const res = await fetch(url, { headers: { 'X-API-Key': apiKey }});
                    const data = await res.json();
                    return (data.items || []).map(m => ({
                      value: m.model_name,
                      label: `${m.model_name} (${m.provider})`
                    }));
                  }}
                  placeholder={tenantModels.length === 0 ? "No models" : "Select Model"}
                  disabled={!apiKey}
                />
              </div>

              {/* Section 3: App Group Scope */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Application Scope
                </label>
                <AsyncSearchableDropdown
                  value={selectedAppId}
                  onChange={(val) => setSelectedAppId(val)}
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
                      { value: "", label: "🌐 Global (All Skills)" },
                      ...(data.items || []).map(a => ({
                        value: a.id,
                        label: `📦 ${a.name} (${a.skills_count} skills)`
                      }))
                    ];
                  }}
                  placeholder="🌐 Global (All Skills)"
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', my: '10px' }} />

              {/* Section 4: Utility Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px', letterSpacing: '0.5px' }}>
                  Session Utilities
                </label>
                
                <button
                  className="btn-outline"
                  onClick={() => {
                    setPreviewSessionId(activeSessionId);
                    setPreviewMessages(messages);
                    setShowHistoryModal(true);
                  }}
                  style={{ justifyContent: 'center', width: '100%', borderColor: 'var(--border-glow)' }}
                >
                  <History size={15} color="var(--primary-violet)" /> Chat History ({sessions.length})
                </button>

                <button
                  className="btn-outline"
                  onClick={() => setShowAuditModal(true)}
                  style={{ justifyContent: 'center', width: '100%', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                >
                  <Terminal size={15} color="var(--primary-emerald)" /> Audit Traces ({executedTools.length})
                </button>

                <button 
                  className="btn-outline" 
                  onClick={exportTranscript} 
                  style={{ justifyContent: 'center', width: '100%' }}
                >
                  <Download size={14} /> Export Transcript
                </button>

                <button 
                  className="btn-outline" 
                  onClick={() => setMessages([])} 
                  style={{ justifyContent: 'center', width: '100%', color: 'var(--accent-rose)' }}
                >
                  <Trash2 size={14} /> Clear Console
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* POPUP 1: ENLARGED CHAT SESSIONS & HISTORY MODAL (maxWidth: 850px)  */}
      {/* ---------------------------------------------------------------- */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '850px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={22} color="var(--primary-violet)" /> Chat History & AI Thread Manager
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="btn-outline" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '18px', flex: 1, overflow: 'hidden' }}>
              {/* Left Column: Sessions List with AI Thread Titles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', borderRight: '1px solid var(--border-subtle)', paddingRight: '14px', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                    AI-Titled Chat Threads ({sessionsTotalItems})
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sessions.map((s) => {
                      const isActive = s.id === previewSessionId;
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s.id)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            background: isActive ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-input)',
                            border: isActive ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ fontWeight: '700', fontSize: '0.88rem', color: isActive ? 'var(--primary-violet)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Sparkle size={14} color="var(--primary-violet)" /> {s.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>ID: {s.id.substring(0, 8)}...</span>
                            <span>{s.lastTime}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Sessions Pagination buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Page {sessionsPage} of {sessionsTotalPages}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" className="btn-outline" onClick={() => setSessionsPage(p => Math.max(1, p - 1))} disabled={sessionsPage <= 1} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                      Prev
                    </button>
                    <button type="button" className="btn-outline" onClick={() => setSessionsPage(p => Math.min(sessionsTotalPages, p + 1))} disabled={sessionsPage >= sessionsTotalPages} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                      Next
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Active Session Transcript Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'hidden', gap: '12px', paddingRight: '6px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--primary-violet)', fontWeight: '700' }}>
                      Preview Thread: "{sessions.find(s => s.id === previewSessionId)?.name || previewSessionId || 'Select thread'}"
                    </div>
                    <button onClick={handleContinueChat} className="btn-gradient" style={{ padding: '6px 12px', fontSize: '0.82rem' }} disabled={!previewSessionId}>
                      Continue Chat <Check size={14} />
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                    {previewMessages.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '32px' }}>
                        Select a chat thread from the left to view message history.
                      </div>
                    ) : (
                      previewMessages.map((m, idx) => (
                        <div key={idx} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '12px', borderRadius: '10px' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.78rem', color: m.role === 'user' ? 'var(--primary-emerald)' : 'var(--primary-violet)', marginBottom: '4px', textTransform: 'uppercase' }}>
                            {m.role === 'user' ? 'User' : 'Skill Gateway AI'} - {m.timestamp}
                          </div>
                          <div style={{ fontSize: '0.86rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                            {m.content}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Messages history pagination */}
                {previewSessionId && previewMessages.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Page {previewPage} of {previewTotalPages} ({previewTotalItems} messages total)
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" className="btn-outline" onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage <= 1} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                        Older
                      </button>
                      <button type="button" className="btn-outline" onClick={() => setPreviewPage(p => Math.min(previewTotalPages, p + 1))} disabled={previewPage >= previewTotalPages} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>
                        Newer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* POPUP 2: ENLARGED LIVE EXECUTION AUDIT TRACES (maxWidth: 960px)   */}
      {/* ---------------------------------------------------------------- */}
      {showAuditModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '960px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={22} color="var(--primary-emerald)" /> Detailed Live Execution Audit Traces & Sandbox Logs
              </h3>
              <button onClick={() => setShowAuditModal(false)} className="btn-outline" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
              {executedTools.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '60px 0' }}>
                  No tool executions recorded in this session.<br />Send a prompt requiring Python math or shell commands!
                </div>
              ) : (
                executedTools.map((t, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.94rem', color: 'var(--primary-violet)' }}>
                          🛠️ {t.tool_name}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Exit Code: {t.exit_code}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className={t.sandbox_type === 'docker' ? 'badge-tag tag-docker' : 'badge-tag tag-process'}>
                          {t.sandbox_type} Sandbox
                        </span>
                        <span className="badge-tag tag-shell">
                          ⚡ {t.execution_time_ms} ms
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Terminal Stdout / Stderr Output:</span>
                      <pre className="code-display" style={{ maxHeight: '200px', fontSize: '0.82rem', margin: 0 }}>
                        {(t.stdout || t.stderr || 'No output emitted. Shell process finished with exit code 0.').trim()}
                      </pre>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
