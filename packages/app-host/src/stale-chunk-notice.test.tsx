import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStaleChunkNotice } from './stale-chunk-notice';

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/fixture-chunk.js');
const NOTICE = '새 버전이 배포되었습니다';
const rejection = (reason: unknown) => Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason });
let remove: (() => void) | null = null;
const install = (reload = vi.fn()) => { remove = installStaleChunkNotice(reload); return reload; };
afterEach(() => { remove?.(); remove = null; cleanup(); });

describe('stale chunk notice (#1981)', () => {
  it('vite:preloadError shows one reload notice without the error text and is not prevented (Vite must still rethrow the import rejection to the local boundary); the button reloads', async () => {
    const reload = install();
    const event = new Event('vite:preloadError', { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(await screen.findByText(NOTICE, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/fixture-chunk/)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '새로 고침' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('an unhandled chunk-load rejection shows the notice, and repeated failures keep a single notice', async () => {
    install();
    act(() => { window.dispatchEvent(rejection(chunkError())); window.dispatchEvent(rejection(chunkError())); window.dispatchEvent(new Event('vite:preloadError')); });
    expect(await screen.findAllByRole('button', { name: '새로 고침' })).toHaveLength(1);
  });

  it('an unrelated rejection shows nothing', () => {
    install();
    act(() => { window.dispatchEvent(rejection(new Error('fixture failure'))); window.dispatchEvent(rejection('Failed to fetch dynamically imported module')); });
    expect(screen.queryByRole('button', { name: '새로 고침' })).toBeNull();
  });

  it('the returned remover drops the listeners and the notice, so nothing leaks into the next run', async () => {
    install();
    act(() => { window.dispatchEvent(new Event('vite:preloadError')); });
    await screen.findByRole('button', { name: '새로 고침' });
    act(() => { remove?.(); remove = null; });
    expect(screen.queryByRole('button', { name: '새로 고침' })).toBeNull();
    act(() => { window.dispatchEvent(new Event('vite:preloadError')); });
    expect(screen.queryByRole('button', { name: '새로 고침' })).toBeNull();
  });
});
