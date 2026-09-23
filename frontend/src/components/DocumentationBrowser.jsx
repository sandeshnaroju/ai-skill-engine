import React, { useState } from 'react';
import { 
  BookOpen, Rocket, Terminal, Layers, HardDrive, ShieldCheck, 
  Settings, Cpu, Search, Copy, Check, ChevronRight, ExternalLink,
  FileText, Download, Upload, Server, Layout, Code, Sparkles, KeyRound, FolderTree
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

// Import raw markdown files using Vite's '?raw' query
import introDoc from '../docs/01-introduction.md?raw';
import quickstartDoc from '../docs/02-quickstart.md?raw';
import installDoc from '../docs/03-installation.md?raw';
import usageDoc from '../docs/04-usage-guide.md?raw';

// Backend Docs
import backendApiDoc from '../docs/05-backend-api.md?raw';
import backendMultimodalDoc from '../docs/06-backend-multimodal.md?raw';
import backendFilesDoc from '../docs/07-backend-files.md?raw';
import backendMgmtDoc from '../docs/08-backend-management.md?raw';
import apiRefDoc from '../docs/09-api-reference.md?raw';

// Frontend & Canvas Docs
import frontendCanvasDoc from '../docs/10-frontend-canvas.md?raw';
import frontendHeadlessDoc from '../docs/11-frontend-headless.md?raw';
import frontendSecurityDoc from '../docs/12-frontend-security.md?raw';
import canvasDoc from '../docs/13-artifacts-canvas.md?raw';

// Storage & Infrastructure Docs
import storageDoc from '../docs/14-session-storage.md?raw';
import sandboxDoc from '../docs/15-sandboxes.md?raw';
import configDoc from '../docs/16-configuration.md?raw';
import skillsDoc from '../docs/17-skills-and-mcp.md?raw';

const DOC_ITEMS = [
  // Getting Started
  {
    id: 'introduction',
    title: 'Introduction & Architecture',
    icon: BookOpen,
    category: 'Getting Started',
    description: 'Platform overview, request lifecycle, multi-tenancy model, and core concepts.',
    content: introDoc
  },
  {
    id: 'quickstart',
    title: 'Quickstart Walkthrough',
    icon: Rocket,
    category: 'Getting Started',
    description: '5-minute zero-to-one guide from boot to your first tool call and API request.',
    content: quickstartDoc
  },
  {
    id: 'installation',
    title: 'Installation & Deployment',
    icon: Download,
    category: 'Getting Started',
    description: 'Docker Hub zero-clone, Docker Compose with Postgres, Bare-Metal, and Nginx SSL.',
    content: installDoc
  },

  // Backend API Reference
  {
    id: 'backend-api',
    title: 'Chat Completions & Streaming',
    icon: Server,
    category: 'Backend API Reference',
    description: 'OpenAI-compatible gateway endpoint, authentication, and streaming SDKs (cURL, Python, JS).',
    content: backendApiDoc
  },
  {
    id: 'backend-multimodal',
    title: 'Multimodal & Sub-Agents',
    icon: Sparkles,
    category: 'Backend API Reference',
    description: 'Routing parameters for image/video synthesis, vision analysis, audio transcription, and ProChat UI.',
    content: backendMultimodalDoc
  },
  {
    id: 'backend-files',
    title: 'Files & Session Lifecycle',
    icon: FolderTree,
    category: 'Backend API Reference',
    description: 'File uploads, generated asset downloads, session file listing, and cascade purge APIs.',
    content: backendFilesDoc
  },
  {
    id: 'backend-management',
    title: 'Artifacts & Management APIs',
    icon: FileText,
    category: 'Backend API Reference',
    description: 'Canvas REST/SSE matrix, MCP server synchronization, execution logs, and audit trails.',
    content: backendMgmtDoc
  },

  // Frontend & Universal Canvas
  {
    id: 'frontend-canvas',
    title: 'Canvas Iframe & Embedding',
    icon: Layout,
    category: 'Frontend & Universal Canvas',
    description: 'Embed interactive Canvas in your website: payload parsing, iframe params, and postMessage event handlers.',
    content: frontendCanvasDoc
  },
  {
    id: 'frontend-headless',
    title: 'Headless Canvas REST & SSE',
    icon: Code,
    category: 'Frontend & Universal Canvas',
    description: 'Build custom editors without iframe: section block commits, live typing stream, and binary exports.',
    content: frontendHeadlessDoc
  },
  {
    id: 'frontend-security',
    title: 'Security, Tokens & Uploaded Files',
    icon: KeyRound,
    category: 'Frontend & Universal Canvas',
    description: 'HMAC token proxy pattern, client-side expiration checks, and opening uploaded files in Canvas.',
    content: frontendSecurityDoc
  },
  {
    id: 'artifacts-canvas',
    title: 'Universal Canvas Architecture',
    icon: Layers,
    category: 'Frontend & Universal Canvas',
    description: 'Deep dive into artifact types, section block diffing engine, and WebGL/Three.js viewports.',
    content: canvasDoc
  },

  // Workflows & Features
  {
    id: 'usage-guide',
    title: 'Usage & Workflows',
    icon: Terminal,
    category: 'Workflows & Features',
    description: 'Chat Playground, Universal Canvas, Apps & Groups, ProChat, and Audit Logs.',
    content: usageDoc
  },
  {
    id: 'skills-and-mcp',
    title: 'Skills & MCP Servers',
    icon: Cpu,
    category: 'Workflows & Features',
    description: 'Anatomy of SKILL.md, tool schemas, AI Skill Generator, and Model Context Protocol.',
    content: skillsDoc
  },

  // Storage & Infrastructure
  {
    id: 'session-storage',
    title: 'Session Storage & Cloud Files',
    icon: HardDrive,
    category: 'Storage & Infrastructure',
    description: 'Azure Blob, S3, and Local Disk file lifecycles, session uploads, listing, and cascade purge.',
    content: storageDoc
  },
  {
    id: 'sandboxes',
    title: 'Execution Sandboxes',
    icon: ShieldCheck,
    category: 'Storage & Infrastructure',
    description: 'Docker containers, Azure Container Apps (Hyper-V), E2B micro-VMs, Fly.io, and AWS Lambda.',
    content: sandboxDoc
  },
  {
    id: 'configuration',
    title: 'Configuration & Settings',
    icon: Settings,
    category: 'Storage & Infrastructure',
    description: 'System environment variables, Fernet encryption, custom token pricing rates, and SMTP.',
    content: configDoc
  }
];

export default function DocumentationBrowser() {
  const [activeDocId, setActiveDocId] = useState('introduction');
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
