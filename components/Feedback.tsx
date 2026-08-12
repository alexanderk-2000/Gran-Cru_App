import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/**
 * App-wide toasts and confirmations.
 *
 * 33 call sites used the browser's blocking `alert()`/`confirm()` - every
 * import result, every failed save, every delete confirmation froze the tab
 * behind a native dialog with no styling and no way to act on anything else
 * while it was up. One screen (the wine detail) had already built its own
 * toast (`InlineToast`, tone-coloured, auto-dismissing) - this lifts that
 * design here so every screen shares it instead of reinventing it, and adds
 * a promise-based confirm dialog as the `window.confirm` replacement.
 */

export type ToastTone = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in red for destructive actions (delete, purge). */
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface FeedbackContextValue {
  showToast: (text: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const TOAST_DURATION_MS = 4200;

const toastToneClass: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-stone-300 bg-white text-stone-700'
};

const ToastIcon: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  success: Check,
  error: AlertTriangle,
  info: Info
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(0);

  const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setToasts((previous) => [...previous, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const resolveConfirm = useCallback(
    (value: boolean) => {
      confirmState?.resolve(value);
      setConfirmState(null);
    },
    [confirmState]
  );

  const value = useMemo<FeedbackContextValue>(() => ({ showToast, confirm }), [showToast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed left-1/2 top-6 z-[200] flex w-[min(92vw,560px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = ToastIcon[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${toastToneClass[toast.tone]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1 text-sm leading-5">{toast.text}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-1 text-current/70 hover:bg-black/5"
                aria-label="Hinweis schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-charcoal/40 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-label={confirmState.title}
          onClick={(event) => {
            if (event.target === event.currentTarget) resolveConfirm(false);
          }}
        >
          <div className="w-full max-w-sm rounded-[1.5rem] border border-burgundy/10 bg-white p-6 shadow-2xl">
            <h3 className="font-serif text-xl text-charcoal">{confirmState.title}</h3>
            {confirmState.description && (
              <p className="mt-2 text-sm text-stone-gray">{confirmState.description}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                autoFocus
                className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-stone-600 transition-all hover:border-stone-300"
              >
                {confirmState.cancelLabel || 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-all ${
                  confirmState.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-burgundy hover:bg-burgundy-light'
                }`}
              >
                {confirmState.confirmLabel || 'Bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

/** Throws outside FeedbackProvider on purpose - every screen needs it mounted, not a silent no-op fallback. */
export const useFeedback = (): FeedbackContextValue => {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used within a FeedbackProvider');
  return context;
};

export const useToast = (): FeedbackContextValue['showToast'] => useFeedback().showToast;
export const useConfirm = (): FeedbackContextValue['confirm'] => useFeedback().confirm;
