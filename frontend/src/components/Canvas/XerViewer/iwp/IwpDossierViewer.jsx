import React, { useState, useMemo } from 'react';
import {
  Package, CheckCircle2, AlertTriangle, Clock, Users, Wrench,
  FileText, ShieldCheck, Unlock, Download, Printer, ArrowRight,
  Plus, Edit2, Check, X, Calendar, ChevronDown, ChevronRight, FileCode
} from 'lucide-react';
import {
  IWP_STATUSES,
  CONSTRAINT_PILLARS,
  canReleaseToField,
  exportIwpJson,
  parseIwpContent,
  saveSingleIwp
} from './iwpModel';
import ModernSelect from '../ModernSelect';

export default function IwpDossierViewer({
  fullContent,
  artifact,
  filename = 'package.iwp.json',
  theme = 'dark',
  initialIwp = null,
  onIwpUpdated = null
}) {
  // Parse or load incoming IWP
  const [iwp, setIwp] = useState(() => {
    if (initialIwp) return initialIwp;
    if (fullContent) {
      try {
        return parseIwpContent(fullContent);
      } catch (e) {
        console.warn('Could not parse IWP fullContent:', e);
      }
    }
    // Return empty shell if not provided
    return {
      iwpId: 'IWP-GEN-0001',
      title: 'Untitled Work Package',
      discipline: 'General',
      status: 'planning',
      schedule: { activities: [], plannedManHours: 0, crewSize: 4 },
      constraints: {},
      bom: [],
      tools: [],
      safetyJha: [],
      qualityItp: [],
      drawings: [],
      dailyLogs: []
    };
  });

  const [activeTab, setActiveTab] = useState('overview'); // overview, scope, bom, safety, quality, logs
  const [gateWarning, setGateWarning] = useState(null);
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().slice(0, 10),
    crew: iwp?.schedule?.crewSize || 4,
    hours: 32,
    percentComplete: 10,
    notes: ''
  });

  const readiness = useMemo(() => canReleaseToField(iwp), [iwp]);
  const statusInfo = IWP_STATUSES[iwp.status] || IWP_STATUSES.planning;

  const statusOptions = useMemo(() => {
    return Object.values(IWP_STATUSES).map((st) => ({
      value: st.id,
      label: st.label,
      badgeColor: st.color,
      subtext: st.description
    }));
  }, []);

  const handleUpdateConstraintStatus = (pillarKey, newStatus) => {
    const updated = {
      ...iwp,
      constraints: {
        ...iwp.constraints,
        [pillarKey]: {
          ...(iwp.constraints?.[pillarKey] || {}),
          status: newStatus
        }
      }
    };
    setIwp(updated);
    if (onIwpUpdated) onIwpUpdated(updated);
  };

  const handleStatusChange = (newStatus) => {
    if ((newStatus === 'ready_for_release' || newStatus === 'active') && !readiness.canRelease) {
      setGateWarning(`Cannot promote to "${IWP_STATUSES[newStatus].label}": Unresolved constraints must be cleared first.`);
      return;
    }
    setGateWarning(null);
    const updated = { ...iwp, status: newStatus };
    setIwp(updated);
    if (onIwpUpdated) onIwpUpdated(updated);
  };

  const handleAddDailyLog = () => {
    if (!newLog.date || !newLog.hours) return;
    const currentLogs = Array.isArray(iwp.dailyLogs) ? [...iwp.dailyLogs] : [];
    currentLogs.push({ ...newLog });

    const totalHours = currentLogs.reduce((acc, l) => acc + Number(l.hours || 0), 0);
    const updated = {
      ...iwp,
      dailyLogs: currentLogs,
      schedule: {
        ...(iwp.schedule || {}),
        actualManHours: totalHours
      }
    };
    setIwp(updated);
    setShowAddLogModal(false);
    if (onIwpUpdated) onIwpUpdated(updated);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className={`iwp-dossier-root ${theme === 'dark' ? 'iwp-dark' : 'iwp-light'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        background: theme === 'dark' ? '#0f172a' : '#f8fafc',
        color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      {/* ── TOP HEADER / TOOLBAR ── */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
          background: theme === 'dark' ? '#1e293b' : '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' }}>
                {iwp.iwpId}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: statusInfo.bg,
                  color: statusInfo.color,
                  border: `1px solid ${statusInfo.border}`
                }}
              >
                {statusInfo.label}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: theme === 'dark' ? '#334155' : '#e2e8f0',
                  color: theme === 'dark' ? '#cbd5e1' : '#475569'
                }}
              >
                {iwp.discipline || 'General'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
              {iwp.title} • {iwp.cwpRef || 'CWP-GEN'} • {iwp.area || 'Field Area'}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => exportIwpJson(iwp)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              background: theme === 'dark' ? '#334155' : '#f1f5f9',
              color: theme === 'dark' ? '#e2e8f0' : '#334155',
              border: theme === 'dark' ? '1px solid #475569' : '1px solid #cbd5e1',
              cursor: 'pointer'
            }}
          >
            <Download size={14} /> Export .iwp.json
          </button>

          <button
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              background: theme === 'dark' ? '#334155' : '#f1f5f9',
              color: theme === 'dark' ? '#e2e8f0' : '#334155',
              border: theme === 'dark' ? '1px solid #475569' : '1px solid #cbd5e1',
              cursor: 'pointer'
            }}
          >
            <Printer size={14} /> Print Field Dossier
          </button>

          {/* Modern Status Lifecycle Dropdown */}
          <ModernSelect
            value={iwp.status}
            onChange={handleStatusChange}
            options={statusOptions}
            isDark={theme === 'dark'}
            minWidth="170px"
            maxWidth="240px"
          />
        </div>
      </div>

      {/* ── GATE WARNING MODAL / BANNER ── */}
      {gateWarning && (
        <div
          style={{
            margin: '12px 24px 0 24px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{gateWarning}</span>
          </div>
          <button
            onClick={() => setGateWarning(null)}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── 6-PILLAR MAKE-READY CONSTRAINT BANNER ── */}
      <div
        style={{
          margin: '16px 24px',
          padding: '16px',
          borderRadius: '10px',
          background: readiness.canRelease
            ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)'
            : 'linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%)',
          border: readiness.canRelease
            ? '1px solid rgba(16, 185, 129, 0.3)'
            : '1px solid rgba(245, 158, 11, 0.3)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {readiness.canRelease ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : (
              <AlertTriangle size={18} color="#f59e0b" />
            )}
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              {readiness.canRelease
                ? 'Make-Ready Status: 100% Cleared for Field Release'
                : `Make-Ready Status: ${readiness.clearedCount} of 6 Constraint Pillars Cleared`}
            </span>
          </div>
          <span style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            Gatekeeper: Cannot release to site unless all 6 pillars are green
          </span>
        </div>

        {/* 6 Pillars Quick Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {Object.entries(CONSTRAINT_PILLARS).map(([key, pillar]) => {
            const constraint = iwp.constraints?.[key];
            const isCleared = constraint?.status === 'cleared';
            const isBlocked = constraint?.status === 'blocked';
            return (
              <div
                key={key}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: theme === 'dark' ? '#1e293b' : '#ffffff',
                  border: isCleared
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : isBlocked
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: isCleared ? '#10b981' : isBlocked ? '#ef4444' : '#f59e0b',
                        color: '#ffffff'
                      }}
                    >
                      {pillar.code}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{pillar.name.split(' ')[0]}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: theme === 'dark' ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                    {constraint?.status || 'pending'}
                  </div>
                </div>
                <button
                  onClick={() => handleUpdateConstraintStatus(key, isCleared ? 'pending' : 'cleared')}
                  title="Toggle Clear/Pending"
                  style={{
                    padding: '3px 6px',
                    borderRadius: '4px',
                    border: 'none',
                    background: isCleared ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: isCleared ? '#10b981' : '#f59e0b',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600
                  }}
                >
                  {isCleared ? '✓ Cleared' : 'Clear'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
          padding: '0 24px',
          gap: '24px'
        }}
      >
        {[
          { id: 'overview', label: '1. Master Sheet' },
          { id: 'scope', label: '2. Work Scope & Schedule' },
          { id: 'bom', label: '3. BOM & Laydown' },
          { id: 'safety', label: '4. Safety & JHA' },
          { id: 'quality', label: '5. Quality & ITP' },
          { id: 'drawings', label: '6. Drawings & Isometrics' },
          { id: 'logs', label: '7. Daily Execution Logs' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 0',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? 600 : 500,
              color: activeTab === tab.id ? '#3b82f6' : theme === 'dark' ? '#94a3b8' : '#64748b',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT STAGE ── */}
      <div style={{ padding: '24px', flex: 1 }}>
        {/* TAB 1: MASTER SHEET */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div
              style={{
                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                padding: '20px',
                borderRadius: '8px',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0'
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Package Core Metrics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>PLANNED HOURS</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#3b82f6' }}>
                    {iwp.schedule?.plannedManHours || 0} hrs
                  </div>
                </div>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>ACTUAL HOURS</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6' }}>
                    {iwp.schedule?.actualManHours || 0} hrs
                  </div>
                </div>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>TARGET CRAFT CREW</div>
                  <div style={{ fontWeight: 600 }}>{iwp.schedule?.targetCraft || 'Pipefitter Crew'}</div>
                </div>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>CREW SIZE</div>
                  <div style={{ fontWeight: 600 }}>{iwp.schedule?.crewSize || 6} Persons</div>
                </div>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>PLANNED START</div>
                  <div style={{ fontWeight: 600 }}>{iwp.schedule?.plannedStart || '—'}</div>
                </div>
                <div>
                  <div style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>PLANNED FINISH</div>
                  <div style={{ fontWeight: 600 }}>{iwp.schedule?.plannedFinish || '—'}</div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                padding: '20px',
                borderRadius: '8px',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0'
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Field Sign-Off & Approvals</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #334155', paddingBottom: '8px' }}>
                  <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>WorkFace Planner:</span>
                  <span style={{ fontWeight: 600 }}>Approved (Verified Scope & BOM)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #334155', paddingBottom: '8px' }}>
                  <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>Discipline Superintendent:</span>
                  <span style={{ fontWeight: 600, color: readiness.canRelease ? '#10b981' : '#f59e0b' }}>
                    {readiness.canRelease ? 'Authorized for Field Release' : 'Pending Constraint Clear'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #334155', paddingBottom: '8px' }}>
                  <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>Craft Foreman Acceptance:</span>
                  <span style={{ fontWeight: 600 }}>Assigned to Crew A</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px' }}>
                  <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>QA/QC Turnover Sign-off:</span>
                  <span style={{ fontWeight: 600, color: iwp.status === 'closed' ? '#10b981' : '#94a3b8' }}>
                    {iwp.status === 'closed' ? 'Completed & Accepted' : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WORK SCOPE & SCHEDULE ACTIVITIES */}
        {activeTab === 'scope' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Linked Schedule Activities ({iwp.schedule?.activities?.length || 0})</h3>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                Sourced directly from the Master Schedule / Lookahead plan.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Activity ID</th>
                  <th style={{ padding: '10px 16px' }}>Activity Name</th>
                  <th style={{ padding: '10px 16px' }}>Start</th>
                  <th style={{ padding: '10px 16px' }}>Finish</th>
                  <th style={{ padding: '10px 16px' }}>Planned Hrs</th>
                  <th style={{ padding: '10px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {iwp.schedule?.activities?.length > 0 ? (
                  iwp.schedule.activities.map((act, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#3b82f6' }}>{act.taskCode}</td>
                      <td style={{ padding: '10px 16px' }}>{act.taskName}</td>
                      <td style={{ padding: '10px 16px' }}>{act.earlyStart || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>{act.earlyFinish || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>{act.plannedHours || 40} hrs</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                          {act.status || 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      No linked activities. Bundle tasks from the Lookahead view to attach schedule scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: BOM & LAYDOWN */}
        {activeTab === 'bom' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Bill of Materials & Laydown Verification</h3>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                Material Controller staging status for this package's tagged components.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Item Tag / Code</th>
                  <th style={{ padding: '10px 16px' }}>Description</th>
                  <th style={{ padding: '10px 16px' }}>Qty Req</th>
                  <th style={{ padding: '10px 16px' }}>Qty Staged</th>
                  <th style={{ padding: '10px 16px' }}>Laydown Location</th>
                  <th style={{ padding: '10px 16px' }}>Staging Status</th>
                </tr>
              </thead>
              <tbody>
                {iwp.bom?.length > 0 ? (
                  iwp.bom.map((item, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{item.itemCode}</td>
                      <td style={{ padding: '10px 16px' }}>{item.desc}</td>
                      <td style={{ padding: '10px 16px' }}>{item.qtyReq}</td>
                      <td style={{ padding: '10px 16px' }}>{item.qtyStaged}</td>
                      <td style={{ padding: '10px 16px' }}>{item.bin || 'Laydown Bay 1'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: item.status === 'staged' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: item.status === 'staged' ? '#10b981' : '#f59e0b'
                          }}
                        >
                          {item.status || 'staged'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      No BOM items attached.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: SAFETY & JHA */}
        {activeTab === 'safety' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Job Hazard Analysis (JHA) & Safety Precautions</h3>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                HSE controls and required PPE prior to commencing work at the workface.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Sequence of Job Steps</th>
                  <th style={{ padding: '10px 16px' }}>Potential Hazards</th>
                  <th style={{ padding: '10px 16px' }}>Required Control Measures</th>
                </tr>
              </thead>
              <tbody>
                {iwp.safetyJha?.length > 0 ? (
                  iwp.safetyJha.map((jha, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{jha.step}</td>
                      <td style={{ padding: '10px 16px', color: '#f87171' }}>{jha.hazard}</td>
                      <td style={{ padding: '10px 16px', color: '#34d399' }}>{jha.control}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      Standard site safety rules apply.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: QUALITY & ITP */}
        {activeTab === 'quality' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Inspection Test Plan (ITP) Quality Checkpoints</h3>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                Hold and witness points required by client specifications before covering or energizing.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Step No</th>
                  <th style={{ padding: '10px 16px' }}>Inspection Checkpoint</th>
                  <th style={{ padding: '10px 16px' }}>Point Type</th>
                  <th style={{ padding: '10px 16px' }}>Signed By</th>
                  <th style={{ padding: '10px 16px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {iwp.qualityItp?.length > 0 ? (
                  iwp.qualityItp.map((itp, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{itp.stepNo}</td>
                      <td style={{ padding: '10px 16px' }}>{itp.inspection}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: itp.point === 'Hold' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: itp.point === 'Hold' ? '#f87171' : '#60a5fa'
                          }}
                        >
                          {itp.point} Point
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>{itp.signedBy || 'Pending'}</td>
                      <td style={{ padding: '10px 16px' }}>{itp.signedDate || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      No ITP points specified.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 6: DRAWINGS & ISOMETRICS */}
        {activeTab === 'drawings' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Engineering Drawings & Spool Cut Sheets</h3>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                Approved For Construction (IFC) revisions attached to this field package.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Drawing No</th>
                  <th style={{ padding: '10px 16px' }}>Revision</th>
                  <th style={{ padding: '10px 16px' }}>Drawing Title</th>
                  <th style={{ padding: '10px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {iwp.drawings?.length > 0 ? (
                  iwp.drawings.map((dwg, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#3b82f6' }}>{dwg.drawingNo}</td>
                      <td style={{ padding: '10px 16px' }}>Rev {dwg.rev}</td>
                      <td style={{ padding: '10px 16px' }}>{dwg.title}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                          {dwg.status || 'IFC'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      No drawing attachments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 7: DAILY EXECUTION LOGS */}
        {activeTab === 'logs' && (
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              borderRadius: '8px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Daily Time-on-Tools Logs ({iwp.dailyLogs?.length || 0})</h3>
                <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                  Craft foreman daily work recording and obstacles.
                </p>
              </div>
              <button
                onClick={() => setShowAddLogModal(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} /> Add Daily Log
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: theme === 'dark' ? '#0f172a' : '#f1f5f9', borderBottom: '1px solid #334155' }}>
                  <th style={{ padding: '10px 16px' }}>Date</th>
                  <th style={{ padding: '10px 16px' }}>Crew Size</th>
                  <th style={{ padding: '10px 16px' }}>Hours Worked</th>
                  <th style={{ padding: '10px 16px' }}>Cumulative %</th>
                  <th style={{ padding: '10px 16px' }}>Field Notes & Obstacles</th>
                </tr>
              </thead>
              <tbody>
                {iwp.dailyLogs?.length > 0 ? (
                  iwp.dailyLogs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{log.date}</td>
                      <td style={{ padding: '10px 16px' }}>{log.crew} persons</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#3b82f6' }}>{log.hours} hrs</td>
                      <td style={{ padding: '10px 16px' }}>{log.percentComplete}%</td>
                      <td style={{ padding: '10px 16px' }}>{log.notes || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                      No daily logs submitted yet. Click "Add Daily Log" to record today's crew hours.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ADD DAILY LOG MODAL ── */}
      {showAddLogModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              padding: '24px',
              borderRadius: '10px',
              width: '420px',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1'
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Record Daily Time-on-Tools Log</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>DATE</label>
                <input
                  type="date"
                  value={newLog.date}
                  onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', background: theme === 'dark' ? '#0f172a' : '#f8fafc', color: 'inherit', border: '1px solid #334155' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>CREW SIZE</label>
                  <input
                    type="number"
                    value={newLog.crew}
                    onChange={(e) => setNewLog({ ...newLog, crew: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: theme === 'dark' ? '#0f172a' : '#f8fafc', color: 'inherit', border: '1px solid #334155' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>HOURS WORKED</label>
                  <input
                    type="number"
                    value={newLog.hours}
                    onChange={(e) => setNewLog({ ...newLog, hours: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', background: theme === 'dark' ? '#0f172a' : '#f8fafc', color: 'inherit', border: '1px solid #334155' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>% COMPLETE</label>
                <input
                  type="number"
                  value={newLog.percentComplete}
                  onChange={(e) => setNewLog({ ...newLog, percentComplete: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', background: theme === 'dark' ? '#0f172a' : '#f8fafc', color: 'inherit', border: '1px solid #334155' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#94a3b8' }}>FIELD NOTES & OBSTACLES</label>
                <textarea
                  rows={3}
                  value={newLog.notes}
                  onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                  placeholder="Record obstacles, weather delays, or completed welds..."
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', background: theme === 'dark' ? '#0f172a' : '#f8fafc', color: 'inherit', border: '1px solid #334155' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button
                onClick={() => setShowAddLogModal(false)}
                style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddDailyLog}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', color: '#ffffff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Log Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT-SPECIFIC CSS ── */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .iwp-dossier-root, .iwp-dossier-root * {
            visibility: visible;
          }
          .iwp-dossier-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          button, select {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
