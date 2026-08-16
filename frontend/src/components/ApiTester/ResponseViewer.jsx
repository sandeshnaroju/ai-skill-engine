import React from 'react';
import { Check } from 'lucide-react';
import ProChat from 'prochat';

export default function ResponseViewer({
  activeTab,
  setActiveTab,
  messageHistory,
  renderMarkdown,
  consoleViewMode,
  setConsoleViewMode,
  logs,
  setLogs,
  streamContent,
  setStreamContent,
  streamReasoning,
  setStreamReasoning,
  streamTools,
  setStreamTools,
  loading,
  prochatUiJson,
  prochatUiCode,
  curlCommand,
  copiedKey,
  setCopiedKey
}) {
  return (
    <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Tabs header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: '16px', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'history' ? '2px solid var(--primary-cyan)' : '2px solid transparent',
            color: activeTab === 'history' ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: '600',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          Chat History
        </button>
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

      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto', maxHeight: '600px', paddingRight: '8px' }}>
          {messageHistory.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
              No chat history yet. Send a message to start building context.
            </div>
          ) : (
            messageHistory.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: msg.role === 'user' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-card)',
                  border: msg.role === 'user' ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.88rem'
                }}>
                  <div style={{ fontSize: '0.7rem', color: msg.role === 'user' ? 'var(--primary-violet)' : 'var(--primary-cyan)', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase' }}>
                    {msg.role}
                  </div>
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'response' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center' }}>
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
  );
}
