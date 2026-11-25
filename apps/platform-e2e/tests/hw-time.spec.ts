import { type Page } from '@playwright/test';
import { expect, test } from './origin-guard';
import { queryEditor, shareQueryConditions, evidence, expectScopeValid, expandQueryBar, pickTargetRoom, query, queryBar, signInAs } from './support';

const SCREEN = '/mars/hw-time?v=1&scopeId=MEM';
// The daily trend needs at least two calendar days; the first-visit default is one day (#2586).
const TWO_DAYS = '&from=2026-09-24T00:00:00&to=2026-09-26T00:00:00';
const workspace = (page: Page) => page.getByRole('region', { name: 'HW Time 분석 영역', exact: true });
const panel = (page: Page, id: string) => workspace(page).locator(`[data-dock-panel="${id}"]`);
const chartMore = (page: Page, id: string) => {
  const head = workspace(page).locator(`[data-dock-group-actions][data-dock-active="${id}"]`);
  return head.or(panel(page, id)).getByRole('button', { name: '더보기', exact: true });
};
const node = (page: Page, id: string) => panel(page, 'tree').locator(`[role="treeitem"][data-id="${id}"]`).first();
async function drill(page: Page, id: string) {
  await node(page, id).getByText(id.split('/').at(-1)!, { exact: true }).click();
}
async function add(page: Page, title: string) {
  await page.getByRole('button', { name: '패널 추가', exact: true }).click();
  await page.getByRole('menuitem', { name: title, exact: true }).click();
}
async function activatePoint(page: Page, row: string) {
  await chartMore(page, 'current').click();
  const tools = page.getByRole('dialog', { name: '더보기', exact: true });
  const picker = tools.getByRole('combobox', { name: '차트 지점 선택' });
  const option = picker.locator('option').filter({ hasText: row }).first();
  await picker.selectOption({ value: (await option.getAttribute('value'))! });
  // The Frame's keyboard command uses the same callback as pointer double-click.
  await tools.getByRole('button', { name: '선택 지점 실행' }).click();
  if (await tools.isVisible()) await page.keyboard.press('Escape');
}

test.describe('HW Time analysis selection', () => {
  test('edits motionEquipment through the analysis selection chip', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${SCREEN}${TWO_DAYS}&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions&motionEquipment=MEM-PHOTO-0105`);
    // The compact row replaces the initial query bar when the workspace registers.
    const contextLine = page.locator('[data-workspace-query-row]').filter({ has: page.locator('[data-context-chip-lane]') });
    const chip = contextLine.getByRole('button', { name: '설비 MEM-PHOTO-0105', exact: true });
    await chip.press('Enter');
    const dialog = page.getByRole('dialog', { name: '설비 MEM-PHOTO-0105', exact: true });
    await expect(dialog.getByRole('checkbox', { name: 'MEM-PHOTO-0105', exact: true })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'MEM-PHOTO-0103', exact: true }).check();
    await evidence(page, testInfo, 'analysis-selection-chip-edit');
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).getAll('motionEquipment')).toEqual(['MEM-PHOTO-0105', 'MEM-PHOTO-0103']);
  });

  test('filters the source table and restores the selection through Back and a shared URL', async ({ context, page }, testInfo) => {
    await signInAs(page, 'engineer');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${SCREEN}${TWO_DAYS}&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions&pins=table`);
    const tableTab = workspace(page).getByRole('tab', { name: '원본 표', exact: true });
    const table = panel(page, 'table').getByRole('table', { name: 'HW Time 동작시간 표' });
    const unselectedRow = table.getByRole('cell', { name: 'MEM-PHOTO-0103', exact: true });
    const selectedRow = table.getByRole('cell', { name: 'MEM-PHOTO-0105', exact: true });
    await tableTab.click();
    await expect(unselectedRow).toBeVisible();
    await expect(tableTab).not.toHaveAttribute('aria-description', /필터됨/);

    const chartTab = workspace(page).getByRole('tab', { name: 'PM1 · Motion별', exact: true });
    const more = chartMore(page, 'moduleMotions');
    await chartTab.click();
    await more.press('Enter');
    const tools = page.getByRole('dialog', { name: '더보기', exact: true });
    const picker = tools.getByRole('combobox', { name: '차트 지점 선택' });
    const addPoint = tools.getByRole('button', { name: '선택에 지점 추가', exact: true });
    const removePoint = tools.getByRole('button', { name: '선택에서 지점 빼기', exact: true });
    const option = picker.locator('option').filter({ hasText: /^MEM-PHOTO-0105 ·/ }).first();
    await picker.selectOption({ value: (await option.getAttribute('value'))! });
    await expect.poll(() => query(page).get('row')).toBe('MEM-PHOTO-0105');
    expect(query(page).has('motionEquipment')).toBe(false);
    await expect(addPoint).toBeEnabled();
    await addPoint.press('Enter');
    if (await tools.isVisible()) await page.keyboard.press('Escape');
    await expect.poll(() => query(page).getAll('motionEquipment')).toEqual(['MEM-PHOTO-0105']);
    await tableTab.click();
    await expect(selectedRow).toBeVisible();
    await expect(unselectedRow).toHaveCount(0);
    await expect(tableTab).toHaveAttribute('aria-description', '필터됨 · 1 · 선택 적용');
    await evidence(page, testInfo, 'analysis-selection-filtered');

    await shareQueryConditions(page);
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await expect.poll(clipboard).toContain('motionEquipment=MEM-PHOTO-0105');
    const sharedUrl = await clipboard();

    await page.goBack();
    await expect.poll(() => query(page).has('motionEquipment')).toBe(false);
    expect(query(page).get('row')).toBe('MEM-PHOTO-0105');
    await tableTab.click();
    await expect(unselectedRow).toBeVisible();
    await expect(tableTab).not.toHaveAttribute('aria-description', /필터됨/);

    await page.goto(sharedUrl);
    await page.reload();
    await tableTab.click();
    await expect(selectedRow).toBeVisible();
    await expect(unselectedRow).toHaveCount(0);
    await expect(tableTab).toHaveAttribute('aria-description', '필터됨 · 1 · 선택 적용');
    await chartTab.click();
    await more.press('Enter');
    await expect(picker.locator('option:checked')).toHaveText(/^MEM-PHOTO-0105 ·/);
    await expect(removePoint).toBeEnabled();
    await removePoint.press('Enter');
    if (await tools.isVisible()) await page.keyboard.press('Escape');
    await expect.poll(() => query(page).has('motionEquipment')).toBe(false);
    expect(query(page).get('row')).toBe('MEM-PHOTO-0105');
    await tableTab.click();
    await expect(unselectedRow).toBeVisible();
    await expect(tableTab).not.toHaveAttribute('aria-description', /필터됨/);
  });
});

test.describe('분석 선택 메뉴 간 링크 (#2735)', () => {
  const returnRow = (page: Page) => page.getByRole('main').locator('[data-return-row]');

  test('carries the trend range to CLAS, returns with it, and clears the received range', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${SCREEN}${TWO_DAYS}&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions`);
    const trend = panel(page, 'trend').getByRole('region', { name: '추세', exact: true });
    await expect(trend.getByRole('img', { name: /^추세:/ })).toBeVisible();
    await trend.getByRole('button', { name: '구간 선택', exact: true }).press('Enter');
    const rangeForm = page.getByRole('dialog', { name: '시작과 끝으로 구간 선택', exact: true });
    await rangeForm.getByRole('combobox', { name: '구간 끝' }).click();
    await page.getByRole('option', { name: '09-24', exact: true }).click();
    await rangeForm.getByRole('button', { name: '선택', exact: true }).click();
    await expect.poll(() => query(page).get('trendRange')).toMatch(/^\d{2}-\d{2}\/\d{2}-\d{2}$/);
    const range = query(page).get('trendRange');
    expect(range).toBe('09-24/09-24');

    const matrixTab = workspace(page).getByRole('tab', { name: 'PM1 · Motion별', exact: true });
    await matrixTab.click();
    const matrix = panel(page, 'moduleMotions');
    await chartMore(page, 'moduleMotions').press('Enter');
    const tools = page.getByRole('dialog', { name: '더보기', exact: true });
    const picker = tools.getByRole('combobox', { name: '차트 지점 선택' });
    // The equipment ids depend on the mock assembly (EQ-… locally, MEM-… in CI), so take the first point and read its id.
    const option = picker.locator('option').first();
    const equipment = (await option.textContent())!.split(' · ')[0]!;
    await picker.selectOption({ value: (await option.getAttribute('value'))! });
    await tools.getByRole('button', { name: '선택에 지점 추가', exact: true }).press('Enter');
    if (await tools.isVisible()) await page.keyboard.press('Escape');
    await expect.poll(() => query(page).getAll('motionEquipment')).toEqual([equipment]);

    const openClas = async () => {
      await matrixTab.click();
      await matrix.getByRole('button', { name: '다른 분석', exact: true }).click();
      await page.getByRole('menuitem', { name: 'CLAS', exact: true }).click();
      await expect(page).toHaveURL(/\/clas\/operation-time\?/);
      await expect.poll(() => query(page).get('days')).toBe(range);
    };
    await openClas();
    const ranking = page.getByRole('region', { name: '설비별 동작시간', exact: true });
    await expect(ranking.getByText(/^합성 데이터 · 2026-09-24 00:00:00 – 2026-09-25 00:00:00/)).toBeVisible();
    const chips = queryBar(page).getByRole('group', { name: '분석 선택' });
    await expect(chips.getByText('HW Time에서:', { exact: true })).toBeVisible();
    // A recorded navigation names the origin and keeps its drill trail («(PM › Pump › PM1)»).
    await expect(returnRow(page).getByRole('link', { name: /^← HW Time로 돌아가기 \(/ })).toBeVisible();
    await evidence(page, testInfo, 'analysis-selection-arrival');
    await chips.getByRole('link', { name: 'HW Time로 돌아가기 (선택 유지)' }).click();
    await expect(page).toHaveURL(/\/mars\/hw-time\?/);
    await expect.poll(() => query(page).get('trendRange')).toBe(range);

    await openClas();
    const origin = query(page).get('returnTo');
    await chips.getByRole('button', { name: '날짜 선택 지우기' }).click();
    await expect.poll(() => query(page).has('days')).toBe(false);
    expect(query(page).get('returnTo')).toBe(origin);
  });

  test('uses neutral wording when the CLAS arrival URL is opened directly', async ({ page }) => {
    await signInAs(page, 'engineer');
    const origin = `${SCREEN}${TWO_DAYS}&trendRange=09-24/09-24`;
    await page.goto(`/clas/operation-time?v=1&scopeId=MEM${TWO_DAYS}&eqp=MEM-PHOTO-0103&days=09-24/09-24&returnTo=${encodeURIComponent(origin)}`);
    await expect(returnRow(page).getByRole('link', { name: '← 이전 화면으로 돌아가기', exact: true })).toBeVisible();
    await expect(queryBar(page).getByRole('group', { name: '분석 선택' }).getByText('이전 화면에서:', { exact: true })).toBeVisible();
  });
});

test.describe('HW Time stepped workspace — drill, options, add and pin', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });

  test('explains the aggregation refusal for a seven-day PHOTO query', async ({ page }) => {
    await page.goto(`${SCREEN}&roomNames=PHOTO&pins=table&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00`);
    const banners = page.locator('[data-outcome-banner][data-outcome-compact]');
    const refusal = banners.filter({ hasText: '집계 불가' });
    await expect(refusal.getByText('집계 불가 ·', { exact: true })).toBeVisible();
    // #2535: the strip names the cause and affected equipment; the full sentence sits under «자세히».
    await expect(refusal).toContainText('영향 설비');
    await refusal.getByRole('button', { name: '자세히', exact: true }).click();
    await expect(page.getByText('시간 기준이 확인되지 않아 함께 집계할 수 없습니다.').first()).toBeVisible();
    await expect(banners.filter({ hasText: '서버 오류' })).toHaveCount(0);
  });

  test('first entry queries automatically and target edits wait for Apply', async ({ page }) => {
    await page.goto(SCREEN);
    await expect(panel(page, 'current').getByRole('img')).toBeVisible();
    const period = query(page).get('from');
    expect(period).toBeTruthy();
    const bar = queryBar(page);
    await expandQueryBar(page, bar);
    await pickTargetRoom(page, bar, 'PHOTO');
    expect(query(page).get('roomNames')).toBeNull();
    await queryEditor(page, bar).getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('roomNames')).toBe('PHOTO');
    expect(query(page).get('from')).toBe(period);
  });

  test('shows PRC groups and waits for query Apply after selecting one', async ({ page }) => {
    await page.goto(`${SCREEN}&roomNames=PHOTO`);
    await expect(panel(page, 'current').getByRole('img')).toBeVisible();
    const bar = queryBar(page);
    await expandQueryBar(page, bar);
    await queryEditor(page, bar).getByRole('button', { name: /^대상 (설비|확인 중)/ }).click();
    const dialog = page.getByRole('dialog', { name: '대상', exact: true });
    await dialog.getByRole('button', { name: /^PRC 그룹 / }).click();
    await dialog.getByRole('button', { name: 'PRC-PHOTO-0만 선택', exact: true }).click();
    await dialog.getByRole('button', { name: /^조건 적용 ·/ }).click();
    expect(query(page).get('prcGroups')).toBeNull();
    await queryEditor(page, bar).getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('prcGroups')).toBe('PRC-PHOTO-0');
  });

  test('legacy periodless link applies its target and drill conditions on arrival', async ({ page }) => {
    await page.goto('/hw-time/steps?v=1&scopeId=MEM&roomNames=PHOTO&moduleType=PM&drillMotion=Chuck');
    await expect(panel(page, 'current').getByRole('img')).toBeVisible();
    await expect(node(page, 'PM/Chuck')).toHaveAttribute('aria-current', 'true');
    expect(query(page).get('roomNames')).toBe('PHOTO');
    expect(query(page).get('drillMotion')).toBe('Chuck');
    expect(query(page).has('from')).toBe(true);
    expect(query(page).has('to')).toBe(true);
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    test(`${viewport.width}: type → Motion → Module restores four step defaults`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(`${SCREEN}${TWO_DAYS}`);
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
    await page.goto(`${SCREEN}${TWO_DAYS}`);
    await activatePoint(page, 'MEM-PHOTO-0103');
    await expect.poll(() => query(page).get('moduleType')).toBe('PM');
    await expect(panel(page, 'previous')).toContainText('설비별 Module 타입 평균');
    await activatePoint(page, 'MEM-PHOTO-0103 · PM1');
    await expect(panel(page, 'trend').getByRole('img', { name: /^추세:/ })).toBeVisible();
    expect(query(page).get('drillModule')).toBeNull();
    await add(page, '분포');
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    await drill(page, 'PM/Chuck');
    await drill(page, 'PM/Chuck/PM1');
    // Added and pinned panels join the main chart group as tabs (#2431 capture fix), so the pinned scatter is one tab away.
    const scatterTab = workspace(page).getByRole('tab', { name: '분포', exact: true });
    await scatterTab.click();
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
    await page.reload();
    await scatterTab.click();
    await expect(panel(page, 'scatter').getByRole('img', { name: '분포', exact: true })).toBeVisible();
  });

  test('add list gives disabled reasons, and tree checks persist without new reads', async ({ page }) => {
    await page.goto(`${SCREEN}${TWO_DAYS}&moduleType=PM&drillMotion=Chuck&drillModule=PM1`);
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
          query: '?v=1&scopeId=MEM&from=2026-09-24T00%3A00%3A00&to=2026-09-26T00%3A00%3A00&view=steps&moduleType=PM&drillMotion=Chuck&drillModule=PM1&row=MEM-PHOTO-0103%20%C2%B7%20PM1' }],
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

test.describe('HW Time query history — drill steps from the SDK (#2770)', () => {
  test('two history rows that differ only in the Motion step read differently', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${SCREEN}${TWO_DAYS}`);
    await expectScopeValid(page, 'MEM · 메모리');
    const candidate = (motion: string) => '?' + new URLSearchParams([['v', '1'], ['scopeId', 'MEM'], ['roomNames', 'PHOTO'],
      ['from', '2026-09-24T00:00:00'], ['to', '2026-09-26T00:00:00'], ['moduleType', 'PM'], ['drillMotion', motion]]).toString();
    await page.evaluate(([pump, chuck]) => {
      localStorage.setItem('platform:query-history:v1:' + JSON.stringify([1, 'engineer', 'hw-time', 'MEM']), JSON.stringify({ schemaVersion: 1, entries: [
        { id: 'pump', query: pump, schemaVersion: 1, count: 1, lastAppliedAt: 2 },
        { id: 'chuck', query: chuck, schemaVersion: 1, count: 1, lastAppliedAt: 1 },
      ] }));
    }, [candidate('Pump'), candidate('Chuck')]);
    await page.reload();
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = queryBar(page);
    await expandQueryBar(page, bar);
    await queryEditor(page, bar).getByRole('button', { name: '최근 조건', exact: true }).click();
    const rows = page.getByRole('list', { name: '최근 조회 조건' });
    await expect(rows.getByRole('button', { name: /Module 타입 PM · Motion Pump/ })).toBeVisible();
    await expect(rows.getByRole('button', { name: /Module 타입 PM · Motion Chuck/ })).toBeVisible();
    await evidence(page, testInfo, 'hw-time-history-drill-steps');
  });
});
