import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, Play, Pause, Trash2, RefreshCw, Plus, CheckCircle2,
  AlertTriangle, X, Search, Filter, Mail, Globe, Calendar,
  Zap, Copy, Check, ExternalLink, FileText, ChevronRight, ChevronLeft, Layers, Key
} from 'lucide-react';
import AsyncSearchableDropdown from './AsyncSearchableDropdown';
import { schedulerApi, tenantsApi, userDataApi } from '../api';
import { useToast } from '../context/ToastContext';

export default function SchedulerManager() {
  const { showSuccess, showError } = useToast();

  // Tenant state
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
  const [jobs, setJobs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | paused
  const [triggerFilter, setTriggerFilter] = useState('all'); // all | cron | interval | date
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, total_runs: 0 });

  // Debounce search input and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleTriggerFilterChange = (trigger) => {
    setTriggerFilter(trigger);
    setPage(1);
  };

  // Action states
  const [runningJobId, setRunningJobId] = useState(null);
  const [togglingJobId, setTogglingJobId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [inspectJob, setInspectJob] = useState(null);
  const [copiedResult, setCopiedResult] = useState(false);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userDataTemplates, setUserDataTemplates] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    tenant_id: '',
    prompt: '',
    model_name: 'gemini-2.5-flash',
    trigger_type: 'cron',
    cron_expression: '0 10 * * *',
    interval_minutes: 60,
    run_at: '',
    notify_email: '',
    webhook_url: '',
    user_data_template_id: '',
    store_in_session: true,
  });

  // Sync tenant changes
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

  // Fetch tenants on mount
  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await tenantsApi.list({ page_size: 100, page: 1 });
        const list = res.items || (Array.isArray(res) ? res : []);
        setTenants(list);
      } catch (err) {
        console.error('Failed to load tenants:', err);
      }
    }
    loadTenants();
  }, []);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (selectedTenantId && selectedTenantId !== 'all') {
        params.tenant_id = selectedTenantId;
      }
      if (debouncedSearch && debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (triggerFilter !== 'all') {
        params.trigger_type = triggerFilter;
      }

      const res = await schedulerApi.getJobs(params);
      const items = res.items || (Array.isArray(res) ? res : []);
      setJobs(items);
      const total = res.total ?? items.length;
      setTotalCount(total);
      setTotalPages(res.pages ?? Math.max(1, Math.ceil(total / pageSize)));
      if (res.stats) {
        setStats(res.stats);
      } else {
        setStats({
          total: total,
          active: items.filter(j => j.is_active).length,
          paused: items.filter(j => !j.is_active).length,
          total_runs: items.reduce((acc, j) => acc + (j.run_count || 0), 0),
        });
      }
    } catch (err) {
      showError(err.message || 'Failed to load scheduled jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, debouncedSearch, statusFilter, triggerFilter, page, pageSize, showError]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Run Now (manual trigger)
  const handleTriggerJob = async (job) => {
    setRunningJobId(job.id);
    try {
      const res = await schedulerApi.triggerJob(job.id);
      showSuccess(`Triggered "${job.name}". ${res.message || 'Execution initiated.'}`);
      setTimeout(() => fetchJobs(), 2000);
    } catch (err) {
      showError(err.message || 'Failed to trigger schedule');
    } finally {
      setRunningJobId(null);
    }
  };

  // Toggle Pause/Resume
  const handleToggleActive = async (job) => {
    setTogglingJobId(job.id);
    try {
      if (job.is_active) {
        await schedulerApi.pauseJob(job.id);
        showSuccess(`Paused schedule "${job.name}"`);
      } else {
        await schedulerApi.resumeJob(job.id);
        showSuccess(`Resumed schedule "${job.name}"`);
      }
      fetchJobs();
    } catch (err) {
      showError(err.message || 'Failed to update schedule status');
    } finally {
      setTogglingJobId(null);
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId) => {
    try {
      await schedulerApi.deleteJob(jobId);
      showSuccess('Schedule deleted successfully');
      setConfirmDeleteId(null);
      fetchJobs();
    } catch (err) {
      showError(err.message || 'Failed to delete schedule');
    }
  };

  // Open Create Modal
  const openCreateModal = async () => {
    const defaultTenant = (selectedTenantId && selectedTenantId !== 'all')
      ? selectedTenantId
      : (tenants[0]?.id || '');
    setFormData({
      name: '',
      tenant_id: defaultTenant,
      prompt: '',
      model_name: 'gemini-2.5-flash',
      trigger_type: 'cron',
      cron_expression: '0 10 * * *',
      interval_minutes: 60,
      run_at: '',
      notify_email: '',
      webhook_url: '',
      user_data_template_id: '',
      store_in_session: true,
    });
    setIsCreateModalOpen(true);
    if (defaultTenant) {
      try {
        const res = await userDataApi.list({ tenant_id: defaultTenant, page_size: 50, page: 1 });
        setUserDataTemplates(res.items || (Array.isArray(res) ? res : []));
      } catch (e) {
        setUserDataTemplates([]);
      }
    }
  };

  // Submit Create Schedule
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.prompt.trim()) {
      showError('Schedule name and prompt are required');
      return;
    }
    if (!formData.tenant_id) {
      showError('Please select a tenant for this schedule');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      tenant_id: formData.tenant_id,
      prompt: formData.prompt.trim(),
      model_name: formData.model_name || 'gemini-2.5-flash',
      trigger_type: formData.trigger_type,
      cron_expression: formData.trigger_type === 'cron' ? formData.cron_expression : null,
      interval_seconds: formData.trigger_type === 'interval' ? Math.max(10, parseInt(formData.interval_minutes || 60, 10) * 60) : null,
      run_at: formData.trigger_type === 'date' && formData.run_at ? new Date(formData.run_at).toISOString() : null,
      notify_email: formData.notify_email?.trim() || null,
      webhook_url: formData.webhook_url?.trim() || null,
      user_data_template_id: formData.user_data_template_id || null,
      store_in_session: Boolean(formData.store_in_session),
    };

    setCreating(true);
    try {
      await schedulerApi.createJob(payload);
      showSuccess(`Schedule "${payload.name}" created successfully`);
      setIsCreateModalOpen(false);
      fetchJobs();
    } catch (err) {
      showError(err.message || 'Failed to create schedule');
    } finally {
      setCreating(false);
    }
  };

  // Copy inspection output
  const handleCopyResult = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    } catch {
      showError('Failed to copy to clipboard');
    }
  };

  // Stats from backend scope (or fallback)
  const activeCount = stats.active ?? jobs.filter(j => j.is_active).length;
  const pausedCount = stats.paused ?? jobs.filter(j => !j.is_active).length;
  const totalRuns = stats.total_runs ?? jobs.reduce((acc, j) => acc + (j.run_count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. HEADER & TENANT SELECTOR                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="glass-box" style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Clock size={22} color="var(--primary-violet)" /> Scheduled Jobs & Automated Tasks
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.86rem', margin: '4px 0 0 0' }}>
            Automated cron schedules, background intervals, and multi-channel notification dispatch.
          </p>
        </div>

        {/* Tenant Filter and Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ width: '220px' }}>
            <AsyncSearchableDropdown
              value={selectedTenantId}
              onChange={(val) => handleTenantChange(val)}
              initialLabel={
                !selectedTenantId || selectedTenantId === 'all'
                  ? '🌐 All Tenants'
                  : (tenants.find(t => t.id === selectedTenantId)?.name ? `🔑 ${tenants.find(t => t.id === selectedTenantId).name}` : '')
              }
              fetchOptions={async (search) => {
                const res = await tenantsApi.list({ search: search || '', page_size: 50, page: 1 });
                const items = res.items || (Array.isArray(res) ? res : []);
                const opts = items.map(t => ({
                  value: t.id,
                  label: `🔑 ${t.name}`
                }));
                return [{ value: 'all', label: '🌐 All Tenants (Global View)' }, ...opts];
              }}
              placeholder="Filter by Tenant..."
            />
          </div>

          <button
            type="button"
            className="btn-outline"
            onClick={fetchJobs}
            title="Refresh Schedules"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={openCreateModal}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600',
              fontSize: '0.84rem'
            }}
          >
            <Plus size={15} />
            <span>New Schedule</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. STATS OVERVIEW CARDS                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '14px'
      }}>
        <div className="glass-box" style={{ padding: '14px 18px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Registered
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
            {stats.total ?? totalCount}
          </div>
        </div>

        <div className="glass-box" style={{ padding: '14px 18px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active Schedules
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981', marginTop: '2px' }}>
            {activeCount}
          </div>
        </div>

        <div className="glass-box" style={{ padding: '14px 18px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Paused Schedules
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b', marginTop: '2px' }}>
            {pausedCount}
          </div>
        </div>

        <div className="glass-box" style={{ padding: '14px 18px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Executions
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-violet)', marginTop: '2px' }}>
            {totalRuns}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. FILTERS & SEARCH BAR                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="glass-box" style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '320px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search by job name, prompt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px', paddingRight: searchTerm ? '28px' : '10px', height: '34px', fontSize: '0.82rem', width: '100%' }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px'
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            {[
              { id: 'all', label: 'All Status' },
              { id: 'active', label: 'Active' },
              { id: 'paused', label: 'Paused' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleStatusFilterChange(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  background: statusFilter === tab.id ? 'var(--primary-violet)' : 'transparent',
                  color: statusFilter === tab.id ? '#ffffff' : 'var(--text-sub)',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Trigger Filter */}
          <select
            className="input-field"
            value={triggerFilter}
            onChange={(e) => handleTriggerFilterChange(e.target.value)}
            style={{ height: '34px', fontSize: '0.82rem', width: '140px' }}
          >
            <option value="all">All Triggers</option>
            <option value="cron">Cron</option>
            <option value="interval">Interval</option>
            <option value="date">One-off Date</option>
          </select>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {totalCount === 0 ? (
            <span>0 schedules</span>
          ) : (
            <span>
              Showing <strong>{Math.min((page - 1) * pageSize + 1, totalCount)}</strong>–<strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> schedules
            </span>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. SCHEDULES TABLE / LIST                                     */}
      {/* ───────────────────────────────────────────────────────────── */}
      {loading && jobs.length === 0 ? (
        <div className="glass-box" style={{ padding: '50px 20px', textAlign: 'center' }}>
          <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--primary-violet)', margin: '0 auto 10px auto' }} />
          <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '600' }}>Loading scheduled jobs...</div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass-box" style={{ padding: '50px 20px', textAlign: 'center' }}>
          <Clock size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px auto', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 6px 0' }}>
            No Scheduled Jobs Found
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 18px auto' }}>
            {searchTerm || statusFilter !== 'all' || triggerFilter !== 'all'
              ? 'No schedules match the selected filters.'
              : 'You can create scheduled jobs in Chat Playground or by clicking New Schedule.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {(searchTerm || statusFilter !== 'all' || triggerFilter !== 'all') && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setTriggerFilter('all');
                  setPage(1);
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.84rem' }}
              >
                Clear Filters
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={openCreateModal}
              style={{ padding: '8px 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
            >
              <Plus size={15} />
              <span>Create Schedule</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-box" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: '220px' }}>Schedule & Task</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '120px' }}>Tenant</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '140px' }}>Trigger Rule</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '150px' }}>Delivery Target</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '90px' }}>Runs</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', width: '110px' }}>Last Run</th>
                  <th style={{ padding: '12px 16px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right', width: '140px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isRunning = runningJobId === job.id;
                  const isToggling = togglingJobId === job.id;
                  const tenantName = job.tenant?.name || job.tenant_id;

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Name & Prompt */}
                      <td style={{ padding: '12px 16px', maxWidth: '280px', minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: job.is_active ? '#10b981' : '#f59e0b',
                            display: 'inline-block',
                            flexShrink: 0
                          }} />
                          <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.name}>
                            {job.name}
                          </span>
                        </div>
                        <div style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.75rem',
                          lineHeight: '1.3',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word'
                        }} title={job.prompt}>
                          {job.prompt}
                        </div>
                        <div style={{ marginTop: '3px', fontSize: '0.7rem', color: 'var(--text-sub)' }}>
                          Model: <code>{job.model_name || 'default'}</code>
                        </div>
                      </td>

                      {/* Tenant */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '5px', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary-violet)', fontSize: '0.74rem', fontWeight: '600' }}>
                          <Key size={11} />
                          <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tenantName}>{tenantName}</span>
                        </div>
                        {job.tenant?.timezone && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {job.tenant.timezone}
                          </div>
                        )}
                      </td>

                      {/* Trigger Rule */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {job.trigger_type === 'cron' && (
                          <div>
                            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', fontSize: '0.74rem', fontWeight: '600' }}>
                              Cron: {job.cron_expression}
                            </span>
                            {job.next_run_at && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Next: {new Date(job.next_run_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        )}
                        {job.trigger_type === 'interval' && (
                          <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontSize: '0.74rem', fontWeight: '600' }}>
                            Every {job.interval_seconds >= 3600 ? `${Math.round(job.interval_seconds / 3600)}h` : `${Math.round(job.interval_seconds / 60)}m`}
                          </span>
                        )}
                        {job.trigger_type === 'date' && (
                          <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', fontSize: '0.74rem', fontWeight: '600' }}>
                            Once: {job.run_at ? new Date(job.run_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'N/A'}
                          </span>
                        )}
                      </td>

                      {/* Delivery Target */}
                      <td style={{ padding: '12px 14px', maxWidth: '150px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {job.notify_email ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-main)' }}>
                              <Mail size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={job.notify_email}>
                                {job.notify_email}
                              </span>
                            </div>
                          ) : null}

                          {job.webhook_url ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-main)' }}>
                              <Globe size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={job.webhook_url}>
                                Webhook
                              </span>
                            </div>
                          ) : null}

                          {!job.notify_email && !job.webhook_url && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              In-app session
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Executions */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.82rem' }}>
                          {job.run_count || 0} runs
                        </div>
                        {job.last_error ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#ef4444', fontSize: '0.7rem', marginTop: '2px' }}>
                            <AlertTriangle size={11} />
                            <span>Error</span>
                          </div>
                        ) : job.run_count > 0 ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#10b981', fontSize: '0.7rem', marginTop: '2px' }}>
                            <CheckCircle2 size={11} />
                            <span>Healthy</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Pending
                          </div>
                        )}
                      </td>

                      {/* Last Run */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {job.last_run_at ? (
                          <div>
                            <div>{new Date(job.last_run_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                            <div style={{ fontSize: '0.68rem' }}>{new Date(job.last_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        ) : (
                          'Never'
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => handleTriggerJob(job)}
                            disabled={isRunning}
                            title="Execute schedule immediately"
                            style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Play size={12} className={isRunning ? 'animate-spin' : ''} />
                            <span>Run</span>
                          </button>

                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => handleToggleActive(job)}
                            disabled={isToggling}
                            title={job.is_active ? 'Pause Schedule' : 'Resume Schedule'}
                            style={{ padding: '5px 7px', borderRadius: '6px' }}
                          >
                            {job.is_active ? <Pause size={13} color="#f59e0b" /> : <Play size={13} color="#10b981" />}
                          </button>

                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => setInspectJob(job)}
                            title="Inspect Output"
                            style={{ padding: '5px 7px', borderRadius: '6px' }}
                          >
                            <FileText size={13} />
                          </button>

                          {confirmDeleteId === job.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                style={{ padding: '4px 7px', borderRadius: '5px', background: '#ef4444', color: '#fff', border: 'none', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer' }}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => setConfirmDeleteId(null)}
                                style={{ padding: '4px 6px', borderRadius: '5px', fontSize: '0.7rem' }}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => setConfirmDeleteId(job.id)}
                              title="Delete Schedule"
                              style={{ padding: '5px 7px', borderRadius: '6px', color: '#ef4444' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'rgba(255,255,255,0.01)'
            }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Showing <strong style={{ color: 'var(--text-main)' }}>{Math.min((page - 1) * pageSize + 1, totalCount)}</strong>–<strong style={{ color: 'var(--text-main)' }}>{Math.min(page * pageSize, totalCount)}</strong> of <strong style={{ color: 'var(--text-main)' }}>{totalCount}</strong> schedules
                {totalPages > 1 && (
                  <span> &nbsp;·&nbsp; Page <strong style={{ color: 'var(--text-sub)' }}>{page}</strong> of <strong style={{ color: 'var(--text-sub)' }}>{totalPages}</strong></span>
                )}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="input-field"
                    style={{ height: '30px', fontSize: '0.78rem', padding: '2px 8px', width: '70px' }}
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>

                  <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)', padding: '0 4px', fontWeight: '600' }}>
                    {page} / {totalPages || 1}
                  </span>

                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5. CREATE SCHEDULE MODAL                                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isCreateModalOpen && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-box" style={{
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflowY: 'auto',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            background: 'var(--bg-card)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} color="var(--primary-violet)" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Create Automated Schedule
                </h2>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ padding: '6px', borderRadius: '8px' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Job Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  Schedule Name *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Daily Tech News & Market Briefing"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                  required
                />
              </div>

              {/* Tenant Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  Tenant (Context & Budget) *
                </label>
                <select
                  className="input-field"
                  value={formData.tenant_id}
                  onChange={async (e) => {
                    const newTenantId = e.target.value;
                    setFormData({ ...formData, tenant_id: newTenantId, user_data_template_id: '' });
                    if (newTenantId) {
                      try {
                        const res = await userDataApi.list({ tenant_id: newTenantId, page_size: 50, page: 1 });
                        setUserDataTemplates(res.items || (Array.isArray(res) ? res : []));
                      } catch {
                        setUserDataTemplates([]);
                      }
                    } else {
                      setUserDataTemplates([]);
                    }
                  }}
                  style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                  required
                >
                  <option value="" disabled>Select Tenant</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.timezone || 'UTC'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Secrets & User Data Profile Binding */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  <Key size={13} style={{ color: 'var(--primary)' }} />
                  <span>Secrets & User Data Profile (Optional)</span>
                </label>
                <select
                  className="input-field"
                  value={formData.user_data_template_id}
                  onChange={(e) => setFormData({ ...formData, user_data_template_id: e.target.value })}
                  style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                >
                  <option value="">None (Do not attach user data secrets)</option>
                  {userDataTemplates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.description ? `— ${tpl.description}` : ''}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  If selected, secrets from this profile are loaded dynamically at runtime when the job fires. If omitted, no profile secrets are injected.
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  Prompt (What the agent executes) *
                </label>
                <textarea
                  className="input-field"
                  placeholder="e.g. Search for top AI breakthroughs today, summarize the top 3 items, and draft action items."
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  rows={4}
                  style={{ width: '100%', borderRadius: '10px', padding: '10px 12px', fontSize: '0.85rem' }}
                  required
                />
              </div>

              {/* Trigger Type Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { id: 'cron', label: 'Cron Expression', desc: 'Specific time / days' },
                  { id: 'interval', label: 'Interval', desc: 'Every X minutes' },
                  { id: 'date', label: 'One-off Run', desc: 'Specific future date' }
                ].map(item => (
                  <div
                    key={item.id}
                    onClick={() => setFormData({ ...formData, trigger_type: item.id })}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: formData.trigger_type === item.id ? '2px solid var(--primary-violet)' : '1px solid var(--border-subtle)',
                      background: formData.trigger_type === item.id ? 'rgba(139, 92, 246, 0.08)' : 'var(--bg-input)',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)' }}>{item.label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              {/* Trigger Specific Config */}
              {formData.trigger_type === 'cron' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                    Standard 5-Part Cron Expression (Minute Hour Day Month DayOfWeek)
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="0 10 * * * (Every day at 10:00 AM in tenant's timezone)"
                    value={formData.cron_expression}
                    onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                    style={{ width: '100%', borderRadius: '10px', height: '38px', fontFamily: 'monospace' }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Examples: <code>0 10 * * *</code> (Daily 10am), <code>0 9 * * 1-5</code> (Mon-Fri 9am), <code>*/30 * * * *</code> (Every 30m)
                  </div>
                </div>
              )}

              {formData.trigger_type === 'interval' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                    Interval (in minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="input-field"
                    placeholder="60"
                    value={formData.interval_minutes}
                    onChange={(e) => setFormData({ ...formData, interval_minutes: e.target.value })}
                    style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                  />
                </div>
              )}

              {formData.trigger_type === 'date' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                    Run Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    value={formData.run_at}
                    onChange={(e) => setFormData({ ...formData, run_at: e.target.value })}
                    style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                  />
                </div>
              )}

              {/* Delivery Channels */}
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Delivery Channels (Optional)
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <Mail size={13} />
                    <span>Notification Email</span>
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="user@example.com (sends formatted email via configured SMTP)"
                    value={formData.notify_email}
                    onChange={(e) => setFormData({ ...formData, notify_email: e.target.value })}
                    style={{ width: '100%', borderRadius: '8px', height: '36px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <Globe size={13} />
                    <span>Webhook URL</span>
                  </label>
                  <input
                    type="url"
                    className="input-field"
                    placeholder="https://api.yourdomain.com/webhooks/scheduler"
                    value={formData.webhook_url}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                    style={{ width: '100%', borderRadius: '8px', height: '36px' }}
                  />
                </div>
              </div>

              {/* LLM Model & Options */}
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                    LLM Model
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={formData.model_name}
                    onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                    style={{ width: '100%', borderRadius: '10px', height: '38px' }}
                  />
                </div>

                <div style={{ paddingTop: '22px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={formData.store_in_session}
                      onChange={(e) => setFormData({ ...formData, store_in_session: e.target.checked })}
                    />
                    <span>Save in Session History</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '10px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating}
                  style={{ padding: '9px 20px', borderRadius: '10px', fontWeight: '700' }}
                >
                  {creating ? 'Creating...' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 6. INSPECT OUTPUT MODAL                                       */}
      {/* ───────────────────────────────────────────────────────────── */}
      {inspectJob && (
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
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-box" style={{
            width: '100%',
            maxWidth: '720px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            background: 'var(--bg-card)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 2px 0' }}>
                  Execution Details: {inspectJob.name}
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Total Runs: {inspectJob.run_count || 0} • Last Run: {inspectJob.last_run_at ? new Date(inspectJob.last_run_at).toLocaleString() : 'Never'}
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setInspectJob(null)}
                style={{ padding: '6px', borderRadius: '8px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Prompt Box */}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Prompt Executed
                </div>
                <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-input)', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                  {inspectJob.prompt}
                </div>
              </div>

              {/* Error Box if any */}
              {inspectJob.last_error && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#ef4444', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={13} />
                    <span>Last Error</span>
                  </div>
                  <pre style={{ margin: 0, padding: '12px 14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                    {inspectJob.last_error}
                  </pre>
                </div>
              )}

              {/* Output Result Box */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Last Output Response
                  </div>
                  {inspectJob.last_result && (
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => handleCopyResult(inspectJob.last_result)}
                      style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {copiedResult ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      <span>{copiedResult ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>

                {inspectJob.last_result ? (
                  <div style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    fontSize: '0.85rem',
                    color: 'var(--text-main)',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '350px',
                    overflowY: 'auto'
                  }}>
                    {inspectJob.last_result}
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', borderRadius: '10px', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No execution results recorded yet. Click "Run" on this schedule to execute it now.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  handleTriggerJob(inspectJob);
                  setInspectJob(null);
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={14} />
                <span>Run Schedule Now</span>
              </button>

              <button
                type="button"
                className="btn-outline"
                onClick={() => setInspectJob(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.82rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

