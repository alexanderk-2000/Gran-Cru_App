import React, { memo, useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';

export const Dialog = memo(function Dialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidthClassName = 'max-w-md'
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useMemo(() => `dialog-${title.toLowerCase().replace(/\s+/g, '-')}`, [title]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const node = dialogRef.current;
    if (!node) return undefined;

    const selectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(selectors)).filter((entry) => !entry.hasAttribute('disabled'));
    const fieldFocusables = focusables.filter((entry) => {
      const tag = entry.tagName.toLowerCase();
      return tag === 'input' || tag === 'select' || tag === 'textarea';
    });
    const first = fieldFocusables[0] || focusables[0];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      if (focusables.length === 0) return;

      const activeElement = document.activeElement;
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${maxWidthClassName} rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.20)]`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id={titleId} className="font-serif text-2xl text-stone-900">{title}</h3>
            {subtitle && <p className="mt-0.5 max-w-[280px] truncate font-mono text-xs text-stone-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-stone-500 hover:bg-stone-100" aria-label="Dialog schließen">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
});
