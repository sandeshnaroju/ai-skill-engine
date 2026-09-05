import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send, Bot, User, Terminal, Sparkles, Trash2, Check, Copy, Activity,
  Code2, Globe, Plus, MessageSquare, Brain, ChevronDown, ChevronUp, Cpu,
  ShieldCheck, Box, Key, Download, X, History, FileText, Sparkle, Sliders,
  Paperclip, Maximize2, Minimize2, Loader, LayoutDashboard, Settings, PanelLeftOpen
} from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import { chatApi, tenantsApi, appsApi, userDataApi, skillsApi, apiClient, artifactsApi } from '../../api';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import ConfigDrawer from './ConfigDrawer';
import Canvas from '../Canvas';
import ProChat from 'prochat';

export default function ChatPlayground({ isSidebarOpen, toggleSidebar }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialSessionId] = useState(() => `session_${Math.floor(1000 + Math.random() * 9000)}`);
  const [sessions, setSessions] = useState([]);

  const activeSessionId = searchParams.get('session_id') || initialSessionId;

  const setActiveSessionId = (id) => {
    const nextParams = new URLSearchParams(searchParams);
    if (id) {
      nextParams.set('session_id', id);
    } else {
      nextParams.delete('session_id');
    }
    setSearchParams(nextParams);
  };

  const [messages, setMessages] = useState([]);
  const [canvasArtifact, setCanvasArtifact] = useState(null);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [canvasWidthPercent, setCanvasWidthPercent] = useState(55);

  // Auto-detect if current session already has an artifact and make it available
  useEffect(() => {
    if (!activeSessionId) return;
    artifactsApi.getSessionArtifacts(activeSessionId).then((res) => {
      const list = res?.data !== undefined ? res.data : res;
      if (Array.isArray(list) && list.length > 0) {
        setCanvasArtifact({
          id: list[0].id,
          token: null,
          title: list[0].title || list[0].filename,
          artifact_type: list[0].artifact_type || 'document'
        });
      }
    }).catch(() => { });
  }, [activeSessionId]);

  useEffect(() => {
    const urlSessionId = searchParams.get('session_id');
    if (!urlSessionId) {
      setActiveSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const [liveThought, setLiveThought] = useState('');
  const [executedTools, setExecutedTools] = useState([]);
  const [tenants, setTenants] = useState([]);
  const selectedTenantId = searchParams.get('tenant') || '';

  const setSelectedTenantId = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('tenant', val);
    else nextParams.delete('tenant');
    setSearchParams(nextParams);
  };

  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];
  const apiKey = activeTenant ? activeTenant.api_key : '';

  const selectedAppId = searchParams.get('app_id') || '';
  const selectedModel = searchParams.get('model') || '';

  const setSelectedAppId = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('app_id', val);
    else nextParams.delete('app_id');
    setSearchParams(nextParams);
  };

  const setSelectedModel = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('model', val);
    else nextParams.delete('model');
    setSearchParams(nextParams);
  };

  // Custom tenant models list
  const [tenantModels, setTenantModels] = useState([]);
  const [apps, setApps] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [expandedReasoning, setExpandedReasoning] = useState({});

  // Slide-over configuration drawer (closed by default for clean ChatGPT/Claude UI)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userDataPairs, setUserDataPairs] = useState([{ key: 'api_key', value: 'example_secret_key' }]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSkillNames, setSelectedSkillNames] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState('You are AI Skill Engine, an enterprise agent equipped with sandboxed execution environments and specialized skills.');

  const fetchTemplates = async () => {
    try {
      const data = await userDataApi.list({ page_size: 100, page: 1, tenant_id: selectedTenantId || undefined });
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      setTemplates(items);
    } catch (e) {
      console.error('Failed to fetch User Data templates:', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [selectedTenantId]);

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
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (tpl) {
      applyTemplate(tpl);
      return;
    }
    try {
      const data = await userDataApi.list({ search: '', page: 1, page_size: 100, tenant_id: selectedTenantId || undefined });
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

  const [prochatModel, setProchatModel] = useState('');

  // File Upload states
  const fileInputRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploading(true);
    setLiveThought('Uploading files to sandbox...');

    try {
      const uploadedList = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const data = await apiClient.post('/api/v1/files/upload', formData, {
          tenantKey: apiKey.trim() || undefined
        });

        let base64 = null;
        if (file.type.startsWith('image/')) {
          base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
          });
        }

        uploadedList.push({
          name: file.name,
          type: file.type,
          size: file.size,
          url: data.url,
          sandboxPath: data.sandbox_path,
          base64: base64
        });
      }
      setAttachedFiles(prev => [...prev, ...uploadedList]);
    } catch (err) {
      console.error('Error uploading files:', err);
    } finally {
      setUploading(false);
      setLiveThought('');
    }
  };

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

  const fetchSessionsList = async (activeKey) => {
    try {
      const keyToUse = activeKey || apiKey;
      const data = await apiClient.get('/api/v1/sessions', {
        params: { page: sessionsPage, page_size: 8 },
        tenantKey: keyToUse || undefined
      });

      if (data && data.items !== undefined) {
        const mapped = data.items.map((s) => ({
          id: s.id,
          name: s.title || `Session ${s.id.substring(0, 8)}`,
          lastTime: s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
        }));
        setSessions(mapped);
        setSessionsTotalPages(data.pages || 1);
        setSessionsTotalItems(data.total || 0);
      } else {
        const mapped = (data || []).map((s) => ({
          id: s.id,
          name: s.title || `Session ${s.id.substring(0, 8)}`,
          lastTime: 'Recent',
        }));
        setSessions(mapped);
        setSessionsTotalPages(1);
        setSessionsTotalItems((data || []).length);
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  };

  const processLoadedMessages = (rawMessages) => {
    const processed = [];
    let pendingReasoning = [];
    let pendingArtifacts = [];

    rawMessages.forEach((m) => {
      if (m.role === 'user') {
        processed.push({
          role: 'user',
          content: m.content || '',
          timestamp: m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } else if (m.role === 'tool') {
        const contentStr = m.content || '';
        pendingReasoning.push(`💭 Tool execution completed.`);
        pendingReasoning.push(`⚡ Executed tool\nOutput: ${contentStr}`);

        if (m.artifact) {
          pendingArtifacts.push(m.artifact);
        } else if (m.artifact_data) {
          try {
            const parsed = typeof m.artifact_data === 'string' ? JSON.parse(m.artifact_data) : m.artifact_data;
            if (Array.isArray(parsed)) pendingArtifacts.push(...parsed);
            else if (parsed) pendingArtifacts.push(parsed);
          } catch (e) { }
        } else if (contentStr.includes('/embed/canvas?token=')) {
          const match = contentStr.match(/token=([a-zA-Z0-9_\-\.]+)/);
          if (match) {
            pendingArtifacts.push({
              title: 'Interactive Document',
              artifact_type: 'document',
              token: match[1],
              embed_url: `/embed/canvas?token=${match[1]}`
            });
          }
        }
      } else if (m.role === 'assistant') {
        let toolCalls = [];
        if (m.tool_calls) {
          try {
            toolCalls = typeof m.tool_calls === 'string' ? JSON.parse(m.tool_calls) : m.tool_calls;
          } catch (e) { }
        }

        if (toolCalls && toolCalls.length > 0) {
          pendingReasoning.push(`💭 Analyzing context & invoking tool dependencies...`);
          toolCalls.forEach(tc => {
            const rawName = tc.function?.name || tc.name || 'tool';
            const cleanName = rawName.split('__').pop().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const args = typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.arguments || {});
            pendingReasoning.push(`🛠️ Invoking Tool: ${cleanName}\nArgs: ${args}`);
          });
        }

        let messageArtifacts = [];
        if (Array.isArray(m.artifacts) && m.artifacts.length > 0) {
          messageArtifacts = [...m.artifacts];
        } else if (m.artifact_data) {
          try {
            const parsed = typeof m.artifact_data === 'string' ? JSON.parse(m.artifact_data) : m.artifact_data;
            if (Array.isArray(parsed)) messageArtifacts.push(...parsed);
            else if (parsed) messageArtifacts.push(parsed);
          } catch (e) { }
        } else if (m.artifact) {
          messageArtifacts.push(m.artifact);
        }

        if (messageArtifacts.length === 0 && pendingArtifacts.length > 0) {
          messageArtifacts = [...pendingArtifacts];
        }

        messageArtifacts.forEach(a => {
          if (!a.id && a.artifact_id) a.id = a.artifact_id;
        });
        pendingArtifacts = [];

        if (m.content && m.content.trim()) {
          processed.push({
            role: 'assistant',
            content: m.content,
            json: m.json,
            code: m.code,
            artifacts: messageArtifacts,
            timestamp: m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reasoning: pendingReasoning.length > 0 ? pendingReasoning.join('\n\n') : null
          });
          pendingReasoning = [];
        }
      } else {
        processed.push({
          role: m.role,
          content: m.content || '',
          timestamp: m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    });

    if (pendingReasoning.length > 0) {
      processed.push({
        role: 'assistant',
        content: 'No response content emitted.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reasoning: pendingReasoning.join('\n\n')
      });
    }

    return processed;
  };

  const fetchSessionMessages = async (sessionId, activeKey) => {
    try {
      const keyToUse = activeKey || apiKey;
      const data = await apiClient.get(`/api/v1/sessions/${sessionId}/messages`, {
        tenantKey: keyToUse || undefined
      });
      if (data && data.length > 0) {
        const loadedMsgs = processLoadedMessages(data);
        setMessages(loadedMsgs);
        const lastWithArt = [...loadedMsgs].reverse().find(msg => Array.isArray(msg.artifacts) && msg.artifacts.length > 0);
        if (lastWithArt && lastWithArt.artifacts && lastWithArt.artifacts.length > 0) {
          setCanvasArtifact(lastWithArt.artifacts[lastWithArt.artifacts.length - 1]);
        }
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to fetch session messages:', e);
    }
  };

  useEffect(() => {
    if (activeSessionId && apiKey) {
      fetchSessionMessages(activeSessionId, apiKey);
    }
  }, [activeSessionId, apiKey]);

  const loadApps = async () => {
    try {
      const appsData = await appsApi.list({ page_size: 100, tenant_id: selectedTenantId || undefined });
      const appsList = appsData?.items || appsData || [];
      setApps(appsList);

      if (appsList.length > 0) {
        if (!selectedAppId || !appsList.find(a => a.id === selectedAppId)) {
          setSelectedAppId(appsList[0].id);
        }
      } else {
        setSelectedAppId('');
      }
    } catch (e) {
      console.error('Failed to load apps:', e);
    }
  };

  const loadMetaData = async () => {
    try {
      const tenantsData = await tenantsApi.list();
      const items = Array.isArray(tenantsData) ? tenantsData : (tenantsData.items || tenantsData.data || []);
      setTenants(items || []);

      let tenantIdToUse = selectedTenantId;
      if (tenantsData.length > 0 && !selectedTenantId) {
        tenantIdToUse = tenantsData[0].id;
        setSelectedTenantId(tenantIdToUse);
      }

      const activeT = tenantsData.find(t => t.id === tenantIdToUse) || tenantsData[0];
      const keyToUse = activeT ? activeT.api_key : '';
      fetchSessionsList(keyToUse);

      fetchTenantModels();
      loadApps();
    } catch (e) {
      console.error('Failed to load playground metadata:', e);
    }
  };

  useEffect(() => {
    loadMetaData();
  }, []);

  useEffect(() => {
    setSelectedAppId('');
    setSelectedSkillNames([]);
    if (selectedTenantId) {
      loadApps();
      fetchTenantModels();
    }
  }, [selectedTenantId]);

  const fetchTenantModels = async () => {
    try {
      const data = await tenantsApi.listLlms(null, { tenant_id: selectedTenantId || undefined });
      const items = Array.isArray(data) ? data : (data.items || []);
      setTenantModels(items || []);
      const nonProchat = (items || []).filter(
        m => m.provider !== 'prochat' && !m.model_name.toLowerCase().includes('genui')
      );
      const urlModelExists = selectedModel && nonProchat.some(m => m.model_name === selectedModel);
      if (!urlModelExists) {
        if (nonProchat.length > 0) {
          setSelectedModel(nonProchat[0].model_name);
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
      fetchSessionsList(apiKey);
    }
  }, [sessionsPage, apiKey]);

  const fetchPreviewMessages = async (sessionId, activeKey) => {
    try {
      const keyToUse = activeKey || apiKey;
      const data = await apiClient.get(`/api/v1/sessions/${sessionId}/messages`, {
        params: { page: previewPage, page_size: 10 },
        tenantKey: keyToUse || undefined
      });
      if (data && data.items !== undefined) {
        const loadedMsgs = processLoadedMessages(data.items);
        setPreviewMessages(loadedMsgs);
        setPreviewTotalPages(data.pages || 1);
        setPreviewTotalItems(data.total || 0);
      } else {
        const loadedMsgs = processLoadedMessages(data);
        setPreviewMessages(loadedMsgs);
        setPreviewTotalPages(1);
        setPreviewTotalItems((data || []).length);
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

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/api/v1/sessions/${sessionId}`, {
        tenantKey: apiKey || undefined
      });
      fetchSessionsList();
      if (activeSessionId === sessionId) {
        handleNewSession();
      }
      if (previewSessionId === sessionId) {
        setPreviewSessionId(null);
        setPreviewMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleNewSession = () => {
    const newSessionId = `session_${Math.floor(1000 + Math.random() * 9000)}`;
    setActiveSessionId(newSessionId);
    setMessages([]);
    setCanvasArtifact(null);
    setIsCanvasOpen(false);
    setAttachedFiles([]);
    setInput('');
  };

  const copyText = (txt, idx) => {
    navigator.clipboard.writeText(txt);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // SEND MESSAGE HANDLER (STREAMING)
  const handleSend = async (overridePrompt) => {
    const promptToSend = typeof overridePrompt === 'string' ? overridePrompt : input;
    if ((!promptToSend || !promptToSend.trim()) && attachedFiles.length === 0) return;
    if (loading) return;

    let userContent = promptToSend ? promptToSend.trim() : '';
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles
        .map(f => `[Attached File: ${f.name} (URL: ${f.url || f.sandboxPath || 'sandbox'})]`)
        .join('\n');
      userContent = userContent ? `${userContent}\n\n${fileRefs}` : fileRefs;
    }

    const newMsg = {
      role: 'user',
      content: userContent,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const currentFiles = [...attachedFiles];
    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setAttachedFiles([]);
    setLoading(true);
    setLiveThought('Connecting to Skill Engine...');
    setExecutedTools([]);

    abortControllerRef.current = new AbortController();

    try {
      let finalContent = '';
      let finalJson = null;
      let finalCode = null;
      let reasoningTraces = [];
      let turnArtifacts = [];
      let turnGeneratedFiles = [];

      const payload = {
        model: selectedModel || 'default',
        messages: [{ role: 'user', content: userContent }],
        stream: true,
        session_id: activeSessionId,
        app_id: selectedAppId || undefined,
        user_data: getUserDataPayload(),
        prochat_model: prochatModel.trim() || undefined,
        skill_names: selectedSkillNames.length > 0 ? selectedSkillNames : undefined,
        system_prompt: systemPrompt || undefined,
        attachments: currentFiles.map(f => ({
          name: f.name,
          url: f.url,
          sandbox_path: f.sandboxPath,
          type: f.type,
          base64: f.base64
        }))
      };

      const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() ? { 'X-API-Key': apiKey.trim() } : {}),
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          json: null,
          code: null,
          prochat_model: prochatModel.trim() || null,
          artifacts: [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          reasoning: '',
          isStreaming: true,
        },
      ]);

      const updateMessageState = () => {
        setMessages((prev) => {
          const next = [...prev];
          const lastMsg = next[next.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = finalContent;
            lastMsg.json = finalJson;
            lastMsg.code = finalCode;
            lastMsg.reasoning = reasoningTraces.join('\n\n');
            lastMsg.artifacts = [...turnArtifacts];
            if (turnArtifacts.length > 0) {
              lastMsg.artifact = turnArtifacts[turnArtifacts.length - 1];
            }
          }
          return next;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        let stateChanged = false;
        for (const evtBlock of events) {
          if (!evtBlock.trim()) continue;
          const lines = evtBlock.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.replace('data: ', '').trim();
              if (rawData === '[DONE]') continue;
              try {
                const dataJson = JSON.parse(rawData);

                if (dataJson.type === 'done' && Array.isArray(dataJson.artifacts) && dataJson.artifacts.length > 0) {
                  dataJson.artifacts.forEach(rawA => {
                    const artInfo = {
                      id: rawA.artifact_id || rawA.id,
                      token: rawA.token,
                      title: rawA.title || 'Document',
                      filename: rawA.filename || 'document.md',
                      artifact_type: rawA.artifact_type || 'document',
                      current_version: rawA.current_version || 1,
                      embed_url: rawA.embed_url || (rawA.token ? `/embed/canvas?token=${rawA.token}` : '')
                    };
                    if (!turnArtifacts.some(existing => (artInfo.id && existing.id === artInfo.id) || (existing.token && existing.token === artInfo.token))) {
                      turnArtifacts.push(artInfo);
                    }
                  });
                  if (turnArtifacts.length > 0) {
                    setCanvasArtifact(turnArtifacts[turnArtifacts.length - 1]);
                    stateChanged = true;
                  }
                }

                if (dataJson && dataJson.choices && dataJson.choices[0] && dataJson.choices[0].delta) {
                  const delta = dataJson.choices[0].delta;
                  if (delta.reasoning) {
                    setLiveThought(delta.reasoning);
                    reasoningTraces.push(`💭 ${delta.reasoning}`);
                    stateChanged = true;
                  }
                  if (delta.artifact) {
                    const rawA = delta.artifact;
                    const artInfo = {
                      id: rawA.artifact_id || rawA.id,
                      token: rawA.token,
                      title: rawA.title || 'Document',
                      filename: rawA.filename || 'document.md',
                      artifact_type: rawA.artifact_type || 'document',
                      current_version: rawA.current_version || 1,
                      embed_url: rawA.embed_url || (rawA.token ? `/embed/canvas?token=${rawA.token}` : '')
                    };
                    if (!turnArtifacts.some(existing => (artInfo.id && existing.id === artInfo.id) || (existing.token && existing.token === artInfo.token))) {
                      turnArtifacts.push(artInfo);
                    }
                    setCanvasArtifact(artInfo);
                    stateChanged = true;
                  }
                  if (delta.tool_call) {
                    const rawName = delta.tool_call.name || 'tool';
                    const cleanName = rawName.split('__').pop().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    setLiveThought(`Invoking ${cleanName}...`);
                    reasoningTraces.push(`🛠️ Invoking Tool: ${cleanName}\nArgs: ${JSON.stringify(delta.tool_call.arguments)}`);
                    stateChanged = true;
                  }
                  if (delta.tool_result) {
                    const rawName = delta.tool_result.tool_name || 'tool';
                    const cleanName = rawName.split('__').pop().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    setLiveThought(`${cleanName} finished in ${delta.tool_result.execution_time_ms}ms.`);
                    reasoningTraces.push(`⚡ Executed in ${delta.tool_result.sandbox_type} sandbox (${delta.tool_result.execution_time_ms}ms, Exit: ${delta.tool_result.exit_code})\nOutput: ${(delta.tool_result.stdout || delta.tool_result.stderr || '').trim()}`);
                    setExecutedTools((prev) => [...prev, delta.tool_result]);
                    if (delta.tool_result.generated_files && delta.tool_result.generated_files.length > 0) {
                      turnGeneratedFiles.push(...delta.tool_result.generated_files);
                    }
                    if (delta.tool_result.artifact_data) {
                      const rawA = delta.tool_result.artifact_data;
                      const artInfo = {
                        id: rawA.artifact_id || rawA.id,
                        token: rawA.token,
                        title: rawA.title || 'Document',
                        filename: rawA.filename || 'document.md',
                        artifact_type: rawA.artifact_type || 'document',
                        current_version: rawA.current_version || 1,
                        embed_url: rawA.embed_url || (rawA.token ? `/embed/canvas?token=${rawA.token}` : '')
                      };
                      if (!turnArtifacts.some(existing => (artInfo.id && existing.id === artInfo.id) || (existing.token && existing.token === artInfo.token))) {
                        turnArtifacts.push(artInfo);
                      }
                      setCanvasArtifact(artInfo);
                    }
                    stateChanged = true;
                  }
                  if (delta.content) {
                    finalContent += delta.content;
                    stateChanged = true;
                  }
                  if (delta.json) {
                    if (typeof delta.json === 'string') {
                      try { finalJson = JSON.parse(delta.json); } catch (e) { finalJson = delta.json; }
                    } else {
                      finalJson = delta.json;
                    }
                    stateChanged = true;
                  }
                  if (delta.code) {
                    finalCode = delta.code;
                    stateChanged = true;
                  }
                }
              } catch (e) { }
            }
          }
        }
        if (stateChanged) {
          updateMessageState();
        }
      }

      if (finalContent && finalContent.includes('/embed/canvas?token=')) {
        const globalRegex = /\/embed\/canvas\?token=([^\s)"']+)/g;
        let match;
        while ((match = globalRegex.exec(finalContent)) !== null) {
          const tokenStr = match[1];
          let effId = null;
          if (tokenStr.includes('.')) {
            try {
              const rawB64 = tokenStr.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
              const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
              const payload = JSON.parse(atob(padded));
              if (payload?.art) effId = payload.art;
            } catch (e) { }
          }
          const artInfo = {
            id: effId,
            token: tokenStr,
            title: 'Interactive Document',
            artifact_type: 'document',
            current_version: 1,
            embed_url: `/embed/canvas?token=${tokenStr}`
          };
          if (!turnArtifacts.some(existing => (effId && existing.id === effId) || (existing.token && existing.token === tokenStr))) {
            turnArtifacts.push(artInfo);
          }
        }
        if (turnArtifacts.length > 0) {
          setCanvasArtifact(turnArtifacts[turnArtifacts.length - 1]);
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        const lastMsg = next[next.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = finalContent || (turnArtifacts.length > 0 ? 'Created Canvas document.' : (finalJson ? 'Generated dynamic UI.' : 'Completed task.'));
          lastMsg.json = finalJson;
          lastMsg.code = finalCode;
          lastMsg.reasoning = reasoningTraces.join('\n\n');
          lastMsg.isStreaming = false;
          lastMsg.artifacts = [...turnArtifacts];
          if (turnArtifacts.length > 0) {
            lastMsg.artifact = turnArtifacts[turnArtifacts.length - 1];
          }
        }
        return next;
      });

      fetchSessionsList();
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `**Error:** Failed to execute request: ${err.message}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            reasoning: `Connection terminated: ${err.message}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
      setLiveThought('');
      abortControllerRef.current = null;
    }
  };

  const exportTranscript = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(messages, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `transcript_${activeSessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const activeApp = apps.find(a => a.id === selectedAppId);
  const activeSessionTitle = sessions.find(s => s.id === activeSessionId)?.name || 'New Conversation';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: 'var(--bg-main)',
      position: 'relative',
      overflow: 'hidden'
    }}>

      {/* ---------------------------------------------------------------- */}
      {/* 1. TOP NAVIGATION BAR (Clean Claude / ChatGPT Style)             */}
      {/* ---------------------------------------------------------------- */}
      <div style={{
        height: '54px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: 'var(--bg-panel)',
        flexShrink: 0,
        zIndex: 20
      }}>
        {/* Left: Sidebar Toggle, Active Session Indicator & History Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {toggleSidebar && !isSidebarOpen && (
            <button
              type="button"
              className="btn-outline"
              onClick={toggleSidebar}
              style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
              title="Expand Left Sidebar"
            >
              <PanelLeftOpen size={16} color="var(--primary-violet)" />
            </button>
          )}

          <button
            type="button"
            onClick={handleNewSession}
            className="btn-gradient"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Start fresh conversation"
          >
            <Plus size={14} /> <span>New Chat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPreviewSessionId(activeSessionId);
              setPreviewMessages(messages);
              setShowHistoryModal(true);
            }}
            className="btn-outline"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)'
            }}
            title="View chat history threads"
          >
            <History size={14} color="var(--primary-violet)" />
            <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSessionTitle}
            </span>
            <ChevronDown size={13} color="var(--text-muted)" />
          </button>
        </div>

        {/* Center: Model & App Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Quick Model Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '4px 10px',
            fontSize: '0.78rem',
            color: 'var(--text-main)',
            cursor: 'pointer'
          }}
          onClick={() => setIsSettingsOpen(true)}
          title="Click to configure model & parameters"
          >
            <Cpu size={13} color="var(--primary-violet)" />
            <span style={{ fontWeight: '600' }}>{selectedModel || 'Select Model'}</span>
            <ChevronDown size={11} color="var(--text-muted)" />
          </div>

          {/* Quick App Scope Badge */}
          {activeApp && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: '16px',
              padding: '4px 10px',
              fontSize: '0.76rem',
              color: 'var(--primary-violet)',
              cursor: 'pointer'
            }}
            onClick={() => setIsSettingsOpen(true)}
            title="App Scope - Click to change"
            >
              <Box size={12} />
              <span>{activeApp.name}</span>
            </div>
          )}
        </div>

        {/* Right: Canvas Trigger, Config Drawer Toggle, Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Canvas Toggle (Highlight when artifact ready) */}
          {canvasArtifact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setIsCanvasOpen(!isCanvasOpen)}
                className="btn-gradient"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  borderRadius: isCanvasOpen ? '8px 0 0 8px' : '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isCanvasOpen ? '0 0 12px rgba(139, 92, 246, 0.4)' : 'none'
                }}
                title={isCanvasOpen ? 'Close Canvas Panel' : 'Open Canvas Document'}
              >
                <FileText size={14} />
                <span>{isCanvasOpen ? 'Canvas Active' : `Canvas: ${canvasArtifact.title || 'Document'}`}</span>
              </button>
              {isCanvasOpen && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '0 8px 8px 0',
                  padding: '2px',
                  borderLeft: 'none'
                }}>
                  <button
                    type="button"
                    onClick={() => setCanvasWidthPercent(50)}
                    title="50/50 Split View"
                    style={{
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      background: canvasWidthPercent === 50 ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                      color: canvasWidthPercent === 50 ? 'var(--primary-violet)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanvasWidthPercent(65)}
                    title="Wide Canvas View (65%)"
                    style={{
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      background: canvasWidthPercent === 65 ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                      color: canvasWidthPercent === 65 ? 'var(--primary-violet)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    65%
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanvasWidthPercent(100)}
                    title="Full Canvas View (100%)"
                    style={{
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      background: canvasWidthPercent === 100 ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                      color: canvasWidthPercent === 100 ? 'var(--primary-violet)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCanvasOpen(false)}
                    title="Close Canvas"
                    style={{
                      padding: '4px 6px',
                      fontSize: '0.7rem',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Slide-over Config Trigger */}
          <button
            type="button"
            className="btn-outline"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: isSettingsOpen ? 'var(--primary-violet)' : 'var(--border-subtle)',
              background: isSettingsOpen ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
              color: isSettingsOpen ? 'var(--primary-violet)' : 'var(--text-main)'
            }}
            title="Session configuration & parameters"
          >
            <Sliders size={14} />
            <span>Config</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            className="btn-outline"
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              padding: '6px 8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)'
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 2. MAIN WORKSPACE (Split Chat & Canvas Artifacts)                */}
      {/* ---------------------------------------------------------------- */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative'
      }}>

        {/* LEFT SECTION: Chat Conversation Viewport */}
        {(!isCanvasOpen || canvasWidthPercent < 100) && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: isCanvasOpen ? `0 0 calc(100% - ${canvasWidthPercent}%)` : '1 1 100%',
            width: isCanvasOpen ? `calc(100% - ${canvasWidthPercent}%)` : '100%',
            minWidth: 0,
            maxWidth: isCanvasOpen ? `calc(100% - ${canvasWidthPercent}%)` : '100%',
            minHeight: 0,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            transition: 'width 0.15s ease'
          }}>
            {/* Messages Stream */}
            <MessageList
              messages={messages}
              expandedReasoning={expandedReasoning}
              setExpandedReasoning={setExpandedReasoning}
              copiedIdx={copiedIdx}
              copyText={copyText}
              onOpenCanvas={(art) => {
                if (!art) return;
                let resolvedArt = { ...art };
                if (!resolvedArt.id && resolvedArt.token && resolvedArt.token.includes('.')) {
                  try {
                    const rawB64 = resolvedArt.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
                    const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
                    const payload = JSON.parse(atob(padded));
                    if (payload?.art) resolvedArt.id = payload.art;
                  } catch (e) {
                    console.warn('Could not extract artifact id:', e);
                  }
                }
                setCanvasArtifact(resolvedArt);
                setIsCanvasOpen(true);
              }}
              activeCanvasArtifact={canvasArtifact}
              isCanvasOpen={isCanvasOpen}
              onSelectPreset={(text) => handleSend(text)}
            />

            {/* Floating Pill Chat Input */}
            <ChatInput
              attachedFiles={attachedFiles}
              setAttachedFiles={setAttachedFiles}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
              loading={loading}
              uploading={uploading}
              input={input}
              setInput={setInput}
              handleSend={handleSend}
              handleStop={handleStop}
              activeModelName={selectedModel}
              activeAppName={activeApp?.name}
            />
          </div>
        )}

        {/* RIGHT SECTION: Interactive Canvas (Slides, Docs, Sheets, Code) */}
        {canvasArtifact && isCanvasOpen && (
          <div style={{
            width: canvasWidthPercent === 100 ? '100%' : `${canvasWidthPercent}%`,
            flex: canvasWidthPercent === 100 ? '1 1 100%' : `0 0 ${canvasWidthPercent}%`,
            minWidth: 0,
            maxWidth: canvasWidthPercent === 100 ? '100%' : `${canvasWidthPercent}%`,
            borderLeft: canvasWidthPercent === 100 ? 'none' : '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
            background: 'var(--bg-main)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease',
            transition: 'width 0.15s ease'
          }}>
            <Canvas
              key={`${canvasArtifact.id}-${canvasArtifact.token || 'notoken'}`}
              artifactId={canvasArtifact.id}
              token={canvasArtifact.token}
              onClose={() => setIsCanvasOpen(false)}
            />
          </div>
        )}

      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. SLIDE-OVER CONFIGURATION DRAWER                               */}
      {/* ---------------------------------------------------------------- */}
      <ConfigDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedTenantId={selectedTenantId}
        setSelectedTenantId={setSelectedTenantId}
        tenants={tenants}
        setTenants={setTenants}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        tenantModels={tenantModels}
        selectedAppId={selectedAppId}
        setSelectedAppId={setSelectedAppId}
        apps={apps}
        setApps={setApps}
        prochatModel={prochatModel}
        setProchatModel={setProchatModel}
        selectedSkillNames={selectedSkillNames}
        setSelectedSkillNames={setSelectedSkillNames}
        templates={templates}
        setTemplates={setTemplates}
        selectedTemplateId={selectedTemplateId}
        handleTemplateChange={handleTemplateChange}
        userDataPairs={userDataPairs}
        handleUserDataPairChange={handleUserDataPairChange}
        handleAddUserDataPair={handleAddUserDataPair}
        handleRemoveUserDataPair={handleRemoveUserDataPair}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        onOpenHistory={() => {
          setIsSettingsOpen(false);
          setShowHistoryModal(true);
        }}
        onOpenAudit={() => {
          setIsSettingsOpen(false);
          setShowAuditModal(true);
        }}
        onExportTranscript={exportTranscript}
        onClearConsole={() => setMessages([])}
        sessionsCount={sessionsTotalItems || sessions.length}
        executedToolsCount={executedTools.length}
      />

      {/* ---------------------------------------------------------------- */}
      {/* 4. CHAT HISTORY MODAL                                            */}
      {/* ---------------------------------------------------------------- */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '850px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={22} color="var(--primary-violet)" /> Chat History & AI Threads
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="btn-outline" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '18px', flex: 1, overflow: 'hidden', paddingTop: '12px' }}>
              {/* Left Column: Sessions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', borderRight: '1px solid var(--border-subtle)', paddingRight: '14px', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Past Conversations ({sessionsTotalItems})
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sessions.map((s) => {
                      const isActive = s.id === previewSessionId;
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            background: isActive ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-input)',
                            border: isActive ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '0.86rem', color: isActive ? 'var(--primary-violet)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <MessageSquare size={13} color="var(--primary-violet)" /> {s.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{s.id.substring(0, 10)}...</span>
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

              {/* Right Column: Thread Message Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    {previewSessionId ? `Previewing: ${previewSessionId}` : 'Select a thread to preview'}
                  </span>
                  {previewSessionId && (
                    <button
                      className="btn-gradient"
                      onClick={handleContinueChat}
                      style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                    >
                      Resume This Thread
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
                  {previewMessages.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                      No messages in preview
                    </div>
                  ) : (
                    previewMessages.map((pm, pidx) => (
                      <div
                        key={pidx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: pm.role === 'user' ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.8rem',
                          color: 'var(--text-main)',
                          lineHeight: '1.4'
                        }}
                      >
                        <div style={{ fontWeight: '700', fontSize: '0.72rem', color: pm.role === 'user' ? 'var(--primary-violet)' : 'var(--primary-emerald)', marginBottom: '3px' }}>
                          {pm.role.toUpperCase()}
                        </div>
                        <div>{pm.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 5. AUDIT LOGS MODAL                                              */}
      {/* ---------------------------------------------------------------- */}
      {showAuditModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={20} color="var(--primary-emerald)" /> Sandbox Execution Traces & Tools
              </h3>
              <button onClick={() => setShowAuditModal(false)} className="btn-outline" style={{ padding: '6px' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {executedTools.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                  No tools executed in this active turn.
                </div>
              ) : (
                executedTools.map((t, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.82rem', fontWeight: '600' }}>
                      <span style={{ color: 'var(--primary-emerald)' }}>⚡ {t.tool_name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{t.execution_time_ms}ms · Exit {t.exit_code}</span>
                    </div>
                    <pre style={{ margin: 0, padding: '10px', background: '#080c14', borderRadius: '6px', fontSize: '0.74rem', color: '#38bdf8', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
                      {t.stdout || t.stderr || 'Success (no output)'}
                    </pre>
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
