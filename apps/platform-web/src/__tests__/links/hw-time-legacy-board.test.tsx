// @vitest-environment jsdom
import { Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '@ap/menu-hw-time';
import { stubCompactTableGeometry } from '@ap/components/testing';
const registry = createRegistry({ permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: 'HW Time', en: 'HW Time' }, icon: manifests[0].icon, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
const adapter = testAdapter({ session: () => session });
let restoreGeometry: (() => void) | undefined;
afterEach(() => { cleanup(); restoreGeometry?.(); vi.unstubAllGlobals(); });
it('renders a saved legacy HW Time steps pane in place without replacing the board or pane id', async () => {
  restoreGeometry = stubCompactTableGeometry(1200);
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/board');
  const leave = vi.fn(); const change = vi.fn();
  const Page = registry.menuById('hw-time-steps').component!;
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PaneScreenProvider paneId="legacy" screen={{ menuId: 'hw-time-steps', params: {}, query: '?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00' }} onLeave={leave} onChange={change}>
      <Suspense><Page params={{}} /></Suspense>
    </PaneScreenProvider>
  </PlatformProvider></I18nProvider>);
  // The pane is a lazy import (the start-up chunk must not carry it, check:lazy-chunks); a cold transform passes the 1 s default.
  expect(await screen.findByTestId('hw-time-filter-panel', {}, { timeout: 10_000 })).toBeTruthy();
  expect(await screen.findByRole('region', { name: 'HW Time 분석 영역' })).toBeTruthy();
  expect(window.location.pathname).toBe('/board');
  expect(leave).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});
