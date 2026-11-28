import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar,
  Layers,
  Search,
  Filter,
  Download,
  Flame,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  Columns,
  Table as TableIcon,
  Sun,
  Moon,
  ArrowUpDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Briefcase,
  Users,
  Check,
  X,
  Package,
  TrendingUp
} from 'lucide-react';
import { parseXer, parseXerAsync } from './xerParser';
import { isMspProjectXml, parseMspXml } from './mspXmlParser';
import LookaheadView from './LookaheadView';
import IwpKanbanBoard from './iwp/IwpKanbanBoard';
import ManagementVisibilityView from './ManagementVisibilityView';
import WorkforcePlanningView from './WorkforcePlanningView';
import ModernSelect from './ModernSelect';

const AVAILABLE_COLUMNS = [
  { key: 'code', label: 'Activity ID', default: true, width: '130px' },
  { key: 'name', label: 'Activity Name', default: true, width: '280px' },
  { key: 'wbsCode', label: 'WBS', default: true, width: '90px' },
  { key: 'statusLabel', label: 'Status', default: true, width: '110px' },
  { key: 'percentComplete', label: 'Progress', default: true, width: '120px' },
  { key: 'originalDurationDays', label: 'Orig Dur', default: true, width: '90px', align: 'right' },
  { key: 'remainDurationDays', label: 'Rem Dur', default: false, width: '90px', align: 'right' },
  { key: 'startDate', label: 'Start Date', default: true, width: '110px' },
  { key: 'finishDate', label: 'Finish Date', default: true, width: '110px' },
  { key: 'earlyStart', label: 'Early Start', default: false, width: '110px' },
  { key: 'earlyFinish', label: 'Early Finish', default: false, width: '110px' },
  { key: 'lateStart', label: 'Late Start', default: false, width: '110px' },
  { key: 'lateFinish', label: 'Late Finish', default: false, width: '110px' },
  { key: 'actualStart', label: 'Actual Start', default: false, width: '110px' },
  { key: 'actualFinish', label: 'Actual Finish', default: false, width: '110px' },
  { key: 'totalFloatDays', label: 'Total Float', default: true, width: '95px', align: 'right' },
  { key: 'freeFloatDays', label: 'Free Float', default: false, width: '95px', align: 'right' },
  { key: 'predecessors', label: 'Predecessors', default: false, width: '160px' },
  { key: 'resourceNames', label: 'Resources', default: false, width: '160px' },
  { key: 'calendarName', label: 'Calendar', default: false, width: '140px' },
];

export default function XerProjectViewer({ fullContent, artifact, filename = 'schedule.xer', theme: propTheme }) {
  const [theme, setTheme] = useState(() => {
    if (propTheme) return propTheme;
    const docTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    if (docTheme === 'light' || docTheme === 'dark') return docTheme;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_theme') : null;
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    if (propTheme) setTheme(propTheme);
  }, [propTheme]);

  // Tab State: 'gantt' | 'wbs' | 'resources' | 'tables'
  const [activeTab, setActiveTab] = useState('gantt');

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, CRITICAL, TK_Active, TK_Complete, TK_NotStart, MILESTONE
  const [selectedWbs, setSelectedWbs] = useState('ALL');
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const s = new Set();
    AVAILABLE_COLUMNS.forEach(c => { if (c.default) s.add(c.key); });
    return s;
  });
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isColumnPickerOpen) return;
    const handleOutsideClick = (e) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) {
        setIsColumnPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isColumnPickerOpen]);

  // Sorting
  const [sortField, setSortField] = useState('code');
  const [sortDirection, setSortDirection] = useState('asc'); // asc | desc

  // Pagination for heavy files (3,000+ activities)
  const [page, setPage] = useState(1);
  const pageSize = 100;

  // Selected raw table for tables explorer
  const [selectedRawTable, setSelectedRawTable] = useState('PROJECT');

  // Parse state (auto-detects MS Project XML or Primavera P6 XER; async chunked streaming for 20MB+)
  const [parseState, setParseState] = useState(() => {
    if (!fullContent) {
      return { isParsing: false, percent: 100, currentTable: '', data: parseXer('') };
    }
    if (isMspProjectXml(fullContent)) {
      try {
        return { isParsing: false, percent: 100, currentTable: 'Complete', data: parseMspXml(fullContent) };
      } catch (e) {
        return { isParsing: false, percent: 100, currentTable: '', data: parseXer('') };
      }
    }
    if (fullContent.length < 500000) {
      try {
        return { isParsing: false, percent: 100, currentTable: 'Complete', data: parseXer(fullContent) };
      } catch (e) {
        return { isParsing: false, percent: 100, currentTable: '', data: parseXer('') };
      }
    }
    return { isParsing: true, percent: 5, currentTable: 'Reading stream', data: null };
  });

  useEffect(() => {
    let isCancelled = false;
    if (!fullContent) {
      setParseState({ isParsing: false, percent: 100, currentTable: '', data: parseXer('') });
      return;
    }

    if (isMspProjectXml(fullContent)) {
      try {
        const mspData = parseMspXml(fullContent);
        setParseState({ isParsing: false, percent: 100, currentTable: 'Complete', data: mspData });
      } catch (err) {
        setParseState({ isParsing: false, percent: 100, currentTable: '', data: parseXer('') });
      }
      return;
    }

    if (fullContent.length < 500000) {
      try {
        const syncData = parseXer(fullContent);
        setParseState({ isParsing: false, percent: 100, currentTable: 'Complete', data: syncData });
      } catch (err) {
        setParseState({ isParsing: false, percent: 100, currentTable: '', data: parseXer('') });
      }
      return;
    }

    setParseState({ isParsing: true, percent: 5, currentTable: 'Reading XER streams...', data: null });

    parseXerAsync(fullContent, (progress) => {
      if (!isCancelled) {
        setParseState(prev => ({
          ...prev,
          percent: progress.percent,
          currentTable: progress.currentTable
        }));
      }
    }).then(asyncData => {
      if (!isCancelled) {
        setParseState({ isParsing: false, percent: 100, currentTable: 'Complete', data: asyncData });
      }
    }).catch(err => {
      console.error('Async parse failed:', err);
      if (!isCancelled) {
        setParseState({ isParsing: false, percent: 100, currentTable: '', data: parseXer('') });
      }
    });

    return () => { isCancelled = true; };
  }, [fullContent]);

  const xerData = parseState.data || parseXer('');

  // Status filter options with real-time computed counts and visual badges
  const statusOptions = useMemo(() => [
    { value: 'ALL', label: 'All Statuses', count: (xerData.tasks || []).length },
    { value: 'CRITICAL', label: 'Critical Path Only', icon: '🔥', count: xerData.metrics.criticalTasks, badgeColor: '#f43f5e' },
    { value: 'TK_Active', label: 'In Progress', count: (xerData.tasks || []).filter(t => t.statusCode === 'TK_Active').length, badgeColor: '#3b82f6' },
    { value: 'TK_Complete', label: 'Completed', count: (xerData.tasks || []).filter(t => t.statusCode === 'TK_Complete').length, badgeColor: '#10b981' },
    { value: 'TK_NotStart', label: 'Not Started', count: (xerData.tasks || []).filter(t => t.statusCode === 'TK_NotStart').length, badgeColor: '#94a3b8' },
    { value: 'MILESTONE', label: 'Milestones', icon: '💎', count: (xerData.tasks || []).filter(t => t.isMilestone).length, badgeColor: '#f59e0b' },
  ], [xerData]);

  // WBS filter options with real-time computed counts
  const wbsOptions = useMemo(() => [
    { value: 'ALL', label: 'All WBS Levels', count: (xerData.tasks || []).length },
    ...(xerData.wbsList || []).map(w => ({
      value: w.wbs_id,
      label: w.code ? `${w.code} - ${w.name}` : w.name,
      count: w.taskCount,
      subtext: w.code ? `Code: ${w.code}` : undefined
    }))
  ], [xerData]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let list = xerData.tasks || [];

    if (statusFilter === 'CRITICAL') {
      list = list.filter(t => t.critical);
    } else if (statusFilter === 'MILESTONE') {
      list = list.filter(t => t.isMilestone);
    } else if (statusFilter !== 'ALL') {
      list = list.filter(t => t.statusCode === statusFilter);
    }

    if (selectedWbs !== 'ALL') {
      list = list.filter(t => t.wbsId === selectedWbs || t.wbsCode === selectedWbs);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(t =>
        (t.code && t.code.toLowerCase().includes(q)) ||
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.wbsName && t.wbsName.toLowerCase().includes(q)) ||
        (t.wbsCode && t.wbsCode.toLowerCase().includes(q)) ||
        (t.resourceNames && t.resourceNames.toLowerCase().includes(q))
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];

      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDirection === 'asc' ? va - vb : vb - va;
      }
      return sortDirection === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });

    return list;
  }, [xerData.tasks, statusFilter, selectedWbs, searchTerm, sortField, sortDirection]);

  // Paginated view
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const pagedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page, pageSize]);

  // Active columns strictly ordered according to AVAILABLE_COLUMNS
  const activeColumns = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(c => visibleColumns.has(c.key));
  }, [visibleColumns]);

  // Cell renderer to guarantee exact styling, formatting, and alignment matching activeColumns
  const renderCellContent = (colKey, t) => {
    switch (colKey) {
      case 'code':
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 650, color: t.critical ? '#f43f5e' : (isDark ? '#38bdf8' : '#0284c7') }}>
            {t.code}
          </span>
        );
      case 'name':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }} title={t.name}>
            {t.critical && <Flame size={12} color="#f43f5e" style={{ flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
          </div>
        );
      case 'wbsCode':
        return <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{t.wbsCode || '—'}</span>;
      case 'statusLabel': {
        const isComplete = t.statusCode === 'TK_Complete';
        const isActive = t.statusCode === 'TK_Active';
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 7px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 650,
              background: isComplete ? 'rgba(16,185,129,0.15)' : isActive ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.15)',
              color: isComplete ? '#10b981' : isActive ? '#3b82f6' : (isDark ? '#94a3b8' : '#64748b')
            }}
          >
            {t.statusLabel}
          </span>
        );
      }
      case 'percentComplete':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${t.percentComplete}%`, height: '100%', background: t.critical ? '#f43f5e' : '#10b981' }} />
            </div>
            <span style={{ fontSize: '0.72rem', minWidth: '32px', textAlign: 'right' }}>{t.percentComplete}%</span>
          </div>
        );
      case 'originalDurationDays':
        return <span>{t.originalDurationDays !== null && t.originalDurationDays !== undefined ? `${t.originalDurationDays}d` : '—'}</span>;
      case 'remainDurationDays':
        return <span>{t.remainDurationDays !== null && t.remainDurationDays !== undefined ? `${t.remainDurationDays}d` : '—'}</span>;
      case 'startDate':
        return <span style={{ opacity: 0.85 }}>{t.startDate || '—'}</span>;
      case 'finishDate':
        return <span style={{ opacity: 0.85 }}>{t.finishDate || '—'}</span>;
      case 'earlyStart':
        return <span>{t.earlyStart || '—'}</span>;
      case 'earlyFinish':
        return <span>{t.earlyFinish || '—'}</span>;
      case 'lateStart':
        return <span>{t.lateStart || '—'}</span>;
      case 'lateFinish':
        return <span>{t.lateFinish || '—'}</span>;
      case 'actualStart':
        return <span>{t.actualStart || '—'}</span>;
      case 'actualFinish':
        return <span>{t.actualFinish || '—'}</span>;
      case 'totalFloatDays':
        return (
          <span style={{ fontWeight: t.critical ? 700 : 'normal', color: t.critical ? '#f43f5e' : 'inherit' }}>
            {t.totalFloatDays !== null && t.totalFloatDays !== undefined ? `${t.totalFloatDays}d` : '—'}
          </span>
        );
      case 'freeFloatDays':
        return <span>{t.freeFloatDays !== null && t.freeFloatDays !== undefined ? `${t.freeFloatDays}d` : '—'}</span>;
      case 'predecessors':
        return (
          <span title={Array.isArray(t.predecessors) ? t.predecessors.join(', ') : ''}>
            {Array.isArray(t.predecessors) && t.predecessors.length > 0 ? t.predecessors.join(', ') : 'None'}
          </span>
        );
      case 'resourceNames':
        return <span title={t.resourceNames || ''}>{t.resourceNames || '—'}</span>;
      case 'calendarName':
        return <span style={{ opacity: 0.85 }}>{t.calendarName || '—'}</span>;
      default:
        return <span>{String(t[colKey] !== undefined && t[colKey] !== null ? t[colKey] : '—')}</span>;
    }
  };

  // Handle Sort Toggle
  const handleSort = (key) => {
    if (sortField === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(key);
      setSortDirection('asc');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (!filteredTasks.length) return;
    const cols = AVAILABLE_COLUMNS.filter(c => visibleColumns.has(c.key));
    const header = cols.map(c => `"${c.label}"`).join(',');
    const rows = filteredTasks.map(t =>
      cols.map(c => {
        const val = Array.isArray(t[c.key]) ? t[c.key].join('; ') : t[c.key];
        return `"${val !== undefined && val !== null ? String(val).replace(/"/g, '""') : ''}"`;
      }).join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename.replace(/\.xer$/i, '')}_activities.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isDark = theme === 'dark';

  // Timescale Bounds for Gantt visualization
  const ganttBounds = useMemo(() => {
    const { earliestStart, latestFinish } = xerData.metrics;
    if (!earliestStart || !latestFinish) return null;
    const startMs = new Date(earliestStart).getTime();
    const finishMs = new Date(latestFinish).getTime();
    if (isNaN(startMs) || isNaN(finishMs) || finishMs <= startMs) return null;
    return {
      startMs,
      finishMs,
      totalSpanMs: finishMs - startMs
    };
  }, [xerData.metrics]);

  if (parseState.isParsing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%',
          backgroundColor: isDark ? '#070b12' : '#f8fafc',
          color: isDark ? '#f1f5f9' : '#0f172a',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}
      >
        <div
          style={{
            width: '400px',
            maxWidth: '90%',
            padding: '24px',
            borderRadius: '12px',
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            border: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Opening Large Schedule</div>
              <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                {filename} (Non-blocking background stream)
              </div>
            </div>
          </div>

          <div
            style={{
              height: '8px',
              width: '100%',
              backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '10px'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${parseState.percent}%`,
                background: 'linear-gradient(90deg, #38bdf8 0%, #3b82f6 100%)',
                transition: 'width 0.2s ease'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
            <span>{parseState.currentTable ? `Processing ${parseState.currentTable}` : 'Parsing...'}</span>
            <span style={{ fontWeight: 700, color: '#38bdf8' }}>{parseState.percent}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#070b12' : '#f8fafc',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* ── 1. Top Navigation & Metric Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 18px',
          background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          backdropFilter: 'blur(8px)',
          zIndex: 30,
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(249, 115, 22, 0.15)',
              color: '#fb923c',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}
          >
            <Calendar size={14} />
            <span>{xerData.sourceFormat === 'msp_xml' ? 'MICROSOFT PROJECT SCHEDULE' : 'PRIMAVERA P6 SCHEDULE'}</span>
          </div>

          <span style={{ fontSize: '0.85rem', fontWeight: 650, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {filename}
          </span>
          {xerData.project && (
            <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
              • Project: <strong>{xerData.project.proj_short_name || xerData.project.proj_id}</strong>
            </span>
          )}
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', padding: '3px', borderRadius: '8px' }}>
          {[
            { id: 'gantt', label: 'Activities & Gantt', icon: Calendar },
            { id: 'lookahead', label: 'Lookahead', icon: Clock },
            { id: 'iwp_packs', label: 'IWP Packs', icon: Package },
            { id: 'cost_evm', label: 'Cost & EVM', icon: TrendingUp },
            { id: 'workforce', label: 'Workforce Load', icon: Users },
            { id: 'wbs', label: 'WBS', icon: Layers },
            { id: 'resources', label: 'Resources', icon: Users },
            { id: 'tables', label: 'P6 Tables', icon: TableIcon }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: isActive ? '#f97316' : 'transparent',
                  color: isActive ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExportCsv}
            title="Export filtered activities to CSV"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              background: 'transparent',
              color: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              const next = isDark ? 'light' : 'dark';
              setTheme(next);
              localStorage.setItem('app_theme', next);
              document.documentElement.setAttribute('data-theme', next);
              window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme: next } }));
            }}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer'
            }}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* ── 2. Metric KPI Cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
          padding: '12px 18px',
          background: isDark ? '#0b111c' : '#f1f5f9',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b' }}>Total Activities</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
            {xerData.metrics.totalTasks.toLocaleString()}
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Flame size={12} color="#f43f5e" /> Critical Path
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f43f5e', marginTop: '2px' }}>
            {xerData.metrics.criticalTasks.toLocaleString()}
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b' }}>In Progress</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
            {xerData.metrics.inProgressTasks.toLocaleString()}
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b' }}>Completed</div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
            {xerData.metrics.completedTasks.toLocaleString()}
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '8px', background: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff', border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.7rem', color: isDark ? '#94a3b8' : '#64748b' }}>Schedule Window</div>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', marginTop: '4px' }}>
            {xerData.metrics.earliestStart || 'N/A'} <br />
            <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontWeight: 400 }}>to</span> {xerData.metrics.latestFinish || 'N/A'}
          </div>
        </div>
      </div>

      {/* ── 3. MAIN WORKSPACE CONTENT ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ── TAB 1: ACTIVITIES & GANTT VIEW ── */}
        {activeTab === 'gantt' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Filter & Column Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 18px',
                background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.7)',
                borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input
                    type="text"
                    placeholder="Search code or name..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                    style={{
                      width: '100%',
                      height: '32px',
                      padding: '0 26px 0 28px',
                      borderRadius: '7px',
                      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)',
                      background: isDark ? '#0f172a' : '#ffffff',
                      color: 'inherit',
                      fontSize: '0.78rem',
                      boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.06)'
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(''); setPage(1); }}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        opacity: 0.6,
                        color: 'inherit',
                        display: 'flex'
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <ModernSelect
                  value={statusFilter}
                  onChange={v => { setStatusFilter(v); setPage(1); }}
                  options={statusOptions}
                  icon={Filter}
                  labelPrefix="Status"
                  isDark={isDark}
                  minWidth="140px"
                  maxWidth="220px"
                />

                {/* WBS Filter */}
                <ModernSelect
                  value={selectedWbs}
                  onChange={v => { setSelectedWbs(v); setPage(1); }}
                  options={wbsOptions}
                  icon={Layers}
                  labelPrefix="WBS"
                  isDark={isDark}
                  searchable={true}
                  minWidth="160px"
                  maxWidth="280px"
                />
              </div>

              {/* Column Picker Trigger & Counts */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Showing {filteredTasks.length === 0 ? 0 : Math.min((page - 1) * pageSize + 1, filteredTasks.length)}–{Math.min(page * pageSize, filteredTasks.length)} of {filteredTasks.length}
                </span>

                <div style={{ position: 'relative' }} ref={columnPickerRef}>
                  <button
                    onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      height: '32px',
                      padding: '0 11px',
                      borderRadius: '7px',
                      border: isColumnPickerOpen
                        ? (isDark ? '1px solid #f97316' : '1px solid #ea580c')
                        : (isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.14)'),
                      background: isColumnPickerOpen
                        ? (isDark ? 'rgba(249, 115, 22, 0.12)' : 'rgba(249, 115, 22, 0.08)')
                        : (isDark ? '#0f172a' : '#ffffff'),
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      boxShadow: isColumnPickerOpen
                        ? '0 0 0 2px rgba(249, 115, 22, 0.2)'
                        : (isDark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.06)'),
                      transition: 'all 0.15s ease',
                      userSelect: 'none'
                    }}
                  >
                    <Columns size={13} style={{ color: isColumnPickerOpen ? '#f97316' : (isDark ? '#94a3b8' : '#64748b') }} />
                    <span>Columns ({visibleColumns.size})</span>
                    <ChevronDown
                      size={13}
                      style={{
                        transform: isColumnPickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        color: isDark ? '#94a3b8' : '#64748b',
                        flexShrink: 0,
                        opacity: 0.7
                      }}
                    />
                  </button>

                  {/* Column Picker Dropdown */}
                  {isColumnPickerOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '6px',
                        width: '230px',
                        maxHeight: '380px',
                        overflowY: 'auto',
                        background: isDark ? '#0f172a' : '#ffffff',
                        border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.15)',
                        borderRadius: '8px',
                        boxShadow: isDark ? '0 12px 28px rgba(0,0,0,0.5)' : '0 12px 28px rgba(0,0,0,0.12)',
                        zIndex: 100,
                        padding: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f97316' }}>
                          Visible Columns ({visibleColumns.size})
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const s = new Set();
                              AVAILABLE_COLUMNS.forEach(c => s.add(c.key));
                              setVisibleColumns(s);
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.68rem', color: '#38bdf8', cursor: 'pointer' }}
                          >
                            All
                          </button>
                          <span style={{ fontSize: '0.68rem', opacity: 0.3 }}>|</span>
                          <button
                            type="button"
                            onClick={() => {
                              const s = new Set();
                              AVAILABLE_COLUMNS.forEach(c => { if (c.default) s.add(c.key); });
                              setVisibleColumns(s);
                            }}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.68rem', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer' }}
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {AVAILABLE_COLUMNS.map(col => {
                          const checked = visibleColumns.has(col.key);
                          return (
                            <label
                              key={col.key}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                fontSize: '0.75rem',
                                padding: '5px 8px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                userSelect: 'none',
                                background: checked ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}
                              onMouseLeave={e => e.currentTarget.style.background = checked ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent'}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setVisibleColumns(prev => {
                                    const next = new Set(prev);
                                    if (next.has(col.key)) {
                                      if (next.size > 2) next.delete(col.key);
                                    } else {
                                      next.add(col.key);
                                    }
                                    return next;
                                  });
                                }}
                                style={{
                                  width: '15px',
                                  height: '15px',
                                  minWidth: '15px',
                                  maxWidth: '15px',
                                  margin: 0,
                                  padding: 0,
                                  flexShrink: 0,
                                  cursor: 'pointer',
                                  accentColor: '#f97316'
                                }}
                              />
                              <span
                                style={{
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  fontWeight: checked ? 600 : 400,
                                  color: checked ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b')
                                }}
                              >
                                {col.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Combined Activity Table + Horizontal Gantt Timeline */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              <table
                style={{
                  tableLayout: 'fixed',
                  width: 'max-content',
                  minWidth: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.78rem'
                }}
              >
                <colgroup>
                  {activeColumns.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  <col style={{ width: '420px' }} />
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: isDark ? '#0f172a' : '#f1f5f9' }}>
                  <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                    {activeColumns.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          width: col.width,
                          minWidth: col.width,
                          maxWidth: col.width,
                          padding: '10px 12px',
                          textAlign: col.align || 'left',
                          fontWeight: 700,
                          color: isDark ? '#94a3b8' : '#475569',
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                            width: '100%'
                          }}
                        >
                          <span>{col.label}</span>
                          <ArrowUpDown size={11} style={{ opacity: sortField === col.key ? 1 : 0.3, flexShrink: 0 }} />
                        </div>
                      </th>
                    ))}
                    {/* Visual Gantt Column */}
                    <th
                      style={{
                        width: '420px',
                        minWidth: '420px',
                        maxWidth: '420px',
                        padding: '10px 12px',
                        textAlign: 'left',
                        color: '#f97316',
                        boxSizing: 'border-box'
                      }}
                    >
                      Schedule Timeline
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTasks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={activeColumns.length + 1}
                        style={{ textAlign: 'center', padding: '40px', color: isDark ? '#64748b' : '#94a3b8' }}
                      >
                        No activities match the current search & filters.
                      </td>
                    </tr>
                  ) : (
                    pagedTasks.map(t => {
                      const isComplete = t.statusCode === 'TK_Complete';

                      // Compute timeline bar position (0 to 100%)
                      let barLeft = 0;
                      let barWidth = 0;
                      if (ganttBounds && t.startDate && t.finishDate) {
                        const sMs = new Date(t.startDate).getTime();
                        const fMs = new Date(t.finishDate).getTime();
                        if (!isNaN(sMs) && !isNaN(fMs)) {
                          barLeft = Math.max(0, Math.min(100, ((sMs - ganttBounds.startMs) / ganttBounds.totalSpanMs) * 100));
                          barWidth = Math.max(1, Math.min(100 - barLeft, ((fMs - sMs) / ganttBounds.totalSpanMs) * 100));
                        }
                      }

                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                            background: t.critical ? (isDark ? 'rgba(244,63,94,0.05)' : 'rgba(244,63,94,0.03)') : 'transparent',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
                          onMouseLeave={e => e.currentTarget.style.background = t.critical ? (isDark ? 'rgba(244,63,94,0.05)' : 'rgba(244,63,94,0.03)') : 'transparent'}
                        >
                          {activeColumns.map(col => (
                            <td
                              key={col.key}
                              style={{
                                width: col.width,
                                minWidth: col.width,
                                maxWidth: col.width,
                                padding: '8px 12px',
                                textAlign: col.align || 'left',
                                boxSizing: 'border-box',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {renderCellContent(col.key, t)}
                            </td>
                          ))}

                          {/* Visual Gantt Bar Cell */}
                          <td style={{ width: '420px', minWidth: '420px', maxWidth: '420px', padding: '8px 12px', boxSizing: 'border-box', position: 'relative' }}>
                            <div style={{ position: 'relative', width: '100%', height: '18px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                              {t.isMilestone ? (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: `${barLeft}%`,
                                    top: '2px',
                                    width: '12px',
                                    height: '12px',
                                    transform: 'rotate(45deg)',
                                    background: t.critical ? '#f43f5e' : '#f59e0b'
                                  }}
                                  title={`Milestone: ${t.name} (${t.startDate})`}
                                />
                              ) : (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: `${barLeft}%`,
                                    width: `${Math.max(1.5, barWidth)}%`,
                                    top: '2px',
                                    bottom: '2px',
                                    borderRadius: '3px',
                                    background: t.critical ? '#f43f5e' : (isComplete ? '#10b981' : '#38bdf8'),
                                    opacity: 0.9
                                  }}
                                  title={`${t.code}: ${t.startDate} to ${t.finishDate} (${t.percentComplete}%)`}
                                >
                                  {t.percentComplete > 0 && t.percentComplete < 100 && (
                                    <div
                                      style={{
                                        width: `${t.percentComplete}%`,
                                        height: '100%',
                                        background: 'rgba(0,0,0,0.35)',
                                        borderRadius: '3px 0 0 3px'
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 18px',
                  borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  background: isDark ? '#0f172a' : '#f8fafc',
                  fontSize: '0.78rem'
                }}
              >
                <div>
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({filteredTasks.length} activities)
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: page > 1 ? 'pointer' : 'default', opacity: page > 1 ? 1 : 0.4 }}
                  >
                    Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: page < totalPages ? 'pointer' : 'default', opacity: page < totalPages ? 1 : 0.4 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 1.5: LOOKAHEAD PLANNER (3WL / 6WL / 12WL) ── */}
        {activeTab === 'lookahead' && (
          <LookaheadView
            xerData={xerData}
            isDark={isDark}
            filename={filename}
            onOpenIwpPacks={() => setActiveTab('iwp_packs')}
          />
        )}

        {/* ── TAB 1.7: IWP DIGITAL PACKS (AWP KANBAN & DOSSIERS) ── */}
        {activeTab === 'iwp_packs' && (
          <IwpKanbanBoard
            projectCode={xerData.project?.proj_short_name || xerData.project?.proj_id || filename}
            projectMeta={{
              shortCode: xerData.project?.proj_short_name || 'PROJECT',
              projectName: xerData.project?.proj_name || filename
            }}
            theme={theme}
            allTasks={xerData.tasks || []}
          />
        )}

        {/* ── TAB 2: WBS TREE HIERARCHY ── */}
        {activeTab === 'wbs' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '12px', color: '#f97316' }}>
              Work Breakdown Structure (WBS) Tree ({xerData.wbsList.length} elements)
            </div>
            <div style={{ borderRadius: '8px', overflow: 'hidden', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}>
                  <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>WBS Code</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>WBS Description</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Activities</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Completed Activities</th>
                  </tr>
                </thead>
                <tbody>
                  {xerData.wbsList.map(w => (
                    <tr
                      key={w.wbs_id}
                      style={{
                        borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                        background: 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 650, color: '#38bdf8' }}>
                        <span style={{ paddingLeft: `${w.level * 16}px` }}>
                          {w.level > 0 ? '↳ ' : ''}{w.code}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', fontWeight: w.level === 0 ? 700 : 'normal' }}>
                        {w.name}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {w.taskCount}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#10b981' }}>
                        {w.completedTaskCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: RESOURCES ── */}
        {activeTab === 'resources' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '12px', color: '#f97316' }}>
              Project Resources ({xerData.resources.length})
            </div>
            {xerData.resources.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', opacity: 0.6 }}>No resource assignments defined in this file.</div>
            ) : (
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}>
                    <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Resource ID</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Resource Name</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Short Code</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {xerData.resources.map(r => (
                      <tr key={r.id} style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)' }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{r.id}</td>
                        <td style={{ padding: '8px 14px', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: '8px 14px', color: isDark ? '#94a3b8' : '#64748b' }}>{r.shortName || '—'}</td>
                        <td style={{ padding: '8px 14px' }}>{r.type.replace('RT_', '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cost_evm' && (
          <ManagementVisibilityView xerData={xerData} filename={filename} isDark={isDark} />
        )}

        {activeTab === 'workforce' && (
          <WorkforcePlanningView xerData={xerData} filename={filename} isDark={isDark} />
        )}

        {/* ── TAB 4: RAW P6 TABLES EXPLORER ── */}
        {activeTab === 'tables' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {/* Table Selector Sidebar */}
            <div style={{ width: '220px', borderRight: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', overflowY: 'auto', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f97316', marginBottom: '8px', textTransform: 'uppercase' }}>
                XER Tables ({xerData.tables.size})
              </div>
              {Array.from(xerData.tables.keys()).map(tName => {
                const count = (xerData.tables.get(tName) || []).length;
                const isSel = selectedRawTable === tName;
                return (
                  <button
                    key={tName}
                    onClick={() => setSelectedRawTable(tName)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: isSel ? 'rgba(249,115,22,0.15)' : 'transparent',
                      color: isSel ? '#f97316' : 'inherit',
                      fontSize: '0.78rem',
                      fontWeight: isSel ? 700 : 'normal',
                      cursor: 'pointer',
                      textAlign: 'left',
                      marginBottom: '2px'
                    }}
                  >
                    <span>{tName}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Table Data View */}
            <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px' }}>
                Table: <code>%T {selectedRawTable}</code> ({(xerData.tables.get(selectedRawTable) || []).length} records)
              </div>
              {(() => {
                const rows = xerData.tables.get(selectedRawTable) || [];
                if (rows.length === 0) return <div style={{ opacity: 0.6 }}>Table is empty.</div>;
                const keys = Object.keys(rows[0] || {});
                return (
                  <div style={{ border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}>
                        <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
                          {keys.map(k => (
                            <th key={k} style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap', color: isDark ? '#94a3b8' : '#475569' }}>
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 150).map((r, rIdx) => (
                          <tr key={rIdx} style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.03)' }}>
                            {keys.map(k => (
                              <td key={k} style={{ padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(r[k] || '')}>
                                {String(r[k] || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 150 && (
                      <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.72rem', opacity: 0.6, background: isDark ? '#0f172a' : '#f8fafc' }}>
                        Showing first 150 of {rows.length} rows for performance.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
