import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type AccessRequestSlot, type AccessRequestState, type QueryState } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PermissionRequestTarget, type ScopeCheck, type ScopeOption, type Session } from '@ap/contracts';
import { Dialog as UiDialog, DialogContent, DialogDescription, DialogTitle } from '@ap/ui';
import { PlatformPage } from '../../archetypes/PlatformPage';
import { QueryView } from '../../StateView';
import { scopeRequestTarget } from '../AccessRequestEntry';

// Synthetic site and room names only (ADR-0151).
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, roomNames: 'reference' }, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

/** The fake server read: the user's own pending requests. A place is pending when the fake says so for its exact target. */
let pendingTargets: PermissionRequestTarget[] = [];
let pendingAnswer: 'known' | 'unknown' = 'known';
const dialogs: { target: PermissionRequestTarget; returnTo: string }[] = [];
const fakeSlot: AccessRequestSlot = {
  Pending: ({ target, children }: { target: PermissionRequestTarget; children: (state: AccessRequestState) => ReactNode }) => {
    const pending = pendingAnswer === 'unknown' ? null : pendingTargets.some(row => JSON.stringify(row) === JSON.stringify(target));
    return <>{children({ pending, statusHref: pending ? '/permission-requests?id=req-1' : null })}</>;
  },
  Dialog: ({ target, returnTo, open, onOpenChange }) => {
    if (!open) return null;
    dialogs.push({ target, returnTo });
    return <div role="dialog" aria-label="fake request dialog">{JSON.stringify(target)}<button type="button" onClick={() => onOpenChange(false)}>close</button></div>;
  },
};

function adapterFor(session: Session, validateScope: () => Promise<ScopeCheck>) {
  return testAdapter({ session: () => session, validateScope });
}
const requestable = (scopes: readonly ScopeOption[] = []): Session => ({ ...testSession(['platform:view'], { scopes }), requestableScopes: [{ id: 'SITE-C', label: 'SITE-C', totalRooms: 4 }] });
const forbiddenCheck = async (): Promise<ScopeCheck> => ({ status: 'forbidden', grantedRooms: [] });

const forbiddenResponse: ApiResponse<unknown> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const forbiddenQuery: QueryState<unknown> = { status: 'done', response: forbiddenResponse, refetch: vi.fn(), missing: [], completedAt: null };
const partial = [{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 5 }];
const full = [{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 2 }];

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); pendingTargets = []; pendingAnswer = 'known'; dialogs.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('scopeRequestTarget: the room place target (ADR-0154 decision 5: room names only from the field)', () => {
  it.each([
    ['no room chosen', null, { kind: 'site', site: 'SITE-B' }],
    ['explicit empty choice', [], { kind: 'site', site: 'SITE-B' }],
    ['only granted rooms chosen', ['RB1'], { kind: 'site', site: 'SITE-B' }],
    ['a deep-linked ungranted room', ['RB1', 'RB4'], { kind: 'site_room', site: 'SITE-B', room: 'RB4' }],
    ['the first ungranted room of several', ['RB5', 'RB4'], { kind: 'site_room', site: 'SITE-B', room: 'RB5' }],
  ] as const)('%s', (_, roomNames, expected) => {
    expect(scopeRequestTarget('SITE-B', roomNames === null ? null : [...roomNames], ['RB1', 'RB2'])).toEqual(expected);
  });
});

describe('place (c): the Scope forbidden gate', () => {
  const renderGate = (session: Session, slot?: AccessRequestSlot) => render(<I18nProvider><PlatformProvider adapter={adapterFor(session, forbiddenCheck)} registry={registry} slots={slot ? { accessRequest: slot } : undefined}>
    <PlatformPage><p>page body</p></PlatformPage>
  </PlatformProvider></I18nProvider>);

  it('without the slot draws today\'s gate', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    renderGate(requestable());
    expect(await screen.findByText('이 Scope에 접근 권한이 없습니다')).toBeTruthy();
    expect(screen.getByText(/관리자에게 요청하세요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('with the slot but a session without requestableScopes (not a grant-table source) draws today\'s gate', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    renderGate(testSession(['platform:view']), fakeSlot);
    expect(await screen.findByText(/관리자에게 요청하세요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('with the slot offers the request, prefilled with the site, and opens the dialog in place without changing the address', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    renderGate(requestable(), fakeSlot);
    expect(await screen.findByText('운영자에게 권한을 요청하세요.')).toBeTruthy();
    const before = window.location.href;
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    expect(screen.getByRole('dialog', { name: 'fake request dialog' })).toBeTruthy();
    expect(dialogs.at(-1)?.target).toEqual({ kind: 'site', site: 'SITE-C' });
    // returnTo is the blocked screen's app-relative address (the Kernel's `url`), never a new URL key.
    expect(dialogs.at(-1)?.returnTo).toBe('/mars/home?v=1&scopeId=SITE-C');
    expect(window.location.href).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a pending request from the server reads «요청 대기 중» with the status link, and the same after a remount (reload)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    pendingTargets = [{ kind: 'site', site: 'SITE-C' }];
    for (let mount = 0; mount < 2; mount++) {
      const view = renderGate(requestable(), fakeSlot);
      expect(await screen.findByText('요청 대기 중')).toBeTruthy();
      expect(screen.getByText('운영자의 검토를 기다리고 있습니다.')).toBeTruthy();
      expect(screen.getByRole('link', { name: '요청 상태' }).getAttribute('href')).toBe('/permission-requests?id=req-1');
      expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
      view.unmount();
    }
  });

  it('an unknown pending state (loading or failed read) draws the plain request entry', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    pendingAnswer = 'unknown';
    renderGate(requestable(), fakeSlot);
    expect(await screen.findByRole('button', { name: '권한 요청' })).toBeTruthy();
    expect(screen.queryByText('요청 대기 중')).toBeNull();
  });

  it('when the grant arrives on the next session snapshot the focused entry leaves and focus goes to the page body (06 §26)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    let current = requestable();
    let granted = false;
    const listeners = new Set<() => void>();
    const adapter = testAdapter({
      session: () => current,
      validateScope: async () => granted ? { status: 'valid', grantedRooms: ['RC1'] } : { status: 'forbidden', grantedRooms: [] },
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ accessRequest: fakeSlot }}><PlatformPage><p>page body</p></PlatformPage></PlatformProvider></I18nProvider>);
    const button = await screen.findByRole('button', { name: '권한 요청' });
    button.focus();
    granted = true;
    current = { user: current.user, scopes: [{ id: 'SITE-C', label: 'SITE-C', grantedRooms: 1, totalRooms: 1 }], requestableScopes: [] };
    act(() => listeners.forEach(listener => listener()));
    expect(await screen.findByText('page body')).toBeTruthy();
    expect(document.activeElement?.hasAttribute('data-platform-page-content')).toBe(true);
  });
});

describe('place (e): one request banner for forbidden widgets on a partially granted Scope', () => {
  const renderPage = (session: Session, slot?: AccessRequestSlot) => render(<I18nProvider><PlatformProvider adapter={adapterFor(session, async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }))} registry={registry} slots={slot ? { accessRequest: slot } : undefined}>
    <PlatformPage>
      <QueryView query={forbiddenQuery} widgetName="Widget A">{() => <p>ok</p>}</QueryView>
      <QueryView query={forbiddenQuery} widgetName="Widget B">{() => <p>ok</p>}</QueryView>
    </PlatformPage>
  </PlatformProvider></I18nProvider>);

  it('without the slot groups the widgets without an access-request banner', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = renderPage(requestable(partial));
    expect(await screen.findAllByText('위 안내 참고')).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(1);
    expect(view.container.querySelector('[data-access-request-banner]')).toBeNull();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('on a fully granted Scope forbidden widgets still group (a capability matter, not a Scope target)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = renderPage(requestable(full), fakeSlot);
    expect(await screen.findAllByText('위 안내 참고')).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(1);
    expect(view.container.querySelector('[data-access-request-banner]')).toBeNull();
  });

  it('draws one banner for two forbidden widgets, prefilled with the deep-linked ungranted room', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B&roomNames=RB4');
    const view = renderPage(requestable(partial), fakeSlot);
    const banner = await vi.waitFor(() => { const node = view.container.querySelector<HTMLElement>('[data-access-request-banner]'); if (!node) throw new Error('no banner'); return node; });
    expect(view.container.querySelectorAll('[data-access-request-banner]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(0);
    expect(banner).toHaveTextContent('위젯 2개');
    expect(within(banner).queryByRole('status')).toBeNull();
    for (const name of ['Widget A', 'Widget B']) {
      expect(screen.getByRole('group', { name })).toHaveTextContent('위 안내 참고');
    }
    expect(screen.getAllByRole('button', { name: '권한 요청' })).toHaveLength(1);
    fireEvent.click(within(banner).getByRole('button', { name: '권한 요청' }));
    expect(dialogs.at(-1)?.target).toEqual({ kind: 'site_room', site: 'SITE-B', room: 'RB4' });
  });

  it('keeps separate summaries per forbidden evidence group instead of merging counts (#1994 C2)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const qOne: QueryState<unknown> = { ...forbiddenQuery, response: { ...forbiddenResponse, message: 'one' } };
    const qTwo: QueryState<unknown> = { ...forbiddenQuery, response: { ...forbiddenResponse, message: 'two' } };
    const view = render(<I18nProvider><PlatformProvider adapter={adapterFor(requestable(partial), async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }))} registry={registry} slots={{ accessRequest: fakeSlot }}>
      <PlatformPage>
        <QueryView query={qOne} widgetName="Widget A">{() => <p>ok</p>}</QueryView>
        <QueryView query={qOne} widgetName="Widget B">{() => <p>ok</p>}</QueryView>
        <QueryView query={qTwo} widgetName="Widget C">{() => <p>ok</p>}</QueryView>
        <QueryView query={qTwo} widgetName="Widget D">{() => <p>ok</p>}</QueryView>
      </PlatformPage>
    </PlatformProvider></I18nProvider>);
    const banner = await vi.waitFor(() => { const node = view.container.querySelector<HTMLElement>('[data-access-request-banner]'); if (!node) throw new Error('no banner'); return node; });
    expect(view.container.querySelectorAll('[data-access-request-banner]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(0);
    expect(banner).not.toHaveTextContent('위젯 4개');
    const summaries = within(banner).getAllByText(/위젯 2개가 같은 이유로 열리지 않았습니다\./);
    expect(summaries).toHaveLength(2);
    const idA = screen.getByRole('group', { name: 'Widget A' }).getAttribute('aria-describedby')!;
    const idB = screen.getByRole('group', { name: 'Widget B' }).getAttribute('aria-describedby')!;
    const idC = screen.getByRole('group', { name: 'Widget C' }).getAttribute('aria-describedby')!;
    const idD = screen.getByRole('group', { name: 'Widget D' }).getAttribute('aria-describedby')!;
    expect(idA).toBeTruthy();
    expect(idC).toBeTruthy();
    expect(idA).toBe(idB);
    expect(idC).toBe(idD);
    expect(idA).not.toBe(idC);
    const summaryOne = document.getElementById(idA)!;
    const summaryTwo = document.getElementById(idC)!;
    expect(summaryOne).toHaveTextContent('Widget A');
    expect(summaryOne).toHaveTextContent('Widget B');
    expect(summaryOne).not.toHaveTextContent('Widget C');
    expect(summaryTwo).toHaveTextContent('Widget C');
    expect(summaryTwo).toHaveTextContent('Widget D');
    expect(summaryTwo).not.toHaveTextContent('Widget A');
    for (const name of ['Widget A', 'Widget B', 'Widget C', 'Widget D']) {
      expect(screen.getByRole('group', { name })).toHaveTextContent('위 안내 참고(권한 없음)');
    }
    expect(screen.getAllByRole('button', { name: '권한 요청' })).toHaveLength(1);
    const announcer = view.container.querySelector('[data-outcome-announcer="polite"]')!;
    expect(announcer.textContent).not.toContain('위젯 4개');
    expect(within(announcer as HTMLElement).getAllByText('위젯 2개가 같은 이유로 열리지 않았습니다.')).toHaveLength(2);
  });

  it('with the slot but a session without requestableScopes groups the widgets without an access-request banner', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = renderPage(testSession(['platform:view'], { scopes: partial }), fakeSlot);
    expect(await screen.findAllByText('위 안내 참고')).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-outcome-banner]')).toHaveLength(1);
    expect(view.container.querySelector('[data-access-request-banner]')).toBeNull();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('a single forbidden widget draws exactly one banner', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = render(<I18nProvider><PlatformProvider adapter={adapterFor(requestable(partial), async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }))} registry={registry} slots={{ accessRequest: fakeSlot }}>
      <PlatformPage><QueryView query={forbiddenQuery} widgetName="Widget A">{() => <p>ok</p>}</QueryView></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await vi.waitFor(() => { if (!view.container.querySelector('[data-access-request-banner]')) throw new Error('no banner'); });
    expect(view.container.querySelectorAll('[data-access-request-banner]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '권한 요청' })).toHaveLength(1);
  });

  it('when the last forbidden widget disappears the banner is gone and the focused entry hands focus to the page body', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const adapter = adapterFor(requestable(partial), async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }));
    const okQuery: QueryState<unknown> = { ...forbiddenQuery, response: { ...forbiddenResponse, outcome: 'ok' } };
    const tree = (query: QueryState<unknown>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ accessRequest: fakeSlot }}>
      <PlatformPage><QueryView query={query} widgetName="Widget A">{() => <p>ok</p>}</QueryView></PlatformPage>
    </PlatformProvider></I18nProvider>;
    const view = render(tree(forbiddenQuery));
    const button = await screen.findByRole('button', { name: '권한 요청' });
    button.focus();
    view.rerender(tree(okQuery));
    await vi.waitFor(() => { if (view.container.querySelector('[data-access-request-banner]')) throw new Error('banner still there'); });
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
    expect(document.activeElement?.hasAttribute('data-platform-page-content')).toBe(true);
  });

  it.each([
    ['the last forbidden widget disappears', null],
    ['the owner page is disposed', null],
    ['the last forbidden widget disappears', 'dialog'],
    ['the last forbidden widget disappears', 'alertdialog'],
  ] as const)('focus the user moved outside the entry and its open dialog stays there when %s (unrelated %s; review C3)', async (removal, container) => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const adapter = adapterFor(requestable(partial), async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }));
    const okQuery: QueryState<unknown> = { ...forbiddenQuery, response: { ...forbiddenResponse, outcome: 'ok' } };
    const tree = (query: QueryState<unknown>, page: boolean) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ accessRequest: fakeSlot }}>
      {page ? <PlatformPage><QueryView query={query} widgetName="Widget A">{() => <p>ok</p>}</QueryView></PlatformPage> : null}
    </PlatformProvider></I18nProvider>;
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    const host = container === null ? outside : Object.assign(document.createElement('div'), { role: container });
    if (host !== outside) { host.setAttribute('role', container ?? ''); host.append(outside); }
    document.body.append(host);
    try {
      const view = render(tree(forbiddenQuery, true));
      fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }));
      expect(screen.getByRole('dialog', { name: 'fake request dialog' })).toBeTruthy();
      outside.focus();
      const blurs: string[] = [];
      outside.addEventListener('blur', () => blurs.push(document.activeElement?.tagName ?? 'none'));
      view.rerender(removal === 'the owner page is disposed' ? tree(forbiddenQuery, false) : tree(okQuery, true));
      await vi.waitFor(() => { if (view.container.querySelector('[data-access-request-banner]')) throw new Error('banner still there'); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(blurs).toEqual([]);
      expect(document.activeElement).toBe(outside);
    } finally { host.remove(); }
  });

  it('an unknown pending state (loading or failed read) draws the plain request entry in the banner', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    pendingAnswer = 'unknown';
    renderPage(requestable(partial), fakeSlot);
    expect(await screen.findByRole('button', { name: '권한 요청' })).toBeTruthy();
    expect(screen.queryByText('요청 대기 중')).toBeNull();
  });

  it('reads the pending state from the server data, the same after a remount', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    pendingTargets = [{ kind: 'site', site: 'SITE-B' }];
    for (let mount = 0; mount < 2; mount++) {
      const view = renderPage(requestable(partial), fakeSlot);
      expect(await screen.findByText('요청 대기 중')).toBeTruthy();
      expect(screen.getByRole('link', { name: '요청 상태' })).toBeTruthy();
      view.unmount();
    }
  });
});

// The real @ap/ui Dialog as the slot's Dialog (portal + autofocus), with a pending state the test flips: the focus paths the fake dialog cannot reach.
describe('focus ownership with the real dialog (portal + autofocus)', () => {
  const store = { pending: false, listeners: new Set<() => void>() };
  const setPending = (pending: boolean) => { store.pending = pending; act(() => store.listeners.forEach(listener => listener())); };
  const realSlot: AccessRequestSlot = {
    Pending: ({ children }: { target: PermissionRequestTarget; children: (state: AccessRequestState) => ReactNode }) => {
      const pending = useSyncExternalStore(listener => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; }, () => store.pending);
      return <>{children({ pending, statusHref: pending ? '/permission-requests?id=req-1' : null })}</>;
    },
    Dialog: ({ open, onOpenChange }) => <UiDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent><DialogTitle>request</DialogTitle><DialogDescription>request dialog</DialogDescription><button type="button">inner</button></DialogContent>
    </UiDialog>,
  };
  beforeEach(() => { store.pending = false; });
  const listeners = new Set<() => void>();
  const swapAdapter = (initial: Session, later: Session, validateScope: () => Promise<ScopeCheck>) => {
    let current = initial;
    listeners.clear();
    return { adapter: testAdapter({ session: () => current, validateScope, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } }), swap: () => { current = later; act(() => listeners.forEach(listener => listener())); } };
  };
  const openDialog = async (name = '권한 요청') => {
    fireEvent.click(await screen.findByRole('button', { name }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    return dialog;
  };
  const onPageFallback = () => document.activeElement?.hasAttribute('data-platform-page-content') === true;
  const granted = (scopes: readonly ScopeOption[]): Session => ({ ...testSession(['platform:view'], { scopes }), requestableScopes: [] });

  it('pending replaces the opener while the dialog is open: closing returns focus to the status action', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    render(<I18nProvider><PlatformProvider adapter={adapterFor(requestable(), forbiddenCheck)} registry={registry} slots={{ accessRequest: realSlot }}><PlatformPage><p>page body</p></PlatformPage></PlatformProvider></I18nProvider>);
    const dialog = await openDialog();
    setPending(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-access-request="pending"] a')));
  });

  it('place (c): the gate is removed by a session swap while the dialog holds focus → focus goes to the page body', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-C');
    let valid = false;
    const { adapter, swap } = swapAdapter(requestable(), granted([{ id: 'SITE-C', label: 'SITE-C', grantedRooms: 1, totalRooms: 1 }]), async () => valid ? { status: 'valid', grantedRooms: ['RC1'] } : { status: 'forbidden', grantedRooms: [] });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ accessRequest: realSlot }}><PlatformPage><p>page body</p></PlatformPage></PlatformProvider></I18nProvider>);
    await openDialog();
    valid = true;
    swap();
    expect(await screen.findByText('page body')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(onPageFallback()).toBe(true));
  });

  it('place (e): the banner is removed by a session swap while the dialog holds focus → focus goes to the page body', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const { adapter, swap } = swapAdapter(requestable([{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 5 }]), granted([{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 2 }]), async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }));
    const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ accessRequest: realSlot }}><PlatformPage>
      <QueryView query={forbiddenQuery} widgetName="Widget A">{() => <p>ok</p>}</QueryView>
    </PlatformPage></PlatformProvider></I18nProvider>);
    await openDialog();
    swap();
    await waitFor(() => expect(view.container.querySelector('[data-access-request-banner]')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(onPageFallback()).toBe(true));
  });
});
