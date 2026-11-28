import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type PlatformAdapter, type ScopeCheck, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform } from '../../platform/platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { at } from '../../test-support';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const equipmentAxes = [{ id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false }];

function Probe() {
  const { scope } = useHostPlatform();
  return <p data-testid="scope">{scope.status}:{scope.scopeId ?? 'null'}:{scope.grantedRooms.join(',')}</p>;
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([false, true])('finishes the pending screen Scope check across a same-snapshot revision (serverPreferences=%s)', async serverPreferences => {
  window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
  const session = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  let resolveScope!: (result: ScopeCheck) => void;
  const validateScope = vi.fn<PlatformAdapter['validateScope']>(() => new Promise<ScopeCheck>(resolve => { resolveScope = resolve; }));
  const adapter = testAdapter({
    session: () => session,
    validateScope,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  const patchPreferences = vi.spyOn(adapter, 'patchPreferences');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} serverPreferences={serverPreferences}><Probe /></PlatformProvider></I18nProvider>);
  expect(screen.getByTestId('scope')).toHaveTextContent('validating:SITE-B:');
  act(() => listeners.forEach(listener => listener()));
  expect(validateScope).toHaveBeenCalledTimes(1);
  expect(at(validateScope.mock.calls, 0)[1]?.aborted).toBe(false);
  expect(screen.getByTestId('scope')).toHaveTextContent('validating:SITE-B:');
  await act(async () => { resolveScope({ status: 'valid', grantedRooms: ['RB1'] }); });
  expect(screen.getByTestId('scope')).toHaveTextContent('valid:SITE-B:RB1');
  expect(validateScope).toHaveBeenCalledTimes(1);
  expect(patchPreferences.mock.calls.some(([patch]) => patch.set?.lastScope === 'SITE-B')).toBe(false);
});

describe('an approved request opens the blocked Scope on the next session snapshot (ADR-0154 decision 5)', () => {
  it('forbidden → the adapter swaps its session snapshot (same user, same scopeId, no reload) → the Kernel re-validates → valid', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B');
    // Before approval the user holds no room in SITE-B; it is only requestable.
    let current: Session = { ...testSession(['platform:view']), requestableScopes: [{ id: 'SITE-B', label: 'SITE-B', totalRooms: 2 }] };
    let granted = false;
    const listeners = new Set<() => void>();
    const validateScope = vi.fn(async (): Promise<ScopeCheck> => granted ? { status: 'valid', grantedRooms: ['RB1', 'RB2'] } : { status: 'forbidden', grantedRooms: [] });
    const adapter = testAdapter({
      session: () => current,
      validateScope,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    });
    render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('forbidden:SITE-B:')).toBeTruthy();
    expect(validateScope).toHaveBeenCalledTimes(1);

    // The poll sees a new sessionVersion: the http adapter replaces the snapshot (same user id) and notifies.
    granted = true;
    current = { user: current.user, scopes: [{ id: 'SITE-B', label: 'SITE-B', grantedRooms: 2, totalRooms: 2 }], requestableScopes: [] };
    act(() => listeners.forEach(listener => listener()));

    expect(await screen.findByText('valid:SITE-B:RB1,RB2')).toBeTruthy();
    expect(validateScope).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain('scopeId=SITE-B');
  });
});
