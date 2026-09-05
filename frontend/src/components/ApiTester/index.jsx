import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal, Send, Play, Copy, Check, Info, Cpu, Code2, ToggleLeft, ToggleRight, Database, X, FileText, ExternalLink } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import ProChat from 'prochat';
import Canvas from '../Canvas';
import RequestBuilder from './RequestBuilder';
import ResponseViewer from './ResponseViewer';
import { userDataApi, tenantsApi, appsApi, chatApi, apiClient } from '../../api';


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
  const [systemPrompt, setSystemPrompt] = useState('You are AI Skill Engine, an enterprise chatbot equipped with advanced tools and skills.');
  const [messageHistory, setMessageHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState(searchParams.has('message') ? (searchParams.get('message') ?? '') : 'Check disk space and system uptime');
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
    // If not in list (e.g. search result not in initial fetch), fetch by ID directly
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

  // File upload state for testing
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null); // null | { name, url, sandboxPath, type }
  const [attachMode, setAttachMode] = useState('text'); // 'text' | 'image'

  // Custom tenant models list
  const [tenantModels, setTenantModels] = useState([]);

  const [loading, setLoading] = useState(false);
  const abortControllerRef = React.useRef(null);
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState('response'); // 'request' or 'response'
  const [consoleViewMode, setConsoleViewMode] = useState('formatted'); // 'formatted' | 'raw'

  // Parsed real-time stream data
  const [streamContent, setStreamContent] = useState('');
  const [streamReasoning, setStreamReasoning] = useState([]);
  const [streamTools, setStreamTools] = useState([]);
  const [prochatUiJson, setProchatUiJson] = useState(null);
  const [prochatUiCode, setProchatUiCode] = useState('');

  // Interactive Document & Canvas state
  const [streamArtifacts, setStreamArtifacts] = useState([]);
  const [canvasArtifact, setCanvasArtifact] = useState(null);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);

  const handleOpenCanvas = (art) => {
    if (!art) return;
    let resolvedArt = { ...art };
    if (!resolvedArt.id && resolvedArt.artifact_id) {
      resolvedArt.id = resolvedArt.artifact_id;
    }
    if (!resolvedArt.id && resolvedArt.token && resolvedArt.token.includes('.')) {
      try {
        const rawB64 = resolvedArt.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
        const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
        const payload = JSON.parse(atob(padded));
        if (payload?.art) resolvedArt.id = payload.art;
      } catch (e) { }
    }
    setCanvasArtifact(resolvedArt);
    setIsCanvasOpen(true);
  };

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

    // 3. Markdown Tables
    const tableRegex = /((?:^[ \t]*\|.+?\|[ \t]*\r?\n)+(?:^[ \t]*\|[-:\s|]+?\|[ \t]*\r?\n)(?:^[ \t]*\|.+?\|[ \t]*\r?\n?)*)/gm;
    html = html.replace(tableRegex, (fullTable) => {
      const rows = fullTable.trim().split('\n').map(r => r.trim()).filter(Boolean);
      if (rows.length < 2) return fullTable;

      const parseCells = (rowStr) => {
        return rowStr
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => c.trim());
      };

      const headerCells = parseCells(rows[0]);
      const alignRow = parseCells(rows[1]);
      const alignments = alignRow.map(a => {
        if (/^:-+:$/.test(a)) return 'center';
        if (/^-+:$/.test(a)) return 'right';
        return 'left';
      });

      let thead = '<thead><tr>';
      headerCells.forEach((c, idx) => {
        const align = alignments[idx] || 'left';
        thead += `<th style="text-align: ${align}">${c}</th>`;
      });
      thead += '</tr></thead>';

      let tbody = '<tbody>';
      const dataRows = rows.slice(2);
      dataRows.forEach(r => {
        if (!r.includes('|')) return;
        const cells = parseCells(r);
        tbody += '<tr>';
        cells.forEach((c, idx) => {
          const align = alignments[idx] || 'left';
          tbody += `<td style="text-align: ${align}">${c}</td>`;
        });
        tbody += '</tr>';
      });
      tbody += '</tbody>';

      return `<div class="table-container"><table>${thead}${tbody}</table></div>`;
    });

    // 4. Parse Inline Code `code`
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

    // 5. Parse Bold **text** & Strikethrough ~~text~~
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 6. Parse Italic *text*
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 7. Parse Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary-cyan); text-decoration: underline; font-weight: 500;">$1</a>');

    // 8. Parse Headings (H1 to H6)
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');

    // 9. Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');

    // 10. Blockquotes
    html = html.replace(/^>\s*(.*?)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br />');

    // 11. Checklists & Task items
    html = html.replace(/^\s*[-*+]\s+\[ \]\s+(.*?)$/gm, '<li style="list-style: none;"><input type="checkbox" disabled style="width: auto; margin-right: 6px; display: inline-block;" />$1</li>');
    html = html.replace(/^\s*[-*+]\s+\[[xX]\]\s+(.*?)$/gm, '<li style="list-style: none;"><input type="checkbox" checked disabled style="width: auto; margin-right: 6px; display: inline-block;" />$1</li>');

    // 12. Parse Bullet lists
    html = html.replace(/^\s*[-*+]\s+(.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // 13. Convert newlines to breaks
    const paragraphs = html.split('\n\n').map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<li') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr')
      ) {
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

      const data = await apiClient.post('/api/v1/files/upload', formData, {
        apiKey: selectedTenantKey.trim() || undefined
      });
      setUploadedFile({
        name: file.name,
        url: data.url,
        sandboxPath: data.sandbox_path,
        type: file.type
      });
      logText(`File uploaded successfully! URL: ${data.url}`);
    } catch (err) {
      logText(`Upload exception: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const loadMetaData = async () => {
    try {
      const [tenantsData, appsData] = await Promise.all([
        tenantsApi.list(),
        appsApi.list()
      ]);

      const tenantsList = Array.isArray(tenantsData) ? tenantsData : (tenantsData.items || []);
      const appsList = appsData?.items || appsData || [];
      setTenants(tenantsList);
      setApps(appsList);

      // Auto-select first tenant if none selected
      let tenantIdToUse = selectedTenantId;
      if (tenantsList && tenantsList.length > 0 && !selectedTenantId) {
        tenantIdToUse = tenantsList[0].id;
        setSelectedTenantId(tenantIdToUse);
      }

      // Resolve key from selected/default tenant and load its models
      const activeT = tenantsList.find(t => t.id === tenantIdToUse) || tenantsList[0];
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
      const data = await tenantsApi.listLlms(key);
      const items = Array.isArray(data) ? data : (data.items || []);
      setTenantModels(items || []);
      const nonProchat = (items || []).filter(
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
    setStreamArtifacts([]);
    setProchatUiJson(null);
    setProchatUiCode('');

    const startTime = Date.now();

    logText(`Preparing API request to POST /api/v1/chat/completions`);
    setLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${selectedTenantKey.trim()}`,
      'X-Request-Source': 'api'
    };

    const finalMessages = [];
    if (systemPrompt.trim()) {
      finalMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    finalMessages.push(...messageHistory);

    let finalCurrentMessage = currentMessage;
    if (uploadedFile) {
      if (attachMode === 'text') {
        finalCurrentMessage = `[Attached File: ${uploadedFile.name} (URL: ${uploadedFile.url})]\n\n${currentMessage}`;
      } else if (attachMode === 'image') {
        finalCurrentMessage = [
          { type: 'text', text: currentMessage },
          { type: 'image_url', image_url: { url: uploadedFile.url } }
        ];
      }
    }
    finalMessages.push({ role: 'user', content: finalCurrentMessage });

    const payload = {
      messages: finalMessages,
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
      const res = await chatApi.createStream(payload, null, {
        apiKey: selectedTenantKey.trim() || null,
        source: 'api',
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text();
        logText(`HTTP Error: status ${res.status} - ${errorText}`);
        setLoading(false);
        return;
      }

      let turnArtifacts = [];

      if (stream) {
        logText(`Connection established. Listening to SSE Event Stream...`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let localStreamContent = '';

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
                        setStreamArtifacts([...turnArtifacts]);
                        setCanvasArtifact(turnArtifacts[turnArtifacts.length - 1]);
                      }
                    }
                    if (dataJson.choices && dataJson.choices[0] && dataJson.choices[0].delta) {
                      const delta = dataJson.choices[0].delta;
                      if (delta.reasoning) {
                        setStreamReasoning(prev => [...prev, delta.reasoning]);
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
                        setStreamArtifacts([...turnArtifacts]);
                        setCanvasArtifact(artInfo);
                      }
                      if (delta.tool_call) {
                        setStreamTools(prev => [...prev, { type: 'call', ...delta.tool_call }]);
                      }
                      if (delta.tool_result) {
                        setStreamTools(prev => [...prev, { type: 'result', ...delta.tool_result }]);
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
                          setStreamArtifacts([...turnArtifacts]);
                          setCanvasArtifact(artInfo);
                        }
                      }
                      if (delta.content) {
                        localStreamContent += delta.content;
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

        if (localStreamContent && localStreamContent.includes('/embed/canvas?token=')) {
          const globalRegex = /\/embed\/canvas\?token=([^\s)"']+)/g;
          let match;
          while ((match = globalRegex.exec(localStreamContent)) !== null) {
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
            setStreamArtifacts([...turnArtifacts]);
            setCanvasArtifact(turnArtifacts[turnArtifacts.length - 1]);
          }
        }

        setMessageHistory(prev => [
          ...prev,
          { role: 'user', content: currentMessage },
          {
            role: 'assistant',
            content: localStreamContent,
            artifacts: turnArtifacts,
            prochatUiJson: prochatUiJson,
            prochatUiCode: prochatUiCode
          }
        ]);
        setCurrentMessage('');

      } else {
        const data = await res.json();
        logText(`Response JSON:\n${JSON.stringify(data, null, 2)}`);

        const assistantMessage = data.choices?.[0]?.message;
        let nonStreamArtifacts = [];
        if (Array.isArray(assistantMessage?.artifacts) && assistantMessage.artifacts.length > 0) {
          nonStreamArtifacts = [...assistantMessage.artifacts];
        } else if (Array.isArray(data.artifacts) && data.artifacts.length > 0) {
          nonStreamArtifacts = [...data.artifacts];
        }
        if (nonStreamArtifacts.length === 0 && data.executed_tools) {
          data.executed_tools.forEach(t => {
            const a = t.artifact_data || t.artifact;
            if (a) nonStreamArtifacts.push(a);
          });
        }
        if (assistantMessage?.content && assistantMessage.content.includes('/embed/canvas?token=')) {
          const globalRegex = /\/embed\/canvas\?token=([^\s)"']+)/g;
          let match;
          while ((match = globalRegex.exec(assistantMessage.content)) !== null) {
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
            if (!nonStreamArtifacts.some(existing => (effId && existing.id === effId) || (existing.token && existing.token === tokenStr))) {
              nonStreamArtifacts.push(artInfo);
            }
          }
        }
        if (nonStreamArtifacts.length > 0) {
          nonStreamArtifacts.forEach(a => {
            if (!a.id && a.artifact_id) a.id = a.artifact_id;
          });
          setStreamArtifacts([...nonStreamArtifacts]);
          setCanvasArtifact(nonStreamArtifacts[nonStreamArtifacts.length - 1]);
        }

        if (assistantMessage) {
          setStreamContent(assistantMessage.content || '');
          if (assistantMessage.json) {
            setProchatUiJson(assistantMessage.json);
          }
          if (assistantMessage.code) {
            setProchatUiCode(assistantMessage.code);
          }

          setMessageHistory(prev => [
            ...prev,
            { role: 'user', content: currentMessage },
            {
              role: 'assistant',
              content: assistantMessage.content || '',
              artifacts: nonStreamArtifacts,
              prochatUiJson: assistantMessage.json,
              prochatUiCode: assistantMessage.code
            }
          ]);
          setCurrentMessage('');
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
      if (err.name === 'AbortError') {
        logText(`⚠️ Request execution stopped by user.`);
      } else {
        logText(`Network Exception: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Build current cURL command representation
  const finalMessagesForCurl = [];
  if (systemPrompt.trim()) {
    finalMessagesForCurl.push({ role: 'system', content: systemPrompt.trim() });
  }
  finalMessagesForCurl.push(...messageHistory);

  let finalCurrentMessageForCurl = currentMessage;
  if (uploadedFile) {
    if (attachMode === 'text') {
      finalCurrentMessageForCurl = `[Attached File: ${uploadedFile.name} (URL: ${uploadedFile.url})]\n\n${currentMessage}`;
    } else if (attachMode === 'image') {
      finalCurrentMessageForCurl = [
        { type: 'text', text: currentMessage },
        { type: 'image_url', image_url: { url: uploadedFile.url } }
      ];
    }
  }
  finalMessagesForCurl.push({ role: 'user', content: finalCurrentMessageForCurl });

  const userDataPayloadForCurl = getUserDataPayload();

  const requestPayload = {
    messages: finalMessagesForCurl,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>

      {/* Banner */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={22} color="var(--primary-cyan)" /> Developer API Client Tester
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '4px' }}>
            Directly execute raw HTTP requests against the `/api/v1/chat/completions` gateway endpoint to audit SSE events, payload schemas, and interactive document canvases.
          </p>
        </div>

        {/* Canvas Toggle / Re-open Button */}
        {canvasArtifact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn-outline"
              onClick={() => setIsCanvasOpen(!isCanvasOpen)}
              title={isCanvasOpen ? 'Collapse Document Canvas' : 'Re-open Document Canvas'}
              style={{
                padding: '8px 16px',
                fontSize: '0.84rem',
                borderColor: isCanvasOpen ? '#6366f1' : 'var(--border-subtle)',
                background: isCanvasOpen ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: isCanvasOpen ? '#a5b4fc' : 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={15} color="#818cf8" />
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
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="api-tester-grid">

        {/* Column 1: Config Form */}
        <RequestBuilder
          systemPrompt={systemPrompt}
          setSystemPrompt={setSystemPrompt}
          selectedTenantId={selectedTenantId}
          setSelectedTenantId={setSelectedTenantId}
          tenants={tenants}
          setTenants={setTenants}
          model={model}
          setModel={setModel}
          tenantModels={tenantModels}
          appId={appId}
          setAppId={setAppId}
          apps={apps}
          setApps={setApps}
          prochatModel={prochatModel}
          setProchatModel={setProchatModel}
          stream={stream}
          setStream={setStream}
          uploadedFile={uploadedFile}
          setUploadedFile={setUploadedFile}
          uploading={uploading}
          handleFileUpload={handleFileUpload}
          attachMode={attachMode}
          setAttachMode={setAttachMode}
          selectedSkillNames={selectedSkillNames}
          setSelectedSkillNames={setSelectedSkillNames}
          selectedTemplateId={selectedTemplateId}
          handleTemplateChange={handleTemplateChange}
          templates={templates}
          setTemplates={setTemplates}
          userDataPairs={userDataPairs}
          handleUserDataPairChange={handleUserDataPairChange}
          handleRemoveUserDataPair={handleRemoveUserDataPair}
          handleAddUserDataPair={handleAddUserDataPair}
          currentMessage={currentMessage}
          setCurrentMessage={setCurrentMessage}
          handleSend={handleSend}
          loading={loading}
          selectedTenantKey={selectedTenantKey}
          isPaused={false}
          togglePause={handleStop}
        />

        {/* Column 2: Request & Response Tabs */}
        <ResponseViewer
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          messageHistory={messageHistory}
          renderMarkdown={renderMarkdown}
          consoleViewMode={consoleViewMode}
          setConsoleViewMode={setConsoleViewMode}
          logs={logs}
          setLogs={setLogs}
          streamContent={streamContent}
          setStreamContent={setStreamContent}
          streamReasoning={streamReasoning}
          setStreamReasoning={setStreamReasoning}
          streamTools={streamTools}
          setStreamTools={setStreamTools}
          loading={loading}
          prochatUiJson={prochatUiJson}
          prochatUiCode={prochatUiCode}
          curlCommand={curlCommand}
          copiedKey={copiedKey}
          setCopiedKey={setCopiedKey}
          streamArtifacts={streamArtifacts}
          canvasArtifact={canvasArtifact}
          isCanvasOpen={isCanvasOpen}
          setIsCanvasOpen={setIsCanvasOpen}
          onOpenCanvas={handleOpenCanvas}
        />
      </div>



      {/* Slide-over Right Side Menu Bar / Drawer */}
      {canvasArtifact && (
        <>
          {/* Backdrop */}
          {isCanvasOpen && (
            <div
              onClick={() => setIsCanvasOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(3px)',
                zIndex: 9998,
                transition: 'opacity 0.25s ease'
              }}
            />
          )}

          {/* Right Side Drawer Container */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(720px, 94vw)',
              background: 'var(--bg-card, #0f172a)',
              borderLeft: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.65)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              transform: isCanvasOpen ? 'translateX(0)' : 'translateX(105%)',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              overflow: 'hidden'
            }}
          >
            {/* Right Drawer Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'rgba(255, 255, 255, 0.03)',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '7px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#818cf8',
                  flexShrink: 0
                }}>
                  <FileText size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontWeight: 650,
                    fontSize: '0.9rem',
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {canvasArtifact.title || 'Interactive Document'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>{(canvasArtifact.artifact_type || 'document').toUpperCase()}</span>
                    {canvasArtifact.current_version && <span> • v{canvasArtifact.current_version}</span>}
                    <span> • Right Side Menu Bar</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {canvasArtifact.embed_url && (
                  <a
                    href={canvasArtifact.embed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline"
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.76rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: 'var(--text-sub)',
                      borderRadius: '6px',
                      textDecoration: 'none'
                    }}
                    title="Open full page in new tab"
                  >
                    <ExternalLink size={13} />
                    <span>Full Tab</span>
                  </a>
                )}
                <button
                  onClick={() => setIsCanvasOpen(false)}
                  className="btn-outline"
                  style={{
                    padding: '6px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                  title="Close right side menu bar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Drawer Canvas Body */}
            <div style={{ flex: 1, width: '100%', maxWidth: '100%', boxSizing: 'border-box', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Canvas
                key={`${canvasArtifact.id}-${canvasArtifact.token || 'notoken'}`}
                isEmbed={true}
                artifactId={canvasArtifact.id}
                token={canvasArtifact.token}
                onClose={() => setIsCanvasOpen(false)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
