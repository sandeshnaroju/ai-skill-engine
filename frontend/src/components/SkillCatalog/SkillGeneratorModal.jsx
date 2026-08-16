import React from 'react';
import { Cpu, X, Plus, Trash2 } from 'lucide-react';

export default function SkillGeneratorModal({
  showGenModal,
  setShowGenModal,
  genStep,
  setGenStep,
  genModels,
  genModelIndex,
  setGenModelIndex,
  genName,
  setGenName,
  genDesc,
  setGenDesc,
  genApiCalls,
  setGenApiCalls,
  handleAddApiCall,
  handleRemoveApiCall,
  handleApiFieldChange,
  handleAddKeyValue,
  handleRemoveKeyValue,
  handleKeyValueChange,
  genInputsSecrets,
  setGenInputsSecrets,
  genBehavior,
  setGenBehavior,
  generating,
  handleGenerateSkill
}) {
  if (!showGenModal) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '960px', width: '98%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="var(--primary-cyan)" /> Interactive Skill Generator
          </h3>
          <button className="btn-outline" onClick={() => setShowGenModal(false)} style={{ padding: '6px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px' }}>
          {['1. Select Model', '2. Core Details', '3. Actions', '4. Behavior'].map((label, idx) => (
            <span
              key={idx}
              style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                color: genStep === idx + 1 ? 'var(--primary-cyan)' : 'var(--text-muted)'
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Step 1: Model Selection */}
        {genStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Select Tenant & Model</label>
              {genModels.length === 0 ? (
                <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '0.86rem', color: 'var(--accent-rose)' }}>
                  No active models found. Please configure a Model under **Tenants & Keys** first.
                </div>
              ) : (
                <select
                  value={genModelIndex}
                  onChange={(e) => setGenModelIndex(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)' }}
                >
                  {genModels.map((m, idx) => (
                    <option key={idx} value={idx}>
                      🔑 {m.tenant_name} — {m.model_name} ({m.provider})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-outline" onClick={() => setShowGenModal(false)}>Cancel</button>
              <button type="button" className="btn-gradient" disabled={genModels.length === 0} onClick={() => setGenStep(2)}>Next Step</button>
            </div>
          </div>
        )}

        {/* Step 2: Core Details */}
        {genStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Skill Name</label>
              <input
                type="text"
                placeholder="e.g. check_weather"
                value={genName}
                onChange={(e) => setGenName(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Description (What does it do?)</label>
              <textarea
                placeholder="e.g. Fetches current weather reports and forecasts for a location."
                value={genDesc}
                onChange={(e) => setGenDesc(e.target.value)}
                style={{ height: '80px', resize: 'none' }}
              />
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-outline" onClick={() => setGenStep(1)}>Back</button>
              <button type="button" className="btn-gradient" disabled={!genName.trim()} onClick={() => setGenStep(3)}>Next Step</button>
            </div>
          </div>
        )}

        {/* Step 3: Tooling requirements */}
        {genStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-sub)' }}>API Calls / Tools</span>
              <button type="button" className="btn-outline" onClick={handleAddApiCall} style={{ padding: '4px 10px', fontSize: '0.76rem' }}>
                <Plus size={12} /> Add API Call
              </button>
            </div>

            {genApiCalls.length === 0 ? (
              <div style={{ padding: '16px', border: '1px dashed var(--border-subtle)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                No API calls added yet. Click "Add API Call" to register HTTP tools for this skill.
              </div>
            ) : (
              genApiCalls.map((api, apiIdx) => (
                <div key={apiIdx} style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--primary-cyan)' }}>API Call #{apiIdx + 1}</span>
                    <button type="button" className="btn-outline" onClick={() => handleRemoveApiCall(apiIdx)} style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      value={api.method}
                      onChange={(e) => handleApiFieldChange(apiIdx, 'method', e.target.value)}
                      style={{ width: '100px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}
                    >
                      <option>GET</option>
                      <option>POST</option>
                      <option>PUT</option>
                      <option>DELETE</option>
                    </select>
                    <input
                      type="text"
                      placeholder="https://api.example.com/endpoint"
                      value={api.url}
                      onChange={(e) => handleApiFieldChange(apiIdx, 'url', e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>

                  {/* Headers Key-Value list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Headers (e.g. Content-Type, Authorization)</span>
                      <button type="button" onClick={() => handleAddKeyValue(apiIdx, 'headers')} style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}>
                        + Add Header
                      </button>
                    </div>
                    {(api.headers || []).map((kv, kvIdx) => (
                      <div key={kvIdx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Header Key"
                          value={kv.key}
                          onChange={(e) => handleKeyValueChange(apiIdx, 'headers', kvIdx, 'key', e.target.value)}
                          list="common-headers"
                          style={{ flex: 1, padding: '8px 12px', fontSize: '0.84rem' }}
                        />
                        <datalist id="common-headers">
                          <option value="Authorization" />
                          <option value="Content-Type" />
                          <option value="Accept" />
                          <option value="User-Agent" />
                          <option value="X-API-Key" />
                          <option value="Cache-Control" />
                          <option value="Origin" />
                        </datalist>
                        <input
                          type="text"
                          placeholder="Value (or {{user_data.my_secret}})"
                          value={kv.value}
                          onChange={(e) => handleKeyValueChange(apiIdx, 'headers', kvIdx, 'value', e.target.value)}
                          style={{ flex: 2, padding: '8px 12px', fontSize: '0.84rem' }}
                        />
                        <button type="button" onClick={() => handleRemoveKeyValue(apiIdx, 'headers', kvIdx)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '4px' }}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Query Parameters Key-Value list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Query Parameters (e.g. units, api_key)</span>
                      <button type="button" onClick={() => handleAddKeyValue(apiIdx, 'query_params')} style={{ background: 'none', border: 'none', color: 'var(--primary-cyan)', fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}>
                        + Add Query Param
                      </button>
                    </div>
                    {(api.query_params || []).map((kv, kvIdx) => (
                      <div key={kvIdx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Param Key"
                          value={kv.key}
                          onChange={(e) => handleKeyValueChange(apiIdx, 'query_params', kvIdx, 'key', e.target.value)}
                          style={{ flex: 1, padding: '8px 12px', fontSize: '0.84rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Value (or {{user_data.my_secret}})"
                          value={kv.value}
                          onChange={(e) => handleKeyValueChange(apiIdx, 'query_params', kvIdx, 'value', e.target.value)}
                          style={{ flex: 2, padding: '8px 12px', fontSize: '0.84rem' }}
                        />
                        <button type="button" onClick={() => handleRemoveKeyValue(apiIdx, 'query_params', kvIdx)} style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', cursor: 'pointer', padding: '4px' }}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Body payload (for POST/PUT etc) */}
                  {['POST', 'PUT', 'PATCH', 'DELETE'].includes(api.method) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: '600' }}>Request Body / Payload description</span>
                      <textarea
                        placeholder="JSON structure or parameters for the API call"
                        value={api.body || ''}
                        onChange={(e) => handleApiFieldChange(apiIdx, 'body', e.target.value)}
                        style={{ height: '50px', resize: 'none', fontSize: '0.78rem' }}
                      />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Inputs & Secrets mapping */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Credentials/Secrets needed (Optional)</label>
              <input
                type="text"
                placeholder="e.g. openweathermap_api_key, bearer_token (from user_data)"
                value={genInputsSecrets}
                onChange={(e) => setGenInputsSecrets(e.target.value)}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-outline" onClick={() => setGenStep(2)}>Back</button>
              <button type="button" className="btn-gradient" onClick={() => setGenStep(4)}>Next Step</button>
            </div>
          </div>
        )}

        {/* Step 4: Behavior Rules & Generate */}
        {genStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Behavior & Performance Rules</label>
              <textarea
                placeholder="Describe how the skill behaves (e.g. If the API returns celsius, convert it to fahrenheit before answering the user. If request fails, explain why elegantly.)"
                value={genBehavior}
                onChange={(e) => setGenBehavior(e.target.value)}
                style={{ height: '140px', resize: 'none' }}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-outline" onClick={() => setGenStep(3)}>Back</button>
              <button
                type="button"
                className="btn-gradient"
                disabled={generating}
                onClick={handleGenerateSkill}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {generating ? 'Generating...' : 'Generate Skill Code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
