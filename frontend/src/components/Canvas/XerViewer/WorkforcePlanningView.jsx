import React, { useState, useMemo } from 'react';
import { Users, Download, Search, AlertTriangle, Clock } from 'lucide-react';
import ModernSelect from './ModernSelect';
import { computeWorkforceLoad, exportWorkforceCsv } from './evmEngine';

const HORIZON_OPTIONS = [
  { value: '0', label: 'Full Project' },
  { value: '3', label: 'Next 3 Weeks' },
  { value: '8', label: 'Next 8 Weeks' },
  { value: '12', label: 'Next 12 Weeks' },
];

export default function WorkforcePlanningView({ xerData, filename, isDark = true }) {
  const [horizonWeeks, setHorizonWeeks] = useState('0');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const wf = useMemo(
    () => computeWorkforceLoad(xerData, parseInt(horizonWeeks, 10) || 0),
    [xerData, horizonWeeks]
  );

  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(wf.crafts.map((c) => c.type))).sort();
    return [{ value: 'ALL', label: 'All Resource Types' }, ...types.map((t) => ({ value: t, label: t }))];
  }, [wf.crafts]);

  const filteredCrafts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return wf.crafts.filter((c) => {
      if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q) || c.type.toLowerCase().includes(q);
    });
  }, [wf.crafts, typeFilter, search]);

  const cardBg = isDark ? 'rgba(15, 23, 42, 0.72)' : '#ffffff';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';

  const maxWeekHrs = useMemo(
    () => Math.max(1, ...wf.weeklyHistogram.map((w) => Math.max(w.plannedHrs, w.actualHrs + w.remainHrs))),
    [wf.weeklyHistogram]
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="#f97316" />
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Workforce & Craft Demand Visibility</div>
            <div style={{ fontSize: '0.75rem', color: mutedCol }}>
              Computed automatically from P6 TASKRSRC & RSRC assignments • Zero manual entry
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <ModernSelect value={horizonWeeks} onChange={setHorizonWeeks} options={HORIZON_OPTIONS} icon={Clock} isDark={isDark} minWidth="140px" />
          <ModernSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} isDark={isDark} minWidth="150px" />
          <button
            type="button"
            onClick={() => exportWorkforceCsv(wf, filename)}
            className="canvas-btn canvas-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem' }}
          >
            <Download size={13} /> Export Workforce CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Active Crafts / Resources', value: wf.crafts.length.toLocaleString(), color: '#38bdf8' },
          { label: 'Planned Labor Hours', value: `${Math.round(wf.totalPlannedHrs).toLocaleString()} hrs`, color: '#6366f1' },
          { label: 'Actual Hours Logged', value: `${Math.round(wf.totalActualHrs).toLocaleString()} hrs`, color: '#10b981' },
          { label: 'Remaining Hours', value: `${Math.round(wf.totalRemainHrs).toLocaleString()} hrs`, color: '#f59e0b' },
          { label: 'Peak Week Demand', value: `${wf.peakWeek.label} (${Math.round(wf.peakWeek.plannedHrs).toLocaleString()} hrs)`, color: '#ef4444' },
        ].map((k) => (
          <div key={k.label} style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.7rem', color: mutedCol, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 750, color: k.color, marginTop: '3px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Weekly Craft Demand Histogram */}
      <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '10px', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Weekly Craft Demand Histogram (Hours)</span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', color: mutedCol }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#6366f1' }} /> Planned
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#10b981' }} /> Actual
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#f59e0b' }} /> Remaining
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px', paddingBottom: '22px', overflowX: 'auto' }}>
          {wf.weeklyHistogram.map((w) => {
            const pH = Math.max(2, (w.plannedHrs / maxWeekHrs) * 125);
            const aH = Math.max(0, (w.actualHrs / maxWeekHrs) * 125);
            const rH = Math.max(0, (w.remainHrs / maxWeekHrs) * 125);
            return (
              <div
                key={w.idx}
                title={`${w.label}: Planned ${Math.round(w.plannedHrs)}h | Actual ${Math.round(w.actualHrs)}h | Remaining ${Math.round(w.remainHrs)}h`}
                style={{
                  flex: '1 1 28px',
                  minWidth: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '130px' }}>
                  <div style={{ width: '8px', height: `${pH}px`, background: '#6366f1', borderRadius: '2px 2px 0 0' }} />
                  <div style={{ width: '8px', height: `${aH}px`, background: '#10b981', borderRadius: '2px 2px 0 0' }} />
                  <div style={{ width: '8px', height: `${rH}px`, background: '#f59e0b', borderRadius: '2px 2px 0 0' }} />
                </div>
                <span style={{ position: 'absolute', bottom: '-18px', fontSize: '9.5px', color: mutedCol, whiteSpace: 'nowrap' }}>
                  {w.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Craft & Bottleneck Table */}
      <div style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Craft Assignments & Critical Bottlenecks ({filteredCrafts.length})</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '9px', opacity: 0.55 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search craft / resource..."
              style={{
                padding: '5px 8px 5px 26px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                border: `1px solid ${borderCol}`,
                background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                color: 'inherit',
                width: '210px',
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${borderCol}`, color: mutedCol, textAlign: 'left' }}>
                <th style={{ padding: '7px 8px' }}>Craft / Resource</th>
                <th style={{ padding: '7px 8px' }}>Type</th>
                <th style={{ padding: '7px 8px' }}>Tasks</th>
                <th style={{ padding: '7px 8px' }}>Critical</th>
                <th style={{ padding: '7px 8px' }}>Overdue</th>
                <th style={{ padding: '7px 8px' }}>Planned Hrs</th>
                <th style={{ padding: '7px 8px' }}>Actual Hrs</th>
                <th style={{ padding: '7px 8px' }}>Remaining Hrs</th>
                <th style={{ padding: '7px 8px' }}>Burn %</th>
              </tr>
            </thead>
            <tbody>
              {filteredCrafts.map((c) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${borderCol}` }}>
                  <td style={{ padding: '7px 8px', fontWeight: 600 }}>
                    {c.name} {c.shortName ? <span style={{ color: mutedCol, fontWeight: 400 }}>({c.shortName})</span> : null}
                  </td>
                  <td style={{ padding: '7px 8px', color: mutedCol }}>{c.type}</td>
                  <td style={{ padding: '7px 8px' }}>{c.taskCount}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 700, color: c.criticalCount > 0 ? '#ef4444' : mutedCol }}>
                    {c.criticalCount > 0 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <AlertTriangle size={11} /> {c.criticalCount}
                      </span>
                    ) : '0'}
                  </td>
                  <td style={{ padding: '7px 8px', fontWeight: 700, color: c.overdueCount > 0 ? '#f59e0b' : mutedCol }}>
                    {c.overdueCount}
                  </td>
                  <td style={{ padding: '7px 8px' }}>{Math.round(c.plannedHrs).toLocaleString()}</td>
                  <td style={{ padding: '7px 8px', color: '#10b981' }}>{Math.round(c.actualHrs).toLocaleString()}</td>
                  <td style={{ padding: '7px 8px', color: '#f59e0b' }}>{Math.round(c.remainHrs).toLocaleString()}</td>
                  <td style={{ padding: '7px 8px' }}>{c.burnPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
