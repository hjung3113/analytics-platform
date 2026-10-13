/**
 * copyText / useCopyLink (#300): link copy that reports success only after the write completed, and names cause and
 * action on failure (06 §26). jsdom has no `isSecureContext` or `navigator.clipboard`, so each test installs exactly
 * the environment it describes — the same style as PlatformDataTable.copy.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { copyText, useCopyLink } from './copyText';
import { noContext, testAdapter, testSpace } from './test-support';

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
 * cancelable), so a document-level capture listener receives it and fills `clipboardData`.
 */
function fakeExecCommand({ fires = true, clipboardData = true }: { fires?: boolean; clipboardData?: boolean } = {}) {
  const data = new Map<string, string>();
  const execCommand = vi.fn((command: string) => {
    if (command !== 'copy' || !fires) return false;
    const event = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { setData: (t: string, v: string) => void } };
    if (clipboardData) event.clipboardData = { setData: (t, v) => { data.set(t, v); } };
    document.body.dispatchEvent(event);
    return true;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { data, execCommand };
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
    const { data } = fakeExecCommand();
    await expect(copyText('link-text')).resolves.toBe(true);
    expect(data.get('text/plain')).toBe('link-text');
  });

  it('(d) insecure context: execCommand true without a copy event — or an event without clipboardData — resolves false', async () => {
    insecure();
    const silent = fakeExecCommand({ fires: false });
    await expect(copyText('x')).resolves.toBe(false);
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

    fakeExecCommand({ fires: false });
    await copyText('x'); // refusal
    expect(copyListeners(removeSpy)).toEqual(copyListeners(addSpy));

    throwingExecCommand();
    await expect(copyText('x')).resolves.toBe(false); // exception
    expect(copyListeners(removeSpy)).toEqual(copyListeners(addSpy));
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

const session: Session = { user: { id: 'u', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [] };
const adapter = testAdapter({ session: () => session });
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
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

  it('an unsupported environment (no clipboard, execCommand refuses) shows only the warning', async () => {
    insecure();
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    mountHook();
    fireEvent.click(screen.getByRole('button', { name: 'copy-link' }));
    await waitFor(() => expect(screen.getByTestId("toast-probe")).toHaveTextContent(`warning:${FAILURE}`));
    expect(screen.getByTestId("toast-probe")).not.toHaveTextContent(SUCCESS);
  });
});
