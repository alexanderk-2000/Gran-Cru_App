// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackProvider, useConfirm, useToast } from '../../components/Feedback.tsx';

const ToastHarness: React.FC = () => {
  const showToast = useToast();
  return (
    <button type="button" onClick={() => showToast('Gespeichert.', 'success')}>
      Trigger
    </button>
  );
};

const ConfirmHarness: React.FC<{ onResult: (value: boolean) => void }> = ({ onResult }) => {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirm({ title: 'Löschen?', description: 'Wirklich löschen.', destructive: true });
        onResult(result);
      }}
    >
      Ask
    </button>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FeedbackProvider', () => {
  it('renders a toast triggered from a deeply nested consumer', () => {
    render(
      <FeedbackProvider>
        <ToastHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    expect(screen.getByText('Gespeichert.')).toBeInTheDocument();
  });

  it('auto-dismisses a toast after its duration', () => {
    vi.useFakeTimers();
    render(
      <FeedbackProvider>
        <ToastHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(screen.getByText('Gespeichert.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Gespeichert.')).not.toBeInTheDocument();
  });

  it('dismisses a toast when its close button is clicked', () => {
    render(
      <FeedbackProvider>
        <ToastHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));

    expect(screen.queryByText('Gespeichert.')).not.toBeInTheDocument();
  });

  // The regression this guards: window.confirm() blocked the whole tab with no
  // styling and no way to see anything else while it was up. confirm() must
  // resolve to a real boolean so callers can branch on the answer exactly like
  // they did on window.confirm's return value.
  it('resolves true when the confirm dialog is accepted', async () => {
    const onResult = vi.fn();
    render(
      <FeedbackProvider>
        <ConfirmHarness onResult={onResult} />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByText('Löschen?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByText('Löschen?')).not.toBeInTheDocument();
  });

  it('resolves false when cancelled', async () => {
    const onResult = vi.fn();
    render(
      <FeedbackProvider>
        <ConfirmHarness onResult={onResult} />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('throws when used outside a FeedbackProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ToastHarness />)).toThrow('useFeedback must be used within a FeedbackProvider');
    consoleError.mockRestore();
  });
});
