import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText, Code, Table, Presentation, Image, Music, Video, Globe,
  Download, History, RefreshCw, CheckCircle2,
  Sun, Moon, BookOpen, X, Compass, Box, MapPin, Cpu,
  Maximize2, Minimize2, ChevronDown, FileDown
} from 'lucide-react';
import { artifactsApi } from '../../api';
import PagedDocViewer from './PagedDocViewer';
import CodeViewer from './CodeViewer';
import SlidePlayer from './SlidePlayer';
import SheetGrid from './SheetGrid';
import SvgViewer from './SvgViewer';
import HtmlViewer from './HtmlViewer';
import MediaViewer from './MediaViewer';
import Cad2DViewer from './Cad2DViewer';
import Cad3DViewer from './Cad3DViewer';
import GisViewer from './GisViewer';
import LogicViewer from './LogicViewer';
import BlockHistoryModal from './BlockHistoryModal';
import './canvas.css';

function CanvasInner({ isEmbed = false, artifactId: propArtifactId, token: propToken, initialTheme, onClose }) {
  const [searchParams] = useSearchParams();
  const artifactId = propArtifactId || searchParams.get('id') || searchParams.get('art');
  const [currentToken, setCurrentToken] = useState(propToken || searchParams.get('token') || '');

  // Synchronize when propToken changes
  useEffect(() => {
    if (propToken !== undefined && propToken !== currentToken) {
      setCurrentToken(propToken || '');
    }
  }, [propToken]);

  // ── Multi-Tier Theme State (URL -> Prop -> Parent Window -> LocalStorage -> 'dark') ──
  const [theme, setTheme] = useState(() => {
    const urlTheme = searchParams.get('theme');
    if (urlTheme === 'light' || urlTheme === 'dark') return urlTheme;
    if (initialTheme === 'light' || initialTheme === 'dark') return initialTheme;
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        const pt = window.parent.document?.documentElement?.getAttribute('data-theme');
        if (pt === 'light' || pt === 'dark') return pt;
      }
    } catch {}
    try {
      const saved = localStorage.getItem('app_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const [artifact, setArtifact] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeBlockKey, setActiveBlockKey] = useState(null);
  const [updatedBlockKey, setUpdatedBlockKey] = useState(null);
  const [historyModal, setHistoryModal] = useState(null); // { blockKey, blockTitle }
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const canvasRootRef = useRef(null);
  const downloadMenuRef = useRef(null);

  // Compute available download formats based on artifact type & filename
  const downloadFormats = useMemo(() => {
    const fn = (artifact?.filename || '').toLowerCase();
    const type = (artifact?.artifact_type || '').toLowerCase();

    if (
      type === 'document' ||
      type === 'doc' ||
      type === 'pdf' ||
      fn.endsWith('.md') ||
      fn.endsWith('.docx') ||
      fn.endsWith('.doc') ||
      fn.endsWith('.txt')
    ) {
      return [
        {
          label: 'Word Document (.docx)',
          format: 'docx',
          icon: FileText,
          desc: 'Styled Word document with headings & tables',
          color: '#3b82f6',
          bg: 'rgba(59, 130, 246, 0.15)'
        },
        {
          label: 'PDF Document (.pdf)',
          format: 'pdf',
          icon: FileDown,
          desc: 'Printable vector PDF document',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.15)'
        },
        {
          label: 'Markdown File (.md)',
          format: 'md',
          icon: Code,
          desc: 'Raw source markdown with headings',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)'
        },
        {
          label: 'Plain Text (.txt)',
          format: 'txt',
          icon: FileText,
          desc: 'Clean unformatted plain text',
          color: '#94a3b8',
          bg: 'rgba(148, 163, 184, 0.15)'
        }
      ];
    }

    if (type === 'spreadsheet' || type === 'sheet' || fn.endsWith('.xlsx') || fn.endsWith('.csv')) {
      return [
        {
          label: 'Excel Workbook (.xlsx)',
          format: 'xlsx',
          icon: Table,
          desc: 'Formatted Microsoft Excel sheet',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)'
        },
        {
          label: 'CSV Spreadsheet (.csv)',
          format: 'csv',
          icon: Table,
          desc: 'Raw comma-separated values',
          color: '#06b6d4',
          bg: 'rgba(6, 182, 212, 0.15)'
        }
      ];
    }

    if (type === 'presentation' || type === 'slides' || fn.endsWith('.pptx')) {
      return [
        {
          label: 'PowerPoint Deck (.pptx)',
          format: 'pptx',
          icon: Presentation,
          desc: 'Editable PowerPoint presentation',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.15)'
        },
        {
          label: 'PDF Slides (.pdf)',
          format: 'pdf',
          icon: FileDown,
          desc: 'Printable vector slide deck',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.15)'
        }
      ];
    }

    if (type === 'cad_2d' || fn.endsWith('.dxf') || fn.endsWith('.dwg')) {
      return [
        {
          label: 'AutoCAD DXF (.dxf)',
          format: 'dxf',
          icon: Compass,
          desc: 'ASCII AutoCAD DXF blueprint',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.15)'
        }
      ];
    }

    if (type === 'cad_3d' || fn.endsWith('.step') || fn.endsWith('.stp') || fn.endsWith('.stl') || fn.endsWith('.obj')) {
      const ext = fn.split('.').pop() || 'step';
      return [
        {
          label: `3D Model (.${ext})`,
          format: ext,
          icon: Box,
          desc: `Standard 3D ${ext.toUpperCase()} solid`,
          color: '#c084fc',
          bg: 'rgba(192, 132, 252, 0.15)'
        }
      ];
    }

    if (type === 'gis' || fn.endsWith('.geojson') || fn.endsWith('.kml')) {
      const ext = fn.split('.').pop() || 'geojson';
      return [
        {
          label: `GIS Map (.${ext})`,
          format: ext,
          icon: MapPin,
          desc: 'Geographic vector dataset',
          color: '#34d399',
          bg: 'rgba(52, 211, 153, 0.15)'
        }
      ];
    }

    const curExt = fn.includes('.') ? fn.split('.').pop() : 'txt';
    return [
      {
        label: `Source File (.${curExt})`,
        format: curExt,
        icon: Download,
        desc: 'Original raw format',
        color: '#818cf8',
        bg: 'rgba(129, 140, 248, 0.15)'
      }
    ];
  }, [artifact]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // DOM-level Fullscreen toggle handler (expands to fill the entire application viewport)
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Keyboard Escape listener to exit fullscreen or close dropdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        if (showDownloadMenu) setShowDownloadMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showDownloadMenu]);

  // Sync theme with document element and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('app_theme', theme);
    } catch {}
  }, [theme]);

  // Synchronize when theme changes anywhere (parent window, other tabs, postMessage)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'app_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTheme(e.newValue);
      }
    };
    const handleMessage = (e) => {
      if (e.data?.type === 'THEME_CHANGE' && (e.data.theme === 'light' || e.data.theme === 'dark')) {
        setTheme(e.data.theme);
      }
    };
    const handleAppTheme = (e) => {
      if (e.detail?.theme && (e.detail.theme === 'light' || e.detail.theme === 'dark')) {
        setTheme(e.detail.theme);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('message', handleMessage);
    window.addEventListener('app-theme-change', handleAppTheme);

    let observer = null;
    try {
      if (window.parent && window.parent !== window && window.parent.document?.documentElement) {
        observer = new MutationObserver(() => {
          const pt = window.parent.document.documentElement.getAttribute('data-theme');
          if (pt === 'light' || pt === 'dark') {
            setTheme(pt);
          }
        });
        observer.observe(window.parent.document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme']
        });
      }
    } catch {}

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('app-theme-change', handleAppTheme);
      if (observer) observer.disconnect();
    };
  }, []);

  const toggleCanvasTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      window.parent?.postMessage({ type: 'THEME_CHANGE', theme: next }, '*');
    } catch {}
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Fetch Initial Artifact Details
  // ─────────────────────────────────────────────────────────────────────────
  const loadArtifact = async (id, tok) => {
    if (!id && !tok) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // If no ID passed explicitly, extract from token
      let effectiveId = id;
      if (!effectiveId && tok && tok.includes('.')) {
        try {
          const rawB64 = tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
          const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
          const payload = JSON.parse(atob(padded));
          effectiveId = payload?.art;
        } catch (e) {
          console.warn('Could not extract artifact ID from token:', e);
        }
      }

      if (!effectiveId) {
        throw new Error('No Artifact ID provided');
      }

      const data = await artifactsApi.getDetails(effectiveId, tok);
      if (!data) {
        throw new Error('Could not load artifact: received empty response');
      }
      setArtifact(data);
      // Fetch full content of all blocks if outline provided
      const blockPromises = (data?.outline || []).map((b) =>
        artifactsApi.getBlock(effectiveId, b.block_key, tok).catch(() => ({
          block_key: b.block_key,
          title: b.title,
          content: '',
          version: b.version
        }))
      );
      const loadedBlocks = await Promise.all(blockPromises);
      setBlocks(loadedBlocks);
      if (loadedBlocks.length > 0) {
        setActiveBlockKey(loadedBlocks[0].block_key);
      }
    } catch (err) {
      setError(err.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArtifact(artifactId, currentToken);
  }, [artifactId, currentToken]);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Silent Token Refresh Loop (every 22 minutes)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentToken || !artifact?.id) return;

    const interval = setInterval(async () => {
      try {
        const refreshData = await artifactsApi.refreshToken(artifact.id, currentToken);
        if (refreshData?.token) {
          setCurrentToken(refreshData.token);
          // Update URL without reloading
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('token', refreshData.token);
          window.history.replaceState({}, '', newUrl.toString());
        }
      } catch (e) {
        console.warn('Silent token refresh error:', e);
      }
    }, 22 * 60 * 1000); // 22 minutes

    return () => clearInterval(interval);
  }, [currentToken, artifact?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Real-Time SSE Stream for Canvas Updates
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const targetId = artifact?.id || artifactId;
    if (!targetId) return;

    const streamUrl = artifactsApi.getStreamUrl(targetId, currentToken);
    const es = new EventSource(streamUrl);

    es.onopen = () => {
      setIsLiveConnected(true);
    };

    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'canvas_connected') {
          setIsLiveConnected(true);
        } else if (data.type === 'artifact_patch' || data.type === 'block_rolled_back') {
          // Update the targeted block in state in-place with zero page reload
          const patchKey = data.block_key;
          const newContent = data.content;

          setBlocks((prev) => {
            const exists = prev.some((b) => b.block_key === patchKey);
            if (exists) {
              return prev.map((b) =>
                b.block_key === patchKey
                  ? { ...b, content: newContent, version: data.version || b.version + 1 }
                  : b
              );
            } else {
              return [
                ...prev,
                { block_key: patchKey, title: data.title || patchKey, content: newContent, version: data.version || 1 }
              ];
            }
          });

          // Trigger green highlight pulse animation for 2.5s
          setUpdatedBlockKey(patchKey);
          setTimeout(() => setUpdatedBlockKey(null), 2500);

          // Update artifact version number
          setArtifact((prev) => prev ? { ...prev, current_version: data.version || prev.current_version + 1 } : prev);
        } else if (data.type === 'artifact_created' || data.type === 'artifact_updated') {
          loadArtifact(targetId, currentToken);
        }
      } catch (err) {
        // Ping or non-JSON message
      }
    };

    es.onerror = () => {
      setIsLiveConnected(false);
    };

    return () => {
      es.close();
    };
  }, [artifact?.id, artifactId, currentToken]);

  // Scroll to section when outline clicked
  const handleJumpToBlock = (blockKey) => {
    setActiveBlockKey(blockKey);
    const element = document.getElementById(`block-${blockKey}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleBlockUpdated = (blockKey, newContent) => {
    setBlocks((prev) =>
      prev.map((b) => (b.block_key === blockKey ? { ...b, content: newContent, version: (b.version || 1) + 1 } : b))
    );
    setArtifact((prev) => prev ? { ...prev, current_version: (prev.current_version || 1) + 1 } : prev);
  };

  const getNormalizedType = (art) => {
    if (!art) return 'document';
    const type = (art.artifact_type || '').toLowerCase();
    const filename = (art.filename || '').toLowerCase();
    const lang = (art.language || '').toLowerCase();

    if (
      type === 'diagram_svg' ||
      type === 'svg' ||
      type === 'diagram' ||
      type === 'vector' ||
      type === 'image' ||
      lang === 'svg' ||
      filename.endsWith('.svg')
    ) {
      return 'svg';
    }

    if (
      type === 'spreadsheet' ||
      type === 'sheet' ||
      type === 'table' ||
      type === 'csv' ||
      type === 'tsv' ||
      type === 'excel' ||
      filename.endsWith('.xlsx') ||
      filename.endsWith('.csv') ||
      filename.endsWith('.tsv')
    ) {
      return 'spreadsheet';
    }

    if (
      type === 'presentation' ||
      type === 'slides' ||
      type === 'deck' ||
      filename.endsWith('.pptx') ||
      filename.endsWith('.key')
    ) {
      return 'presentation';
    }

    if (
      type === 'html' ||
      type === 'web' ||
      type === 'website' ||
      lang === 'html' ||
      lang === 'htm' ||
      filename.endsWith('.html') ||
      filename.endsWith('.htm')
    ) {
      return 'html';
    }

    if (
      type === 'cad_2d' ||
      /\.(dwg|dxf)$/i.test(filename)
    ) {
      return 'cad_2d';
    }

    if (
      type === 'cad_3d' ||
      type === 'cad' ||
      type === 'step' ||
      type === 'stl' ||
      /\.(step|stp|iges|igs|ifc|stl|obj|glb|gltf)$/i.test(filename)
    ) {
      return 'cad_3d';
    }

    if (
      type === 'gis' ||
      type === 'geo' ||
      type === 'map' ||
      /\.(geojson|kml|kmz|shp)$/i.test(filename)
    ) {
      return 'gis';
    }

    if (
      type === 'engineering_data' ||
      type === 'engineering' ||
      type === 'logic' ||
      /\.(l5x|l5k|s7p|xer|m|slx)$/i.test(filename)
    ) {
      return 'engineering_data';
    }

    if (
      type === 'code' ||
      type === 'script' ||
      ['python', 'javascript', 'typescript', 'css', 'json', 'sql', 'bash', 'sh', 'c', 'cpp', 'rust', 'go', 'jsx', 'tsx'].includes(lang) ||
      /\.(py|js|ts|jsx|tsx|css|json|sql|sh|c|cpp|rs|go|yaml|yml|xml|env)$/i.test(filename)
    ) {
      return 'code';
    }

    if (type === 'audio' || /\.(mp3|wav|ogg|m4a|aac)$/i.test(filename)) {
      return 'audio';
    }

    if (type === 'video' || /\.(mp4|webm|mov|avi|mkv)$/i.test(filename)) {
      return 'video';
    }

    if (type === 'pdf' || filename.endsWith('.pdf')) {
      return 'pdf';
    }

    return 'document';
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'cad_2d':
        return <Compass size={15} />;
      case 'cad_3d':
        return <Box size={15} />;
      case 'gis':
        return <MapPin size={15} />;
      case 'engineering_data':
        return <Cpu size={15} />;
      case 'document':
      case 'pdf':
        return <FileText size={15} />;
      case 'code':
        return <Code size={15} />;
      case 'html':
        return <Globe size={15} />;
      case 'spreadsheet':
        return <Table size={15} />;
      case 'presentation':
        return <Presentation size={15} />;
      case 'svg':
        return <Image size={15} />;
      case 'audio':
        return <Music size={15} />;
      case 'video':
        return <Video size={15} />;
      default:
        return <FileText size={15} />;
    }
  };

  if (loading && !artifact) {
    return (
      <div className={`canvas-root ${isEmbed ? 'is-embed' : ''}`} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div className="pulse-dot" style={{ width: '16px', height: '16px' }} />
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>Loading Canvas...</div>
        </div>
      </div>
    );
  }

  if (error && !artifact) {
    return (
      <div className={`canvas-root ${isEmbed ? 'is-embed' : ''}`} style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        <div style={{ background: '#1f1315', border: '1px solid #7f1d1d', borderRadius: '10px', padding: '24px', maxWidth: '440px', textAlign: 'center' }}>
          <div style={{ color: '#f87171', fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>Unable to Open Canvas</div>
          <p style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '16px' }}>{error}</p>
          <button className="canvas-btn canvas-btn-secondary" onClick={() => loadArtifact(artifactId, currentToken)}>
            <RefreshCw size={13} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  const artType = getNormalizedType(artifact);

  const inIframe = isEmbed || (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  })();

  return (
    <div
      ref={canvasRootRef}
      className={`canvas-root ${inIframe ? 'is-embed' : ''} ${isFullscreen ? 'is-fullscreen' : ''} is-compact`}
      data-theme={theme}
    >
      {/* ── Top Navigation Bar (Sleek, Minimal & Space-Saving) ── */}
      <header className="canvas-header">
        <div className="canvas-header-left">
          {/* Compact Outline Toggle Button */}
          <button
            className={`canvas-btn-icon canvas-outline-toggle-btn ${sidebarOpen ? 'active' : ''}`}
            title={sidebarOpen ? 'Hide Outline' : 'Show Outline'}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <BookOpen size={14} />
            {blocks.length > 0 && (
              <span className="canvas-outline-count-badge">{blocks.length}</span>
            )}
          </button>

          {/* Minimal Type Badge (Only when not a standard document) */}
          {artType !== 'document' && (
            <div className="canvas-type-badge-minimal" title={`Type: ${artType}`}>
              {getTypeIcon(artType)}
            </div>
          )}

          {/* Clean Single-Line Document Title & Live Status */}
          <div className="canvas-title-group">
            <span
              className="canvas-doc-title"
              title={typeof artifact?.title === 'object' && artifact?.title !== null ? (artifact.title?.name || artifact.title?.title || 'Document') : String(artifact?.title || 'Document')}
            >
              {typeof artifact?.title === 'object' && artifact?.title !== null ? (artifact.title?.name || artifact.title?.title || 'Untitled Document') : String(artifact?.title || 'Untitled Document')}
            </span>
            <span className="canvas-version-pill">v{artifact?.current_version || 1}</span>
            {isLiveConnected && (
              <span className="canvas-live-indicator" title="Live sync active">
                <span className="pulse-dot" />
              </span>
            )}
          </div>
        </div>

        <div className="canvas-header-right">
          {/* Day / Night Mode Toggle - Clean Icon Button */}
          <button
            className="canvas-btn-icon"
            title={theme === 'dark' ? 'Switch to Day Mode' : 'Switch to Night Mode'}
            onClick={toggleCanvasTheme}
          >
            {theme === 'dark' ? (
              <Sun size={14} style={{ color: '#fbbf24' }} />
            ) : (
              <Moon size={14} style={{ color: '#818cf8' }} />
            )}
          </button>

          {/* Diff History Button */}
          <button
            className="canvas-btn-icon"
            title="Inspect Commit History & Diff"
            onClick={() => setHistoryModal({ blockKey: null, blockTitle: 'Full Document' })}
          >
            <History size={14} />
          </button>

          {/* Fullscreen Toggle Button */}
          <button
            className="canvas-btn-icon"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Download Button with Multi-Format Dropdown Menu */}
          <div style={{ position: 'relative' }} ref={downloadMenuRef}>
            <button
              className="canvas-btn-icon canvas-btn-primary-icon"
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              title="Download Document (Select Format)"
            >
              <Download size={14} />
            </button>

            {showDownloadMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '260px',
                  background: 'var(--canvas-header-bg, #0f172a)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid var(--canvas-border, rgba(255,255,255,0.12))',
                  borderRadius: '10px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  padding: '6px',
                  zIndex: 99999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <div
                  style={{
                    padding: '6px 10px 4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--doc-text-muted, #94a3b8)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em'
                  }}
                >
                  Select Export Format
                </div>

                {downloadFormats.map((fmt) => {
                  const IconComponent = fmt.icon || FileText;
                  const exportUrl = artifactsApi.getExportUrl(artifact?.id, currentToken, fmt.format);
                  const baseName = (artifact?.filename || 'document').replace(/\.[^/.]+$/, '');
                  const dlFilename = `${baseName}.${fmt.format}`;

                  return (
                    <a
                      key={fmt.format}
                      href={exportUrl}
                      download={dlFilename}
                      onClick={() => setShowDownloadMenu(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        color: 'inherit',
                        background: 'transparent',
                        transition: 'all 0.15s ease'
                      }}
                      className="canvas-download-option-item"
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: fmt.bg || 'rgba(99, 102, 241, 0.12)',
                          color: fmt.color || '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <IconComponent size={15} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--doc-title-color, #f8fafc)' }}>
                          {fmt.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--doc-text-muted, #94a3b8)', lineHeight: 1.2 }}>
                          {fmt.desc}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Close Button */}
          {onClose && (
            <button
              className="canvas-btn-icon canvas-close-btn"
              onClick={onClose}
              title="Close Canvas"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* ── Main Canvas Workspace ── */}
      <div className="canvas-body">
        {/* Table of Contents / Outline Sidebar */}
        <aside className={`canvas-sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
          <div className="canvas-sidebar-header">
            <span>Sections & Outline</span>
            <span style={{ fontSize: '10px', color: 'var(--doc-text-muted, #6b7280)' }}>{blocks.length} blocks</span>
          </div>

          <div className="canvas-outline-list">
            {blocks.map((b, idx) => {
              const blockTitle = typeof b.title === 'object' && b.title !== null
                ? (b.title?.name || b.title?.title || b.block_key)
                : (b.title || b.block_key);
              return (
                <button
                  key={b.block_key}
                  className={`canvas-outline-item ${activeBlockKey === b.block_key ? 'active' : ''}`}
                  onClick={() => handleJumpToBlock(b.block_key)}
                >
                  <span className="canvas-outline-title">
                    {idx + 1}. {blockTitle}
                  </span>
                  <span className="canvas-outline-badge">
                    {typeof b?.content === 'string' ? `${b.content.split(/\s+/).filter(Boolean).length}w` : '0w'}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Viewport Stage */}
        <main className="canvas-stage">
          {(artType === 'document' || artType === 'pdf') && (
            <PagedDocViewer
              artifact={artifact}
              blocks={blocks}
              artifactId={artifact?.id}
              token={currentToken}
              theme={theme}
              updatedBlockKey={updatedBlockKey}
              onOpenHistory={(key, title) => setHistoryModal({ blockKey: key, blockTitle: title })}
              onBlockUpdated={handleBlockUpdated}
            />
          )}

          {artType === 'code' && (
            <CodeViewer
              fullContent={artifact?.full_content || blocks[0]?.content || ''}
              blocks={blocks}
              artifactId={artifact?.id}
              language={artifact?.language || 'python'}
              filename={artifact?.filename || 'code.py'}
              token={currentToken}
              theme={theme}
              onOpenHistory={(key, title) => setHistoryModal({ blockKey: key, blockTitle: title })}
              onBlockUpdated={handleBlockUpdated}
            />
          )}

          {artType === 'presentation' && (
            <SlidePlayer
              blocks={blocks}
              artifactId={artifact?.id}
              token={currentToken}
              theme={theme}
              onOpenHistory={(key, title) => setHistoryModal({ blockKey: key, blockTitle: title })}
            />
          )}

          {artType === 'spreadsheet' && (
            <SheetGrid
              blocks={blocks}
              artifactId={artifact?.id}
              token={currentToken}
              onOpenHistory={(key, title) => setHistoryModal({ blockKey: key, blockTitle: title })}
              onBlockUpdated={handleBlockUpdated}
            />
          )}

          {artType === 'html' && (
            <HtmlViewer
              fullContent={artifact?.full_content || (blocks && blocks[0] ? blocks[0].content : '') || ''}
              blocks={blocks}
              artifactId={artifact?.id}
              filename={artifact?.filename || 'index.html'}
              token={currentToken}
              theme={theme}
              onOpenHistory={(key, title) => setHistoryModal({ blockKey: key, blockTitle: title })}
              onBlockUpdated={handleBlockUpdated}
            />
          )}

          {artType === 'svg' && (
            <SvgViewer
              fullContent={artifact?.full_content || (blocks && blocks.length ? blocks.map(b => b.content || '').join('\n') : '')}
              blocks={blocks}
            />
          )}

          {artType === 'cad_2d' && (
            <Cad2DViewer
              fullContent={artifact?.full_content || (blocks && blocks.length ? blocks.map(b => b.content || '').join('\n') : '')}
              artifact={artifact}
              token={currentToken}
              filename={artifact?.filename || 'drawing.dxf'}
            />
          )}

          {artType === 'cad_3d' && (
            <Cad3DViewer
              fullContent={artifact?.full_content || (blocks && blocks.length ? blocks.map(b => b.content || '').join('\n') : '')}
              artifact={artifact}
              filename={artifact?.filename || 'model.step'}
            />
          )}

          {artType === 'gis' && (
            <GisViewer
              fullContent={artifact?.full_content || (blocks && blocks.length ? blocks.map(b => b.content || '').join('\n') : '')}
              artifact={artifact}
              filename={artifact?.filename || 'map.geojson'}
            />
          )}

          {artType === 'engineering_data' && (
            <LogicViewer
              fullContent={artifact?.full_content || (blocks && blocks.length ? blocks.map(b => b.content || '').join('\n') : '')}
              artifact={artifact}
              filename={artifact?.filename || 'program.l5x'}
            />
          )}

          {(artType === 'audio' || artType === 'video') && (
            <MediaViewer
              artifact={artifact}
              token={currentToken}
            />
          )}
        </main>
      </div>

      {/* ── Block & Document Commit Diff Modal ── */}
      {historyModal && (
        <BlockHistoryModal
          artifactId={artifact?.id}
          blockKey={historyModal.blockKey}
          blockTitle={historyModal.blockTitle}
          token={currentToken}
          onClose={() => setHistoryModal(null)}
          onRollbackComplete={() => loadArtifact(artifact?.id, currentToken)}
        />
      )}
    </div>
  );
}

export class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Canvas ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="canvas-root"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            background: 'var(--bg-main, #0d1117)',
            color: 'var(--text-main, #f3f4f6)',
            textAlign: 'center',
            height: '100%',
            minHeight: '300px'
          }}
        >
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '28px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ color: '#f87171', fontWeight: 650, fontSize: '1rem', marginBottom: '8px' }}>
              Canvas Rendering Error
            </div>
            <p style={{ color: '#fca5a5', fontSize: '0.82rem', marginBottom: '18px', wordBreak: 'break-word', lineHeight: 1.5 }}>
              {this.state.error?.message || 'A runtime error occurred while rendering the document canvas.'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="canvas-btn canvas-btn-secondary"
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{ padding: '6px 16px', fontSize: '0.82rem' }}
              >
                Try Again
              </button>
              {this.props.onClose && (
                <button
                  className="canvas-btn canvas-btn-secondary"
                  onClick={this.props.onClose}
                  style={{ padding: '6px 16px', fontSize: '0.82rem' }}
                >
                  Close Canvas
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Canvas(props) {
  return (
    <CanvasErrorBoundary onClose={props.onClose}>
      <CanvasInner {...props} />
    </CanvasErrorBoundary>
  );
}
