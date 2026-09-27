import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps Tab focus inside a dialog, moves focus into it on open, and closes it
 * on Escape. Originally lived only inside the wine-detail page's own Dialog
 * component (B24) - every other dialog in the app (add wine, open bottle,
 * repeat purchase, move to pocket, pocket creation, JSON import) had
 * `role="dialog"` without any of the keyboard behavior that role implies, so
 * Tab could walk straight through to the page underneath.
 */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const node = containerRef.current;
    if (!node) return undefined;

    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (entry) => !entry.hasAttribute('disabled')
    );
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

      if (event.key !== 'Tab' || focusables.length === 0) return;

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

  return containerRef;
}
