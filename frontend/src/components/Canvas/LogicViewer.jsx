import React, { useState, useMemo } from 'react';
import {
  Cpu,
  Calendar,
  Layers,
  Code,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Terminal,
  Activity,
  Tag,
  Sun,
  Moon,
  Search,
  Filter
} from 'lucide-react';

/**
 * Parses Rockwell RSLogix5000 L5X XML
 */
function parseL5X(xmlText) {
  const routines = [];
  const tags = [];

  // Parse Tags
  const tagRegex = /<Tag\s+Name="([^"]+)"(?:\s+TagType="([^"]+)")?(?:\s+DataType="([^"]+)")?/gi;
  let match;
  while ((match = tagRegex.exec(xmlText)) !== null) {
    tags.push({ name: match[1], tagType: match[2] || 'Base', dataType: match[3] || 'BOOL' });
  }

  // Parse Rungs
  const rungRegex = /<Rung\s+Number="(\d+)"[^>]*>[\s\S]*?<Text>([\s\S]*?)<\/Text>/gi;
  const rungs = [];
  while ((match = rungRegex.exec(xmlText)) !== null) {
    rungs.push({ number: parseInt(match[1], 10), code: match[2].trim() });
  }

  return { tags, rungs };
}

/**
 * Parses Primavera P6 XER format
 */
function parseXER(xerText) {
  const lines = xerText.split(/\r?\n/);
  const tables = new Map();
  let currentTable = null;
  let currentFields = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('%T')) {
      const parts = line.split(/\s+/);
      currentTable = parts[1];
      tables.set(currentTable, []);
    } else if (line.startsWith('%F') && currentTable) {
      currentFields = line.substring(3).split('\t').map((f) => f.trim());
    } else if (line.startsWith('%R') && currentTable) {
      const vals = line.substring(3).split('\t');
      const row = {};
      currentFields.forEach((field, fIdx) => {
        row[field] = vals[fIdx] || '';
      });
      tables.get(currentTable).push(row);
    }
  }

  // Extract Tasks / Activities
  const tasks = (tables.get('TASK') || []).map((t, idx) => ({
    id: t.task_id || t.task_code || `T-${idx + 1}`,
    code: t.task_code || `A${1000 + idx * 10}`,
    name: t.task_name || `Activity ${idx + 1}`,
    startDate: t.target_start_date || t.act_start_date || '2026-09-01',
    endDate: t.target_end_date || t.act_end_date || '2026-09-15',
    status: t.status_code || 'TK_NotStart',
    percentComplete: parseFloat(t.phys_complete_pct || t.act_work_qty || '0'),
    critical: t.critical_flag === 'Y'
  }));

  return { tables, tasks };
}

export default function LogicViewer({ fullContent, artifact, filename = 'program.l5x' }) {
  const [theme, setTheme] = useState('dark');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('main'); // 'rungs' | 'tags' | 'gantt'

  const fn = (filename || '').toLowerCase();
  const isP6 = fn.endsWith('.xer');
  const isL5X = fn.endsWith('.l5x') || fn.endsWith('.l5k');
  const isMatlab = fn.endsWith('.m') || fn.endsWith('.slx');

  const l5xData = useMemo(() => {
    if (isL5X && fullContent) {
      try {
        return parseL5X(fullContent);
      } catch (e) {
        return { tags: [], rungs: [] };
      }
    }
    return { tags: [], rungs: [] };
  }, [fullContent, isL5X]);

  const xerData = useMemo(() => {
    if (isP6 && fullContent) {
      try {
        return parseXER(fullContent);
      } catch (e) {
        return { tasks: [] };
      }
    }
    return { tasks: [] };
  }, [fullContent, isP6]);

  const isDark = theme === 'dark';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#080c14' : '#f8fafc',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: isDark ? 'rgba(249, 115, 22, 0.15)' : 'rgba(234, 88, 12, 0.1)',
              color: isDark ? '#fb923c' : '#ea580c',
              fontSize: '0.78rem',
              fontWeight: 650,
              letterSpacing: '0.04em'
            }}
          >
            {isP6 ? <Calendar size={14} /> : isL5X ? <Cpu size={14} /> : <Code size={14} />}
            {isP6 ? 'PRIMAVERA P6 GANTT' : isL5X ? 'ROCKWELL L5X LOGIC' : 'ENGINEERING SCRIPT'}
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.85 }}>{filename}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
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

      {/* ── Main Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* P6 Schedule View */}
        {isP6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '12px'
              }}
            >
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
                }}
              >
                <div style={{ fontSize: '0.74rem', opacity: 0.7 }}>Total Activities</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>{xerData.tasks.length}</div>
              </div>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
                }}
              >
                <div style={{ fontSize: '0.74rem', opacity: 0.7 }}>Critical Path Items</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f43f5e' }}>
                  {xerData.tasks.filter((t) => t.critical).length}
                </div>
              </div>
            </div>

            {/* Task Table */}
            <div
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Code</th>
                    <th style={{ padding: '8px 12px' }}>Activity Name</th>
                    <th style={{ padding: '8px 12px' }}>Start</th>
                    <th style={{ padding: '8px 12px' }}>Finish</th>
                    <th style={{ padding: '8px 12px' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {xerData.tasks.map((task) => (
                    <tr
                      key={task.id}
                      style={{
                        borderTop: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                        background: task.critical ? (isDark ? 'rgba(244,63,94,0.06)' : 'rgba(244,63,94,0.04)') : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{task.code}</td>
                      <td style={{ padding: '8px 12px' }}>{task.name}</td>
                      <td style={{ padding: '8px 12px', opacity: 0.8 }}>{task.startDate}</td>
                      <td style={{ padding: '8px 12px', opacity: 0.8 }}>{task.endDate}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              flex: 1,
                              height: '6px',
                              borderRadius: '3px',
                              background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                              overflow: 'hidden'
                            }}
                          >
                            <div
                              style={{
                                width: `${task.percentComplete}%`,
                                height: '100%',
                                background: task.critical ? '#f43f5e' : '#10b981'
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.72rem', width: '32px' }}>{task.percentComplete}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rockwell L5X Ladder Logic View */}
        {isL5X && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 650, color: '#fb923c' }}>
              Ladder Rungs ({l5xData.rungs.length})
            </div>
            {l5xData.rungs.map((rung) => (
              <div
                key={rung.number}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  display: 'flex',
                  gap: '12px'
                }}
              >
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#fb923c',
                    color: '#000',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    height: 'fit-content'
                  }}
                >
                  Rung {rung.number}
                </span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: isDark ? '#38bdf8' : '#0284c7' }}>
                  {rung.code}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fallback raw code / MATLAB view */}
        {!isP6 && !isL5X && (
          <pre
            style={{
              padding: '16px',
              borderRadius: '8px',
              background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              overflowX: 'auto'
            }}
          >
            {fullContent}
          </pre>
        )}
      </div>
    </div>
  );
}
