import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type PermissionRequestTarget, type ScopeCheck, type ScopeOption, type Session } from '@ap/contracts';
import { ScopeSelector } from '../ScopeSelector';
import { GlobalContextBar } from '../GlobalContextBar';

// Places (b) Scope selector and (d) room field of the blocked-place request (ADR-0154 decision 6). Synthetic names only (ADR-0151).
let pendingTargets: PermissionRequestTarget[] = [];
let pendingAnswer: 'known' | 'unknown' = 'known';
const dialogs: PermissionRequestTarget[] = [];
const fakeSlot: AccessRequestSlot = {
  Pending: ({ target, children }: { target: PermissionRequestTarget; children: (state: AccessRequestState) => ReactNode }) => {
    const pending = pendingAnswer === 'unknown' ? null : pendingTargets.some(row => JSON.stringify(row) === JSON.stringify(target));
    return <>{children({ pending, statusHref: pending ? '/permission-requests?id=req-1' : null })}</>;
  },
  Dialog: ({ target, open, onOpenChange }) => {
    if (!open) return null;
    dialogs.push(target);
    return <div role="dialog" aria-label="fake request dialog">{JSON.stringify(target)}<button type="button" onClick={() => onOpenChange(false)}>close</button></div>;
  },
};

const partialAndFull: readonly ScopeOption[] = [
  { id: 'SITE-A', label: 'SITE-A', grantedRooms: 3, totalRooms: 3 },
  { id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 5 },
];
const grantTable = (scopes = partialAndFull): Session => ({ ...testSession(['platform:view'], { scopes }), requestableScopes: [{ id: 'SITE-C', label: 'SITE-C', totalRooms: 4 }] });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); pendingTargets = []; pendingAnswer = 'known'; dialogs.length = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('place (b): Scope selector request items', () => {
  const registry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
  });
  const valid = async (): Promise<ScopeCheck> => ({ status: 'valid', grantedRooms: ['RA1', 'RA2', 'RA3'] });
  let path = '';
  function Path() { path = useHostPlatform().url; return null; }
  const mount = (session: Session, slot?: AccessRequestSlot) => render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, validateScope: valid })} registry={registry} slots={slot ? { accessRequest: slot } : undefined}><ScopeSelector /><Path /></PlatformProvider></I18nProvider>);
  function openMenu() {
    const trigger = screen.getByRole('button', { name: /^Scope: SITE-A/ });
    act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    return trigger;
  }

  it.each([
    ['no slot', grantTable(), undefined],
    ['a slot with a session that is not a grant-table source', testSession(['platform:view'], { scopes: partialAndFull }), fakeSlot],
  ] as const)('%s → today\'s menu without request items', async (_, session, slot) => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    mount(session, slot);
    openMenu();
    expect(await screen.findByRole('menuitemradio', { name: /SITE-B/ })).toBeTruthy();
    expect(screen.queryByText('권한 요청')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /권한 없음/ })).toBeNull();
  });

  it('lists the partially granted and the requestable sites; a fully granted site gets no item', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    mount(grantTable(), fakeSlot);
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'SITE-B · 공정 3개 권한 없음' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'SITE-C · 공정 4개 권한 없음' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /SITE-A ·/ })).toBeNull();
  });

  it('opens the dialog prefilled with the site after the menu closes, keeps the Scope, and returns focus to the trigger on close', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    mount(grantTable(), fakeSlot);
    const trigger = openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'SITE-C · 공정 4개 권한 없음' }));
    // The dialog survives the menu closing: it is rendered outside the menu content.
    const dialog = await screen.findByRole('dialog', { name: 'fake request dialog' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dialogs.at(-1)).toEqual({ kind: 'site', site: 'SITE-C' });
    expect(path).toContain('scopeId=SITE-A'); // requesting does not change the Context
    fireEvent.click(dialog.querySelector('button')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('an unknown pending state (loading or failed read) lists the plain request items', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    pendingAnswer = 'unknown';
    mount(grantTable(), fakeSlot);
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'SITE-C · 공정 4개 권한 없음' })).toBeTruthy();
    expect(screen.queryByText(/요청 대기 중/)).toBeNull();
  });

  it('a site with a pending request reads «요청 대기 중» and leads to the request status, the same after a remount', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    pendingTargets = [{ kind: 'site', site: 'SITE-C' }];
    for (let mount_ = 0; mount_ < 2; mount_++) {
      const view = mount(grantTable(), fakeSlot);
      openMenu();
      expect(await screen.findByRole('menuitem', { name: 'SITE-C · 요청 대기 중' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'SITE-B · 공정 3개 권한 없음' })).toBeTruthy();
      if (mount_ === 1) {
        fireEvent.click(screen.getByRole('menuitem', { name: 'SITE-C · 요청 대기 중' }));
        await waitFor(() => expect(path).toBe('/permission-requests?id=req-1'));
        expect(dialogs).toHaveLength(0);
      }
      view.unmount();
    }
  });

  // #1876: the slot's components are menu code mounted outside the screen's boundary; a throw must not blank the app.
  it('a throwing Pending drops only its request row: the selector and its other items stay', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    mount(grantTable(), { ...fakeSlot, Pending: () => { throw new Error('fixture pending failure'); } });
    openMenu();
    expect(await screen.findByRole('menuitemradio', { name: /SITE-B/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /권한 없음/ })).toBeNull();
  });

  it('a throwing Dialog is contained: the Scope selector trigger stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-A');
    let attempts = 0;
    mount(grantTable(), { ...fakeSlot, Dialog: () => { attempts += 1; throw new Error('fixture dialog failure'); } });
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'SITE-C · 공정 4개 권한 없음' }));
    await waitFor(() => expect(attempts).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('button', { name: /^Scope: SITE-A/ })).toBeTruthy();
  });
});

describe('place (d): room field request entry', () => {
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, time: 'apply', roomNames: 'apply' }, query: { mode: 'apply', required: { context: ['time', 'roomNames'] } }, pageKeys: [], pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false } }] });
  const mount = (query: string, session: Session, slot?: AccessRequestSlot) => {
    window.history.replaceState(null, '', `/?scopeId=SITE-B${query}`);
    return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: ['RB1', 'RB2'] }), defaultRangeTo: () => '2026-01-01T09:00:00' })} slots={slot ? { accessRequest: slot } : undefined}><GlobalContextBar /></PlatformProvider></I18nProvider>);
  };
  const resetButton = () => screen.findByRole('button', { name: '공정 전체 후보로 되돌리기' });

  it.each([
    ['no slot', grantTable(), undefined],
    ['a session that is not a grant-table source', testSession(['platform:view'], { scopes: partialAndFull }), fakeSlot],
    ['a fully granted Scope', grantTable([{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 2 }]), fakeSlot],
  ] as const)('%s → today\'s field', async (_, session, slot) => {
    mount('', session, slot);
    expect(await resetButton()).toBeTruthy();
    expect(screen.queryByRole('button', { name: '공정 권한 요청' })).toBeNull();
  });

  it('a partially granted Scope offers the request beside `전체 후보로`, prefilled with the site when no ungranted room is chosen', async () => {
    mount('', grantTable(), fakeSlot);
    await resetButton();
    fireEvent.click(await screen.findByRole('button', { name: '공정 권한 요청' }));
    expect(screen.getByRole('dialog', { name: 'fake request dialog' })).toBeTruthy();
    expect(dialogs.at(-1)).toEqual({ kind: 'site', site: 'SITE-B' });
  });

  it('a deep-linked ungranted room is the prefilled target', async () => {
    mount('&roomNames=RB4', grantTable(), fakeSlot);
    fireEvent.click(await screen.findByRole('button', { name: '공정 권한 요청' }));
    expect(dialogs.at(-1)).toEqual({ kind: 'site_room', site: 'SITE-B', room: 'RB4' });
  });

  it('an unknown pending state (loading or failed read) draws the plain request button', async () => {
    pendingAnswer = 'unknown';
    mount('&roomNames=RB4', grantTable(), fakeSlot);
    expect(await screen.findByRole('button', { name: '공정 권한 요청' })).toBeTruthy();
    expect(screen.queryByText('요청 대기 중')).toBeNull();
  });

  it('a pending request for the room reads «요청 대기 중» with the status link, the same after a remount', async () => {
    pendingTargets = [{ kind: 'site_room', site: 'SITE-B', room: 'RB4' }];
    for (let mount_ = 0; mount_ < 2; mount_++) {
      const view = mount('&roomNames=RB4', grantTable(), fakeSlot);
      expect(await screen.findByText('요청 대기 중')).toBeTruthy();
      expect(screen.getByRole('link', { name: '요청 상태' }).getAttribute('href')).toBe('/permission-requests?id=req-1');
      expect(screen.queryByRole('button', { name: '공정 권한 요청' })).toBeNull();
      view.unmount();
    }
  });
});
