import React, { useState, useMemo } from 'react';
import {
  Package, Plus, Search, Filter, AlertTriangle, CheckCircle2,
  Clock, Users, Wrench, Download, Upload, Trash2, ArrowRight,
  ArrowLeft, Eye, Check, X, ShieldAlert
} from 'lucide-react';
import {
  IWP_STATUSES,
  CONSTRAINT_PILLARS,
  canReleaseToField,
  loadProjectIwps,
  saveSingleIwp,
  deleteSingleIwp,
  exportIwpJson,
  parseIwpContent
} from './iwpModel';
import IwpDossierViewer from './IwpDossierViewer';
import IwpBuilderModal from './IwpBuilderModal';
import ModernSelect from '../ModernSelect';

export default function IwpKanbanBoard({
  projectCode = 'default',
  projectMeta = {},
  theme = 'dark',
  allTasks = []
}) {
  const [iwps, setIwps] = useState(() => loadProjectIwps(projectCode, projectMeta));
  const [searchTerm, setSearchTerm] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('ALL');
  const [activeDossierIwp, setActiveDossierIwp] = useState(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [gateBlockedAlert, setGateBlockedAlert] = useState(null);

  // Available disciplines for filter
  const disciplines = useMemo(() => {
    const set = new Set();
    iwps.forEach(p => { if (p.discipline) set.add(p.discipline); });
    return Array.from(set);
  }, [iwps]);

  const disciplineOptions = useMemo(() => [
    { value: 'ALL', label: 'All Disciplines', count: iwps.length },
    ...disciplines.map(d => ({
      value: d,
      label: d,
      count: iwps.filter(p => p.discipline === d).length
    }))
  ], [disciplines, iwps]);

  // Filtered packages
  const filteredIwps = useMemo(() => {
    return iwps.filter(p => {
      if (disciplineFilter !== 'ALL' && p.discipline !== disciplineFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchId = (p.iwpId || '').toLowerCase().includes(q);
        const matchTitle = (p.title || '').toLowerCase().includes(q);
        const matchDisc = (p.discipline || '').toLowerCase().includes(q);
        if (!matchId && !matchTitle && !matchDisc) return false;
      }
      return true;
    });
  }, [iwps, disciplineFilter, searchTerm]);

  // Stage column arrays
  const columns = useMemo(() => {
    const cols = {
      planning: [],
      constraint_review: [],
      ready_for_release: [],
      active: [],
      closed: []
    };
    filteredIwps.forEach(p => {
      const st = p.status || 'planning';
      if (cols[st]) cols[st].push(p);
      else cols.planning.push(p);
    });
    return cols;
  }, [filteredIwps]);

  // Stage transition logic with strict constraint gatekeeping
  const handleTransition = (iwp, targetStatus) => {
    if (targetStatus === 'ready_for_release' || targetStatus === 'active') {
      const check = canReleaseToField(iwp);
      if (!check.canRelease) {
        setGateBlockedAlert({
          iwpId: iwp.iwpId,
          targetStatus: IWP_STATUSES[targetStatus].label,
          blockers: check.blockers
        });
        return;
      }
    }

    setGateBlockedAlert(null);
    const updated = { ...iwp, status: targetStatus };
    const newList = saveSingleIwp(projectCode, updated);
    setIwps(newList);
    if (activeDossierIwp && activeDossierIwp.iwpId === iwp.iwpId) {
      setActiveDossierIwp(updated);
    }
  };

  const handleDelete = (iwpId) => {
    if (window.confirm(`Are you sure you want to delete package ${iwpId}?`)) {
      const newList = deleteSingleIwp(projectCode, iwpId);
      setIwps(newList);
      if (activeDossierIwp && activeDossierIwp.iwpId === iwpId) {
        setActiveDossierIwp(null);
      }
    }
  };

  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        const parsed = parseIwpContent(content);
        const newList = saveSingleIwp(projectCode, parsed);
        setIwps(newList);
      } catch (err) {
        alert('Invalid IWP JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // If a dossier is actively selected for full inspection, render it with a back button
  if (activeDossierIwp) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
        <div
          style={{
            padding: '8px 24px',
            background: theme === 'dark' ? '#0f172a' : '#f1f5f9',
            borderBottom: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <button
            onClick={() => setActiveDossierIwp(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            <ArrowLeft size={14} /> Back to IWP Board
          </button>
          <span style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            Viewing Digital Work Package Dossier • {activeDossierIwp.iwpId}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <IwpDossierViewer
            initialIwp={activeDossierIwp}
            theme={theme}
            onIwpUpdated={(updated) => {
              const newList = saveSingleIwp(projectCode, updated);
              setIwps(newList);
              setActiveDossierIwp(updated);
            }}
          />
        </div>
      </div>
    );
  }

  const nextStageMap = {
    planning: 'constraint_review',
    constraint_review: 'ready_for_release',
    ready_for_release: 'active',
    active: 'closed'
  };

  const prevStageMap = {
    constraint_review: 'planning',
    ready_for_release: 'constraint_review',
    active: 'ready_for_release',
    closed: 'active'
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: theme === 'dark' ? '#0f172a' : '#f8fafc',
        color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      {/* ── TOP CONTROL BAR ── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="#3b82f6" />
            <span style={{ fontSize: '16px', fontWeight: 700 }}>IWP Digital Packs</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa'
              }}
            >
              {filteredIwps.length} Packages
            </span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search IWP ID, title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '7px 12px 7px 30px',
                fontSize: '12px',
                borderRadius: '6px',
                background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                color: 'inherit',
                width: '180px'
              }}
            />
          </div>

          {/* Modern Discipline Filter Dropdown */}
          {disciplines.length > 0 && (
            <ModernSelect
              value={disciplineFilter}
              onChange={setDisciplineFilter}
              options={disciplineOptions}
              icon={Filter}
              isDark={theme === 'dark'}
              minWidth="160px"
              maxWidth="240px"
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label
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
            <Upload size={14} /> Import .iwp.json
            <input type="file" accept=".json,.iwp,.iwp.json" onChange={handleImportJson} style={{ display: 'none' }} />
          </label>

          <button
            onClick={() => setIsBuilderOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Plus size={14} /> Create IWP Pack
          </button>
        </div>
      </div>

      {/* ── GATE BLOCKED ALERT MODAL ── */}
      {gateBlockedAlert && (
        <div
          style={{
            margin: '12px 24px 0 24px',
            padding: '14px 18px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            fontSize: '13px'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
              <ShieldAlert size={18} />
              <span>Gatekeeper Block: Cannot Release {gateBlockedAlert.iwpId} to "{gateBlockedAlert.targetStatus}"</span>
            </div>
            <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '6px' }}>
              All 6 Make-Ready Constraint Pillars must be verified 100% green before this package can be released to the field:
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px' }}>
              {gateBlockedAlert.blockers.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => setGateBlockedAlert(null)}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* ── 5-STAGE KANBAN COLUMNS ── */}
      <div
        style={{
          flex: 1,
          padding: '20px 24px',
          overflowX: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(280px, 1fr))',
          gap: '16px',
          alignItems: 'start'
        }}
      >
        {Object.values(IWP_STATUSES).map((st) => {
          const packs = columns[st.id] || [];
          return (
            <div
              key={st.id}
              style={{
                background: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderRadius: '10px',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 220px)',
                overflow: 'hidden'
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: '12px 14px',
                  borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: theme === 'dark' ? '#0f172a' : '#f8fafc'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: st.color
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{st.label}</span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '10px',
                    background: st.bg,
                    color: st.color
                  }}
                >
                  {packs.length}
                </span>
              </div>

              {/* Card List */}
              <div
                style={{
                  padding: '12px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  flex: 1
                }}
              >
                {packs.map((p) => {
                  const check = canReleaseToField(p);
                  return (
                    <div
                      key={p.iwpId}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                        border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                    >
                      {/* Card Top */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6' }}>
                            {p.iwpId}
                          </span>
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: theme === 'dark' ? '#334155' : '#e2e8f0',
                              color: theme === 'dark' ? '#cbd5e1' : '#475569'
                            }}
                          >
                            {p.discipline}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDelete(p.iwpId)}
                          title="Delete package"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '2px'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div style={{ fontSize: '12px', fontWeight: 500, lineHeight: '1.4' }}>
                        {p.title}
                      </div>

                      {/* Metrics bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
                        <span>Target: {p.schedule?.plannedManHours || 0} hrs</span>
                        <span>Crew: {p.schedule?.crewSize || 6}p</span>
                        <span>{p.schedule?.activities?.length || 0} Tasks</span>
                      </div>

                      {/* 6-Pillar Mini Readiness Badge */}
                      <div
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: check.canRelease ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          border: check.canRelease ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {check.canRelease ? (
                            <CheckCircle2 size={12} color="#10b981" />
                          ) : (
                            <AlertTriangle size={12} color="#f59e0b" />
                          )}
                          <span style={{ fontSize: '11px', fontWeight: 600, color: check.canRelease ? '#10b981' : '#f59e0b' }}>
                            {check.clearedCount}/6 Cleared
                          </span>
                        </div>

                        {/* Pillar initials */}
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {Object.entries(CONSTRAINT_PILLARS).map(([k, meta]) => {
                            const isCl = p.constraints?.[k]?.status === 'cleared';
                            return (
                              <span
                                key={k}
                                title={`${meta.name}: ${p.constraints?.[k]?.status || 'pending'}`}
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 3px',
                                  borderRadius: '2px',
                                  background: isCl ? '#10b981' : '#f59e0b',
                                  color: '#ffffff'
                                }}
                              >
                                {meta.code}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card Bottom Actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0',
                          paddingTop: '8px'
                        }}
                      >
                        <button
                          onClick={() => setActiveDossierIwp(p)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'transparent',
                            border: 'none',
                            color: '#3b82f6',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={13} /> View Dossier
                        </button>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          {prevStageMap[p.status] && (
                            <button
                              onClick={() => handleTransition(p, prevStageMap[p.status])}
                              title={`Move back to ${IWP_STATUSES[prevStageMap[p.status]].label}`}
                              style={{
                                padding: '4px 6px',
                                borderRadius: '4px',
                                background: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer'
                              }}
                            >
                              <ArrowLeft size={12} />
                            </button>
                          )}
                          {nextStageMap[p.status] && (
                            <button
                              onClick={() => handleTransition(p, nextStageMap[p.status])}
                              title={`Advance to ${IWP_STATUSES[nextStageMap[p.status]].label}`}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: '#3b82f6',
                                border: 'none',
                                color: '#ffffff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '11px',
                                fontWeight: 600
                              }}
                            >
                              <span>Next</span>
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {packs.length === 0 && (
                  <div
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: theme === 'dark' ? '#64748b' : '#94a3b8',
                      fontSize: '12px',
                      border: '1px dashed #334155',
                      borderRadius: '6px'
                    }}
                  >
                    No packages in this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Builder modal */}
      {isBuilderOpen && (
        <IwpBuilderModal
          isOpen={isBuilderOpen}
          onClose={() => setIsBuilderOpen(false)}
          selectedTasks={allTasks.slice(0, 3)}
          projectMeta={projectMeta}
          theme={theme}
          onIwpCreated={(created) => {
            const newList = saveSingleIwp(projectCode, created);
            setIwps(newList);
          }}
        />
      )}
    </div>
  );
}
