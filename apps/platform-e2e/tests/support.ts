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
export const liveContextBar = (page: Page) => page.getByRole('region', { name: '전역 Context' });
export const queryBar = (page: Page) => page.getByRole('region', { name: '조회 조건', exact: true });
// The result moves into the folded workspace query bar; expanded/other pages keep the strip.
export const queryResultSurface = (page: Page) => page.locator('[data-workspace-query-row], [role="region"][aria-label="적용된 조회 조건"]');
export const contextBar = (page: Page) => liveContextBar(page).or(queryBar(page));

/** Opens the inline page editor. Expand a folded workspace query bar first (#1941). */
export async function expandPageHead(page: Page) {
  const queryExpand = queryBar(page).getByRole('button', { name: '조회 조건 펼치기' });
  const row = page.locator('[data-workspace-query-row]');
  const expand = page.getByRole('button', { name: '페이지 머리 펼치기' });
  const collapse = page.getByRole('button', { name: '페이지 머리 접기' });
  // The folded row registers after the first render (#1941 C2); wait for one of the two layouts before choosing.
  await expect(row.or(expand).or(collapse).first()).toBeVisible();
  if (await row.count()) await queryExpand.click();
  await expect(expand.or(collapse)).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

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

/** The cycle-time workspace keeps the slow-execution list in a background tab of the default layout (ADR-0067 3b): bring it forward before reading its table. */
export async function showSlowExecutions(page: Page) {
  await page.getByRole('tab', { name: '느린 실행' }).click();
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

/** Header → cell text maps of every displayed data row in the main result table, for row-level contracts. */
export async function rowMapsByColumn(page: Page): Promise<Record<string, string>[]> {
  const table = page.getByRole('main').getByRole('table').first();
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headers = (await table.getByRole('columnheader').allInnerTexts()).map(h => h.trim());
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  const out: Record<string, string>[] = [];
  for (const row of await rows.all()) {
    const cells = await row.getByRole('cell').allInnerTexts();
    const map: Record<string, string> = {};
    headers.forEach((h, i) => { map[h] = (cells[i] ?? '').trim(); });
    out.push(map);
  }
  return out;
}

/** Status line of the platform table ("N건 · p/P 페이지"), after the query settled. */
export const tableStatusLine = (page: Page) =>
  page.locator('[aria-live="polite"]').filter({ hasText: '페이지' });

/** 방문(visit) count of one row in the 메뉴 활용률 table, read by row id after the summary settled. */
export async function usageVisits(page: Page, rowId: string): Promise<number> {
  const table = page.getByRole('main').getByRole('table').first();
  await expect(table).toBeVisible({ timeout: 10_000 });
  const headers = (await table.getByRole('columnheader').allInnerTexts()).map(h => h.trim());
  const index = headers.indexOf('방문');
  expect(index, 'usage table has a 방문 column').toBeGreaterThanOrEqual(0);
  const cell = table.locator(`[data-row-id="${rowId}"]`).getByRole('cell').nth(index);
  await expect(cell).toBeVisible();
  return Number((await cell.innerText()).trim());
}

/** Raw usage rows the mock server stored for this tab (dev-server handle `window.__apUsageEvents`, no `@ap/*` import). */
export async function storedUsageEvents(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => (window as unknown as { __apUsageEvents: () => Record<string, unknown>[] }).__apUsageEvents());
}

/**
 * A workspace starts stacked (ADR-0130). A check about the fitted arrangement chooses `화면 맞춤` in the toolbar's `⋯` once the workspace shows; a workspace
 * that already is fitted is left alone. Where the menu's `stackPreset` applies (cycle time), the 기본 preset comes back with it.
 */
export async function fitWorkspace(page: Page) {
  const root = page.locator('[data-panel-workspace]').first();
  await expect(root).toBeVisible();
  if ((await root.getAttribute('data-workspace-mode')) === 'fit') return;
  await page.getByRole('button', { name: '높이 방식', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '화면 맞춤' }).click();
  await expect(root).toHaveAttribute('data-workspace-mode', 'fit');
  await page.evaluate(() => new Promise(done => { requestAnimationFrame(() => { requestAnimationFrame(done); }); }));
}

/** Waits for two animation frames, so a layout or a React commit that the last input caused has been drawn. A frame wait is not a sleep: it ends when the browser has painted. */
export async function nextFrames(page: Page) {
  await page.evaluate(() => new Promise(done => { requestAnimationFrame(() => { requestAnimationFrame(done); }); }));
}

/** Waits until `read()` returns the same value on two consecutive polls (a layout, a count or a stored value that has stopped moving). */
export async function settleOn(read: () => Promise<unknown>, message?: string) {
  let last: string | undefined;
  await expect.poll(async () => { const now = JSON.stringify(await read()); const same = now === last; last = now; return same; }, { message }).toBe(true);
}
