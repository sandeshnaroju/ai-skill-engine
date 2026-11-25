import React from 'react';
import {
  X,
  Flame,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Layers,
  Users,
  Clock,
  Sparkles
} from 'lucide-react';
import { CONSTRAINT_TYPES, evaluateTaskReadiness } from './lookaheadEngine';

export default function ConstraintDrawer({
  isOpen,
  onClose,
  taskItem, // { task, constraints, readiness, dailyProfile }
  onUpdateConstraints,
  isDark
}) {
  if (!isOpen || !taskItem) return null;

  const { task, constraints } = taskItem;
  const readiness = evaluateTaskReadiness(constraints);

  const handleStatusChange = (constraintKey, newStatus) => {
    const updated = {
      ...constraints,
      [constraintKey]: newStatus
    };
    onUpdateConstraints(task.id, updated);
  };

  const handleNotesChange = (text) => {
    const updated = {
      ...constraints,
      notes: text
    };
    onUpdateConstraints(task.id, updated);
  };

  const handleMarkAllReady = () => {
    const updated = {
      ...constraints,
      material: 'ready',
      labor: 'ready',
      equipment: 'ready',
      drawings: 'ready',
      permits: 'ready',
      access: 'ready'
    };
    onUpdateConstraints(task.id, updated);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '92vw',
        background: isDark ? '#0b1120' : '#ffffff',
        borderLeft: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.12)',
        boxShadow: isDark ? '-12px 0 35px rgba(0,0,0,0.7)' : '-12px 0 35px rgba(0,0,0,0.15)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)'
      }}
    >
      {/* ── Top Header ── */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 0.95)'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                fontWeight: 750,
                color: task.critical ? '#f43f5e' : (isDark ? '#38bdf8' : '#0284c7')
              }}
            >
              {task.code}
            </span>
            {task.critical && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(244,63,94,0.15)',
                  color: '#f43f5e',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}
              >
                <Flame size={11} /> Critical Path
              </span>
            )}
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.92rem',
              fontWeight: 650,
              color: isDark ? '#f8fafc' : '#0f172a',
              lineHeight: 1.3
            }}
          >
            {task.name}
          </h3>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: isDark ? '#94a3b8' : '#64748b',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Scrollable Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Metadata summary bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)',
            fontSize: '0.75rem'
          }}
        >
          <div>
            <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.7rem' }}>WBS Zone</div>
            <div style={{ fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.wbsName || task.wbsCode || '—'}
            </div>
          </div>
          <div>
            <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.7rem' }}>Trade / Subcontractor</div>
            <div style={{ fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.resourceNames || 'Unassigned Trade'}
            </div>
          </div>
          <div>
            <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.7rem' }}>Schedule Window</div>
            <div style={{ fontWeight: 600, marginTop: '2px' }}>
              {task.startDate} → {task.finishDate}
            </div>
          </div>
          <div>
            <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.7rem' }}>Rem Duration / Float</div>
            <div style={{ fontWeight: 600, marginTop: '2px' }}>
              {task.remainDurationDays}d rem / {task.totalFloatDays !== null ? `${task.totalFloatDays}d float` : '0d float'}
            </div>
          </div>
        </div>

        {/* Readiness Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: '8px',
            background: readiness === 'READY'
              ? 'rgba(16, 185, 129, 0.12)'
              : readiness === 'BLOCKED'
              ? 'rgba(244, 63, 94, 0.14)'
              : 'rgba(245, 158, 11, 0.12)',
            border: readiness === 'READY'
              ? '1px solid rgba(16, 185, 129, 0.25)'
              : readiness === 'BLOCKED'
              ? '1px solid rgba(244, 63, 94, 0.25)'
              : '1px solid rgba(245, 158, 11, 0.25)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {readiness === 'READY' ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : readiness === 'BLOCKED' ? (
              <XCircle size={18} color="#f43f5e" />
            ) : (
              <AlertTriangle size={18} color="#f59e0b" />
            )}
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 750,
                  color: readiness === 'READY' ? '#10b981' : readiness === 'BLOCKED' ? '#f43f5e' : '#f59e0b'
                }}
              >
                {readiness === 'READY'
                  ? 'WORKFRONT READY TO MOBILIZE'
                  : readiness === 'BLOCKED'
                  ? 'ROADBLOCK: CANNOT START'
                  : 'PENDING FIELD CLEARANCE'}
              </div>
              <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '1px' }}>
                {readiness === 'READY'
                  ? 'All 6 Make-Ready constraints have been verified.'
                  : readiness === 'BLOCKED'
                  ? '1 or more critical constraints blocked.'
                  : 'Review open items before dispatching crew.'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMarkAllReady}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Sparkles size={11} /> Mark All Ready
          </button>
        </div>

        {/* 6 Constraint Cards */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f97316', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Make-Ready Field Constraints (6 Pillars)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {CONSTRAINT_TYPES.map(c => {
              const currentStatus = constraints[c.key] || 'ready';

              return (
                <div
                  key={c.key}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: isDark ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ fontSize: '0.9rem' }}>{c.icon}</span>
                      <div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 650, color: isDark ? '#f8fafc' : '#0f172a' }}>
                          {c.label}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', marginLeft: '6px' }}>
                          ({c.short})
                        </span>
                      </div>
                    </div>

                    {/* 3-Way Status Toggle */}
                    <div
                      style={{
                        display: 'inline-flex',
                        borderRadius: '6px',
                        padding: '2px',
                        background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleStatusChange(c.key, 'ready')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: currentStatus === 'ready' ? '#10b981' : 'transparent',
                          color: currentStatus === 'ready' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Ready
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(c.key, 'pending')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: currentStatus === 'pending' ? '#f59e0b' : 'transparent',
                          color: currentStatus === 'pending' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Pending
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(c.key, 'blocked')}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: currentStatus === 'blocked' ? '#f43f5e' : 'transparent',
                          color: currentStatus === 'blocked' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Blocked
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.3 }}>
                    {c.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Field Notes & Roadblock Log */}
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f97316', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Field Standup Notes / Action Item
          </div>
          <textarea
            rows={3}
            placeholder="Log specific constraint issue (e.g. Waiting on RFI response from structural engineer, delivery ETA Thursday morning...)"
            value={constraints.notes || ''}
            onChange={e => handleNotesChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '7px',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
              background: isDark ? '#0f172a' : '#f8fafc',
              color: 'inherit',
              fontSize: '0.75rem',
              resize: 'vertical'
            }}
          />
        </div>

      </div>

      {/* ── Footer ── */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 0.95)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '6px 16px',
            borderRadius: '6px',
            border: 'none',
            background: '#f97316',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: 'pointer'
          }}
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}
