import React, { useState } from 'react';
import { 
  BookOpen, Rocket, Terminal, Layers, HardDrive, ShieldCheck, 
  Settings, Cpu, Search, Copy, Check, ChevronRight, ExternalLink,
  FileText, Download, Upload, Server
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

// Import raw markdown files using Vite's '?raw' query
import introDoc from '../docs/introduction.md?raw';
import quickstartDoc from '../docs/quickstart.md?raw';
import installDoc from '../docs/installation.md?raw';
import usageDoc from '../docs/usage-guide.md?raw';
import apiDoc from '../docs/api-reference.md?raw';
import canvasDoc from '../docs/artifacts-canvas.md?raw';
import storageDoc from '../docs/session-storage.md?raw';
import sandboxDoc from '../docs/sandboxes.md?raw';
import configDoc from '../docs/configuration.md?raw';
import skillsDoc from '../docs/skills-and-mcp.md?raw';

const DOC_ITEMS = [
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
  {
    id: 'usage-guide',
    title: 'Usage & Workflows',
    icon: Terminal,
    category: 'Workflows & Features',
    description: 'Chat Playground, Universal Canvas, Apps & Groups, ProChat, and Audit Logs.',
    content: usageDoc
  },
  {
    id: 'api-reference',
    title: 'API Reference & SDKs',
    icon: Server,
    category: 'API & Integration',
    description: 'OpenAI-compatible chat completions specs, streaming SSE, multimodal sub-agents.',
    content: apiDoc
  },
  {
    id: 'artifacts-canvas',
    title: 'Universal Canvas Artifacts',
    icon: Layers,
    category: 'API & Integration',
    description: 'Drop-in iframe embed specs, postMessage protocol, headless REST/SSE, and HMAC tokens.',
    content: canvasDoc
  },
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
  },
  {
    id: 'skills-and-mcp',
    title: 'Skills & MCP Servers',
    icon: Cpu,
    category: 'Workflows & Features',
    description: 'Anatomy of SKILL.md, tool schemas, AI Skill Generator, and Model Context Protocol.',
    content: skillsDoc
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
