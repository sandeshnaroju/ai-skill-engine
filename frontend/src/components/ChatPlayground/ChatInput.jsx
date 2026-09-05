import React, { useRef, useEffect } from 'react';
import { Send, FileText, X, Paperclip, Square, Sparkles, Image } from 'lucide-react';

export default function ChatInput({
  attachedFiles = [],
  setAttachedFiles,
  fileInputRef,
  handleFileChange,
  loading,
  uploading,
  input,
  setInput,
  handleSend,
  handleStop,
  activeModelName = '',
  activeAppName = ''
}) {
  const textareaRef = useRef(null);

  // Auto-grow textarea height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (loading) {
        handleStop && handleStop();
      } else if (input.trim() || attachedFiles.length > 0) {
        handleSend();
      }
    }
  };

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 20px 20px 20px',
      background: 'transparent',
      flexShrink: 0
    }}>
      {/* Floating Modern Pill Box */}
      <div style={{
        width: '100%',
        maxWidth: '820px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
        padding: '12px 16px 10px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        transition: 'border-color 0.2s, box-shadow 0.2s'
      }}>
        {/* Attached Files Preview Chips */}
        {attachedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '4px' }}>
            {attachedFiles.map((file, idx) => (
              <div key={idx} style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '4px 10px 4px 6px',
                fontSize: '0.78rem',
                color: 'var(--text-main)'
              }}>
                {file.type?.startsWith('image/') ? (
                  <img
                    src={file.url || file.base64}
                    alt={file.name}
                    style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                ) : (
                  <FileText size={15} color="var(--primary-violet)" />
                )}
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}>
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    marginLeft: '2px'
                  }}
                  title="Remove file"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Multiline Auto-Growing Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask AI Skill Engine anything, create presentations, run Python code, or draft documents..."
          rows={1}
          disabled={uploading}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-main)',
            fontSize: '0.94rem',
            lineHeight: '1.5',
            resize: 'none',
            fontFamily: 'inherit',
            maxHeight: '200px',
            minHeight: '26px'
          }}
        />

        {/* Input Bar Bottom Toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.04)'
        }}>
          {/* Left: Attachment & Context badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={loading || uploading}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.78rem',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-sub)'
              }}
              title="Attach files or images"
            >
              <Paperclip size={14} />
              <span>Attach</span>
            </button>

            {uploading && (
              <span style={{ fontSize: '0.74rem', color: 'var(--primary-violet)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={12} className="spin" /> Uploading...
              </span>
            )}
          </div>

          {/* Right: Circular Send / Stop Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (loading) {
                  handleStop && handleStop();
                } else {
                  handleSend && handleSend();
                }
              }}
              disabled={(!loading && !input.trim() && attachedFiles.length === 0) || uploading}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: (!loading && !input.trim() && attachedFiles.length === 0) || uploading ? 'not-allowed' : 'pointer',
                background: loading
                  ? 'var(--accent-rose, #f43f5e)'
                  : (input.trim() || attachedFiles.length > 0
                    ? 'linear-gradient(135deg, var(--primary-violet, #8b5cf6), var(--primary-indigo, #6366f1))'
                    : 'rgba(255, 255, 255, 0.08)'),
                color: '#ffffff',
                boxShadow: (input.trim() || attachedFiles.length > 0) ? '0 2px 10px rgba(139, 92, 246, 0.4)' : 'none',
                transition: 'all 0.2s ease',
                opacity: (!loading && !input.trim() && attachedFiles.length === 0) || uploading ? 0.4 : 1
              }}
              title={loading ? 'Stop generation' : 'Send message (Enter)'}
            >
              {loading ? (
                <Square size={14} fill="#ffffff" />
              ) : (
                <Send size={15} style={{ transform: 'translateX(1px)' }} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Subtle Bottom Disclaimer */}
      <div style={{
        marginTop: '8px',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }}>
        AI Skill Engine can execute tools and generate canvas artifacts. Verify sensitive code and calculations.
      </div>
    </div>
  );
}
