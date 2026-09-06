import React from 'react';
import { Play, ToggleRight, ToggleLeft, X, Sliders, ChevronDown, ChevronUp, Sparkles, Info } from 'lucide-react';
import AsyncSearchableDropdown from '../AsyncSearchableDropdown';
import { userDataApi, tenantsApi, appsApi, skillsApi } from '../../api';

export default function RequestBuilder({
  systemPrompt,
  setSystemPrompt,
  selectedTenantId,
  setSelectedTenantId,
  tenants,
  setTenants,
  model,
  setModel,
  tenantModels,
  appId,
  setAppId,
  apps,
  setApps,
  prochatModel,
  setProchatModel,
  stream,
  setStream,
  uploadedFile,
  setUploadedFile,
  uploading,
  handleFileUpload,
  attachMode,
  setAttachMode,
  selectedSkillNames,
  setSelectedSkillNames,
  selectedTemplateId,
  handleTemplateChange,
  templates,
  setTemplates,
  userDataPairs,
  handleUserDataPairChange,
  handleRemoveUserDataPair,
  handleAddUserDataPair,
  currentMessage,
  setCurrentMessage,
  handleSend,
  loading,
  selectedTenantKey,
  isPaused,
  togglePause,
  // Completion Options Props
  paramsOpen,
  setParamsOpen,
  temperature,
  setTemperature,
  topP,
  setTopP,
  topK,
  setTopK,
  maxTokens,
  setMaxTokens,
  presencePenalty,
  setPresencePenalty,
  frequencyPenalty,
  setFrequencyPenalty,
  stopSequences,
  setStopSequences,
  seed,
  setSeed,
  responseFormat,
  setResponseFormat,
  toolChoice,
  setToolChoice,
  userParam,
  setUserParam,
  reasoningEffort,
  setReasoningEffort,
  thinkingBudget,
  setThinkingBudget,
  openrouterOrder,
  setOpenrouterOrder,
  openrouterDataCollection,
  setOpenrouterDataCollection,
  openrouterModels,
  setOpenrouterModels,
  extraBodyJson,
  setExtraBodyJson
}) {
  return (
    <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <h3 style={{ fontSize: '1.02rem', fontWeight: '600', color: 'var(--text-main)' }}>
        Request Configuration
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>System Prompt</label>
        <textarea
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="System prompt..."
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '10px', color: 'var(--text-main)',
            resize: 'vertical', fontSize: '0.88rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Auth Tenant Key</label>
        <div style={{ width: '100%' }}>
          <AsyncSearchableDropdown
            value={selectedTenantId}
            onChange={(val) => setSelectedTenantId(val)}
            initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `${tenants.find(t => t.id === selectedTenantId).name} (••••${(tenants.find(t => t.id === selectedTenantId).api_key || '').slice(-4)})` : ''}
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
                label: `${t.name} (••••${(t.api_key || '').slice(-4)})`
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
                const data = await tenantsApi.listLlms(selectedTenantKey, { search: searchTerm || '', page_size: 10, page: 1 });
                const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                return items
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
              <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>Multimodal Payload Mode</label>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="attachMode"
                    value="image"
                    checked={attachMode === 'image'}
                    onChange={() => setAttachMode('image')}
                  />
                  Vision (image_url)
                </label>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="attachMode"
                    value="audio"
                    checked={attachMode === 'audio'}
                    onChange={() => setAttachMode('audio')}
                  />
                  Audio (input_audio)
                </label>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="attachMode"
                    value="text"
                    checked={attachMode === 'text'}
                    onChange={() => setAttachMode('text')}
                  />
                  File URL in Text
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Model Parameters Accordion (OpenAI & Provider Specification) */}
      {(() => {
        const activeModelObj = tenantModels?.find(m => m.model_name === model);
        const rawProvider = (activeModelObj?.provider || '').toLowerCase();
        const mLower = (model || '').toLowerCase();
        const isGemini = rawProvider === 'gemini' || mLower.includes('gemini') || rawProvider === 'google';
        const isProChat = rawProvider === 'prochat' || mLower.includes('prochat') || mLower.startsWith('genui');
        const isOpenRouter = rawProvider === 'openrouter' || mLower.includes('openrouter') || model.includes('/');
        const isOpenAiReasoning = mLower.includes('o1') || mLower.includes('o3') || mLower.includes('o4');
        const isAnthropic = rawProvider === 'anthropic' || mLower.includes('claude');
        const isDeepSeek = rawProvider === 'deepseek' || mLower.includes('deepseek');

        return (
          <div style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
            overflow: 'hidden',
            transition: 'border-color 0.2s'
          }}>
            {/* Accordion Toggle Header */}
            <button
              type="button"
              onClick={() => setParamsOpen(!paramsOpen)}
              style={{
                width: '100%',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: paramsOpen ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-main)',
                transition: 'background 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={16} color="var(--primary-violet)" />
                <span style={{ fontSize: '0.84rem', fontWeight: '600' }}>Completion Parameters</span>
                {(isGemini || isProChat) && (
                  <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: '500' }}>
                    Gemini / ProChat
                  </span>
                )}
                {isOpenRouter && (
                  <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: '500' }}>
                    OpenRouter
                  </span>
                )}
                {isOpenAiReasoning && (
                  <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', fontWeight: '500' }}>
                    o1 / o3 Reasoning
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '0.72rem' }}>{paramsOpen ? 'Hide' : 'Configure'}</span>
                {paramsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {/* Accordion Body */}
            {paramsOpen && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                
                {/* Provider Note Badge */}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  lineHeight: '1.4',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isGemini || isProChat ? 'rgba(59, 130, 246, 0.08)' : (isOpenRouter ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)'),
                  border: `1px solid ${isGemini || isProChat ? 'rgba(59, 130, 246, 0.2)' : (isOpenRouter ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-subtle)')}`,
                  color: 'var(--text-sub)'
                }}>
                  <Info size={14} style={{ flexShrink: 0 }} />
                  <div>
                    {isGemini || isProChat ? (
                      <span><strong>Gemini & ProChat Mode:</strong> <code>temperature</code>, <code>top_p</code>, <code>max_tokens</code>, <code>stop</code>, and <code>response_format</code> are fully supported. Incompatible fields (penalties, seed, reasoning effort, stream_options) are automatically stripped to guarantee <code>200 OK</code>.</span>
                    ) : isOpenRouter ? (
                      <span><strong>OpenRouter Mode:</strong> Supports full OpenAI parameter set plus <code>top_k</code>, provider routing preferences, fallback models, and reasoning tokens.</span>
                    ) : isOpenAiReasoning ? (
                      <span><strong>Reasoning Model Mode:</strong> Configured for <code>max_completion_tokens</code> and <code>reasoning_effort</code>.</span>
                    ) : (
                      <span>Standard OpenAI Chat Completion specification. All values are validated and passed directly to the model endpoint.</span>
                    )}
                  </div>
                </div>

                {/* Grid 1: Temperature & Top P */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      <span>Temperature</span>
                      <span style={{ color: 'var(--primary-violet)' }}>{temperature !== '' ? temperature : 'default'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={temperature !== '' ? temperature : 0.7}
                        disabled={isOpenAiReasoning}
                        onChange={(e) => setTemperature(e.target.value)}
                        style={{ flex: 1, accentColor: 'var(--primary-violet)' }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        placeholder="default"
                        value={temperature}
                        disabled={isOpenAiReasoning}
                        onChange={(e) => setTemperature(e.target.value)}
                        style={{ width: '60px', padding: '4px 6px', fontSize: '0.76rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', textAlign: 'center' }}
                      />
                    </div>
                    {isOpenAiReasoning && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Fixed by reasoning model</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      <span>Top P (Nucleus Sampling)</span>
                      <span style={{ color: 'var(--primary-violet)' }}>{topP !== '' ? topP : 'default'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={topP !== '' ? topP : 1.0}
                        onChange={(e) => setTopP(e.target.value)}
                        style={{ flex: 1, accentColor: 'var(--primary-violet)' }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        placeholder="default"
                        value={topP}
                        onChange={(e) => setTopP(e.target.value)}
                        style={{ width: '60px', padding: '4px 6px', fontSize: '0.76rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', textAlign: 'center' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Grid 2: Max Tokens & Response Format */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      {isOpenAiReasoning ? 'Max Completion Tokens' : 'Max Tokens'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 2048, 4096 (unlimited if empty)"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Response Format</label>
                    <select
                      value={responseFormat}
                      onChange={(e) => setResponseFormat(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      <option value="text">Default (Text Output)</option>
                      <option value="json_object">JSON Object (Structured Output)</option>
                    </select>
                  </div>
                </div>

                {/* Grid 3: Reasoning Effort & Thinking Budget */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Reasoning Effort</label>
                      {(isGemini || isProChat) && (
                        <span style={{ fontSize: '0.66rem', color: '#60a5fa' }}>Supported (Gemini 3.x / 2.5)</span>
                      )}
                    </div>
                    <select
                      value={reasoningEffort}
                      onChange={(e) => setReasoningEffort(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      <option value="">Default (Provider Decision)</option>
                      <option value="none">None (Disable Thinking)</option>
                      <option value="minimal">Minimal (Gemini 3 Flash / Flash-Lite)</option>
                      <option value="low">Low (Faster, brief reasoning)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (Deep reasoning / reflection)</option>
                      <option value="xhigh">Extra High (xAI Grok / OpenAI)</option>
                      <option value="max">Max (Maximum effort - DeepSeek / OpenRouter)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      Thinking Token Budget
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 2000 (Anthropic / OpenRouter)"
                      value={thinkingBudget}
                      onChange={(e) => setThinkingBudget(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>
                </div>

                {/* Grid 4: Tool Choice & Seed */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Tool Choice Policy</label>
                    <select
                      value={toolChoice}
                      onChange={(e) => setToolChoice(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      <option value="auto">auto (LLM calls tools if needed)</option>
                      <option value="required">required (LLM must invoke a tool)</option>
                      <option value="none">none (LLM cannot call tools)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Seed (Deterministic Reproducibility)</label>
                    <input
                      type="number"
                      placeholder="e.g. 42 (blank for random)"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>
                </div>

                {/* Grid 5: Penalties (Presence & Frequency) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', opacity: (isGemini || isProChat) ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      <span>Presence Penalty (-2.0 to 2.0)</span>
                      <span style={{ color: 'var(--primary-violet)' }}>{presencePenalty !== '' ? presencePenalty : '0.0'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.1"
                        value={presencePenalty !== '' ? presencePenalty : 0}
                        disabled={isGemini || isProChat}
                        onChange={(e) => setPresencePenalty(e.target.value)}
                        style={{ flex: 1, accentColor: 'var(--primary-violet)' }}
                      />
                      <input
                        type="number"
                        min="-2"
                        max="2"
                        step="0.1"
                        placeholder="0.0"
                        value={presencePenalty}
                        disabled={isGemini || isProChat}
                        onChange={(e) => setPresencePenalty(e.target.value)}
                        style={{ width: '55px', padding: '4px 6px', fontSize: '0.76rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', textAlign: 'center' }}
                      />
                    </div>
                    {(isGemini || isProChat) && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Omitted on Gemini / ProChat</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', opacity: (isGemini || isProChat) ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>
                      <span>Frequency Penalty (-2.0 to 2.0)</span>
                      <span style={{ color: 'var(--primary-violet)' }}>{frequencyPenalty !== '' ? frequencyPenalty : '0.0'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.1"
                        value={frequencyPenalty !== '' ? frequencyPenalty : 0}
                        disabled={isGemini || isProChat}
                        onChange={(e) => setFrequencyPenalty(e.target.value)}
                        style={{ flex: 1, accentColor: 'var(--primary-violet)' }}
                      />
                      <input
                        type="number"
                        min="-2"
                        max="2"
                        step="0.1"
                        placeholder="0.0"
                        value={frequencyPenalty}
                        disabled={isGemini || isProChat}
                        onChange={(e) => setFrequencyPenalty(e.target.value)}
                        style={{ width: '55px', padding: '4px 6px', fontSize: '0.76rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', textAlign: 'center' }}
                      />
                    </div>
                    {(isGemini || isProChat) && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Omitted on Gemini / ProChat</span>}
                  </div>
                </div>

                {/* Stop Sequences & User ID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Stop Sequences (Comma Separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. ###, END_CONV, STOP"
                      value={stopSequences}
                      onChange={(e) => setStopSequences(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>User Identifier (Audit & Abuse Tracking)</label>
                    <input
                      type="text"
                      placeholder="e.g. user_session_4920"
                      value={userParam}
                      onChange={(e) => setUserParam(e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.8rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>
                </div>

                {/* OpenRouter / Anthropic Specific: Top K & Routing Preferences */}
                {(isOpenRouter || isAnthropic) && (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: '700', color: 'var(--primary-emerald)' }}>
                      ⚡ {isOpenRouter ? 'OpenRouter Routing & Sampling' : 'Anthropic Sampling'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-sub)', fontWeight: '600' }}>Top K</label>
                        <input
                          type="number"
                          placeholder="e.g. 40"
                          value={topK}
                          onChange={(e) => setTopK(e.target.value)}
                          style={{ padding: '6px 8px', fontSize: '0.78rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                        />
                      </div>

                      {isOpenRouter && (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-sub)', fontWeight: '600' }}>Data Collection</label>
                            <select
                              value={openrouterDataCollection}
                              onChange={(e) => setOpenrouterDataCollection(e.target.value)}
                              style={{ padding: '6px 8px', fontSize: '0.78rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                            >
                              <option value="">Default (Provider policy)</option>
                              <option value="allow">Allow data collection</option>
                              <option value="deny">Deny data collection</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-sub)', fontWeight: '600' }}>Provider Order (Comma-separated)</label>
                            <input
                              type="text"
                              placeholder="e.g. Anthropic, Together, DeepInfra"
                              value={openrouterOrder}
                              onChange={(e) => setOpenrouterOrder(e.target.value)}
                              style={{ padding: '6px 8px', fontSize: '0.78rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-sub)', fontWeight: '600' }}>Fallback Models (Comma-separated)</label>
                            <input
                              type="text"
                              placeholder="e.g. openai/gpt-4o-mini, meta-llama/llama-3.1-70b-instruct"
                              value={openrouterModels}
                              onChange={(e) => setOpenrouterModels(e.target.value)}
                              style={{ padding: '6px 8px', fontSize: '0.78rem', borderRadius: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Advanced Extra Body (Raw JSON) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', fontWeight: '600' }}>Custom Extra Body (JSON)</label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Raw payload overlay</span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder='{"transforms": ["middle-out"], "custom_header": "value"}'
                    value={extraBodyJson}
                    onChange={(e) => setExtraBodyJson(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      borderRadius: '6px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      resize: 'vertical'
                    }}
                  />
                </div>

              </div>
            )}
          </div>
        );
      })()}

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
            const data = await skillsApi.list({ search: searchTerm || '', page_size: 30, page: 1 });
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>User Message</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn-outline"
              style={{ fontSize: '0.7rem', padding: '2px 8px' }}
              onClick={() => {
                setCurrentMessage('Create a project roadmap document in Canvas with sections for Executive Summary, Tech Architecture, and Financial Projections.');
                if (!selectedSkillNames.includes('artifact_editor')) {
                  setSelectedSkillNames(prev => [...prev, 'artifact_editor']);
                }
              }}
            >
              📄 Create Canvas Doc
            </button>
            <button
              type="button"
              className="btn-outline"
              style={{ fontSize: '0.7rem', padding: '2px 8px' }}
              onClick={() => {
                setCurrentMessage('Update the Financial Projections section in the active canvas document to include 2028 growth estimates.');
                if (!selectedSkillNames.includes('artifact_editor')) {
                  setSelectedSkillNames(prev => [...prev, 'artifact_editor']);
                }
              }}
            >
              ✏️ Edit Canvas Section
            </button>
          </div>
        </div>
        <textarea
          rows={4}
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder="Enter your next message here..."
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '10px', color: 'var(--text-main)',
            resize: 'vertical', fontSize: '0.88rem'
          }}
        />
      </div>

      <button
        className={loading ? "btn-outline" : "btn-gradient"}
        onClick={loading ? togglePause : handleSend}
        disabled={(!loading && !selectedTenantKey) || uploading}
        style={{
          width: '100%',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          ...(loading && {
            color: 'var(--accent-rose)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            background: 'rgba(244, 63, 94, 0.06)'
          })
        }}
      >
        {loading ? <X size={16} /> : <Play size={16} />}
        {loading ? 'Stop Execution' : 'Execute Request'}
      </button>
    </div>
  );
}
