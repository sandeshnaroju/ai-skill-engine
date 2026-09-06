import React from 'react';
import { Music, Video, Download } from 'lucide-react';
import { artifactsApi } from '../../api';

export default function MediaViewer({ artifact, token }) {
  const isVideo = artifact?.artifact_type === 'video' || artifact?.filename?.endsWith('.mp4');
  const mediaUrl = artifact?.media_url || (artifact?.id ? artifactsApi.getExportUrl(artifact.id, token) : '');

  return (
    <div style={{ width: '100%', maxWidth: '720px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '32px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
          {isVideo ? (
            <div style={{ padding: '16px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
              <Video size={36} />
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <Music size={36} />
            </div>
          )}
        </div>

        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f9fafb', marginBottom: '8px' }}>
          {artifact.title || artifact.filename}
        </h3>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '24px' }}>
          Generated {isVideo ? 'video' : 'audio'} stream
        </p>

        {isVideo ? (
          <video
            controls
            style={{ width: '100%', maxHeight: '420px', borderRadius: '8px', background: '#000' }}
            src={mediaUrl}
          >
            Your browser does not support HTML5 video.
          </video>
        ) : (
          <audio
            controls
            style={{ width: '100%', marginTop: '16px' }}
            src={mediaUrl}
          >
            Your browser does not support HTML5 audio.
          </audio>
        )}

        <div style={{ marginTop: '24px' }}>
          <a
            href={artifactsApi.getExportUrl(artifact.id, token)}
            download={artifact.filename}
            className="canvas-btn canvas-btn-primary"
            style={{ textDecoration: 'none' }}
          >
            <Download size={14} /> Download Media File
          </a>
        </div>
      </div>
    </div>
  );
}
