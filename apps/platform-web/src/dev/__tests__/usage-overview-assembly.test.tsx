import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';
import { startAppHost } from '@ap/app-host';
import { createAssembly, type Assembly } from '#platform-assembly';
import { getRole, setRole } from '@ap/mock-server';
import { EQUIPMENT_AXES } from '../../equipmentAxes';
import { declarations, registry } from '../../menus';
import { spaceSystems } from '../../space-systems';
import { SpaceSystemsSession } from '../../space-systems-session';

/** The Host owns its React root, so each mount's container is removed by hand. */
const containers: HTMLElement[] = [];
/** The Host owns its React root and exposes no unmount, so the test records every root `createRoot` makes and unmounts them in teardown, before the stores are reset. */
const roots: Root[] = [];
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => { const root = actual.createRoot(...args); roots.push(root); return root; } };
});
async function unmountRoots() { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); }


async function mountAt(url: string) {
  const assembly = await createAssembly({ registry }) as Assembly;
  window.history.replaceState(null, '', url);
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  await act(async () => {
    await startAppHost({ container, declarations, createAssembly: () => assembly, basePath: '/', equipmentAxes: EQUIPMENT_AXES, queryHistory: undefined as never, slots: () => ({}), children: (mounted) => <SpaceSystemsSession source={mounted.spaceSystems ?? null} /> });
  });
}

const previousRole = getRole();
beforeEach(() => {
  spaceSystems.reset();
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
  }
  setRole('admin');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(async () => { cleanup(); await unmountRoots(); for (const container of containers.splice(0)) container.remove(); spaceSystems.reset(); setRole(previousRole); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('admin usage in the real AppRoot assembly (#605 FIXB)', () => {
  it('renders a populated usage drawer with no test-only TooltipProvider', async () => {
    await mountAt('/operations/admin-usage?focus=admin-audit');
    const drawer = await screen.findByRole('dialog', { name: '변경 감사' }, { timeout: 10_000 });
    await within(drawer).findByText(/본 화면 진입 \d+건/, {}, { timeout: 10_000 });
    expect(within(drawer).getByRole('button', { name: '이후 메뉴 이동 없음' })).toBeTruthy();
    expect(within(drawer).getByRole('list', { name: '다음으로 간 화면 순위' })).toBeTruthy();
    expect(screen.queryByText('이 화면에서 오류가 발생했습니다')).toBeNull();
  }, 30_000);

  // Characterization of the shared initial-URL policy, not the desired keyboard behavior.
  // Not implemented here: see .planning/backlog.md, #605 FIXB shared arrival focus.
  it.each([
    ['/operations/admin-usage?focus=chart-catalog', '차트 카탈로그'],
    ['/operations/admin-roles?focus=admin', '플랫폼 관리자'],
  ])('records the shared initial-focus limitation at %s (Escape outside the drawer does not close)', async (url, title) => {
    await mountAt(url);
    const drawer = await screen.findByRole('dialog', { name: title }, { timeout: 10_000 });
    if (url.includes('admin-usage')) await within(drawer).findByText(/기록된 진입이 없습니다|이 메뉴는 이동 경로를 공개하지 않습니다/);
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(new URL(url, 'http://test').searchParams.get('focus'));
    expect(drawer.isConnected).toBe(true);
    fireEvent.click(within(drawer).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }, 30_000);
});
