import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Cpu, Check, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import TenantModal from './TenantModal';
import DeleteTenantModal from './DeleteTenantModal';
import { tenantsApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function TenantManager() {
  const { showSuccess, confirmAction } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState([]);
  const [newTenantName, setNewTenantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState(null);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '6', 10);

  const setPage = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', typeof val === 'function' ? val(page).toString() : val.toString());
    setSearchParams(nextParams);
  };

  const setPageSize = (val) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page_size', val.toString());
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [tenantLlms, setTenantLlms] = useState([]);
  
  const [modelPage, setModelPage] = useState(1);
  const [modelPageSize, setModelPageSize] = useState(10);
  const [modelTotalPages, setModelTotalPages] = useState(1);
  const [modelTotalItems, setModelTotalItems] = useState(0);

  useEffect(() => {
    fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    if (selectedTenant) {
      fetchTenantLlms(selectedTenant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenant, modelPage, modelPageSize]);

  const fetchTenants = async () => {
    try {
      const data = await tenantsApi.list({ page, page_size: pageSize });
      setTenants(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      console.error('Fetch tenants error:', err);
    }
  };

  const fetchTenantLlms = async (tenant) => {
    try {
      const data = await tenantsApi.listLlms(tenant.api_key, { page: modelPage, page_size: modelPageSize });
      setTenantLlms(data.items || []);
      setModelTotalPages(data.pages || 1);
      setModelTotalItems(data.total || 0);
    } catch (err) {
      console.error('Fetch LLMs error:', err);
    }
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setLoading(true);
    try {
      await tenantsApi.create(newTenantName);
      showSuccess(`Tenant workspace "${newTenantName}" created successfully`);
      setNewTenantName('');
      setPage(1);
      fetchTenants();
    } catch (err) {
      console.error('Create tenant error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = (id, name) => {
    confirmAction({
      title: 'Delete Tenant Workspace',
      message: `Are you sure you want to delete tenant "${name}"? This deletes all their model configs.`,
      confirmText: 'Delete Tenant',
      onConfirm: async () => {
        try {
          await tenantsApi.delete(id, name);
          fetchTenants();
          showSuccess(`Tenant "${name}" deleted successfully`);
        } catch (err) {
          console.error('Delete tenant error:', err);
        }
      }
    });
  };

  const copyToClipboard = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-box" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Key size={22} color="var(--primary-cyan)" /> Register Enterprise Tenant
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginBottom: '20px' }}>
          Businesses connect their chatbots to `AI Skill Engine` using dedicated tenant API keys for isolated skill execution and audit logging.
        </p>

        <form onSubmit={handleCreateTenant} style={{ display: 'flex', gap: '12px', maxWidth: '640px' }}>
          <input
            type="text"
            placeholder="Business / Tenant Name (e.g. Acme Corp Support Bot)"
            value={newTenantName}
            onChange={(e) => setNewTenantName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-gradient" disabled={loading}>
            <Plus size={18} /> {loading ? 'Generating...' : 'Generate API Key'}
          </button>
        </form>
      </div>

      <div className="glass-box" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '18px', color: 'var(--text-main)' }}>
          Registered Tenants ({totalItems})
        </h3>

        {tenants.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '32px' }}>
            No tenants registered yet. Register a new tenant above to get started!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
              {tenants.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    borderRadius: '12px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.94rem' }}>{t.name}</span>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Models Configured: <strong style={{ color: 'var(--primary-cyan)' }}>{t.models_count || 0}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        className="btn-gradient"
                        onClick={() => {
                          setSelectedTenant(t);
                          setModelPage(1);
                          setShowManageModal(true);
                        }}
                        style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                        title="Manage Models & Integration"
                      >
                        <Cpu size={12} /> Manage
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => setTenantToDelete(t)}
                        style={{ padding: '4px 8px', fontSize: '0.74rem', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.2)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '8px' }}>
                    <code style={{ fontSize: '0.8rem', color: 'var(--primary-cyan)', flex: 1, wordBreak: 'break-all' }}>
                      {'•'.repeat(Math.max(0, (t.api_key || '').length - 4))}{(t.api_key || '').slice(-4)}
                    </code>
                    <button
                      className="btn-outline"
                      onClick={() => copyToClipboard(t.api_key)}
                      style={{ padding: '6px' }}
                      title="Copy Key"
                    >
                      {copiedKey === t.api_key ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages} ({totalItems} tenants total)
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

      {showManageModal && selectedTenant && (
        <TenantModal 
          selectedTenant={selectedTenant}
          setShowManageModal={setShowManageModal}
          setSelectedTenant={setSelectedTenant}
          tenantLlms={tenantLlms}
          modelTotalItems={modelTotalItems}
          modelTotalPages={modelTotalPages}
          modelPage={modelPage}
          setModelPage={setModelPage}
          fetchTenantLlms={fetchTenantLlms}
          fetchTenants={fetchTenants}
        />
      )}

      {tenantToDelete && (
        <DeleteTenantModal
          tenant={tenantToDelete}
          onClose={() => setTenantToDelete(null)}
          onDeleteSuccess={fetchTenants}
        />
      )}
    </div>
  );
}
