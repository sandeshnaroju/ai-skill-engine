import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, RefreshCw, ChevronLeft, ChevronRight, X, Clock, CheckCircle, AlertCircle, Loader, Terminal, Cpu, ChevronDown, ChevronUp, Search } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';

const STATUS_STYLES = {
  completed: { color: 'var(--primary-emerald)', icon: CheckCircle, label: 'Completed' },
  error: { color: 'var(--accent-rose)', icon: AlertCircle, label: 'Error' },
  pending: { color: 'var(--accent-amber)', icon: Loader, label: 'Pending' }
};

const SOURCE_STYLES = {
  api: { label: 'API', bg: 'rgba(6, 182, 212, 0.12)', color: 'var(--primary-cyan)' },
  dashboard: { label: 'Dashboard', bg: 'rgba(139, 92, 246, 0.12)', color: 'var(--primary-violet)' }
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: '600', color: s.color, background: `${s.color}18`, padding: '2px 8px', borderRadius: '999px' }}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

function SourceBadge({ source }) {
  const s = SOURCE_STYLES[source] || SOURCE_STYLES.api;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: '600', color: s.color, background: s.bg, padding: '2px 8px', borderRadius: '999px' }}>
      {s.label}
    </span>
  );
}

function ExecutionLogItem({ log }) {
  const [expanded, setExpanded] = useState(false);
  const success = log.exit_code === 0;
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', fontSize: '0.82rem' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer', background: 'var(--bg-input)', userSelect: 'none' }}
      >
        <Cpu size={13} color={success ? 'var(--primary-emerald)' : 'var(--accent-rose)'} />
        <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{log.tool_name}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{log.skill_name}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
          <span className={`badge-tag tag-${log.sandbox_type}`} style={{ fontSize: '0.7rem' }}>{log.sandbox_type}</span>
          {log.execution_time_ms}ms · exit {log.exit_code}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#04070e' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '3px' }}>COMMAND</div>
            <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#93c5fd', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{log.command}</pre>
          </div>
          {log.stdout && (
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--primary-emerald)', fontWeight: '600', marginBottom: '3px' }}>STDOUT</div>
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#34d399', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{log.stdout}</pre>
            </div>
          )}
          {log.stderr && (
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: '600', marginBottom: '3px' }}>STDERR</div>
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{log.stderr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestDrawer({ requestId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    fetch(`/api/v1/requests/${requestId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [requestId]);

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border-subtle)', zIndex: 9998, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)' }}>Request Detail</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{requestId}</div>
        </div>
        <button className="btn-outline" onClick={onClose} style={{ padding: '6px 8px' }}><X size={16} /></button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <Loader size={20} className="spin" /> &nbsp; Loading...
        </div>
      ) : !data ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-rose)' }}>Failed to load request</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              ['Status', <StatusBadge status={data.status} />],
              ['Source', <SourceBadge source={data.request_source} />],
              ['Tenant', data.tenant_name],
              ['Model', data.model_name || '—'],
              ['Tools Called', data.tools_called],
              ['Duration', data.total_duration_ms ? `${data.total_duration_ms}ms` : '—'],
              ['Prompt Tokens', data.prompt_tokens || 0],
              ['Completion Tokens', data.completion_tokens || 0],
              ['USD Cost', data.cost_usd != null && data.cost_usd > 0 ? `$${data.cost_usd.toFixed(6)}` : '$0.000000'],
              ['Session ID', <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>{data.session_id || '—'}</span>],
              ['App ID', <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>{data.app_id || '—'}</span>],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: '500' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* User message */}
          <div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px' }}>USER MESSAGE</div>
            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '8px', padding: '12px', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: '1.5' }}>
              {data.user_message}
            </div>
          </div>

          {/* Assistant response */}
          {data.assistant_response && (
            <div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px' }}>ASSISTANT RESPONSE</div>
              <div style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: '8px', padding: '12px', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {data.assistant_response}
              </div>
            </div>
          )}

          {/* Error */}
          {data.error_detail && (
            <div>
              <div style={{ fontSize: '0.76rem', color: 'var(--accent-rose)', fontWeight: '600', marginBottom: '6px' }}>ERROR</div>
              <div style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px', padding: '12px', fontSize: '0.82rem', color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
                {data.error_detail}
              </div>
            </div>
          )}

          {/* Execution logs */}
          {data.execution_logs && data.execution_logs.length > 0 && (
            <div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '8px' }}>
                TOOL EXECUTIONS ({data.execution_logs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.execution_logs.map(log => (
                  <ExecutionLogItem key={log.id} log={log} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RequestLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  // URL State Sync
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '20', 10);
  const filterSource = searchParams.get('source') || '';
  const filterStatus = searchParams.get('status') || '';
  const searchMsg = searchParams.get('search') || '';
  const selectedTenant = searchParams.get('tenant') || '';
  const selectedId = searchParams.get('selected_id') || null;

  const setPage = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', typeof val === 'function' ? val(page).toString() : val.toString());
    setSearchParams(nextParams);
  };

  const setPageSize = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page_size', typeof val === 'function' ? val(pageSize).toString() : val.toString());
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setFilterSource = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('source', val);
    else nextParams.delete('source');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setFilterStatus = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('status', val);
    else nextParams.delete('status');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSearchMsg = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('search', val);
    else nextParams.delete('search');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSelectedTenant = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('tenant', val);
    else nextParams.delete('tenant');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSelectedId = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('selected_id', val);
    else nextParams.delete('selected_id');
    setSearchParams(nextParams);
  };

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), page_size: pageSize.toString() });
      if (filterSource) params.append('request_source', filterSource);
      if (filterStatus) params.append('status', filterStatus);
      if (selectedTenant && selectedTenant !== 'ALL') params.append('tenant_name', selectedTenant);
      if (searchMsg.trim()) params.append('search', searchMsg.trim());

      const res = await fetch(`/api/v1/requests?${params.toString()}`);
      const data = await res.json();
      if (data.items !== undefined) {
        setRequests(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalItems(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to fetch request logs:', e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterSource, filterStatus, selectedTenant, searchMsg]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const formatTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={21} color="var(--primary-cyan)" /> Request Logs
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '3px' }}>
            Every chat request — API and Dashboard — logged with full detail and linked tool executions.
          </p>
        </div>
        <button className="btn-outline" onClick={fetchRequests} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="glass-box" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '180px' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search user messages..."
            value={searchMsg}
            onChange={e => { setSearchMsg(e.target.value); setPage(1); }}
            style={{ paddingLeft: '32px', fontSize: '0.84rem', width: '100%' }}
          />
        </div>

        {/* Tenant filter */}
        <div style={{ width: '170px' }}>
          <AsyncSearchableDropdown
            value={selectedTenant}
            onChange={val => { setSelectedTenant(val); setPage(1); }}
            fetchOptions={async (searchTerm) => {
              const url = `/api/v1/tenants?search=${encodeURIComponent(searchTerm || '')}&page_size=10&page=1`;
              const res = await fetch(url);
              const data = await res.json();
              return [
                { value: 'ALL', label: 'All Tenants' },
                ...(data.items || []).map(t => ({ value: t.name, label: t.name }))
              ];
            }}
            placeholder="All Tenants"
          />
        </div>

        {/* Source filter */}
        <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }} style={{ width: '130px', fontSize: '0.84rem' }}>
          <option value="">All Sources</option>
          <option value="api">API</option>
          <option value="dashboard">Dashboard</option>
        </select>

        {/* Status filter */}
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={{ width: '130px', fontSize: '0.84rem' }}>
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-box" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                {['Time', 'Status', 'Source', 'Tenant', 'Model', 'User Message', 'Tools', 'Duration', 'Est. Cost', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Tools' ? 'center' : 'left', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={18} className="spin" style={{ margin: 'auto' }} /></td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No requests found matching filters.</td></tr>
              ) : requests.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '0.8rem' }}>{formatTime(r.created_at)}</div>
                    <div style={{ fontSize: '0.7rem' }}>{formatDate(r.created_at)}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 16px' }}><SourceBadge source={r.request_source} /></td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>{r.tenant_name}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{r.model_name || '—'}</td>
                  <td style={{ padding: '12px 16px', maxWidth: '220px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-sub)' }} title={r.user_message}>
                      {r.user_message}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: r.tools_called > 0 ? 'var(--primary-cyan)' : 'var(--text-muted)', fontWeight: '600' }}>{r.tools_called}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.total_duration_ms != null ? `${r.total_duration_ms}ms` : '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-sub)', whiteSpace: 'nowrap', fontWeight: '500' }}>
                    {r.cost_usd != null && r.cost_usd > 0 ? `$${r.cost_usd.toFixed(6)}` : '$0.000000'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button className="btn-outline" style={{ padding: '3px 10px', fontSize: '0.74rem' }} onClick={e => { e.stopPropagation(); setSelectedId(r.id); }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Page <strong style={{ color: 'var(--text-sub)' }}>{page}</strong> of <strong style={{ color: 'var(--text-sub)' }}>{totalPages}</strong> &nbsp;·&nbsp; {totalItems} requests total
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '5px 12px', fontSize: '0.8rem' }}>
                <ChevronLeft size={13} /> Prev
              </button>
              <button className="btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '5px 12px', fontSize: '0.8rem' }}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <>
          <div
            onClick={() => setSelectedId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9997 }}
          />
          <RequestDrawer requestId={selectedId} onClose={() => setSelectedId(null)} />
        </>
      )}
    </div>
  );
}
