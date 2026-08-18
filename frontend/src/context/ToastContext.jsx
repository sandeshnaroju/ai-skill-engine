import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X, Trash2 } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(({ type = 'error', title, message, status = null, duration = 5000 }) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    const newToast = { id, type, title, message, status, duration };

    setToasts((prev) => [...prev.slice(-4), newToast]); // Limit to max 5 visible toasts

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showError = useCallback((message, status = null, title = 'Error') => {
    showToast({ type: 'error', title, message, status });
  }, [showToast]);

  const showSuccess = useCallback((message, title = 'Success') => {
    showToast({ type: 'success', title, message });
  }, [showToast]);

  const showWarning = useCallback((message, title = 'Warning') => {
    showToast({ type: 'warning', title, message });
  }, [showToast]);

  const showInfo = useCallback((message, title = 'Notification') => {
    showToast({ type: 'info', title, message });
  }, [showToast]);

  const confirmAction = useCallback(({ title = 'Confirm Action', message, confirmText = 'Delete', type = 'danger', onConfirm }) => {
    setConfirmModal({
      title,
      message,
      confirmText,
      type,
      onConfirm: async () => {
        setConfirmModal(null);
        await onConfirm();
      },
      onCancel: () => setConfirmModal(null)
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showWarning, showInfo, confirmAction, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
      {confirmModal && <GlobalConfirmModal modal={confirmModal} />}
    </ToastContext.Provider>
  );
}

function GlobalConfirmModal({ modal }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      animation: 'toastSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
    }}>
      <div className="glass-box" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '24px',
        borderRadius: '16px',
        border: modal.type === 'danger' ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {modal.type === 'danger' ? (
              <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.25)', padding: '8px', borderRadius: '10px' }}>
                <AlertTriangle size={20} color="var(--accent-rose)" />
              </div>
            ) : (
              <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', padding: '8px', borderRadius: '10px' }}>
                <Info size={20} color="var(--primary-cyan)" />
              </div>
            )}
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)', margin: 0 }}>
              {modal.title}
            </h3>
          </div>
          <button className="toast-close-btn" onClick={modal.onCancel}>
            <X size={16} />
          </button>
        </div>

        <p style={{ color: 'var(--text-sub)', fontSize: '0.88rem', margin: 0, lineHeight: '1.5' }}>
          {modal.message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button className="btn-outline" onClick={modal.onCancel} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Cancel
          </button>
          <button
            className="btn-gradient"
            onClick={modal.onConfirm}
            style={{
              padding: '8px 18px',
              fontSize: '0.85rem',
              background: modal.type === 'danger' ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : undefined,
              borderColor: modal.type === 'danger' ? '#f43f5e' : undefined
            }}
          >
            {modal.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastCard({ toast, onClose }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle size={18} color="var(--primary-emerald)" />;
      case 'warning':
        return <AlertTriangle size={18} color="#f59e0b" />;
      case 'info':
        return <Info size={18} color="var(--primary-cyan)" />;
      case 'error':
      default:
        return <AlertCircle size={18} color="var(--accent-rose)" />;
    }
  };

  return (
    <div className={`toast-card toast-${toast.type}`}>
      <div className="toast-header">
        {getIcon()}
        <span className="toast-title">{toast.title || 'Notification'}</span>
        {toast.status && <span className="toast-badge">HTTP {toast.status}</span>}
        <button className="toast-close-btn" onClick={onClose} aria-label="Close notification">
          <X size={15} />
        </button>
      </div>
      {toast.message && <div className="toast-message">{toast.message}</div>}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
