import React from 'react';
import { Bot, User, Brain, MessageSquare, Sparkles, Terminal, Code2, Copy, Check, FileText, ChevronUp, ChevronDown, Loader } from 'lucide-react';
import ProChat from 'prochat';

export default function MessageList({
  messages,
  expandedReasoning,
  setExpandedReasoning,
  copiedIdx,
  copyText
}) {
  const renderMarkdown = (src) => {
    if (!src) return '';
    let html = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    html = html.replace(codeBlockRegex, (match, lang, code) => {
      return `<pre class="code-block"><div class="code-header">${lang || 'code'}</div><code>${code.trim()}</code></pre>`;
    });

    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--primary-violet); text-decoration: underline; font-weight: 500;">$1</a>');
    
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');

    html = html.replace(/^\s*[-*+]\s+(.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

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

  const parseReasoning = (reasoning) => {
    if (Array.isArray(reasoning)) return reasoning;
    if (!reasoning || typeof reasoning !== 'string') return [];

    const blocks = reasoning.split('\n\n');
    const traces = [];

    blocks.forEach(block => {
      const trimmed = block.trim();
      if (trimmed.startsWith('💭')) {
        traces.push({ type: 'thought', content: trimmed.replace(/^💭\s*/, '') });
      } else if (trimmed.startsWith('🛠️')) {
        const lines = trimmed.split('\n');
        const title = lines[0].replace(/^🛠️\s*/, '');
        const argsLine = lines.slice(1).join('\n').replace(/^Args:\s*/, '');
        traces.push({ type: 'tool_call', name: title, arguments: argsLine });
      } else if (trimmed.startsWith('⚡')) {
        const lines = trimmed.split('\n');
        const title = lines[0].replace(/^⚡\s*/, '');
        let outputContent = lines.slice(1).join('\n').trim();
        if (outputContent.startsWith('Output:')) {
          outputContent = outputContent.substring(7).trim();
        }
        traces.push({ type: 'tool_result', title: title, output: outputContent || 'No stdout/stderr was produced.' });
      } else if (trimmed) {
        traces.push({ type: 'text', content: trimmed });
      }
    });

    return traces;
  };

  const renderMessageContent = (content) => {
    let textStr = '';
    let attachments = [];

    if (typeof content === 'string') {
      textStr = content;
    } else if (Array.isArray(content)) {
      const textBlock = content.find(block => block.type === 'text');
      if (textBlock) {
        textStr = textBlock.text;
      }
    }

    if (textStr) {
      const attachmentRegex = /\[Attached File:\s*([^\]]+?)\s*\(URL:\s*([^\)]+)\)\]/g;
      let match;
      while ((match = attachmentRegex.exec(textStr)) !== null) {
        attachments.push({
          name: match[1],
          url: match[2]
        });
      }
      textStr = textStr.replace(attachmentRegex, '').trim();
    }

    const renderTextContent = (txt) => {
      if (!txt) return null;
      return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(txt) }} />;
    };

    const renderAttachments = () => {
      if (attachments.length === 0) return null;
      return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {attachments.map((file, idx) => {
            const isImage = /\.(png|jpe?g|gif|webp|svg)/i.test(file.name);
            return (
              <a
                key={idx}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '6px 12px 6px 8px',
                  fontSize: '0.8rem',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: 'background 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              >
                {isImage ? (
                  <img src={file.url} alt={file.name} style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }} />
                ) : (
                  <FileText size={14} style={{ opacity: 0.8 }} />
                )}
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}>
                  {file.name}
                </span>
              </a>
            );
          })}
        </div>
      );
    };

    if (typeof content === 'string') {
      return (
        <div>
          {renderAttachments()}
          {renderTextContent(textStr)}
        </div>
      );
    }

    if (Array.isArray(content)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {renderAttachments()}
          {content.map((block, idx) => {
            if (block.type === 'text') {
              return renderTextContent(textStr);
            }
            if (block.type === 'image_url') {
              return (
                <img
                  key={idx}
                  src={block.image_url.url}
                  alt="Multimodal Attachment"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '260px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    marginTop: '4px'
                  }}
                />
              );
            }
            return null;
          })}
        </div>
      );
    }
    return '';
  };

  const renderAssistantContentBox = (m, idx) => {
    const isProchatActive = m.prochat_model || m.json || m.code;
    if (m.isStreaming && !m.content) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px 16px 16px 4px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)'
        }}>
          <Loader size={14} className="spin" /> Generating response...
        </div>
      );
    }

    return (
      <div
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text-main)',
          border: '1px solid var(--border-subtle)',
          padding: '12px 16px',
          borderRadius: '16px 16px 16px 4px',
          boxShadow: 'var(--shadow-card)',
          fontSize: '0.9rem',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          width: isProchatActive ? '100%' : 'auto',
          boxSizing: 'border-box'
        }}
      >
        {!isProchatActive && renderMessageContent(m.content)}
        {(() => {
          const hasUiChunk = m.json;
          if (!hasUiChunk) return null;
          return (
            <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', width: '100%', boxSizing: 'border-box' }}>
              <ProChat
                id={`prochat-${idx}`}
                json={(() => {
                  if (typeof m.json === 'string') {
                    return m.json;
                  }
                  if (m.json && typeof m.json === 'object') {
                    return JSON.stringify(m.json);
                  }
                  return null;
                })()}
                width={"100%"}
                debug={false}
              />
            </div>
          );
        })()}
      </div>
    );
  };

  const renderReasoningAccordion = (m, idx) => {
    const hasReasoning = Boolean(m.reasoning);
    const isProchatActive = m.prochat_model || m.json || m.code;
    if (!hasReasoning && !isProchatActive) return null;

    const isExpanded = m.isStreaming ? (expandedReasoning[idx] !== false) : expandedReasoning[idx];

    let headerText = isProchatActive ? 'Response Details & Reasoning' : 'Skill Engine Reasoning & Tool Traces';
    let icon = <Brain size={14} />;

    if (m.isStreaming) {
      const steps = parseReasoning(m.reasoning);
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (lastStep.type === 'thought') {
          const cleanThought = lastStep.content.replace(/^💭\s*/, '').trim();
          const truncated = cleanThought.length > 60 ? cleanThought.substring(0, 60) + '...' : cleanThought;
          headerText = `Agent Thinking: ${truncated}`;
        } else if (lastStep.type === 'tool_call') {
          headerText = `Invoking Tool: ${lastStep.name}`;
        } else if (lastStep.type === 'tool_result') {
          headerText = `Tool Executed: ${lastStep.title}`;
        }
      } else {
        headerText = 'Agent Processing...';
      }
      icon = <Loader size={14} className="spin" style={{ color: 'var(--primary-violet)' }} />;
    }

    return (
      <div style={{ background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '10px', overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>
        <button
          onClick={() => setExpandedReasoning(prev => ({ ...prev, [idx]: !isExpanded }))}
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
            {icon} {headerText}
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div style={{ padding: '16px', borderTop: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--bg-panel)', minWidth: 0, overflow: 'hidden' }}>
            {isProchatActive && m.content && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', borderBottom: hasReasoning ? '1px solid rgba(139, 92, 246, 0.15)' : 'none', paddingBottom: hasReasoning ? '14px' : '0', marginBottom: hasReasoning ? '14px' : '0' }}>
                <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '6px', borderRadius: '50%', color: 'var(--primary-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={13} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--primary-violet)', letterSpacing: '0.05em', marginBottom: '4px' }}>TEXT RESPONSE</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {renderMessageContent(m.content)}
                  </div>
                </div>
              </div>
            )}
            {parseReasoning(m.reasoning).map((step, sidx) => {
              if (step.type === 'thought') {
                return (
                  <div key={sidx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '6px', borderRadius: '50%', color: 'var(--primary-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={13} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--primary-violet)', letterSpacing: '0.05em', marginBottom: '2px' }}>AI THOUGHT</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: '1.5' }}>{step.content}</div>
                    </div>
                  </div>
                );
              }
              if (step.type === 'tool_call') {
                return (
                  <div key={sidx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '6px', borderRadius: '50%', color: 'var(--primary-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Terminal size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--primary-emerald)', letterSpacing: '0.05em', marginBottom: '2px' }}>TOOL INVOCATION</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: '600' }}>{step.name}</div>
                      {step.arguments && (
                        <pre style={{ margin: '6px 0 0 0', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.76rem', color: 'var(--text-sub)', overflowX: 'auto', fontFamily: 'var(--font-mono)', maxWidth: '100%', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {step.arguments}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              }
              if (step.type === 'tool_result') {
                return (
                  <div key={sidx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(245, 158, 11, 0.12)', padding: '6px', borderRadius: '50%', color: 'var(--primary-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Code2 size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--primary-amber)', letterSpacing: '0.05em', marginBottom: '2px' }}>EXECUTION LOGS ({step.title})</div>
                      <pre style={{ margin: '6px 0 0 0', padding: '10px 14px', background: '#0b0f19', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '0.76rem', color: '#38bdf8', overflowX: 'auto', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', maxWidth: '100%', wordBreak: 'break-all' }}>
                        {step.output}
                      </pre>
                    </div>
                  </div>
                );
              }
              return (
                <div key={sidx} style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                  {step.content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {messages.map((m, idx) => {
        const isUser = m.role === 'user';
        const isProchatActive = m.prochat_model || m.json || m.code;

        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '12px',
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              width: (!isUser && isProchatActive) ? '100%' : 'auto',
              minWidth: 0,
            }}
          >
            {!isUser && (
              <div style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '8px', borderRadius: '10px', height: 'fit-content' }}>
                <Bot size={16} color="var(--primary-violet)" />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', minWidth: 0 }}>
              {isUser ? (
                <div
                  style={{
                    background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))',
                    color: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: '16px 16px 4px 16px',
                    boxShadow: 'var(--shadow-card)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {renderMessageContent(m.content)}
                </div>
              ) : (
                <>
                  {renderReasoningAccordion(m, idx)}
                  {(!m.isStreaming || m.content) && renderAssistantContentBox(m, idx)}
                </>
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
    </div>
  );
}
