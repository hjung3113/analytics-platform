import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setRole } from '@ap/mock-server';
import { buildRegistry } from '@ap/app-host';
import { pathFor } from '@ap/kernel';
import { declarations } from '../menus';
import { inMemoryQueryHistory, startKitApp } from './start';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  setRole('engineer');
  window.history.replaceState(null, '', '/');
});

async function mountHost(): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  await startKitApp(container);
}

it('the Host mounts the shell with a cross-package probe (ui button, components audit timeline)', async () => {
  setRole('viewer');
  await mountHost();
  const probe = await screen.findByTestId('kit-probe');
  expect(probe.getAttribute('data-permissions')).toBeTruthy();
  expect((await screen.findAllByText('kit button')).length).toBeGreaterThan(0);
});

it('public synthetic menu renders for the public session (kernel permission)', async () => {
  setRole('viewer');
  await mountHost();
  expect((await screen.findAllByText('키트 개요')).length).toBeGreaterThan(0);
  expect(screen.queryAllByText('사내 업무')).toHaveLength(0);
});

it('in-house menu appears for the in-house session (kit:inhouse-view)', async () => {
  setRole('engineer');
  await mountHost();
  expect((await screen.findAllByText('키트 개요')).length).toBeGreaterThan(0);
  expect((await screen.findAllByText('사내 업무')).length).toBeGreaterThan(0);
});

// Every menu package copied from menus/sample (README «둘째 메뉴») is covered without editing this test.
const PAGE_MENUS = buildRegistry(declarations).menus.filter((menu) => menu.component !== undefined);

it('the kit carries at least the sample menu package', () => {
  expect(PAGE_MENUS.map((menu) => menu.id)).toContain('kit-sample');
});

it.each(PAGE_MENUS.map((menu) => [menu.id, menu] as const))('menu package %s renders its mock rows at its own URL', async (id, menu) => {
  setRole('viewer');
  window.history.replaceState(null, '', pathFor(menu));
  await mountHost();
  const rows = await screen.findByTestId('sample-rows', undefined, { timeout: 5000 });
  expect(rows.textContent).toContain(`${id} row A`);
});

it('the query-history store keeps the newest 20 entries, newest first (port contract)', async () => {
  vi.useFakeTimers();
  try {
    const store = inMemoryQueryHistory();
    const key = { userId: 'u1', menuId: 'kit-overview', scopeId: null };
    for (let index = 0; index < 21; index += 1) {
      vi.setSystemTime(1_000 + index);
      await store.record(key, { id: `q${index}`, query: `a=${index}`, schemaVersion: 1, lastAppliedAt: 0, count: 0 });
    }
    const rows = await store.list(key);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.id).toBe('q20');
    expect(rows.some((row) => row.id === 'q0')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
