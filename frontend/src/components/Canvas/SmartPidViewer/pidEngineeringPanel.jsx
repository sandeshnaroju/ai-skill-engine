import React, { useState, useMemo } from 'react';
import {
  X,
  GitBranch,
  Gauge,
  ShieldAlert,
  ArrowRightLeft,
  Wrench,
  Search,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  parseLineNumberMeta,
  buildInstrumentLoops,
  buildValveSchedule,
  buildConnectorMatrix,
  runPidQaAudit,
} from './pidAnalytics';

export default function PidEngineeringPanel({
  parsed,
  onSelectItem,
  onHighlightSet,
  onClose,
  isDark = true,
}) {
  const [tab, setTab] = useState('lines'); // 'lines' | 'loops' | 'valves' | 'connectors' | 'qa'
  const [query, setQuery] = useState('');

  const lineRows = useMemo(
    () => parsed.lineNumbers.map((l) => ({ raw: l, ...parseLineNumberMeta(l.text) })),
    [parsed.lineNumbers]
  );
  const { instruments, loops } = useMemo(() => buildInstrumentLoops(parsed), [parsed]);
  const valveData = useMemo(() => buildValveSchedule(parsed), [parsed]);
  const connectorRows = useMemo(() => buildConnectorMatrix(parsed), [parsed]);
  const qa = useMemo(() => runPidQaAudit(parsed), [parsed]);

  const panelBg = isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.98)';
  const borderCol = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
  const mutedCol = isDark ? '#94a3b8' : '#64748b';
  const rowBg = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';

  const tabs = [
    { id: 'lines', label: `Line List (${lineRows.length})`, icon: GitBranch },
    { id: 'loops', label: `ISA Loops (${loops.length})`, icon: Gauge },
    { id: 'valves', label: `Valves & Isolation (${valveData.items.length})`, icon: Wrench },
    { id: 'connectors', label: `Connectors (${connectorRows.length})`, icon: ArrowRightLeft },
    { id: 'qa', label: `QA Audit (${qa.issueCount})`, icon: ShieldAlert },
  ];

  const q = query.trim().toLowerCase();

  return (
    <div
      style={{
        position: 'absolute',
        top: '56px',
        right: '12px',
        bottom: '44px',
        width: '440px',
        maxWidth: 'calc(100vw - 24px)',
        background: panelBg,
        backdropFilter: 'blur(16px)',
        border: `1px solid ${borderCol}`,
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 32,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>Engineering Deliverables & QA</div>
          <div style={{ fontSize: '11px', color: mutedCol }}>
            {instruments.length} instruments • {valveData.items.length} valves/isolation • {lineRows.length} lines
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer' }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 8px',
          borderBottom: `1px solid ${borderCol}`,
          overflowX: 'auto',
        }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (onHighlightSet) onHighlightSet(new Set());
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 8px',
                borderRadius: '6px',
                border: 'none',
                whiteSpace: 'nowrap',
                background: active
                  ? isDark
                    ? 'rgba(56, 189, 248, 0.16)'
                    : 'rgba(2, 132, 199, 0.12)'
                  : 'transparent',
                color: active ? (isDark ? '#38bdf8' : '#0284c7') : mutedCol,
                fontSize: '11px',
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      {tab !== 'qa' && (
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${borderCol}` }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '9px', opacity: 0.55 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter items..."
              style={{
                width: '100%',
                padding: '5px 8px 5px 26px',
                fontSize: '12px',
                borderRadius: '6px',
                border: `1px solid ${borderCol}`,
                background: isDark ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                color: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tab === 'lines' &&
          lineRows
            .filter((r) => !q || r.text.toLowerCase().includes(q) || r.service.toLowerCase().includes(q) || r.pipeSpec.toLowerCase().includes(q))
            .map((r) => (
              <button
                key={r.raw.id}
                type="button"
                onClick={() => onSelectItem(r.raw)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${borderCol}`,
                  background: rowBg,
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{r.text}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '11px', color: mutedCol }}>
                  <span>Size: <strong>{r.size}</strong></span>
                  <span>Service: <strong>{r.service}</strong></span>
                  <span>Spec: <strong>{r.pipeSpec}</strong></span>
                  {r.unit !== '-' && <span>Unit: <strong>{r.unit}</strong></span>}
                </div>
              </button>
            ))}

        {tab === 'loops' &&
          loops
            .filter(
              (lp) =>
                !q ||
                lp.loopId.toLowerCase().includes(q) ||
                lp.variable.toLowerCase().includes(q) ||
                lp.items.some((i) => i.tag.toLowerCase().includes(q))
            )
            .map((lp) => (
              <div
                key={lp.loopId}
                style={{
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${borderCol}`,
                  background: rowBg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>
                    Loop {lp.loopId} • {lp.variable} ({lp.items.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onHighlightSet) onHighlightSet(new Set(lp.items.map((i) => i.id)));
                      if (lp.items[0]) onSelectItem(lp.items[0].symbol);
                    }}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '5px',
                      border: `1px solid ${borderCol}`,
                      background: 'rgba(6, 182, 212, 0.14)',
                      color: isDark ? '#22d3ee' : '#0891b2',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Highlight Loop
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {lp.items.map((inst) => (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => {
                        if (onHighlightSet) onHighlightSet(new Set(lp.items.map((i) => i.id)));
                        onSelectItem(inst.symbol);
                      }}
                      style={{
                        padding: '3px 7px',
                        borderRadius: '999px',
                        border: `1px solid ${inst.hasTag ? '#06b6d4' : '#f59e0b'}`,
                        background: inst.hasTag ? 'rgba(6, 182, 212, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: 'inherit',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {inst.tag}
                    </button>
                  ))}
                </div>
              </div>
            ))}

        {tab === 'valves' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '4px' }}>
              {Object.entries(valveData.counts).map(([subtype, cnt]) => (
                <span
                  key={subtype}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    border: `1px solid ${borderCol}`,
                    background: rowBg,
                  }}
                >
                  {subtype}: <strong>{cnt}</strong>
                </span>
              ))}
            </div>
            {valveData.items
              .filter((v) => !q || v.subtype.toLowerCase().includes(q) || v.tag.toLowerCase().includes(q) || v.id.toLowerCase().includes(q))
              .map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectItem(v.symbol)}
                  style={{
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${borderCol}`,
                    background: rowBg,
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{v.tag}</div>
                    <div style={{ fontSize: '10.5px', color: mutedCol }}>{v.subtype} • {v.id}</div>
                  </div>
                  <span style={{ fontSize: '10.5px', color: v.hasTag ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                    {v.hasTag ? 'Tagged' : 'Untagged'}
                  </span>
                </button>
              ))}
          </>
        )}

        {tab === 'connectors' &&
          connectorRows
            .filter((c) => !q || c.text.toLowerCase().includes(q) || c.symbolId.toLowerCase().includes(q))
            .map((c) => (
              <button
                key={`${c.id}-${c.symbolId}`}
                type="button"
                onClick={() => onSelectItem(c.targetItem)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: `1px solid ${borderCol}`,
                  background: rowBg,
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700 }}>{c.text}</div>
                <div style={{ fontSize: '11px', color: mutedCol, marginTop: '2px' }}>
                  {c.symbolName} • Symbol: {c.symbolId}
                </div>
              </button>
            ))}

        {tab === 'qa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${borderCol}`,
                background: rowBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {qa.issueCount === 0 ? <CheckCircle2 size={18} color="#10b981" /> : <AlertTriangle size={18} color="#f59e0b" />}
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700 }}>P&ID Completeness Score: {qa.score}%</div>
                  <div style={{ fontSize: '11px', color: mutedCol }}>
                    {qa.untaggedSymbols.length} untagged • {qa.orphanTags.length} orphan tags • {qa.duplicateTags.length} duplicates
                  </div>
                </div>
              </div>
            </div>

            {qa.duplicateTags.length > 0 && (
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: '#ef4444' }}>
                  Duplicate Tags ({qa.duplicateTags.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {qa.duplicateTags.map((d) => (
                    <button
                      key={d.tag}
                      type="button"
                      onClick={() => {
                        if (onHighlightSet) onHighlightSet(new Set(d.items.map((i) => i.id)));
                        if (d.items[0]) onSelectItem(d.items[0]);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        border: '1px solid #ef4444',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: 'inherit',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {d.tag} (×{d.count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {qa.orphanTags.length > 0 && (
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: '#ec4899' }}>
                  Orphan Tags — Missing Symbol Link ({qa.orphanTags.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {qa.orphanTags.slice(0, 60).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onSelectItem(t)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        border: '1px solid #ec4899',
                        background: 'rgba(236, 72, 153, 0.12)',
                        color: 'inherit',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {t.text || t.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {qa.untaggedSymbols.length > 0 && (
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '4px', color: '#f59e0b' }}>
                  Untagged Valves & Instruments ({qa.untaggedSymbols.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {qa.untaggedSymbols.slice(0, 80).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectItem(s)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        border: '1px solid #f59e0b',
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: 'inherit',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {s.name} ({s.id})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
