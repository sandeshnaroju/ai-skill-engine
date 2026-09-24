import React, { useState, useRef, useEffect } from 'react';
import {
  Bot, User, Brain, MessageSquare, Sparkles, Terminal, Code2,
  Copy, Check, FileText, ChevronUp, ChevronDown, ChevronRight, Loader, ExternalLink,
  Table, Presentation, Image, Video, ArrowRight, Globe, Activity, FileSpreadsheet
} from 'lucide-react';
import ProChat from 'prochat';
import { parseMarkdownToHtml } from '../MarkdownViewer';

// Helper to extract a short preview snippet from tool arguments
const getToolSummaryPreview = (args) => {
  if (!args) return '';
  let obj = args;
  if (typeof args === 'string') {
    try { obj = JSON.parse(args); } catch { return args.length > 50 ? args.substring(0, 50) + '…' : args; }
  }
  if (typeof obj !== 'object' || obj === null) return String(obj);

  const keys = Object.keys(obj);
  if (keys.length === 0) return '';

  const priorityKeys = ['subject', 'to', 'recipient', 'query', 'prompt', 'code', 'command', 'path', 'url', 'filename', 'title', 'id'];
  const matchedKey = priorityKeys.find(k => obj[k] !== undefined) || keys[0];
  const val = typeof obj[matchedKey] === 'object' ? JSON.stringify(obj[matchedKey]) : String(obj[matchedKey]);
  const cleanVal = val.replace(/\n/g, ' ').substring(0, 40);
  return `${matchedKey}: "${cleanVal}${val.length > 40 ? '…' : ''}"`;
};

// Groups sequential tool_call and tool_result pairs into single interactive tool items
const groupReasoningSteps = (rawSteps) => {
  const grouped = [];
  let pendingTool = null;

  rawSteps.forEach(step => {
    if (step.type === 'tool_call') {
      if (pendingTool) {
        grouped.push(pendingTool);
      }
      pendingTool = {
        type: 'tool_execution',
        name: step.name,
        arguments: step.arguments,
        output: null,
        exit_code: null,
        execution_time_ms: null,
        isCompleted: false
      };
    } else if (step.type === 'tool_result') {
      if (pendingTool && (pendingTool.name === step.name || !pendingTool.output)) {
        pendingTool.output = step.output;
        pendingTool.exit_code = step.exit_code;
        pendingTool.execution_time_ms = step.execution_time_ms;
        pendingTool.isCompleted = true;
        grouped.push(pendingTool);
        pendingTool = null;
      } else {
        grouped.push({
          type: 'tool_execution',
          name: step.name || 'Tool Result',
          arguments: null,
          output: step.output,
          exit_code: step.exit_code,
          execution_time_ms: step.execution_time_ms,
          isCompleted: true
        });
      }
    } else {
      if (pendingTool) {
        grouped.push(pendingTool);
        pendingTool = null;
      }
      grouped.push(step);
    }
  });

  if (pendingTool) {
    grouped.push(pendingTool);
  }

  return grouped;
};

// ChatGPT-style Reasoning Section with interactive tool call headings and nested detail drawers
function ReasoningSection({
  reasoning,
  isStreaming,
  isOpen,
  onToggle,
  onCopy
}) {
  const [expandedTools, setExpandedTools] = useState({});

  const parseReasoning = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== 'string') return [];
    if (raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* fallback */ }
    }
    const blocks = raw.split('\n\n');
    const traces = [];
    blocks.forEach(block => {
      const trimmed = block.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('🛠️')) {
        const lines = trimmed.split('\n');
        const title = lines[0].replace(/^🛠️\s*/, '');
        const argsLine = lines.slice(1).join('\n').replace(/^Args:\s*/, '');
        traces.push({ type: 'tool_call', name: title, arguments: argsLine });
      } else if (trimmed.startsWith('⚡')) {
        const lines = trimmed.split('\n');
        const title = lines[0].replace(/^⚡\s*/, '');
        let outputContent = lines.slice(1).join('\n').trim();
        if (outputContent.startsWith('Output:')) outputContent = outputContent.substring(7).trim();
        traces.push({ type: 'tool_result', name: title, output: outputContent || 'No output.' });
      } else {
        const textContent = trimmed.replace(/^💭\s*/, '').trim();
        const isTurnNotice = /turn\s*\d+|analyzing|synthesizing|invoking|planning|processing tool|query execution|active skills/i.test(textContent);
        traces.push(isTurnNotice ? { type: 'phase_notice', content: textContent } : { type: 'thought', content: textContent });
      }
    });
    return traces;
  };

  const steps = parseReasoning(reasoning);
  const groupedSteps = groupReasoningSteps(steps);
  const toolSteps = groupedSteps.filter(s => s.type === 'tool_execution');

  let headerText = 'Thinking…';
  if (!isStreaming) {
    if (toolSteps.length > 0) {
      headerText = `Thought process · ${toolSteps.length} tool${toolSteps.length > 1 ? 's' : ''}`;
    } else {
      headerText = 'Thought for a few seconds';
    }
  } else {
    const lastStep = groupedSteps[groupedSteps.length - 1];
    if (lastStep?.type === 'tool_execution' && !lastStep.isCompleted) {
      headerText = `Thinking · Running ${lastStep.name}…`;
    } else {
      headerText = 'Thinking…';
    }
  }

  const toggleTool = (idx) => {
    setExpandedTools(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '2px 0 8px 0' }}>
      {/* Minimal Subtle Trigger Button */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          alignSelf: 'flex-start',
          background: isOpen ? 'var(--bg-card)' : 'transparent',
          border: isOpen ? '1px solid var(--border-subtle)' : '1px solid transparent',
          borderRadius: '8px',
          padding: '4px 9px',
          fontSize: '0.82rem',
          fontWeight: '500',
          color: isStreaming ? 'var(--primary-violet)' : (isOpen ? 'var(--text-main)' : 'var(--text-muted)'),
          cursor: 'pointer',
          transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
          userSelect: 'none'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--bg-card)';
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.color = 'var(--text-main)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = isOpen ? 'var(--bg-card)' : 'transparent';
          e.currentTarget.style.borderColor = isOpen ? 'var(--border-subtle)' : 'transparent';
          e.currentTarget.style.color = isStreaming ? 'var(--primary-violet)' : (isOpen ? 'var(--text-main)' : 'var(--text-muted)');
        }}
      >
        {isStreaming ? (
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span
                key={i}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: 'var(--primary-violet)',
                  animation: `bounce-dot 1.2s ease-in-out ${i * 0.2}s infinite`
                }}
              />
            ))}
          </div>
        ) : (
          <Brain size={14} color="var(--primary-violet)" style={{ opacity: 0.9 }} />
        )}
        <span style={{ letterSpacing: '0.1px' }}>{headerText}</span>
        <ChevronDown
          size={13}
          style={{
            opacity: 0.7,
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        />
      </button>

      {/* Expanded Reasoning Narrative & Interactive Tool Headings */}
      {isOpen && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingLeft: '14px',
          marginLeft: '6px',
          borderLeft: '2px solid var(--border-subtle)',
          marginTop: '2px',
          marginBottom: '4px'
        }}>
          <style>{`
            @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            @keyframes pulse-dot { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.4); opacity: 1; } }
            @keyframes bounce-dot { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-4px); } }
          `}</style>

          {groupedSteps.map((step, sidx) => {
            if (step.type === 'phase_notice') {
              return (
                <div key={sidx} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  color: 'var(--primary-indigo)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  alignSelf: 'flex-start'
                }}>
                  <Sparkles size={12} color="var(--primary-indigo)" />
                  <span>{step.content}</span>
                </div>
              );
            }

            if (step.type === 'thought') {
              const isLast = sidx === groupedSteps.length - 1;
              const isActive = isLast && isStreaming;
              return (
                <div key={sidx} style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-sub)',
                  lineHeight: '1.65',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {step.content}
                  {isActive && (
                    <span style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '13px',
                      background: 'var(--primary-violet)',
                      marginLeft: '3px',
                      verticalAlign: 'middle',
                      animation: 'cursor-blink 1s step-end infinite'
                    }} />
                  )}
                </div>
              );
            }

            if (step.type === 'tool_execution') {
              const isToolOpen = !!expandedTools[sidx];
              const summaryPreview = getToolSummaryPreview(step.arguments);
              const isSuccess = step.exit_code === 0 || step.exit_code === null || step.exit_code === undefined;
              const isRunning = isStreaming && !step.isCompleted;

              const argsStr = typeof step.arguments === 'string'
                ? step.arguments
                : (step.arguments ? JSON.stringify(step.arguments, null, 2) : '');
              const outputStr = typeof step.output === 'string'
                ? step.output
                : (step.output ? (typeof step.output === 'object' ? JSON.stringify(step.output, null, 2) : String(step.output)) : '');

              return (
                <div
                  key={sidx}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  {/* Clickable Tool Heading Row */}
                  <div
                    onClick={() => toggleTool(sidx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: isToolOpen ? 'var(--bg-panel)' : 'transparent',
                      userSelect: 'none',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isToolOpen) e.currentTarget.style.background = 'var(--bg-panel)';
                    }}
                    onMouseLeave={e => {
                      if (!isToolOpen) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {isToolOpen ? (
                      <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    ) : (
                      <ChevronRight size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    )}

                    <Terminal size={13} color="var(--primary-violet)" style={{ flexShrink: 0 }} />

                    {/* Tool Name & Quick Args Summary Preview */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        {step.name}
                      </span>
                      {summaryPreview && (
                        <span style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          ({summaryPreview})
                        </span>
                      )}
                    </div>

                    {/* Execution metadata & Status badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {step.execution_time_ms != null && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                          {step.execution_time_ms}ms
                        </span>
                      )}
                      <span style={{
                        fontSize: '0.64rem',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: isRunning
                          ? 'rgba(139, 92, 246, 0.12)'
                          : (isSuccess ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'),
                        color: isRunning
                          ? 'var(--primary-violet)'
                          : (isSuccess ? 'var(--primary-emerald)' : 'var(--accent-rose)'),
                        border: `1px solid ${isRunning ? 'rgba(139, 92, 246, 0.3)' : (isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)')}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {isRunning ? (
                          <>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--primary-violet)', animation: 'pulse-dot 1.2s infinite' }} />
                            Running
                          </>
                        ) : (
                          isSuccess ? '✓ Done' : '✗ Error'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Inner Details Drawer: Arguments & Output */}
                  {isToolOpen && (
                    <div style={{
                      padding: '10px 12px 12px 12px',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      background: 'var(--bg-panel)'
                    }}>
                      {/* Parameters / Input Block */}
                      {argsStr && (
                        <div style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '8px 10px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--primary-violet)', letterSpacing: '0.5px' }}>
                              Parameters / Input
                            </span>
                            {onCopy && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onCopy(argsStr, `tool-args-${sidx}`); }}
                                style={{
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  color: 'var(--text-sub)',
                                  padding: '2px 6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.66rem'
                                }}
                              >
                                <Copy size={11} />
                                <span>Copy</span>
                              </button>
                            )}
                          </div>
                          <pre style={{
                            margin: 0,
                            padding: '8px 10px',
                            borderRadius: '4px',
                            background: 'var(--bg-dark)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '0.72rem',
                            fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                            color: 'var(--text-main)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '160px',
                            overflowY: 'auto',
                            lineHeight: '1.5'
                          }}>
                            {argsStr}
                          </pre>
                        </div>
                      )}

                      {/* Output / Return Value Block */}
                      {outputStr && (
                        <div style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '8px 10px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              color: isSuccess ? 'var(--primary-emerald)' : 'var(--accent-rose)',
                              letterSpacing: '0.5px'
                            }}>
                              Result / Output
                            </span>
                            {onCopy && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onCopy(outputStr, `tool-out-${sidx}`); }}
                                style={{
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  color: 'var(--text-sub)',
                                  padding: '2px 6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '0.66rem'
                                }}
                              >
                                <Copy size={11} />
                                <span>Copy</span>
                              </button>
                            )}
                          </div>
                          <pre style={{
                            margin: 0,
                            padding: '8px 10px',
                            borderRadius: '4px',
                            background: 'var(--bg-dark)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '0.72rem',
                            fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                            color: isSuccess ? 'var(--text-main)' : 'var(--accent-rose)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            lineHeight: '1.5'
                          }}>
                            {outputStr}
                          </pre>
                        </div>
                      )}

                      {isRunning && !argsStr && !outputStr && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                          Executing tool in background…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}

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
          // While streaming, default accordion to open unless user/stream closed it; when done, default closed unless user opened it
          const isReasoningOpen = expandedReasoning[idx] !== undefined
            ? !!expandedReasoning[idx]
            : (m.isStreaming && hasReasoning);
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
                    {/* ChatGPT-style Reasoning View with interactive tool headings */}
                    {hasReasoning && (
                      <ReasoningSection
                        reasoning={m.reasoning}
                        isStreaming={m.isStreaming}
                        isOpen={isReasoningOpen}
                        onToggle={() => setExpandedReasoning(prev => ({ ...prev, [idx]: !isReasoningOpen }))}
                        onCopy={copyText ? (text, key) => copyText(text, key) : null}
                      />
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
                                  {art.artifact_type === 'video' || (art.title && art.title.toLowerCase().includes('video')) ? (
                                    <Video size={18} color="#06b6d4" />
                                  ) : art.artifact_type === 'presentation' || (art.title && art.title.toLowerCase().includes('slide')) ? (
                                    <Presentation size={18} color="var(--primary-violet)" />
                                  ) : art.artifact_type === 'spreadsheet' || (art.title && art.title.toLowerCase().includes('sheet')) ? (
                                    <FileSpreadsheet size={18} color="var(--primary-emerald)" />
                                  ) : art.artifact_type === 'image' || (art.title && art.title.toLowerCase().includes('image')) ? (
                                    <Image size={18} color="var(--primary-violet)" />
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
