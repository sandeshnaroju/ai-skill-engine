import React, { useState, useEffect } from 'react';
import { Cpu, Plus, RefreshCw, Trash2, Check, Terminal, Globe, Layers, ShieldCheck, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

export default function McpServerManager() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [name, setName] = useState('');
  const [transport, setTransport] = useState('stdio');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      });
      const res = await fetch(`/api/v1/mcp_servers?${queryParams.toString()}`);
      const data = await res.json();
      
      if (data && data.items !== undefined) {
        setServers(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalItems(data.total || 0);
      } else {
        setServers(data || []);
        setTotalPages(1);
        setTotalItems(data ? data.length : 0);
      }
    } catch (e) {
      console.error('Failed to fetch MCP servers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [page, pageSize]);

  const handleAddServer = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/v1/mcp_servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          transport,
          command: command.trim() || null,
          url: url.trim() || null,
          env: env.trim() || null,
        }),
      });

      if (res.ok) {
        setName('');
        setCommand('');
        setUrl('');
        setEnv('');
        setPage(1);
        fetchServers();
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || 'Failed to create MCP server'}`);
      }
    } catch (err) {
      console.error('Add MCP server error:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteServer = async (id, srvName) => {
    if (!window.confirm(`Are you sure you want to delete MCP server "${srvName}"?`)) return;
    try {
      const res = await fetch(`/api/v1/mcp_servers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchServers();
      }
    } catch (err) {
      console.error('Delete MCP server error:', err);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
      {/* Left Column: Configured Servers list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="glass-box" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={20} color="var(--primary-cyan)" /> Configured MCP Servers ({totalItems})
            </h3>
            <button className="btn-outline" onClick={fetchServers} disabled={loading} style={{ padding: '6px 12px' }}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Reload
            </button>
          </div>

          {servers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No Model Context Protocol (MCP) servers configured yet. Register a new server using the form.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {servers.map((s) => (
                <div key={s.id} style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{s.name}</strong>
                      <span className={`badge-tag tag-${s.transport === 'stdio' ? 'docker' : 'shell'}`} style={{ fontSize: '0.72rem' }}>
                        {s.transport}
                      </span>
                    </div>

                    <button
                      className="btn-outline"
                      onClick={() => handleDeleteServer(s.id, s.name)}
                      style={{ padding: '4px 8px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ fontSize: '0.84rem', color: 'var(--text-sub)' }}>
                    {s.transport === 'stdio' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div><strong>Command:</strong> <code style={{ color: 'var(--primary-cyan)' }}>{s.command}</code></div>
                        {s.env && <div><strong>Env variables:</strong> <code style={{ color: 'var(--text-muted)' }}>{s.env}</code></div>}
                      </div>
                    ) : (
                      <div><strong>SSE Endpoint URL:</strong> <code style={{ color: 'var(--primary-cyan)' }}>{s.url}</code></div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                      <Check size={14} /> Discovered: {s.discovered_tools_count || 0} tool(s)
                    </span>

                    {s.tools && s.tools.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end', maxWidth: '240px' }}>
                        {s.tools.slice(0, 4).map((tool) => (
                          <span key={tool.name} className="badge-tag tag-shell" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            {tool.name}
                          </span>
                        ))}
                        {s.tools.length > 4 && (
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '500' }}>+{s.tools.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Pagination Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Page {page} of {totalPages} ({totalItems} servers total)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="btn-outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Server Registration Form */}
      <div className="glass-box" style={{ padding: '24px', height: 'fit-content' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={20} color="var(--primary-cyan)" /> Connect MCP Host
        </h3>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', marginBottom: '20px' }}>
          Add standardized external model context protocol resources to automatically register dynamic tools.
        </p>

        <form onSubmit={handleAddServer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Server Name</label>
            <input
              type="text"
              placeholder="e.g. github_mcp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Transport Protocol</label>
            <select value={transport} onChange={(e) => setTransport(e.target.value)}>
              <option value="stdio">Local command (stdio)</option>
              <option value="sse">HTTP Server-Sent Events (SSE)</option>
            </select>
          </div>

          {transport === 'stdio' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Local Command</label>
                <input
                  type="text"
                  placeholder="e.g. npx -y @modelcontextprotocol/server-github"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>Environment JSON (Optional)</label>
                <input
                  type="text"
                  placeholder='e.g. {"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."}'
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontWeight: '600' }}>SSE endpoint URL</label>
              <input
                type="url"
                placeholder="e.g. http://localhost:3001/sse"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn-gradient" style={{ padding: '10px', marginTop: '8px' }} disabled={adding}>
            <Plus size={16} /> {adding ? 'Connecting...' : 'Connect Server'}
          </button>
        </form>
      </div>
    </div>
  );
}
