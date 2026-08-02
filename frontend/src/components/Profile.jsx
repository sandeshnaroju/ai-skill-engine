import React, { useState, useEffect } from 'react';
import { User, Mail, Calendar, Shield, Cpu, Key, Copy, Check } from 'lucide-react';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [meRes, tenantsRes] = await Promise.all([
          fetch('/api/v1/auth/me'),
          fetch('/api/v1/tenants')
        ]);
        if (meRes.ok) {
          const meData = await meRes.ok ? await meRes.json() : null;
          setProfile(meData);
        }
        if (tenantsRes.ok) {
          const tenantsData = await tenantsRes.json();
          // Find the active default tenant
          const activeTenant = (tenantsData.items || tenantsData || []).find(t => t.is_active) || (tenantsData.items || tenantsData || [])[0];
          setTenant(activeTenant);
        }
      } catch (err) {
        console.error('Failed to load profile details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfileData();
  }, []);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div className="spin" style={{
          width: '32px',
          height: '32px',
          border: '3px solid rgba(139, 92, 246, 0.1)',
          borderTop: '3px solid var(--primary-violet)',
          borderRadius: '50%'
        }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="glass-box" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-sub)' }}>
        Could not load profile information.
      </div>
    );
  }

  const formattedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unknown';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', width: '100%', margin: '0 auto' }}>
      {/* Profile Card */}
      <div className="glass-box" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative ambient background blur */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          filter: 'blur(20px)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))',
            padding: '16px',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <User size={36} color="#ffffff" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
              User Profile
            </h3>
            <span style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary-emerald)', padding: '3px 8px', borderRadius: '20px', fontWeight: '700' }}>
              Active Session
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Mail size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>Email Address</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '500' }}>{profile.email}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>Account ID</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-sub)', fontFamily: 'monospace' }}>{profile.id}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>Member Since</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '500' }}>{formattedDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Default Workspace Card */}
      {tenant && (
        <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
              Default API Workspace
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Use this key to authorize external chat agents or integrations.
            </p>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
                {tenant.name}
              </span>
              <button
                className="btn-outline"
                onClick={() => handleCopy(tenant.api_key)}
                style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {copied ? <Check size={12} color="var(--primary-emerald)" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy Key'}
              </button>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-sub)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {tenant.api_key}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
