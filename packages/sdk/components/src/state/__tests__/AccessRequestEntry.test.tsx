import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type AccessRequestSlot, type AccessRequestState, type QueryState } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PermissionRequestTarget, type ScopeCheck, type ScopeOption, type Session } from '@ap/contracts';
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
    expect(await screen.findByText('권한 요청으로 운영자에게 요청할 수 있습니다.')).toBeTruthy();
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
  const forbiddenResponse: ApiResponse<unknown> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' };
  const forbiddenQuery: QueryState<unknown> = { status: 'done', response: forbiddenResponse, refetch: vi.fn(), missing: [], completedAt: null };
  const partial = [{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 5 }];
  const full = [{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 2 }];
  const renderPage = (session: Session, slot?: AccessRequestSlot) => render(<I18nProvider><PlatformProvider adapter={adapterFor(session, async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }))} registry={registry} slots={slot ? { accessRequest: slot } : undefined}>
    <PlatformPage>
      <QueryView query={forbiddenQuery} widgetName="Widget A">{() => <p>ok</p>}</QueryView>
      <QueryView query={forbiddenQuery} widgetName="Widget B">{() => <p>ok</p>}</QueryView>
    </PlatformPage>
  </PlatformProvider></I18nProvider>);

  it('without the slot keeps today\'s per-widget rendering and no banner', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = renderPage(requestable(partial));
    expect(await screen.findAllByText('이 Scope에 접근 권한이 없습니다')).toHaveLength(2);
    expect(view.container.querySelector('[data-access-request-banner]')).toBeNull();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('on a fully granted Scope a forbidden widget keeps today\'s rendering (a capability matter, not a Scope target)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    const view = renderPage(requestable(full), fakeSlot);
    expect(await screen.findAllByText('이 Scope에 접근 권한이 없습니다')).toHaveLength(2);
    expect(view.container.querySelector('[data-access-request-banner]')).toBeNull();
  });

  it('draws one banner for two forbidden widgets, prefilled with the deep-linked ungranted room', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B&roomNames=RB4');
    const view = renderPage(requestable(partial), fakeSlot);
    const banner = await vi.waitFor(() => { const node = view.container.querySelector<HTMLElement>('[data-access-request-banner]'); if (!node) throw new Error('no banner'); return node; });
    expect(view.container.querySelectorAll('[data-access-request-banner]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '권한 요청' })).toHaveLength(1);
    fireEvent.click(within(banner).getByRole('button', { name: '권한 요청' }));
    expect(dialogs.at(-1)?.target).toEqual({ kind: 'site_room', site: 'SITE-B', room: 'RB4' });
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
