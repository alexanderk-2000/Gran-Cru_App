// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useFocusTrap } from '../../hooks/useFocusTrap.ts';

const TestDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [open, setOpen] = useState(true);
  const ref = useFocusTrap<HTMLDivElement>(open, () => {
    setOpen(false);
    onClose();
  });

  if (!open) return null;

  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <input type="text" placeholder="First field" />
      <button type="button">Middle</button>
      <button type="button">Last</button>
    </div>
  );
};

afterEach(() => {
  cleanup();
});

describe('useFocusTrap', () => {
  // The regression this guards (B24): only the wine-detail page's own dialog
  // had a focus trap - every other modal let Tab walk straight through to
  // the page underneath, and Escape did nothing.
  it('moves focus into the first field when it opens', () => {
    render(<TestDialog onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('First field')).toHaveFocus();
  });

  it('wraps Tab from the last focusable back to the first', () => {
    render(<TestDialog onClose={vi.fn()} />);
    screen.getByRole('button', { name: 'Last' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByPlaceholderText('First field')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(<TestDialog onClose={vi.fn()} />);
    screen.getByPlaceholderText('First field').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
