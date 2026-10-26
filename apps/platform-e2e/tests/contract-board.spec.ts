import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, openSwitcher, chooseSystem, headerMore } from './contract-helpers';
import { evidence, expandPageHead, mainHeading, query, setScenario, signInAs } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
test.describe('분석 보드 계약 (16 §4–§7, ADR-0049·0051)', () => {
  // The default renderer is the dock since ADR-0067 2c; this contract pins the grid renderer, which stays the fallback.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('platform:board-layout-engine', 'grid'); });
  });
  type BoardTestRole = 'engineer' | 'viewer';
  type BoardPaneSeed = { menuId: string; params: Record<string, string>; query: string };
  type BoardSheetSeed = { id: string; name: string; layout: '1x1' | '1x2' | '2x1' | '2x2'; arrangement?: Partial<Record<'1x1' | '1x2' | '2x1' | '2x2', { columns: number[]; rows: number[][]; collapsed: number[] }>>; selected: number; panes: (BoardPaneSeed | null)[] };
  type BoardSeed = { v: 1; activeSheetId: string; sheets: BoardSheetSeed[] };

  const boardScreen = (query: string, menuId = 'productivity-overview'): BoardPaneSeed => ({ menuId, params: {}, query: `?${query}` });
  const boardOf = (first: BoardSheetSeed, ...rest: BoardSheetSeed[]): BoardSeed => ({ v: 1, activeSheetId: first.id, sheets: [first, ...rest] });
  const boardSheet = (id: string, name: string, layout: BoardSheetSeed['layout'], panes: BoardSheetSeed['panes']): BoardSheetSeed => ({ id, name, layout, selected: 0, panes });

  async function signInWithBoard(page: Page, role: BoardTestRole, board: BoardSeed) {
    await signInAs(page, role);
    await page.addInitScript(({ role: boardRole, value }) => {
      const seeded = `platform:board-fixture-seeded:${boardRole}`;
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem(`platform:board:${boardRole}`, JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { role, value: board });
  }

  const boardPane = (page: Page, number: number) => page.getByRole('group', { name: `칸 ${number}` });
  const boardPaneHead = (page: Page, number: number) => boardPane(page, number).locator('[data-pane-head]');
  const boardContext = (page: Page, number: number) => page.getByRole('region', { name: `칸 ${number} · 분석 Context` });
  const productivityBody = (page: Page, number: number) => boardPane(page, number).getByRole('region', { name: '점유 구성 — room_name', exact: true });
  const cycleTimeBody = (page: Page, number: number) => boardPane(page, number).getByRole('region', { name: '사이클타임 추세', exact: true });

  async function boardPeriodPreset(page: Page, number: number, name: string) {
    const context = boardContext(page, number);
    await expect(context).toBeVisible();
    if (await context.getAttribute('data-query-bar') !== null) {
      await context.getByRole('button', { name: /조회 조건 펼치기/ }).click();
      await page.getByRole('button', { name: name === '1일' ? '최근 24시간' : '최근 7일', exact: true }).click();
      await page.getByRole('button', { name: '적용', exact: true }).click();
      await page.getByRole('button', { name: '닫기', exact: true }).click();
      return;
    }
    const inline = context.getByRole('radio', { name, exact: true });
    if (await inline.isVisible()) {
      await inline.click();
      return;
    }
    await context.getByRole('button', { name: /^기간:/ }).click();
    await page.getByRole('radio', { name, exact: true }).click();
  }

  const sizingSheet = (id: string, detail = false) => boardSheet(id, '크기', '2x2', [
    boardScreen(`v=1&scopeId=MEM&${PERIOD}${detail ? '&focus=MEM-PHOTO-0103' : ''}`, 'equipment-master'),
    boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`), null, null,
  ]);
  async function sizingReady(page: Page) {
    await expect(boardPane(page, 1).getByRole('region', { name: '설비 마스터 목록' })).toBeVisible();
    await expect(productivityBody(page, 2)).toBeVisible();
  }
  async function boardGeometry(page: Page) {
    return page.locator('[data-board-grid]').evaluate(grid => {
      const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
      return { grid: rect(grid), panel: rect(grid.parentElement!), panes: Array.from(grid.querySelectorAll('[data-pane-id]')).map(pane => ({
        root: rect(pane), head: rect(pane.querySelector('[data-pane-head]')!), body: rect(pane.querySelector('[data-pane-body]')!),
      })) };
    });
  }

  test('칸 크기 D: 화면 안 비교, 열 조절·같은 열 접기 저장, 최대화 복원과 포커스', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithBoard(page, 'engineer', boardOf(sizingSheet('sizing')));
    await page.goto('/board?sheet=sizing'); await sizingReady(page);
    const initial = await boardGeometry(page);
    for (const pane of initial.panes) {
      expect(pane.head.y).toBeGreaterThanOrEqual(initial.grid.y);
      expect(pane.body.bottom).toBeLessThanOrEqual(Math.min(900, initial.panel.bottom));
      expect(pane.body.height).toBeGreaterThanOrEqual(120);
      expect(pane.head.height).toBe(40);
    }
    const splitter = page.getByRole('separator', { name: '열 너비 조절' });
    const beforeValue = Number(await splitter.getAttribute('aria-valuenow'));
    await splitter.press('ArrowRight');
    await expect.poll(async () => Number(await splitter.getAttribute('aria-valuenow'))).toBeGreaterThan(beforeValue);
    const resized = await boardGeometry(page);
    expect(resized.panes[0].root.width).toBeGreaterThan(initial.panes[0].root.width);
    expect(resized.panes[1].root.width).toBeLessThan(initial.panes[1].root.width);
    const savedValue = await splitter.getAttribute('aria-valuenow');
    await page.getByRole('button', { name: '칸 1 접기' }).click();
    const collapsed = await boardGeometry(page);
    expect(collapsed.panes[2].root.height).toBeGreaterThan(resized.panes[2].root.height);
    expect(collapsed.panes[3].root.height).toBeCloseTo(resized.panes[3].root.height, 0);
    await page.reload(); await expect(productivityBody(page, 2)).toBeVisible();
    await expect(splitter).toHaveAttribute('aria-valuenow', savedValue!);
    await expect(page.getByRole('button', { name: '칸 1 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    const reloaded = await boardGeometry(page);
    expect(reloaded.panes[0].root.width).toBeCloseTo(resized.panes[0].root.width, 0);
    expect(reloaded.panes[2].root.height).toBeCloseTo(collapsed.panes[2].root.height, 0);
    // Retained DOM identity is observed directly, including hidden roots deliberately.
    await page.locator('[data-pane-id]').evaluateAll(panes => panes.forEach(pane => { (pane as HTMLElement).dataset.retainedProbe = 'same'; }));
    const trigger = page.getByRole('button', { name: '칸 2 최대화' });
    await trigger.click();
    for (const n of [1, 3, 4]) {
      await expect(boardPane(page, n)).toHaveCount(0);
      await expect(page.getByRole('group', { name: `칸 ${n}`, includeHidden: true })).toHaveCount(1);
      await expect(page.locator(`[data-pane-index="${n - 1}"]`)).toHaveAttribute('inert', '');
    }
    await page.getByRole('button', { name: '원래 크기로' }).press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.locator('[data-retained-probe="same"]')).toHaveCount(4);
    await expect(page.getByRole('button', { name: '칸 1 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    await testInfo.attach('board-sizing-coordinates', { body: JSON.stringify({ initial, resized, collapsed, reloaded }, null, 2), contentType: 'application/json' });
    await evidence(page, testInfo, 'board-pane-sizing-D');
  });

  for (const populated of [true, false]) {
    test(`칸 크기 D 기하 행렬: ${populated ? '화면 있음' : '모두 빈 시트'}·상세·692px 경계·짧은 높이`, async ({ page }, testInfo) => {
      const seed = sizingSheet('matrix', populated);
      if (!populated) seed.panes = [null, null, null, null];
      seed.arrangement = { '2x2': { columns: [10, 90], rows: [[15, 85], [70, 30]], collapsed: [] } };
      await signInWithBoard(page, 'engineer', boardOf(seed));
      await page.goto('/board?sheet=matrix');
      if (populated) { await sizingReady(page); await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible(); }
      const coordinates = [];
      for (const width of [1440, 1280, 1120]) {
        await page.setViewportSize({ width, height: 900 });
        const grid = page.locator('[data-board-grid]');
        await expect(grid).toHaveAttribute('data-columns', populated && width === 1120 ? '1' : '2');
        if (populated) expect((await page.getByRole('complementary', { name: '상세 패널' }).boundingBox())!.width).toBe(440);
        const geometry = await boardGeometry(page); coordinates.push({ width, geometry });
        for (const pane of geometry.panes) { expect(pane.body.height).toBeGreaterThanOrEqual(120); expect(pane.head.height).toBe(40); }
        if (!populated || width !== 1120) for (const pane of geometry.panes) {
          expect(pane.root.width).toBeGreaterThanOrEqual(340);
          expect(pane.body.bottom).toBeLessThanOrEqual(Math.min(900, geometry.panel.bottom));
        }
      }
      // Measure the real grid to choose viewport sizes immediately either side of its 692px content-box threshold.
      await page.setViewportSize({ width: 1440, height: 900 });
      const measuredWidth = (await page.locator('[data-board-grid]').boundingBox())!.width;
      for (const target of [691, 693]) {
        await page.setViewportSize({ width: Math.round(1440 - measuredWidth + target), height: 900 });
        await expect(page.locator('[data-board-grid]')).toHaveAttribute('data-columns', target < 692 ? '1' : '2');
        coordinates.push({ width: target, geometry: await boardGeometry(page) });
      }
      await page.setViewportSize({ width: 1440, height: 420 });
      const short = await boardGeometry(page); coordinates.push({ width: 1440, geometry: short });
      for (const pane of short.panes) expect(pane.body.height).toBeGreaterThanOrEqual(120);
      await expect(page.getByRole('tab', { name: '크기', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: '크기 초기화' })).toBeInViewport();
      await expect(page.locator('[data-board-context-row]')).toBeInViewport();
      if (!populated) await expect(page.getByRole('region', { name: '분석 화면 두 개를 넣어 나란히 비교하세요' })).toBeVisible();
      if (populated) {
        await page.getByRole('button', { name: '칸 2 최대화' }).click();
        await page.getByRole('button', { name: '칸 2 동작' }).click();
        await page.getByRole('menu').press('Escape');
        await expect(page.getByRole('button', { name: '원래 크기로' })).toBeVisible();
        await page.getByRole('button', { name: '원래 크기로' }).press('Escape');
        await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: '칸 2 최대화' }).click();
        await page.getByRole('button', { name: '상세 닫기' }).press('Escape');
        await expect(page.getByRole('button', { name: '원래 크기로' })).toBeVisible();
        await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toHaveCount(0);
      }
      await testInfo.attach('board-matrix-coordinates', { body: JSON.stringify(coordinates, null, 2), contentType: 'application/json' });
      await evidence(page, testInfo, `board-sizing-matrix-${populated ? 'populated' : 'empty'}`);
    });
  }

  test('조건 독립: 칸 2 기간을 바꿔도 칸 1 Context와 본 화면 URL은 유지된다', async ({ page }, testInfo) => {
    const paneQuery = `v=1&scopeId=MEM&${PERIOD}`;
    await signInWithBoard(page, 'engineer', boardOf(boardSheet('independent', '독립', '1x2', [
      boardScreen(`${paneQuery}&roomNames=PHOTO`), boardScreen(`${paneQuery}&roomNames=ETCH`),
    ])));
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    const originalMainUrl = page.url();
    const rail = page.getByRole('navigation', { name: '앱 레일' });
    await rail.getByRole('button', { name: '분석 보드' }).click();
    await expect(page.getByRole('heading', { name: '분석 보드' })).toBeVisible();

    const first = boardPane(page, 1);
    const firstHead = boardPaneHead(page, 1);
    const firstRoomChip = first.getByText('room_name PHOTO', { exact: true }).filter({ visible: true });
    await expect(firstHead).toContainText('생산성 개요');
    await expect(firstRoomChip).toBeVisible();
    const originalPeriodChip = '기간 09-25 09:00 → 09-26 09:00 (24h)';
    const originalPeriod = boardContext(page, 1).getByRole('button', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h)' });
    await expect(originalPeriod).toBeVisible();

    await boardPane(page, 2).getByRole('button', { name: '칸 2 선택' }).click();
    await boardPeriodPreset(page, 2, '7일');
    await expect(boardContext(page, 2).getByRole('button', { name: '기간: 09-19 09:00 → 09-26 09:00 (7일)' })).toBeVisible();
    await expect(boardPaneHead(page, 2).locator('[data-pane-chip="time"]')).toHaveText('기간 09-19 09:00 → 09-26 09:00 (7일)');
    await expect(firstHead.locator('[data-pane-chip="time"]')).toHaveText(originalPeriodChip);
    await expect(firstRoomChip).toBeVisible();

    await first.getByRole('button', { name: '칸 1 선택' }).click();
    await expect(boardContext(page, 1).getByRole('button', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h)' })).toBeVisible();
    // Opening the board from the rail replaces the main screen's entry (ADR-0087, #893): going back to it is `최소화`, which returns to the recorded address.
    await page.getByRole('button', { name: '최소화' }).click();
    await expect.poll(() => page.url()).toBe(originalMainUrl);
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
    expect(query(page).get('roomNames')).toBe('PHOTO');
    await evidence(page, testInfo, 'board-independent-pane-context');
  });

  test('일괄 적용: 모든 칸이 같은 조건이 되고 실행 취소가 차이 칩을 복원한다', async ({ page }, testInfo) => {
    const paneQuery = `v=1&scopeId=MEM&${PERIOD}`;
    const sourcePeriod = '기간: 09-25 09:00 → 09-26 09:00 (24h)';
    await signInWithBoard(page, 'engineer', boardOf(boardSheet('apply', '적용', '1x2', [
      boardScreen(`${paneQuery}&roomNames=PHOTO`), boardScreen(`${paneQuery}&roomNames=ETCH`),
    ])));
    await page.goto('/board?sheet=apply');
    const first = boardPane(page, 1);
    const second = boardPane(page, 2);
    await expect(first.getByText('room_name PHOTO', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(second.getByText('room_name ETCH', { exact: true }).filter({ visible: true })).toBeVisible();

    await first.getByRole('button', { name: '칸 1 동작' }).click();
    await page.getByRole('menuitem', { name: '이 조건을 시트의 모든 칸에 적용' }).click();
    await expect(first.getByRole('button', { name: /칸 1의 같은 조건/ })).toBeVisible();
    await expect(second.getByRole('button', { name: /칸 2의 같은 조건/ })).toBeVisible();
    await expect(first.getByText('room_name PHOTO', { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(second.getByText('room_name ETCH', { exact: true }).filter({ visible: true })).toHaveCount(0);

    await first.getByRole('button', { name: '칸 1 선택' }).click();
    await expect(boardContext(page, 1).getByRole('button', { name: sourcePeriod, exact: true })).toBeVisible();
    await expect(boardContext(page, 1).getByRole('button', { name: 'room_name PHOTO', exact: true })).toBeVisible();
    await second.getByRole('button', { name: '칸 2 선택' }).click();
    await expect(boardContext(page, 2).getByRole('button', { name: sourcePeriod, exact: true })).toBeVisible();
    await expect(boardContext(page, 2).getByRole('button', { name: 'room_name PHOTO', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '실행 취소' }).click();
    await expect(first.getByText('room_name PHOTO', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(second.getByText('room_name ETCH', { exact: true }).filter({ visible: true })).toBeVisible();
    await evidence(page, testInfo, 'board-apply-all-undo');
  });

  test('새로고침 시트 유지: 선택한 시트 URL과 화면이 유지되고 Back은 이전 시트로 간다', async ({ page }, testInfo) => {
    await signInWithBoard(page, 'engineer', boardOf(
      boardSheet('sheet-one', '기준', '1x1', [boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`)]),
      // A day earlier, so the 1일 preset is a real change that stays inside the mock's verified time domain (7일 over MEM is time_domain_unverified).
      boardSheet('sheet-two', '비교', '1x1', [boardScreen('v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-24T09:00:00&to=2026-09-25T09:00:00', 'cycle-time')]),
    ));
    await page.goto('/board?sheet=sheet-one');
    await page.getByRole('tab', { name: '비교' }).click();
    await expect.poll(() => query(page).get('sheet')).toBe('sheet-two');
    await expect(boardPaneHead(page, 1)).toContainText('사이클타임 상세');
    await expect(cycleTimeBody(page, 1)).toBeVisible();
    await boardPeriodPreset(page, 1, '1일');
    const changedPeriod = '09-25 09:00 → 09-26 09:00 (24h)';
    await expect(boardContext(page, 1)).toContainText(changedPeriod);

    await page.reload();
    await expect.poll(() => query(page).get('sheet')).toBe('sheet-two');
    await expect(boardPaneHead(page, 1)).toContainText('사이클타임 상세');
    await expect(cycleTimeBody(page, 1)).toBeVisible();
    await expect(boardContext(page, 1)).toContainText(changedPeriod);
    await page.goBack();
    await expect.poll(() => query(page).get('sheet')).toBe('sheet-one');
    await expect(boardPaneHead(page, 1)).toContainText('생산성 개요');
    await expect(productivityBody(page, 1)).toBeVisible();
    await evidence(page, testInfo, 'board-sheet-reload-history');
  });

  test('업무 시스템 섞기: 한 시트의 MARS·CLAS·BRAVO 칸 머리에 서로 다른 업무 시스템 칩이 보인다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithBoard(page, 'engineer', boardOf(boardSheet('mixed', '섞기', '2x2', [
      boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`),
      boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`, 'operation-time'),
      boardScreen('v=1', 'metric-catalog'), null,
    ])));
    await page.goto('/board?sheet=mixed');
    await expect(productivityBody(page, 1)).toBeVisible();
    await expect(boardPaneHead(page, 1).locator('[data-pane-system]')).toHaveText('MARS');
    await expect(boardPaneHead(page, 2).locator('[data-pane-system]')).toHaveText('CLAS');
    await expect(boardPaneHead(page, 3).locator('[data-pane-system]')).toHaveText('BRAVO');
    await expect(boardPaneHead(page, 2)).toContainText('설비 동작시간');
    await expect(boardPaneHead(page, 3)).toContainText('지표 카탈로그');
    await evidence(page, testInfo, 'board-mixed-systems');
  });

  test('열 수 없는 칸: 미등록 메뉴만 안내하고 다른 칸은 계속 그린다', async ({ page }, testInfo) => {
    await signInWithBoard(page, 'engineer', boardOf(boardSheet('unavailable', '복구', '1x2', [
      boardScreen(`v=1&scopeId=MEM&${PERIOD}`, 'removed-menu'),
      boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`),
    ])));
    await page.goto('/board?sheet=unavailable');
    const unavailable = boardPane(page, 1);
    await expect(unavailable.getByText('더는 보드에서 열 수 없는 화면')).toBeVisible();
    await expect(unavailable.getByRole('button', { name: '비우기' })).toBeVisible();
    await expect(boardPaneHead(page, 2)).toContainText('생산성 개요');
    await expect(productivityBody(page, 2)).toBeVisible();
    await evidence(page, testInfo, 'board-unavailable-pane');
  });

  test('권한 칸: viewer에게 거부 상태만 보이고 칸 데이터는 없다', async ({ page }, testInfo) => {
    await signInWithBoard(page, 'viewer', boardOf(boardSheet('denied', '권한', '1x1', [
      boardScreen(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`),
    ])));
    await page.goto('/board?sheet=denied');
    const pane = boardPane(page, 1);
    await expect(pane.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(pane.getByRole('table')).toHaveCount(0);
    await expect(pane.getByRole('row')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toHaveCount(1);
    // viewer holds metrics:view, so the BRAVO metric catalog is a placeable menu and the rail entry stays (16 §6).
    await expect(page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '분석 보드' })).toHaveCount(1);
    await evidence(page, testInfo, 'board-denied-pane');
  });

  test('분석 보드에 열기: 사이클타임 상세를 새 시트의 첫 칸으로 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    const actions = await headerMore(page);
    await actions.getByRole('button', { name: '분석 보드에 열기…' }).click();
    const dialog = page.getByRole('dialog', { name: '분석 보드에 열기' });
    await expect(dialog.getByRole('radio', { name: '새 시트' })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByRole('button', { name: '열기' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/board');
    expect(query(page).get('sheet')).not.toBeNull();
    await expect(page.getByRole('tab', { name: '시트 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(boardPaneHead(page, 1)).toContainText('사이클타임 상세');
    await expect(cycleTimeBody(page, 1)).toBeVisible();
    await evidence(page, testInfo, 'board-open-cycle-time-new-sheet');
  });
});

/**
 * A vertical engine sash (`.dv-sash` between two side-by-side panels) inside `scope`: the tallest one that is taller than wide.
 * Returns its locator index and box so a test can drag it and find the same boundary again after a reload (#754).
 */
async function verticalSash(scope: Locator) {
  const sashes = scope.locator('.dv-sash');
  const count = await sashes.count();
  let best: { sash: Locator; box: { x: number; y: number; width: number; height: number } } | undefined;
  for (let i = 0; i < count; i++) {
    const box = await sashes.nth(i).boundingBox();
    if (box && box.height > box.width && (!best || box.height > best.box.height)) best = { sash: sashes.nth(i), box };
  }
  if (!best) throw new Error('no vertical sash');
  return best;
}
/** Drags a sash like a person with a real mouse (press, stepped move, small moves, release) by `dx` px, and returns where it ended. */
async function dragSashBy(page: Page, sash: Locator, dx: number) {
  // A workspace below the fold has its sash centre off screen, where the mouse reaches nothing: bring it in and grab a visible point.
  await sash.scrollIntoViewIfNeeded();
  const box = (await sash.boundingBox())!;
  const viewport = page.viewportSize()!;
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height / 2, Math.max(box.y + 1, viewport.height - 20));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(50);
    await page.mouse.move(x + dx + (i % 2 === 0 ? -1 : 1), y);
  }
  await page.mouse.move(x + dx, y);
  await page.mouse.up();
  return x + dx;
}

test.describe('분석 보드 dock 렌더러 (ADR-0067)', () => {
  type DockPaneSeed = { menuId: string; params: Record<string, string>; query: string };
  type DockSheetSeed = { id: string; name: string; layout: '1x1' | '1x2' | '2x1' | '2x2'; selected: number; panes: (DockPaneSeed | null)[] };

  const screenOf = (query: string): DockPaneSeed => ({ menuId: 'productivity-overview', params: {}, query: `?${query}` });
  const sheetOf = (id: string, name: string, layout: DockSheetSeed['layout'], panes: DockSheetSeed['panes']): DockSheetSeed => ({ id, name, layout, selected: 0, panes });
  const populated = (id: string, layout: DockSheetSeed['layout'], count: number) => sheetOf(id, '도킹', layout, Array.from({ length: count }, (_, i) => screenOf(`v=1&scopeId=MEM&${PERIOD}&roomNames=${['PHOTO', 'ETCH', 'CVD', 'DIFF'][i]}`)));

  /** The V1 board and the renderer flag go in the same init script, so the first load already draws the dock. */
  async function signInWithDockBoard(page: Page, sheets: DockSheetSeed[]) {
    await signInAs(page, 'engineer');
    await page.addInitScript(({ value }) => {
      const seeded = 'platform:board-fixture-seeded:engineer';
      localStorage.setItem('platform:board-layout-engine', 'dock');
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { value: { v: 1, activeSheetId: sheets[0].id, sheets } });
  }

  const paneTabs = (page: Page) => page.locator('[data-dock-layout] [role="tab"][data-tab-panel-id]');
  // A tab is named by the engine (`칸 N · 메뉴명`); its content is the badge, the name and the X.
  const paneTab = (page: Page, number: number) => paneTabs(page).and(page.locator(`[aria-label^="칸 ${number} · "]`));
  const groups = (page: Page) => page.locator('[data-dock-layout] .dv-groupview');
  // `has` matches inside each group, so its locator must not start at `[data-dock-layout]` (an ancestor of the group).
  const groupOfTab = (page: Page, number: number) => groups(page).filter({ has: page.locator(`[role="tab"][data-tab-panel-id][aria-label^="칸 ${number} · "]`) });
  const groupBody = (page: Page, number: number) => groupOfTab(page, number).locator('.dv-content-container');
  const contextOf = (page: Page, number: number) => page.getByRole('region', { name: `칸 ${number} · 분석 Context` });
  /** The pane's head is the right end of its group's strip: the maximize toggle and the one `⋯` menu. */
  const paneMenuOf = (page: Page, number: number) => groupOfTab(page, number).getByRole('button', { name: `칸 ${number} 동작` });
  const maximizeOf = (page: Page, number: number) => groupOfTab(page, number).getByRole('button', { name: `칸 ${number} 최대화` });
  /** Marks every pane root so a remount (which would re-query) shows as a lost mark. */
  const markPanes = (page: Page) => page.locator('[data-pane-id]').evaluateAll(panes => panes.forEach(pane => { (pane as HTMLElement).dataset.dockProbe = 'same'; }));
  const marked = (page: Page) => page.locator('[data-dock-probe="same"]');
  async function dockReady(page: Page, panes: number) {
    await page.goto('/board?sheet=dock');
    await expect(paneTabs(page)).toHaveCount(panes);
    // The tabs exist a frame before the engine shows its panels.
    await expect(page.locator('[data-dock-layout] [data-pane-body]')).toHaveCount(panes);
    await expect(page.locator('[data-dock-layout] [data-pane-body]').first()).toBeVisible();
  }
  /**
   * Drag only over loaded panes (KPI shown, no skeleton left). A skeleton the query replaces under the pointer shortly before the
   * release leaves the emulated mouse with no dragover on the new node, and the browser ends the drag without a drop (CI 39898726190,
   * 39899780320: dragenter on the new node, then dragleave + dragend within 20–260 ms). A real pointer keeps firing dragover.
   */
  async function panesLoaded(page: Page, panes: number) {
    await expect(page.locator('[data-dock-layout] [data-pane-body]').filter({ hasText: '물리 점유율' })).toHaveCount(panes);
    await expect(page.locator('[data-dock-layout] [data-pane-body] [role="status"][aria-busy]')).toHaveCount(0);
  }
  /**
   * Drags like a person: press, stepped move, a few small moves over the target, release. `dragTo` sends one move, and when a
   * pane's query resolves mid-drag the element under the pointer is replaced; with no later dragover the browser ends the drag
   * without a drop (CI 39782412595, reproduced at CPU throttle 6–8: 5–6 of 20). The engine draws panel content in an overlay above
   * the group body, so the point is "covered" by design — pointer coordinates, not an actionability check.
   */
  async function dragTab(page: Page, from: number, onto: Locator, position: { x: number; y: number }) {
    const source = (await paneTab(page, from).boundingBox())!;
    const target = (await onto.boundingBox())!;
    const x = target.x + position.x;
    const y = target.y + position.y;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(80);
      await page.mouse.move(x + (i % 2 === 0 ? -2 : 2), y);
    }
    await page.mouse.up();
  }

  test('마우스로 끈 칸 경계 크기는 보드에 저장되고 새로고침 뒤에도 남는다 (#754)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await panesLoaded(page, 2);
    const layout = page.locator('[data-dock-layout]').first();
    const before = await verticalSash(layout);
    const boardKey = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('platform:board:v2:')).map(([, value]) => value).join('|'));
    const initial = await boardKey();
    await dragSashBy(page, before.sash, 120);
    // Compare with where the engine put the sash (minimum sizes, px rounding), not with the pointer.
    const dragged = (await before.sash.boundingBox())!;
    expect(dragged.x - before.box.x).toBeGreaterThan(60);
    await expect.poll(boardKey).not.toBe(initial);
    await page.reload();
    await dockReady(page, 2);
    await panesLoaded(page, 2);
    const after = await verticalSash(page.locator('[data-dock-layout]').first());
    expect(Math.abs(after.box.x - dragged.x)).toBeLessThanOrEqual(8);
  });

  test('탭을 고르면 그 칸이 선택되고 Context 바가 그 칸을 편집한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await expect(contextOf(page, 1)).toBeVisible();
    await paneTab(page, 3).click();
    await expect(contextOf(page, 3)).toBeVisible();
    await expect(paneTab(page, 3)).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'board-dock-tab-select');
  });

  test('탭을 다른 그룹 가운데에 끌면 한 그룹의 두 탭이 되고 칸은 다시 마운트되지 않는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await panesLoaded(page, 2);
    await expect(groups(page)).toHaveCount(2);
    await markPanes(page);
    const body = groupBody(page, 1);
    const box = (await body.boundingBox())!;
    await dragTab(page, 2, body, { x: box.width / 2, y: box.height / 2 });
    await expect(groups(page)).toHaveCount(1);
    await expect(groups(page).first().locator('[role="tab"][data-tab-panel-id]')).toHaveCount(2);
    await expect(marked(page)).toHaveCount(2);
    await evidence(page, testInfo, 'board-dock-merge');
  });

  test('탭을 가장자리에 끌면 그룹이 나뉜다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await panesLoaded(page, 2);
    const body = groupBody(page, 1);
    const box = (await body.boundingBox())!;
    await dragTab(page, 2, body, { x: box.width / 2, y: box.height / 2 });
    await expect(groups(page)).toHaveCount(1);
    await markPanes(page);
    const merged = groupBody(page, 1);
    const mergedBox = (await merged.boundingBox())!;
    await dragTab(page, 2, merged, { x: mergedBox.width - 6, y: mergedBox.height / 2 });
    await expect(groups(page)).toHaveCount(2);
    await expect(marked(page)).toHaveCount(2);
    await evidence(page, testInfo, 'board-dock-split');
  });

  test('탭의 Delete는 칸을 비우고 되돌리기로 복원한다 — 엔진 닫기는 없다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await paneTab(page, 2).focus();
    await page.keyboard.press('Delete');
    await expect(paneTab(page, 2)).toHaveAttribute('aria-label', '칸 2 · 빈 칸');
    await expect(paneTabs(page)).toHaveCount(2);
    await expect(paneTab(page, 2)).toBeFocused();
    // The shell also puts each toast's text in a sr-only announcement (#886): query the visible toast item.
    await expect(page.locator('[data-toast-item]').getByText('칸 2를 비웠습니다')).toBeVisible();
    await evidence(page, testInfo, 'board-dock-delete-empties');
    // The pane is empty now: Delete on its tab does nothing more.
    await paneTab(page, 2).focus();
    await page.keyboard.press('Delete');
    await expect(paneTabs(page)).toHaveCount(2);
    await page.getByRole('button', { name: '실행 취소' }).click();
    await expect(paneTab(page, 2)).not.toHaveAttribute('aria-label', /빈 칸/);
  });

  test('열 경계는 방향키로 5%씩 움직인다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    const separator = page.getByRole('separator', { name: '칸 1과 칸 2 너비 조절' });
    const before = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await separator.getAttribute('aria-valuenow'))).toBeCloseTo(before + 5, 0);
    await evidence(page, testInfo, 'board-dock-separator');
  });

  test('최대화는 칸 머리의 토글로 하고 Esc로 풀리며 포커스는 토글로 돌아온다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await maximizeOf(page, 1).click();
    await expect(page.locator('[data-pane-index="1"]').first()).toBeHidden();
    await expect(groupOfTab(page, 1).getByRole('button', { name: '원래 크기로' })).toBeVisible();
    await evidence(page, testInfo, 'board-dock-maximized');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-pane-index="1"]').first()).toBeVisible();
    await expect(maximizeOf(page, 1)).toBeFocused();
    // The toggle itself restores too.
    await maximizeOf(page, 1).click();
    await expect(page.locator('[data-pane-index="1"]').first()).toBeHidden();
    await groupOfTab(page, 1).getByRole('button', { name: '원래 크기로' }).click();
    await expect(page.locator('[data-pane-index="1"]').first()).toBeVisible();
    await expect(maximizeOf(page, 1)).toBeFocused();
  });

  test('최대화한 채 창 크기를 바꾸고 풀어도 열 비율이 그대로다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    const widths = async () => Promise.all([1, 2, 3, 4].map(async number => (await groupOfTab(page, number).boundingBox())!.width));
    // Pane 1 and 2 share a row, 3 and 4 the other: each pair is half of the board.
    const spread = async () => { const [a, b, c, d] = await widths(); return Math.max(Math.abs(a! - b!), Math.abs(c! - d!)); };
    await expect.poll(spread).toBeLessThanOrEqual(2);
    await maximizeOf(page, 1).click();
    await expect(page.locator('[data-pane-index="1"]').first()).toBeHidden();
    await page.setViewportSize({ width: 900, height: 900 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-pane-index="1"]').first()).toBeVisible();
    await expect.poll(spread).toBeLessThanOrEqual(2);
    expect(Math.min(...await widths())).toBeGreaterThanOrEqual(340);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(spread).toBeLessThanOrEqual(2);
  });

  test('691px에서는 한 탭 그룹에 모든 칸이 있고 692px에서는 나란히 선다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    // The real dock width decides the viewport sizes immediately either side of its 692px threshold.
    const measured = (await page.locator('[data-dock-layout]').boundingBox())!.width;
    await page.setViewportSize({ width: Math.round(1440 - measured + 691), height: 900 });
    await expect(page.locator('[data-dock-layout]')).toHaveAttribute('data-dock-narrow', 'true');
    await expect(page.locator('[data-dock-layout] [role="tablist"]')).toHaveCount(1);
    await expect(groups(page)).toHaveCount(1);
    await expect(groups(page).first().locator('[role="tab"][data-tab-panel-id]')).toHaveCount(2);
    await evidence(page, testInfo, 'board-dock-narrow');
    await page.setViewportSize({ width: Math.round(1440 - measured + 693), height: 900 });
    await expect(page.locator('[data-dock-layout]')).toHaveAttribute('data-dock-narrow', 'false');
    await expect(groups(page)).toHaveCount(2);
  });

  test('칸 탭을 시트 탭에 끌어도 시트 순서와 칸은 그대로다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2), sheetOf('other', '다른 시트', '1x1', [null])]);
    await dockReady(page, 2);
    const sheetNames = () => page.getByRole('tablist', { name: '시트' }).getByRole('tab').allTextContents();
    const before = await sheetNames();
    await paneTab(page, 2).dragTo(page.getByRole('tab', { name: '다른 시트' }));
    expect(await sheetNames()).toEqual(before);
    await expect(paneTabs(page)).toHaveCount(2);
    await expect(groups(page)).toHaveCount(2);
  });

  test('탭에서 Tab은 칸 머리의 버튼을 거쳐 그 칸 안으로 들어가고 Shift+Tab은 탭으로 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    const paneOfFocus = () => page.evaluate(() => document.activeElement?.closest('[data-pane-index]')?.getAttribute('data-pane-index') ?? null);
    const inHead = () => page.evaluate(() => document.activeElement?.closest('[data-pane-head-slot]') !== null);
    // While the screen is still loading the pane has no focusable control yet; wait for its first one.
    await expect(page.locator('[data-pane-index="0"]').getByRole('radio', { name: '시간' })).toBeVisible();
    await paneTab(page, 1).focus();
    // The group's `+` (#893 893a) is the first stop after the tab, then the head buttons.
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-group-add]:focus')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect.poll(inHead).toBe(true);
    for (let step = 0; step < 6 && await inHead(); step++) await page.keyboard.press('Tab');
    await expect.poll(paneOfFocus).toBe('0');
    for (let step = 0; step < 6 && !(await inHead()); step++) await page.keyboard.press('Shift+Tab');
    for (let step = 0; step < 6 && await inHead(); step++) await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-group-add]:focus')).toHaveCount(1);
    await page.keyboard.press('Shift+Tab');
    await expect(paneTab(page, 1)).toBeFocused();
  });

  test('묶음 +는 탭이 하나여도 둘이어도 마지막 탭 바로 뒤에 있고, 선택기를 거쳐 그 묶음에 새 탭을 더하며 취소는 아무것도 바꾸지 않는다 (#893)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    const gapAfterLastTab = async (group: number) => page.evaluate(index => {
      const root = document.querySelectorAll('[data-dock-layout] .dv-groupview')[index]!;
      const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
      const plus = root.querySelector('[data-group-add]')!.getBoundingClientRect();
      const last = tabs[tabs.length - 1]!.getBoundingClientRect();
      return { gap: plus.left - last.right, width: plus.width, height: plus.height, tabs: tabs.length };
    }, group);
    const one = await gapAfterLastTab(0);
    expect(one.tabs).toBe(1);
    expect(one.gap).toBeGreaterThanOrEqual(0);
    expect(one.gap).toBeLessThanOrEqual(8);
    expect(one.width).toBeGreaterThanOrEqual(24);
    expect(one.height).toBeGreaterThanOrEqual(24);
    const add = page.locator('[data-group-add]').first();
    await add.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(paneTabs(page)).toHaveCount(2);
    await expect(add).toBeFocused();
    await add.click();
    await dialog.getByRole('button').first().click();
    await expect(paneTabs(page)).toHaveCount(3);
    const two = await gapAfterLastTab(0);
    expect(two.tabs).toBe(2);
    expect(two.gap).toBeGreaterThanOrEqual(0);
    expect(two.gap).toBeLessThanOrEqual(8);
  });

  test('기본 2×2에서 Tab은 칸 1→2→3→4 순서다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await paneTab(page, 1).focus();
    const visited = [1];
    for (let step = 0; step < 400 && visited.length < 4; step++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => (document.activeElement?.getAttribute('role') === 'tab' ? document.activeElement.getAttribute('aria-label') : null));
      const number = label ? Number(/^칸 (\d) · /.exec(label)?.[1]) : NaN;
      if (!Number.isNaN(number)) visited.push(number);
    }
    expect(visited).toEqual([1, 2, 3, 4]);
  });

  test('행 비율이 다른 두 열에서 읽기 순서가 DOM 순서와 달라도 Tab은 마지막 칸 뒤에서 보드 밖으로 나가고 Shift+Tab은 첫 칸 앞으로 나간다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    // Left column 1 over 3 at 75/25, right column 2 over 4 at 50/50: the group tops read 1, 2, 4, 3 while the engine keeps 1, 3, 2, 4.
    const separator = page.getByRole('separator', { name: '칸 1과 칸 3 높이 조절' });
    const before = Number(await separator.getAttribute('aria-valuenow'));
    await separator.focus();
    for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowDown');
    await expect.poll(async () => Number(await separator.getAttribute('aria-valuenow'))).toBeCloseTo(before + 25, 0);
    // Start once every granted pane has drawn its screen (pane 4, DIFF, has no grant): the number of stops must not depend on load timing.
    for (const index of [0, 1, 2]) await expect(page.locator(`[data-pane-index="${index}"]`).getByRole('radio', { name: '시간' })).toBeVisible();
    const outside = () => page.evaluate(() => { const focus = document.activeElement; return focus !== null && focus !== document.body && !focus.closest('[data-dock-layout]'); });
    const visited: number[] = [];
    const note = async () => {
      const label = await page.evaluate(() => (document.activeElement?.getAttribute('role') === 'tab' ? document.activeElement.getAttribute('aria-label') : null));
      const number = label ? Number(/^칸 (\d) · /.exec(label)?.[1]) : NaN;
      if (!Number.isNaN(number) && visited.at(-1) !== number) visited.push(number);
    };
    await paneTab(page, 1).focus();
    await note();
    for (let step = 0; step < 400 && !(await outside()); step++) { await page.keyboard.press('Tab'); await note(); }
    expect(visited).toEqual([1, 2, 4, 3]);
    expect(await outside()).toBe(true);
    // Back: out of the layout before the first group.
    await paneTab(page, 1).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await outside()).toBe(true);
  });

  test('창을 줄여 좁은 폭이 된 직후에도 보드에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await page.setViewportSize({ width: 721, height: 900 });
    await expect(page.locator('[data-dock-layout]')).toHaveAttribute('data-dock-narrow', 'true');
    // The board's own scroll container, not only the document: an overlay left at its old position widens the former.
    const board = page.getByRole('tabpanel').filter({ has: page.locator('[data-board-dock]') });
    await expect.poll(() => board.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('기본값은 dock이다: 렌더러 설정이 없으면 칸마다 탭 띠와 칸 머리가 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, 'engineer');
    // No `platform:board-layout-engine`: the browser asked for nothing.
    await page.addInitScript(({ value }) => {
      if (sessionStorage.getItem('platform:board-fixture-seeded:engineer')) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem('platform:board-fixture-seeded:engineer', '1');
    }, { value: { v: 1, activeSheetId: 'dock', sheets: [populated('dock', '1x2', 2)] } });
    await page.goto('/board?sheet=dock');
    await expect(page.locator('[data-dock-layout]')).toBeVisible();
    await expect(paneTabs(page)).toHaveCount(2);
    await expect(page.getByRole('group', { name: '칸 1 머리' })).toBeVisible();
    await expect(page.locator('[data-board-grid]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('platform:board-layout-engine'))).toBeNull();
  });

  test('칸 추가로 4칸을 만들면 1280×800에서도 두 그룹 폭이고 가로 스크롤이 없다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithDockBoard(page, [populated('dock', '1x1', 1)]);
    await dockReady(page, 1);
    for (let n = 2; n <= 4; n++) {
      await page.getByRole('button', { name: '칸 추가' }).click();
      await expect(paneTabs(page)).toHaveCount(n);
    }
    await expect(groups(page)).toHaveCount(4);
    const lefts = await groups(page).evaluateAll(items => Array.from(new Set(items.map(item => Math.round(item.getBoundingClientRect().left)))));
    expect(lefts).toHaveLength(2);
    const overflow = await page.locator('#board-panel').evaluate(panel => panel.scrollWidth - panel.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await evidence(page, testInfo, 'board-dock-add-pane-2x2-1280');
  });

  test('1440×900에서 모든 칸 본문은 120px 이상이다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await expect(contextOf(page, 1)).toBeVisible();
    const heights = await page.locator('[data-pane-body]').evaluateAll(bodies => bodies.map(body => body.getBoundingClientRect().height));
    expect(heights).toHaveLength(4);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(120);
    await evidence(page, testInfo, 'board-dock-2x2');
  });

  test('칸 머리 띠의 탭 내용은 띠의 세로 가운데에 있다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    // The badge of the tab and the buttons of the pane head share the strip's middle line (the engine wraps tab content in its own block).
    const offsets = await page.locator('[data-dock-layout] .dv-tabs-and-actions-container').evaluateAll(strips => strips.map(strip => {
      const middle = (element: Element | null) => { const box = element!.getBoundingClientRect(); return box.top + box.height / 2; };
      const line = strip.getBoundingClientRect();
      const stripMiddle = line.top + (line.height - 1) / 2;
      return [middle(strip.querySelector('.dv-tab [data-selected]')) - stripMiddle, middle(strip.querySelector('[data-dock-group-actions] button')) - stripMiddle];
    }));
    expect(offsets).toHaveLength(2);
    for (const [tab, head] of offsets) {
      expect(Math.abs(tab)).toBeLessThanOrEqual(2);
      expect(Math.abs(head)).toBeLessThanOrEqual(2);
    }
    await evidence(page, testInfo, 'board-dock-strip-middle');
  });

  test('최대화한 칸 뒤의 숨은 칸 안 중첩 dock는 그려지지 않는다 (#964)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [sheetOf('dock', '도킹', '1x2', [
      screenOf(`v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`),
      { menuId: 'hw-time-compare', params: {}, query: `?v=1&scopeId=MEM&${PERIOD}` },
    ])]);
    // `dockReady` counts every dock tab, and HW Time's own dock adds more, so wait on the two pane roots instead.
    await page.goto('/board?sheet=dock');
    await expect(page.locator('[data-pane-id]')).toHaveCount(2);
    // The lazy HW Time screen draws its own dock after the first paint; wait for it so the check below cannot pass on an empty pane.
    await expect(page.locator('[data-pane-id]').nth(1).locator('.dv-groupview').first()).toBeVisible();
    const visibilityOf = (selector: string) => page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).visibility));
    await maximizeOf(page, 1).click();
    await expect(page.getByRole('button', { name: '원래 크기로' })).toBeVisible();
    // The second pane root is hidden; a nested dock inside it must inherit that, not draw its empty frames over pane 1.
    expect((await visibilityOf('[data-pane-id]'))[1]).toBe('hidden');
    const nested = page.locator('[data-pane-id]').nth(1).locator('.dv-groupview');
    expect(await nested.count()).toBeGreaterThan(0);
    expect(await nested.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).visibility))).not.toContain('visible');
    await page.getByRole('button', { name: '원래 크기로' }).click();
    await expect(page.getByRole('button', { name: '원래 크기로' })).toHaveCount(0);
    expect(await visibilityOf('[data-pane-id]')).toEqual(['visible', 'visible']);
  });

  test('최대화 중 폭이 바뀌었다 돌아와도 원래 크기로 하면 분할 비율이 그대로다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '1x2', 2)]);
    await dockReady(page, 2);
    await panesLoaded(page, 2);
    const widths = () => groups(page).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    const before = await widths();
    expect(before).toHaveLength(2);
    expect(before[0]! + before[1]!).toBeGreaterThan(1000);
    expect(Math.abs(before[0]! - before[1]!)).toBeLessThanOrEqual(2);
    await maximizeOf(page, 1).click();
    const restore = groupOfTab(page, 1).getByRole('button', { name: '원래 크기로' });
    await expect(restore).toBeVisible();
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(restore).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect.poll(async () => {
      const after = await widths();
      if (after.length !== 2) return false;
      return Math.abs(after[0]! - after[1]!) <= 2 && Math.abs(after[0]! - before[0]!) <= 2 && Math.abs(after[1]! - before[1]!) <= 2;
    }).toBe(true);
  });

  // 893e (ADR-0089): the sheet holds up to 8 tabs but only 4 displayed groups; the 5th tab joins a group instead of making a 5th one.
  const boardOf = (page: Page) => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('platform:board:v2:')).map(([, value]) => JSON.parse(value) as { v: number; sheets: { panes: unknown[] }[] })[0]);

  test('4개 영역을 유지한 채 한 영역에 5번째 탭을 더하고, 저장은 v:3이며 새로고침 뒤에도 남는다 (#893 893e)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await expect(groups(page)).toHaveCount(4);
    await page.locator('[data-group-add]').first().click();
    await page.getByRole('dialog').getByRole('button').first().click();
    await expect(paneTabs(page)).toHaveCount(5);
    await expect(groups(page)).toHaveCount(4);
    await expect.poll(async () => (await boardOf(page))?.v).toBe(3);
    expect((await boardOf(page))!.sheets[0]!.panes).toHaveLength(5);
    await page.reload();
    await expect(paneTabs(page)).toHaveCount(5);
    await expect(groups(page)).toHaveCount(4);
  });

  test('새로고침하면 마지막 선택 칸과 묶음별 활성 탭을 되살린다 (#978 978d)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    // Pane 5 joins the first group as its active tab; then another group's pane is selected.
    await page.locator('[data-group-add]').first().click();
    await page.getByRole('dialog').getByRole('button').first().click();
    await expect(paneTabs(page)).toHaveCount(5);
    await paneTab(page, 2).click();
    await expect(contextOf(page, 2)).toBeVisible();
    await expect(paneTab(page, 5)).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(paneTabs(page)).toHaveCount(5);
    await expect(contextOf(page, 2)).toBeVisible();
    await expect(paneTab(page, 2)).toHaveAttribute('aria-selected', 'true');
    await expect(paneTab(page, 5)).toHaveAttribute('aria-selected', 'true');
    await expect(paneTab(page, 1)).toHaveAttribute('aria-selected', 'false');
  });

  test('4개 영역일 때 탭을 가장자리에 끌어도 5번째 영역은 생기지 않는다 (#893 893e)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await page.locator('[data-group-add]').first().click();
    await page.getByRole('dialog').getByRole('button').first().click();
    await expect(paneTabs(page)).toHaveCount(5);
    // The picked screen is not the KPI one `panesLoaded` counts; wait for every skeleton to go instead.
    await expect(page.locator('[data-dock-layout] [data-pane-body] [role="status"][aria-busy]')).toHaveCount(0);
    const target = groupBody(page, 2);
    const box = (await target.boundingBox())!;
    await dragTab(page, 5, target, { x: box.width - 6, y: box.height / 2 });
    await expect(groups(page)).toHaveCount(4);
    await expect(paneTabs(page)).toHaveCount(5);
  });
  test('좁은 띠에서 배경 탭은 뒤에서부터 하나씩 배지가 되고 활성 탭은 이름을 지킨다 (#978 UX-4, docs/16 §4 ②)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    // Below 692px every pane is one tab group; its strip is as wide as the viewport lets it be.
    await page.setViewportSize({ width: 640, height: 900 });
    await expect(groups(page)).toHaveCount(1);
    const tabs = page.locator('[data-dock-layout] .dv-tab');
    await expect(tabs).toHaveCount(4);
    const marks = async () => tabs.evaluateAll(list => list.map(tab => ({ compact: tab.hasAttribute('data-dock-tab-compact'), active: tab.classList.contains('dv-active-tab') })));
    await expect.poll(async () => (await marks()).some(tab => tab.compact)).toBe(true);
    const state = await marks();
    // The active tab never shrinks; the shrunk background tabs are the last ones, as a block.
    expect(state.filter(tab => tab.active && tab.compact)).toHaveLength(0);
    const background = state.filter(tab => !tab.active).map(tab => tab.compact);
    const shrunk = background.filter(Boolean).length;
    expect(background).toEqual(background.map((_, n) => n >= background.length - shrunk));
    // Not every background tab shrinks when the strip has room for a name beside the badge of the others: widen it and fewer shrink.
    await page.setViewportSize({ width: 690, height: 900 });
    await expect.poll(async () => (await marks()).filter(tab => tab.compact).length).toBeLessThanOrEqual(shrunk);
  });
  test('4개 영역일 때 탭을 다른 영역 가장자리에 끌면 분할 미리보기가 없고 가운데에는 있다 (#978 UX-2)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDockBoard(page, [populated('dock', '2x2', 4)]);
    await dockReady(page, 4);
    await page.locator('[data-group-add]').first().click();
    await page.getByRole('dialog').getByRole('button').first().click();
    await expect(paneTabs(page)).toHaveCount(5);
    await expect(page.locator('[data-dock-layout] [data-pane-body] [role="status"][aria-busy]')).toHaveCount(0);
    const target = groupBody(page, 2);
    const box = (await target.boundingBox())!;
    const source = (await paneTab(page, 5).boundingBox())!;
    const preview = page.locator('[data-dock-layout] .dv-drop-target-dropzone, [data-dock-layout] .dv-drop-target-anchor');
    const hoverAt = async (x: number, y: number) => {
      await page.mouse.move(x, y, { steps: 8 });
      for (let i = 0; i < 4; i++) { await page.waitForTimeout(80); await page.mouse.move(x + (i % 2 === 0 ? -2 : 2), y); }
    };
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    // The middle joins the group's tabs: the engine draws its preview (this also proves the selector sees one).
    await hoverAt(box.x + box.width / 2, box.y + box.height / 2);
    await expect(preview.first()).toBeVisible();
    // The edge would split into a fifth group: no preview.
    await hoverAt(box.x + box.width - 6, box.y + box.height / 2);
    await expect(preview).toHaveCount(0);
    await page.mouse.up();
    await expect(groups(page)).toHaveCount(4);
  });
});

test.describe('메뉴 작업 영역 (ADR-0067 3b)', () => {
  // 첫 소비자는 사이클타임 드릴다운(PanelWorkspace, persistKey `drilldown`, 프리셋 기본·집중). 각 검사는 자기 저장소로 혼자 선다.
  const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const TITLES = { summary: '사이클타임 요약', trend: '사이클타임 추세', distribution: '사이클타임 분포', slow: '느린 실행' } as const;

  /** The dock region of the menu workspace; inside a board pane the board's own dock is the outer `[data-dock-layout]`. */
  const workspace = (page: Page) => page.getByRole('region', { name: '사이클타임 분석 영역', exact: true });
  /** The tab group holding a panel's tab (`has` starts below the group, at the tab). */
  const groupOf = (page: Page, title: string) => workspace(page).locator('.dv-groupview').filter({ has: page.getByRole('tab', { name: title }) });
  const trendPlot = (page: Page) => page.getByRole('img', { name: /^사이클타임 추세/ });
  const mainScrolls = (page: Page) => page.locator('#platform-main').evaluate(element => element.scrollHeight > element.clientHeight + 1);

  /** The two stored collapse flags are cleared before every load, so the bars start expanded (the default). */
  async function expandedBarsAtLoad(page: Page) {
    await page.addInitScript(() => {
      localStorage.removeItem('platform:query-bar-collapsed:cycle-time');
      localStorage.removeItem('platform:page-filter-collapsed:cycle-time');
      localStorage.removeItem('platform:page-head-collapsed:cycle-time');
    });
  }
  /** Collapses the query bar, the page filter and the page head (the head starts collapsed; the filter sits inside it). */
  async function collapseBars(page: Page) {
    await page.getByRole('button', { name: '조회 조건 접기' }).click();
    await expandPageHead(page);
    await page.getByRole('button', { name: '페이지 필터 접기' }).click();
    await page.getByRole('button', { name: '페이지 머리 접기' }).click();
  }
  async function workspaceReady(page: Page) {
    await expect(workspace(page)).toBeVisible();
    await expect(trendPlot(page)).toBeVisible();
    await expect(page.getByRole('img', { name: /^사이클타임 분포/ })).toBeVisible();
    await expect(page.getByTestId('cycle-kpi')).toBeVisible();
  }
  /** Requests the cycle endpoints took, counted by the mock server's marks (export excluded). */
  const cycleRequests = (page: Page) => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
    .filter(entry => /^analytics\.cycle\.(kpi|trend|dist|slow)$/.test(String((entry as PerformanceMark).detail?.endpoint))).length);
  /** The plot the user sees: the canvas box clipped by every scrolling or clipping ancestor (a canvas can be taller than the window it sits in). */
  const visiblePlotHeight = (page: Page) => workspace(page).getByRole('region', { name: TITLES.trend, exact: true }).locator('canvas').first().evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    let top = box.top; let bottom = box.bottom;
    for (let element = canvas.parentElement; element; element = element.parentElement) {
      if (getComputedStyle(element).overflowY === 'visible') continue;
      const clip = element.getBoundingClientRect();
      top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
    }
    return Math.max(0, bottom - top);
  });

  test('기본 배치: 추세가 높이의 55% 이상(320px 이상)·가장 넓고 보이는 그림이 300px 이상이며, 막대를 펼치면 작업 영역이 520px 아래로 찌그러지지 않는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expandedBarsAtLoad(page);
    await page.goto(CYCLE);
    await workspaceReady(page);
    await collapseBars(page);

    const region = (await workspace(page).boundingBox())!;
    const trend = (await groupOf(page, TITLES.trend).boundingBox())!;
    expect(trend.height / region.height).toBeGreaterThanOrEqual(0.55);
    expect(trend.height).toBeGreaterThanOrEqual(320);
    // The trend takes the full workspace height and the widest column; the others stack in the narrower column beside it.
    for (const title of [TITLES.summary, TITLES.distribution]) expect(trend.width).toBeGreaterThan((await groupOf(page, title).boundingBox())!.width);
    expect(await visiblePlotHeight(page)).toBeGreaterThanOrEqual(300);
    expect(await mainScrolls(page)).toBe(false);
    await evidence(page, testInfo, 'workspace-balanced-1440x900');

    // The trend declares a 480 px minimum: Home on the separator beside it stops there, not at the global 240 px.
    const sideSeparator = workspace(page).getByRole('separator', { name: /^사이클타임 추세 · .+ 사이 너비$/ });
    await sideSeparator.focus();
    await page.keyboard.press('Home');
    await expect.poll(async () => (await groupOf(page, TITLES.trend).boundingBox())!.width).toBeGreaterThanOrEqual(479);

    await page.getByRole('button', { name: '조회 조건 펼치기' }).click();
    await expandPageHead(page);
    await page.getByRole('button', { name: '페이지 필터 펼치기' }).click();
    // The fill body keeps 520 px (toolbar included): the page scrolls instead of crushing the workspace.
    await expect.poll(async () => (await page.locator('[data-panel-workspace]').boundingBox())!.height).toBeGreaterThanOrEqual(519.5);
    expect(await mainScrolls(page)).toBe(true);
    await evidence(page, testInfo, 'workspace-min-height-expanded-bars');
  });

  test('프리셋 전환·기본 배치·숨김·최대화는 조회를 다시 보내지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CYCLE);
    await workspaceReady(page);
    await page.waitForTimeout(500);
    const before = await cycleRequests(page);
    expect(before).toBeGreaterThanOrEqual(3);

    await page.getByRole('radio', { name: '집중' }).click();
    await expect(page.getByRole('radio', { name: '집중' })).toBeChecked();
    await page.getByRole('radio', { name: '기본', exact: true }).click();
    await expect(page.getByRole('radio', { name: '기본', exact: true })).toBeChecked();
    await page.getByRole('button', { name: '기본 배치', exact: true }).click();
    await page.getByRole('button', { name: `${TITLES.distribution} 동작` }).click();
    await page.getByRole('menuitem', { name: '숨기기' }).click();
    await expect(page.getByRole('tab', { name: TITLES.distribution })).toHaveCount(0);
    await page.getByRole('button', { name: '숨긴 패널 1' }).click();
    await page.getByRole('menuitem', { name: `${TITLES.distribution} 다시 보기` }).click();
    await expect(page.getByRole('tab', { name: TITLES.distribution })).toBeVisible();
    // Showing the panel again can leave another tab active in the trend's group; the maximize toggle belongs to the active tab.
    await groupOf(page, TITLES.trend).getByRole('tab', { name: TITLES.trend }).click();
    await groupOf(page, TITLES.trend).getByRole('button', { name: `${TITLES.trend} 최대화` }).click();
    await groupOf(page, TITLES.trend).getByRole('button', { name: '원래 크기로' }).click();
    await expect(groupOf(page, TITLES.trend).getByRole('button', { name: `${TITLES.trend} 최대화` })).toBeVisible();

    await page.waitForTimeout(500);
    expect(await cycleRequests(page)).toBe(before);
  });

  test('추세 차트 높이는 컨테이너를 따른다: 최대화하면 커지고 복원하면 원래 높이로 돌아온다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expandedBarsAtLoad(page);
    await page.goto(CYCLE);
    await workspaceReady(page);
    await collapseBars(page);
    // Read the original only once the layout has settled after the bars collapse (the first ≥ 300 reading can still be growing).
    let original = -1;
    await expect.poll(async () => {
      const previous = original;
      original = await visiblePlotHeight(page);
      return original >= 300 && Math.abs(original - previous) < 0.5;
    }, { intervals: [200] }).toBe(true);

    await groupOf(page, TITLES.trend).getByRole('button', { name: `${TITLES.trend} 최대화` }).click();
    await expect.poll(() => visiblePlotHeight(page)).toBeGreaterThan(original + 4);
    await evidence(page, testInfo, 'workspace-trend-maximized');
    await groupOf(page, TITLES.trend).getByRole('button', { name: '원래 크기로' }).click();
    await expect.poll(async () => Math.abs((await visiblePlotHeight(page)) - original)).toBeLessThanOrEqual(4);
  });

  test('응답 배너가 떠도 작업 영역은 페이지 본문 안에 머물고 520px을 지킨다(배너 전후에는 main이 스크롤되지 않는다)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expandedBarsAtLoad(page);
    await page.goto(CYCLE);
    await workspaceReady(page);
    await collapseBars(page);
    const insideBody = async () => {
      const body = (await page.locator('[data-platform-page-content]').boundingBox())!;
      const box = (await page.locator('[data-panel-workspace]').boundingBox())!;
      return box.y >= body.y - 1 && box.y + box.height <= body.y + body.height + 1;
    };
    expect(await insideBody()).toBe(true);
    expect(await mainScrolls(page)).toBe(false);

    await setScenario(page, '서버 오류 (error)');
    await expect(page.getByRole('main').locator('[data-outcome-banner]')).toHaveCount(1);
    await expect.poll(() => insideBody()).toBe(true);
    // The banner is the thin strip on a fill page (#680), so the page does not scroll here either; the workspace must not shrink.
    // Measured on the fill root (toolbar + dock), the element the minimum applies to; the named dock region excludes the toolbar.
    expect((await page.locator('[data-panel-workspace]').boundingBox())!.height).toBeGreaterThanOrEqual(519.5);
    await evidence(page, testInfo, 'workspace-with-banner');

    await setScenario(page, '정상');
    await expect(page.getByRole('main').locator('[data-outcome-banner]')).toHaveCount(0);
    await expect.poll(() => insideBody()).toBe(true);
    expect(await mainScrolls(page)).toBe(false);
  });

  test('마우스로 끈 패널 경계 크기는 저장되고 새로고침 뒤에도 남는다 (#754)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CYCLE);
    await workspaceReady(page);
    await page.evaluate(() => { Object.keys(localStorage).filter(key => key.startsWith('platform:workspace:v1:')).forEach(key => { localStorage.removeItem(key); }); });
    const stored = () => page.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => /^platform:workspace:v1:.+:cycle-time:drilldown$/.test(key)).map(([, value]) => JSON.parse(value) as { layout: unknown }));
    expect(await stored()).toEqual([]);
    const before = await verticalSash(workspace(page));
    await dragSashBy(page, before.sash, 120);
    // The engine places the sash by its minimum sizes and px rounding, not exactly under the pointer: compare with where it landed.
    const dragged = (await before.sash.boundingBox())!;
    expect(dragged.x - before.box.x).toBeGreaterThan(60);
    // The preference is written 300 ms after the change.
    await expect.poll(async () => (await stored()).length).toBe(1);
    expect(JSON.stringify((await stored())[0]!.layout)).toContain('sizes');
    await page.reload();
    await workspaceReady(page);
    const after = await verticalSash(workspace(page));
    expect(Math.abs(after.box.x - dragged.x)).toBeLessThanOrEqual(8);
  });

  test('프리셋과 숨긴 패널은 브라우저에 기억되어 새로고침 뒤에도 같다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CYCLE);
    await workspaceReady(page);
    await page.getByRole('radio', { name: '집중' }).click();
    // `집중` puts summary, distribution and slow in one tab group; the group's menu acts on its active tab.
    await page.getByRole('tab', { name: TITLES.distribution }).click();
    await page.getByRole('button', { name: `${TITLES.distribution} 동작` }).click();
    await page.getByRole('menuitem', { name: '숨기기' }).click();
    await expect(page.getByRole('button', { name: '숨긴 패널 1' })).toBeEnabled();
    const stored = () => page.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => /^platform:workspace:v1:.+:cycle-time:drilldown$/.test(key)).map(([, value]) => JSON.parse(value) as { preset: string; hidden: string[] }));
    // The preference is written 300 ms after the change.
    await expect.poll(stored).toMatchObject([{ preset: 'focus', hidden: ['distribution'] }]);

    await page.reload();
    await expect(workspace(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: '집중' })).toBeChecked();
    await expect(page.getByRole('button', { name: '숨긴 패널 1' })).toBeEnabled();
    await expect(page.getByRole('tab', { name: TITLES.distribution })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: TITLES.slow })).toBeVisible();
    expect(await stored()).toMatchObject([{ preset: 'focus', hidden: ['distribution'] }]);
    await evidence(page, testInfo, 'workspace-preference-restored');
  });

  /** The V1 board and the dock flag go in one init script, so the first load already draws the dock with cycle-time in the pane. */
  type PaneSeed = { menuId: string; params: Record<string, string>; query: string };
  const cyclePane = (): PaneSeed => ({ menuId: 'cycle-time', params: {}, query: `?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}` });
  const productivityPane = (): PaneSeed => ({ menuId: 'productivity-overview', params: {}, query: `?v=1&scopeId=MEM&roomNames=ETCH&${PERIOD}` });
  async function seedDockBoard(page: Page, layout: '1x1' | '1x2', panes: PaneSeed[]) {
    await signInAs(page, 'engineer');
    await page.addInitScript(({ value }) => {
      localStorage.setItem('platform:board-layout-engine', 'dock');
      localStorage.setItem('platform:page-filter-collapsed:cycle-time', 'true');
      const seeded = 'platform:board-fixture-seeded:engineer';
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { value: { v: 1, activeSheetId: 'ws', sheets: [{ id: 'ws', name: '작업 영역', layout, selected: 0, panes }] } });
  }

  test('보드 칸 안에서는 작업 영역 도구줄이 없고 칸 ⋯ 메뉴가 프리셋(라디오)과 기본 배치를 싣는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await seedDockBoard(page, '1x1', [cyclePane()]);
    await page.goto('/board?sheet=ws');
    await expect(workspace(page)).toBeVisible();
    await expect(workspace(page).locator('.dv-groupview')).toHaveCount(3);
    await expect(page.getByRole('toolbar', { name: '배치' })).toHaveCount(0);

    await page.getByRole('button', { name: '칸 1 동작' }).click();
    await expect(page.getByRole('menuitemradio', { name: '기본', exact: true })).toBeChecked();
    await expect(page.getByRole('menuitemradio', { name: '집중' })).not.toBeChecked();
    await expect(page.getByRole('menuitem', { name: '기본 배치', exact: true })).toBeVisible();
    await evidence(page, testInfo, 'board-pane-menu-workspace-commands');
    await page.getByRole('menuitemradio', { name: '집중' }).click();
    await expect(workspace(page).locator('.dv-groupview')).toHaveCount(2);

    await page.getByRole('button', { name: '칸 1 동작' }).click();
    await expect(page.getByRole('menuitemradio', { name: '집중' })).toBeChecked();
    await page.keyboard.press('Escape');
  });

  /** Drags like a person (press, stepped move, small moves over the target, release); the board's `dragTab` takes board tabs only. */
  async function dragLike(page: Page, source: Locator, target: Locator, position: { x: number; y: number }) {
    await source.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    const box = (await target.boundingBox())!;
    const x = box.x + position.x;
    const y = box.y + position.y;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(80);
      await page.mouse.move(x + (i % 2 === 0 ? -2 : 2), y);
    }
    await page.mouse.up();
  }

  test('중첩 끌기는 거절된다: 칸 안 작업 영역의 탭은 보드 칸 띠나 다른 칸으로 옮겨지지 않는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await seedDockBoard(page, '1x2', [cyclePane(), productivityPane()]);
    await page.goto('/board?sheet=ws');
    await expect(workspace(page)).toBeVisible();
    await expect(trendPlot(page)).toBeVisible();

    // The inner workspace is a dock too: every board locator starts at a tab named `칸 N ·` or at the group holding one.
    const boardTab = (number: number) => page.locator(`[role="tab"][data-tab-panel-id][aria-label^="칸 ${number} · "]`);
    const boardGroup = (number: number) => page.locator('[data-dock-layout] .dv-groupview').filter({ has: boardTab(number) });
    const boardTabLabels = () => page.locator('[role="tab"][data-tab-panel-id][aria-label^="칸 "]').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('aria-label')));
    const innerTabLabels = () => workspace(page).getByRole('tab').evaluateAll(tabs => tabs.map(tab => tab.textContent?.trim()));
    const stored = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage)
      .filter(([key]) => key.startsWith('platform:board:v2:') || key.startsWith('platform:workspace:v1:')).sort(([a], [b]) => a.localeCompare(b))));
    await expect(boardTab(1)).toBeVisible();
    await expect(boardTab(2)).toBeVisible();
    await page.waitForTimeout(600);
    const snapshot = { stored: await stored(), board: await boardTabLabels(), inner: await innerTabLabels() };
    expect(snapshot.board).toHaveLength(2);
    expect(snapshot.inner.length).toBeGreaterThanOrEqual(2);
    await expect(boardGroup(1)).toHaveCount(1);
    await expect(boardGroup(2)).toHaveCount(1);

    const innerTab = workspace(page).getByRole('tab', { name: TITLES.trend });
    const body2 = boardGroup(2).locator('.dv-content-container');
    const body2Box = (await body2.boundingBox())!;
    // onto the other pane's tab, onto the middle and the right edge of the other pane, onto this pane's own board tab
    await dragLike(page, innerTab, boardTab(2), { x: 20, y: 10 });
    await dragLike(page, innerTab, body2, { x: body2Box.width / 2, y: body2Box.height / 2 });
    await dragLike(page, innerTab, body2, { x: body2Box.width - 6, y: body2Box.height / 2 });
    await dragLike(page, innerTab, boardTab(1), { x: 20, y: 10 });
    await page.waitForTimeout(600);

    expect(await boardTabLabels()).toEqual(snapshot.board);
    expect(await innerTabLabels()).toEqual(snapshot.inner);
    expect(await stored()).toBe(snapshot.stored);
    await expect(boardGroup(1)).toHaveCount(1);
    await expect(boardGroup(2)).toHaveCount(1);
    await expect(workspace(page)).toHaveCount(1);
    await evidence(page, testInfo, 'board-nested-drag-refused');
  });
});

// #686 (ADR-0077, 06 §12.8): the workspace's second height mode. Written by the worker, who cannot run E2E: the host runs it first and derives the
// numeric tolerances from browser measurements (`ROUNDING` is a placeholder for the engine's pixel rounding, not a measurement).
test.describe('작업 영역 아래로 쌓기 (#686, 06 §12.8)', () => {
  const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const STORE = /^platform:workspace:v1:.+:cycle-time:drilldown$/;
  const TITLES = { summary: '사이클타임 요약', trend: '사이클타임 추세', distribution: '사이클타임 분포', slow: '느린 실행' } as const;
  const ROUNDING = 2;
  const NEW_ROW = 360;
  const STEP = 24;
  /** The engine's gap between two top-level rows; the workspace box is the rows' px plus one gap per boundary, so a row added or removed moves the height by its px and one gap. */
  const GAP = 6;

  const workspace = (page: Page) => page.getByRole('region', { name: '사이클타임 분석 영역', exact: true });
  const groupOf = (page: Page, title: string) => workspace(page).locator('.dv-groupview').filter({ has: page.getByRole('tab', { name: title }) });
  const rowSeparators = (page: Page) => workspace(page).locator('[data-dock-row-separator]');
  const dropStrip = (page: Page) => workspace(page).locator('[data-dock-drop-below]');
  const root = (page: Page) => page.locator('[data-panel-workspace]');
  const modeRadio = (page: Page, name: '화면 맞춤' | '아래로 쌓기') => page.getByRole('radiogroup', { name: '높이 방식' }).getByRole('radio', { name });
  const mainScrolls = (page: Page) => page.locator('#platform-main').evaluate(element => element.scrollHeight > element.clientHeight + 1);
  const heightOf = async (locator: Locator) => (await locator.boundingBox())!.height;
  const rowPx = (page: Page) => rowSeparators(page).evaluateAll(items => items.map(item => Number(item.getAttribute('aria-valuenow'))));
  const bound = (page: Page, index: number, name: 'aria-valuemin' | 'aria-valuemax') => rowSeparators(page).nth(index).getAttribute(name).then(Number);
  const stored = (page: Page) => page.evaluate(pattern => Object.entries(localStorage).filter(([key]) => new RegExp(pattern).test(key)).map(([, value]) => JSON.parse(value) as { preset: string; mode?: string; rows?: number[]; hidden: string[] }), STORE.source);
  const cycleRequests = (page: Page) => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
    .filter(entry => /^analytics\.cycle\.(kpi|trend|dist|slow)$/.test(String((entry as PerformanceMark).detail?.endpoint))).length);
  const near = (actual: number, expected: number, tolerance = ROUNDING) => Math.abs(actual - expected) <= tolerance;

  /** `inPane`: a board pane is too narrow for the KPI strip to show, so readiness rests on the workspace and the trend chart. */
  async function ready(page: Page, { inPane = false } = {}) {
    await expect(workspace(page)).toBeVisible();
    if (!inPane) await expect(page.getByTestId('cycle-kpi')).toBeVisible();
    await expect(page.getByRole('img', { name: /^사이클타임 추세/ })).toBeVisible();
  }
  /** The `세로` preset first (one question per row), then the mode: multi-row assertions never depend on a default preset. */
  async function openStack(page: Page, preset: '세로' | '기본' | '집중' = '세로') {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CYCLE);
    await ready(page);
    await page.getByRole('radio', { name: preset, exact: true }).click();
    await modeRadio(page, '아래로 쌓기').click();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
    await expect(rowSeparators(page).first()).toBeVisible();
  }
  /** Drags like a person (press, stepped move, small moves over the target, release). */
  async function dragLike(page: Page, source: Locator, target: Locator, position: { x: number; y: number }) {
    await source.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const x = box.x + position.x;
    const y = box.y + position.y;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(80);
      await page.mouse.move(x + (i % 2 === 0 ? -2 : 2), y);
    }
    await page.mouse.up();
  }

  test('아래로 쌓기로 바꾸면 줄이 px 높이를 갖고 페이지가 스크롤되며, 화면 맞춤으로 돌아오면 고정 높이로 돌아온다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CYCLE);
    await ready(page);
    await page.getByRole('radio', { name: '세로', exact: true }).click();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'fit');
    await expect(page.locator('[data-platform-page]')).toHaveClass(/(^|\s)h-full(\s|$)/);
    const requests = await cycleRequests(page);
    const fitHeight = await heightOf(root(page));

    await modeRadio(page, '아래로 쌓기').click();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
    await expect(page.locator('[data-platform-page]')).not.toHaveClass(/(^|\s)h-full(\s|$)/);
    await expect(rowSeparators(page)).toHaveCount(3);
    const rows = await rowPx(page);
    expect(rows.every(px => px >= 200)).toBe(true);
    // Natural flow: the main area scrolls by itself, with nothing injected to make room.
    expect(await mainScrolls(page)).toBe(true);
    expect(await heightOf(root(page))).toBeGreaterThan(fitHeight);
    await dropStrip(page).scrollIntoViewIfNeeded();
    await expect(dropStrip(page)).toBeVisible();
    await expect(dropStrip(page)).toHaveText('여기에 놓으면 아래에 새 줄');
    await evidence(page, testInfo, 'workspace-stack-scrolls');

    await modeRadio(page, '화면 맞춤').click();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'fit');
    await expect(page.locator('[data-platform-page]')).toHaveClass(/(^|\s)h-full(\s|$)/);
    await expect(rowSeparators(page)).toHaveCount(0);
    await expect(dropStrip(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await cycleRequests(page)).toBe(requests);
  });

  test('쌓기에서도 페이지 머리 접기와 얇은 응답 띠는 그대로다(#680)', async ({ page }) => {
    await openStack(page);
    await expect(page.locator('[data-page-head-line]')).toHaveCount(1);
    await expandPageHead(page);
    await expect(page.getByRole('button', { name: '페이지 머리 접기' })).toBeVisible();
    await setScenario(page, '서버 오류 (error)');
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
  });

  test('경계를 끌면 위 줄만 바뀐다: 아래 줄은 px를 지키고(끄는 도중에도) 작업 영역이 같은 만큼 늘어난다', async ({ page }, testInfo) => {
    await openStack(page);
    const before = await rowPx(page);
    const total = await heightOf(root(page));
    const lower = [groupOf(page, TITLES.summary), groupOf(page, TITLES.slow)];
    const lowerBefore = await Promise.all(lower.map(heightOf));
    // Centre the boundary in the viewport first: the query bar starts expanded, so the workspace begins below the fold.
    await rowSeparators(page).first().evaluate(element => element.scrollIntoView({ block: 'center' }));
    const sample = (await rowSeparators(page).first().boundingBox())!;
    const x = sample.x + sample.width / 2;
    const y = sample.y + sample.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Every pointer step, not only the release: the rows the user did not touch never dip while the engine catches up (no 6–9 px wobble). The
    // rendered `.dv-groupview` heights are sampled, not only the separators' px: the engine's own gap between rows once moved them by 2–5 px (UX-2).
    for (let step = 1; step <= 12; step++) {
      await page.mouse.move(x, y + step * 10);
      const heights = await Promise.all(lower.map(heightOf));
      heights.forEach((height, index) => { expect(near(height, lowerBefore[index]!, 1)).toBe(true); });
    }
    await page.mouse.up();
    await expect.poll(async () => (await rowPx(page))[0]).toBeGreaterThan(before[0]! + 100);
    const after = await rowPx(page);
    expect(near(after[0]!, before[0]! + 120, 3)).toBe(true);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(near(await heightOf(root(page)), total + (after[0]! - before[0]!), 3)).toBe(true);
    // And after the release, once the engine has settled on the final shares.
    await expect.poll(async () => (await Promise.all(lower.map(heightOf))).every((height, index) => near(height, lowerBefore[index]!, 1))).toBe(true);
    await evidence(page, testInfo, 'workspace-stack-resized');

    // The minimum stops the drag upward.
    const min = await bound(page, 0, 'aria-valuemin');
    await rowSeparators(page).first().evaluate(element => element.scrollIntoView({ block: 'center' }));
    const box = (await rowSeparators(page).first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 900, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await rowPx(page))[0]).toBe(min);
  });

  test('키보드: 방향키 ±24px, Home은 최소, End는 최대이고 aria-valuenow는 px이다. 마지막 줄 아래 경계도 같다', async ({ page }) => {
    await openStack(page);
    const separators = rowSeparators(page);
    await expect(separators).toHaveCount(3);
    for (const index of [0, 2]) {
      const separator = separators.nth(index);
      await expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
      const start = (await rowPx(page))[index]!;
      await separator.focus();
      await page.keyboard.press('ArrowDown');
      await expect.poll(async () => (await rowPx(page))[index]).toBe(start + STEP);
      await page.keyboard.press('ArrowUp');
      await expect.poll(async () => (await rowPx(page))[index]).toBe(start);
      await page.keyboard.press('Home');
      await expect.poll(async () => (await rowPx(page))[index]).toBe(await bound(page, index, 'aria-valuemin'));
      await page.keyboard.press('End');
      const max = await bound(page, index, 'aria-valuemax');
      await expect.poll(async () => (await rowPx(page))[index]).toBe(max);
      // The maximum is one screen of the main area less the sticky page head, never the percent range.
      expect(max).toBeLessThanOrEqual(900);
      expect(max).toBeGreaterThan(300);
    }
  });

  test('줄이 하나뿐이어도 그 줄 아래 경계가 있고 같은 방식으로 움직인다(집중 프리셋)', async ({ page }) => {
    await openStack(page, '집중');
    await expect(rowSeparators(page)).toHaveCount(1);
    const start = (await rowPx(page))[0]!;
    await rowSeparators(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await rowPx(page))[0]).toBe(start + STEP);
  });

  test('아래 새 줄로 옮기기: 줄이 하나 늘고 작업 영역이 360px 자라며 다른 줄은 그대로다. 마지막 줄에 혼자 있으면 항목이 없다', async ({ page }) => {
    await openStack(page);
    const before = await rowPx(page);
    const total = await heightOf(root(page));
    await groupOf(page, TITLES.summary).getByRole('button', { name: `${TITLES.summary} 동작` }).click();
    await page.getByRole('menuitem', { name: '아래 새 줄로 옮기기' }).click();
    await expect(rowSeparators(page)).toHaveCount(4);
    const after = await rowPx(page);
    expect(after.slice(0, 3)).toEqual(before);
    expect(near(after[3]!, NEW_ROW, 1)).toBe(true);
    expect(near(await heightOf(root(page)), total + after[3]! + GAP, 3)).toBe(true);
    await groupOf(page, TITLES.summary).getByRole('button', { name: `${TITLES.summary} 동작` }).click();
    await expect(page.getByRole('menuitem', { name: '숨기기' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '아래 새 줄로 옮기기' })).toHaveCount(0);
  });

  test('숨기면 그 줄이 사라지고 작업 영역이 그 px만큼 줄며 다른 줄은 그대로다', async ({ page }) => {
    await openStack(page);
    const before = await rowPx(page);
    const total = await heightOf(root(page));
    await groupOf(page, TITLES.slow).getByRole('button', { name: `${TITLES.slow} 동작` }).click();
    await page.getByRole('menuitem', { name: '숨기기' }).click();
    await expect(rowSeparators(page)).toHaveCount(2);
    const after = await rowPx(page);
    expect(after).toEqual(before.slice(0, 2));
    expect(near(await heightOf(root(page)), total - before[2]! - GAP, 3)).toBe(true);
  });

  test('탭을 아래 띠에 끌어 놓으면 새 마지막 줄이 되고, 다른 곳의 탭·묶음 전체·바깥 데이터는 거절된다', async ({ page }, testInfo) => {
    await openStack(page);
    const before = await rowPx(page);
    // The 300 ms layout save has flushed: the snapshot holds the stack state, not the value before it.
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', rows: before }]);
    const storedBefore = JSON.stringify(await stored(page));
    const total = await heightOf(root(page));
    await dropStrip(page).scrollIntoViewIfNeeded();
    // Outside data and a payload that is not a panel are refused without changing anything.
    await dropStrip(page).evaluate(strip => {
      const data = new DataTransfer();
      data.setData('text/plain', 'not a panel');
      strip.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
      strip.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(400);
    expect(await rowPx(page)).toEqual(before);

    // A single tab of this workspace: a real drag.
    await dragLike(page, workspace(page).getByRole('tab', { name: TITLES.distribution }), dropStrip(page), { x: 40, y: 30 });
    await expect(rowSeparators(page)).toHaveCount(4);
    const after = await rowPx(page);
    expect(after.slice(0, 3)).toEqual(before);
    expect(near(after[3]!, NEW_ROW, 1)).toBe(true);
    expect(near(await heightOf(root(page)), total + after[3]! + GAP, 3)).toBe(true);
    await expect(workspace(page).getByRole('separator', { name: `${TITLES.distribution} 아래 높이` })).toBeVisible();
    await expect.poll(async () => JSON.stringify(await stored(page))).not.toBe(storedBefore);
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', rows: after }]);
    await evidence(page, testInfo, 'workspace-stack-drop-below');
  });

  test('엔진 끌기로 탭을 첫 줄 위쪽 가장자리에 놓으면 새 첫 줄이 360이고 나머지 줄은 px를 지킨다', async ({ page }) => {
    await openStack(page);
    await page.locator('#platform-main').evaluate(element => { element.scrollTo(0, 0); });
    const before = await rowPx(page);
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', rows: before }]);
    // `세로`: rows [추세], [요약 | 분포], [느린 실행]. 요약 leaves a shared row, so that row stays (분포 alone) and keeps its px.
    const source = groupOf(page, TITLES.summary);
    await expect(source.getByRole('tab')).toHaveCount(1);
    const expected = [NEW_ROW, ...before];
    const first = groupOf(page, TITLES.trend);
    // The top edge of the first group's content area, just under its 40px tab strip.
    await dragLike(page, source.getByRole('tab'), first, { x: (await first.boundingBox())!.width / 2, y: 52 });
    await expect(rowSeparators(page)).toHaveCount(expected.length);
    const after = await rowPx(page);
    expect(after.length).toBe(expected.length);
    after.forEach((px, index) => { expect(near(px, expected[index]!, 1)).toBe(true); });
    await expect.poll(async () => (await stored(page))[0]?.rows).toEqual(after);
  });

  test('묶음 전체를 끌어 띠에 놓아도 거절된다(여러 탭 묶음의 빈 머리 영역)', async ({ page }) => {
    await openStack(page, '기본');
    const group = groupOf(page, TITLES.distribution);
    await expect(group.getByRole('tab')).toHaveCount(2);
    const rows = await rowPx(page);
    // Let the 300 ms layout save flush first, so the snapshot holds the stack state rather than the value before it.
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', rows }]);
    const snapshot = JSON.stringify(await stored(page));
    await dragLike(page, group.locator('.dv-void-container'), dropStrip(page), { x: 40, y: 30 });
    // Pacing, not a save: a refused drop changes nothing, so there is no state to poll for; give a wrongly accepted one time to show.
    await page.waitForTimeout(600);
    expect(await rowPx(page)).toEqual(rows);
    await expect(group.getByRole('tab')).toHaveCount(2);
    expect(JSON.stringify(await stored(page))).toBe(snapshot);
  });

  test('저장: 새로고침 뒤에도 모드와 줄 높이가 같고, 기본 배치는 몇 번을 눌러도 높이가 쌓이지 않으며, 모드를 오가도 조회·마운트가 늘지 않는다', async ({ page }) => {
    await openStack(page);
    await rowSeparators(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const resized = await rowPx(page);
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', preset: 'column', rows: resized }]);
    await page.reload();
    await ready(page);
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
    await expect(modeRadio(page, '아래로 쌓기')).toBeChecked();
    expect(await rowPx(page)).toEqual(resized);

    const requests = await cycleRequests(page);
    await page.getByRole('button', { name: '기본 배치', exact: true }).click();
    await expect.poll(async () => (await rowPx(page)).join()).not.toBe(resized.join());
    const reset = await rowPx(page);
    await page.getByRole('button', { name: '기본 배치', exact: true }).click();
    await page.getByRole('button', { name: '기본 배치', exact: true }).click();
    await page.waitForTimeout(300);
    expect(await rowPx(page)).toEqual(reset);

    await modeRadio(page, '화면 맞춤').click();
    await modeRadio(page, '아래로 쌓기').click();
    await modeRadio(page, '화면 맞춤').click();
    await modeRadio(page, '아래로 쌓기').click();
    await page.waitForTimeout(300);
    const roundTrip = await rowPx(page);
    roundTrip.forEach((px, index) => { expect(near(px, reset[index]!, 3)).toBe(true); });
    await page.waitForTimeout(500);
    expect(await cycleRequests(page)).toBe(requests);
    await page.getByRole('radio', { name: '집중', exact: true }).click();
    await expect(rowSeparators(page)).toHaveCount(1);
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', preset: 'focus' }]);
  });

  test('좁은 폭에서는 쌓기가 꺼지고(모드 라디오는 이유와 함께 비활성) 저장값은 그대로이며, 넓히면 돌아온다', async ({ page }) => {
    await openStack(page);
    const rows = await rowPx(page);
    await expect.poll(() => stored(page)).toMatchObject([{ mode: 'stack', rows }]);
    const snapshot = JSON.stringify(await stored(page));
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'fit');
    await expect(rowSeparators(page)).toHaveCount(0);
    await expect(modeRadio(page, '아래로 쌓기')).toBeDisabled();
    await expect(page.getByRole('radiogroup', { name: '높이 방식' })).toHaveAccessibleDescription('좁은 폭에서는 화면 맞춤으로 보입니다');
    // Pacing, not a save: the narrow display must write nothing, so there is no state to poll for.
    await page.waitForTimeout(600);
    expect(JSON.stringify(await stored(page))).toBe(snapshot);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
    expect(await rowPx(page)).toEqual(rows);
  });

  test('보드 칸 안: 칸 본문이 스크롤되고 보드 바깥 배치와 경계(퍼센트)는 그대로이며, 안쪽 끌기는 보드를 바꾸지 않는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await signInAs(page, 'engineer');
    await page.addInitScript(({ value }) => {
      localStorage.setItem('platform:board-layout-engine', 'dock');
      localStorage.setItem('platform:page-filter-collapsed:cycle-time', 'true');
      const seeded = 'platform:board-fixture-seeded:engineer';
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { value: { v: 1, activeSheetId: 'ws', sheets: [{ id: 'ws', name: '작업 영역', layout: '2x1', selected: 0, panes: [
      { menuId: 'cycle-time', params: {}, query: `?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}` },
      { menuId: 'productivity-overview', params: {}, query: `?v=1&scopeId=MEM&roomNames=ETCH&${PERIOD}` },
    ] }] } });
    await page.goto('/board?sheet=ws');
    await ready(page, { inPane: true });
    // The V1 key is only the seeded fixture; the board the running app writes is the V2 key (boardStore.ts).
    // The board the app reads: V2 once anything was saved, else the V1 seed (`boardStore.ts`). A changed board is written to V2.
    const boardKey = () => page.evaluate(() => localStorage.getItem('platform:board:v2:engineer') ?? localStorage.getItem('platform:board:engineer'));
    const boardTabLabels = () => page.locator('[role="tab"][data-tab-panel-id][aria-label^="칸 "]').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('aria-label')));
    // The board's own separators: those outside the workspace (the workspace's are row separators and its nested percent ones).
    const outerSeparators = () => page.locator('[data-dock-separator]').evaluateAll(items => items.filter(item => !item.closest('[data-panel-workspace]'))
      .map(item => [item.getAttribute('aria-orientation'), item.getAttribute('aria-valuenow'), item.getAttribute('aria-valuemax')]));
    const outerBefore = await outerSeparators();
    expect(outerBefore.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: '칸 1 동작' }).click();
    await page.getByRole('menuitemradio', { name: '세로' }).click();
    await page.getByRole('button', { name: '칸 1 동작' }).click();
    await page.getByRole('menuitemradio', { name: '아래로 쌓기' }).click();
    await expect(root(page)).toHaveAttribute('data-workspace-mode', 'stack');
    await expect(rowSeparators(page)).toHaveCount(3);
    const paneBody = page.locator('[data-pane-body]').first();
    expect(await paneBody.evaluate(element => element.scrollHeight > element.clientHeight + 1)).toBe(true);
    expect(await mainScrolls(page)).toBe(false);
    const labels = await boardTabLabels();
    await expect.poll(boardKey).not.toBeNull();
    const board = await boardKey();
    // A pane body is shorter than a row minimum, so a row may be pinned (06 §12.8: the minimum wins); press a key on the first separator
    // that still has a range, or on the first one when none does.
    const ranges = await rowSeparators(page).evaluateAll(items => items.map(item => Number(item.getAttribute('aria-valuemax')) - Number(item.getAttribute('aria-valuemin'))));
    const movable = Math.max(0, ranges.findIndex(range => range > 0));
    await rowSeparators(page).nth(movable).focus();
    await page.keyboard.press(ranges[movable]! > 0 ? 'ArrowUp' : 'ArrowDown');
    await expect.poll(async () => (await stored(page))[0]?.rows).toEqual(await rowPx(page));
    expect(await boardTabLabels()).toEqual(labels);
    expect(await boardKey()).toBe(board);
    // The board's own boundaries keep their percent contract: same values, never a px range.
    expect(await outerSeparators()).toEqual(outerBefore);
    outerBefore.forEach(([, , max]) => { expect(Number(max)).toBeLessThanOrEqual(100); });
    await evidence(page, testInfo, 'board-pane-stack');

    // A board tab dropped on the workspace's strip is refused, and the strip consumes the drag: the board's own dock never sees the drop, so
    // neither layout changes.
    // Pressing a board tab selects its pane, and the board saves the selection (V2). Select it first, so the snapshot already holds what the
    // drag's own press writes and only a layout change can differ.
    const boardTab = page.locator('[role="tab"][data-tab-panel-id][aria-label^="칸 2 · "]');
    await boardTab.click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('platform:board:v2:engineer') ?? 'null')?.sheets?.[0]?.selectedPaneId ?? null))
      .toBe(await page.evaluate(() => JSON.parse(localStorage.getItem('platform:board:v2:engineer') ?? 'null')?.sheets?.[0]?.panes?.[1]?.id ?? 'unsaved'));
    const rowsOnStrip = await rowPx(page);
    const storedOnStrip = JSON.stringify(await stored(page));
    const boardOnStrip = await boardKey();
    const outerOnStrip = await outerSeparators();
    await dragLike(page, boardTab, dropStrip(page), { x: 40, y: 30 });
    // Pacing, not a save: a refused drop changes nothing, so there is no state to poll for; give a wrongly accepted one time to show.
    await page.waitForTimeout(600);
    await expect(workspace(page).locator('[role="tab"][data-tab-panel-id][aria-label^="칸 "]')).toHaveCount(0);
    expect(await rowPx(page)).toEqual(rowsOnStrip);
    expect(JSON.stringify(await stored(page))).toBe(storedOnStrip);
    expect(await boardTabLabels()).toEqual(labels);
    expect(await boardKey()).toBe(boardOnStrip);
    expect(await outerSeparators()).toEqual(outerOnStrip);
  });
});


test.describe('fill 페이지의 표 높이 (06 §12.8, #690k)', () => {
  test('1440×900 HW Time 표의 행 영역이 fill 슬롯 아래 끝에서 120px 안까지 닿는다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/hw-time/table?v=1&scopeId=MEM&drillModule=PM1');
    const rows = page.getByLabel('스크롤 가능한 행 영역');
    await expect(rows).toBeVisible();
    await expect(rows.getByRole('row').nth(2)).toBeVisible();
    const slot = page.locator('[data-platform-page-fill]');
    // The cap follows layout (observers), so poll until it has grown past the unmeasured fallback.
    await expect.poll(async () => {
      const rowsBox = (await rows.boundingBox())!;
      const slotBox = (await slot.boundingBox())!;
      return slotBox.y + slotBox.height - (rowsBox.y + rowsBox.height);
    }).toBeLessThanOrEqual(120);
    // Filling must not overshoot: the main scroll area does not overflow (a 1px cap error shows a scrollbar).
    await expect.poll(() => page.locator('main').evaluate(main => main.scrollHeight - main.clientHeight)).toBeLessThanOrEqual(0);
    await evidence(page, testInfo, 'hw-time-table-fill');
  });
});

test.describe('분석 보드 최소화·복원 (#893 893c)', () => {
  const screenOf = (roomNames: string) => ({ menuId: 'productivity-overview', params: {}, query: `?v=1&scopeId=MEM&${PERIOD}&roomNames=${roomNames}` });
  async function openSeededBoard(page: Page) {
    await signInAs(page, 'engineer');
    await page.addInitScript(({ value }) => {
      const seeded = 'platform:board-fixture-seeded:engineer';
      localStorage.setItem('platform:board-layout-engine', 'dock');
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { value: { v: 1, activeSheetId: 'dock', sheets: [{ id: 'dock', name: '도킹', layout: '1x2', selected: 0, panes: [screenOf('PHOTO'), screenOf('ETCH')] }] } });
    await page.goto('/board?sheet=dock');
    const tabs = page.locator('[data-dock-layout] [role="tab"][data-tab-panel-id]');
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('[data-dock-layout] [data-pane-body]').first()).toBeVisible();
  }
  const chip = (page: Page) => page.getByRole('button', { name: '분석 보드 · 도킹' });
  const marks = (page: Page) => page.locator('[data-dock-probe="same"]');
  const markPanes = (page: Page) => page.locator('[data-pane-id]').evaluateAll(panes => panes.forEach(pane => { (pane as HTMLElement).dataset.dockProbe = 'same'; }));

  test('최대화한 보드에서 일반 메뉴를 고르면 자동으로 최소화되고, 칩 한 번으로 같은 인스턴스·같은 내부 최대화로 돌아온다', async ({ page }) => {
    await openSeededBoard(page);
    await markPanes(page);
    await page.getByRole('button', { name: '칸 1 최대화' }).click();
    await expect(page.getByRole('button', { name: '원래 크기로' })).toBeVisible();
    // No prior minimize or close: choosing a regular menu is enough.
    await chooseSystem(page, 'MARS');
    await expect(page).not.toHaveURL(/\/board/);
    await expect(chip(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '분석 보드(최소화됨, 눌러 복원)' })).toBeVisible();
    await chip(page).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The same board instance: the marked pane roots survived, the inner maximize survived, nothing was picked again.
    await expect(marks(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: '원래 크기로' })).toBeVisible();
    await expect(chip(page)).toHaveCount(0);
  });

  test('반복 왕복은 history 항목을 늘리지 않고, 명시적 최소화는 칩으로, 자동 최소화는 목적지로 포커스를 준다', async ({ page }) => {
    await openSeededBoard(page);
    const length = () => page.evaluate(() => history.length);
    const before = await length();
    // Explicit minimize: focus goes to the chip.
    await page.getByRole('button', { name: '최소화' }).click();
    await expect(chip(page)).toBeFocused();
    expect(await length()).toBe(before);
    for (let round = 0; round < 3; round++) {
      await chip(page).click();
      await expect(page).toHaveURL(/\/board\?sheet=dock/);
      await page.getByRole('button', { name: '최소화' }).click();
      await expect(chip(page)).toBeVisible();
    }
    expect(await length()).toBe(before);
    // Automatic minimize: the destination's arrival focus wins; the chip does not take it.
    await chip(page).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
    await chooseSystem(page, 'MARS');
    await expect(chip(page)).toBeVisible();
    await expect(chip(page)).not.toBeFocused();
    await expect(mainHeading(page)).toBeFocused();
  });

  test('숨은 보드는 지연 로드되는 일반 화면(홈)으로 이동해도 차트가 다시 만들어지지 않는다 (같은 Suspense 경계로 숨겨지지 않음)', async ({ page }) => {
    await openSeededBoard(page);
    await expect(page.locator('canvas').first()).toBeVisible();
    await markPanes(page);
    await page.locator('canvas').evaluateAll(canvases => canvases.forEach(canvas => { (canvas as HTMLElement).dataset.dockProbe = 'canvas'; }));
    const canvases = await page.locator('canvas[data-dock-probe="canvas"]').count();
    expect(canvases).toBeGreaterThan(0);
    const popover = await openSwitcher(page);
    await popover.getByRole('link', { name: '홈' }).click();
    await expect(page).not.toHaveURL(/\/board/);
    await expect(chip(page)).toBeVisible();
    await chip(page).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
    await expect(marks(page)).toHaveCount(2);
    await expect(page.locator('canvas[data-dock-probe="canvas"]')).toHaveCount(canvases);
  });

  test('보드 머리 버튼은 600·1280·1440 폭에서 서로 겹치지 않고, 좁으면 글자 없이 아이콘만 남는다', async ({ page }) => {
    await openSeededBoard(page);
    const names = ['이 브라우저에만 저장', '칸 추가', '기본 배치', '최소화', '보드 닫기'];
    for (const width of [1440, 1280, 600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(500);
      const boxes = [];
      for (const name of names) {
        const button = page.getByRole('main').getByRole('button', { name, exact: true }).first();
        await expect(button).toBeVisible();
        boxes.push({ name, box: (await button.boundingBox())! });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].box; const b = boxes[j].box;
        const overlap = a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
        expect(overlap, `${boxes[i].name} overlaps ${boxes[j].name} at ${width}px`).toBe(false);
      }
      for (const { name, box } of boxes) {
        expect(box.width, `${name} width at ${width}px`).toBeGreaterThanOrEqual(24);
        expect(box.height, `${name} height at ${width}px`).toBeGreaterThanOrEqual(24);
      }
    }
  });

  test('상세가 열린 일반 화면에서 보드를 열고 칸 상세를 둔 채 최소화해도 복귀 주소가 그 상세를 다시 열어 교체하지 않는다 (#893 893c2)', async ({ page }) => {
    await signInAs(page, 'engineer');
    const equipment = (focus: string) => ({ menuId: 'equipment-master', params: {}, query: `?v=1&scopeId=MEM&${PERIOD}&focus=${focus}` });
    await page.addInitScript(({ value }) => {
      const seeded = 'platform:board-fixture-seeded:engineer';
      localStorage.setItem('platform:board-layout-engine', 'dock');
      if (sessionStorage.getItem(seeded)) return;
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
      sessionStorage.setItem(seeded, '1');
    }, { value: { v: 1, activeSheetId: 'dock', sheets: [{ id: 'dock', name: '도킹', layout: '1x1', selected: 0, panes: [equipment('MEM-PHOTO-0103')] }] } });
    const slot = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await page.goto('/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0104');
    await expect(slot).toBeVisible();
    await expect(slot).toContainText('MEM-PHOTO-0104');
    await page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '분석 보드' }).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
    await expect(slot).toContainText('MEM-PHOTO-0103');
    await page.getByRole('button', { name: '최소화' }).click();
    // The address we return to opens no detail of its own: the board's detail is paused, not replaced, and the focus is on the chip.
    await expect(page).not.toHaveURL(/focus=/);
    await expect(chip(page)).toBeFocused();
    await expect(slot).toHaveCount(0);
    await chip(page).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
    await expect(slot).toContainText('MEM-PHOTO-0103');
  });

  test('닫기는 live 보드만 끝내고 저장된 시트는 남기며 /board에 남아 다시 열리지 않는다', async ({ page }) => {
    await openSeededBoard(page);
    await page.getByRole('button', { name: '보드 닫기' }).click();
    await expect(page).not.toHaveURL(/\/board/);
    await expect(chip(page)).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('platform:board:v2:engineer') ?? localStorage.getItem('platform:board:engineer') ?? 'null')?.sheets?.length)).toBe(1);
    await page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '분석 보드' }).click();
    await expect(page).toHaveURL(/\/board\?sheet=dock/);
  });
});
