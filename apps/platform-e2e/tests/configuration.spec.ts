import { type Page } from '@playwright/test';
import { expect, test } from './origin-guard';
import { evidence, expandPageHead, query, queryBar, signInAs } from './support';

const SCREEN = '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00';
const grid = (page: Page) => page.getByRole('treegrid', { name: 'Configuration', exact: true });
const summary = (page: Page) => page.locator('[data-configuration-summary]');
async function open(page: Page, suffix = '') {
  await page.goto(`${SCREEN}${suffix}`);
  await expect(grid(page)).toBeVisible();
  await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
}
async function filter(page: Page, field: string, value: string) {
  await page.getByRole('button', { name: '필터 추가', exact: true }).click();
  const picker = page.locator('[data-filter-pick]').filter({ hasText: field });
  await picker.filter({ hasText: new RegExp(`^${field}$`) }).click();
  await page.getByRole('textbox', { name: '값', exact: true }).fill(value);
  await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: '적용', exact: true }).click();
  await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
}

test.describe('Configuration', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  test('Scope-only route shows the matrix with default conditions and a folded query bar', async ({ page }, testInfo) => {
    await page.goto('/mars/configuration?v=1&scopeId=MEM');
    await expect(grid(page)).toBeVisible();
    await expect(queryBar(page).getByRole('button', { name: '조회 조건 펼치기', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: '비교 실행', exact: true })).toHaveCount(0);
    await expect(page.getByText('아직 조회하지 않았습니다', { exact: true })).toHaveCount(0);
    await expect(grid(page).locator('[data-matrix-row="cfg-000000"]')).toHaveAttribute('aria-level', '3');
    await expect(grid(page).locator('[data-matrix-row="cfg-000000"]')).toContainText('config.cfg');
    await expect.poll(() => query(page).has('from') && query(page).has('to')).toBe(true);
    await evidence(page, testInfo, 'configuration-default-condition');
  });

  test('edits comparison conditions in the kernel draft and blocks explicit-empty equipment', async ({ page }, testInfo) => {
    await open(page);
    await expandPageHead(page);
    await page.getByRole('combobox', { name: '비교 모드', exact: true }).click();
    await page.getByRole('option', { name: '기준 설비 비교', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '기준 설비', exact: true })).toBeVisible();
    await expect.poll(() => query(page).has('mode')).toBe(false);
    await queryBar(page).getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('mode')).toBe('reference');
    await expect(page.locator('[data-platform-page]')).toContainText('기준 설비 비교');
    await expect(page.locator('[data-platform-page]')).not.toContainText('mode reference');
    const bar = queryBar(page);
    await expect(bar.getByRole('button', { name: '조회 조건 펼치기', exact: true })).toBeVisible();
    await bar.getByRole('button', { name: /^페이지 조건/ }).click();
    const conditions = page.getByRole('dialog', { name: '페이지 조건', exact: true });
    await conditions.getByRole('button', { name: '설비 12대 선택', exact: true }).click();
    await page.getByRole('button', { name: '모두 지우기', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(queryBar(page).getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await expect(queryBar(page)).toContainText('설비를 2대 이상 선택하세요');
    await expect.poll(() => query(page).has('equipment')).toBe(false);
    await evidence(page, testInfo, 'configuration-kernel-draft-empty');
  });

  test('expands and collapses the server tree', async ({ page }, testInfo) => {
    await open(page);
    await grid(page).getByRole('button', { name: 'PM1 접기', exact: true }).click();
    await expect(grid(page).getByRole('button', { name: 'PM1 펼치기', exact: true })).toBeVisible();
    await expect(grid(page).getByText('Gas Line 01', { exact: true })).toHaveCount(0);
    await grid(page).getByRole('button', { name: 'PM1 펼치기', exact: true }).click();
    await expect(grid(page).getByText('Gas Line 01', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'configuration-tree');
  });

  test('keeps the matrix rows visible while the item drawer is open', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.locator('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ01"]').click();
    await page.getByRole('button', { name: '선택 상세 열기', exact: true }).click();
    await expect(page.getByRole('tab', { name: '비교 상세', exact: true })).toBeVisible();
    const viewport = page.locator('[data-matrix-viewport]');
    await expect.poll(async () => (await viewport.boundingBox())?.height ?? 0).toBeGreaterThan(200);
    await expect(grid(page).locator('[data-matrix-row="cfg-000000"]')).toBeInViewport();
    await evidence(page, testInfo, 'configuration-drawer-matrix');
  });

  test('reveals the next difference using its server offset', async ({ page }, testInfo) => {
    await open(page);
    await page.getByRole('button', { name: '다음 차이', exact: true }).click();
    const bottom = page.locator('[data-configuration-bottom]');
    const selectedCell = page.locator('[role="gridcell"][aria-selected="true"]');
    const selectedRow = grid(page).getByRole('row').filter({ has: selectedCell });
    await expect(bottom.getByText(/^1\/[\d,]+$/)).toBeVisible();
    await expect(selectedRow).toHaveCount(1);
    const firstRowId = await selectedRow.getAttribute('data-matrix-row');
    await page.getByRole('button', { name: '다음 차이', exact: true }).click();
    await expect(bottom.getByText(/^2\/[\d,]+$/)).toBeVisible();
    await expect(grid(page)).toHaveAttribute('aria-busy', 'false');
    await expect(selectedRow).not.toHaveAttribute('data-matrix-row', firstRowId!);
    await page.getByRole('button', { name: '이전 차이', exact: true }).click();
    await expect(bottom.getByText(/^1\/[\d,]+$/)).toBeVisible();
    await expect(selectedRow).toHaveAttribute('data-matrix-row', firstRowId!);
    await evidence(page, testInfo, 'configuration-navigation');
  });

  test('changes level order and regroups the first axis', async ({ page }, testInfo) => {
    await open(page);
    await page.getByRole('button', { name: '단계 순서', exact: true }).click();
    await page.getByRole('button', { name: 'Category 위로 이동', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => query(page).get('levels')).toBe('category,module');
    await expect(grid(page).locator('[data-matrix-row][aria-level="1"]').first()).toContainText('Gas Line 01');
    await evidence(page, testInfo, 'configuration-levels');
  });

  test('filters the full result and narrows summary counts', async ({ page }, testInfo) => {
    await open(page, '&status=all');
    await expect(summary(page)).toContainText('일치 포함 전체 90,000');
    await filter(page, 'Module', 'LL-B');
    await expect(summary(page)).toContainText('일치 포함 전체 15,000');
    await expect(grid(page).locator('[data-matrix-row][aria-level="1"]').first()).toContainText('LL-B');
    await evidence(page, testInfo, 'configuration-filter');
  });

  test('hides whole-result unchanged columns while retaining the reference', async ({ page }, testInfo) => {
    await open(page, '&mode=reference&ref=EQ01&status=all');
    await filter(page, 'Item', 'Valve Mode');
    await expect(grid(page).getByRole('columnheader', { name: 'EQ12', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: '차이 없는 설비 숨기기', exact: true }).click();
    await expect.poll(() => query(page).get('hideSameCols')).toBe('1');
    await expect(grid(page).getByRole('columnheader', { name: 'EQ12', exact: true })).toHaveCount(0);
    await expect(grid(page).getByRole('columnheader', { name: 'EQ01 기준', exact: true })).toHaveCount(1);
    await evidence(page, testInfo, 'configuration-hidden-columns');
  });

  test('emphasizes matching values with an outline and equipment count, then clears', async ({ page }, testInfo) => {
    await open(page);
    await page.getByRole('button', { name: '다음 차이', exact: true }).click();
    await expect(page.getByRole('button', { name: '같은 값 강조', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '같은 값 강조', exact: true }).click();
    await expect(page.getByRole('group', { name: '강조', exact: true })).toContainText('강조 1');
    const outlined = grid(page).locator('[data-matrix-column].outline-dashed');
    await expect.poll(() => outlined.count()).toBeGreaterThan(0);
    await expect(grid(page).getByText(/\d+대 해당/)).toBeVisible();
    await evidence(page, testInfo, 'configuration-emphasis');
    await page.getByRole('group', { name: '강조', exact: true }).getByRole('button', { name: '모두 지우기', exact: true }).click();
    await expect(outlined).toHaveCount(0);
    await expect(grid(page).getByRole('columnheader', { name: '강조', exact: true })).toHaveCount(0);
  });

  test('opens numeric trend below the matrix, then shows string lanes and closes', async ({ page }, testInfo) => {
    const viewport = { width: 1600, height: 900 };
    await page.setViewportSize(viewport);
    await open(page, '&status=all');
    const workspace = page.locator('[data-panel-workspace]');
    const matrixPanel = workspace.locator('[data-dock-panel="matrix"]');
    const trendPanel = workspace.locator('[data-dock-panel="trend"]');
    const trend = page.locator('[data-configuration-trend]');
    await expect.poll(async () => {
      const bounds = await matrixPanel.boundingBox();
      return bounds ? Math.abs(viewport.height - (bounds.y + bounds.height)) : Infinity;
    }).toBeLessThanOrEqual(24);
    await grid(page).locator('[data-matrix-row="cfg-000000"] [data-matrix-column="identity"]').dblclick();
    await expect(trend.locator('[data-configuration-numeric]')).toBeVisible();
    await expect(trend.getByRole('img', { name: /^설비별 값/ })).toBeVisible();
    await expect.poll(() => query(page).get('trendItem')).toBe('cfg-000000');
    // #2518: the untouched matrix and the newly opened trend share the visible area.
    await expect(matrixPanel).toBeInViewport({ ratio: 1 });
    await expect(trendPanel).toBeInViewport({ ratio: 1 });
    const matrixBounds = await grid(page).boundingBox();
    const panelBounds = await matrixPanel.boundingBox();
    const trendBounds = await trend.boundingBox();
    expect(matrixBounds!.height).toBeLessThanOrEqual(panelBounds!.height);
    expect(trendBounds!.y).toBeGreaterThanOrEqual(matrixBounds!.y + matrixBounds!.height);
    await expect(workspace.locator('[data-dock-row-separator="0"]')).toBeVisible();

    await workspace.getByRole('tab', { name: '설정값 추세', exact: true }).press('Shift+F10');
    const more = page.getByRole('dialog', { name: '더보기', exact: true });
    await more.getByRole('group', { name: '배치', exact: true }).getByRole('button', { name: '숨기기', exact: true }).click();
    await expect(trend).toHaveCount(0);
    await grid(page).locator('[data-matrix-row="cfg-000001"] [data-matrix-column="identity"]').dblclick();
    await expect(trend.locator('[data-lane-scroll]')).toBeVisible();
    const reopenedBounds = await trend.boundingBox();
    const currentPanelBounds = await matrixPanel.boundingBox();
    expect(reopenedBounds!.y).toBeGreaterThanOrEqual(currentPanelBounds!.y + currentPanelBounds!.height);
    await evidence(page, testInfo, 'configuration-trend-reopened');
    await expect(trend.getByText('EQ01', { exact: true })).toBeVisible();
    await expect(trend.getByText('AUTO', { exact: true })).toBeVisible();
    await trend.getByRole('button', { name: '추세 닫기' }).click();
    await expect(trend).toHaveCount(0);
    await expect.poll(() => query(page).has('trendItem')).toBe(false);
    await expect(grid(page)).toBeVisible();
  });

  test('opening the trend splits the area evenly and keeps the double-clicked row inside the matrix (#2518)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page, '&status=all');
    const workspace = page.locator('[data-panel-workspace]');
    const matrixPanel = workspace.locator('[data-dock-panel="matrix"]');
    const trendPanel = workspace.locator('[data-dock-panel="trend"]');
    const row = grid(page).locator('[data-matrix-row^="cfg-"]').nth(10);
    const id = await row.getAttribute('data-matrix-row');
    await row.locator('[data-matrix-column="identity"]').dblclick();
    await expect.poll(() => query(page).get('trendItem')).toBe(id);
    await expect(trendPanel).toBeInViewport({ ratio: 1 });
    // The split gives both panes the same outer height. Their headers have different heights.
    const group = (id: string) => workspace.locator('.dv-groupview').filter({
      has: page.locator(`[role="tab"][data-tab-panel-id="${id}"]`),
    });
    await expect(matrixPanel).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => {
      const [matrix, trend] = await Promise.all([group('matrix').boundingBox(), group('trend').boundingBox()]);
      return matrix && trend ? Math.abs(matrix.height - trend.height) : Infinity;
    }).toBeLessThanOrEqual(2);
    // Vertically inside the matrix viewport, below its sticky header (the row is wider than the viewport, so not a whole-element ratio).
    await expect.poll(() => page.evaluate(rowId => {
      const viewport = document.querySelector('[data-matrix-viewport]')!;
      const head = document.querySelector('[data-matrix-viewport] [role="row"]')!.getBoundingClientRect();
      const box = viewport.getBoundingClientRect();
      const target = document.querySelector(`[data-matrix-row="${rowId}"]`)!.getBoundingClientRect();
      return target.top >= head.bottom - 1 && target.bottom <= box.top + viewport.clientTop + viewport.clientHeight + 1;
    }, id)).toBe(true);
  });

  test('the wheel over string lanes that fit scrolls the trend panel (#2518)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page, '&status=all');
    await grid(page).locator('[data-matrix-row="cfg-000001"] [data-matrix-column="identity"]').dblclick();
    const trend = page.locator('[data-configuration-trend]');
    const lanes = trend.locator('[data-lane-scroll]');
    await expect(lanes).toBeVisible();
    await expect.poll(() => trend.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const box = (await lanes.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 40, 880));
    await page.mouse.wheel(0, 300);
    await expect.poll(() => trend.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  });

  test('captures and restores the trend item in a saved menu view', async ({ page }, testInfo) => {
    await open(page, '&status=all');
    await expandPageHead(page);
    const trend = page.locator('[data-configuration-trend]');
    await grid(page).locator('[data-matrix-row="cfg-000001"] [data-matrix-column="identity"]').dblclick();
    await expect(trend.locator('[data-lane-scroll]')).toBeVisible();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('menuitem', { name: '새 뷰로 저장', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '뷰 저장' });
    await dialog.getByRole('radio', { name: /^메뉴 뷰/ }).click();
    await dialog.getByLabel('뷰 이름').fill('Configuration 추세');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장된 뷰: Configuration 추세' })).toBeVisible();

    await trend.getByRole('button', { name: '추세 닫기' }).click();
    await expect.poll(() => query(page).has('trendItem')).toBe(false);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('menuitem', { name: '저장본으로 되돌리기', exact: true }).click();
    await expect.poll(() => query(page).get('trendItem')).toBe('cfg-000001');
    await expect(trend.locator('[data-lane-scroll]')).toBeVisible();
    await evidence(page, testInfo, 'configuration-saved-trend');
  });
});

const equipmentGrid = (page: Page) => page.getByRole('grid', { name: 'Configuration', exact: true });
const axis = (page: Page, name: '설비 기준' | '항목 기준') => page.getByRole('radio', { name, exact: true });

async function saveConfigurationView(page: Page, name: string) {
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('menuitem', { name: '새 뷰로 저장', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '뷰 저장' });
  await dialog.getByRole('radio', { name: /^메뉴 뷰/ }).click();
  await dialog.getByLabel('뷰 이름').fill(name);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('button', { name: `저장된 뷰: ${name}` })).toBeVisible();
}

test.describe('Configuration lent HW Time trend', () => {
  const lent = (page: Page) => page.locator('[data-configuration-lent-hwtime]');
  const cell = (page: Page, item: string) => grid(page).locator(`[data-matrix-row="${item}"] [data-matrix-column="EQ03"]`);
  const scopeComparison = '&status=all&equipment=EQ01,EQ03';
  const requests = (page: Page) => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
    .filter(entry => (entry as PerformanceMark).detail?.endpoint === 'hwTime.runs').length);

  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  test('opens both trends side by side, closes to the selected cell, and restores the saved and shared views', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page, scopeComparison);
    await expandPageHead(page);
    const selected = cell(page, 'cfg-000000');
    await selected.dblclick();
    const settings = page.locator('[data-dock-panel="trend"]');
    const hwTime = page.locator('[data-dock-panel="hw-time-trend"]');
    await expect(lent(page)).toBeVisible();
    await expect(lent(page).getByRole('img', { name: /EQ01.*EQ03/ })).toBeVisible();
    await expect.poll(async () => {
      const [left, right] = await Promise.all([settings.boundingBox(), hwTime.boundingBox()]);
      return !!left && !!right && Math.abs(left.y - right.y) <= 1 && left.x + left.width <= right.x + 1;
    }).toBe(true);
    const link = lent(page).getByRole('link', { name: 'HW Time에서 열기', exact: true });
    const destination = new URL((await link.getAttribute('href'))!, page.url());
    expect(destination.pathname).toBe('/mars/hw-time');
    expect(destination.searchParams.get('scopeId')).toBe('MEM');
    expect(destination.searchParams.getAll('selectedEquipmentIds')).toEqual(['MEM-PHOTO-0103', 'MEM-PHOTO-0108']);
    expect(destination.searchParams.get('from')).toBe(query(page).get('from'));
    expect(destination.searchParams.get('drillMotion')).toBe('Pump');
    await evidence(page, testInfo, 'configuration-shared-trend-row');
    const shared = page.url();
    await saveConfigurationView(page, 'Configuration HW Time 추세');
    await lent(page).getByRole('button', { name: 'HW Time 추세 닫기', exact: true }).click();
    await expect(lent(page)).toHaveCount(0);
    await expect(selected).toBeFocused();
    await expect(settings).toBeVisible();
    await revertConfigurationView(page);
    await expect(lent(page)).toBeVisible();
    await page.goto(shared);
    await expect(settings).toBeVisible();
    await expect(lent(page)).toBeVisible();
    await cell(page, 'cfg-000002').click();
    await expect(lent(page)).toHaveCount(0);
    await expect(settings).toBeVisible();
  });

  test('keeps a permitted Configuration trend and sends zero HW Time requests when the source is denied', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('platform:test:configuration-lending-denial', '1'));
    await open(page, `${scopeComparison}&trendItem=cfg-000000`);
    await expect(page.locator('[data-configuration-trend]')).toBeVisible();
    await expect(page.locator('[data-configuration-bottom]')).toContainText('HW Time의 HTM 추세 패널을 볼 권한이 없습니다.');
    await expect(lent(page)).toHaveCount(0);
    expect(await requests(page)).toBe(0);
    await evidence(page, testInfo, 'configuration-lending-denial');
  });

  test('asks for Scope before sending a request for the linked item', async ({ page }) => {
    await page.goto(SCREEN.replace('&scopeId=MEM', '') + scopeComparison + '&trendItem=cfg-000000');
    await expect(page.getByRole('main').getByText('Scope를 선택하세요')).toBeVisible();
    await expect(lent(page)).toHaveCount(0);
    expect(await requests(page)).toBe(0);
  });
});

async function revertConfigurationView(page: Page) {
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('menuitem', { name: '저장본으로 되돌리기', exact: true }).click();
}

test.describe('Configuration equipment axis', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  test('switches axes, opens the same item detail and trend, and supports Back', async ({ page }) => {
    await open(page, '&status=all&q=cfg-0000');
    await axis(page, '설비 기준').click();
    await expect(axis(page, '설비 기준')).toBeChecked();
    const cell = equipmentGrid(page).getByRole('gridcell', { name: /^EQ01 · PM1 › Gas Line 01 · Pressure Setpoint \(config\.cfg\) ·/ }).first();
    await cell.click();
    await expect(cell).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '선택 상세 열기', exact: true }).click();
    await expect(page.getByRole('tab', { name: '비교 상세', exact: true })).toBeVisible();
    await expect(page.getByText('PM1 / Gas Line 01 / Pressure Setpoint / config.cfg', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '상세 닫기', exact: true }).click();
    await cell.press('Enter');
    await expect.poll(() => query(page).get('trendItem')).toBe('cfg-000000');
    await page.goBack();
    await expect.poll(() => query(page).has('trendItem')).toBe(false);
    await page.goBack();
    await expect(axis(page, '항목 기준')).toBeChecked();
    await expect(grid(page)).toBeVisible();
  });

  test('arrow keys move the axis selection with the focus, both ways (#2552)', async ({ page }, testInfo) => {
    await open(page, '&status=all&q=cfg-0000');
    await axis(page, '항목 기준').focus();
    await page.keyboard.press('ArrowRight');
    await expect(axis(page, '설비 기준')).toBeFocused();
    await expect(axis(page, '설비 기준')).toBeChecked();
    await expect.poll(() => query(page).get('axis')).not.toBeNull();
    await expect(equipmentGrid(page)).toBeVisible();
    await evidence(page, testInfo, 'configuration-axis-arrow-selects');
    await page.keyboard.press('ArrowLeft');
    await expect(axis(page, '항목 기준')).toBeChecked();
    await expect.poll(() => query(page).has('axis')).toBe(false);
    await expect(grid(page)).toBeVisible();
  });

  test('restores a saved equipment axis and filter with the limit notice', async ({ page }) => {
    await open(page, '&status=all');
    await filter(page, 'Module', 'PM1');
    await expandPageHead(page);
    await axis(page, '설비 기준').click();
    const limit = page.getByRole('status').filter({ hasText: '항목 15,000개 · 최대 200개까지 표시할 수 있습니다.' });
    await expect(limit).toBeVisible();
    await expect(equipmentGrid(page)).toHaveCount(0);
    await saveConfigurationView(page, 'Configuration 설비 기준 제한');
    await axis(page, '항목 기준').click();
    await expect(grid(page)).toBeVisible();
    await page.getByRole('button', { name: /Module.*지우기/ }).click();
    await expect(summary(page)).toContainText('일치 포함 전체 90,000');
    await revertConfigurationView(page);
    await expect(axis(page, '설비 기준')).toBeChecked();
    await expect(limit).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });

  test('restores a saved view created without an axis key to item axis', async ({ page }) => {
    await open(page, '&status=all&q=cfg-0000');
    await expandPageHead(page);
    await saveConfigurationView(page, 'Configuration 항목 기준');
    await axis(page, '설비 기준').click();
    await expect(equipmentGrid(page)).toBeVisible();
    await revertConfigurationView(page);
    await expect(axis(page, '항목 기준')).toBeChecked();
    await expect(grid(page)).toBeVisible();
    await expect.poll(() => query(page).has('axis')).toBe(false);
  });
});
