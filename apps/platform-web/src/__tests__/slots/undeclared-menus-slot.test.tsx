import { type ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type ApiResponse, type Permission, type UsageSummary } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry, type UndeclaredMenu } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { undeclaredMenusSlot } from '../../undeclared-menus-slot';

// #1846: the app reads the optional `undeclaredMenuPermissions` of the existing usage summary, only for `console:access`.
const home: PlatformMenuEntry = { id: 'fixture-home', group: groupId('fixture-space'), path: '/fixture-home', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'fixture-home' })], groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }], menus: [home] });
const reply = (summary: Partial<UsageSummary>): ApiResponse<UsageSummary> => ({ outcome: 'ok', data: { preset: 'all', menus: [], ...summary }, assessments: [], trust: null, correlationId: 'fixture' });
const SERVER_ROWS = [{ menuId: 'm-1', permission: 'analytics:view', reason: 'permission is not declared by the server' }];

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); window.history.replaceState(null, '', '/mars/fixture-home'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(permissions: Permission[], usageSummary: ReturnType<typeof vi.fn>) {
  const session = testSession(permissions);
  const seen: (readonly UndeclaredMenu[])[] = [];
  const Probe = (): ReactNode => <undeclaredMenusSlot.Read>{list => { seen.push(list); return <p data-testid="out">{JSON.stringify(list)}</p>; }}</undeclaredMenusSlot.Read>;
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, usageSummary })}><Probe /></PlatformProvider></I18nProvider>);
  return seen;
}

describe('undeclaredMenusSlot (#1846)', () => {
  it('passes the menu id and permission key (not the English reason) to an actor with console:access', async () => {
    const usageSummary = vi.fn(async () => reply({ undeclaredMenuPermissions: SERVER_ROWS }));
    mount(['platform:view', 'console:access'], usageSummary);
    await waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('analytics:view'));
    expect(JSON.parse(screen.getByTestId('out').textContent!)).toEqual([{ menuId: 'm-1', permission: 'analytics:view' }]);
    expect(usageSummary).toHaveBeenCalledWith({ preset: 'all' }, expect.anything());
  });

  it('an actor without console:access gets an empty list and no request is made', async () => {
    const usageSummary = vi.fn(async () => reply({ undeclaredMenuPermissions: SERVER_ROWS }));
    mount(['platform:view'], usageSummary);
    expect(await screen.findByTestId('out')).toHaveTextContent('[]');
    expect(usageSummary).not.toHaveBeenCalled();
  });

  it.each<[string, ApiResponse<UsageSummary>]>([
    ['a field-less (older server) response', reply({})],
    ['an error response', { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'boom' }],
  ])('%s leaves the list empty', async (_label, response) => {
    const usageSummary = vi.fn(async () => response);
    mount(['platform:view', 'console:access'], usageSummary);
    await waitFor(() => expect(usageSummary).toHaveBeenCalled());
    expect(screen.getByTestId('out')).toHaveTextContent('[]');
  });
});
