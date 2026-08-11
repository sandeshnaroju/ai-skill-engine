import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';

export default function LogViewer({ requestSource, title, subtitle, icon: IconComponent }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Pagination & Filtering state driven by URL search params
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '20', 10);
  const filterType = searchParams.get('sandbox') || 'ALL';
  const selectedTenant = searchParams.get('tenant') || 'ALL';
  const selectedModel = searchParams.get('model') || 'ALL';

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

  const setFilterType = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('sandbox', val);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSelectedTenant = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tenant', val);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSelectedModel = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('model', val);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Lists for dropdown filters
  const [uniqueTenants, setUniqueTenants] = useState([]);
  const [uniqueModels, setUniqueModels] = useState([]);

  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchFilters = async () => {
    try {
      const res = await fetch('/api/v1/logs/filters');
      if (res.ok) {
        const data = await res.json();
        setUniqueTenants(data.tenants || []);
        setUniqueModels(data.models || []);
      }
    } catch (e) {
      console.error('Failed to fetch filters:', e);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        request_source: requestSource,
        tenant_name: selectedTenant,
        model_name: selectedModel,
        sandbox_type: filterType
      });

      const res = await fetch(`/api/v1/logs?${queryParams.toString()}`);
      const data = await res.json();
      
      // Handle either paginated object or fallback raw array
      if (data && data.items !== undefined) {
        setLogs(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalItems(data.total || 0);
      } else {
        setLogs(data || []);
        setTotalPages(1);
        setTotalItems(data ? data.length : 0);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, filterType, selectedTenant, selectedModel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Bar */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {IconComponent && <IconComponent size={22} color="var(--primary-cyan)" />} {title}
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '4px' }}>
            {subtitle}
          </p>
        </div>

        {/* Filters Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Tenant Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Tenant:</span>
            <div style={{ width: '160px' }}>
              <AsyncSearchableDropdown
                value={selectedTenant}
                onChange={setSelectedTenant}
                fetchOptions={async (searchTerm) => {
                  const url = `/api/v1/logs/filters?search_tenant=${encodeURIComponent(searchTerm || '')}`;
                  const res = await fetch(url);
                  const data = await res.json();
                  return [
                    { value: "ALL", label: "All Tenants" },
                    ...(data.tenants || []).map(t => ({ value: t, label: t }))
                  ];
                }}
                placeholder="All Tenants"
              />
            </div>
          </div>

          {/* Model Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Model:</span>
            <div style={{ width: '160px' }}>
              <AsyncSearchableDropdown
                value={selectedModel}
                onChange={setSelectedModel}
                fetchOptions={async (searchTerm) => {
                  const url = `/api/v1/logs/filters?search_model=${encodeURIComponent(searchTerm || '')}`;
                  const res = await fetch(url);
                  const data = await res.json();
                  return [
                    { value: "ALL", label: "All Models" },
                    ...(data.models || []).map(m => ({ value: m, label: m }))
                  ];
                }}
                placeholder="All Models"
              />
            </div>
          </div>

          {/* Sandbox Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Sandbox:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            >
              <option value="ALL">All Sandboxes</option>
              <option value="DOCKER">Docker Sandbox</option>
              <option value="PROCESS">Process Sandbox</option>
              <option value="HTTP_API">HTTP REST API</option>
              <option value="E2B">E2B Sandbox</option>
              <option value="AZURE_ACA">Azure ACA Sandbox</option>
              <option value="FLY_IO">Fly.io Sandbox</option>
              <option value="AWS_LAMBDA">AWS Lambda Sandbox</option>
            </select>
          </div>

          <button className="btn-outline" onClick={fetchLogs} disabled={loading} style={{ padding: '8px 12px' }}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-box" style={{ padding: '20px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '14px 12px' }}>Time / Tenant</th>
              <th style={{ padding: '14px 12px' }}>Skill / Tool / Model</th>
              <th style={{ padding: '14px 12px' }}>Sandbox</th>
              <th style={{ padding: '14px 12px' }}>Executed Command / Code</th>
              <th style={{ padding: '14px 12px' }}>Duration</th>
              <th style={{ padding: '14px 12px' }}>Status</th>
              <th style={{ padding: '14px 12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {requestSource === 'dashboard'
                    ? 'No execution logs recorded in the playground sandbox yet.'
                    : 'No execution logs recorded from API clients yet.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: isExpanded ? 'rgba(0, 242, 254, 0.04)' : 'transparent' }}>
                      <td style={{ padding: '14px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <div>{log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'N/A'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: '500' }}>{log.tenant_name}</div>
                      </td>
                      <td style={{ padding: '14px 12px', fontWeight: '600', color: 'var(--primary-cyan)' }}>
                        <div>{log.skill_name} / {log.tool_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '2px' }}>
                          Model: <span style={{ color: 'var(--text-sub)' }}>{log.model_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <span className={`badge-tag tag-${log.sandbox_type}`}>{log.sandbox_type}</span>
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <code style={{ background: '#04070d', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', color: '#93c5fd' }}>
                          {(log.command || '').length > 55 ? (log.command || '').substring(0, 55) + '...' : (log.command || 'N/A')}
                        </code>
                      </td>
                      <td style={{ padding: '14px 12px', color: 'var(--text-sub)' }}>
                        {log.execution_time_ms} ms
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        {log.exit_code === 0 ? (
                          <span style={{ color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                            <CheckCircle size={14} /> Clean
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent-amber)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                            <AlertTriangle size={14} /> Exit {log.exit_code}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <button
                          className="btn-outline"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          {isExpanded ? 'Close' : 'View Trace'} {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: '16px', background: '#04060b', borderBottom: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                               <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '6px' }}>Executed Command / Code</div>
                              <pre className="code-display" style={{ maxHeight: '140px' }}>{log.command || 'N/A'}</pre>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-sub)', marginBottom: '6px' }}>Output (stdout / stderr)</div>
                              <pre className="code-display" style={{ maxHeight: '140px', color: log.exit_code === 0 ? '#38bdf8' : '#f87171' }}>
                                {log.stdout || log.stderr || 'Clean exit with no output.'}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Showing page <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{page}</span> of <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{totalPages}</span> ({totalItems} logs total)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page Size:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value))}
                style={{ fontSize: '0.8rem', padding: '4px 8px', width: '70px' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn-outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '6px 10px' }}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                className="btn-outline"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ padding: '6px 10px' }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
