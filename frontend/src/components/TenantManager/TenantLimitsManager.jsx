import React, { useState, useEffect, useRef } from 'react';
import { 
  Gauge, ShieldCheck, Clock, Calendar, AlertCircle, Save, 
  RefreshCw, Check, Sparkles, Layers, DollarSign, Database, Globe
} from 'lucide-react';
import { tenantsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import SearchableTimezoneSelect from './SearchableTimezoneSelect';

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST - UTC+05:30)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern Time - UTC-05:00 / UTC-04:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time - UTC-06:00 / UTC-05:00)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time - UTC-07:00 / UTC-06:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific Time - UTC-08:00 / UTC-07:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST - UTC+00:00 / UTC+01:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST - UTC+01:00 / UTC+02:00)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST - UTC+01:00 / UTC+02:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST - UTC+04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT - UTC+08:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST - UTC+09:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT - UTC+10:00 / UTC+11:00)' },
];

const MONTH_NAMES = [
  { value: 1, label: 'January (Calendar Year)' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April (Fiscal Year - UK/India)' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July (Fiscal Year - US State)' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October (Fiscal Year - US Federal)' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function TenantLimitsManager({ selectedTenant, tenantLlms, fetchTenants }) {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState(null);

  // References for programmatically opening native popups anywhere on click
  const timeInputRef = useRef(null);
  const dateInputRef = useRef(null);

  // Limit form values
  const [maxContextTokens, setMaxContextTokens] = useState(1000000);
  const [sessionTokenLimit, setSessionTokenLimit] = useState('');
  const [sessionCostLimit, setSessionCostLimit] = useState('');
  const [dailyTokenLimit, setDailyTokenLimit] = useState('');
  const [dailyCostLimit, setDailyCostLimit] = useState('');
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState('');
  const [monthlyCostLimit, setMonthlyCostLimit] = useState('');
  const [yearlyTokenLimit, setYearlyTokenLimit] = useState('');
  const [yearlyCostLimit, setYearlyCostLimit] = useState('');

  // Schedule & Timezone values
  const [timezone, setTimezone] = useState('UTC');
  const [dailyResetTime, setDailyResetTime] = useState('00:00');
  const [monthlyResetDay, setMonthlyResetDay] = useState(1);
  const [yearlyResetMonth, setYearlyResetMonth] = useState(1);
  const [yearlyResetDay, setYearlyResetDay] = useState(1);

  // Check if any active model has 0.0 pricing rates
  const hasZeroRates = tenantLlms && tenantLlms.length > 0 && tenantLlms.some(
    (m) => (m.input_rate === 0 || m.input_rate === null) && (m.output_rate === 0 || m.output_rate === null)
  );

  useEffect(() => {
    if (selectedTenant?.id) {
      loadLimits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenant?.id]);

  const loadLimits = async () => {
    setLoading(true);
    try {
      const data = await tenantsApi.getLimits(selectedTenant.id);
      if (data?.limits) {
        setMaxContextTokens(data.limits.max_context_tokens || 1000000);
        setSessionTokenLimit(data.limits.session_token_limit ?? '');
        setSessionCostLimit(data.limits.session_cost_limit ?? '');
        setDailyTokenLimit(data.limits.daily_token_limit ?? '');
        setDailyCostLimit(data.limits.daily_cost_limit ?? '');
        setMonthlyTokenLimit(data.limits.monthly_token_limit ?? '');
        setMonthlyCostLimit(data.limits.monthly_cost_limit ?? '');
        setYearlyTokenLimit(data.limits.yearly_token_limit ?? '');
        setYearlyCostLimit(data.limits.yearly_cost_limit ?? '');
        setTimezone(data.limits.timezone === 'Asia/Calcutta' ? 'Asia/Kolkata' : (data.limits.timezone || 'UTC'));
        setDailyResetTime(data.limits.daily_reset_time || '00:00');
        setMonthlyResetDay(data.limits.monthly_reset_day || 1);
        setYearlyResetMonth(data.limits.yearly_reset_month || 1);
        setYearlyResetDay(data.limits.yearly_reset_day || 1);
      }
      if (data?.usage) {
        setUsage(data.usage);
      }
    } catch (err) {
      console.error('Failed to load tenant limits:', err);
      showError('Failed to load quotas and limits');
    } finally {
      setLoading(false);
    }
  };

  const handleDetectTimezone = () => {
    try {
      let detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Normalize legacy alias Asia/Calcutta to modern canonical Asia/Kolkata
      if (detected === 'Asia/Calcutta') {
        detected = 'Asia/Kolkata';
      }
      if (detected) {
        setTimezone(detected);
        showSuccess(`Auto-detected local timezone: ${detected}`);
      }
    } catch (e) {
      showError('Could not detect local browser timezone');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        max_context_tokens: maxContextTokens ? parseInt(maxContextTokens, 10) : 1000000,
        session_token_limit: sessionTokenLimit !== '' ? parseInt(sessionTokenLimit, 10) : null,
        session_cost_limit: sessionCostLimit !== '' ? parseFloat(sessionCostLimit) : null,
        daily_token_limit: dailyTokenLimit !== '' ? parseInt(dailyTokenLimit, 10) : null,
        daily_cost_limit: dailyCostLimit !== '' ? parseFloat(dailyCostLimit) : null,
        monthly_token_limit: monthlyTokenLimit !== '' ? parseInt(monthlyTokenLimit, 10) : null,
        monthly_cost_limit: monthlyCostLimit !== '' ? parseFloat(monthlyCostLimit) : null,
        yearly_token_limit: yearlyTokenLimit !== '' ? parseInt(yearlyTokenLimit, 10) : null,
        yearly_cost_limit: yearlyCostLimit !== '' ? parseFloat(yearlyCostLimit) : null,
        timezone: timezone || 'UTC',
        daily_reset_time: dailyResetTime || '00:00',
        monthly_reset_day: parseInt(monthlyResetDay, 10) || 1,
        yearly_reset_month: parseInt(yearlyResetMonth, 10) || 1,
        yearly_reset_day: parseInt(yearlyResetDay, 10) || 1,
      };

      const res = await tenantsApi.updateLimits(selectedTenant.id, payload);
      showSuccess(res.message || 'Quotas & limits saved successfully');
      if (res.usage) {
        setUsage(res.usage);
      }
      if (fetchTenants) {
        fetchTenants();
      }
    } catch (err) {
      console.error('Save limits error:', err);
      showError(err?.response?.data?.detail || 'Failed to update quotas and limits');
    } finally {
      setSaving(false);
    }
  };

  const calculatePercent = (used, limit) => {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round(((used || 0) / limit) * 100));
  };

  const getProgressColor = (percent) => {
    if (percent >= 90) return 'var(--accent-rose)';
    if (percent >= 70) return '#f59e0b';
    return 'var(--primary-cyan)';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
        <RefreshCw size={24} className="spinning" color="var(--primary-cyan)" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading quotas and usage telemetry...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP BANNER: Tenant Timezone & Region ──────────────────────── */}
      <div style={{
        background: 'var(--bg-input)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Globe size={20} color="var(--primary-cyan)" />
          </div>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              Tenant Timezone & Operational Region
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '3px 0 0 0' }}>
              All daily, monthly, and yearly quota cycles and renewal notices operate in this local timezone.
            </p>
          </div>
        </div>

        <SearchableTimezoneSelect value={timezone} onChange={setTimezone} />
      </div>
      
      {/* Zero Pricing Rates Warning Banner */}
      {hasZeroRates && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <AlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.8rem', color: 'var(--text-sub)', lineHeight: '1.45' }}>
            <strong style={{ color: '#f59e0b' }}>Notice on USD Cost Limits:</strong> One or more of your registered AI models currently have pricing rates set to <strong>$0.00</strong>. 
            To enable accurate dollar budgeting, configure token rates under the <strong>AI Models & Keys</strong> tab. Token limits are active and will protect this workspace regardless of rates.
          </div>
        </div>
      )}



      {/* ── CARD 1: Per-Turn Context Memory Limit ──────────────────────────── */}
      <div style={{
        background: 'var(--bg-input)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Gauge size={17} color="var(--primary-cyan)" /> Per-Turn Context Memory Limit
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0 0' }}>
              The maximum tokens allowed in active prompt memory (conversation history + tools). When reached, the engine safely prompts the user to start a fresh thread.
            </p>
          </div>
          <span style={{
            fontSize: '0.72rem',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(6, 182, 212, 0.1)',
            color: 'var(--primary-cyan)',
            fontWeight: '600',
            border: '1px solid rgba(6, 182, 212, 0.25)'
          }}>
            Model Safety Cap
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <input
              type="number"
              min="1000"
              max="10000000"
              step="1000"
              value={maxContextTokens}
              onChange={(e) => setMaxContextTokens(e.target.value)}
              className="input-dark"
              style={{ width: '100%', paddingRight: '60px', fontSize: '0.85rem' }}
              placeholder="1,000,000"
              required
            />
            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              tokens
            </span>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Presets:</span>
            {[
              { label: '128k', value: 128000 },
              { label: '256k', value: 256000 },
              { label: '1M (Recommended)', value: 1000000 },
              { label: '2M', value: 2000000 },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`btn-outline ${Number(maxContextTokens) === preset.value ? 'active' : ''}`}
                onClick={() => setMaxContextTokens(preset.value)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '6px',
                  borderColor: Number(maxContextTokens) === preset.value ? 'var(--primary-cyan)' : undefined,
                  color: Number(maxContextTokens) === preset.value ? 'var(--primary-cyan)' : undefined,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CARD 2: Per-Session Quotas ────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-input)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div>
          <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Layers size={17} color="var(--primary-cyan)" /> Per-Session Quotas
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0 0' }}>
            Maximum cumulative usage within a single chat thread. When reached, tool execution pauses and the conversation wraps up. Leave blank or 0 for unlimited.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'block', marginBottom: '6px' }}>
              Session Token Limit
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min="0"
                step="1000"
                value={sessionTokenLimit}
                onChange={(e) => setSessionTokenLimit(e.target.value)}
                className="input-dark"
                style={{ width: '100%', paddingRight: '60px', fontSize: '0.85rem' }}
                placeholder="e.g. 500,000 (0 = unlimited)"
              />
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                tokens
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-sub)', display: 'block', marginBottom: '6px' }}>
              Session Cost Limit (USD)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sessionCostLimit}
                onChange={(e) => setSessionCostLimit(e.target.value)}
                className="input-dark"
                style={{ width: '100%', paddingLeft: '26px', fontSize: '0.85rem' }}
                placeholder="e.g. 1.00 (0 = unlimited)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── CARD 3: Time-Window Quotas (Day / Month / Year) ────────────────── */}
      <div style={{
        background: 'var(--bg-input)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Calendar size={17} color="var(--primary-cyan)" /> Time-Window Quotas & Reset Schedules
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '4px 0 0 0' }}>
              Universal calendar limits for this workspace. Configure quotas and their renewal schedule side-by-side.
            </p>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={loadLimits}
            title="Refresh current usage"
            style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={13} /> Refresh Usage
          </button>
        </div>

        {/* ── Daily Row ── */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={15} color="var(--primary-cyan)" />
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Daily Quota (Today)</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Renews every 24h at {dailyResetTime} ({timezone})
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Daily Token Limit:
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={dailyTokenLimit}
                onChange={(e) => setDailyTokenLimit(e.target.value)}
                className="input-dark"
                style={{ width: '100%', fontSize: '0.82rem' }}
                placeholder="Unlimited (0 or empty)"
              />
              {dailyTokenLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: {(usage.day_tokens || 0).toLocaleString()} tokens</span>
                    <span>{calculatePercent(usage.day_tokens, Number(dailyTokenLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.day_tokens, Number(dailyTokenLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.day_tokens, Number(dailyTokenLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Daily Cost Limit (USD):
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={dailyCostLimit}
                  onChange={(e) => setDailyCostLimit(e.target.value)}
                  className="input-dark"
                  style={{ width: '100%', paddingLeft: '22px', fontSize: '0.82rem' }}
                  placeholder="Unlimited (0 or empty)"
                />
              </div>
              {dailyCostLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: ${(usage.day_cost || 0).toFixed(4)}</span>
                    <span>{calculatePercent(usage.day_cost, Number(dailyCostLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.day_cost, Number(dailyCostLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.day_cost, Number(dailyCostLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Daily Reset Time Picker */}
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Daily Reset Time ({timezone}):
              </label>
              <div 
                onClick={() => {
                  try {
                    timeInputRef.current?.showPicker?.();
                  } catch (err) {}
                }}
                style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <input
                  ref={timeInputRef}
                  type="time"
                  value={dailyResetTime || '00:00'}
                  onChange={(e) => setDailyResetTime(e.target.value || '00:00')}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch (err) {}
                  }}
                  className="input-dark"
                  style={{
                    width: '100%',
                    fontSize: '0.84rem',
                    padding: '7px 32px 7px 10px',
                    cursor: 'pointer'
                  }}
                />
                <div 
                  style={{
                    position: 'absolute',
                    right: '10px',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-cyan)'
                  }}
                >
                  <Clock size={15} />
                </div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Click anywhere to pick exact 24h reset time
              </span>
            </div>
          </div>
        </div>

        {/* ── Monthly Row ── */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={15} color="var(--primary-emerald)" />
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Monthly Quota (This Month)</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Renews monthly on day {monthlyResetDay} at {dailyResetTime} ({timezone})
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Monthly Token Limit:
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={monthlyTokenLimit}
                onChange={(e) => setMonthlyTokenLimit(e.target.value)}
                className="input-dark"
                style={{ width: '100%', fontSize: '0.82rem' }}
                placeholder="Unlimited (0 or empty)"
              />
              {monthlyTokenLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: {(usage.month_tokens || 0).toLocaleString()} tokens</span>
                    <span>{calculatePercent(usage.month_tokens, Number(monthlyTokenLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.month_tokens, Number(monthlyTokenLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.month_tokens, Number(monthlyTokenLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Monthly Cost Limit (USD):
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyCostLimit}
                  onChange={(e) => setMonthlyCostLimit(e.target.value)}
                  className="input-dark"
                  style={{ width: '100%', paddingLeft: '22px', fontSize: '0.82rem' }}
                  placeholder="Unlimited (0 or empty)"
                />
              </div>
              {monthlyCostLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: ${(usage.month_cost || 0).toFixed(4)}</span>
                    <span>{calculatePercent(usage.month_cost, Number(monthlyCostLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.month_cost, Number(monthlyCostLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.month_cost, Number(monthlyCostLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Reset Day Stepper / Picker */}
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Monthly Billing Day (1–28) ({timezone}):
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={monthlyResetDay}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setMonthlyResetDay(isNaN(val) ? '' : Math.max(1, Math.min(28, val)));
                }}
                className="input-dark"
                style={{
                  width: '100%',
                  fontSize: '0.84rem',
                  padding: '7px 10px',
                  cursor: 'pointer'
                }}
                placeholder="Day 1 to 28"
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Renews on day {monthlyResetDay || 1} of every month at {dailyResetTime}
              </span>
            </div>
          </div>
        </div>

        {/* ── Yearly Row ── */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={15} color="#a855f7" />
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>Yearly Quota (This Year)</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Renews on {MONTH_NAMES.find(m => m.value === yearlyResetMonth)?.label.split(' ')[0]} {yearlyResetDay} ({timezone})
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Annual Token Limit:
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={yearlyTokenLimit}
                onChange={(e) => setYearlyTokenLimit(e.target.value)}
                className="input-dark"
                style={{ width: '100%', fontSize: '0.82rem' }}
                placeholder="Unlimited (0 or empty)"
              />
              {yearlyTokenLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: {(usage.year_tokens || 0).toLocaleString()} tokens</span>
                    <span>{calculatePercent(usage.year_tokens, Number(yearlyTokenLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.year_tokens, Number(yearlyTokenLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.year_tokens, Number(yearlyTokenLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Annual Cost Limit (USD):
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={yearlyCostLimit}
                  onChange={(e) => setYearlyCostLimit(e.target.value)}
                  className="input-dark"
                  style={{ width: '100%', paddingLeft: '22px', fontSize: '0.82rem' }}
                  placeholder="Unlimited (0 or empty)"
                />
              </div>
              {yearlyCostLimit > 0 && usage && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    <span>Used: ${(usage.year_cost || 0).toFixed(4)}</span>
                    <span>{calculatePercent(usage.year_cost, Number(yearlyCostLimit))}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${calculatePercent(usage.year_cost, Number(yearlyCostLimit))}%`,
                      height: '100%',
                      background: getProgressColor(calculatePercent(usage.year_cost, Number(yearlyCostLimit))),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Annual Reset Date Picker */}
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>
                Annual Anniversary Date ({timezone}):
              </label>
              <div 
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker?.();
                  } catch (err) {}
                }}
                style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  value={`${new Date().getFullYear()}-${String(yearlyResetMonth || 1).padStart(2, '0')}-${String(yearlyResetDay || 1).padStart(2, '0')}`}
                  onChange={(e) => {
                    if (e.target.value) {
                      const parts = e.target.value.split('-');
                      if (parts.length === 3) {
                        setYearlyResetMonth(parseInt(parts[1], 10));
                        setYearlyResetDay(parseInt(parts[2], 10));
                      }
                    }
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch (err) {}
                  }}
                  className="input-dark"
                  style={{
                    width: '100%',
                    fontSize: '0.84rem',
                    padding: '7px 32px 7px 10px',
                    cursor: 'pointer'
                  }}
                />
                <div 
                  style={{
                    position: 'absolute',
                    right: '10px',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a855f7'
                  }}
                >
                  <Calendar size={15} />
                </div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Click anywhere to open calendar: {MONTH_NAMES.find(m => m.value === Number(yearlyResetMonth))?.label.split(' ')[0] || 'Jan'} {yearlyResetDay || 1}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
        <button
          type="submit"
          className="btn-gradient"
          disabled={saving}
          style={{ padding: '8px 24px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {saving ? <RefreshCw size={16} className="spinning" /> : <Save size={16} />}
          {saving ? 'Saving Limits...' : 'Save Quotas & Limits'}
        </button>
      </div>

    </form>
  );
}
