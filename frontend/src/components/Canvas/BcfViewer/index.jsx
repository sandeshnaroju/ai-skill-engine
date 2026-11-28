import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Camera,
  User,
  Calendar,
  Search,
  Download,
  Sun,
  Moon,
  Copy,
  Check,
  Maximize2,
  X,
  Layers,
  Tag,
  FileText,
  ExternalLink,
  Compass,
} from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import { parseBcfContent, exportBcfCsv, exportBcfJson } from './bcfParser';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadgeStyle(status, isDark) {
  const s = (status || '').toLowerCase();
  if (s.includes('closed') || s.includes('resolved') || s.includes('done') || s.includes('complete')) {
    return {
      bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#d1fae5',
      fg: isDark ? '#34d399' : '#065f46',
      border: isDark ? 'rgba(16, 185, 129, 0.35)' : '#6ee7b7',
    };
  }
  if (s.includes('progress') || s.includes('review') || s.includes('active') || s.includes('pending')) {
    return {
      bg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#fef3c7',
      fg: isDark ? '#fbbf24' : '#92400e',
      border: isDark ? 'rgba(245, 158, 11, 0.35)' : '#fcd34d',
    };
  }
  return {
    bg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#fee2e2',
    fg: isDark ? '#f87171' : '#991b1b',
    border: isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5',
  };
}

function getPriorityBadgeStyle(priority, isDark) {
  const p = (priority || '').toLowerCase();
  if (p.includes('critical') || p.includes('high') || p.includes('major') || p.includes('urgent')) {
    return {
      bg: isDark ? 'rgba(244, 63, 94, 0.16)' : '#ffe4e6',
      fg: isDark ? '#fb7185' : '#9f1239',
    };
  }
  if (p.includes('low') || p.includes('minor')) {
    return {
      bg: isDark ? 'rgba(100, 116, 139, 0.2)' : '#f1f5f9',
      fg: isDark ? '#94a3b8' : '#475569',
    };
  }
  return {
    bg: isDark ? 'rgba(59, 130, 246, 0.16)' : '#dbeafe',
    fg: isDark ? '#60a5fa' : '#1e40af',
  };
}

function fmtVec(v) {
  if (!v) return '—';
  return `(${Number(v.x).toFixed(2)}, ${Number(v.y).toFixed(2)}, ${Number(v.z).toFixed(2)})`;
}

export default function BcfViewer({ fullContent, filename = 'coordination.bcfzip', theme: propTheme }) {
  const [localTheme, setLocalTheme] = useState(propTheme || 'dark');
  useEffect(() => {
    if (propTheme) setLocalTheme(propTheme);
  }, [propTheme]);

  const isDark = localTheme !== 'light';

  const model = useMemo(() => parseBcfContent(fullContent, filename), [fullContent, filename]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');

  const [selectedTopicGuid, setSelectedTopicGuid] = useState(null);
  const [activeViewpointIdx, setActiveViewpointIdx] = useState(0);
  const [copiedGuid, setCopiedGuid] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const statusOptions = useMemo(() => {
    const keys = Object.keys(model.stats.byStatus || {});
    return [{ value: 'ALL', label: 'All Statuses' }, ...keys.map((k) => ({ value: k, label: `${k} (${model.stats.byStatus[k]})` }))];
  }, [model.stats.byStatus]);

  const priorityOptions = useMemo(() => {
    const keys = Object.keys(model.stats.byPriority || {});
    return [{ value: 'ALL', label: 'All Priorities' }, ...keys.map((k) => ({ value: k, label: `${k} (${model.stats.byPriority[k]})` }))];
  }, [model.stats.byPriority]);

  const typeOptions = useMemo(() => {
    const keys = Object.keys(model.stats.byType || {});
    return [{ value: 'ALL', label: 'All Types' }, ...keys.map((k) => ({ value: k, label: `${k} (${model.stats.byType[k]})` }))];
  }, [model.stats.byType]);

  const assigneeOptions = useMemo(() => {
    const keys = Object.keys(model.stats.byAssignee || {});
    return [{ value: 'ALL', label: 'All Assignees' }, ...keys.map((k) => ({ value: k, label: `${k} (${model.stats.byAssignee[k]})` }))];
  }, [model.stats.byAssignee]);

  const filteredTopics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (model.topics || []).filter((t) => {
      if (statusFilter !== 'ALL' && (t.topicStatus || 'Open') !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && (t.priority || 'Normal') !== priorityFilter) return false;
      if (typeFilter !== 'ALL' && (t.topicType || 'Issue') !== typeFilter) return false;
      const asg = t.assignedTo || 'Unassigned';
      if (assigneeFilter !== 'ALL' && asg !== assigneeFilter) return false;
      if (q) {
        const hay = `${t.index || ''} ${t.title || ''} ${t.description || ''} ${t.assignedTo || ''} ${t.creationAuthor || ''} ${(t.labels || []).join(' ')} ${t.guid || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [model.topics, searchQuery, statusFilter, priorityFilter, typeFilter, assigneeFilter]);

  const activeTopic = useMemo(() => {
    if (!filteredTopics.length) return null;
    const found = filteredTopics.find((t) => t.guid === selectedTopicGuid);
    return found || filteredTopics[0];
  }, [filteredTopics, selectedTopicGuid]);

  useEffect(() => {
    setActiveViewpointIdx(0);
  }, [activeTopic?.guid]);

  const activeViewpoint = useMemo(() => {
    const vps = activeTopic?.viewpoints || [];
    if (!vps.length) return null;
    return vps[activeViewpointIdx] || vps[0];
  }, [activeTopic, activeViewpointIdx]);

  const handleCopyGuid = (g) => {
    if (!g) return;
    navigator.clipboard?.writeText(g);
    setCopiedGuid(g);
    setTimeout(() => setCopiedGuid((prev) => (prev === g ? null : prev)), 1600);
  };

  const handleJumpToViewpoint = (vpGuid) => {
    if (!vpGuid || !activeTopic?.viewpoints?.length) return;
    const idx = activeTopic.viewpoints.findIndex((v) => v.guid === vpGuid);
    if (idx >= 0) setActiveViewpointIdx(idx);
  };

  const colors = {
    bg: isDark ? '#0b0f17' : '#f8fafc',
    surface: isDark ? '#111827' : '#ffffff',
    surfaceAlt: isDark ? '#161f30' : '#f1f5f9',
    border: isDark ? '#1f2937' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#3b82f6',
    accentSoft: isDark ? 'rgba(59, 130, 246, 0.14)' : '#eff6ff',
  };

  const baseName = (model.filename || 'bcf').replace(/\.(bcfzip|bcf)$/i, '');

  if (model.error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg, color: colors.text, padding: 24 }}>
        <div style={{ maxWidth: 460, padding: 24, borderRadius: 12, background: colors.surface, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#f59e0b', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Unable to Load BCF Archive</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{model.error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: colors.bg, color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top Header & KPI Strip */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, background: colors.surface, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: colors.accentSoft, color: colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={16} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {model.project?.name || baseName}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: colors.accentSoft, color: colors.accent }}>
                  BCF v{model.version}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>
                {model.stats.totalTopics} Issues · {model.stats.totalViewpoints} Viewpoints · {model.stats.totalComments} Comments
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => exportBcfCsv(filteredTopics, `${baseName}_issues.csv`)}
              title="Export filtered issues to CSV"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}
            >
              <Download size={13} /> CSV
            </button>
            <button
              onClick={() => exportBcfJson(model, `${baseName}_report.json`)}
              title="Export normalized BCF JSON"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}
            >
              <Download size={13} /> JSON
            </button>
            <button
              onClick={() => setLocalTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>

        {/* KPI Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', val: model.stats.totalTopics, color: colors.accent },
            { label: 'Open', val: model.stats.openCount, color: '#ef4444' },
            { label: 'In Progress', val: model.stats.inProgressCount, color: '#f59e0b' },
            { label: 'Resolved / Closed', val: model.stats.closedCount, color: '#10b981' },
            { label: 'Overdue', val: model.stats.overdueCount, color: '#f43f5e' },
            { label: 'Unassigned', val: model.stats.unassignedCount, color: colors.textMuted },
          ].map((k) => (
            <div key={k.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: k.color }} />
              <span style={{ color: colors.textMuted }}>{k.label}:</span>
              <span style={{ fontWeight: 700, color: colors.text }}>{k.val}</span>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, description, assignee, label, GUID..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 28px',
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.bg,
                color: colors.text,
                outline: 'none',
              }}
            />
          </div>
          <ModernSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} isDark={isDark} />
          <ModernSelect value={priorityFilter} onChange={setPriorityFilter} options={priorityOptions} isDark={isDark} />
          <ModernSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} isDark={isDark} />
          <ModernSelect value={assigneeFilter} onChange={setAssigneeFilter} options={assigneeOptions} isDark={isDark} />
        </div>
      </div>

      {/* Master-Detail Split Workspace */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Issue List */}
        <div style={{ width: 350, minWidth: 280, maxWidth: '42%', borderRight: `1px solid ${colors.border}`, overflowY: 'auto', minHeight: 0, background: colors.surface, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTopics.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
              No issues match the current filters.
            </div>
          ) : (
            filteredTopics.map((t) => {
              const isSelected = activeTopic?.guid === t.guid;
              const stStyle = getStatusBadgeStyle(t.topicStatus, isDark);
              const prStyle = getPriorityBadgeStyle(t.priority, isDark);
              const thumb = (t.viewpoints || []).find((v) => v.snapshotDataUrl)?.snapshotDataUrl;

              return (
                <button
                  key={t.guid}
                  onClick={() => setSelectedTopicGuid(t.guid)}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? colors.accent : colors.border}`,
                    background: isSelected ? colors.accentSoft : colors.bg,
                    color: colors.text,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted }}>#{t.index ?? '—'}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: stStyle.bg, color: stStyle.fg, border: `1px solid ${stStyle.border}` }}>
                        {t.topicStatus || 'Open'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999, background: prStyle.bg, color: prStyle.fg }}>
                        {t.priority || 'Normal'}
                      </span>
                    </div>
                    {t.isOverdue && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f43f5e' }}>OVERDUE</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {thumb && (
                      <img
                        src={thumb}
                        alt="Snapshot"
                        style={{ width: 52, height: 38, objectFit: 'cover', borderRadius: 5, border: `1px solid ${colors.border}`, flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 2 }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: 11, color: colors.textMuted }}>
                        {t.topicType || 'Issue'}{t.stage ? ` · ${t.stage}` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: colors.textMuted, paddingTop: 2 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <User size={11} /> {t.assignedTo || 'Unassigned'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Camera size={11} /> {(t.viewpoints || []).length}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <MessageSquare size={11} /> {(t.comments || []).length}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Issue Detail & Viewpoint Inspector */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!activeTopic ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              Select an issue from the left list to inspect viewpoints, IFC components, and comments.
            </div>
          ) : (
            <>
              {/* Topic Title Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted }}>Issue #{activeTopic.index ?? '—'}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    ...(() => {
                      const s = getStatusBadgeStyle(activeTopic.topicStatus, isDark);
                      return { background: s.bg, color: s.fg, border: `1px solid ${s.border}` };
                    })(),
                  }}>
                    {activeTopic.topicStatus || 'Open'}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    ...(() => {
                      const p = getPriorityBadgeStyle(activeTopic.priority, isDark);
                      return { background: p.bg, color: p.fg };
                    })(),
                  }}>
                    {activeTopic.priority || 'Normal'}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.textMuted }}>
                    {activeTopic.topicType || 'Issue'}
                  </span>
                  {activeTopic.isOverdue && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(244,63,94,0.16)', color: '#f43f5e' }}>
                      Overdue
                    </span>
                  )}
                </div>

                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{activeTopic.title}</h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: colors.textMuted }}>
                  <span>GUID: <code style={{ fontSize: 11 }}>{activeTopic.guid}</code></span>
                  <button
                    onClick={() => handleCopyGuid(activeTopic.guid)}
                    style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: 0 }}
                  >
                    {copiedGuid === activeTopic.guid ? <Check size={12} /> : <Copy size={12} />}
                    {copiedGuid === activeTopic.guid ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Viewpoint Snapshot Stage & Camera/IFC Inspector */}
              {(activeTopic.viewpoints || []).length > 0 && (
                <div style={{ borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Camera size={14} style={{ color: colors.accent }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Viewpoints ({activeTopic.viewpoints.length})</span>
                      {activeTopic.viewpoints.map((vp, idx) => (
                        <button
                          key={vp.guid || idx}
                          onClick={() => setActiveViewpointIdx(idx)}
                          style={{
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: `1px solid ${idx === activeViewpointIdx ? colors.accent : colors.border}`,
                            background: idx === activeViewpointIdx ? colors.accentSoft : colors.surfaceAlt,
                            color: idx === activeViewpointIdx ? colors.accent : colors.text,
                            cursor: 'pointer',
                          }}
                        >
                          VP {idx + 1}
                        </button>
                      ))}
                    </div>
                    {activeViewpoint?.snapshotDataUrl && (
                      <button
                        onClick={() => setLightboxSrc(activeViewpoint.snapshotDataUrl)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}
                      >
                        <Maximize2 size={12} /> Enlarge
                      </button>
                    )}
                  </div>

                  {activeViewpoint?.snapshotDataUrl ? (
                    <div style={{ background: isDark ? '#060910' : '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', maxHeight: 380, overflow: 'hidden' }}>
                      <img
                        src={activeViewpoint.snapshotDataUrl}
                        alt="Viewpoint Snapshot"
                        onClick={() => setLightboxSrc(activeViewpoint.snapshotDataUrl)}
                        style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain', cursor: 'zoom-in' }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
                      No snapshot image attached to this viewpoint.
                    </div>
                  )}

                  {/* 3D Camera & IFC Component Inspector */}
                  {activeViewpoint && (
                    <div style={{ padding: 12, borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11.5 }}>
                      {activeViewpoint.camera && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', color: colors.textMuted }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.text, fontWeight: 600 }}>
                            <Compass size={13} style={{ color: colors.accent }} />
                            {activeViewpoint.cameraType === 'orthogonal' ? 'Orthogonal Camera' : 'Perspective Camera'}
                          </span>
                          <span>Pos: <code>{fmtVec(activeViewpoint.camera.viewPoint)}</code></span>
                          <span>Dir: <code>{fmtVec(activeViewpoint.camera.direction)}</code></span>
                          {activeViewpoint.camera.fieldOfView != null && (
                            <span>FOV: <code>{activeViewpoint.camera.fieldOfView}°</code></span>
                          )}
                          {activeViewpoint.camera.viewToWorldScale != null && (
                            <span>Scale: <code>{activeViewpoint.camera.viewToWorldScale}</code></span>
                          )}
                          {activeViewpoint.clippingPlanesCount > 0 && (
                            <span>Clipping Planes: <code>{activeViewpoint.clippingPlanesCount}</code></span>
                          )}
                        </div>
                      )}

                      {(activeViewpoint.selection || []).length > 0 && (
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 5, color: colors.text }}>
                            Selected IFC Components ({activeViewpoint.selection.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {activeViewpoint.selection.slice(0, 40).map((comp, i) => (
                              <button
                                key={`${comp.ifcGuid}-${i}`}
                                onClick={() => handleCopyGuid(comp.ifcGuid)}
                                title={comp.originatingSystem ? `${comp.originatingSystem} (click to copy)` : 'Click to copy IfcGuid'}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: `1px solid ${colors.border}`,
                                  background: colors.surfaceAlt,
                                  color: colors.text,
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                  cursor: 'pointer',
                                }}
                              >
                                {comp.ifcGuid || comp.authoringToolId || 'Unknown'}
                                {copiedGuid === comp.ifcGuid ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} style={{ color: colors.textMuted }} />}
                              </button>
                            ))}
                            {activeViewpoint.selection.length > 40 && (
                              <span style={{ fontSize: 11, color: colors.textMuted, alignSelf: 'center' }}>
                                +{activeViewpoint.selection.length - 40} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {(activeViewpoint.coloring || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>Color Overrides:</span>
                          {activeViewpoint.coloring.map((c, idx) => (
                            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: colors.surfaceAlt, border: `1px solid ${colors.border}` }}>
                              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color?.startsWith('#') ? c.color : `#${(c.color || '888888').slice(-6)}` }} />
                              <span>{c.ifcGuids?.length || 0} elements</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, padding: 14, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 2 }}>Assigned To</div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <User size={13} style={{ color: colors.accent }} /> {activeTopic.assignedTo || 'Unassigned'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 2 }}>Due Date</div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, color: activeTopic.isOverdue ? '#f43f5e' : colors.text }}>
                    <Calendar size={13} /> {formatDate(activeTopic.dueDate)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 2 }}>Stage</div>
                  <div style={{ fontWeight: 600 }}>{activeTopic.stage || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 2 }}>Created By</div>
                  <div style={{ fontWeight: 600 }}>{activeTopic.creationAuthor || '—'} · {formatDate(activeTopic.creationDate)}</div>
                </div>
                {(activeTopic.labels || []).length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 4 }}>Labels</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {activeTopic.labels.map((lbl, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: colors.accentSoft, color: colors.accent, fontSize: 11, fontWeight: 600 }}>
                          <Tag size={10} /> {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(activeTopic.headerFiles || []).length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 4 }}>Referenced BIM Models</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {activeTopic.headerFiles.map((f, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11 }}>
                          <FileText size={11} style={{ color: colors.accent }} /> {f.filename || f.reference || 'IFC Model'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(activeTopic.referenceLinks || []).length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 4 }}>Reference Links</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {activeTopic.referenceLinks.map((lnk, i) => (
                        <a key={i} href={lnk} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.accent, fontSize: 11 }}>
                          <ExternalLink size={11} /> {lnk}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {activeTopic.description && (
                <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Description</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: colors.text }}>
                    {activeTopic.description}
                  </div>
                </div>
              )}

              {/* Comment Thread */}
              <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.surface }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} style={{ color: colors.accent }} />
                  Comments ({(activeTopic.comments || []).length})
                </div>
                {(activeTopic.comments || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.textMuted }}>No comments recorded on this issue.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeTopic.comments.map((c, idx) => (
                      <div key={c.guid || idx} style={{ padding: 10, borderRadius: 8, background: colors.bg, border: `1px solid ${colors.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, color: colors.textMuted, flexWrap: 'wrap', gap: 6 }}>
                          <span style={{ fontWeight: 700, color: colors.text }}>{c.author || 'Unknown Author'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {c.viewpointGuid && (
                              <button
                                onClick={() => handleJumpToViewpoint(c.viewpointGuid)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.accent, fontSize: 10.5, cursor: 'pointer' }}
                              >
                                <Camera size={10} /> Viewpoint
                              </button>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={10} /> {formatDateTime(c.date)}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Snapshot Lightbox Modal */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            style={{ position: 'absolute', top: 18, right: 18, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
          <img
            src={lightboxSrc}
            alt="Full Snapshot"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
