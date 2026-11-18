import { expect, test, type Page } from '@playwright/test';
import { evidence, expandPageHead, query, queryBar, signInAs } from './support';

const SCREEN = '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00';
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

  test('bare route shows the matrix with default conditions and a folded query bar', async ({ page }, testInfo) => {
    await page.goto('/mars/configuration');
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
    await page.getByRole('button', { name: '설비 12대 선택', exact: true }).click();
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

    await workspace.getByRole('button', { name: '설정값 추세 동작', exact: true }).click();
    await page.getByRole('menuitem', { name: '숨기기', exact: true }).click();
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
    await expect.poll(async () => {
      const [matrix, trend] = await Promise.all([matrixPanel.boundingBox(), trendPanel.boundingBox()]);
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
