import { expect, test, type Page } from '@playwright/test';
import { evidence, expectScopeValid, query, signInAs } from './support';

const SCREEN = '/mars/hw-time?v=1&scopeId=MEM';
const workspace = (page: Page) => page.getByRole('region', { name: 'HW Time 분석 영역', exact: true });
const panel = (page: Page, id: string) => workspace(page).locator(`[data-dock-panel="${id}"]`);
const node = (page: Page, id: string) => panel(page, 'tree').locator(`[role="treeitem"][data-id="${id}"]`).first();
async function drill(page: Page, id: string) {
  await node(page, id).getByText(id.split('/').at(-1)!, { exact: true }).click();
}
async function add(page: Page, title: string) {
  await page.getByRole('button', { name: '패널 추가', exact: true }).click();
  await page.getByRole('menuitem', { name: title, exact: true }).click();
}
async function activatePoint(page: Page, row: string) {
  await panel(page, 'current').getByRole('button', { name: '더보기', exact: true }).click();
  const tools = page.getByRole('dialog', { name: '더보기', exact: true });
  const picker = tools.getByRole('combobox', { name: '차트 지점 선택' });
  const option = picker.locator('option').filter({ hasText: row }).first();
  await picker.selectOption({ value: (await option.getAttribute('value'))! });
  // The Frame's keyboard command uses the same callback as pointer double-click.
  await tools.getByRole('button', { name: '선택 지점 실행' }).click();
  if (await tools.isVisible()) await page.keyboard.press('Escape');
}

test.describe('HW Time stepped workspace — drill, options, add and pin', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    test(`${viewport.width}: type → Motion → Module restores four step defaults`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(SCREEN);
      await expectScopeValid(page, 'MEM · 메모리');
      await expect(panel(page, 'tree')).toBeVisible();
      await expect(panel(page, 'current').getByRole('img')).toBeVisible();
      for (const id of ['previous', 'heatmap', 'motionTable', 'scatter', 'trend', 'table']) await expect(panel(page, id)).toHaveCount(0);
      await drill(page, 'PM');
      await expect.poll(() => query(page).get('moduleType')).toBe('PM');
      await expect(panel(page, 'previous')).toBeVisible();
      await expect(panel(page, 'current').getByRole('group', { name: '범례', exact: true })).toBeVisible();
      await drill(page, 'PM/Pump');
      await expect.poll(() => query(page).get('drillMotion')).toBe('Pump');
      await expect(panel(page, 'current').getByRole('group', { name: '범례', exact: true })).toHaveCount(0);
      await drill(page, 'PM/Pump/PM2');
      await expect.poll(() => query(page).get('drillModule')).toBe('PM2');
      await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
      await expect(panel(page, 'scatter')).toHaveCount(0);
      await expect(panel(page, 'current')).toContainText('PM2');
      await expect(panel(page, 'current')).toContainText('Pump');
      await expect(panel(page, 'current').getByRole('group', { name: '그룹', exact: true })).toHaveCount(0);
      await evidence(page, testInfo, `hw-stepped-${viewport.width}`);
      await page.reload();
      await expect(node(page, 'PM/Pump/PM2')).toHaveAttribute('aria-current', 'true');
      await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
      await expect.poll(() => page.locator('main').evaluate(main => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1);
    });
  }

  test('step-1 activation drills, step-2 activation opens the point trend, and pinned scatter follows the drill', async ({ page }) => {
    await page.goto(SCREEN);
    await activatePoint(page, 'EQ-001');
    await expect.poll(() => query(page).get('moduleType')).toBe('PM');
    await expect(panel(page, 'previous')).toContainText('설비별 Module 타입 평균');
    await activatePoint(page, 'EQ-001 · PM1');
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    expect(query(page).get('drillModule')).toBeNull();
    await add(page, '분포');
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    await drill(page, 'PM/Chuck');
    await drill(page, 'PM/Chuck/PM1');
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    await page.reload();
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
  });

  test('add list gives disabled reasons, and tree checks persist without new reads', async ({ page }) => {
    await page.goto(`${SCREEN}&moduleType=PM&drillMotion=Chuck&drillModule=PM1`);
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    await expect(panel(page, 'trend').getByRole('img', { name: /^일별 HTM 판정 건수:/ })).toBeVisible();
    await expect(panel(page, 'trend')).not.toContainText('HTM 하한: · HTM 상한:');
    // The verdict bars must not squeeze the trend plot to nothing in a short below-row (#2426 capture).
    expect((await panel(page, 'trend').getByRole('img', { name: /^추세:/ }).boundingBox())?.height ?? 0).toBeGreaterThan(100);
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    const requests = () => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query').length);
    const before = await requests();
    const check = node(page, 'PM/Chuck/PM2').getByRole('checkbox', { name: 'PM2', exact: true });
    await check.click();
    await expect(check).toHaveAttribute('aria-checked', 'false');
    expect(query(page).has('module')).toBe(false);
    expect(await requests()).toBe(before);
    await page.reload();
    await expect(check).toHaveAttribute('aria-checked', 'false');
    await page.goto(SCREEN);
    await page.getByRole('button', { name: '패널 추가', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /설비 × Module 히트맵/ })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('menu')).toContainText('Module 타입을 고르면 볼 수 있음');
  });

  test('malformed drill is rejected before any data read', async ({ page }) => {
    await page.goto(`${SCREEN}&drillModule=PM1`);
    await expect(page.getByText(/Module.*PM1.*이 화면에서 쓸 수 없/)).toBeVisible();
    await expect(panel(page, 'current')).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query').length)).toBe(0);
  });

  test('saved legacy board tile restores the new step and keeps its board identity', async ({ page }) => {
    await page.addInitScript(() => {
      const marker = 'hw-time-legacy-seeded';
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem('platform:board-layout-engine', 'dock');
      localStorage.setItem('platform:board:engineer', JSON.stringify({ v: 1, activeSheetId: 'hw-legacy', sheets: [{
        id: 'hw-legacy', name: 'HW legacy', layout: '1x1', selected: 0, panes: [{ menuId: 'hw-time-steps', params: {},
          query: '?v=1&scopeId=MEM&view=steps&moduleType=PM&drillMotion=Chuck&drillModule=PM1&row=EQ-001%20%C2%B7%20PM1' }],
      }] }));
      sessionStorage.setItem(marker, '1');
    });
    await page.goto('/board?sheet=hw-legacy');
    await expect(panel(page, 'tree')).toBeVisible();
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/board');
    await page.reload();
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    const saved = await page.evaluate(() => localStorage.getItem('platform:board:v2:engineer') ?? '');
    expect(saved).toContain('"menuId":"hw-time"');
    expect(saved).not.toContain('hw-time-steps');
  });

  for (const id of ['steps', 'compare', 'overview', 'table']) {
    test(`legacy ${id} paths and obsolete view keys open step 1`, async ({ page }) => {
      for (const path of [`/hw-time/${id}`, `/mars/hw-time-${id}`, '/mars/hw-time']) {
        await page.goto(`${path}?v=1&scopeId=MEM&view=${id}&minmax=ignored`);
        await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/hw-time');
        await expect(panel(page, 'tree')).toBeVisible();
        await expect(panel(page, 'current').getByRole('img')).toBeVisible();
        await expect(panel(page, 'previous')).toHaveCount(0);
      }
    });
  }
});
