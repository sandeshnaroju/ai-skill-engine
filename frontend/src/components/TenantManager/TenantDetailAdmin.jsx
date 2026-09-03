import React, { useState } from 'react';
import { 
  ArrowLeft, Cpu, Gauge, Code, Key, Copy, Check, Eye, EyeOff, 
  Layers, Shield, Sparkles, Terminal, BookOpen, Clock
} from 'lucide-react';
import LlmConfigManager from './LlmConfigManager';
import TenantLimitsManager from './TenantLimitsManager';
import { useToast } from '../../context/ToastContext';

export default function TenantDetailAdmin({
  selectedTenant,
  onBack,
  tenantLlms,
  modelTotalItems,
  modelTotalPages,
  modelPage,
  setModelPage,
  fetchTenantLlms,
  fetchTenants
}) {
  const { showSuccess } = useToast();
  const [activeTab, setActiveTab] = useState('models'); // 'models' | 'quotas' | 'integration'
  const [showFullKey, setShowFullKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(null);

  const apiKey = selectedTenant?.api_key || '';
  const maskedKey = apiKey ? `${'•'.repeat(Math.max(0, apiKey.length - 6))}${apiKey.slice(-6)}` : 'YOUR_API_KEY';
  const primaryModel = tenantLlms?.[0]?.model_name || 'gemini-2.5-flash';

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    showSuccess(`${label} copied to clipboard`);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  // ── Code Snippets for Tab 3 ────────────────────────────────────────────────
  const snippetCurl = `curl -X POST http://localhost:8000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "model": "${primaryModel}",
    "session_id": "session_${selectedTenant?.id?.slice(0, 8) || 'user_101'}",
    "messages": [
      {"role": "user", "content": "What tools and skills do you have access to?"}
    ]
  }'`;

  const snippetPython = `from openai import OpenAI

# The AI Skill Engine gateway is 100% OpenAI API compatible
client = OpenAI(
    base_url="http://localhost:8000/api/v1",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="${primaryModel}",
    messages=[
        {"role": "user", "content": "Analyze our server uptime and run diagnostics."}
    ],
    extra_body={
        "session_id": "session_${selectedTenant?.id?.slice(0, 8) || 'client_user'}"
    }
)

print(response.choices[0].message.content)`;

  const snippetNode = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:8000/api/v1",
  apiKey: "${apiKey}",
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "${primaryModel}",
    messages: [
      { role: "user", content: "Analyze our server uptime and run diagnostics." }
    ],
    // Optional: Pass session_id for stateful thread memory
    session_id: "session_${selectedTenant?.id?.slice(0, 8) || 'client_user'}",
  });

  console.log(completion.choices[0].message.content);
}

main();`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '1280px', margin: '0 auto' }}>
      
      {/* ── Breadcrumb & Back Navigation ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          className="btn-outline"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            fontSize: '0.82rem',
            borderRadius: '9px',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> Back to All Tenants
        </button>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Workspace ID: <code style={{ color: 'var(--text-sub)' }}>{selectedTenant?.id}</code>
        </div>
      </div>

      {/* ── Top Header Card ──────────────────────────────────────────────── */}
      <div className="glass-box" style={{
        padding: '22px 26px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderRadius: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2))',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Cpu size={24} color="var(--primary-cyan)" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                {selectedTenant?.name}
              </h2>
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--primary-emerald)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontWeight: '700'
              }}>
                ACTIVE
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>
              Tenant Configuration, AI Gateway Models, Quotas & Integration Hub
            </p>
          </div>
        </div>

        {/* API Key Box */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--bg-input)',
          padding: '8px 14px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          <Key size={16} color="var(--primary-cyan)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tenant API Key:</span>
          <code style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-main)', letterSpacing: '0.5px' }}>
            {showFullKey ? apiKey : maskedKey}
          </code>
          <button
            type="button"
            onClick={() => setShowFullKey(!showFullKey)}
            className="btn-outline"
            title={showFullKey ? "Mask API Key" : "Reveal API Key"}
            style={{ padding: '4px 6px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            {showFullKey ? <EyeOff size={14} color="var(--text-muted)" /> : <Eye size={14} color="var(--text-muted)" />}
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(apiKey, 'API Key')}
            className="btn-outline"
            title="Copy API Key"
            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {copiedSnippet === 'API Key' ? <Check size={13} color="var(--primary-emerald)" /> : <Copy size={13} />}
            {copiedSnippet === 'API Key' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '8px'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('models')}
          className={`btn-outline ${activeTab === 'models' ? 'active' : ''}`}
          style={{
            padding: '9px 18px',
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '9px',
            background: activeTab === 'models' ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
            borderColor: activeTab === 'models' ? 'var(--primary-cyan)' : 'var(--border-subtle)',
            color: activeTab === 'models' ? 'var(--primary-cyan)' : 'var(--text-sub)',
            fontWeight: activeTab === 'models' ? '700' : '500',
            cursor: 'pointer'
          }}
        >
          <Cpu size={17} /> AI Models & Providers ({tenantLlms?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quotas')}
          className={`btn-outline ${activeTab === 'quotas' ? 'active' : ''}`}
          style={{
            padding: '9px 18px',
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '9px',
            background: activeTab === 'quotas' ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
            borderColor: activeTab === 'quotas' ? 'var(--primary-cyan)' : 'var(--border-subtle)',
            color: activeTab === 'quotas' ? 'var(--primary-cyan)' : 'var(--text-sub)',
            fontWeight: activeTab === 'quotas' ? '700' : '500',
            cursor: 'pointer'
          }}
        >
          <Gauge size={17} /> Quotas & Limits
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('integration')}
          className={`btn-outline ${activeTab === 'integration' ? 'active' : ''}`}
          style={{
            padding: '9px 18px',
            fontSize: '0.86rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '9px',
            background: activeTab === 'integration' ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
            borderColor: activeTab === 'integration' ? 'var(--primary-cyan)' : 'var(--border-subtle)',
            color: activeTab === 'integration' ? 'var(--primary-cyan)' : 'var(--text-sub)',
            fontWeight: activeTab === 'integration' ? '700' : '500',
            cursor: 'pointer'
          }}
        >
          <Code size={17} /> API Integration & Docs
        </button>
      </div>

      {/* ── TAB 1: AI Models & Providers ─────────────────────────────────── */}
      {activeTab === 'models' && (
        <div className="glass-box" style={{ padding: '24px', borderRadius: '16px' }}>
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
        </div>
      )}

      {/* ── TAB 2: Quotas & Limits ────────────────────────────────────────── */}
      {activeTab === 'quotas' && (
        <div className="glass-box" style={{ padding: '24px', borderRadius: '16px' }}>
          <TenantLimitsManager
            selectedTenant={selectedTenant}
            tenantLlms={tenantLlms}
            fetchTenants={fetchTenants}
          />
        </div>
      )}

      {/* ── TAB 3: API Integration & Developer Guide ──────────────────────── */}
      {activeTab === 'integration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Quick info banner */}
          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Terminal size={22} color="var(--primary-cyan)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.84rem', color: 'var(--text-sub)', lineHeight: '1.5' }}>
              <strong>OpenAI-Compatible Endpoint:</strong> AI Skill Engine serves standard <code style={{ color: 'var(--primary-cyan)' }}>/api/v1/chat/completions</code> endpoints. 
              Pass <code style={{ color: 'var(--primary-cyan)' }}>X-API-Key: {apiKey ? maskedKey : 'KEY'}</code> to route requests automatically to this tenant's configured models, skills, and sandboxes.
            </div>
          </div>

          {/* cURL Request */}
          <div className="glass-box" style={{ padding: '22px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={17} color="var(--primary-cyan)" />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  HTTP / cURL Request
                </h4>
              </div>
              <button
                className="btn-outline"
                onClick={() => copyToClipboard(snippetCurl, 'cURL')}
                style={{ padding: '5px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedSnippet === 'cURL' ? <Check size={13} color="var(--primary-emerald)" /> : <Copy size={13} />}
                {copiedSnippet === 'cURL' ? 'Copied Snippet!' : 'Copy cURL'}
              </button>
            </div>
            <pre className="code-display" style={{ fontSize: '0.78rem', padding: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>
              {snippetCurl}
            </pre>
          </div>

          {/* Python SDK */}
          <div className="glass-box" style={{ padding: '22px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code size={17} color="var(--primary-emerald)" />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Python (OpenAI SDK)
                </h4>
              </div>
              <button
                className="btn-outline"
                onClick={() => copyToClipboard(snippetPython, 'Python')}
                style={{ padding: '5px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedSnippet === 'Python' ? <Check size={13} color="var(--primary-emerald)" /> : <Copy size={13} />}
                {copiedSnippet === 'Python' ? 'Copied Python!' : 'Copy Python'}
              </button>
            </div>
            <pre className="code-display" style={{ fontSize: '0.78rem', padding: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>
              {snippetPython}
            </pre>
          </div>

          {/* Node.js SDK */}
          <div className="glass-box" style={{ padding: '22px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={17} color="#f59e0b" />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Node.js / TypeScript (OpenAI SDK)
                </h4>
              </div>
              <button
                className="btn-outline"
                onClick={() => copyToClipboard(snippetNode, 'Node')}
                style={{ padding: '5px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedSnippet === 'Node' ? <Check size={13} color="var(--primary-emerald)" /> : <Copy size={13} />}
                {copiedSnippet === 'Node' ? 'Copied Node.js!' : 'Copy Node.js'}
              </button>
            </div>
            <pre className="code-display" style={{ fontSize: '0.78rem', padding: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>
              {snippetNode}
            </pre>
          </div>

        </div>
      )}

    </div>
  );
}
