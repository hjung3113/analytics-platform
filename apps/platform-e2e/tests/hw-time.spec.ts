import { expect, test, type Page } from '@playwright/test';
import { evidence, expectScopeValid, query, signInAs } from './support';

const SCREEN = '/mars/hw-time?v=1&scopeId=MEM';
const workspace = (page: Page) => page.getByRole('region', { name: 'HW Time 분석 영역', exact: true });
const panel = (page: Page, id: string) => workspace(page).locator(`[data-dock-panel="${id}"]`);

async function enterBar(page: Page, row: string) {
  const bars = panel(page, 'bars');
  await bars.getByRole('button', { name: '더보기', exact: true }).click();
  const tools = page.getByRole('dialog', { name: '더보기', exact: true });
  const picker = tools.getByRole('combobox', { name: '차트 지점 선택' });
  const option = picker.locator('option').filter({ hasText: row }).first();
  await picker.selectOption({ value: (await option.getAttribute('value'))! });
  await tools.getByRole('button', { name: '선택 지점 실행' }).click();
  if (await tools.isVisible()) await page.keyboard.press('Escape');
}

/** Find a painted heatmap cell, excluding grey axes and text, then click its interior. No engine instance access. */
async function clickHeatmap(page: Page) {
  const canvas = panel(page, 'heatmap').locator('canvas').first();
  await expect(canvas).toBeVisible();
  const paintedCell = () => canvas.evaluate(element => {
    const c = element as HTMLCanvasElement;
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let y = 16; y < c.height - 16; y += 3) {
      let start = -1;
      for (let x = 16; x < c.width - 16; x++) {
        const i = (y * c.width + x) * 4;
        const coloured = pixels[i + 2]! > 160 && pixels[i]! > 100 && pixels[i + 2]! - pixels[i]! > 8;
        if (coloured && start < 0) start = x;
        if (!coloured && start >= 0) {
          if (x - start > 20) {
            // Click the cell's vertical centre: its top pixel row sits on the anti-aliased edge, which the hit test can miss.
            const mid = Math.round((start + x) / 2);
            let bottom = y;
            while (bottom + 1 < c.height) { const j = ((bottom + 1) * c.width + mid) * 4; if (!(pixels[j + 2]! > 160 && pixels[j]! > 100 && pixels[j + 2]! - pixels[j]! > 8)) break; bottom++; }
            return { x: mid / c.width, y: (y + bottom) / 2 / c.height };
          }
          start = -1;
        }
      }
    }
    return null;
  });
  await expect.poll(paintedCell).not.toBeNull();
  const point = (await paintedCell())!;
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * point.x, y: box.height * point.y } });
}

test.describe('HW Time linked panels — drill, filters and legacy compatibility', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  for (const viewport of [{ width: 1600, height: 1000 }, { width: 1280, height: 800 }]) {
    test(`${viewport.width}: heatmap click → active bar → Module → Motion → distribution and trend`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(SCREEN);
      await expectScopeValid(page, 'MEM · 메모리');
      for (const id of ['filter', 'heatmap', 'bars', 'motions', 'scatter', 'trend', 'table']) await expect(panel(page, id)).toBeVisible();
      await expect(page.getByRole('tab', { name: /^(개요|단계별|비교|표|누적|동작별 정렬)$/ })).toHaveCount(0);
      // Standard chrome keeps reading keys visible without opening More (#2372).
      for (const id of ['heatmap', 'bars']) await expect(panel(page, id).getByRole('group', { name: '범례', exact: true })).toBeVisible();
      await clickHeatmap(page);
      await expect.poll(() => query(page).get('row')).toMatch(/^EQ-\d{3} · PM\d$/);
      const row = query(page).get('row')!;
      await expect(panel(page, 'bars').getByRole('region', { name: '선택 요약', exact: true })).toContainText(row);
      await enterBar(page, row);
      const moduleId = row.split(' · ')[1]!;
      await expect.poll(() => query(page).get('drillModule')).toBe(moduleId);
      await expect(panel(page, 'motions').getByRole('table', { name: `${moduleId} · Motion` })).toBeVisible();
      await panel(page, 'motions').getByRole('button', { name: 'Chuck 회차 보기', exact: true }).click();
      await expect.poll(() => query(page).get('drillMotion')).toBe('Chuck');
      await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
      await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
      await expect(panel(page, 'scatter')).toContainText('표본 400 / 전체 576 · 기준 밖 점 전부 포함');
      await evidence(page, testInfo, `hw-linked-${viewport.width}`);
      await page.reload();
      expect(query(page).get('row')).toBe(row);
      await expect(panel(page, 'motions').getByRole('table', { name: `${moduleId} · Motion` })).toBeVisible();
      await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
      await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
      await expect.poll(() => page.locator('main').evaluate(main => main.scrollWidth - main.clientWidth)).toBeLessThanOrEqual(1);
    });
  }

  test('heatmap keyboard selection summary and Details both update the linked row', async ({ page }) => {
    await page.goto(SCREEN);
    const heatmap = panel(page, 'heatmap');
    await expect(heatmap.locator('[data-legend-placement="top"] > [aria-label="범례"]')).toBeVisible();
    await heatmap.getByRole('button', { name: '더보기', exact: true }).click();
    await page.getByRole('dialog', { name: '더보기', exact: true }).getByRole('button', { name: '표로 보기', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '더보기', exact: true })).toBeHidden();
    await expect(heatmap.getByRole('table')).toBeVisible();
    await page.keyboard.press('Escape');
    const cell = heatmap.getByRole('checkbox', { name: /EQ-001 · PM1/ });
    await cell.focus();
    await page.keyboard.press('Space');
    const activate = heatmap.getByRole('button', { name: '선택 지점 실행', exact: true });
    await activate.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => query(page).get('row')).toBe('EQ-001 · PM1');
    const otherRow = heatmap.getByRole('row').filter({ has: page.getByRole('cell', { name: 'EQ-001', exact: true }) }).filter({ has: page.getByRole('cell', { name: 'PM2', exact: true }) });
    await otherRow.getByRole('button', { name: '상세', exact: true }).click();
    expect(query(page).get('row')).toBe('EQ-001 · PM2');
  });

  test('checks remain hidden URL state, persist on reload and do not refetch any endpoint (C1/C3)', async ({ page }) => {
    await page.goto(`${SCREEN}&drillModule=PM1&drillMotion=Chuck`);
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    await expect(panel(page, 'table').getByRole('table', { name: 'HW Time 동작시간 표' })).toBeVisible();
    const requests = () => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query').length);
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    const before = await requests();
    const checks = panel(page, 'filter').getByRole('tree', { name: 'Motion' });
    const dechuck = checks.getByRole('checkbox', { name: /Dechuck/ });
    await dechuck.click();
    await expect(dechuck).toHaveAttribute('aria-checked', 'false');
    expect(query(page).has('motion')).toBe(false);
    expect(await requests()).toBe(before);
    await page.reload();
    await expect(dechuck).toHaveAttribute('aria-checked', 'false');
    const modules = panel(page, 'filter').getByRole('tree', { name: 'Module' });
    for (const id of ['PM1', 'PM2', 'PM3', 'PM4']) await modules.getByRole('checkbox', { name: new RegExp(id) }).click();
    await expect(page.getByText('선택한 항목 없음', { exact: true })).toBeVisible();
    await modules.getByRole('checkbox', { name: /PM1/ }).click();
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
  });

  test('saved legacy board tile renders linked panels and keeps its board identity', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.addInitScript(() => {
      const marker = 'hw-time-legacy-seeded';
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem('platform:board-layout-engine', 'dock');
      localStorage.setItem('platform:board:engineer', JSON.stringify({ v: 1, activeSheetId: 'hw-legacy', sheets: [{
        id: 'hw-legacy', name: 'HW legacy', layout: '1x1', selected: 0, panes: [{ menuId: 'hw-time-steps', params: {},
          query: '?v=1&scopeId=MEM&view=steps&drillModule=PM1&drillMotion=Chuck&row=EQ-001%20%C2%B7%20PM1' }],
      }] }));
      sessionStorage.setItem(marker, '1');
    });
    await page.goto('/board?sheet=hw-legacy');
    await expect(panel(page, 'filter').getByTestId('hw-time-filter-panel')).toBeVisible();
    await expect(panel(page, 'motions').getByRole('table', { name: 'PM1 · Motion' })).toBeVisible();
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/board');
    await page.reload();
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/board');
    // The retired id was written back as its successor once (#2330).
    const saved = await page.evaluate(() => localStorage.getItem('platform:board:v2:engineer') ?? '');
    expect(saved).toContain('"menuId":"hw-time"');
    expect(saved).not.toContain('hw-time-steps');
  });

  for (const id of ['steps', 'compare', 'overview', 'table']) {
    test(`legacy ${id} paths and obsolete view keys open the linked screen`, async ({ page }) => {
      for (const path of [`/hw-time/${id}`, `/mars/hw-time-${id}`, '/mars/hw-time']) {
        await page.goto(`${path}?v=1&scopeId=MEM&view=${id}&trend=ignored&minmax=ignored`);
        await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/hw-time');
        await expect(panel(page, 'filter').getByTestId('hw-time-filter-panel')).toBeVisible();
        await expect(panel(page, 'bars').getByRole('img', { name: /Module별 Motion 구성/ })).toBeVisible();
      }
    });
  }
});
