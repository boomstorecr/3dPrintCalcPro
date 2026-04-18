import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const ToastContext = createContext(null);

const DEFAULT_DURATION = 4000;
const MAX_VISIBLE_TOASTS = 5;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounterRef = useRef(0);
  const timeoutMapRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));

    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    ({ type, message, duration = DEFAULT_DURATION }) => {
      const id = `${Date.now()}-${idCounterRef.current++}`;
      const normalizedDuration =
        typeof duration === 'number' && duration > 0 ? duration : DEFAULT_DURATION;

      setToasts((current) => {
        const nextToasts = [...current, { id, type, message, duration: normalizedDuration }];
        return nextToasts.length > MAX_VISIBLE_TOASTS
          ? nextToasts.slice(nextToasts.length - MAX_VISIBLE_TOASTS)
          : nextToasts;
      });

      const timeoutId = setTimeout(() => {
        removeToast(id);
      }, normalizedDuration);

      timeoutMapRef.current.set(id, timeoutId);
      return id;
    },
    [removeToast],
  );

  useEffect(() => {
    return () => {
      timeoutMapRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutMapRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
    }),
    [toasts, addToast, removeToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
