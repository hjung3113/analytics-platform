import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const dataRows = '[data-testid=data-row]';
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.locator(dataRows).first()).toBeVisible(); });
test('contract baseline is applied in real Chromium layout', async ({ page }) => {
  const contract = readFileSync('../../docs/06_platform_ui_contract.md', 'utf8');
  const design = readFileSync('../../DESIGN.md', 'utf8');
  expect(contract).toContain('Row height       32px'); expect(contract).toContain('Header height    32px'); expect(contract).toContain('Cell padding     4px 12px');
  expect(design).toContain('rowMinHeight: 32px'); expect(design).toContain('headerMinHeight: 32px'); expect(design).toContain('cellPadding: 4px 12px');
  for (const selector of [dataRows, '[role=columnheader]']) expect(await page.locator(selector).first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(32);
  const cell = page.locator('[role=cell]').first();
  await expect(cell).toHaveCSS('padding', '4px 12px');
  await expect(page.locator('.numeric').first()).toHaveCSS('text-align', 'right');
  await expect(page.locator('.numeric').first()).toHaveCSS('font-variant-numeric', 'tabular-nums');
});
test('HTTP sort/filter is paged and reaches server', async ({ page }) => {
  const responsePromise = page.waitForResponse(r => r.url().includes('category=B') && r.status() === 200);
  await page.getByLabel('Category', { exact: true }).selectOption('B');
  const payload = await (await responsePromise).json();
  expect(payload.total).toBe(500); expect(payload.rows).toHaveLength(250); expect(payload.rows.every((r: { category: string }) => r.category === 'B')).toBe(true);
  const sortedPromise = page.waitForResponse(r => r.url().includes('sort=numericValue'));
  await page.getByRole('button', { name: 'numericValue' }).click();
  const sorted = await (await sortedPromise).json();
  const values = sorted.rows.map((r: { numericValue: number }) => r.numericValue);
  expect(values).toEqual([...values].sort((a: number, b: number) => b - a));
  await expect(page.getByTestId('result-count')).toContainText('500 results');
});
test('virtualization mounts a moving window, not all 250 loaded rows', async ({ page }) => {
  const count = await page.locator(dataRows).count(); expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(50);
  const first = await page.locator(dataRows).first().getAttribute('data-row-id');
  await page.getByTestId('viewport').evaluate(el => { el.scrollTop = 3000; });
  await expect(page.locator(dataRows).first()).not.toHaveAttribute('data-row-id', first!);
  expect(await page.locator(dataRows).count()).toBeLessThan(50);
});
test('resize, visibility and pin persist through reload and pin stays fixed horizontally', async ({ page }) => {
  await page.getByText('Column preferences', { exact: true }).click();
  await page.getByLabel('Width id', { exact: true }).fill('240');
  await page.getByLabel('Show updatedAt', { exact: true }).uncheck();
  await page.getByLabel('Pin id', { exact: true }).check();
  await page.reload(); await page.getByText('Column preferences', { exact: true }).click();
  await expect(page.getByLabel('Width id', { exact: true })).toHaveValue('240');
  await expect(page.getByLabel('Show updatedAt', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Pin id', { exact: true })).toBeChecked();
  await expect(page.locator('[role=columnheader][data-column=updatedAt]')).toHaveCount(0);
  const header = page.locator('[role=columnheader][data-column=id]'); await expect(header).toHaveCSS('width', '240px');
  await page.setViewportSize({ width: 600, height: 1000 });
  const before = await header.evaluate(el => el.getBoundingClientRect().x);
  await page.getByTestId('viewport').evaluate(el => { el.scrollLeft = 200; });
  // TanStack orders the pinned column first; it remains at the viewport edge.
  expect(await page.getByTestId('viewport').evaluate(el => el.scrollLeft)).toBe(200);
  expect(await header.evaluate(el => el.getBoundingClientRect().x)).toBe(before);
  const pinned = await header.evaluate(el => el.getBoundingClientRect().x);
  await page.getByTestId('viewport').evaluate(el => { el.scrollLeft = 300; });
  expect(await header.evaluate(el => el.getBoundingClientRect().x)).toBe(pinned);
});
test('multi-select survives server page changes and can be cleared', async ({ page }) => {
  await page.getByLabel('Select row-0001', { exact: true }).check(); await page.getByLabel('Select row-0002', { exact: true }).check();
  await expect(page.getByTestId('selected-count')).toHaveText('2 selected');
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByTestId('result-count')).toContainText('Page 2');
  await page.getByRole('button', { name: 'Previous', exact: true }).click(); await expect(page.getByLabel('Select row-0001', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear selection' }).click(); await expect(page.getByTestId('selected-count')).toHaveText('0 selected');
});
test('drawer tabs and close preserve filter, sort, selection, Context and scroll', async ({ page }) => {
  await page.getByLabel('Category', { exact: true }).selectOption('A'); await expect(page.getByTestId('result-count')).toContainText('500 results');
  const sortedResponse = page.waitForResponse(r => r.url().includes('sort=numericValue') && r.url().includes('category=A') && r.status() === 200);
  await page.getByRole('button', { name: 'numericValue' }).click();
  const sorted = await (await sortedResponse).json();
  expect(sorted.rows[0].id).toBe('row-1709');
  await expect(page.locator(dataRows).first()).toHaveAttribute('data-row-id', sorted.rows[0].id);
  await expect(page.locator('[data-column=numericValue][role=columnheader]')).toHaveAttribute('aria-sort', 'descending');
  await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  const topRow = await page.locator(dataRows).first().getAttribute('data-row-id');
  await page.getByTestId('viewport').evaluate(el => { el.scrollTop = 1600; });
  await expect(page.locator(dataRows).first()).not.toHaveAttribute('data-row-id', topRow!);
  // Resolve the checkbox against the current virtual window; measured row heights
  // may replace an overscan row before the click settles.
  await page.locator(dataRows).nth(8).getByRole('checkbox').check();
  const id = await page.locator(`${dataRows}[aria-selected=true]`).getAttribute('data-row-id');
  const scroll = await page.getByTestId('viewport').evaluate(el => el.scrollTop);
  expect(scroll).toBeGreaterThan(1000);
  const drawerRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/rows?')) drawerRequests.push(request.url()); });
  await page.getByRole('button', { name: `Open ${id}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Context: synthetic-session');
  await page.getByRole('tab', { name: 'Audit', exact: true }).click(); await expect(page.getByRole('tabpanel')).toContainText('no real audit data');
  await page.getByRole('tab', { name: 'Details', exact: true }).click(); await expect(page.getByRole('tabpanel')).toContainText(id!);
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByLabel('Category', { exact: true })).toHaveValue('A');
  await expect(page.locator('[data-column=numericValue][role=columnheader]')).toHaveAttribute('aria-sort', 'descending');
  await expect(page.getByLabel(`Select ${id}`, { exact: true })).toBeChecked();
  expect(await page.getByTestId('viewport').evaluate(el => el.scrollTop)).toBe(scroll);
  await expect(page.getByRole('button', { name: `Open ${id}`, exact: true })).toBeFocused();
  expect(drawerRequests).toEqual([]);
});
test('loading, error/retry and empty are distinct', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/rows?**', async route => { await gate; await route.fulfill({ status: 500, body: '{}' }); });
  await page.getByLabel('Category', { exact: true }).selectOption('D'); await expect(page.getByRole('status')).toContainText('Loading…'); release();
  await expect(page.getByRole('alert')).toContainText('Unable to load rows');
  await page.unroute('**/api/rows?**'); await page.getByRole('button', { name: 'Retry' }).click(); await expect(page.getByTestId('result-count')).toContainText('500 results');
  await page.route('**/api/rows?**', route => route.fulfill({ json: { rows: [], total: 0 } }));
  await page.getByLabel('Category', { exact: true }).selectOption('C'); await expect(page.getByText('No matching rows.')).toBeVisible();
});
test('keyboard tabs/Escape restore focus and export is explicitly an entry', async ({ page }) => {
  await page.getByRole('button', { name: 'Open row-0001', exact: true }).click();
  await page.getByRole('tab', { name: 'Details', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Audit', exact: true })).toBeFocused(); await expect(page.getByRole('tab', { name: 'Audit', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Open row-0001', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Export', exact: true }).click(); await expect(page.getByRole('status')).toContainText('not connected');
});

test('sort, filter and page refresh retain rows and expose busy until response', async ({ page }) => {
  for (const change of [
    () => page.getByRole('button', { name: 'numericValue' }).click(),
    () => page.getByLabel('Category', { exact: true }).selectOption('A'),
    () => page.getByRole('button', { name: 'Next', exact: true }).click(),
  ]) {
    const firstId = await page.locator(dataRows).first().getAttribute('data-row-id');
    const height = await page.getByRole('rowgroup').last().evaluate(el => el.getBoundingClientRect().height);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/rows?**', async route => { await gate; await route.continue(); });
    const response = page.waitForResponse(r => r.url().includes('/api/rows?') && r.status() === 200);
    await change();
    await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator(dataRows).first()).toHaveAttribute('data-row-id', firstId!);
    expect(await page.getByRole('rowgroup').last().evaluate(el => el.getBoundingClientRect().height)).toBe(height);
    release();
    const payload = await (await response).json();
    await expect(page.locator(dataRows).first()).toHaveAttribute('data-row-id', payload.rows[0].id);
    await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'false');
    await page.unroute('**/api/rows?**');
  }
});
