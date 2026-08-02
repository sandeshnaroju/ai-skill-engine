import React, { useState, useEffect } from 'react';
import { Box, Plus, RefreshCw, Trash2, Check, Layers, Cpu, ShieldCheck, Zap, X, Edit, FolderPlus, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AppManager() {
  const [apps, setApps] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [appName, setAppName] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [saving, setSaving] = useState(false);

  const fetchApps = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      });
      const [appsRes, skillsRes] = await Promise.all([
        fetch(`/api/v1/apps?${queryParams.toString()}`),
        fetch('/api/v1/skills'),
      ]);
      const appsData = await appsRes.json();
      const skillsData = await skillsRes.json();
      
      if (appsData && appsData.items !== undefined) {
        setApps(appsData.items || []);
        setTotalPages(appsData.pages || 1);
        setTotalItems(appsData.total || 0);
      } else {
        setApps(appsData || []);
        setTotalPages(1);
        setTotalItems(appsData ? appsData.length : 0);
      }

      setSkills(skillsData.skills || []);
    } catch (e) {
      console.error('Failed to fetch apps data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, [page, pageSize]);

  const handleOpenCreateModal = () => {
    setAppName('');
    setAppDescription('');
    setSelectedSkills([]);
    setIsEditing(false);
    setShowModal(true);
  };

  const handleOpenEditModal = (app) => {
    setAppName(app.name);
    setAppDescription(app.description || '');
    setSelectedSkills(app.skill_names || []);
    setIsEditing(true);
    setShowModal(true);
  };

  const toggleSkillSelection = (skillName) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName]
    );
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    if (!appName.trim()) return;
    setSaving(true);

    try {
      const res = await fetch('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: appName,
          description: appDescription,
          skill_names: selectedSkills,
          icon: 'box'
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setPage(1);
        fetchApps();
      } else {
        const data = await res.json();
        alert(`Error: ${data.detail || 'Failed to create App'}`);
      }
    } catch (err) {
      console.error('Create app error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApp = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete app "${name}"? This deletes the app container configuration.`)) return;
    try {
      const res = await fetch(`/api/v1/apps/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchApps();
      }
    } catch (err) {
      console.error('Delete app error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Bar */}
      <div className="glass-box" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Box size={22} color="var(--primary-cyan)" /> Apps & Groups Manager
          </h2>
          <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginTop: '4px' }}>
            Group active business skills together into separate App containers. Limit customer LLM tools access control using App scopes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-outline" onClick={fetchApps} disabled={loading} style={{ padding: '8px 12px' }}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn-gradient" onClick={handleOpenCreateModal} style={{ padding: '8px 16px' }}>
            <FolderPlus size={16} /> Create App
          </button>
        </div>
      </div>

      {/* Apps Cards Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {apps.length === 0 ? (
          <div className="glass-box" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No App containers created yet. Create a new App above to group skills.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {apps.map((app) => (
              <div key={app.id} className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', padding: '8px', borderRadius: '10px' }}>
                        <Box size={20} color="var(--primary-cyan)" />
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>{app.name}</h3>
                    </div>

                    <span className="badge-tag tag-docker">
                      {app.skills_count} Skill(s) / {app.tools_count} Tool(s)
                    </span>
                  </div>

                  <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: '1.5' }}>
                    {app.description || 'No description provided.'}
                  </p>

                  {/* Skill Tags List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Grouped Skills:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {app.skill_names && app.skill_names.length > 0 ? (
                        app.skill_names.map((sk) => (
                          <span key={sk} className="badge-tag tag-shell" style={{ fontSize: '0.76rem' }}>
                            <Layers size={11} /> {sk}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No skills assigned yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <code style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>App ID: {app.id.substring(0, 8)}...</code>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-outline"
                      onClick={() => handleOpenEditModal(app)}
                      style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    >
                      <Edit size={13} /> Edit App
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => handleDeleteApp(app.id, app.name)}
                      style={{ padding: '4px 10px', fontSize: '0.78rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {apps.length > 0 && (
          <div className="glass-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Showing page <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{page}</span> of <span style={{ color: 'var(--text-sub)', fontWeight: '600' }}>{totalPages}</span> ({totalItems} apps total)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <button className="btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: '640px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>
                {isEditing ? 'Edit App Group Container' : 'Create App Group Container'}
              </h3>
              <button className="btn-outline" onClick={() => setShowModal(false)} style={{ padding: '4px', borderRadius: '8px' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateApp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: '600' }}>App Name</label>
                <input
                  type="text"
                  placeholder="e.g. customer_support_prod"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  disabled={isEditing}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: '600' }}>Description</label>
                <textarea
                  placeholder="Explain the purpose of this App container (e.g. contains skills for handling queries)"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  style={{ height: '70px', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontWeight: '600' }}>Select Active Skills to Group</label>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', maxHeight: '180px', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-input)' }}>
                  {skills.length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No active skills configured. Create custom skills first.</span>
                  ) : (
                    skills.map((sk) => {
                      const isSelected = selectedSkills.includes(sk.name);
                      return (
                        <div
                          key={sk.name}
                          onClick={() => toggleSkillSelection(sk.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            background: isSelected ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            borderRadius: '8px',
                            border: isSelected ? '1px solid var(--primary-cyan)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ width: '16px', height: '16px', border: '2px solid var(--border-subtle)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--primary-cyan)' : 'transparent' }}>
                            {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-main)' }}>{sk.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sk.description}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="submit" className="btn-gradient" disabled={saving || !appName.trim()} style={{ padding: '8px 20px' }}>
                  {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create App Container')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
