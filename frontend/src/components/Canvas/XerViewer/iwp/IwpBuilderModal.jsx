import React, { useState, useMemo } from 'react';
import {
  Package, X, Calendar, Clock, Users, Wrench, ShieldCheck,
  FileText, CheckCircle2, AlertTriangle, ArrowRight, Layers
} from 'lucide-react';
import { createIwpFromTasks, saveSingleIwp } from './iwpModel';
import ModernSelect from '../ModernSelect';

const DISCIPLINES = [
  'Piping',
  'Mechanical',
  'Electrical',
  'Civil / Concrete',
  'Structural Steel',
  'Instrumentation',
  'Insulation & Cladding',
  'Scaffolding & Rigging',
  'General Construction'
];

export default function IwpBuilderModal({
  isOpen,
  onClose,
  selectedTasks = [],
  projectMeta = {},
  onIwpCreated,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  // Auto-calculate aggregated metrics from selected tasks
  const aggregated = useMemo(() => {
    let minStart = null;
    let maxFinish = null;
    let totalHours = 0;

    selectedTasks.forEach(t => {
      const s = t.earlyStartDate || t.startDate;
      const f = t.earlyEndDate || t.endDate;
      if (s && (!minStart || s < minStart)) minStart = s;
      if (f && (!maxFinish || f > maxFinish)) maxFinish = f;
      const hrs = Number(t.targetWorkQty || (t.remainingDurationDays ? t.remainingDurationDays * 8 : 40));
      totalHours += hrs;
    });

    const now = new Date().toISOString().slice(0, 10);
    return {
      start: minStart ? minStart.slice(0, 10) : now,
      finish: maxFinish ? maxFinish.slice(0, 10) : now,
      totalHours: totalHours > 0 ? totalHours : 480
    };
  }, [selectedTasks]);

  const disciplineOptions = useMemo(() => {
    return DISCIPLINES.map(d => ({
      value: d,
      label: d
    }));
  }, []);

  const [discipline, setDiscipline] = useState('Piping');
  const [title, setTitle] = useState(() => {
    const disc = 'Piping';
    return `${disc} Installation Package (${selectedTasks.length} Activities)`;
  });
  const [area, setArea] = useState('Unit 100 - Module A');
  const [cwpRef, setCwpRef] = useState(() => `CWP-${(projectMeta.shortCode || 'GEN').toUpperCase()}-PIP-01`);
  const [crewSize, setCrewSize] = useState(6);
  const [plannedHours, setPlannedHours] = useState(aggregated.totalHours);
  const [targetCraft, setTargetCraft] = useState('Pipefitter / Welder Crew');

  const handleDisciplineChange = (val) => {
    setDiscipline(val);
    const discCode = val.slice(0, 3).toUpperCase();
    setCwpRef(`CWP-${(projectMeta.shortCode || 'GEN').toUpperCase()}-${discCode}-01`);
    setTitle(`${val} Installation Package (${selectedTasks.length} Activities)`);
    setTargetCraft(`${val} Craft Crew`);
  };

  const handleCreate = () => {
    const custom = {
      discipline,
      title,
      area,
      cwpRef,
      crewSize,
      targetCraft,
      plannedManHours: plannedHours
    };

    const newIwp = createIwpFromTasks(selectedTasks, projectMeta, custom);
    saveSingleIwp(projectMeta.shortCode || projectMeta.projectName || 'default', newIwp);

    if (onIwpCreated) {
      onIwpCreated(newIwp);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
          borderRadius: '12px',
          border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: theme === 'dark' ? '#0f172a' : '#f8fafc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <Package size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Bundle Activities into IWP Digital Pack
              </h2>
              <p style={{ fontSize: '12px', color: theme === 'dark' ? '#94a3b8' : '#64748b', margin: 0 }}>
                CII / COAA Advanced Work Packaging standard (500–1,000 man-hours target)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme === 'dark' ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary Box */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              fontSize: '12px'
            }}
          >
            <div>
              <span style={{ color: '#60a5fa', display: 'block', fontSize: '10px', fontWeight: 700 }}>ACTIVITIES BUNDLED</span>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>{selectedTasks.length} Tasks</span>
            </div>
            <div>
              <span style={{ color: '#60a5fa', display: 'block', fontSize: '10px', fontWeight: 700 }}>ESTIMATED MAN-HOURS</span>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>{aggregated.totalHours} hrs</span>
            </div>
            <div>
              <span style={{ color: '#60a5fa', display: 'block', fontSize: '10px', fontWeight: 700 }}>PLANNED START</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{aggregated.start}</span>
            </div>
            <div>
              <span style={{ color: '#60a5fa', display: 'block', fontSize: '10px', fontWeight: 700 }}>PLANNED FINISH</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{aggregated.finish}</span>
            </div>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Discipline
              </label>
              <ModernSelect
                value={discipline}
                onChange={handleDisciplineChange}
                options={disciplineOptions}
                isDark={theme === 'dark'}
                width="100%"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Parent CWP Reference
              </label>
              <input
                type="text"
                value={cwpRef}
                onChange={(e) => setCwpRef(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                  border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                  color: 'inherit',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Package Title / Scope Summary
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                color: 'inherit',
                fontSize: '13px'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Target Craft
              </label>
              <input
                type="text"
                value={targetCraft}
                onChange={(e) => setTargetCraft(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                  border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                  color: 'inherit',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Crew Size
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={crewSize}
                onChange={(e) => setCrewSize(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                  border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                  color: 'inherit',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Target Man-Hours
              </label>
              <input
                type="number"
                value={plannedHours}
                onChange={(e) => setPlannedHours(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  background: theme === 'dark' ? '#0f172a' : '#f8fafc',
                  border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
                  color: 'inherit',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* Activities preview list */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Selected Activities ({selectedTasks.length})
            </label>
            <div
              style={{
                maxHeight: '130px',
                overflowY: 'auto',
                border: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                borderRadius: '6px',
                background: theme === 'dark' ? '#0f172a' : '#f8fafc'
              }}
            >
              {selectedTasks.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderBottom: idx < selectedTasks.length - 1 ? (theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0') : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12px'
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#3b82f6' }}>{t.activityCode || t.code || t.taskId}</span>
                  <span style={{ flex: 1, margin: '0 12px', color: theme === 'dark' ? '#cbd5e1' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.activityName || t.name || 'Task'}
                  </span>
                  <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}>
                    {t.earlyStartDate || t.startDate || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: theme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: theme === 'dark' ? '#0f172a' : '#f8fafc'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
              background: 'transparent',
              border: theme === 'dark' ? '1px solid #334155' : '1px solid #cbd5e1',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: '9px 20px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Package size={15} /> Create IWP Digital Pack
          </button>
        </div>
      </div>
    </div>
  );
}
