/**
 * copyText / useCopyLink (#300): link copy that reports success only after the write completed, and names cause and
 * action on failure (06 §26). jsdom has no `isSecureContext` or `navigator.clipboard`, so each test installs exactly
 * the environment it describes — the same style as PlatformDataTable.copy.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBasePathLocation, I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { copyText, useCopyLink } from './copyText';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';

function secureClipboard() {
  const clipboard = { writeText: vi.fn(async () => {}) };
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  return clipboard;
}
function insecure() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  Reflect.deleteProperty(navigator, 'clipboard');
}
/**
 * `document.execCommand('copy')` as real Chromium runs it: the copy event is dispatched on `<body>` (bubbling,
 * cancelable), so a document-level capture listener receives it and fills `clipboardData`. The command's return
 * value (`returns`) and whether the event fires are configured independently — a command can report success while
 * dispatching nothing, exactly the case copyText must treat as failure.
 */
function fakeExecCommand({ returns = true, fires = true, clipboardData = true }: { returns?: boolean; fires?: boolean; clipboardData?: boolean } = {}) {
  const data = new Map<string, string>();
  const events: (Event & { clipboardData?: { setData: (t: string, v: string) => void } })[] = [];
  const execCommand = vi.fn((command: string) => {
    if (command !== 'copy') return false;
    if (fires) {
      const event = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { setData: (t: string, v: string) => void } };
      if (clipboardData) event.clipboardData = { setData: (t, v) => { data.set(t, v); } };
      events.push(event);
      document.body.dispatchEvent(event);
    }
    return returns;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { data, events, execCommand };
}
function throwingExecCommand() {
  const execCommand = vi.fn(() => { throw new Error('execCommand blew up'); });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { execCommand };
}

describe('copyText (#300)', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
    vi.restoreAllMocks();
  });

  it('(a) secure context: awaits navigator.clipboard.writeText and resolves true', async () => {
    const clipboard = secureClipboard();
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    await expect(copyText('https://ap.example/metrics/m1')).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('https://ap.example/metrics/m1');
    expect(execCommand).not.toHaveBeenCalled(); // no execCommand detour in a secure context
  });

  it('(b) secure context: a writeText rejection resolves false', async () => {
    const clipboard = secureClipboard();
    clipboard.writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('(c) insecure context: execCommand that fires a copy event carrying the exact text/plain resolves true', async () => {
    insecure();
    const { data, events } = fakeExecCommand();
    await expect(copyText('link-text')).resolves.toBe(true);
    expect(data.get('text/plain')).toBe('link-text');
    expect(events).toHaveLength(1);
    expect(events[0]?.defaultPrevented).toBe(true); // the listener must cancel the event, not only fill it
  });

  it('(d) insecure context: execCommand true without a copy event — or an event without clipboardData — resolves false', async () => {
    insecure();
    const silent = fakeExecCommand({ fires: false }); // command succeeds but dispatches no copy event
    await expect(copyText('x')).resolves.toBe(false);
    expect(silent.execCommand).toHaveReturnedWith(true);
    expect(silent.data.size).toBe(0);
    const bare = fakeExecCommand({ clipboardData: false });
    await expect(copyText('x')).resolves.toBe(false);
    expect(bare.execCommand).toHaveBeenCalledTimes(1);
  });

  it('(e) removes the copy listener after success, refusal and a throwing execCommand', async () => {
    insecure();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const copyListeners = (spy: typeof addSpy) => spy.mock.calls.filter(([type]) => type === 'copy').map(([, listener]) => listener);

    fakeExecCommand();
    await copyText('x'); // success
    expect(copyListeners(removeSpy)).toEqual(copyListeners(addSpy));

    fakeExecCommand({ returns: false, fires: false });
    await copyText('x'); // refusal
    expect(copyListeners(removeSpy)).toEqual(copyListeners(addSpy));

    throwingExecCommand();
    await expect(copyText('x')).resolves.toBe(false); // exception
    expect(copyListeners(removeSpy)).toEqual(copyListeners(addSpy));
  });

  it('(f) secure context: a writeText that throws synchronously resolves false, not a thrown exception', async () => {
    const writeText = vi.fn(() => { throw new Error('writeText blew up'); });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await expect(copyText('x')).resolves.toBe(false);
    expect(writeText).toHaveBeenCalledWith('x');
  });
});

// ---- useCopyLink ----

const SUCCESS = '이 버전의 링크를 복사했습니다.';
const FAILURE = '링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사하세요.';

function ToastProbe() {
  const { toasts } = usePlatform();
  return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.tone}:{toast.text}</p>)}</div>;
}

function HookHarness() {
  const copy = useCopyLink(SUCCESS);
  return <>
    <button type="button" onClick={() => copy('/metrics/m1')}>copy-link</button>
    <ToastProbe />
  </>;
}

const session = testSession(['platform:view'], { user: { id: 'u' } });
const adapter = testAdapter({ session: () => session });
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

function mountHook() {
  // initialLang() falls back to 'ko' when localStorage is unavailable (components jsdom env).
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HookHarness /></PlatformProvider></I18nProvider>);
}

describe('useCopyLink (#300)', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('no success toast while writeText is pending; the caller\'s success text only after it resolves', async () => {
    let release: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>(resolve => { release = () => resolve(); }));
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountHook();
    fireEvent.click(screen.getByRole('button', { name: 'copy-link' }));
    expect(writeText).toHaveBeenCalledWith(window.location.origin + '/metrics/m1');
    expect(screen.getByTestId("toast-probe")).toBeEmptyDOMElement(); // quiet while the write is pending
    act(() => { release?.(); });
    await waitFor(() => expect(screen.getByTestId("toast-probe")).toHaveTextContent(`info:${SUCCESS}`));
    expect(screen.getByTestId("toast-probe")).not.toHaveTextContent(FAILURE);
  });

  it('a writeText rejection shows only the warning with cause and action', async () => {
    const writeText = vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountHook();
    fireEvent.click(screen.getByRole('button', { name: 'copy-link' }));
    await waitFor(() => expect(screen.getByTestId("toast-probe")).toHaveTextContent(`warning:${FAILURE}`));
    expect(screen.getByTestId("toast-probe")).not.toHaveTextContent(SUCCESS);
  });

  it('a writeText that throws synchronously shows only the warning — no success toast, no escaping error', async () => {
    const writeText = vi.fn(() => { throw new Error('writeText blew up'); });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mountHook();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'copy-link' }))).not.toThrow();
    await waitFor(() => expect(screen.getByTestId("toast-probe")).toHaveTextContent(`warning:${FAILURE}`));
    expect(screen.getByTestId("toast-probe")).not.toHaveTextContent(SUCCESS);
    await act(async () => {}); // let the promise chain settle; vitest fails the run on any unhandled rejection
  });

  it('an unsupported environment (no clipboard, execCommand refuses) shows only the warning', async () => {
    insecure();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    mountHook();
    fireEvent.click(screen.getByRole('button', { name: 'copy-link' }));
    await waitFor(() => expect(screen.getByTestId("toast-probe")).toHaveTextContent(`warning:${FAILURE}`));
    expect(screen.getByTestId("toast-probe")).not.toHaveTextContent(SUCCESS);
  });

  it('copies an absolute link with the injected deployment base', async () => {
    const clipboard = secureClipboard();
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} location={createBasePathLocation('/analytics-platform/demo/')}><HookHarness /></PlatformProvider></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'copy-link' }));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(window.location.origin + '/analytics-platform/demo/metrics/m1'));
  });
});
