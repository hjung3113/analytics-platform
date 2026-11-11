import { expect, test, type Page } from '@playwright/test';
import { evidence, signInAs } from './support';
import { chooseSystem } from './contract-helpers';

/**
 * EV viewer (#801, #1659): the menu package @ap/menu-topview (`eqv:topview`, `eqv:focus`); the describe name keeps the former host-module title.
 * Black-box: nothing from @eqv/* is imported; the window and equipment are the mock fixture's, spelled as the URL carries them
 * (naive seconds, no `Z`). The placement below is the one in `menus/tools/topview/src/index.ts` — update both together.
 * The server-side refusal of a viewer (`without eqv:view → forbidden`) is the conformance test; the client gate renders first here.
 */
const TOPVIEW = '/tools/eqv-topview?equipment=eq-synth-01&from=2026-01-01T10:00:00&to=2026-01-01T10:30:00';
const MENU = '설비 Top View';
const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });

test.describe('EV host module (#801)', () => {
  test('sidebar entry offers equipment and recovers its data window with an at-most-eight-hour default', async ({ page }, testInfo) => {
    await page.goto('/');
    await chooseSystem(page, '도구');
    await sidebar(page).getByRole('link', { name: MENU, exact: true }).click();
    await expect(page.getByText('위에서 설비를 고르세요', { exact: true })).toBeVisible();
    await expect.poll(() => {
      const query = new URL(page.url()).searchParams;
      const from = query.get('from');
      const to = query.get('to');
      // UTC suffix is only a timezone-independent arithmetic surrogate for these naive URL boundaries.
      return from && to ? (Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 3_600_000 : null;
    }).toBe(8);
    const equipment = page.getByRole('combobox', { name: '설비', exact: true });
    await expect(equipment).toBeEnabled();
    await equipment.click();
    await page.getByRole('option', { name: 'eq-synth-01', exact: true }).click();
    await page.getByRole('button', { name: '이 구간 보기', exact: true }).click();
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => new URL(page.url()).searchParams.get('equipment')).toBe('eq-synth-01');
    await evidence(page, testInfo, 'eqv-sidebar-selected');
  });

  test('an inherited 24-hour window recovers through the equipment data-window action', async ({ page }, testInfo) => {
    await page.goto('/tools/eqv-topview?from=2025-12-31T10:30:00&to=2026-01-01T10:30:00');
    const equipment = page.getByRole('combobox', { name: '설비', exact: true });
    await expect(equipment).toBeEnabled();
    await equipment.click();
    await page.getByRole('option', { name: 'eq-synth-01', exact: true }).click();
    await expect(page.getByText('데이터 구간 2026-01-01 10:00:00 ~ 2026-01-01 10:30:00', { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe('2025-12-31T10:30:00');
    await page.getByRole('button', { name: '이 구간 보기', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe('2026-01-01T10:00:00');
    await expect.poll(() => new URL(page.url()).searchParams.get('to')).toBe('2026-01-01T10:30:00');
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, 'eqv-inherited-window-recovered');
  });

  test('engineer opens Top View, then Focus with Occurrence evidence labels', async ({ page }, testInfo) => {
    await page.goto(TOPVIEW);
    await expect(sidebar(page).getByRole('link', { name: MENU })).toBeVisible();
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    // #804: the platform page frame (PlatformPage) draws the page title around the screen (its page title; the Context bar is covered by the shell unit tests).
    await expect(page.getByRole('heading', { level: 1, name: MENU })).toBeVisible();
    await evidence(page, testInfo, 'eqv-topview');

    await page.getByRole('button', { name: 'Focus 열기' }).click();
    await expect(page).toHaveURL(/\/tools\/eqv-focus\?.*anchor=/);
    const occurrences = page.getByRole('grid', { name: 'Occurrence 목록' });
    await expect(occurrences).toBeVisible({ timeout: 15_000 });
    await expect(occurrences.getByRole('row').nth(1)).toBeVisible();
    await expect(occurrences.getByText('관측').first()).toBeVisible();
    await evidence(page, testInfo, 'eqv-focus');
  });

  test('viewer has no menu entry for it', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto(TOPVIEW);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: MENU })).toHaveCount(0);
    await expect(page.locator('[data-component-id]')).toHaveCount(0);
  });
});
