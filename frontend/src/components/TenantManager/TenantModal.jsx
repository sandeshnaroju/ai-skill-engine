import React, { useState } from 'react';
import { Cpu, X, Code } from 'lucide-react';
import LlmConfigManager from './LlmConfigManager';

export default function TenantModal({
  selectedTenant,
  setShowManageModal,
  setSelectedTenant,
  tenantLlms,
  modelTotalItems,
  modelTotalPages,
  modelPage,
  setModelPage,
  fetchTenantLlms,
  fetchTenants
}) {
  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const snippetCurl = `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${selectedTenant ? `${'•'.repeat(Math.max(0, (selectedTenant.api_key || '').length - 4))}${(selectedTenant.api_key || '').slice(-4)}` : 'YOUR_TENANT_API_KEY'}" \\
  -d '{
    "messages": [{"role": "user", "content": "Check server uptime"}],
    "session_id": "chatbot_user_101",
    "model": "${tenantLlms[0]?.model_name || 'gemini-2.5-flash'}"
  }'`;

  return (
    <div className="modal-overlay" onClick={() => { setShowManageModal(false); setSelectedTenant(null); }}>
      <div className="modal-box" style={{ maxWidth: '960px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={22} color="var(--primary-cyan)" /> Tenant Settings: {selectedTenant.name}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>
              Manage dynamic LLM configurations and integrate API connections for this tenant.
            </p>
          </div>
          <button className="btn-outline" onClick={() => { setShowManageModal(false); setSelectedTenant(null); }} style={{ padding: '6px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          
          {/* Left Column: LLM Configurations Manager */}
          <LlmConfigManager 
            selectedTenant={selectedTenant}
            tenantLlms={tenantLlms}
            modelTotalItems={modelTotalItems}
            modelTotalPages={modelTotalPages}
            modelPage={modelPage}
            setModelPage={setModelPage}
            fetchTenantLlms={fetchTenantLlms}
            fetchTenants={fetchTenants}
          />

          {/* Right Column: API Integration Snippet & Live Tester */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--bg-input)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code size={15} color="var(--primary-cyan)" /> Integration Snippet
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Use the following cURL connection to send requests directly from your customer application using this tenant key:
              </p>
              <pre className="code-display" style={{ fontSize: '0.76rem', margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                {snippetCurl}
              </pre>
              <button
                className="btn-outline"
                onClick={() => copyToClipboard(snippetCurl)}
                style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '0.78rem' }}
              >
                {copiedKey === snippetCurl ? 'Copied Snippet!' : 'Copy Integration cURL'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
