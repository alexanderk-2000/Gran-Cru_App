import { memo, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ToastMessage } from '../toast.ts';

export const InlineToast = memo(function InlineToast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 3600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const colorClass =
    message.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : message.tone === 'info'
        ? 'border-stone-300 bg-white text-stone-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className="fixed left-1/2 top-6 z-[80] w-[min(92vw,560px)] -translate-x-1/2">
      <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${colorClass}`}>
        <p className="text-sm leading-5">{message.text}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-current/70 hover:bg-black/5"
          aria-label="Hinweis schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
