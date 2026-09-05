import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Bot, User, Terminal, Sparkles, Trash2, Check, Copy, Activity, Code2, Globe, Plus, MessageSquare, Brain, ChevronDown, ChevronUp, Cpu, ShieldCheck, Box, Key, Download, X, History, FileText, Sparkle, Sliders, Paperclip, Maximize2, Minimize2, Loader } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import { chatApi, tenantsApi, appsApi, userDataApi, skillsApi, apiClient, artifactsApi } from '../../api';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import Canvas from '../Canvas';
import ProChat from 'prochat';

export default function ChatPlayground() {
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
  const [canvasWidthPercent, setCanvasWidthPercent] = useState(64);

  // Auto-detect if current session already has an artifact and make it available
  useEffect(() => {
    if (!activeSessionId) return;
    artifactsApi.getSessionArtifacts(activeSessionId).then((res) => {
      const list = res?.data !== undefined ? res.data : res;
      if (Array.isArray(list) && list.length > 0) {
        setCanvasArtifact({
          id: list[0].id,
          token: null, // will load or fetch token
          title: list[0].title || list[0].filename
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
  const abortControllerRef = React.useRef(null);
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

  // Collapsible configuration sidebar state
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userDataPairs, setUserDataPairs] = useState([{ key: 'api_key', value: 'example_secret_key' }]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSkillNames, setSelectedSkillNames] = useState([]);

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
    // First try the already-fetched list
    const tpl = templates.find(t => String(t.id) === String(tplId));
    if (tpl) {
      applyTemplate(tpl);
      return;
    }
    // If not found in the initial list, re-fetch all templates
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
  // ProChat model selection — empty string = disabled, model name string = enabled with that model
  const [prochatModel, setProchatModel] = useState('');

  // File Upload states
  const fileInputRef = React.useRef(null);
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

        const headers = {};
        if (apiKey.trim()) {
          headers['X-API-Key'] = apiKey.trim();
        }

        const data = await apiClient.post('/api/v1/files/upload', formData, {
          tenantKey: apiKey.trim() || undefined
        });

        // Read file to base64 if it's an image
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
    {
      label: 'Create Canvas Document',
      icon: FileText,
      text: 'Create a comprehensive project proposal document in Canvas with an Executive Summary, Architecture Overview, and Financial Projections.',
    },
  ];

  const fetchSessionsList = async (activeKey) => {
    try {
      const keyToUse = activeKey || apiKey;
      const data = await apiClient.get('/api/v1/sessions', {
        params: { page: sessionsPage, page_size: 6 },
        tenantKey: keyToUse || undefined
      });

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
        const mapped = (data || []).map((s) => ({
          id: s.id,
          name: s.title || `Session ${s.id}`,
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
          timestamp: m.timestamp || new Date().toLocaleTimeString(),
        });
      } else if (m.role === 'tool') {
        const contentStr = m.content || '';
        pendingReasoning.push(`💭 Tool execution completed.`);
        pendingReasoning.push(`⚡ Executed tool\nOutput: ${contentStr}`);

        // Extract artifact information from tool response if available
        if (m.artifact) {
          pendingArtifacts.push(m.artifact);
        } else if (m.artifact_data) {
          try {
            const parsed = typeof m.artifact_data === 'string' ? JSON.parse(m.artifact_data) : m.artifact_data;
            if (Array.isArray(parsed)) {
              pendingArtifacts.push(...parsed);
            } else if (parsed) {
              pendingArtifacts.push(parsed);
            }
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
          pendingReasoning.push(`💭 Analyzing query context & invoking tool dependencies...`);
          toolCalls.forEach(tc => {
            const rawName = tc.function?.name || tc.name || 'tool';
            const cleanName = rawName.split('__').pop().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const args = typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.arguments || {});
            pendingReasoning.push(`💭 Invoking ${cleanName}...`);
            pendingReasoning.push(`🛠️ Invoking Tool: ${cleanName}\nArgs: ${args}`);
          });
        }

        if (m.json || m.code) {
          pendingReasoning.push(`💭 Generating dynamic user interface components...`);
          let parsedJson = null;
          if (m.json) {
            if (typeof m.json === 'string') {
              try { parsedJson = JSON.parse(m.json); } catch (e) { }
            } else {
              parsedJson = m.json;
            }
          }
          if (parsedJson) {
            pendingReasoning.push(`📊 UI Schema JSON:\n${JSON.stringify(parsedJson, null, 2)}`);
          }
          pendingReasoning.push(`⚡ Rendered ProChat Generative UI component.`);
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
            timestamp: m.timestamp || new Date().toLocaleTimeString(),
            reasoning: pendingReasoning.length > 0 ? pendingReasoning.join('\n\n') : null
          });
          pendingReasoning = [];
        }
      } else {
        processed.push({
          role: m.role,
          content: m.content || '',
          timestamp: m.timestamp || new Date().toLocaleTimeString(),
        });
      }
    });

    if (pendingReasoning.length > 0) {
      processed.push({
        role: 'assistant',
        content: 'No response content emitted.',
        timestamp: new Date().toLocaleTimeString(),
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
        // Find latest artifact from loaded messages to restore top bar button!
        const lastWithArt = [...loadedMsgs].reverse().find(msg => msg.artifact);
        if (lastWithArt && lastWithArt.artifact) {
          setCanvasArtifact(lastWithArt.artifact);
        } else {
          setCanvasArtifact(null);
        }
      } else {
        setMessages([
          {
            role: 'assistant',
            content: 'Welcome to `AI Skill Engine` Enterprise Simulator! Select an App scope or API key, then ask any question requiring system diagnostics, sandboxed Python code execution, or MCP tool calls.',
            timestamp: new Date().toLocaleTimeString(),
            reasoning: 'Gateway initialized with active skills & MCP drivers.',
          },
        ]);
        setCanvasArtifact(null);
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

      // Auto-select first app if none is set or if previous app doesn't exist in the list
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

      // Auto-select first tenant if none selected
      let tenantIdToUse = selectedTenantId;
      if (tenantsData.length > 0 && !selectedTenantId) {
        tenantIdToUse = tenantsData[0].id;
        setSelectedTenantId(tenantIdToUse);
      }

      const activeT = tenantsData.find(t => t.id === tenantIdToUse) || tenantsData[0];
      const keyToUse = activeT ? activeT.api_key : '';
      fetchSessionsList(keyToUse);

      // Always fetch tenant models and apps on load scoped to tenant
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
      const lastWithArt = [...previewMessages].reverse().find(msg => msg.artifact);
      if (lastWithArt && lastWithArt.artifact) {
        setCanvasArtifact(lastWithArt.artifact);
      } else {
        setCanvasArtifact(null);
      }
      setShowHistoryModal(false);
    }
  };

  const handleNewSession = () => {
    const newId = `session_${Math.floor(1000 + Math.random() * 9000)}`;
    setActiveSessionId(newId);
    setCanvasArtifact(null);
    setIsCanvasOpen(false);
    setMessages([
      {
        role: 'assistant',
        content: 'Welcome to `AI Skill Engine` Enterprise Simulator! Select an App scope or API key, then ask any question requiring system diagnostics, sandboxed Python code execution, or MCP tool calls.',
        timestamp: new Date().toLocaleTimeString(),
        reasoning: 'Gateway initialized with active skills & MCP drivers.',
      },
    ]);
    setExecutedTools([]);
    setShowHistoryModal(false);
  };

  // LLM Thread Title Generator
  const generateLLMThreadTitle = async (queryText) => {
    try {
      const data = await chatApi.createCompletion({
        messages: [
          {
            role: 'user',
            content: `Generate a concise, 3-5 word title summarizing a chat starting with user query: "${queryText}". Return ONLY the title string, no quotes or markdown.`,
          },
        ],
        model: selectedModel,
        stream: false,
      }, apiKey.trim() || undefined);

      const generatedTitle = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content.trim() : null;

      if (generatedTitle) {
        const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '');
        setSessions((prev) => {
          const exists = prev.some((s) => s.id === activeSessionId);
          if (exists) {
            return prev.map((s) => s.id === activeSessionId ? { ...s, name: cleanTitle } : s);
          } else {
            return [{ id: activeSessionId, name: cleanTitle, lastTime: 'Just now' }, ...prev];
          }
        });
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

    // Construct multimodal content payload
    let contentPayload = query;
    let textDescriptionParts = [];

    // Document attachments description
    const docAttachments = attachedFiles.filter(f => !f.type.startsWith('image/'));
    if (docAttachments.length > 0) {
      const descriptions = docAttachments.map(f => `[Attached File: ${f.name} (URL: ${f.url})]`).join('\n');
      textDescriptionParts.push(descriptions);
    }

    let finalQueryText = query;
    if (textDescriptionParts.length > 0) {
      finalQueryText = `${textDescriptionParts.join('\n')}\n\n${query}`;
    }

    const imageAttachments = attachedFiles.filter(f => f.type.startsWith('image/'));
    if (imageAttachments.length > 0) {
      contentPayload = [
        { type: 'text', text: finalQueryText },
        ...imageAttachments.map(img => ({
          type: 'image_url',
          image_url: { url: img.base64 }
        }))
      ];
    } else {
      contentPayload = finalQueryText;
    }

    const userTime = new Date().toLocaleTimeString();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: contentPayload, timestamp: userTime },
    ]);
    if (!textToSend) setInput('');
    setAttachedFiles([]);
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLiveThought('Connecting to Skill Gateway...');

    let finalContent = '';
    let finalJson = null;
    let finalCode = null;
    let reasoningTraces = [];
    let turnGeneratedFiles = [];
    let turnArtifacts = [];

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Request-Source': 'dashboard'
      };
      if (apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }

      const payload = {
        messages: [{ role: 'user', content: contentPayload }],
        session_id: activeSessionId,
        model: selectedModel,
        stream: true,
        ...(prochatModel.trim() ? { prochat_model: prochatModel.trim() } : {}),
      };
      if (selectedAppId) {
        payload.app_id = selectedAppId;
      }
      const userDataPayload = getUserDataPayload();
      if (userDataPayload) {
        payload.user_data = userDataPayload;
      }
      if (selectedSkillNames.length > 0) {
        payload.skill_names = selectedSkillNames;
      }

      const res = await chatApi.createStream(payload, apiKey.trim() || null, {
        source: 'dashboard',
        signal: controller.signal
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // Append initial streaming assistant message to show progress in real-time
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          timestamp: new Date().toLocaleTimeString(),
          reasoning: '',
          generatedFiles: [],
          isStreaming: true,
          json: '',
          code: '',
          artifacts: [],
          prochat_model: prochatModel
        },
      ]);

      const updateMessageState = () => {
        setMessages((prev) => {
          const next = [...prev];
          const lastMsg = next[next.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = finalContent;
            lastMsg.reasoning = reasoningTraces.join('\n\n');
            lastMsg.generatedFiles = [...turnGeneratedFiles];
            lastMsg.json = finalJson;
            lastMsg.code = finalCode;
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
                      try {
                        finalJson = JSON.parse(delta.json);
                      } catch (e) {
                        finalJson = delta.json;
                      }
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

      // Regex fallback check for embed links in final content
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

      // Finalize the streaming message
      setMessages((prev) => {
        const next = [...prev];
        const lastMsg = next[next.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = finalContent || 'No response content emitted.';
          if (finalJson) {
            reasoningTraces.push(`💭 Generating dynamic user interface components...`);
            reasoningTraces.push(`📊 UI Schema JSON:\n${JSON.stringify(finalJson, null, 2)}`);
            reasoningTraces.push(`⚡ Rendered ProChat Generative UI component.`);
          }
          lastMsg.reasoning = reasoningTraces.join('\n\n');
          lastMsg.generatedFiles = turnGeneratedFiles;
          lastMsg.json = finalJson;
          lastMsg.code = finalCode;
          lastMsg.artifacts = [...turnArtifacts];
          if (turnArtifacts.length > 0) {
            lastMsg.artifact = turnArtifacts[turnArtifacts.length - 1];
          }
          delete lastMsg.isStreaming;
        }
        return next;
      });

      // Refresh sessions list after message finishes
      fetchSessionsList(apiKey);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Gracefully finalize the last message with whatever content was streamed so far
        setMessages((prev) => {
          const next = [...prev];
          const lastMsg = next[next.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = finalContent || 'Stream stopped by user.';
            lastMsg.reasoning = reasoningTraces.join('\n\n') + '\n\n⚠️ Stream execution stopped by user.';
            lastMsg.generatedFiles = turnGeneratedFiles;
            lastMsg.json = finalJson;
            lastMsg.code = finalCode;
            lastMsg.artifacts = [...turnArtifacts];
            if (turnArtifacts.length > 0) {
              lastMsg.artifact = turnArtifacts[turnArtifacts.length - 1];
            }
            delete lastMsg.isStreaming;
          }
          return next;
        });
        fetchSessionsList(apiKey);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error connecting to gateway: ${err.message}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
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

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId);
  const activeSessionTitle = activeSessionObj ? activeSessionObj.name : 'New Chat Session';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      ...(isFullscreen
        ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 }
        : { height: 'calc(100vh - 105px)', width: '100%' }
      )
    }}>
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
                {activeSessionTitle}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Session ID: {activeSessionId}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Canvas Toggle / Re-open Button */}
            {canvasArtifact && (
              <button
                className="btn-outline"
                onClick={() => setIsCanvasOpen(!isCanvasOpen)}
                title={isCanvasOpen ? 'Collapse Document Canvas' : 'Re-open Document Canvas'}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  borderColor: isCanvasOpen ? '#6366f1' : 'var(--border-subtle)',
                  background: isCanvasOpen ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  color: isCanvasOpen ? '#a5b4fc' : 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <FileText size={14} color="#818cf8" />
                <span>{isCanvasOpen ? 'Close Canvas' : `Open Document (${canvasArtifact.title || 'Canvas'})`}</span>
                {!isCanvasOpen && (
                  <span style={{
                    fontSize: '10px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    Ready
                  </span>
                )}
              </button>
            )}

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

            {/* Fullscreen Toggle */}
            <button
              className="btn-outline"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit fullscreen' : 'Maximize chat'}
              style={{ padding: '6px 10px', fontSize: '0.82rem', borderColor: isFullscreen ? 'var(--primary-violet)' : 'var(--border-subtle)', background: isFullscreen ? 'rgba(139, 92, 246, 0.08)' : 'transparent' }}
            >
              {isFullscreen ? <Minimize2 size={15} color="var(--primary-violet)" /> : <Maximize2 size={15} color="var(--primary-violet)" />}
            </button>
          </div>
        </div>

        {/* Outer Split Container */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>

          {/* LEFT SECTION: Message Area (Takes up remaining flex space) */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>

            {/* Message Stream Viewport */}
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
                    console.warn('Could not extract artifact id from token in onOpenCanvas:', e);
                  }
                }
                setCanvasArtifact(resolvedArt);
                setIsCanvasOpen(true);
              }}
              activeCanvasArtifact={canvasArtifact}
              isCanvasOpen={isCanvasOpen}
            />

            {/* Input Bar */}
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
            />
          </div>

          {/* CENTER/RIGHT SECTION: Interactive Document & Artifact Canvas */}
          {canvasArtifact && isCanvasOpen && (
            <div style={{
              width: isSettingsOpen ? `${Math.min(canvasWidthPercent, 58)}%` : `${canvasWidthPercent}%`,
              minWidth: '520px',
              maxWidth: '85%',
              borderLeft: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              position: 'relative',
              transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              <Canvas
                key={`${canvasArtifact.id}-${canvasArtifact.token || 'notoken'}`}
                artifactId={canvasArtifact.id}
                token={canvasArtifact.token}
                onClose={() => setIsCanvasOpen(false)}
              />
            </div>
          )}

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
              {/* Section 0: Quick Examples */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.5px' }}>
                  ⚡ Quick Examples
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {presets.map((p, idx) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(p.text)}
                        disabled={loading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          background: 'rgba(139, 92, 246, 0.06)',
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                          borderRadius: '10px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background 0.15s',
                          opacity: loading ? 0.5 : 1,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)'}
                      >
                        <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '6px', borderRadius: '8px', flexShrink: 0 }}>
                          <Icon size={13} color="var(--primary-violet)" />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-main)' }}>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 1: Tenant Key */}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Tenant Access Key
                </label>
                <AsyncSearchableDropdown
                  value={selectedTenantId}
                  onChange={(val) => {
                    setSelectedTenantId(val);
                  }}
                  initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `🔑 ${tenants.find(t => t.id === selectedTenantId).name}` : ''}
                  fetchOptions={async (searchTerm) => {
                    const data = await tenantsApi.list({ search: searchTerm || '', page_size: 10, page: 1 });
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
                    const data = await tenantsApi.listLlms(null, { search: searchTerm || '', page_size: 10, page: 1, tenant_id: selectedTenantId || undefined });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    return items
                      .filter(m => m.provider !== 'prochat' && !m.model_name.toLowerCase().includes('genui'))
                      .map(m => ({
                        value: m.model_name,
                        label: `${m.model_name} (${m.provider})`
                      }));
                  }}
                  placeholder={tenantModels.length === 0 ? "No models" : "Select Model"}
                  disabled={!selectedTenantId}
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
                  initialLabel={apps.find(a => a.id === selectedAppId)?.name ? `📦 ${apps.find(a => a.id === selectedAppId).name}` : ''}
                  fetchOptions={async (searchTerm) => {
                    const data = await appsApi.list({ search: searchTerm || '', page_size: 10, page: 1, tenant_id: selectedTenantId || undefined });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    setApps(prev => {
                      const newApps = [...prev];
                      items.forEach(a => {
                        if (!newApps.find(existing => existing.id === a.id)) newApps.push(a);
                      });
                      return newApps;
                    });
                    return items.map(a => ({
                      value: a.id,
                      label: `📦 ${a.name} (${a.skills_count || (a.skill_names ? a.skill_names.length : 0)} skills)`
                    }));
                  }}
                  placeholder="Select Application..."
                />
              </div>

              {/* Section 3.5: Generative UI Model */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={12} color={prochatModel.trim() ? 'var(--primary-violet)' : 'var(--text-muted)'} />
                    Generative UI Model
                  </span>
                </label>
                <div style={{ position: 'relative', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={prochatModel}
                    onChange={(e) => setProchatModel(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: '0.82rem',
                      borderRadius: '8px',
                      border: `1px solid ${prochatModel.trim() ? 'rgba(139, 92, 246, 0.5)' : 'var(--border-subtle)'}`,
                      background: prochatModel.trim() ? 'rgba(139, 92, 246, 0.06)' : 'var(--bg-input)',
                      color: prochatModel.trim() ? 'var(--primary-violet)' : 'var(--text-sub)',
                      outline: 'none',
                      transition: 'all 0.2s',
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
                  {prochatModel.trim() && (
                    <button
                      onClick={() => setProchatModel('')}
                      title="Clear ProChat model"
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
                {prochatModel.trim() && (
                  <span style={{ fontSize: '0.71rem', color: 'var(--primary-violet)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={10} /> ProChat active · <code style={{ fontSize: '0.7rem' }}>{prochatModel}</code>
                  </span>
                )}
              </div>

              {/* Section 3.75: Skill Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                  Skill Filter (Optional)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px' }}>
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
                    const data = await skillsApi.list({ search: searchTerm || '', page_size: 30, page: 1, tenant_id: selectedTenantId || undefined });
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

              {/* Section 3.8: User Data Context */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                  User Data Context (Optional)
                </label>
                <div style={{ position: 'relative', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <AsyncSearchableDropdown
                      value={selectedTemplateId}
                      onChange={handleTemplateChange}
                      initialLabel={selectedTemplateId ? `📋 ${templates.find(t => t.id === selectedTemplateId)?.name || 'Loading Profile...'}` : ''}
                      fetchOptions={async (searchTerm) => {
                        const data = await userDataApi.list({ search: searchTerm || '', page_size: 20, page: 1, tenant_id: selectedTenantId || undefined });
                        const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                        setTemplates(prev => {
                          const newTs = [...prev];
                          items.forEach(t => {
                            if (!newTs.find(existing => existing.id === t.id)) newTs.push(t);
                          });
                          return newTs;
                        });
                        return items.map(t => ({
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
                    <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                          padding: '6px 8px',
                          color: 'var(--text-main)',
                          fontSize: '0.76rem',
                          outline: 'none'
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
                          padding: '6px 8px',
                          color: 'var(--text-main)',
                          fontSize: '0.76rem',
                          outline: 'none'
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
                          fontSize: '0.86rem',
                          padding: '2px'
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
                    style={{ padding: '4px 8px', fontSize: '0.72rem', alignSelf: 'flex-start' }}
                  >
                    + Add Pair
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }} />

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
