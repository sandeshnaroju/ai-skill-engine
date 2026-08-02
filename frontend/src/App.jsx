import React, { useState, useEffect } from 'react';
import { Key, Layers, MessageSquare, Database, Server, ShieldCheck, Cpu, BookOpen, Sun, Moon, Activity, Box, PanelLeftClose, PanelLeftOpen, Menu, Zap, Terminal, FileText, DollarSign, LogOut, User as UserIcon } from 'lucide-react';
import TenantManager from './components/TenantManager';
import SkillCatalog from './components/SkillCatalog';
import ChatPlayground from './components/ChatPlayground';
import AuditLogs from './components/AuditLogs';
import ApiDocs from './components/ApiDocs';
import McpServerManager from './components/McpServerManager';
import AppManager from './components/AppManager';
import ApiTester from './components/ApiTester';
import ApiLogs from './components/ApiLogs';
import RequestLogs from './components/RequestLogs';
import UsageSummary from './components/UsageSummary';
import AuthPages from './components/AuthPages';
import Profile from './components/Profile';

export default function App() {
  const navItems = [
    { id: 'playground', label: 'Chat Playground', icon: MessageSquare },
    { id: 'apps', label: 'Apps & Groups', icon: Box },
    { id: 'skills', label: 'Skills Catalog', icon: Layers },
    { id: 'mcp', label: 'MCP Servers', icon: Cpu },
    { id: 'tenants', label: 'Tenants & Keys', icon: Key },
    { id: 'usage', label: 'LLM Cost & Usage', icon: DollarSign },
    { id: 'logs', label: 'Sandbox Audit Logs', icon: Database },
    { id: 'apilogs', label: 'API Execution Logs', icon: Activity },
    { id: 'requestlogs', label: 'Request Logs', icon: FileText },
    { id: 'tester', label: 'API Tester', icon: Terminal },
    { id: 'docs', label: 'API Documentation', icon: BookOpen },
  ];

  const getTabFromPath = () => {
    const raw = window.location.pathname.replace(/^\//, '').trim();
    if (raw === 'profile') return 'profile';
    const valid = navItems.find((n) => n.id === raw);
    return valid ? valid.id : 'playground';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromPath());
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'dark');
  const [stats, setStats] = useState({ skillsCount: 4, tenantsCount: 1, logsCount: 0 });
  const [dbStatus, setDbStatus] = useState({ ready: false, details: 'Connecting to database...', progress: 0, fresh_start: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return false;
    }
    const saved = localStorage.getItem('is_sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(true);
        setUserEmail(data.email);
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    if (dbStatus.ready) {
      checkAuth();
    }
  }, [dbStatus.ready]);

  // Check database status on mount and poll until ready
  useEffect(() => {
    let intervalId;
    const checkDbStatus = async () => {
      try {
        const res = await fetch('/api/v1/system/db-status');
        const data = await res.json();
        setDbStatus(data);
        if (data.ready) {
          clearInterval(intervalId);
        }
      } catch (e) {
        console.error('Failed to query database status:', e);
      }
    };

    checkDbStatus();
    intervalId = setInterval(checkDbStatus, 600);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    };
    
    // Initial check on mount
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname.replace(/^\//, '').trim();
      const valid = navItems.find((n) => n.id === currentPath);
      if (valid) {
        setActiveTab(valid.id);
      } else {
        setActiveTab('playground');
      }
    };

    const initialTab = getTabFromPath();
    if (window.location.pathname !== `/${initialTab}`) {
      window.history.replaceState(null, '', `/${initialTab}`);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (window.location.pathname !== `/${tabId}`) {
      window.history.pushState(null, '', `/${tabId}`);
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('is_sidebar_open', JSON.stringify(next));
      return next;
    });
  };

  const loadStats = async () => {
    if (!dbStatus.ready) return;
    try {
      const [skillsRes, tenantsRes, logsRes] = await Promise.all([
        fetch('/api/v1/skills'),
        fetch('/api/v1/tenants'),
        fetch('/api/v1/logs?limit=100'),
      ]);
      const skillsData = await skillsRes.json();
      const tenantsData = await tenantsRes.json();
      const logsData = await logsRes.json();

      setStats({
        skillsCount: (skillsData.skills || []).length,
        tenantsCount: (tenantsData || []).length,
        logsCount: (logsData || []).length,
      });
    } catch (e) {
      console.error('Failed to load dashboard stats:', e);
    }
  };

  useEffect(() => {
    loadStats();
  }, [activeTab, dbStatus.ready]);

  const activeNavItem = activeTab === 'profile'
    ? { id: 'profile', label: 'User Profile', icon: UserIcon }
    : (navItems.find((n) => n.id === activeTab) || navItems[0]);

  // Render database creation loader screen if DB is not ready
  if (!dbStatus.ready) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: '#0a0f1d',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Animated Spinner with Glow */}
          <div style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spin" style={{
              width: '64px',
              height: '64px',
              border: '4px solid rgba(6, 182, 212, 0.1)',
              borderTop: '4px solid var(--primary-cyan, #06b6d4)',
              borderRadius: '50%',
            }} />
            <div style={{
              position: 'absolute',
              background: 'linear-gradient(135deg, var(--primary-violet, #8b5cf6), var(--primary-emerald, #10b981))',
              padding: '10px',
              borderRadius: '12px',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
            }}>
              <Zap size={24} color="#ffffff" />
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.025em' }}>
              {dbStatus.fresh_start ? 'Setting up Enterprise Server' : 'Connecting to Database'}
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: '1.5' }}>
              Please wait while we initialize the persistent database tables and seed resources.
            </p>
          </div>

          {/* Progress bar container */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: '600', color: '#64748b' }}>
              <span>Database Initialization</span>
              <span style={{ color: 'var(--primary-cyan, #06b6d4)' }}>{dbStatus.progress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#1e293b', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                width: `${dbStatus.progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                borderRadius: '999px',
                transition: 'width 0.3s ease-out'
              }} />
            </div>
          </div>

          {/* Detailed step description */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.8rem',
            color: '#cbd5e1',
            width: '100%',
            fontFamily: 'var(--font-mono, monospace)',
            textAlign: 'left',
            boxSizing: 'border-box'
          }}>
            <span style={{ color: '#06b6d4' }}>&gt; </span>{dbStatus.details}
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: '#0a0f1d',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div className="spin" style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(6, 182, 212, 0.1)',
          borderTop: '3px solid var(--primary-cyan, #06b6d4)',
          borderRadius: '50%',
          marginBottom: '16px'
        }} />
        <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Verifying Session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPages onLoginSuccess={checkAuth} />;
  }

  return (
    <div className="app-shell" style={{ display: 'flex', width: '100%', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* ---------------------------------------------------------------- */}
      {/* TOGGLEABLE LEFT SIDEBAR NAVIGATION MENU                         */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={`app-sidebar glass-box ${isSidebarOpen ? '' : 'closed'}`}
        style={{
          margin: isSidebarOpen ? '12px 0 12px 14px' : '0',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: 'calc(100vh - 24px)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          {/* Top Brand & Sidebar Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', marginBottom: '20px', flexShrink: 0 }}>
            {isSidebarOpen ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-emerald))', padding: '9px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-glow)' }}>
                  <Zap size={22} color="#ffffff" />
                </div>
                <div>
                  <h1 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '-0.3px', color: 'var(--text-main)' }}>
                    AI Skill Engine
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span className="pulse-dot" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary-emerald)', fontWeight: '700' }}>
                      Online
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, var(--primary-violet), var(--primary-emerald))', padding: '9px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={22} color="#ffffff" />
              </div>
            )}

            <button
              className="btn-outline"
              onClick={toggleSidebar}
              style={{ padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={isSidebarOpen ? 'Collapse Left Sidebar' : 'Expand Left Sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
          </div>

          {/* Navigation Section Title */}
          {isSidebarOpen && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px', paddingLeft: '8px', flexShrink: 0 }}>
              Navigation Menu
            </div>
          )}

          {/* Navigation Items Menu */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1, paddingRight: '4px', marginBottom: '12px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  title={!isSidebarOpen ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                    gap: '12px',
                    padding: isSidebarOpen ? '10px 14px' : '10px 0',
                    borderRadius: '11px',
                    border: 'none',
                    background: isActive ? 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-sub)',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                    boxShadow: isActive ? '0 4px 14px rgba(139, 92, 246, 0.3)' : 'none',
                    width: '100%',
                    flexShrink: 0
                  }}
                >
                  <Icon size={18} color={isActive ? '#ffffff' : 'var(--text-sub)'} />
                  {isSidebarOpen && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom Footer with Stats & Theme Toggle */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          {isSidebarOpen && (
            <div style={{ background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '10px', fontSize: '0.76rem', color: 'var(--text-sub)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Skills: <strong>{stats.skillsCount}</strong></span>
              <span>Tenants: <strong>{stats.tenantsCount}</strong></span>
            </div>
          )}

          <button
            className="btn-outline"
            onClick={toggleTheme}
            style={{ width: '100%', justifyContent: 'center', padding: '8px', borderRadius: '10px' }}
            title={theme === 'dark' ? 'Switch to Day Mode' : 'Switch to Night Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={16} color="var(--accent-amber)" /> {isSidebarOpen && 'Day Mode'}
              </>
            ) : (
              <>
                <Moon size={16} color="var(--primary-violet)" /> {isSidebarOpen && 'Night Mode'}
              </>
            )}
          </button>

          <button
            className="btn-outline"
            onClick={async () => {
              try {
                await fetch('/api/v1/auth/logout', { method: 'POST' });
              } catch (e) {
                console.error('Logout failed:', e);
              }
              setIsAuthenticated(false);
            }}
            style={{ width: '100%', justifyContent: 'center', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}
            title="Log Out of your Session"
          >
            <LogOut size={16} color="#fca5a5" /> {isSidebarOpen && 'Log Out'}
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* MAIN VIEWPORT CONTENT AREA                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="app-main-content" style={{ padding: '12px 18px', overflowX: 'hidden' }}>
        {/* Top View Header */}
        <header className="glass-box" style={{ padding: '12px 20px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isSidebarOpen && (
              <button
                className="btn-outline"
                onClick={toggleSidebar}
                style={{ padding: '6px', borderRadius: '8px' }}
                title="Expand Left Sidebar"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            {React.createElement(activeNavItem.icon, { size: 20, color: 'var(--primary-violet)' })}
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>
              {activeNavItem.label}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="header-badge" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Enterprise Skill Execution Gateway & MCP Hub
            </div>
            <button
              onClick={() => handleTabChange('profile')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: activeTab === 'profile' ? '1px solid var(--primary-violet)' : '1px solid var(--border-subtle)',
                background: activeTab === 'profile' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-input)',
                color: activeTab === 'profile' ? 'var(--primary-violet)' : 'var(--text-sub)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === 'profile' ? '0 0 10px rgba(139, 92, 246, 0.2)' : 'none'
              }}
              title={`View User Profile (${userEmail})`}
            >
              <UserIcon size={18} />
            </button>
          </div>
        </header>

        {/* Main Content Component */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'playground' && <ChatPlayground />}
          {activeTab === 'apps' && <AppManager />}
          {activeTab === 'skills' && <SkillCatalog />}
          {activeTab === 'mcp' && <McpServerManager />}
          {activeTab === 'tenants' && <TenantManager />}
          {activeTab === 'usage' && <UsageSummary />}
          {activeTab === 'logs' && <AuditLogs />}
          {activeTab === 'apilogs' && <ApiLogs />}
          {activeTab === 'requestlogs' && <RequestLogs />}
          {activeTab === 'docs' && <ApiDocs />}
          {activeTab === 'tester' && <ApiTester />}
          {activeTab === 'profile' && <Profile />}
        </main>
      </div>
    </div>
  );
}
