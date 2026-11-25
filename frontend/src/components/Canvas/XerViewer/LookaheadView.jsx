import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Layers,
  Search,
  Filter,
  Download,
  Flame,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Users,
  Briefcase,
  SlidersHorizontal,
  FileSpreadsheet,
  CalendarDays,
  LayoutGrid,
  Package
} from 'lucide-react';
import {
  CONSTRAINT_TYPES,
  formatDate,
  parseDateSafe,
  generateLookaheadDays,
  generateLookaheadWeeks,
  isTaskInLookahead,
  calculateTaskDailyProfile,
  calculateTaskWeeklyProfile,
  initTaskConstraints,
  evaluateTaskReadiness,
  exportLookaheadToCsv
} from './lookaheadEngine';
import ConstraintDrawer from './ConstraintDrawer';
import IwpBuilderModal from './iwp/IwpBuilderModal';

const HORIZONS = [
  { days: 21, label: '3WL', tag: '3 Weeks (21d)', desc: 'Tactical Site Execution' },
  { days: 42, label: '6WL', tag: '6 Weeks (42d)', desc: 'AWP / WorkFace Planning' },
  { days: 84, label: '12WL', tag: '12 Weeks (84d)', desc: 'Quarterly Lookahead' },
  { days: 14, label: '2WL', tag: '2 Weeks (14d)', desc: 'Short-Interval Plan' },
  { days: 28, label: '4WL', tag: '4 Weeks (28d)', desc: 'Monthly Lookahead' }
];

export default function LookaheadView({ xerData, isDark, filename = 'schedule.xer', onOpenIwpPacks }) {
  // Determine initial anchor date (snap to project Data Date or earliest start)
  const defaultAnchor = useMemo(() => {
    if (xerData.project && xerData.project.last_recalc_date) {
      return String(xerData.project.last_recalc_date).split(' ')[0];
    }
    if (xerData.metrics && xerData.metrics.earliestStart) {
      return String(xerData.metrics.earliestStart).split(' ')[0];
    }
    return formatDate(new Date());
  }, [xerData]);

  const [anchorDate, setAnchorDate] = useState(defaultAnchor);
  const [horizonDays, setHorizonDays] = useState(21); // 14, 21, 28, 42, 84
  const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'weekly'
  const [groupBy, setGroupBy] = useState('trade'); // 'trade' | 'wbs' | 'none'
  const [readinessFilter, setReadinessFilter] = useState('ALL'); // 'ALL' | 'READY' | 'BLOCKED' | 'PENDING' | 'CRITICAL'
  const [searchTerm, setSearchTerm] = useState('');

  // Constraint state stored in map: { [taskId]: constraints }
  const [constraintsMap, setConstraintsMap] = useState({});

  // Initialize constraints map when tasks change
  useEffect(() => {
    if (!xerData.tasks || !xerData.tasks.length) return;
    setConstraintsMap(prev => {
      const next = { ...prev };
      let changed = false;
      xerData.tasks.forEach(t => {
        if (!next[t.id]) {
          next[t.id] = initTaskConstraints(t);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [xerData.tasks]);

  // Selected task for Constraint Drawer
  const [selectedTaskItem, setSelectedTaskItem] = useState(null);

  // Selected tasks for IWP Digital Packaging
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [isIwpModalOpen, setIsIwpModalOpen] = useState(false);

  // Generate the days array for this horizon
  const days = useMemo(() => {
    return generateLookaheadDays(anchorDate, horizonDays);
  }, [anchorDate, horizonDays]);

  // Generate the weeks array for weekly mode or header groups
  const weeks = useMemo(() => {
    return generateLookaheadWeeks(days);
  }, [days]);

  const windowStartStr = days[0]?.dateStr || '';
  const windowEndStr = days[days.length - 1]?.dateStr || '';

  // Extract and prepare tasks that intersect this window
  const tasksWithProfile = useMemo(() => {
    const rawTasks = xerData.tasks || [];
    const inWindow = rawTasks.filter(t => isTaskInLookahead(t, windowStartStr, windowEndStr));

    return inWindow.map(t => {
      const c = constraintsMap[t.id] || initTaskConstraints(t);
      const readiness = evaluateTaskReadiness(c);
      const dailyProfile = calculateTaskDailyProfile(t, days);
      const weeklyProfile = calculateTaskWeeklyProfile(t, weeks);

      return {
        task: t,
        constraints: c,
        readiness,
        dailyProfile,
        weeklyProfile
      };
    });
  }, [xerData.tasks, windowStartStr, windowEndStr, constraintsMap, days, weeks]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let list = tasksWithProfile;

    if (readinessFilter === 'READY') {
      list = list.filter(i => i.readiness === 'READY');
    } else if (readinessFilter === 'BLOCKED') {
      list = list.filter(i => i.readiness === 'BLOCKED');
    } else if (readinessFilter === 'PENDING') {
      list = list.filter(i => i.readiness === 'PENDING');
    } else if (readinessFilter === 'CRITICAL') {
      list = list.filter(i => i.task.critical);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(i =>
        (i.task.code && i.task.code.toLowerCase().includes(q)) ||
        (i.task.name && i.task.name.toLowerCase().includes(q)) ||
        (i.task.resourceNames && i.task.resourceNames.toLowerCase().includes(q)) ||
        (i.task.wbsName && i.task.wbsName.toLowerCase().includes(q))
      );
    }

    // Sort by start date then code
    return list.sort((a, b) => {
      const sa = a.task.startDate || '';
      const sb = b.task.startDate || '';
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.task.code || '').localeCompare(b.task.code || '');
    });
  }, [tasksWithProfile, readinessFilter, searchTerm]);

  // Aggregate Metrics for Lookahead Header
  const metrics = useMemo(() => {
    const total = tasksWithProfile.length;
    const critical = tasksWithProfile.filter(i => i.task.critical).length;
    const ready = tasksWithProfile.filter(i => i.readiness === 'READY').length;
    const blocked = tasksWithProfile.filter(i => i.readiness === 'BLOCKED').length;
    const pending = tasksWithProfile.filter(i => i.readiness === 'PENDING').length;
    const readyScore = total > 0 ? Math.round((ready / total) * 100) : 0;

    return { total, critical, ready, blocked, pending, readyScore };
  }, [tasksWithProfile]);

  // Selected tasks objects and hours for IWP packaging
  const selectedTasks = useMemo(() => {
    const raw = xerData.tasks || [];
    return raw.filter(t => selectedTaskIds.has(t.id));
  }, [xerData.tasks, selectedTaskIds]);

  const selectedTotalHours = useMemo(() => {
    return selectedTasks.reduce((acc, t) => acc + Number(t.targetWorkQty || (t.remainingDurationDays ? t.remainingDurationDays * 8 : 40)), 0);
  }, [selectedTasks]);

  const toggleSelectTask = (taskId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredItems.map(i => i.task.id)));
    }
  };

  // Grouped tasks if groupBy is active
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupKey: 'All Tasks', label: 'All Activities in Lookahead', items: filteredItems }];
    }

    const groups = new Map();
    filteredItems.forEach(item => {
      let key = 'Unassigned';
      let label = 'Unassigned';

      if (groupBy === 'trade') {
        key = item.task.resourceNames || 'General Trade';
        label = item.task.resourceNames ? `Trade: ${item.task.resourceNames}` : 'General Trade / Unassigned';
      } else if (groupBy === 'wbs') {
        key = item.task.wbsCode || item.task.wbsName || 'General Area';
        label = item.task.wbsName ? `${item.task.wbsCode || ''} ${item.task.wbsName}` : 'General Area';
      }

      if (!groups.has(key)) {
        groups.set(key, { groupKey: key, label, items: [] });
      }
      groups.get(key).items.push(item);
    });

    return Array.from(groups.values());
  }, [filteredItems, groupBy]);

  // Navigation handlers
  const handlePrevWeek = () => {
    const d = parseDateSafe(anchorDate) || new Date();
    d.setDate(d.getDate() - 7);
    setAnchorDate(formatDate(d));
  };

  const handleNextWeek = () => {
    const d = parseDateSafe(anchorDate) || new Date();
    d.setDate(d.getDate() + 7);
    setAnchorDate(formatDate(d));
  };

  const handleResetAnchor = () => {
    setAnchorDate(defaultAnchor);
  };

  const handleUpdateConstraints = (taskId, newConstraints) => {
    setConstraintsMap(prev => ({
      ...prev,
      [taskId]: newConstraints
    }));
    if (selectedTaskItem && selectedTaskItem.task.id === taskId) {
      setSelectedTaskItem(prev => ({
        ...prev,
        constraints: newConstraints,
        readiness: evaluateTaskReadiness(newConstraints)
      }));
    }
  };

  const totalWeeks = horizonDays / 7;
  const isWeekly = viewMode === 'weekly';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── 1. Top Horizon & KPI Dashboard ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 18px',
          background: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.85)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          backdropFilter: 'blur(10px)'
        }}
      >
        {/* Navigation & Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          {/* Horizon Anchor Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '7px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
            >
              <Calendar size={14} />
              <span>{totalWeeks}-WEEK LOOKAHEAD ({totalWeeks}WL)</span>
            </div>

            {/* Previous / Next Week Navigator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '7px',
                padding: '2px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)'
              }}
            >
              <button
                type="button"
                onClick={handlePrevWeek}
                title="Shift 1 Week Backward"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '0.78rem', fontWeight: 650, padding: '0 8px' }}>
                {windowStartStr} → {windowEndStr}
              </span>
              <button
                type="button"
                onClick={handleNextWeek}
                title="Shift 1 Week Forward"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '5px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetAnchor}
              title="Reset to Schedule Data Date"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 9px',
                borderRadius: '7px',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
                background: 'transparent',
                color: 'inherit',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={12} />
              <span>Data Date</span>
            </button>
          </div>

          {/* Right Actions: Horizon Selector, View Mode & Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Horizon Selector (3WL, 6WL, 12WL...) */}
            <div
              style={{
                display: 'inline-flex',
                borderRadius: '7px',
                padding: '2px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)'
              }}
            >
              {HORIZONS.map(h => (
                <button
                  key={h.days}
                  type="button"
                  onClick={() => {
                    setHorizonDays(h.days);
                    if (h.days === 84) setViewMode('weekly');
                  }}
                  title={h.desc}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '5px',
                    border: 'none',
                    fontSize: '0.74rem',
                    fontWeight: horizonDays === h.days ? 750 : 500,
                    cursor: 'pointer',
                    background: horizonDays === h.days ? '#f97316' : 'transparent',
                    color: horizonDays === h.days ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                    transition: 'all 0.15s ease'
                  }}
                >
                  {h.label}
                </button>
              ))}
            </div>

            {/* View Mode Toggle (Daily Grid vs Weekly Summary) */}
            <div
              style={{
                display: 'inline-flex',
                borderRadius: '7px',
                padding: '2px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)'
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('daily')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: viewMode === 'daily' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'daily' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') : 'transparent',
                  color: viewMode === 'daily' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b')
                }}
              >
                <CalendarDays size={12} />
                <span>Daily</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('weekly')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: viewMode === 'weekly' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'weekly' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') : 'transparent',
                  color: viewMode === 'weekly' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b')
                }}
              >
                <LayoutGrid size={12} />
                <span>Weekly</span>
              </button>
            </div>

            {/* Export Lookahead button */}
            <button
              type="button"
              onClick={() => exportLookaheadToCsv(tasksWithProfile, days, `${filename.replace(/\.xer$/i, '')}_${totalWeeks}WL`, isWeekly, weeks)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 11px',
                borderRadius: '7px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 650,
                cursor: 'pointer',
                boxShadow: '0 2px 5px rgba(16,185,129,0.25)'
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export {totalWeeks}WL</span>
            </button>
          </div>
        </div>

        {/* KPI Scorecards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          <div style={{ padding: '8px 12px', borderRadius: '7px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>TASKS IN {totalWeeks}WL</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>{metrics.total}</div>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: '7px', background: isDark ? 'rgba(244,63,94,0.05)' : 'rgba(244,63,94,0.03)', border: isDark ? '1px solid rgba(244,63,94,0.15)' : '1px solid rgba(244,63,94,0.1)' }}>
            <div style={{ fontSize: '0.68rem', color: '#f43f5e', fontWeight: 600 }}>CRITICAL PATH (🔥)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f43f5e', marginTop: '2px' }}>{metrics.critical}</div>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: '7px', background: isDark ? 'rgba(16,185,129,0.05)' : 'rgba(16,185,129,0.03)', border: isDark ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(16,185,129,0.1)' }}>
            <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>MAKE-READY SCORE</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>{metrics.readyScore}%</div>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: '7px', background: isDark ? 'rgba(244,63,94,0.05)' : 'rgba(244,63,94,0.03)', border: isDark ? '1px solid rgba(244,63,94,0.15)' : '1px solid rgba(244,63,94,0.1)' }}>
            <div style={{ fontSize: '0.68rem', color: '#f43f5e', fontWeight: 600 }}>BLOCKED ROADBLOCKS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: metrics.blocked > 0 ? '#f43f5e' : (isDark ? '#94a3b8' : '#64748b'), marginTop: '2px' }}>{metrics.blocked}</div>
          </div>
          <div style={{ padding: '8px 12px', borderRadius: '7px', background: isDark ? 'rgba(245,158,11,0.05)' : 'rgba(245,158,11,0.03)', border: isDark ? '1px solid rgba(245,158,11,0.15)' : '1px solid rgba(245,158,11,0.1)' }}>
            <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>PENDING CONSTRAINTS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>{metrics.pending}</div>
          </div>
        </div>

        {/* Filter & Grouping Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
            {/* Search */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
              <input
                type="text"
                placeholder={`Search ${totalWeeks}WL tasks...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: '30px',
                  padding: '0 10px 0 28px',
                  borderRadius: '6px',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
                  background: isDark ? '#0f172a' : '#ffffff',
                  color: 'inherit',
                  fontSize: '0.76rem'
                }}
              />
            </div>

            {/* Readiness Filter Chips */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { key: 'ALL', label: `All (${metrics.total})` },
                { key: 'READY', label: `🟢 Ready (${metrics.ready})` },
                { key: 'BLOCKED', label: `🔴 Blocked (${metrics.blocked})` },
                { key: 'PENDING', label: `🟡 Pending (${metrics.pending})` },
                { key: 'CRITICAL', label: `🔥 Critical (${metrics.critical})` }
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setReadinessFilter(f.key)}
                  style={{
                    padding: '4px 9px',
                    borderRadius: '6px',
                    border: readinessFilter === f.key
                      ? (isDark ? '1px solid #f97316' : '1px solid #ea580c')
                      : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'),
                    background: readinessFilter === f.key
                      ? (isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.1)')
                      : 'transparent',
                    color: readinessFilter === f.key ? '#f97316' : 'inherit',
                    fontSize: '0.72rem',
                    fontWeight: readinessFilter === f.key ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Group By selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>Group By:</span>
            <div
              style={{
                display: 'inline-flex',
                borderRadius: '6px',
                padding: '2px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)'
              }}
            >
              {[
                { key: 'trade', label: 'Trade / Sub', icon: Users },
                { key: 'wbs', label: 'WBS Area', icon: Layers },
                { key: 'none', label: 'Flat', icon: SlidersHorizontal }
              ].map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroupBy(g.key)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '0.7rem',
                    fontWeight: groupBy === g.key ? 700 : 500,
                    cursor: 'pointer',
                    background: groupBy === g.key ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') : 'transparent',
                    color: groupBy === g.key ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b')
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Lookahead Table Matrix (Daily vs Weekly) ── */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <table
          style={{
            tableLayout: 'fixed',
            width: 'max-content',
            minWidth: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.75rem'
          }}
        >
          {/* Column definitions */}
          <colgroup>
            <col style={{ width: '34px' }} />  {/* Selection Checkbox */}
            <col style={{ width: '110px' }} /> {/* Activity ID */}
            <col style={{ width: '240px' }} /> {/* Activity Name */}
            <col style={{ width: '130px' }} /> {/* Trade */}
            <col style={{ width: '140px' }} /> {/* 6 Constraints (M, L, E, D, P, A) */}
            <col style={{ width: '95px' }} />  {/* Readiness */}
            {isWeekly
              ? weeks.map(w => <col key={w.weekIndex} style={{ width: '95px' }} />)
              : days.map(d => <col key={d.dateStr} style={{ width: '36px' }} />)
            }
          </colgroup>

          {/* Sticky Header Tier 1 & Tier 2 */}
          <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: isDark ? '#0b1120' : '#f1f5f9' }}>
            {/* Tier 1: Left column groupings + Week groups */}
            <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>
              <th colSpan={6} style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.72rem' }}>
                TASK & CONSTRAINT DETAILS
              </th>

              {isWeekly ? (
                <th
                  colSpan={weeks.length}
                  style={{
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontWeight: 750,
                    color: '#f97316',
                    fontSize: '0.74rem',
                    borderLeft: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                    background: isDark ? 'rgba(249,115,22,0.05)' : 'rgba(249,115,22,0.04)'
                  }}
                >
                  WEEKLY EXECUTION PROGRESS (W1 – W{weeks.length})
                </th>
              ) : (
                Array.from({ length: totalWeeks }).map((_, wIdx) => (
                  <th
                    key={wIdx}
                    colSpan={7}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: '#f97316',
                      fontSize: '0.74rem',
                      borderLeft: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                      background: isDark ? 'rgba(249,115,22,0.05)' : 'rgba(249,115,22,0.04)'
                    }}
                  >
                    WEEK {wIdx + 1}
                  </th>
                ))
              )}
            </tr>

            {/* Tier 2: Column labels and individual day/week columns */}
            <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
              <th style={{ width: '34px', textAlign: 'center', padding: '6px 4px' }}>
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && selectedTaskIds.size === filteredItems.length}
                  onChange={toggleSelectAll}
                  title="Select all in lookahead"
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 650, color: isDark ? '#94a3b8' : '#475569' }}>Activity ID</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 650, color: isDark ? '#94a3b8' : '#475569' }}>Activity Name</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 650, color: isDark ? '#94a3b8' : '#475569' }}>Trade / Sub</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 650, color: '#f97316' }} title="Material, Labor, Equipment, Drawings, Permits, Access">
                Constraints (M L E D P A)
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 650, color: isDark ? '#94a3b8' : '#475569' }}>Readiness</th>

              {isWeekly ? (
                weeks.map(w => (
                  <th
                    key={w.weekIndex}
                    style={{
                      padding: '6px 4px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: isDark ? '#e2e8f0' : '#1e293b',
                      borderLeft: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      fontSize: '0.72rem',
                      lineHeight: 1.2
                    }}
                  >
                    <div>{w.label}</div>
                    <div style={{ fontSize: '0.64rem', fontWeight: 400, opacity: 0.7, whiteSpace: 'nowrap' }}>
                      {w.dateRangeStr}
                    </div>
                  </th>
                ))
              ) : (
                days.map((d, dIdx) => (
                  <th
                    key={d.dateStr}
                    style={{
                      padding: '4px 2px',
                      textAlign: 'center',
                      fontWeight: 650,
                      color: d.isWeekend ? (isDark ? '#475569' : '#94a3b8') : (isDark ? '#e2e8f0' : '#1e293b'),
                      background: d.isWeekend ? (isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)') : 'transparent',
                      borderLeft: dIdx % 7 === 0 ? (isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)') : 'none',
                      fontSize: '0.68rem',
                      lineHeight: 1.15
                    }}
                  >
                    <div>{d.dayName}</div>
                    <div style={{ fontWeight: 750, marginTop: '1px' }}>{d.dayNum}</div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          {/* Table Body with Group Headers & Tasks */}
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={6 + (isWeekly ? weeks.length : days.length)}
                  style={{ textAlign: 'center', padding: '50px 20px', color: isDark ? '#64748b' : '#94a3b8' }}
                >
                  No activities in this {totalWeeks}-week window match your filters. Try shifting weeks using the arrow buttons above.
                </td>
              </tr>
            ) : (
              groupedSections.map(sec => (
                <React.Fragment key={sec.groupKey}>
                  {/* Group Section Header */}
                  {groupBy !== 'none' && (
                    <tr style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                      <td
                        colSpan={6 + (isWeekly ? weeks.length : days.length)}
                        style={{
                          padding: '6px 12px',
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          color: '#f97316',
                          borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                          borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)'
                        }}
                      >
                        {sec.label} ({sec.items.length})
                      </td>
                    </tr>
                  )}

                  {/* Task Rows */}
                  {sec.items.map(item => {
                    const { task, constraints, readiness, dailyProfile, weeklyProfile } = item;
                    const barColor = task.critical ? '#f43f5e' : (readiness === 'READY' ? '#10b981' : '#38bdf8');
                    const isSelected = selectedTaskIds.has(task.id);

                    return (
                      <tr
                        key={task.id}
                        style={{
                          borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                          background: isSelected
                            ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)')
                            : task.critical
                            ? (isDark ? 'rgba(244,63,94,0.04)' : 'rgba(244,63,94,0.02)')
                            : 'transparent',
                          transition: 'background 0.12s'
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = task.critical ? (isDark ? 'rgba(244,63,94,0.04)' : 'rgba(244,63,94,0.02)') : 'transparent';
                          }
                        }}
                      >
                        {/* 0. Row Checkbox */}
                        <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTask(task.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        {/* 1. Activity ID */}
                        <td
                          onClick={() => setSelectedTaskItem(item)}
                          style={{
                            padding: '6px 10px',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: task.critical ? '#f43f5e' : (isDark ? '#38bdf8' : '#0284c7'),
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {task.code}
                        </td>

                        {/* 2. Activity Name */}
                        <td
                          onClick={() => setSelectedTaskItem(item)}
                          style={{ padding: '6px 10px', cursor: 'pointer', overflow: 'hidden' }}
                          title={task.name}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {task.critical && <Flame size={12} color="#f43f5e" style={{ flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {task.name}
                            </span>
                          </div>
                        </td>

                        {/* 3. Trade */}
                        <td style={{ padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDark ? '#94a3b8' : '#64748b' }}>
                          {task.resourceNames || '—'}
                        </td>

                        {/* 4. Constraint Chips (M, L, E, D, P, A) */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {CONSTRAINT_TYPES.map(c => {
                              const st = constraints[c.key] || 'ready';
                              const chipBg = st === 'ready' ? '#10b981' : st === 'blocked' ? '#f43f5e' : '#f59e0b';
                              return (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => setSelectedTaskItem(item)}
                                  title={`${c.label}: ${st.toUpperCase()}`}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '3px',
                                    border: 'none',
                                    background: chipBg,
                                    color: '#ffffff',
                                    fontSize: '0.62rem',
                                    fontWeight: 750,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 0
                                  }}
                                >
                                  {c.short}
                                </button>
                              );
                            })}
                          </div>
                        </td>

                        {/* 5. Readiness Pill */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedTaskItem(item)}
                            style={{
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 750,
                              background: readiness === 'READY'
                                ? 'rgba(16,185,129,0.15)'
                                : readiness === 'BLOCKED'
                                ? 'rgba(244,63,94,0.15)'
                                : 'rgba(245,158,11,0.15)',
                              color: readiness === 'READY'
                                ? '#10b981'
                                : readiness === 'BLOCKED'
                                ? '#f43f5e'
                                : '#f59e0b'
                            }}
                          >
                            {readiness === 'READY' ? '🟢 Ready' : readiness === 'BLOCKED' ? '🔴 Blocked' : '🟡 Pending'}
                          </button>
                        </td>

                        {/* 6. Timeline Cells (Weekly vs Daily) */}
                        {isWeekly ? (
                          weeklyProfile.map((wp, wIdx) => (
                            <td
                              key={wp.weekIndex}
                              style={{
                                padding: '4px 6px',
                                textAlign: 'center',
                                borderLeft: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                                verticalAlign: 'middle',
                                height: '28px'
                              }}
                            >
                              {wp.inRange && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '18px',
                                    borderRadius: '4px',
                                    background: barColor,
                                    color: '#ffffff',
                                    fontSize: '0.68rem',
                                    fontWeight: 750,
                                    opacity: 0.9,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                  }}
                                  title={`${task.code}: Week ${wp.weekIndex} (${wp.workingDaysCount} working days)`}
                                >
                                  {wp.workingDaysCount > 0 ? `${wp.workingDaysCount}d` : 'Active'}
                                </div>
                              )}
                            </td>
                          ))
                        ) : (
                          dailyProfile.map((p, dIdx) => (
                            <td
                              key={p.dateStr}
                              style={{
                                padding: 0,
                                textAlign: 'center',
                                background: p.isWeekend ? (isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)') : 'transparent',
                                borderLeft: dIdx % 7 === 0 ? (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)') : 'none',
                                height: '28px',
                                verticalAlign: 'middle'
                              }}
                            >
                              {p.inRange && (
                                <div
                                  style={{
                                    height: '14px',
                                    background: p.isWorking ? barColor : 'rgba(148,163,184,0.25)',
                                    borderRadius: p.isStartDay && p.isFinishDay
                                      ? '3px'
                                      : p.isStartDay
                                      ? '3px 0 0 3px'
                                      : p.isFinishDay
                                      ? '0 3px 3px 0'
                                      : '0',
                                    margin: '0',
                                    opacity: p.isWorking ? 0.9 : 0.4
                                  }}
                                  title={`${task.code}: ${p.dateStr}`}
                                />
                              )}
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 3. Constraint Drawer Slide-Over ── */}
      <ConstraintDrawer
        isOpen={Boolean(selectedTaskItem)}
        onClose={() => setSelectedTaskItem(null)}
        taskItem={selectedTaskItem}
        onUpdateConstraints={handleUpdateConstraints}
        isDark={isDark}
      />

      {/* ── 4. Floating IWP Bundle Action Bar ── */}
      {selectedTaskIds.size > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '10px 20px',
            borderRadius: '10px',
            background: isDark ? '#1e293b' : '#0f172a',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <Package size={16} color="#3b82f6" />
            <span>
              {selectedTaskIds.size} Activities Selected ({selectedTotalHours} planned hrs)
            </span>
          </div>

          <button
            onClick={() => setIsIwpModalOpen(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Package size={14} /> Bundle into IWP Digital Pack
          </button>

          <button
            onClick={() => setSelectedTaskIds(new Set())}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── 5. IWP Builder Modal ── */}
      {isIwpModalOpen && (
        <IwpBuilderModal
          isOpen={isIwpModalOpen}
          onClose={() => setIsIwpModalOpen(false)}
          selectedTasks={selectedTasks}
          projectMeta={{
            shortCode: xerData.project?.proj_short_name || 'PROJECT',
            projectName: xerData.project?.proj_name || filename
          }}
          theme={isDark ? 'dark' : 'light'}
          onIwpCreated={() => {
            setSelectedTaskIds(new Set());
            if (onOpenIwpPacks) onOpenIwpPacks();
          }}
        />
      )}

    </div>
  );
}
