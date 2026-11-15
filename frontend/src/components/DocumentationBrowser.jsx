import React, { useState } from 'react';
import { 
  BookOpen, Rocket, Terminal, Layers, HardDrive, ShieldCheck, 
  Settings, Cpu, Search, Copy, Check, ChevronRight, ExternalLink,
  FileText, Download, Upload, Server, Layout, Code, Sparkles, KeyRound, FolderTree, Clock
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

// Import raw markdown files using Vite's '?raw' query
import gettingStartedDoc from '../docs/01-getting-started.md?raw';
import authTenantsDoc from '../docs/02-authentication-and-tenants.md?raw';
import chatCompletionsDoc from '../docs/03-chat-completions.md?raw';
import artifactsCanvasDoc from '../docs/04-artifacts-and-canvas.md?raw';
import filesStorageDoc from '../docs/05-files-and-storage.md?raw';
import scheduledJobsDoc from '../docs/06-scheduled-jobs.md?raw';
import apiReferenceDoc from '../docs/07-api-reference.md?raw';
import customSkillsDoc from '../docs/08-custom-skills.md?raw';
import mcpServersDoc from '../docs/09-mcp-servers.md?raw';
import secretsUserDataDoc from '../docs/10-secrets-and-user-data.md?raw';
import dashboardGuideDoc from '../docs/11-dashboard-guide.md?raw';
import deploymentSetupDoc from '../docs/12-deployment-and-setup.md?raw';

const DOC_ITEMS = [
  // Getting Started
  {
    id: 'getting-started',
    title: 'Quickstart & Platform Overview',
    icon: Rocket,
    category: 'Getting Started',
    description: 'What you can build with AI Skill Engine, architecture, and 3-minute first API request.',
    content: gettingStartedDoc
  },
  {
    id: 'authentication-and-tenants',
    title: 'Authentication & Workspaces',
    icon: KeyRound,
    category: 'Getting Started',
    description: 'Tenant API keys, HTTP headers, multi-tenant isolation, and workspace management.',
    content: authTenantsDoc
  },

  // Building with the API
  {
    id: 'chat-completions',
    title: 'Chat Completions & Streaming',
    icon: Server,
    category: 'Building with the API',
    description: 'OpenAI client compatibility, real-time SSE deltas, live thought process, and status steppers.',
    content: chatCompletionsDoc
  },
  {
    id: 'artifacts-and-canvas',
    title: 'Embedding Artifacts & Canvas',
    icon: Layers,
    category: 'Building with the API',
    description: 'Embed interactive documents, spreadsheets, slides, and 3D CAD/PCB viewports via iframe or REST.',
    content: artifactsCanvasDoc
  },
  {
    id: 'files-and-storage',
    title: 'File Uploads & Session Storage',
    icon: FolderTree,
    category: 'Building with the API',
    description: 'Upload PDFs/spreadsheets for agent analysis, download generated files, and cascade purge sessions.',
    content: filesStorageDoc
  },
  {
    id: 'scheduled-jobs',
    title: 'Scheduled Background Tasks',
    icon: Clock,
    category: 'Building with the API',
    description: 'Automated recurring tasks with cron, interval, and date triggers, plus background execution guardrails.',
    content: scheduledJobsDoc
  },
  {
    id: 'api-reference',
    title: 'Complete REST API Reference',
    icon: Terminal,
    category: 'Building with the API',
    description: 'Exhaustive catalog of endpoints, request/response bodies, parameters, and HTTP status codes.',
    content: apiReferenceDoc
  },

  // Skills & Custom Tools
  {
    id: 'custom-skills',
    title: 'Connecting Custom APIs as Skills',
    icon: Cpu,
    category: 'Skills & Custom Tools',
    description: 'Turn any REST API into an autonomous tool using SKILL.md schemas and runtime secret injection.',
    content: customSkillsDoc
  },
  {
    id: 'mcp-servers',
    title: 'External Tools with MCP',
    icon: HardDrive,
    category: 'Skills & Custom Tools',
    description: 'Connect PostgreSQL databases, local filesystems, and GitHub using the Model Context Protocol.',
    content: mcpServersDoc
  },
  {
    id: 'secrets-and-user-data',
    title: 'Secrets & User Data Profiles',
    icon: ShieldCheck,
    category: 'Skills & Custom Tools',
    description: 'Inject API tokens and passwords dynamically into tools without ever leaking them to the LLM.',
    content: secretsUserDataDoc
  },

  // Dashboard & Workflows
  {
    id: 'dashboard-guide',
    title: 'Chat Playground & Dashboard Guide',
    icon: Layout,
    category: 'Dashboard & Workflows',
    description: 'Tour of the web dashboard: Chat Playground, active skill toggles, Apps packaging, and token analytics.',
    content: dashboardGuideDoc
  },
  {
    id: 'deployment-and-setup',
    title: 'Self-Hosting & Deployment Guide',
    icon: Settings,
    category: 'Dashboard & Workflows',
    description: 'Single-command Docker run, Docker Compose with Postgres, LLM providers, and environment variables.',
    content: deploymentSetupDoc
  }
];

export default function DocumentationBrowser() {
  const [activeDocId, setActiveDocId] = useState('getting-started');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const activeDoc = DOC_ITEMS.find(d => d.id === activeDocId) || DOC_ITEMS[0];

  const filteredDocs = DOC_ITEMS.filter(d => 
    d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(DOC_ITEMS.map(d => d.category)));

  const handleCopyMarkdown = () => {
    if (activeDoc?.content) {
      navigator.clipboard.writeText(activeDoc.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      gap: '20px',
      minHeight: 'calc(100vh - 160px)',
      alignItems: 'flex-start'
    }}>
      {/* Sidebar Navigation */}
      <aside className="glass-box" style={{
        width: '300px',
        flexShrink: 0,
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        position: 'sticky',
        top: '20px',
        maxHeight: 'calc(100vh - 140px)',
        overflowY: 'auto'
      }}>
        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documentation..."
            style={{ paddingLeft: '32px', fontSize: '0.82rem', width: '100%', height: '34px' }}
          />
        </div>

        {/* Categories & Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {categories.map(cat => {
            const catDocs = filteredDocs.filter(d => d.category === cat);
            if (catDocs.length === 0) return null;

            return (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{
                  fontSize: '0.70rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  padding: '4px 8px'
                }}>
                  {cat}
                </div>

                {catDocs.map(doc => {
                  const Icon = doc.icon;
                  const isActive = doc.id === activeDocId;

                  return (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDocId(doc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid var(--primary-violet)' : '1px solid transparent',
                        background: isActive ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                        color: isActive ? 'var(--primary-violet)' : 'var(--text-sub)',
                        fontWeight: isActive ? '700' : '500',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <Icon size={15} color={isActive ? 'var(--primary-violet)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {doc.title}
                        </span>
                      </div>
                      {isActive && <ChevronRight size={13} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Documentation Viewer Body */}
      <main className="glass-box" style={{
        flex: 1,
        minWidth: 0,
        padding: '28px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Top Header of Active Document */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: '700',
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(139, 92, 246, 0.15)',
                color: 'var(--primary-violet)'
              }}>
                {activeDoc.category}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                docs/{activeDoc.id}.md
              </span>
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
              {activeDoc.title}
            </h2>
          </div>

          <button
            className="btn-outline"
            onClick={handleCopyMarkdown}
            style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {copied ? <Check size={14} color="var(--primary-emerald)" /> : <Copy size={14} />}
            {copied ? 'Copied Markdown!' : 'Copy Raw Markdown'}
          </button>
        </div>

        {/* Rendered Markdown Document */}
        <div style={{
          fontSize: '0.90rem',
          lineHeight: '1.7',
          color: 'var(--text-main)'
        }}>
          <MarkdownViewer 
            content={activeDoc.content}
            onDocNavigate={(docId) => {
              const target = DOC_ITEMS.find(d => d.id === docId);
              if (target) {
                setActiveDocId(target.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          />
        </div>

        {/* Bottom Pagination Links (Previous & Next Guide) */}
        {(() => {
          const currentIndex = DOC_ITEMS.findIndex(d => d.id === activeDoc.id);
          const prevDoc = currentIndex > 0 ? DOC_ITEMS[currentIndex - 1] : null;
          const nextDoc = currentIndex < DOC_ITEMS.length - 1 ? DOC_ITEMS[currentIndex + 1] : null;

          return (
            <div style={{
              marginTop: '40px',
              paddingTop: '24px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px'
            }}>
              {prevDoc ? (
                <button
                  onClick={() => {
                    setActiveDocId(prevDoc.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="glass-box"
                  style={{
                    padding: '16px 20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600' }}>
                    ← Previous Guide
                  </span>
                  <span style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--primary-cyan)' }}>
                    {prevDoc.title}
                  </span>
                </button>
              ) : <div />}

              {nextDoc && (
                <button
                  onClick={() => {
                    setActiveDocId(nextDoc.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="glass-box"
                  style={{
                    padding: '16px 20px',
                    textAlign: 'right',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '600' }}>
                    Next Guide →
                  </span>
                  <span style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--primary-violet)' }}>
                    {nextDoc.title}
                  </span>
                </button>
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
}
