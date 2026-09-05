import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Code2, Table, Presentation, Image, Video, Music,
  Layers, Search, Filter, Trash2, Eye, Download, Copy, Check,
  RefreshCw, ExternalLink, Sparkles, Plus, AlertTriangle, X,
  Clock, GitCommit, FileCode, CheckCircle2, ChevronRight, ChevronLeft, Key, Cpu
} from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import Canvas from './Canvas';
import { artifactsApi, tenantsApi } from '../api';
import { useToast } from '../context/ToastContext';

export default function ArtifactManager() {
  const { showSuccess, showError } = useToast();

  // Initialize tenant ID from URL search params (?tenant_id=...) or localStorage
  const getInitialTenantId = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('tenant_id') || urlParams.get('tenant') || localStorage.getItem('last_selected_tenant_id') || '';
    } catch {
      return '';
    }
  };

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(getInitialTenantId);
  const [artifacts, setArtifacts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalPages, setTotalPages] = useState(1);

  // Active Preview in Canvas
  const [previewArtifact, setPreviewArtifact] = useState(null);
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);

  // Delete State
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Copy Feedback
  const [copiedId, setCopiedId] = useState(null);

  // Tenant change handler that syncs with browser URL & localStorage
  const handleTenantChange = useCallback((tenantId) => {
    setSelectedTenantId(tenantId);
    setPage(1);
    try {
      if (tenantId) {
        localStorage.setItem('last_selected_tenant_id', tenantId);
      }
      const url = new URL(window.location.href);
      if (tenantId) {
        url.searchParams.set('tenant_id', tenantId);
      } else {
        url.searchParams.delete('tenant_id');
      }
      window.history.replaceState({}, '', url.toString());
    } catch (e) {
      console.warn('Could not update tenant in URL:', e);
    }
  }, []);

  // Load initial tenants list
  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await tenantsApi.list({ page_size: 50, page: 1 });
        const list = res.items || (Array.isArray(res) ? res : []);
        setTenants(list);
        if (list.length > 0) {
          const currentCandidate = selectedTenantId || getInitialTenantId();
          const valid = list.some(t => t.id === currentCandidate);
          const effectiveTenant = valid ? currentCandidate : list[0].id;
          handleTenantChange(effectiveTenant);
        }
      } catch (err) {
        console.error('Failed to load tenants:', err);
      }
    }
    loadTenants();
  }, [handleTenantChange]);

  // Fetch Artifacts for selected tenant
  const fetchArtifacts = useCallback(async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    try {
      const data = await artifactsApi.listByTenant(selectedTenantId, {
        search: searchTerm,
        artifact_type: selectedType,
        page,
        page_size: pageSize
      });
      setArtifacts(data.items || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      showError(err.message || 'Failed to fetch artifacts');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, searchTerm, selectedType, page, pageSize, showError]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  // Open Canvas handler: Ensure fresh signed embed token exists so canvas loads immediately with 100% authorization
  const handleOpenCanvas = async (art) => {
    try {
      let token = art.token;
      if (!token) {
        const res = await artifactsApi.mintEmbedToken(art.id, 120);
        token = res.token;
      }
      setPreviewArtifact({
        ...art,
        token: token
      });
      setIsCanvasOpen(true);
    } catch (err) {
      console.warn('Fallback opening without fresh token:', err);
      setPreviewArtifact(art);
      setIsCanvasOpen(true);
    }
  };

  // Download handler: Ensure fresh signed embed token exists so direct browser download succeeds 100%
  const handleDownload = async (art, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    try {
      let token = art.token;
      if (!token) {
        try {
          const res = await artifactsApi.mintEmbedToken(art.id, 60);
          token = res?.token;
        } catch (tokErr) {
          console.warn('Failed to mint download token:', tokErr);
        }
      }
      const exportUrl = artifactsApi.getExportUrl(art.id, token);
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = art.filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      showError(err.message || 'Failed to initiate download');
    }
  };

  // Handle Delete
  const handleDelete = async (artifactId) => {
    setDeletingId(artifactId);
    try {
      await artifactsApi.deleteArtifact(artifactId);
      showSuccess('Artifact deleted successfully');
      setConfirmDeleteId(null);
      if (previewArtifact?.id === artifactId) {
        setIsCanvasOpen(false);
        setPreviewArtifact(null);
      }
      fetchArtifacts();
    } catch (err) {
      showError(err.message || 'Failed to delete artifact');
    } finally {
      setDeletingId(null);
    }
  };

  // Copy Embed URL
  const handleCopyEmbedUrl = async (art) => {
    try {
      let token = art.token;
      if (!token) {
        const tokenRes = await artifactsApi.mintEmbedToken(art.id, 120);
        token = tokenRes.token;
      }
      const fullUrl = `${window.location.origin}/embed/canvas?token=${token}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(art.id);
      showSuccess('Signed Canvas Embed URL copied to clipboard');
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      showError('Failed to generate embed token');
    }
  };

  // Type Icon and Color Mapper
  const getTypeInfo = (type) => {
    const t = (type || '').toLowerCase();
    switch (t) {
      case 'document':
      case 'doc':
      case 'pdf':
        return { icon: FileText, label: 'Document', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' };
      case 'code':
      case 'html':
      case 'script':
        return { icon: Code2, label: 'Code', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
      case 'spreadsheet':
      case 'sheet':
        return { icon: Table, label: 'Spreadsheet', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' };
      case 'presentation':
      case 'slides':
        return { icon: Presentation, label: 'Presentation', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
      case 'svg':
      case 'diagram_svg':
      case 'diagram':
      case 'image':
      case 'vector':
        return { icon: Image, label: 'Image / SVG', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' };
      case 'video':
        return { icon: Video, label: 'Video', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };
      case 'audio':
        return { icon: Music, label: 'Audio', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' };
      default:
        return { icon: FileText, label: 'Artifact', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' };
    }
  };

  // Stats calculation
  const countsByType = artifacts.reduce((acc, art) => {
    const t = (art.artifact_type || '').toLowerCase();
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const imagesCount = (countsByType['diagram_svg'] || 0) + (countsByType['svg'] || 0) + (countsByType['image'] || 0) + (countsByType['vector'] || 0);

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. HEADER & TENANT SELECTOR                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '20px 24px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(99, 102, 241, 0.04))',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.35)'
          }}>
            <Layers size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
              Canvas Artifacts & Document Registry
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Live interactive previews, version rollbacks, binary exports, and cryptographic embed management.
            </p>
          </div>
        </div>

        {/* Tenant Selector Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '320px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
            Tenant:
          </label>
          <div style={{ flex: 1 }}>
            <AsyncSearchableDropdown
              value={selectedTenantId}
              onChange={(val) => handleTenantChange(val)}
              initialLabel={tenants.find(t => t.id === selectedTenantId)?.name ? `🔑 ${tenants.find(t => t.id === selectedTenantId).name}` : ''}
              fetchOptions={async (search) => {
                const res = await tenantsApi.list({ search: search || '', page_size: 20, page: 1 });
                const items = res.items || (Array.isArray(res) ? res : []);
                return items.map(t => ({
                  value: t.id,
                  label: `🔑 ${t.name}`
                }));
              }}
              placeholder="Select Tenant..."
            />
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={fetchArtifacts}
            title="Refresh Artifacts"
            style={{ padding: '9px 12px', borderRadius: '10px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. STATS OVERVIEW CARDS                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px'
      }}>
        {[
          { label: 'Total Artifacts', count: totalCount, icon: Layers, color: '#8b5cf6' },
          { label: 'Documents', count: countsByType['document'] || 0, icon: FileText, color: '#a855f7' },
          { label: 'Images & SVGs', count: imagesCount, icon: Image, color: '#ec4899' },
          { label: 'Presentations', count: countsByType['presentation'] || 0, icon: Presentation, color: '#f59e0b' },
          { label: 'Spreadsheets', count: countsByType['spreadsheet'] || 0, icon: Table, color: '#06b6d4' },
          { label: 'Code & Scripts', count: countsByType['code'] || 0, icon: Code2, color: '#10b981' }
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="glass-box"
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                borderRadius: '14px'
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `${stat.color}18`,
                border: `1px solid ${stat.color}35`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: stat.color
              }}>
                <Icon size={20} />
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', lineHeight: 1.2 }}>
                  {stat.count}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600', marginTop: '2px' }}>
                  {stat.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. SEARCH & TYPE FILTER BAR                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        padding: '14px 18px',
        borderRadius: '14px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)'
      }}>
        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by title, filename, or session ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px 0',
              fontSize: '0.88rem',
              color: 'var(--text-main)',
              width: '100%',
              outline: 'none'
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Type Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Types' },
            { id: 'document', label: 'Documents', icon: FileText },
            { id: 'images', label: 'Images & SVGs', icon: Image },
            { id: 'presentation', label: 'Slides', icon: Presentation },
            { id: 'spreadsheet', label: 'Sheets', icon: Table },
            { id: 'code', label: 'Code & Web', icon: Code2 }
          ].map((tab) => {
            const isActive = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedType(tab.id);
                  setPage(1);
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? '700' : '500',
                  background: isActive ? 'var(--primary-violet)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-sub)',
                  border: `1px solid ${isActive ? 'var(--primary-violet)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {tab.icon && <tab.icon size={13} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. ARTIFACTS GRID VIEW                                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--primary-violet)' }} />
          <p style={{ fontSize: '0.9rem' }}>Loading tenant artifacts...</p>
        </div>
      ) : artifacts.length === 0 ? (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          background: 'var(--bg-panel)',
          borderRadius: '16px',
          border: '1px dashed var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'rgba(139, 92, 246, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary-violet)'
          }}>
            <Layers size={26} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
            No Artifacts Found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', margin: 0 }}>
            No canvas artifacts matching the selected filters were found for this tenant. Generate documents in the Chat Playground or via the API.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {artifacts.map((art) => {
            const typeInfo = getTypeInfo(art.artifact_type);
            const TypeIcon = typeInfo.icon;
            const isDeleting = deletingId === art.id;

            return (
              <div
                key={art.id}
                className="glass-box"
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Card Top: Type Badge & Action Menu */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: typeInfo.bg,
                    border: `1px solid ${typeInfo.color}35`,
                    color: typeInfo.color,
                    fontSize: '0.74rem',
                    fontWeight: '700'
                  }}>
                    <TypeIcon size={12} />
                    <span>{typeInfo.label}</span>
                  </div>

                  {/* Version & Block Counter Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)'
                    }}>
                      v{art.current_version || 1} • {art.blocks_count || 0} blocks
                    </span>
                  </div>
                </div>

                {/* Title & Filename */}
                <div>
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: 'var(--text-main)',
                    margin: '0 0 4px 0',
                    lineHeight: '1.3',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {art.title || 'Untitled Document'}
                  </h3>
                  <div style={{
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    📄 {art.filename || 'document.md'}
                  </div>
                </div>

                {/* Session ID & Timestamp Meta */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Cpu size={11} color="var(--primary-violet)" />
                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {art.session_id || 'default_session'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={11} />
                    <span>{art.updated_at ? new Date(art.updated_at).toLocaleDateString() : 'Recent'}</span>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
                  {/* Preview in Canvas */}
                  <button
                    type="button"
                    className="btn-gradient"
                    onClick={() => handleOpenCanvas(art)}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      fontSize: '0.78rem',
                      justifyContent: 'center',
                      borderRadius: '8px'
                    }}
                  >
                    <Eye size={13} /> <span>Open Canvas</span>
                  </button>

                  {/* Copy Embed Token Link */}
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => handleCopyEmbedUrl(art)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      color: copiedId === art.id ? 'var(--primary-emerald)' : 'var(--text-main)'
                    }}
                    title="Copy Signed Embed URL"
                  >
                    {copiedId === art.id ? <Check size={14} /> : <Copy size={14} />}
                  </button>

                  {/* Direct Export Button */}
                  <button
                    type="button"
                    onClick={(e) => handleDownload(art, e)}
                    className="btn-outline"
                    style={{
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    title="Export / Download File"
                  >
                    <Download size={14} />
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setConfirmDeleteId(art.id)}
                    disabled={isDeleting}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(244, 63, 94, 0.25)',
                      color: 'var(--accent-rose)'
                    }}
                    title="Delete Artifact"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Confirm Delete Inline Overlay */}
                {confirmDeleteId === art.id && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--bg-modal)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 10,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '12px',
                    borderRadius: '16px',
                    border: '1px solid var(--accent-rose)'
                  }}>
                    <AlertTriangle size={24} color="var(--accent-rose)" />
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: '700', color: 'var(--text-main)' }}>
                        Delete this artifact?
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        All blocks, revisions, and diff commits will be permanently erased.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ padding: '6px 12px', fontSize: '0.76rem', borderRadius: '8px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(art.id)}
                        disabled={isDeleting}
                        style={{
                          background: 'var(--accent-rose)',
                          color: '#ffffff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5. PAGINATION CONTROLS                                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderRadius: '14px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          marginTop: '8px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Left: Total counts & page info */}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: 'var(--text-main)' }}>{Math.min(totalCount, (page - 1) * pageSize + 1)} - {Math.min(totalCount, page * pageSize)}</strong> of <strong style={{ color: 'var(--text-main)' }}>{totalCount}</strong> artifacts
          </div>

          {/* Right: Page navigation buttons & Page size selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Page Size Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  width: 'auto',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)'
                }}
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
            </div>

            {/* Prev / Next & Page indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  opacity: page <= 1 ? 0.4 : 1,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft size={14} /> <span>Prev</span>
              </button>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', padding: '0 8px', fontWeight: '600' }}>
                {page} / {totalPages}
              </span>

              <button
                type="button"
                className="btn-outline"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  opacity: page >= totalPages ? 0.4 : 1,
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                <span>Next</span> <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 6. FULL CANVAS PREVIEW & EDIT MODAL DRAWER                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isCanvasOpen && previewArtifact && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.15s ease'
        }}>
          {/* Backdrop Click */}
          <div style={{ flex: 1 }} onClick={() => setIsCanvasOpen(false)} />

          {/* Canvas Drawer Window */}
          <div style={{
            width: '900px',
            maxWidth: '96vw',
            height: '100%',
            background: 'var(--bg-main)',
            borderLeft: '1px solid var(--border-glow)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1201,
            animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Top Bar with Close Button */}
            <div style={{
              height: '50px',
              padding: '0 16px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="var(--primary-violet)" />
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Canvas Live Editor & Preview
                </span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  • {typeof previewArtifact.title === 'object' && previewArtifact.title !== null ? (previewArtifact.title.name || previewArtifact.title.title || 'Document') : String(previewArtifact.title || 'Document')} (v{previewArtifact.current_version || 1})
                </span>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setIsCanvasOpen(false)}
                style={{ padding: '6px', borderRadius: '8px' }}
                title="Close Canvas"
              >
                <X size={16} />
              </button>
            </div>

            {/* Embedded Native Canvas Engine */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <Canvas
                artifactId={previewArtifact.id}
                token={previewArtifact.token}
                onClose={() => {
                  setIsCanvasOpen(false);
                  fetchArtifacts();
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
