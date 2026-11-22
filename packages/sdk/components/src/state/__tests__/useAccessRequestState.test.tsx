import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AccessRequestState } from '@ap/kernel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useAccessRequestState } from '../useAccessRequestState';

const ready: AccessRequestState = { pending: false, statusHref: null, requestHref: '/requests' };
const checking: AccessRequestState = { ...ready, read: 'checking' };

function Entry({ state, open }: { state: AccessRequestState; open?: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const request = useAccessRequestState(state, { lang: 'en', kind: 'link', container });
  return <div ref={container}>
    {request.phase === 'checking'
      ? <button type="button" {...request.focusProps} {...request.busyProps}>{request.label}</button>
      : request.href && <a href={request.href} {...request.focusProps} onClick={event => { event.preventDefault(); open?.(); }}>{request.label}</a>}
    {request.readMessage && <p>{request.readMessage}</p>}
    {request.showRetry && <button type="button" {...request.focusProps} {...request.retryProps}>{request.retryLabel}</button>}
    <button type="button">Elsewhere</button>
  </div>;
}

describe('useAccessRequestState', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('supplies a focusable, inert busy action and the shared checking message', () => {
    const open = vi.fn();
    render(<Entry state={checking} open={open} />);
    const button = screen.getByRole('button', { name: 'Request access' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('Checking the state of your request.')).toBeVisible();
  });

  it('ends a stalled check at eight seconds and gives a retry its own bounded read', () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    render(<Entry state={{ ...checking, retry }} />);
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByRole('button', { name: 'Request access' })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Could not check the state of your request.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    retryButton.focus();
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retryButton).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersByTime(8000));
    expect(retryButton).not.toHaveAttribute('aria-busy');
    expect(retryButton).toHaveFocus();
  });

  it('leaves an answered read alone when the original deadline passes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Entry state={checking} />);
    rerender(<Entry state={ready} />);
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByRole('link', { name: 'Request access' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it.each([false, true])('gives a new read its own deadline when the old read was retried: %s', retried => {
    vi.useFakeTimers();
    const retryFirst = vi.fn();
    const first = { ...checking, retry: retryFirst, readKey: 'first-system' };
    const second = { ...checking, retry: vi.fn(), readKey: 'second-system' };
    const { rerender } = render(<Entry state={first} />);
    if (retried) {
      act(() => vi.advanceTimersByTime(8000));
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retryFirst).toHaveBeenCalledOnce();
    }
    act(() => vi.advanceTimersByTime(7999));
    rerender(<Entry state={second} />);
    expect(screen.getByRole('button', { name: 'Request access' })).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByRole('button', { name: 'Request access' })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(second.retry).toHaveBeenCalledOnce();
    expect(retryFirst).toHaveBeenCalledTimes(retried ? 1 : 0);
  });

  it('leaves focus on the body after explicitly blurring a control before its replacement', async () => {
    const { rerender } = render(<Entry state={ready} />);
    const link = screen.getByRole('link', { name: 'Request access' });
    link.focus();
    link.blur();
    await act(async () => {});
    rerender(<Entry state={checking} />);
    expect(document.body).toHaveFocus();
  });

  it('hands off focus as the action changes and leaves focus the user moved elsewhere', () => {
    const { rerender } = render(<Entry state={ready} />);
    screen.getByRole('link', { name: 'Request access' }).focus();
    rerender(<Entry state={checking} />);
    expect(screen.getByRole('button', { name: 'Request access' })).toHaveFocus();

    const pending = { ...ready, pending: true, statusHref: '/status' };
    rerender(<Entry state={pending} />);
    expect(screen.getByRole('link', { name: 'View my access requests' })).toHaveFocus();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    rerender(<Entry state={ready} />);
    expect(elsewhere).toHaveFocus();
  });
});
