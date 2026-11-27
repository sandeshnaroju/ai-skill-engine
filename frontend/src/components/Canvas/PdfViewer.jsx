import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Printer,
  ExternalLink,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { artifactsApi } from '../../api';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function contentToPdfBlob(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  if (trimmed.startsWith('data:application/pdf')) {
    const base64Part = trimmed.split(',')[1] || '';
    const bin = atob(base64Part);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  }

  if (trimmed.startsWith('JVBERi0')) {
    // Raw base64 encoded %PDF-
    const bin = atob(trimmed);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  }

  if (trimmed.startsWith('%PDF-')) {
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  return null;
}

export default function PdfViewer({
  artifact,
  fullContent,
  token,
  filename = 'document.pdf',
  theme = 'dark'
}) {
  const iframeRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileSize, setFileSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ percent: 0, loadedBytes: 0, totalBytes: 0 });
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    let activeObjectUrl = null;
    const controller = new AbortController();

    async function loadPdf() {
      setLoading(true);
      setError(null);
      setProgress({ percent: 0, loadedBytes: 0, totalBytes: 0 });

      try {
        // 1. Check inline fullContent first
        const inlineBlob = contentToPdfBlob(fullContent);
        if (inlineBlob) {
          activeObjectUrl = URL.createObjectURL(inlineBlob);
          if (!cancelled) {
            setBlobUrl(activeObjectUrl);
            setFileSize(inlineBlob.size);
            setLoading(false);
          }
          return;
        }

        // 2. Otherwise stream from artifact media_url / export endpoint
        const sourceUrl =
          artifact?.media_url ||
          (artifact?.id ? artifactsApi.getExportUrl(artifact.id, token) : '');

        if (!sourceUrl) {
          throw new Error('No PDF source URL or content available.');
        }

        const resp = await fetch(sourceUrl, { signal: controller.signal });
        if (!resp.ok) {
          throw new Error(`Failed to fetch PDF (HTTP ${resp.status})`);
        }

        const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10) || 0;

        if (resp.body && typeof resp.body.getReader === 'function') {
          const reader = resp.body.getReader();
          const chunks = [];
          let loadedBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loadedBytes += value.byteLength;
              if (!cancelled) {
                setProgress({
                  loadedBytes,
                  totalBytes,
                  percent: totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 50
                });
              }
            }
          }

          const pdfBlob = new Blob(chunks, { type: 'application/pdf' });
          activeObjectUrl = URL.createObjectURL(pdfBlob);
          if (!cancelled) {
            setBlobUrl(activeObjectUrl);
            setFileSize(pdfBlob.size);
            setLoading(false);
          }
        } else {
          const buf = await resp.arrayBuffer();
          const pdfBlob = new Blob([buf], { type: 'application/pdf' });
          activeObjectUrl = URL.createObjectURL(pdfBlob);
          if (!cancelled) {
            setBlobUrl(activeObjectUrl);
            setFileSize(pdfBlob.size);
            setLoading(false);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('PDF load error:', err);
        if (!cancelled) {
          setError(err.message || 'Unable to load PDF document.');
          setLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      controller.abort();
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [artifact?.id, artifact?.media_url, fullContent, token, reloadTick]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrint = () => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
      }
    } catch {
      if (blobUrl) window.open(blobUrl, '_blank');
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: isDark ? '#0b0f17' : '#f1f5f9',
        color: isDark ? '#f1f5f9' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* ── Top PDF Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(12px)',
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
          zIndex: 20,
          gap: '10px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              background: isDark ? 'rgba(239, 68, 68, 0.14)' : 'rgba(220, 38, 38, 0.1)',
              color: isDark ? '#f87171' : '#dc2626',
              fontSize: '0.76rem',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}
          >
            <FileText size={14} /> PDF DOCUMENT
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.88 }}>{filename}</span>
          {fileSize > 0 && (
            <span
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '4px',
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                opacity: 0.75
              }}
            >
              {formatBytes(fileSize)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {blobUrl && (
            <>
              <button
                onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
                title="Open PDF in New Tab"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: '0.76rem',
                  fontWeight: 550,
                  cursor: 'pointer'
                }}
              >
                <ExternalLink size={13} /> Open Tab
              </button>

              <button
                onClick={handlePrint}
                title="Print PDF"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: '0.76rem',
                  fontWeight: 550,
                  cursor: 'pointer'
                }}
              >
                <Printer size={13} /> Print
              </button>

              <button
                onClick={handleDownload}
                title="Download PDF"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 11px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Download size={13} /> Download
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main PDF Stage ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isDark ? 'rgba(11, 15, 23, 0.9)' : 'rgba(241, 245, 249, 0.9)',
              zIndex: 30
            }}
          >
            <div
              style={{
                width: '360px',
                maxWidth: '90%',
                padding: '22px',
                borderRadius: '12px',
                background: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <FileText size={20} color="#ef4444" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>Streaming PDF Document</div>
                  <div style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                    {filename} {progress.loadedBytes > 0 ? `(${formatBytes(progress.loadedBytes)})` : ''}
                  </div>
                </div>
              </div>
              <div style={{ height: '7px', width: '100%', background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress.percent || 30}%`,
                    background: 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)',
                    transition: 'width 0.15s ease'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            }}
          >
            <div
              style={{
                maxWidth: '420px',
                padding: '24px',
                borderRadius: '12px',
                background: isDark ? '#1f1315' : '#fef2f2',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                textAlign: 'center'
              }}
            >
              <AlertCircle size={32} color="#ef4444" style={{ margin: '0 auto 10px auto' }} />
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Unable to Render PDF</div>
              <p style={{ fontSize: '12px', opacity: 0.8, marginBottom: '14px' }}>{error}</p>
              <button
                onClick={() => setReloadTick((t) => t + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          </div>
        )}

        {blobUrl && !loading && !error && (
          <iframe
            ref={iframeRef}
            src={`${blobUrl}#toolbar=1&view=FitH`}
            title={filename}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: isDark ? '#1e293b' : '#ffffff'
            }}
          />
        )}
      </div>
    </div>
  );
}
