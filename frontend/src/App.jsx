import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { Key, Layers, MessageSquare, Database, ShieldCheck, Cpu, BookOpen, Sun, Moon, Activity, Box, PanelLeftClose, PanelLeftOpen, Zap, Terminal, FileText, DollarSign, LogOut, User as UserIcon, HardDrive, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import TenantManager from './components/TenantManager';
import SkillCatalog from './components/SkillCatalog';
import ChatPlayground from './components/ChatPlayground';
import LogViewer from './components/LogViewer';
import ApiDocs from './components/ApiDocs';
import McpServerManager from './components/McpServerManager';
import AppManager from './components/AppManager';
import ApiTester from './components/ApiTester';
import RequestLogs from './components/RequestLogs';
import UsageSummary from './components/UsageSummary';
import AuthPages from './components/AuthPages';
import Profile from './components/Profile';
import StorageSettings from './components/StorageSettings';
import SandboxSettings from './components/SandboxSettings';
import UserDataTemplates from './components/UserDataTemplates';
import EmailSettings from './components/EmailSettings';
import Canvas from './components/Canvas';
import { authApi, skillsApi, tenantsApi, logsApi, apiClient } from './api';
import { ToastProvider, useToast } from './context/ToastContext';

function ApiErrorListenerBridge() {
  const { showError } = useToast();

  useEffect(() => {
    const unsubscribe = apiClient.onError((error) => {
      showError(error.message || 'An unexpected API error occurred', error.status || null);
    });
    return unsubscribe;
  }, [showError]);

  return null;
}

function AppContent() {
  const navItems = [
    { id: 'playground', label: 'Chat Playground', icon: MessageSquare, order: 10 },
    { id: 'tester', label: 'API Tester', icon: Terminal, order: 20 },
    { id: 'apps', label: 'Apps & Groups', icon: Box, order: 30 },
    { id: 'skills', label: 'Skills Catalog', icon: Layers, order: 40 },
    { id: 'mcp', label: 'MCP Servers', icon: Cpu, order: 50 },
    { id: 'user-data', label: 'User Data Profiles', icon: Layers, order: 60 },
    { id: 'tenants', label: 'Tenants & Keys', icon: Key, order: 70 },
    { id: 'email-config', label: 'Email Configuration', icon: Mail, order: 80 },
    { id: 'storage', label: 'Storage', icon: HardDrive, order: 90 },
    { id: 'sandbox', label: 'Sandbox Config', icon: ShieldCheck, order: 100 },
    { id: 'usage', label: 'LLM Cost & Usage', icon: DollarSign, order: 110 },
    { id: 'logs', label: 'Sandbox Audit Logs', icon: Database, order: 120 },
    { id: 'apilogs', label: 'API Execution Logs', icon: Activity, order: 130 },
    { id: 'requestlogs', label: 'Request Logs', icon: FileText, order: 140 },
    { id: 'api-docs', label: 'API Documentation', icon: BookOpen, order: 150 },
  ];

  const topNavItems = [
    { id: 'playground', label: 'Chat Playground', icon: MessageSquare, order: 10 },
  ];

  const bottomNavItems = [
    { id: 'tester', label: 'API Tester', icon: Terminal, order: 10 },
    { id: 'api-docs', label: 'API Documentation', icon: BookOpen, order: 20 },
  ];

  const navGroups = [
    {
      id: 'registry_grp',
      label: 'Registry & Assets',
      order: 10,
      items: [
        { id: 'apps', label: 'Apps & Groups', icon: Box, order: 10 },
        { id: 'skills', label: 'Skills Catalog', icon: Layers, order: 20 },
        { id: 'mcp', label: 'MCP Servers', icon: Cpu, order: 30 },
        { id: 'user-data', label: 'User Data Profiles', icon: Layers, order: 40 },
      ]
    },
    {
      id: 'settings_grp',
      label: 'Settings & Gateway',
      order: 20,
      items: [
        { id: 'tenants', label: 'Tenants & Keys', icon: Key, order: 10 },
        { id: 'email-config', label: 'Email Configuration', icon: Mail, order: 20 },
        { id: 'storage', label: 'Storage Settings', icon: HardDrive, order: 30 },
        { id: 'sandbox', label: 'Sandbox Config', icon: ShieldCheck, order: 40 },
      ]
    },
    {
      id: 'analytics_grp',
      label: 'Audit & Analytics',
      order: 30,
      items: [
        { id: 'usage', label: 'LLM Cost & Usage', icon: DollarSign, order: 10 },
        { id: 'logs', label: 'Sandbox Audit Logs', icon: Database, order: 20 },
        { id: 'apilogs', label: 'API Execution Logs', icon: Activity, order: 30 },
        { id: 'requestlogs', label: 'Request Logs', icon: FileText, order: 40 },
      ]
    }
  ];

  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_expanded_groups');
      return saved ? JSON.parse(saved) : {
        playground_grp: true,
        registry_grp: true,
        settings_grp: true,
        analytics_grp: true,
      };
    } catch {
      return {
        playground_grp: true,
        registry_grp: true,
        settings_grp: true,
        analytics_grp: true,
      };
    }
  });

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      localStorage.setItem('sidebar_expanded_groups', JSON.stringify(next));
      return next;
    });
  };

  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.replace(/^\//, '').trim() || 'playground';
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'dark');
  const [stats, setStats] = useState({ skillsCount: 4, tenantsCount: 1, logsCount: 0 });
  const [dbStatus, setDbStatus] = useState({ ready: false, details: 'Connecting to database...', progress: 0, fresh_start: false, error: null });
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
      const data = await authApi.getProfile();
      setIsAuthenticated(true);
      setUserEmail(data.email);
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
        const data = await apiClient.get('/api/v1/db-status');
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
    window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { theme } }));
    // Broadcast theme to all embedded iframes
    try {
      document.querySelectorAll('iframe').forEach((frame) => {
        frame.contentWindow?.postMessage({ type: 'THEME_CHANGE', theme }, '*');
      });
    } catch {}
  }, [theme]);

  // Synchronize when theme changes from within an iframe or another tab
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'THEME_CHANGE' && (e.data.theme === 'dark' || e.data.theme === 'light')) {
        setTheme(e.data.theme);
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'app_theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

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

  const handleTabChange = (tabId) => {
    navigate(`/${tabId}`);
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
      const [skillsData, tenantsData, logsData] = await Promise.all([
        skillsApi.list(),
        tenantsApi.list(),
        logsApi.getExecutionLogs({ limit: 100 }),
      ]);

      const skillsList = Array.isArray(skillsData) ? skillsData : (skillsData.skills || []);
      const tenantsList = Array.isArray(tenantsData) ? tenantsData : (tenantsData.items || tenantsData.data || []);
      const logsList = Array.isArray(logsData) ? logsData : (logsData.logs || logsData.data || []);

      setStats({
        skillsCount: skillsList.length,
        tenantsCount: tenantsList.length,
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


  // If iframe embed canvas view, render directly without dashboard shell
  if (location.pathname.startsWith('/embed/canvas')) {
    return <Canvas isEmbed={true} initialTheme={theme} />;
  }

  // Render database creation loader screen if DB is not ready (includes encryption key error state)
  if (!dbStatus.ready) {
    const hasError = !!dbStatus.error;
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
          maxWidth: hasError ? '520px' : '440px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px'
        }}>
          {/* Icon: error shield or animated spinner */}
          {hasError ? (
            <div style={{
              background: 'linear-gradient(135deg, #7f1d1d, #dc2626)',
              padding: '18px',
              borderRadius: '16px',
              boxShadow: '0 0 40px rgba(220, 38, 38, 0.35)',
            }}>
              <ShieldCheck size={36} color="#fff" />
            </div>
          ) : (
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
          )}

          {/* Title + subtitle */}
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.025em', color: hasError ? '#fca5a5' : '#f8fafc' }}>
              {hasError ? 'Encryption Key Not Configured' : (dbStatus.fresh_start ? 'Setting up Enterprise Server' : 'Connecting to Database')}
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: '1.5' }}>
              {hasError
                ? 'The server cannot read stored credentials (LLM API keys, storage secrets, SMTP passwords). Initialization was stopped.'
                : 'Please wait while we initialize the persistent database tables and seed resources.'}
            </p>
          </div>

          {hasError ? (
            <>
              {/* Error detail box */}
              <div style={{
                width: '100%',
                background: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '10px',
                padding: '14px 16px',
                fontSize: '0.8rem',
                color: '#fca5a5',
                textAlign: 'left',
                lineHeight: '1.6',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}>
                {dbStatus.error}
              </div>

              {/* Fix steps */}
              <div style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '18px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>How to fix</p>
                {[
                  { step: '1', text: 'Generate a key:', code: 'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"' },
                  { step: '2', text: 'Add it to your .env file:', code: 'ENCRYPTION_SECRET_KEY=<paste-key-here>' },
                  { step: '3', text: 'Restart the container:', code: './run_docker.sh' },
                ].map(({ step, text, code }) => (
                  <div key={step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                      minWidth: '24px', height: '24px',
                      background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: '800', color: '#fff',
                      flexShrink: 0,
                    }}>{step}</div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' }}>{text}</p>
                      <code style={{
                        display: 'block',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '0.75rem',
                        color: '#7dd3fc',
                        wordBreak: 'break-all',
                      }}>{code}</code>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Progress bar */}
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

              {/* Status detail */}
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
            </>
          )}
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

          {/* Navigation Items Menu */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1, paddingRight: '4px', marginBottom: '12px' }}>
            {/* Top-level playground items outside groups */}
            {[...topNavItems].sort((a, b) => a.order - b.order).map((item) => {
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

            {/* Collapsible groups */}
            {isSidebarOpen ? (
              <>
                {[...navGroups].sort((a, b) => a.order - b.order).map((group) => {
                  const isExpanded = !!expandedGroups[group.id];
                  return (
                    <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button
                        onClick={() => toggleGroup(group.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '6px 8px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          outline: 'none'
                        }}
                      >
                        <span>{group.label}</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
                          {[...group.items].sort((a, b) => a.order - b.order).map((item) => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  gap: '12px',
                                  padding: '10px 14px',
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
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Bottom items rendered at bottom inside opened sidebar */}
                {[...bottomNavItems].sort((a, b) => a.order - b.order).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '12px',
                        padding: '10px 14px',
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
                        flexShrink: 0,
                        marginTop: item.id === 'tester' ? '12px' : '0' // divider margin
                      }}
                    >
                      <Icon size={18} color={isActive ? '#ffffff' : 'var(--text-sub)'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </>
            ) : (
              // Flat icons list when sidebar is closed
              <>
                {[...navGroups].sort((a, b) => a.order - b.order).flatMap(g => [...g.items].sort((a, b) => a.order - b.order)).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      title={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 0',
                        borderRadius: '11px',
                        border: 'none',
                        background: isActive ? 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-sub)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isActive ? '0 4px 14px rgba(139, 92, 246, 0.3)' : 'none',
                        width: '100%',
                        flexShrink: 0
                      }}
                    >
                      <Icon size={18} color={isActive ? '#ffffff' : 'var(--text-sub)'} />
                    </button>
                  );
                })}

                {/* Bottom items closed view */}
                {[...bottomNavItems].sort((a, b) => a.order - b.order).map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      title={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 0',
                        borderRadius: '11px',
                        border: 'none',
                        background: isActive ? 'linear-gradient(135deg, var(--primary-violet), var(--primary-indigo))' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-sub)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isActive ? '0 4px 14px rgba(139, 92, 246, 0.3)' : 'none',
                        width: '100%',
                        flexShrink: 0,
                        marginTop: item.id === 'tester' ? '12px' : '0'
                      }}
                    >
                      <Icon size={18} color={isActive ? '#ffffff' : 'var(--text-sub)'} />
                    </button>
                  );
                })}
              </>
            )}
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
                await authApi.logout();
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
      <div
        className="app-main-content"
        style={{
          padding: activeTab === 'playground' ? '0' : '12px 18px',
          height: '100vh',
          maxHeight: '100vh',
          overflow: activeTab === 'playground' ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* Top View Header (Hidden on Playground since Playground has its own contextual bar) */}
        {activeTab !== 'playground' && (
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
        )}

        {/* Main Content Component */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          width: '100%',
          maxWidth: '100%',
          height: activeTab === 'playground' ? '100%' : 'auto',
          maxHeight: activeTab === 'playground' ? '100%' : 'none',
          overflow: activeTab === 'playground' ? 'hidden' : 'visible',
          boxSizing: 'border-box'
        }}>
          <Routes>
            <Route path="/embed/canvas" element={<Canvas isEmbed={true} />} />
            <Route path="/playground" element={<ChatPlayground isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />} />
            <Route path="/apps" element={<AppManager />} />
            <Route path="/skills" element={<SkillCatalog />} />
            <Route path="/mcp" element={<McpServerManager />} />
            <Route path="/user-data" element={<UserDataTemplates />} />
            <Route path="/tenants" element={<TenantManager />} />
            <Route path="/tenants/:tenantId" element={<TenantManager />} />
            <Route path="/email-config" element={<EmailSettings />} />
            <Route path="/storage" element={<StorageSettings />} />
            <Route path="/sandbox" element={<SandboxSettings />} />
            <Route path="/usage" element={<UsageSummary />} />
            <Route path="/logs" element={
              <LogViewer
                requestSource="dashboard"
                title="Sandbox Audit Logs"
                subtitle="Audit history of execution traces triggered exclusively by the Dashboard Chat Playground."
                icon={Database}
              />
            } />
            <Route path="/apilogs" element={
              <LogViewer
                requestSource="api"
                title="API Client Execution Logs"
                subtitle="Audit history of execution traces triggered exclusively by external integrations and customer API client completions."
                icon={Terminal}
              />
            } />
            <Route path="/requestlogs" element={<RequestLogs />} />
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="/docs" element={<Navigate to="/api-docs" replace />} />
            <Route path="/tester" element={<ApiTester />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<Navigate to="/playground" replace />} />
            <Route path="*" element={<Navigate to="/playground" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ApiErrorListenerBridge />
      <AppContent />
    </ToastProvider>
  );
}
