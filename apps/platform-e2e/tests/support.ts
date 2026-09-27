import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Black-box helpers: everything goes through the rendered app and the dev tools, never through @ap/* imports.
 * Roles are the mock server's session stand-in (localStorage `platform:role`, read at load); response scenarios
 * live in the tab's mock server and are flipped through the dev tools' scenario popover.
 */
export type Role = 'engineer' | 'admin' | 'viewer';

export async function signInAs(page: Page, role: Role) {
  await page.addInitScript(r => localStorage.setItem('platform:role', JSON.stringify(r)), role);
}

/** Dev-tools scenario label (ko) → mock response scenario. */
export async function setScenario(page: Page, label: string) {
  await page.getByRole('button', { name: '응답 시나리오' }).click();
  await page.getByRole('radio', { name: label }).click();
  await page.keyboard.press('Escape');
}

export async function switchScope(page: Page, label: string) {
  await page.getByRole('button', { name: /^Scope:/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(label) }).click();
}

export async function evidence(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`evidence:${name}`, { body: await page.screenshot(), contentType: 'image/png' });
}

export const mainHeading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 });
export const contextBar = (page: Page) => page.getByRole('region', { name: '전역 Context' });

export async function expectScopeValid(page: Page, label: string) {
  await expect(page.getByRole('button', { name: `Scope: ${label}` })).toContainText('서버 검증됨');
}

/** Query params of the current URL, for exact Context comparisons independent of key order and encoding. */
export function query(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** Lot values of the rendered result table (column header "Lot"), after the query settled. */
export async function lotColumn(page: Page): Promise<string[]> {
  const table = page.getByRole('main').getByRole('table').first();
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const index = headers.findIndex(h => h.trim().toLowerCase() === 'lot');
  expect(index, 'result table has a Lot column').toBeGreaterThanOrEqual(0);
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  const values: string[] = [];
  for (const row of await rows.all()) values.push((await row.getByRole('cell').nth(index).innerText()).trim());
  return values;
}

/** Header → cell text map of the first data row in the main result table (06 §6.1 fixtures). */
export async function firstRowByColumn(page: Page): Promise<Record<string, string>> {
  const table = page.getByRole('main').getByRole('table').first();
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headers = (await table.getByRole('columnheader').allInnerTexts()).map(h => h.trim());
  const row = table.getByRole('row').filter({ has: page.getByRole('cell') }).first();
  await expect(row).toBeVisible();
  const cells = await row.getByRole('cell').allInnerTexts();
  const out: Record<string, string> = {};
  headers.forEach((h, i) => { out[h] = (cells[i] ?? '').trim(); });
  return out;
}

/** Status line of the platform table ("N건 · p/P 페이지"), after the query settled. */
export const tableStatusLine = (page: Page) =>
  page.locator('[aria-live="polite"]').filter({ hasText: '페이지' });
