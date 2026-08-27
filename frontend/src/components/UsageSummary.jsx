import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DollarSign, Activity, Cpu, Key, RefreshCw, Layers, TrendingUp, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { logsApi, tenantsApi } from '../api';

const SOURCE_STYLES = {
  api: { label: 'API', bg: 'rgba(6, 182, 212, 0.12)', color: 'var(--primary-cyan)' },
  dashboard: { label: 'Dashboard', bg: 'rgba(139, 92, 246, 0.12)', color: 'var(--primary-violet)' }
};

function SourceBadge({ source }) {
  const s = SOURCE_STYLES[source] || SOURCE_STYLES.api;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: '600', color: s.color, background: s.bg, padding: '2px 8px', borderRadius: '999px' }}>
      {s.label}
    </span>
  );
}

export default function UsageSummary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], totals: { request_count: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 } });
  const [loading, setLoading] = useState(false);

  // URL state sync
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '10', 10);
  const selectedTenant = searchParams.get('tenant') || '';
  const searchModel = searchParams.get('model') || '';
  const selectedSource = searchParams.get('source') || 'ALL';

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

  const setSelectedTenant = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('tenant', val);
    else nextParams.delete('tenant');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSearchModel = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) nextParams.set('model', val);
    else nextParams.delete('model');
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const setSelectedSource = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('source', val);
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchUsageData = useCallback(async () => {
    setLoading(true);
    try {
      const json = await logsApi.getUsageSummary({
        page,
        page_size: pageSize,
        tenant_name: (selectedTenant && selectedTenant !== 'ALL') ? selectedTenant : undefined,
        model_name: searchModel.trim() || undefined,
        request_source: (selectedSource && selectedSource !== 'ALL') ? selectedSource : undefined,
      });

      setData(json);
      setTotalPages(json.pages || 1);
      setTotalItems(json.total || 0);
    } catch (e) {
      console.error('Failed to fetch usage summary:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, searchModel, selectedSource, page, pageSize]);

  useEffect(() => {
    fetchUsageData();
  }, [fetchUsageData]);

  // Handlers - note: each setter already resets page to 1 in one batch write
  const handleTenantChange = (val) => {
    setSelectedTenant(val);
  };

  const handleModelChange = (e) => {
    setSearchModel(e.target.value);
  };

  const handleSourceChange = (e) => {
    setSelectedSource(e.target.value);
  };

  const formatCost = (val) => {
    return val != null ? `$${val.toFixed(6)}` : '$0.000000';
  };

  const formatNumber = (num) => {
    return num != null ? num.toLocaleString() : '0';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Panel */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DollarSign size={22} color="var(--primary-emerald)" /> LLM Cost & Usage Analytics
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '4px' }}>
            Track token consumption and estimated API costs accumulated by tenants and LLM models.
          </p>
        </div>
        <button className="btn-outline" onClick={fetchUsageData} disabled={loading} style={{ padding: '8px 12px' }}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters Panel */}
      <div className="glass-box" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Model Filter (Dropdown + Search) */}
        <div style={{ width: '220px' }}>
          <AsyncSearchableDropdown
            value={searchModel}
            onChange={(val) => setSearchModel(val === 'ALL' ? '' : val)}
            fetchOptions={async (searchTerm) => {
              const data = await tenantsApi.listLlms(null, { search: searchTerm || '', page_size: 15, page: 1 });
              const items = data.items || [];
              const uniqueModels = Array.from(new Set(items.map(m => m.model_name).filter(Boolean)));
              return [
                { value: 'ALL', label: '🤖 All LLM Models' },
                ...uniqueModels.map(m => ({ value: m, label: `🤖 ${m}` }))
              ];
            }}
            placeholder="Filter by Model"
          />
        </div>

        {/* Tenant Filter */}
        <div style={{ width: '220px' }}>
          <AsyncSearchableDropdown
            value={selectedTenant}
            onChange={handleTenantChange}
            fetchOptions={async (searchTerm) => {
              const data = await tenantsApi.list({ search: searchTerm || '', page_size: 10, page: 1 });
              const items = data.items || Array.isArray(data) ? (data.items || data) : [];
              return [
                { value: 'ALL', label: 'All Tenants' },
                ...items.map(t => ({ value: t.name, label: `🔑 ${t.name}` }))
              ];
            }}
            placeholder="All Tenants"
          />
        </div>

        {/* Source Filter */}
        <div style={{ width: '160px' }}>
          <select 
            value={selectedSource} 
            onChange={handleSourceChange}
            style={{ width: '100%', fontSize: '0.84rem', padding: '9px 12px' }}
          >
            <option value="ALL">🌐 All Sources</option>
            <option value="api">🔌 API Keys</option>
            <option value="dashboard">💻 Dashboard Playground</option>
          </select>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Total Estimated Cost', val: formatCost(data.totals.cost_usd), icon: DollarSign, color: 'var(--primary-emerald)' },
          { label: 'Total Chat Requests', val: formatNumber(data.totals.request_count), icon: Activity, color: 'var(--primary-cyan)' },
          { label: 'Total Input Tokens', val: formatNumber(data.totals.prompt_tokens), icon: TrendingUp, color: 'var(--primary-violet)' },
          { label: 'Total Output Tokens', val: formatNumber(data.totals.completion_tokens), icon: Cpu, color: 'var(--accent-amber)' },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="glass-box" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: `${c.color}15`, border: `1px solid ${c.color}30`, padding: '12px', borderRadius: '12px' }}>
                <Icon size={24} color={c.color} />
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '4px' }}>{c.val}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grouped usage list */}
      <div className="glass-box" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.01)' }}>
          <span style={{ fontWeight: '700', fontSize: '0.94rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} color="var(--primary-violet)" /> Consumption by Tenant & Model Group
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                {['Tenant Name', 'Model Name', 'Source', 'Requests', 'Input Tokens', 'Output Tokens', 'Accumulated Cost'].map((h, i) => (
                  <th key={i} style={{ padding: '12px 20px', textAlign: i >= 3 ? 'right' : 'left', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No recorded token usage found. Send some prompts in the playground or call client APIs.
                  </td>
                </tr>
              ) : (
                data.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: '700', color: 'var(--text-main)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Key size={13} color="var(--primary-cyan)" /> {item.tenant_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-sub)' }}>
                      <span className="badge-tag tag-docker" style={{ fontSize: '0.76rem' }}>
                        {item.model_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <SourceBadge source={item.request_source} />
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--text-sub)', fontWeight: '600' }}>
                      {formatNumber(item.request_count)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {formatNumber(item.prompt_tokens)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {formatNumber(item.completion_tokens)}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', color: 'var(--primary-emerald)', fontWeight: '700', fontSize: '0.88rem' }}>
                      {formatCost(item.cost_usd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Page <strong style={{ color: 'var(--text-sub)' }}>{page}</strong> of <strong style={{ color: 'var(--text-sub)' }}>{totalPages}</strong> &nbsp;·&nbsp; {totalItems} groups total
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
    </div>
  );
}
