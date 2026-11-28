import React, { useState, useMemo } from 'react';
import { Download, X } from 'lucide-react';
import ModernSelect from '../XerViewer/ModernSelect';
import {
  exportLandXmlSurfacesCsv,
  exportLandXmlAlignmentsCsv,
  exportLandXmlPipesCsv,
  exportLandXmlPointsCsv,
} from './landxmlParser';

export default function LandXmlSchedulePanel({
  model,
  cutFill,
  baseSurfIdx,
  compSurfIdx,
  onChangeBaseSurf,
  onChangeCompSurf,
  onClose,
  isDark,
  baseName = 'landxml',
}) {
  const [activeTab, setActiveTab] = useState('surfaces');

  const colors = {
    bg: isDark ? '#111827' : '#ffffff',
    surfaceAlt: isDark ? '#161f30' : '#f1f5f9',
    border: isDark ? '#1f2937' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    accent: '#3b82f6',
    accentSoft: isDark ? 'rgba(59, 130, 246, 0.16)' : '#eff6ff',
  };

  const totalPipes = useMemo(
    () => model.pipeNetworks.reduce((acc, n) => acc + n.pipes.length, 0),
    [model.pipeNetworks]
  );

  const tabs = [
    { key: 'surfaces', label: `Surfaces & Cut/Fill (${model.surfaces.length})` },
    { key: 'alignments', label: `Alignments (${model.alignments.length})` },
    { key: 'pipes', label: `Pipe Networks (${totalPipes})` },
    { key: 'parcels', label: `Parcels & Points (${model.parcels.length + model.cgPoints.length})` },
  ];

  const surfOptions = model.surfaces.map((s, idx) => ({ value: String(idx), label: s.name }));

  const handleExport = () => {
    if (activeTab === 'surfaces') exportLandXmlSurfacesCsv(model.surfaces, cutFill, `${baseName}_surfaces.csv`);
    else if (activeTab === 'alignments') exportLandXmlAlignmentsCsv(model.alignments, `${baseName}_alignments.csv`);
    else if (activeTab === 'pipes') exportLandXmlPipesCsv(model.pipeNetworks, `${baseName}_pipes.csv`);
    else exportLandXmlPointsCsv(model.cgPoints, `${baseName}_points.csv`);
  };

  return (
    <div style={{ height: 240, minHeight: 185, borderTop: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${activeTab === t.key ? colors.accent : colors.border}`,
                background: activeTab === t.key ? colors.accentSoft : colors.surfaceAlt,
                color: activeTab === t.key ? colors.accent : colors.text,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={handleExport} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.text, cursor: 'pointer' }}>
            <Download size={12} /> CSV
          </button>
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surfaceAlt, color: colors.textMuted, cursor: 'pointer' }}>
            <X size={13} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: activeTab === 'surfaces' && model.surfaces.length >= 2 ? 10 : 0 }}>
        {activeTab === 'surfaces' && model.surfaces.length >= 2 && cutFill && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', marginBottom: 10, borderRadius: 8, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, fontSize: 11.5 }}>
            <span style={{ fontWeight: 700 }}>Cut / Fill Comparison:</span>
            <span>Base:</span>
            <ModernSelect value={String(baseSurfIdx)} onChange={(v) => onChangeBaseSurf(Number(v))} options={surfOptions} isDark={isDark} />
            <span>vs. Design:</span>
            <ModernSelect value={String(compSurfIdx)} onChange={(v) => onChangeCompSurf(Number(v))} options={surfOptions} isDark={isDark} />
            <span style={{ color: '#ef4444', fontWeight: 700 }}>Cut: {cutFill.cutVolume.toFixed(1)} {model.meta.volumeUnit}</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>Fill: {cutFill.fillVolume.toFixed(1)} {model.meta.volumeUnit}</span>
            <span style={{ color: colors.accent, fontWeight: 700 }}>Net: {cutFill.netVolume.toFixed(1)} {model.meta.volumeUnit}</span>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead style={{ position: 'sticky', top: 0, background: colors.surfaceAlt, zIndex: 1 }}>
            <tr>
              {activeTab === 'surfaces' &&
                ['Surface', 'Points', 'Triangles', 'Min Elev', 'Max Elev', 'Mean Elev', '2D Area', '3D Area'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>{h}</th>
                ))}
              {activeTab === 'alignments' &&
                ['Alignment', 'Start Station', 'Length', 'Horiz Segments', 'Profile PVIs'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>{h}</th>
                ))}
              {activeTab === 'pipes' &&
                ['Network', 'Pipe', 'Start Struct', 'End Struct', 'Diameter', 'Length', 'Slope %', 'Material'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>{h}</th>
                ))}
              {activeTab === 'parcels' &&
                ['Type', 'Name', 'Easting / Area', 'Northing / Vertices', 'Elevation / Desc'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>{h}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {activeTab === 'surfaces' && model.surfaces.map((s) => (
              <tr key={s.name} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: '6px 10px' }}>{s.pointCount}</td>
                <td style={{ padding: '6px 10px' }}>{s.faceCount}</td>
                <td style={{ padding: '6px 10px' }}>{s.minZ.toFixed(2)}</td>
                <td style={{ padding: '6px 10px' }}>{s.maxZ.toFixed(2)}</td>
                <td style={{ padding: '6px 10px' }}>{s.meanZ.toFixed(2)}</td>
                <td style={{ padding: '6px 10px' }}>{s.area2D.toFixed(1)}</td>
                <td style={{ padding: '6px 10px' }}>{s.area3D.toFixed(1)}</td>
              </tr>
            ))}

            {activeTab === 'alignments' && model.alignments.map((a) => (
              <React.Fragment key={a.name}>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: '6px 10px' }}>{a.staStart}</td>
                  <td style={{ padding: '6px 10px' }}>{a.length.toFixed(2)}</td>
                  <td style={{ padding: '6px 10px' }}>{a.segments.length}</td>
                  <td style={{ padding: '6px 10px' }}>{a.pvis.length}</td>
                </tr>
                {(a.pvis.length > 0 || (a.profSurf && a.profSurf.length > 0)) && (() => {
                  const allPts = [...(a.profSurf || []), ...a.pvis];
                  const minS = Math.min(...allPts.map((p) => p.station));
                  const maxS = Math.max(...allPts.map((p) => p.station));
                  const minE = Math.min(...allPts.map((p) => p.elev));
                  const maxE = Math.max(...allPts.map((p) => p.elev));
                  const spanS = Math.max(1, maxS - minS);
                  const spanE = Math.max(1, maxE - minE);
                  const mapX = (s) => 40 + ((s - minS) / spanS) * 520;
                  const mapY = (e) => 95 - ((e - minE) / spanE) * 75;
                  return (
                    <tr>
                      <td colSpan={5} style={{ padding: '8px 12px', background: colors.surfaceAlt, borderBottom: `1px solid ${colors.border}` }}>
                        <div style={{ fontSize: 10.5, color: colors.textMuted, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Vertical Profile: {a.name} (Station {minS.toFixed(0)} → {maxS.toFixed(0)})</span>
                          <span>Elev {minE.toFixed(1)} .. {maxE.toFixed(1)} {model.meta.linearUnit}</span>
                        </div>
                        <svg viewBox="0 0 580 110" style={{ width: '100%', height: 105, display: 'block', background: isDark ? '#0b0f17' : '#ffffff', borderRadius: 6, border: `1px solid ${colors.border}` }}>
                          {a.profSurf && a.profSurf.length >= 2 && (
                            <polyline
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                              points={a.profSurf.map((p) => `${mapX(p.station)},${mapY(p.elev)}`).join(' ')}
                            />
                          )}
                          {a.pvis.length >= 2 && (
                            <polyline
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="2"
                              points={a.pvis.map((p) => `${mapX(p.station)},${mapY(p.elev)}`).join(' ')}
                            />
                          )}
                          {a.pvis.map((p, idx) => (
                            <circle key={idx} cx={mapX(p.station)} cy={mapY(p.elev)} r="3" fill="#facc15" />
                          ))}
                        </svg>
                      </td>
                    </tr>
                  );
                })()}
              </React.Fragment>
            ))}

            {activeTab === 'pipes' && model.pipeNetworks.flatMap((net) =>
              net.pipes.map((p) => (
                <tr key={`${net.name}-${p.name}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '6px 10px', color: colors.textMuted }}>{net.name}</td>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '6px 10px' }}>{p.refStart}</td>
                  <td style={{ padding: '6px 10px' }}>{p.refEnd}</td>
                  <td style={{ padding: '6px 10px' }}>{p.diameter}</td>
                  <td style={{ padding: '6px 10px' }}>{p.length.toFixed(2)}</td>
                  <td style={{ padding: '6px 10px' }}>{p.slope.toFixed(2)}%</td>
                  <td style={{ padding: '6px 10px' }}>{p.material || '—'}</td>
                </tr>
              ))
            )}

            {activeTab === 'parcels' && (
              <>
                {model.parcels.map((p) => (
                  <tr key={`parcel-${p.name}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '6px 10px', color: colors.accent, fontWeight: 600 }}>Parcel</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '6px 10px' }}>Area: {p.area.toFixed(2)}</td>
                    <td style={{ padding: '6px 10px' }}>{p.points.length} vertices</td>
                    <td style={{ padding: '6px 10px' }}>—</td>
                  </tr>
                ))}
                {model.cgPoints.map((pt) => (
                  <tr key={`pt-${pt.name}`} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '6px 10px', color: '#10b981', fontWeight: 600 }}>CgPoint</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{pt.name}</td>
                    <td style={{ padding: '6px 10px' }}>{pt.e.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px' }}>{pt.n.toFixed(3)}</td>
                    <td style={{ padding: '6px 10px' }}>{pt.z.toFixed(3)}{pt.desc ? ` · ${pt.desc}` : ''}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
