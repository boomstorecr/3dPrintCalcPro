import { useEffect, useState } from 'react';
import { useContext } from 'react';
import { ToastContext } from '../../contexts/ToastContext';

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm-2.707-9.293a1 1 0 011.414-1.414L10 8.586l1.293-1.293a1 1 0 011.414 1.414L11.414 10l1.293 1.293a1 1 0 01-1.414 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L8.586 10 7.293 8.707z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-8-4a1 1 0 100 2 1 1 0 000-2zm1 4a1 1 0 10-2 0v4a1 1 0 102 0v-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const TOAST_STYLES = {
  success: {
    icon: CheckCircleIcon,
    iconClass: 'text-green-600',
    borderClass: 'border-green-500',
    bgClass: 'bg-green-50',
  },
  error: {
    icon: XCircleIcon,
    iconClass: 'text-red-600',
    borderClass: 'border-red-500',
    bgClass: 'bg-red-50',
  },
  info: {
    icon: InfoIcon,
    iconClass: 'text-blue-600',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-50',
  },
};

function ToastItem({ toast, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
  const Icon = style.icon;

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div
      role="alert"
      className={`pointer-events-auto w-80 max-w-full rounded-lg border-l-4 bg-white p-4 shadow-lg transition-all duration-300 ease-out ${style.borderClass} ${style.bgClass} ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${style.iconClass}`}>
          <Icon />
        </span>

        <p className="flex-1 text-sm text-slate-800">{toast.message}</p>

        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="rounded p-1 text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label="Close notification"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Toast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('Toast must be used within a ToastProvider');
  }

  const { toasts, removeToast } = context;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  );
}
