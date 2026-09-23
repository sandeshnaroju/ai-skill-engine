import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun, Moon, LayoutDashboard, LogIn, ExternalLink
} from 'lucide-react';
import DocumentationBrowser from './DocumentationBrowser';

export default function ApiDocs({ isStandalone = false, theme: propTheme, toggleTheme: propToggleTheme, isAuthenticated }) {
  const navigate = useNavigate();
  const [internalTheme, setInternalTheme] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('app_theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  const currentTheme = propTheme || internalTheme;

  const handleToggleTheme = () => {
    if (propToggleTheme) {
      propToggleTheme();
    } else {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setInternalTheme(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('app_theme', nextTheme);
      window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme: nextTheme } }));
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <DocumentationBrowser />
    </div>
  );

  if (!isStandalone) {
    return content;
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'var(--bg-dark, #0a0f1d)',
      color: 'var(--text-main, #f8fafc)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Standalone Public Header Navbar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        background: currentTheme === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(10, 15, 29, 0.85)',
        borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => navigate(isAuthenticated ? '/playground' : '/')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/logo_navbar.svg"
              alt="AI Skill Engine"
              style={{
                height: '50px',
                width: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 2px 12px rgba(0, 242, 254, 0.3))'
              }}
            />
            <span style={{
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--primary-cyan, #06b6d4)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Docs
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleToggleTheme}
            className="btn-outline"
            style={{
              padding: '8px 12px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            title={currentTheme === 'dark' ? 'Switch to Day (Light) Mode' : 'Switch to Night (Dark) Mode'}
          >
            {currentTheme === 'dark' ? (
              <>
                <Sun size={15} color="var(--accent-amber, #f59e0b)" />
                <span>Day Mode</span>
              </>
            ) : (
              <>
                <Moon size={15} color="var(--primary-violet, #8b5cf6)" />
                <span>Night Mode</span>
              </>
            )}
          </button>

          <button
            onClick={() => navigate(isAuthenticated ? '/playground' : '/')}
            className="btn-gradient"
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              fontSize: '0.85rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          >
            {isAuthenticated ? (
              <>
                <LayoutDashboard size={16} />
                <span>Go to Dashboard</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign In / Console</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Public Docs Body */}
      <main style={{ flex: 1, padding: '28px 24px 60px', width: '100%', boxSizing: 'border-box' }}>
        {content}
      </main>
    </div>
  );
}
