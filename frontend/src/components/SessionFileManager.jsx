import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Trash2, Download, RefreshCw, Filter, Search, 
  ChevronLeft, ChevronRight, AlertCircle, Check, HardDrive, 
  Server, UploadCloud, Layers, ExternalLink, Calendar, Hash, ArrowLeft
} from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { tenantsApi, filesApi } from '../api';

const PROVIDERS = [
  { id: 'all', label: 'All Providers', icon: Layers, color: 'var(--primary-violet)' },
  { id: 'azure', label: 'Azure Blob', icon: Server, color: '#0078D4' },
  { id: 's3', label: 'AWS S3', icon: UploadCloud, color: '#FF9900' },
  { id: 'local', label: 'Local Disk', icon: HardDrive, color: 'var(--primary-violet)' }
];

export default function SessionFileManager() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [activeProvider, setActiveProvider] = useState('all');
  
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [actionStatus, setActionStatus] = useState(null);
  const [purgeModalSession, setPurgeModalSession] = useState(null);
  const [purging, setPurging] = useState(false);
  const [deleteModalFile, setDeleteModalFile] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load tenants on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await tenantsApi.list();
        const items = Array.isArray(data) ? data : (data.items || data.data || []);
        setTenants(items);
        if (items.length > 0) {
          setSelectedTenantId(items[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch tenants', e);
      }
    })();
  }, []);

  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0] || null;

  const fetchFiles = async () => {
    if (!activeTenant || !activeTenant.api_key) {
      setFiles([]);
      setTotalItems(0);
      return;
    }
    setLoading(true);
    setActionStatus(null);
    try {
      const tenantKey = activeTenant.api_key;
      const res = await filesApi.listTenantFiles({
        provider: activeProvider !== 'all' ? activeProvider : undefined,
        session_id: selectedSessionId.trim() || undefined,
        origin: originFilter !== 'all' ? originFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        search: search.trim() || undefined,
        page,
        page_size: 15,
      }, { tenantKey });

      setFiles(res.items || []);
      setTotalPages(res.pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      console.error('Failed to list tenant storage files:', err);
      setActionStatus({ type: 'error', message: `Failed to load files: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [activeProvider, selectedTenantId, originFilter, sourceFilter, selectedSessionId]);

  useEffect(() => {
    fetchFiles();
  }, [activeProvider, selectedTenantId, originFilter, sourceFilter, selectedSessionId, page]);

  const confirmDeleteFile = async () => {
    if (!deleteModalFile) return;
    if (!activeTenant?.api_key) {
      setActionStatus({ type: 'error', message: 'Tenant API Key is required to perform file deletion.' });
      setDeleteModalFile(null);
      return;
    }
    setDeleting(true);
    try {
      await filesApi.deleteFile(deleteModalFile.id, { tenantKey: activeTenant.api_key });
      setActionStatus({ type: 'success', message: `Permanently deleted '${deleteModalFile.original_name}' from storage and database.` });
      setDeleteModalFile(null);
      fetchFiles();
    } catch (err) {
      setActionStatus({ type: 'error', message: `Failed to delete file: ${err.message}` });
    } finally {
      setDeleting(false);
    }
  };

  const handlePurgeSession = async () => {
    if (!purgeModalSession) return;
    if (!activeTenant?.api_key) {
      setActionStatus({ type: 'error', message: 'Tenant API Key is required to purge session files.' });
      setPurgeModalSession(null);
      return;
    }
    setPurging(true);
    try {
      const res = await filesApi.purgeSession(purgeModalSession, {}, { tenantKey: activeTenant.api_key });
      setActionStatus({ 
        type: 'success', 
        message: `Successfully purged ${res.deleted_count} file(s) for session '${purgeModalSession}' from ${res.storage_provider ? res.storage_provider.toUpperCase() : 'cloud'} storage.` 
      });
      setPurgeModalSession(null);
      fetchFiles();
    } catch (err) {
      setActionStatus({ type: 'error', message: `Failed to purge session: ${err.message}` });
    } finally {
      setPurging(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIdx = Math.min(i, sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, safeIdx)).toFixed(1)) + ' ' + sizes[safeIdx];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header Card */}
      <div className="glass-box" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <button
              className="btn-outline"
              onClick={() => navigate('/storage')}
              title="Back to Storage Settings"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: '600',
                color: 'var(--text-main)',
                flexShrink: 0
              }}
            >
              <ArrowLeft size={15} />
              Back to Storage Settings
            </button>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <FileText size={22} color="var(--primary-violet)" />
                Session & Storage Files
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                Inspect, manage, and clean up files stored across Azure Blob, AWS S3, and Local Disk tied to user sessions.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn-outline" 
              onClick={fetchFiles} 
              disabled={loading}
              style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Workspace / Tenant Selector */}
        {tenants && tenants.length > 0 && (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-sub)' }}>
              Select Workspace:
            </span>
            <div style={{ minWidth: '280px', flex: '0 1 360px' }}>
              <AsyncSearchableDropdown
                value={selectedTenantId}
                onChange={(val) => setSelectedTenantId(val)}
                fetchOptions={async (query) => {
                  try {
                    const data = await tenantsApi.list({ search: query, page_size: 20 });
                    const items = data.items || Array.isArray(data) ? (data.items || data) : [];
                    return items.map(t => ({ value: t.id, label: t.name }));
                  } catch (e) {
                    console.error('Error fetching tenant options:', e);
                  }
                  return [];
                }}
                placeholder="Search and select tenant..."
                initialLabel={tenants.find(t => t.id === selectedTenantId)?.name || ''}
              />
            </div>
            {activeTenant && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                API Key: <code style={{ color: 'var(--primary-violet)' }}>{activeTenant.api_key ? `${activeTenant.api_key.substring(0, 10)}...` : 'None'}</code>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Notification */}
      {actionStatus && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.86rem',
          background: actionStatus.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${actionStatus.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: actionStatus.type === 'success' ? 'var(--primary-emerald)' : '#ef4444'
        }}>
          {actionStatus.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{actionStatus.message}</span>
        </div>
      )}

      {/* Main Files Table View */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Storage Provider Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
          {PROVIDERS.map((p) => {
            const Icon = p.icon;
            const isSelected = activeProvider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActiveProvider(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid var(--primary-violet)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-input)',
                  color: isSelected ? 'var(--primary-violet)' : 'var(--text-sub)',
                  fontWeight: isSelected ? '700' : '500',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={14} color={isSelected ? 'var(--primary-violet)' : p.color} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search input */}
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename or path..."
              style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '36px' }}
            />
          </div>

          {/* Session ID input */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Hash size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              placeholder="Filter by Session ID..."
              style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '36px' }}
            />
          </div>

          {/* Origin filter */}
          <div style={{ flex: '0 0 auto' }}>
            <select
              className="input-field"
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              style={{ fontSize: '0.82rem', height: '36px', padding: '0 10px', cursor: 'pointer' }}
            >
              <option value="all">All Origins</option>
              <option value="chat_playground">Playground</option>
              <option value="external_api">External API</option>
            </select>
          </div>

          {/* Source filter */}
          <div style={{ flex: '0 0 auto' }}>
            <select
              className="input-field"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ fontSize: '0.82rem', height: '36px', padding: '0 10px', cursor: 'pointer' }}
            >
              <option value="all">All Sources</option>
              <option value="user_upload">User Uploads</option>
              <option value="tool_generated">Tool Generated</option>
            </select>
          </div>

          {(search || selectedSessionId || originFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              className="btn-outline"
              onClick={() => {
                setSearch('');
                setSelectedSessionId('');
                setOriginFilter('all');
                setSourceFilter('all');
              }}
              style={{ padding: '7px 12px', fontSize: '0.80rem', height: '36px' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Files Table */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px auto', display: 'block' }} />
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div style={{
            padding: '44px 20px',
            textAlign: 'center',
            background: 'var(--bg-input)',
            borderRadius: '8px',
            border: '1px dashed var(--border-subtle)'
          }}>
            <FileText size={32} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '8px' }} />
            <div style={{ color: 'var(--text-sub)', fontWeight: '600', fontSize: '0.90rem' }}>No storage files found</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
              Files created by Python/code execution or uploaded via Chat Playground & API Tester will be listed here.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>File / Name</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>Provider</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>Session ID</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>Origin & Source</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>Size</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)' }}>Uploaded</th>
                  <th style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--text-sub)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, idx) => (
                  <tr 
                    key={f.id || idx}
                    style={{ 
                      borderBottom: idx < files.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={15} color="var(--primary-violet)" style={{ flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                            {f.original_name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {f.storage_path}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        background: f.storage_provider === 'azure' ? 'rgba(0,120,212,0.12)' : f.storage_provider === 's3' ? 'rgba(255,153,0,0.12)' : 'rgba(139,92,246,0.12)',
                        color: f.storage_provider === 'azure' ? '#0078D4' : f.storage_provider === 's3' ? '#FF9900' : 'var(--primary-violet)'
                      }}>
                        {f.storage_provider}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {f.session_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => setSelectedSessionId(f.session_id)}
                            title={`Filter files for session '${f.session_id}'`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--primary-violet)',
                              cursor: 'pointer',
                              fontFamily: 'monospace',
                              fontSize: '0.78rem',
                              padding: 0,
                              textDecoration: 'underline'
                            }}
                          >
                            {f.session_id.substring(0, 16)}...
                          </button>
                          <button
                            onClick={() => setPurgeModalSession(f.session_id)}
                            title={`Purge all files for session '${f.session_id}'`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                          >
                            <Trash2 size={13} color="#ef4444" />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          display: 'inline-block',
                          width: 'fit-content',
                          background: f.origin === 'chat_playground' ? 'rgba(168,85,247,0.12)' : 'rgba(59,130,246,0.12)',
                          color: f.origin === 'chat_playground' ? 'var(--primary-violet)' : '#3b82f6'
                        }}>
                          {f.origin === 'chat_playground' ? 'Playground' : 'External API'}
                        </span>
                        <span style={{
                          fontSize: '0.70rem',
                          color: 'var(--text-muted)'
                        }}>
                          {f.source === 'tool_generated' ? '⚡ Tool Generated' : '📤 Upload'}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.80rem' }}>
                      {formatSize(f.file_size)}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString() + ' ' + new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {f.url && (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-outline"
                            title="Download or open file"
                            style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                          >
                            <Download size={13} />
                          </a>
                        )}
                        <button
                          onClick={() => setDeleteModalFile(f)}
                          title="Permanently delete this file from storage"
                          style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            color: '#ef4444',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.80rem',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            Showing {files.length} of {totalItems} files
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '5px 10px',
                color: page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '5px 10px',
                color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Purge Session Modal */}
      {purgeModalSession && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-box" style={{ maxWidth: '480px', width: '100%', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', marginBottom: '14px' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Purge Session Storage Files?</h3>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              This will permanently delete all cloud and local storage files uploaded or generated during session:
            </p>
            <div style={{
              background: 'var(--bg-input)',
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'monospace',
              fontSize: '0.84rem',
              color: 'var(--primary-violet)',
              marginBottom: '20px',
              wordBreak: 'break-all'
            }}>
              {purgeModalSession}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="btn-outline"
                onClick={() => setPurgeModalSession(null)}
                disabled={purging}
                style={{ padding: '8px 16px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePurgeSession}
                disabled={purging}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.84rem',
                  fontWeight: '600',
                  cursor: purging ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {purging ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                {purging ? 'Purging Files...' : 'Purge All Session Files'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single File Modal */}
      {deleteModalFile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-box" style={{ maxWidth: '480px', width: '100%', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', marginBottom: '14px' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Delete Storage File?</h3>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: '1.5', margin: '0 0 14px 0' }}>
              Are you sure you want to permanently delete this file from <strong>{(deleteModalFile.storage_provider || 'cloud').toUpperCase()}</strong> storage and the database?
            </p>
            <div style={{
              background: 'var(--bg-input)',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                {deleteModalFile.original_name}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {deleteModalFile.storage_path}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--primary-violet)', marginTop: '2px' }}>
                Size: {formatSize(deleteModalFile.file_size)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="btn-outline"
                onClick={() => setDeleteModalFile(null)}
                disabled={deleting}
                style={{ padding: '8px 16px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                disabled={deleting}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.84rem',
                  fontWeight: '600',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {deleting ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting File...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
