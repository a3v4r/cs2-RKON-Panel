"use client";

import React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tiny app-wide toasts: success fades fast, errors stay a bit and close on click.
// Errors must never get lost: every RCON action in the panel answers with one of these.

type ToastType = 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const SUCCESS_MS = 2500;
const ERROR_MS = 8000;
const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (type: ToastType, message: string) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, type, message }].slice(-MAX_TOASTS));
      setTimeout(() => dismiss(id), type === 'success' ? SUCCESS_MS : ERROR_MS);
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (message: string) => show('success', message),
      error: (message: string) => show('error', message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Bottom centre: visible on phones (thumb zone) and desktop alike, never blocks content */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 cursor-pointer',
              t.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-300'
                : 'border-red-500/40 bg-red-950/90 text-red-300',
            )}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          >
            {t.type === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            <X size={14} className="mt-0.5 shrink-0 opacity-50" />
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
