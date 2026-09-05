import React, { useRef, useEffect } from 'react';
import {
  Bot, User, Brain, MessageSquare, Sparkles, Terminal, Code2,
  Copy, Check, FileText, ChevronUp, ChevronDown, Loader, ExternalLink,
  Table, Presentation, Image, ArrowRight, Globe, Activity, FileSpreadsheet
} from 'lucide-react';
import ProChat from 'prochat';
import { parseMarkdownToHtml } from '../MarkdownViewer';

export default function MessageList({
  messages = [],
  expandedReasoning = {},
  setExpandedReasoning,
  copiedIdx,
  copyText,
  onOpenCanvas,
  activeCanvasArtifact,
  isCanvasOpen,
  onSelectPreset,
  presets = []
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const renderMarkdown = (src) => parseMarkdownToHtml(src, { linkColor: 'var(--primary-violet)' });

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

  const renderUserMessage = (content) => {
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

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: textStr ? '4px' : '0' }}>
            {attachments.map((file, idx) => {
              const isImage = /\.(png|jpe?g|gif|webp|svg)/i.test(file.name);
              return (
                <a
                  key={idx}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.18)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    color: '#ffffff',
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.28)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)'}
                >
                  {isImage ? (
                    <img src={file.url} alt={file.name} style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                  ) : (
                    <FileText size={15} color="#ffffff" />
                  )}
                  <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '600' }}>
                    {file.name}
                  </span>
                  <ExternalLink size={12} style={{ opacity: 0.8 }} />
                </a>
              );
            })}
          </div>
        )}
        {textStr && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textStr}</div>}
      </div>
    );
  };

  const defaultPresets = [
    {
      label: 'Dynamic Slides Presentation',
      icon: Presentation,
      desc: 'Create an engaging 5-slide deck with custom layouts & themes',
      text: 'Create a dynamic 5-slide presentation on "The Future of Autonomous AI Agents in Enterprise" with compelling visuals and statistics.'
    },
    {
      label: 'Python Math & Analytics Sandbox',
      icon: Code2,
      desc: 'Execute code in a secure sandbox to calculate compound returns',
      text: 'Calculate compound interest for $50,000 at 10.5% interest for 15 years in the Python sandbox and display a year-by-year summary table.'
    },
    {
      label: 'Create Interactive Document',
      icon: FileText,
      desc: 'Draft an executive project proposal with diagrams in Canvas',
      text: 'Draft a comprehensive project proposal document in Canvas with an Executive Summary, Architecture Overview, and Milestone Roadmap.'
    },
    {
      label: 'Server Diagnostics & Health',
      icon: Activity,
      desc: 'Check disk space, CPU load, and uptime using diagnostics skill',
      text: 'Check server uptime and disk space using the system_diagnostics skill.'
    }
  ];

  const activePresets = presets.length > 0 ? presets : defaultPresets;

  // -------------------------------------------------------------
  // HERO EMPTY STATE (When no messages yet)
  // -------------------------------------------------------------
  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        overflowY: 'auto'
      }}>
        <div style={{ maxWidth: '820px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>

          {/* Hero Greeting Avatar & Title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(139, 92, 246, 0.2)'
            }}>
              <Sparkles size={28} color="var(--primary-violet)" />
            </div>
            <div>
              <h2 style={{
                fontSize: '1.75rem',
                fontWeight: '700',
                letterSpacing: '-0.02em',
                color: 'var(--text-main)',
                margin: '0 0 6px 0'
              }}>
                How can I assist you today?
              </h2>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', margin: 0 }}>
                Generate dynamic slides, run secure Python code, draft canvas documents, or execute custom skills.
              </p>
            </div>
          </div>

          {/* 4 Bento Preset Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
            width: '100%'
          }}>
            {activePresets.map((p, idx) => {
              const Icon = p.icon || Sparkles;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectPreset && onSelectPreset(p.text)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '16px 18px',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--primary-violet)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.15)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <div style={{
                    background: 'rgba(139, 92, 246, 0.12)',
                    padding: '8px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={16} color="var(--primary-violet)" />
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-main)' }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    {p.desc || p.text.substring(0, 70) + '...'}
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MESSAGE STREAM (When messages exist)
  // -------------------------------------------------------------
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      padding: '24px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      <div style={{
        maxWidth: '840px',
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          const hasReasoning = m.reasoning && m.reasoning.trim().length > 0;
          const isReasoningOpen = !!expandedReasoning[idx];
          const hasArtifacts = Array.isArray(m.artifacts) && m.artifacts.length > 0;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '14px',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: isUser ? '85%' : '100%',
                width: isUser ? 'auto' : '100%',
                minWidth: 0
              }}
            >
              {/* Avatar */}
              {!isUser ? (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(99, 102, 241, 0.25))',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>
                  <Bot size={16} color="var(--primary-violet)" />
                </div>
              ) : null}

              {/* Message Content Column */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%',
                minWidth: 0
              }}>
                {/* USER BUBBLE */}
                {isUser ? (
                  <div style={{
                    background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))',
                    color: '#ffffff',
                    padding: '12px 18px',
                    borderRadius: '18px 18px 4px 18px',
                    fontSize: '0.92rem',
                    lineHeight: '1.6',
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.25)',
                    wordBreak: 'break-word'
                  }}>
                    {renderUserMessage(m.content)}
                  </div>
                ) : (
                  /* ASSISTANT CARD */
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    width: '100%',
                    minWidth: 0
                  }}>
                    {/* Collapsible Reasoning & Tools Pill */}
                    {hasReasoning && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(99, 102, 241, 0.03))',
                        border: '1px solid rgba(139, 92, 246, 0.22)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(139, 92, 246, 0.04)'
                      }}>
                        {(() => {
                          const steps = parseReasoning(m.reasoning);
                          const toolSteps = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result');
                          const lastTool = toolSteps.length > 0 ? toolSteps[toolSteps.length - 1] : null;
                          const lastThought = steps.filter(s => s.type === 'thought').slice(-1)[0];

                          let headerTitle = 'Thought Process & Tool Execution';
                          let latestStatusBadge = null;

                          if (m.isStreaming) {
                            if (lastTool?.type === 'tool_call') {
                              headerTitle = `Running: ${lastTool.name}`;
                              latestStatusBadge = 'Running';
                            } else if (lastTool?.type === 'tool_result') {
                              headerTitle = `Executed: ${lastTool.title}`;
                              latestStatusBadge = 'Executed';
                            } else if (lastThought?.content) {
                              const snippet = lastThought.content.length > 40 ? lastThought.content.substring(0, 40) + '...' : lastThought.content;
                              headerTitle = `Thinking: ${snippet}`;
                              latestStatusBadge = 'Thinking';
                            } else {
                              headerTitle = 'Analyzing & Executing Tools...';
                              latestStatusBadge = 'Active';
                            }
                          } else if (lastTool) {
                            const lastToolName = lastTool.name || lastTool.title;
                            headerTitle = `Used: ${lastToolName}`;
                            if (toolSteps.length > 1) {
                              latestStatusBadge = `${Math.ceil(toolSteps.length / 2)} tools used`;
                            }
                          }

                          return (
                            <button
                              type="button"
                              onClick={() => setExpandedReasoning(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '9px 14px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-main)',
                                fontSize: '0.8rem',
                                gap: '10px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                                <div className={m.isStreaming ? 'brain-badge-active' : ''} style={{
                                  background: 'rgba(139, 92, 246, 0.15)',
                                  borderRadius: '7px',
                                  padding: '5px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  <Brain
                                    size={15}
                                    color="var(--primary-violet)"
                                    className={m.isStreaming ? 'brain-anim-active' : ''}
                                  />
                                </div>
                                <span style={{
                                  fontWeight: '600',
                                  color: 'var(--primary-violet)',
                                  letterSpacing: '0.2px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  textAlign: 'left'
                                }}>
                                  {headerTitle}
                                </span>
                                {latestStatusBadge && (
                                  <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: '700',
                                    padding: '2px 7px',
                                    borderRadius: '10px',
                                    background: m.isStreaming ? 'rgba(16, 185, 129, 0.18)' : 'rgba(139, 92, 246, 0.14)',
                                    color: m.isStreaming ? 'var(--primary-emerald)' : 'var(--primary-violet)',
                                    border: `1px solid ${m.isStreaming ? 'rgba(16, 185, 129, 0.35)' : 'rgba(139, 92, 246, 0.25)'}`,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    flexShrink: 0
                                  }}>
                                    {latestStatusBadge}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--primary-violet)', opacity: 0.85, flexShrink: 0 }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: '500' }}>{isReasoningOpen ? 'Hide' : 'View traces'}</span>
                                {isReasoningOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>
                            </button>
                          );
                        })()}

                        {isReasoningOpen && (
                          <div style={{
                            padding: '14px 16px',
                            borderTop: '1px solid rgba(139, 92, 246, 0.15)',
                            background: 'rgba(139, 92, 246, 0.02)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}>
                            {parseReasoning(m.reasoning).map((step, sidx) => {
                              if (step.type === 'thought') {
                                return (
                                  <div key={sidx} style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(139, 92, 246, 0.06)',
                                    border: '1px solid rgba(139, 92, 246, 0.12)'
                                  }}>
                                    <Sparkles size={14} color="var(--primary-violet)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: '1.55' }}>
                                      {step.content}
                                    </div>
                                  </div>
                                );
                              }
                              if (step.type === 'tool_call') {
                                return (
                                  <div key={sidx} style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(16, 185, 129, 0.06)',
                                    border: '1px solid rgba(16, 185, 129, 0.18)'
                                  }}>
                                    <Terminal size={14} color="var(--primary-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontSize: '0.76rem', fontWeight: '700', color: 'var(--primary-emerald)' }}>
                                        {step.name}
                                      </span>
                                      {step.arguments && (
                                        <pre style={{
                                          margin: '6px 0 0 0',
                                          padding: '8px 12px',
                                          background: 'var(--bg-input)',
                                          border: '1px solid var(--border-subtle)',
                                          borderRadius: '8px',
                                          fontSize: '0.74rem',
                                          color: 'var(--text-main)',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-all'
                                        }}>
                                          {step.arguments}
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                              if (step.type === 'tool_result') {
                                return (
                                  <div key={sidx} style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(245, 158, 11, 0.06)',
                                    border: '1px solid rgba(245, 158, 11, 0.18)'
                                  }}>
                                    <Code2 size={14} color="var(--accent-amber)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontSize: '0.76rem', fontWeight: '700', color: 'var(--accent-amber)' }}>
                                        {step.title}
                                      </span>
                                      <pre style={{
                                        margin: '6px 0 0 0',
                                        padding: '10px 12px',
                                        background: 'var(--bg-input)',
                                        border: '1px solid rgba(245, 158, 11, 0.2)',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        color: 'var(--text-main)',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all'
                                      }}>
                                        {step.output}
                                      </pre>
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div key={sidx} style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                                  {step.content}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Main Assistant Markdown Body */}
                    {m.content && (
                      <div style={{
                        color: 'var(--text-main)',
                        fontSize: '0.92rem',
                        lineHeight: '1.65'
                      }}>
                        <div
                          className="markdown-body"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                        />
                      </div>
                    )}

                    {/* ProChat UI JSON/Code */}
                    {m.json && (
                      <div style={{ marginTop: '6px' }}>
                        <ProChat json={m.json} />
                      </div>
                    )}

                    {/* Generated Canvas Artifacts Card (Slides, Doc, Tables, Code) */}
                    {hasArtifacts && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '8px'
                      }}>
                        {m.artifacts.map((art, aidx) => {
                          const isCurrentActive = activeCanvasArtifact && ((art.id && activeCanvasArtifact.id === art.id) || (art.token && activeCanvasArtifact.token === art.token));
                          return (
                            <div
                              key={aidx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(99, 102, 241, 0.08))',
                                border: '1px solid rgba(139, 92, 246, 0.25)',
                                borderRadius: '12px',
                                gap: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  background: 'rgba(139, 92, 246, 0.2)',
                                  padding: '8px',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {art.artifact_type === 'presentation' || (art.title && art.title.toLowerCase().includes('slide')) ? (
                                    <Presentation size={18} color="var(--primary-violet)" />
                                  ) : art.artifact_type === 'spreadsheet' || (art.title && art.title.toLowerCase().includes('sheet')) ? (
                                    <FileSpreadsheet size={18} color="var(--primary-emerald)" />
                                  ) : (
                                    <FileText size={18} color="var(--primary-violet)" />
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                    {art.title || art.filename || 'Interactive Document'}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    {art.artifact_type ? `${art.artifact_type.toUpperCase()} · ` : ''}Canvas Ready
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                className="btn-gradient"
                                onClick={() => onOpenCanvas && onOpenCanvas(art)}
                                style={{
                                  padding: '7px 14px',
                                  fontSize: '0.8rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  borderRadius: '8px'
                                }}
                              >
                                <span>{isCurrentActive && isCanvasOpen ? 'Viewing in Canvas' : 'Open in Canvas'}</span>
                                <ExternalLink size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bottom Action Footer */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      paddingTop: '4px',
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)'
                    }}>
                      <button
                        type="button"
                        onClick={() => copyText(m.content, idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 4px'
                        }}
                      >
                        {copiedIdx === idx ? <Check size={13} color="var(--primary-emerald)" /> : <Copy size={13} />}
                        <span>{copiedIdx === idx ? 'Copied' : 'Copy'}</span>
                      </button>
                      <span>{m.timestamp}</span>
                    </div>

                  </div>
                )}
              </div>

              {/* User Avatar */}
              {isUser ? (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25))',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>
                  <User size={16} color="var(--primary-emerald)" />
                </div>
              ) : null}

            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
