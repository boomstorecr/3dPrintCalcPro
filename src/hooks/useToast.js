import { useCallback, useContext, useMemo } from 'react';
import { ToastContext } from '../contexts/ToastContext';

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  const { addToast } = context;

  const success = useCallback(
    (message) => addToast({ type: 'success', message }),
    [addToast]
  );

  const error = useCallback(
    (message) => addToast({ type: 'error', message }),
    [addToast]
  );

  const info = useCallback(
    (message) => addToast({ type: 'info', message }),
    [addToast]
  );

  return useMemo(() => ({ success, error, info }), [success, error, info]);
}
