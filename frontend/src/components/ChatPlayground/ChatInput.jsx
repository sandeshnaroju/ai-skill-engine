import React from 'react';
import { Send, FileText, X, Paperclip } from 'lucide-react';

export default function ChatInput({
  attachedFiles,
  setAttachedFiles,
  fileInputRef,
  handleFileChange,
  loading,
  uploading,
  input,
  setInput,
  handleSend,
  handleStop
}) {
  return (
    <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)', flexShrink: 0 }}>
      {/* File previews */}
      {attachedFiles.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {attachedFiles.map((file, idx) => (
            <div key={idx} style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '6px 12px 6px 8px',
              fontSize: '0.8rem',
              color: 'var(--text-sub)'
            }}>
              {file.type.startsWith('image/') ? (
                <img src={file.url} alt={file.name} style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
              ) : (
                <FileText size={16} color="var(--text-muted)" />
              )}
              <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (loading) {
            handleStop();
          } else {
            handleSend();
          }
        }}
        style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn-outline"
          onClick={() => fileInputRef.current.click()}
          disabled={loading || uploading}
          style={{ padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Attach images or documents"
        >
          <Paperclip size={18} />
        </button>
        <input
          type="text"
          placeholder="Ask a question (e.g. calculate compound interest in Python or check uptime)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          className={loading ? "btn-outline" : "btn-gradient"}
          disabled={(!loading && !input.trim() && attachedFiles.length === 0) || uploading}
          style={loading ? {
            color: 'var(--accent-rose)',
            borderColor: 'rgba(244, 63, 94, 0.4)',
            background: 'rgba(244, 63, 94, 0.06)',
            padding: '10px 18px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: '600'
          } : undefined}
        >
          {uploading ? 'Uploading...' : (
            loading ? (
              <><X size={16} /> Stop</>
            ) : (
              <><Send size={16} /> Send</>
            )
          )}
        </button>
      </form>
    </div>
  );
}
