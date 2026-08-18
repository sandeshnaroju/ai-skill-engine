import React, { useState, useEffect } from 'react';
import { User, Mail, Calendar, Shield, Cpu, Key, Copy, Check, Lock, AlertTriangle } from 'lucide-react';
import { authApi, tenantsApi, apiClient } from '../api';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Password change states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const [meData, tenantsData] = await Promise.all([
          authApi.getProfile(),
          tenantsApi.list()
        ]);
        setProfile(meData);
        const tenantsList = Array.isArray(tenantsData) ? tenantsData : (tenantsData.items || []);
        const activeTenant = tenantsList.find(t => t.is_active) || tenantsList[0];
        setTenant(activeTenant);
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

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setPasswordLoading(true);
    try {
      await apiClient.post('/api/v1/auth/change-password', { old_password: oldPassword, new_password: newPassword });
      setSuccess('Password changed successfully! Logging out...');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPasswordLoading(false);
    }
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

      {/* Change Password Card */}
      <div className="glass-box" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
            Change Password
          </h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            Ensure your account stays secure by updating your password regularly.
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: '#fca5a5'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            color: '#a7f3d0'
          }}>
            <Check size={16} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)' }}>Current Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                required
                placeholder="Current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)' }}>New Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                required
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)' }}>Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                required
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px',
              boxShadow: 'var(--shadow-glow)'
            }}
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
