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

  test('bare route keeps the SDK idle state until the single kernel Apply', async ({ page }, testInfo) => {
    await page.goto('/mars/configuration');
    await expect(grid(page)).toHaveCount(0);
    await expect(page.getByText('아직 조회하지 않았습니다', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '비교 실행', exact: true })).toHaveCount(0);
    await expect(queryBar(page).getByRole('button', { name: '적용', exact: true })).toHaveCount(1);
    await queryBar(page).getByRole('button', { name: '적용', exact: true }).click();
    await expect(grid(page)).toBeVisible();
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
    await expect(bottom).toContainText(/1\/[\d,]+/);
    await expect(grid(page).locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: '다음 차이', exact: true }).click();
    await expect(bottom).toContainText(/2\/[\d,]+/);
    await page.getByRole('button', { name: '이전 차이', exact: true }).click();
    await expect(bottom).toContainText(/1\/[\d,]+/);
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
});
