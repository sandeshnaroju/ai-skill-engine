import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Music,
  Video,
  Download,
  Repeat,
  PictureInPicture2,
  AlertCircle,
  Loader2,
  Gauge,
  RefreshCw,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Camera,
} from 'lucide-react';
import { artifactsApi } from '../../api';
import ModernSelect from './XerViewer/ModernSelect';

const VIDEO_EXT_RE = /\.(mp4|webm|mov|avi|mkv|m4v|ogv)$/i;

const SPEED_OPTIONS = [
  { value: '0.5', label: '0.5x' },
  { value: '0.75', label: '0.75x' },
  { value: '1', label: '1.0x' },
  { value: '1.25', label: '1.25x' },
  { value: '1.5', label: '1.5x' },
  { value: '2', label: '2.0x' },
];

const EQ_BAR_HEIGHTS = [38, 68, 52, 86, 62, 94, 48, 78, 56, 88, 44, 72, 60, 82, 46, 64];

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function MediaViewer({ artifact, token, theme = 'dark' }) {
  const isDark = theme !== 'light';
  const mediaRef = useRef(null);

  const [playbackRate, setPlaybackRate] = useState('1');
  const [loop, setLoop] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [metadata, setMetadata] = useState({ duration: null, width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [probedBytes, setProbedBytes] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const inlineDataUri = useMemo(() => {
    const raw = typeof artifact?.full_content === 'string' ? artifact.full_content.trim() : '';
    if (/^data:(video|audio)\//i.test(raw)) return raw;
    return '';
  }, [artifact?.full_content]);

  const isVideo = useMemo(() => {
    if (artifact?.artifact_type === 'video') return true;
    if (artifact?.filename && VIDEO_EXT_RE.test(artifact.filename)) return true;
    if (/^data:video\//i.test(inlineDataUri)) return true;
    return false;
  }, [artifact?.artifact_type, artifact?.filename, inlineDataUri]);

  const mediaUrl = useMemo(() => {
    if (artifact?.media_url) return artifact.media_url;
    if (inlineDataUri) return inlineDataUri;
    if (artifact?.id) return artifactsApi.getExportUrl(artifact.id, token);
    return '';
  }, [artifact?.media_url, artifact?.id, inlineDataUri, token]);

  const downloadUrl = useMemo(() => {
    if (artifact?.id) return artifactsApi.getExportUrl(artifact.id, token);
    return mediaUrl;
  }, [artifact?.id, token, mediaUrl]);

  const extBadge = useMemo(() => {
    const name = artifact?.filename || '';
    const match = name.match(/\.([a-z0-9]+)$/i);
    if (match) return match[1].toUpperCase();
    return isVideo ? 'VIDEO' : 'AUDIO';
  }, [artifact?.filename, isVideo]);

  const rawArtifactBytes = artifact?.file_size ?? artifact?.size_bytes ?? artifact?.bytes;

  // Probe Content-Length via lightweight HEAD request when artifact size metadata is absent
  useEffect(() => {
    setProbedBytes(null);
    if (rawArtifactBytes || !mediaUrl || mediaUrl.startsWith('data:') || mediaUrl.startsWith('blob:')) {
      return;
    }
    const controller = new AbortController();
    fetch(mediaUrl, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        if (!res.ok) return;
        const len = parseInt(res.headers.get('content-length') || '0', 10);
        if (Number.isFinite(len) && len > 0) setProbedBytes(len);
      })
      .catch(() => {
        // Ignore HEAD errors (CORS/unsupported)
      });
    return () => controller.abort();
  }, [mediaUrl, rawArtifactBytes]);

  const sizeLabel = useMemo(() => {
    return formatBytes(Number(rawArtifactBytes || probedBytes));
  }, [rawArtifactBytes, probedBytes]);

  useEffect(() => {
    setErrorMsg('');
    setMetadata({ duration: null, width: 0, height: 0 });
    setCurrentTime(0);
    setBufferedPercent(0);
    setIsPlaying(false);
    setIsBuffering(Boolean(mediaUrl));
  }, [mediaUrl, reloadKey]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = Number(playbackRate) || 1;
    }
  }, [playbackRate, reloadKey]);

  const updateBuffered = useCallback(() => {
    const el = mediaRef.current;
    if (!el || !el.duration || !Number.isFinite(el.duration) || el.duration <= 0) return;
    try {
      if (el.buffered && el.buffered.length > 0) {
        const end = el.buffered.end(el.buffered.length - 1);
        setBufferedPercent(Math.min(100, Math.round((end / el.duration) * 100)));
      }
    } catch {
      // Ignore buffered range errors
    }
  }, []);

  const handleLoadedMetadata = () => {
    setIsBuffering(false);
    setErrorMsg('');
    const el = mediaRef.current;
    if (!el) return;
    setMetadata({
      duration: el.duration,
      width: el.videoWidth || 0,
      height: el.videoHeight || 0,
    });
    el.playbackRate = Number(playbackRate) || 1;
    el.muted = isMuted;
    updateBuffered();
  };

  const handleMediaError = () => {
    setIsBuffering(false);
    setIsPlaying(false);
    const ext = extBadge.toLowerCase();
    const containerHint =
      ext === 'avi' || ext === 'mkv'
        ? `Browsers often lack native playback support for .${ext} containers.`
        : 'The media format or codec may not be supported by your browser, or the stream failed to load.';
    setErrorMsg(`${containerHint} You can download the file to play it locally.`);
  };

  const handleSkip = useCallback((deltaSec) => {
    const el = mediaRef.current;
    if (!el) return;
    const maxDur = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.max(0, Math.min(maxDur, (el.currentTime || 0) + deltaSec));
    setCurrentTime(el.currentTime);
  }, []);

  const handleToggleMute = useCallback(() => {
    const el = mediaRef.current;
    setIsMuted((prev) => {
      const next = !prev;
      if (el) el.muted = next;
      return next;
    });
  }, []);

  const handleTogglePiP = async () => {
    const el = mediaRef.current;
    if (!el || !isVideo || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === el) {
        await document.exitPictureInPicture();
      } else {
        await el.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP gesture/state errors
    }
  };

  const handleSnapshot = () => {
    const el = mediaRef.current;
    if (!el || !isVideo || !el.videoWidth || !el.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      const base = (artifact?.filename || 'frame').replace(/\.[^/.]+$/, '');
      link.download = `${base}_frame.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Ignore tainted canvas errors
    }
  };

  const handleKeyDown = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const el = mediaRef.current;
    if (!el) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handleSkip(-10);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleSkip(10);
    } else if (e.key === 'm' || e.key === 'M') {
      handleToggleMute();
    } else if (e.key === 'l' || e.key === 'L') {
      setLoop((prev) => !prev);
    }
  };

  const palette = isDark
    ? {
        cardBg: '#111827',
        cardBorder: 'rgba(255,255,255,0.08)',
        stageBg: '#0b1120',
        title: '#f9fafb',
        muted: '#9ca3af',
        pillBg: 'rgba(255,255,255,0.06)',
        pillBorder: 'rgba(255,255,255,0.1)',
        accentBg: 'rgba(99, 102, 241, 0.14)',
        accentText: '#818cf8',
        btnBg: 'rgba(255,255,255,0.06)',
        btnBorder: 'rgba(255,255,255,0.12)',
        btnActiveBg: 'rgba(99, 102, 241, 0.22)',
        btnActiveBorder: 'rgba(129, 140, 248, 0.5)',
        errorBg: 'rgba(239, 68, 68, 0.1)',
        errorBorder: 'rgba(239, 68, 68, 0.3)',
        errorText: '#fca5a5',
        trackBg: 'rgba(255,255,255,0.08)',
      }
    : {
        cardBg: '#ffffff',
        cardBorder: '#e2e8f0',
        stageBg: '#f8fafc',
        title: '#0f172a',
        muted: '#64748b',
        pillBg: '#f1f5f9',
        pillBorder: '#e2e8f0',
        accentBg: '#eef2ff',
        accentText: '#4f46e5',
        btnBg: '#f8fafc',
        btnBorder: '#cbd5e1',
        btnActiveBg: '#e0e7ff',
        btnActiveBorder: '#6366f1',
        errorBg: '#fef2f2',
        errorBorder: '#fecaca',
        errorText: '#b91c1c',
        trackBg: '#e2e8f0',
      };

  const durationLabel = formatDuration(metadata.duration);
  const currentTimeLabel = formatDuration(currentTime) || '0:00';
  const canPiP =
    isVideo &&
    typeof document !== 'undefined' &&
    Boolean(document.pictureInPictureEnabled) &&
    !errorMsg;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        maxWidth: '960px',
        margin: '0 auto',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        outline: 'none',
      }}
    >
      <div
        style={{
          background: palette.cardBg,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: '12px',
          padding: '24px 28px',
          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.3)' : '0 4px 16px rgba(15,23,42,0.06)',
        }}
      >
        {/* Header & Metadata Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: palette.accentBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: palette.accentText,
                flexShrink: 0,
              }}
            >
              {isVideo ? <Video size={20} /> : <Music size={20} />}
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  color: palette.title,
                  wordBreak: 'break-word',
                }}
              >
                {artifact?.title || artifact?.filename || 'Media Artifact'}
              </h3>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: '999px',
                    background: palette.pillBg,
                    border: `1px solid ${palette.pillBorder}`,
                    color: palette.muted,
                  }}
                >
                  {extBadge}
                </span>
                {durationLabel && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: palette.pillBg,
                      border: `1px solid ${palette.pillBorder}`,
                      color: palette.muted,
                    }}
                  >
                    {currentTimeLabel} / {durationLabel}
                  </span>
                )}
                {metadata.width > 0 && metadata.height > 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: palette.pillBg,
                      border: `1px solid ${palette.pillBorder}`,
                      color: palette.muted,
                    }}
                  >
                    {metadata.width} × {metadata.height}
                  </span>
                )}
                {sizeLabel && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: palette.pillBg,
                      border: `1px solid ${palette.pillBorder}`,
                      color: palette.muted,
                    }}
                  >
                    {sizeLabel}
                  </span>
                )}
                {bufferedPercent > 0 && bufferedPercent < 100 && !errorMsg && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: palette.pillBg,
                      border: `1px solid ${palette.pillBorder}`,
                      color: palette.muted,
                    }}
                  >
                    Buffered {bufferedPercent}%
                  </span>
                )}
                {isBuffering && !errorMsg && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: palette.accentText,
                    }}
                  >
                    <Loader2 size={12} className="spin" />
                    Loading stream...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Media Stage */}
        {!mediaUrl ? (
          <div
            style={{
              padding: '20px',
              borderRadius: '8px',
              background: palette.errorBg,
              border: `1px solid ${palette.errorBorder}`,
              color: palette.errorText,
              fontSize: '13px',
            }}
          >
            No media source URL is available for this artifact.
          </div>
        ) : errorMsg ? (
          <div
            style={{
              padding: '24px 20px',
              borderRadius: '8px',
              background: palette.errorBg,
              border: `1px solid ${palette.errorBorder}`,
              color: palette.errorText,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <AlertCircle size={24} />
            <div style={{ fontSize: '13px', lineHeight: 1.5, maxWidth: '480px' }}>{errorMsg}</div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: palette.btnBg,
                border: `1px solid ${palette.btnBorder}`,
                color: palette.title,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} /> Retry Stream
            </button>
          </div>
        ) : isVideo ? (
          <video
            key={`video-${reloadKey}-${mediaUrl}`}
            ref={mediaRef}
            controls
            preload="metadata"
            loop={loop}
            muted={isMuted}
            onLoadStart={() => setIsBuffering(true)}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onVolumeChange={(e) => setIsMuted(Boolean(e.currentTarget.muted))}
            onTimeUpdate={(e) => {
              setCurrentTime(e.currentTarget.currentTime || 0);
              updateBuffered();
            }}
            onProgress={updateBuffered}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleMediaError}
            style={{
              width: '100%',
              maxHeight: '540px',
              borderRadius: '8px',
              background: '#000',
              display: 'block',
            }}
            src={mediaUrl}
          >
            Your browser does not support HTML5 video.
          </video>
        ) : (
          <div
            style={{
              background: palette.stageBg,
              border: `1px solid ${palette.cardBorder}`,
              borderRadius: '10px',
              padding: '24px 20px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Lightweight reactive equalizer stage */}
            <div
              style={{
                height: '64px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {EQ_BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  style={{
                    width: '6px',
                    height: isPlaying ? `${Math.max(20, ((h + ((Math.floor(currentTime * 4) + i * 7) % 35)) % 95))}%` : `${Math.round(h * 0.45)}%`,
                    borderRadius: '999px',
                    background: isPlaying ? palette.accentText : palette.muted,
                    opacity: isPlaying ? 0.9 : 0.4,
                    transition: 'height 0.18s ease, background 0.2s ease',
                  }}
                />
              ))}
            </div>
            <audio
              key={`audio-${reloadKey}-${mediaUrl}`}
              ref={mediaRef}
              controls
              preload="metadata"
              loop={loop}
              muted={isMuted}
              onLoadStart={() => setIsBuffering(true)}
              onWaiting={() => setIsBuffering(true)}
              onCanPlay={() => setIsBuffering(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onVolumeChange={(e) => setIsMuted(Boolean(e.currentTarget.muted))}
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime || 0);
                updateBuffered();
              }}
              onProgress={updateBuffered}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleMediaError}
              style={{ width: '100%', display: 'block' }}
              src={mediaUrl}
            >
              Your browser does not support HTML5 audio.
            </audio>
          </div>
        )}

        {/* Stream Buffer Bar */}
        {mediaUrl && !errorMsg && bufferedPercent > 0 && (
          <div
            style={{
              marginTop: '10px',
              height: '3px',
              width: '100%',
              background: palette.trackBg,
              borderRadius: '999px',
              overflow: 'hidden',
            }}
            title={`Stream buffered: ${bufferedPercent}%`}
          >
            <div
              style={{
                height: '100%',
                width: `${bufferedPercent}%`,
                background: palette.accentText,
                opacity: 0.65,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        )}

        {/* Playback Toolbar */}
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleSkip(-10)}
              title="Skip back 10s (Left Arrow)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: palette.btnBg,
                border: `1px solid ${palette.btnBorder}`,
                color: palette.title,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} /> -10s
            </button>
            <button
              type="button"
              onClick={() => handleSkip(10)}
              title="Skip forward 10s (Right Arrow)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: palette.btnBg,
                border: `1px solid ${palette.btnBorder}`,
                color: palette.title,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              +10s <RotateCw size={13} />
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              title="Toggle Mute (M)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: isMuted ? palette.btnActiveBg : palette.btnBg,
                border: `1px solid ${isMuted ? palette.btnActiveBorder : palette.btnBorder}`,
                color: isMuted ? palette.accentText : palette.title,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              {isMuted ? 'Muted' : 'Audio'}
            </button>
            <ModernSelect
              value={playbackRate}
              onChange={(val) => setPlaybackRate(val)}
              options={SPEED_OPTIONS}
              icon={Gauge}
              labelPrefix="Speed"
              isDark={isDark}
              minWidth="120px"
            />
            <button
              type="button"
              onClick={() => setLoop((prev) => !prev)}
              title="Toggle Loop (L)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: loop ? palette.btnActiveBg : palette.btnBg,
                border: `1px solid ${loop ? palette.btnActiveBorder : palette.btnBorder}`,
                color: loop ? palette.accentText : palette.title,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Repeat size={13} />
              Loop {loop ? 'On' : 'Off'}
            </button>
            {canPiP && (
              <button
                type="button"
                onClick={handleTogglePiP}
                title="Picture-in-Picture"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: palette.btnBg,
                  border: `1px solid ${palette.btnBorder}`,
                  color: palette.title,
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <PictureInPicture2 size={13} />
                PiP
              </button>
            )}
            {isVideo && !errorMsg && metadata.width > 0 && (
              <button
                type="button"
                onClick={handleSnapshot}
                title="Capture Current Frame (PNG)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: palette.btnBg,
                  border: `1px solid ${palette.btnBorder}`,
                  color: palette.title,
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Camera size={13} />
                Frame
              </button>
            )}
          </div>

          {downloadUrl && (
            <a
              href={downloadUrl}
              download={artifact?.filename || 'media'}
              className="canvas-btn canvas-btn-primary"
              style={{ textDecoration: 'none' }}
            >
              <Download size={14} /> Download Media File
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
