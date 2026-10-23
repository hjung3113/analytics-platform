import { expect, test, type Locator, type Page } from '@playwright/test';
import { contextBar, evidence, expandPageHead, expectScopeValid, firstRowByColumn, lotColumn, mainHeading, query, rowMapsByColumn, setScenario, showSlowExecutions, signInAs, storedUsageEvents, switchScope, tableStatusLine, usageVisits } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
const PERIOD = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const PRODUCTIVITY = `/analytics/productivity?v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`;
const ORIGIN = 'https://feedbackops.example';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The four space links, each scoped to exactly one Managed System uuid, opening in a new tab without opener access. */
async function managedSystemOf(page: Page, space: string) {
  const block = page.getByRole('navigation', { name: `FeedbackOps · ${space}` });
  await expect(block).toBeVisible();
  const links = block.getByRole('link');
  await expect(links).toHaveCount(4);
  const found = new Set<string>();
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
    const url = new URL((await link.getAttribute('href'))!);
    expect(url.origin).toBe(ORIGIN);
    const values = url.searchParams.getAll('managedSystem');
    expect(values).toHaveLength(1);
    expect(values[0]).toMatch(UUID);
    expect(values[0]).not.toBe('all');
    // FeedbackOps links back to the page the link was drawn on (FO ADR-0071, #448).
    expect(url.searchParams.getAll('platformReturn')).toEqual([page.url()]);
    found.add(values[0]);
  }
  expect(found.size).toBe(1);
  return [...found][0];
}

/** `FeedbackOps 전체` lives in the user menu (ADR-0070): opens `사용자 메뉴` and returns the menu item. */
async function feedbackOpsOverallLink(page: Page) {
  await page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '사용자 메뉴' }).click();
  return page.getByRole('menuitem', { name: 'FeedbackOps 전체 — 새 탭' });
}

function expectExactQueryKeys(url: URL, keys: string[]) {
  expect([...url.searchParams.keys()].sort()).toEqual([...keys].sort());
}

async function linkUrl(link: Locator) {
  const href = await link.getAttribute('href');
  expect(href).not.toBeNull();
  return new URL(href!);
}

async function expectMyVocLinks(page: Page, expectedReturn: string) {
  const createUrl = await linkUrl(page.getByRole('link', { name: 'VOC 등록' }));
  expectExactQueryKeys(createUrl, ['action', 'platformReturn']);
  expect(createUrl.searchParams.get('action')).toBe('create');
  expect(createUrl.searchParams.getAll('platformReturn')).toEqual([expectedReturn]);

  const firstRowUrl = await linkUrl(page.getByLabel('스크롤 가능한 행 영역', { exact: true })
    .getByRole('link', { name: /FeedbackOps에서 보기$/ }).first());
  expectExactQueryKeys(firstRowUrl, ['view', 'selected', 'platformReturn']);
  expect(firstRowUrl.searchParams.get('view')).toBe('inbox');
  expect(firstRowUrl.searchParams.get('selected')).toMatch(UUID);
  expect(firstRowUrl.searchParams.getAll('platformReturn')).toEqual([expectedReturn]);
  return firstRowUrl;
}

/** Rail section buttons of the current system (15 §3.2). `exact` keeps '생산성 분석' apart from the switcher's '… 현재: MARS'. */
function railSection(page: Page, name: string) {
  return page.getByRole('navigation', { name: '앱 레일' }).getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name, exact: true });
}
function systemSwitcher(page: Page) {
  return page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ });
}
/** Opens the switcher and returns its popover. */
async function openSwitcher(page: Page) {
  await systemSwitcher(page).click();
  const popover = page.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
  await expect(popover).toBeVisible();
  return popover;
}
/** Picks a system card in the switcher; the popover closes first and the Kernel moves. */
async function chooseSystem(page: Page, name: string) {
  const popover = await openSwitcher(page);
  await popover.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(popover).toHaveCount(0);
}

async function chooseFilterOption(page: Page, field: string, option: string) {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
// Wait for the period anchor before deciding whether a control is inline or portaled.
async function contextEditor(page: Page, name: string) {
  const bar = contextBar(page);
  await expect(bar).toBeVisible();
  if (await bar.getAttribute('data-query-bar') !== null) {
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    return { locator: bar.getByRole('button', { name }), close: async () => {} };
  }
  await expect(bar.getByRole('button', { name: /^기간:/ })).toBeVisible();
  const inline = bar.getByRole('button', { name });
  if (await inline.isVisible()) return { locator: inline, close: async () => {} };
  const overflow = page.getByRole('dialog', { name: '추가 Context 조건' });
  await bar.getByRole('button', { name: /^조건 \d+개 더/ }).click();
  await expect(overflow).toBeVisible();
  return { locator: overflow.getByRole('button', { name }), close: async () => {
    if (await overflow.isVisible()) await page.keyboard.press('Escape');
  } };
}
/** Secondary page actions live in the header ⋯ menu at every width (#303, ADR-0035). */
async function headerMore(page: Page) {
  const header = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await header.getByRole('button', { name: '더보기', exact: true }).click();
  const menu = page.getByRole('group', { name: '기타 페이지 동작' });
  await expect(menu).toBeVisible();
  return menu;
}
async function periodPreset(page: Page, name: string) {
  const bar = contextBar(page);
  await expect(bar).toBeVisible();
  if (await bar.getAttribute('data-query-bar') !== null) {
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    return { locator: bar.getByRole('button', { name: name === '1일' ? '최근 24시간' : name === '7일' ? '최근 7일' : name, exact: true }), close: async () => {
      await bar.getByRole('button', { name: '적용', exact: true }).click();
    } };
  }
  const trigger = bar.getByRole('button', { name: /^기간:/ });
  await expect(trigger).toBeVisible();
  const inline = bar.getByRole('radio', { name, exact: true });
  if (await inline.isVisible()) return { locator: inline, close: async () => {} };
  await trigger.click();
  const locator = page.getByRole('radio', { name, exact: true });
  await expect(locator).toBeVisible();
  return { locator, close: async () => {
    if (await trigger.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
  } };
}
async function expectContextBounds(page: Page) {
  const bar = contextBar(page);
  await expect(bar.getByRole('button', { name: /^기간:/ })).toBeVisible();
  const row = await bar.boundingBox();
  expect(row).not.toBeNull();
  // Actual buttons/radios must occupy the 48px baseline, independent of the container's fixed height.
  for (const control of await bar.getByRole('button').or(bar.getByRole('radio')).all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(row!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(row!.y + 48);
    expect(box!.x).toBeGreaterThanOrEqual(row!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(row!.x + row!.width);
  }
}
async function overflowCount(page: Page) {
  const trigger = contextBar(page).getByRole('button', { name: /^조건 \d+개 더/ });
  return await trigger.count() ? Number((await trigger.innerText()).match(/^조건 (\d+)개 더/)![1]) : 0;
}
function visibleContextLabel(page: Page) {
  // The inert measuring layer duplicates this text, so select only the visible bar label.
  return contextBar(page).getByText('전역 Context', { exact: true }).filter({ visible: true });
}

test.describe('토큰 소비 계약 (06 §23, ADR-0011/ADR-0058)', () => {
  test('FeedbackOps base 값이 theme보다 우선하고 플랫폼 control 경계는 label 대비를 유지한다', async ({ page }, testInfo) => {
    await page.goto('/metrics?v=1&scopeId=MEM');
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    const search = page.getByTestId('metric-search');
    await expect(search).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('font-size', '14px');
    await expect(page.locator('body')).toHaveCSS('font-family', /Pretendard Variable/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 247, 254)');
    // Confirmed B uses the shared Input/Select primitive radius and Select typography.
    await expect(search).toHaveCSS('border-radius', '6px');
    // Shared Select primitive default (FeedbackOps SelectTrigger) is 13px.
    await expect(page.getByTestId('metric-status-filter')).toHaveCSS('font-size', '13px');
    await expect(search).toHaveCSS('border-top-color', 'rgb(102, 112, 131)');
    await evidence(page, testInfo, 'feedbackops-token-cascade');
  });
});

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
    const originalPeriodChip = '기간 2026-09-25 09:00 ~ 2026-09-26 09:00';
    const originalPeriod = boardContext(page, 1).getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00' });
    await expect(originalPeriod).toBeVisible();

    await boardPane(page, 2).getByRole('button', { name: '칸 2 선택' }).click();
    await boardPeriodPreset(page, 2, '7일');
    await expect(boardContext(page, 2).getByRole('button', { name: '기간: 2026-09-19T09:00:00 – 2026-09-26T09:00:00' })).toBeVisible();
    await expect(boardPaneHead(page, 2).locator('[data-pane-chip="time"]')).toHaveText('기간 2026-09-19 09:00 ~ 2026-09-26 09:00');
    await expect(firstHead.locator('[data-pane-chip="time"]')).toHaveText(originalPeriodChip);
    await expect(firstRoomChip).toBeVisible();

    await first.getByRole('button', { name: '칸 1 선택' }).click();
    await expect(boardContext(page, 1).getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00' })).toBeVisible();
    await page.goBack();
    await expect.poll(() => page.url()).toBe(originalMainUrl);
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
    expect(query(page).get('roomNames')).toBe('PHOTO');
    await evidence(page, testInfo, 'board-independent-pane-context');
  });

  test('일괄 적용: 모든 칸이 같은 조건이 되고 실행 취소가 차이 칩을 복원한다', async ({ page }, testInfo) => {
    const paneQuery = `v=1&scopeId=MEM&${PERIOD}`;
    const sourcePeriod = '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00';
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
    const changedPeriod = '[2026-09-25T09:00:00, 2026-09-26T09:00:00)';
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
    await expect(page.getByText('칸 2을 비웠습니다')).toBeVisible();
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
    await page.keyboard.press('Tab');
    await expect.poll(inHead).toBe(true);
    for (let step = 0; step < 6 && await inHead(); step++) await page.keyboard.press('Tab');
    await expect.poll(paneOfFocus).toBe('0');
    for (let step = 0; step < 6 && !(await inHead()); step++) await page.keyboard.press('Shift+Tab');
    for (let step = 0; step < 6 && await inHead(); step++) await page.keyboard.press('Shift+Tab');
    await expect(paneTab(page, 1)).toBeFocused();
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
});

test.describe('관리 레이아웃 필터 레일 (06 §12.6, ADR-0022)', () => {
  test('1440 설비 마스터는 접기 기억과 펼치기 포커스를 제공한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/equipment?v=1&scopeId=MEM');
    const rail = page.getByRole('region', { name: '필터', exact: true });
    const tableCard = page.getByRole('region', { name: '설비 마스터 목록' });
    await expect(rail.getByRole('heading', { name: '필터', exact: true })).toBeVisible();
    const collapse = rail.getByRole('button', { name: '필터 접기' });
    await expect(collapse).toBeVisible();
    await evidence(page, testInfo, 'management-rail-expanded');
    await collapse.click();
    await expect(rail).toHaveCount(0);
    const expand = tableCard.getByRole('button', { name: '필터', exact: true });
    await expect(expand).toBeVisible();
    await expect(expand).toBeFocused();
    await evidence(page, testInfo, 'management-rail-collapsed');
    await page.reload();
    await expect(expand).toBeVisible();
    await expect(rail).toHaveCount(0);
    await evidence(page, testInfo, 'management-rail-collapsed-reloaded');
    await expand.click();
    await expect(collapse).toBeVisible();
    await expect(collapse).toBeFocused();
  });

  test('1280 상세 슬롯은 자기 폭에 맞춰 필터 팝오버로 전환하고 URL 필터를 편집한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103');
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('region', { name: '필터', exact: true })).toHaveCount(0);
    const button = page.getByRole('region', { name: '설비 마스터 목록' }).getByRole('button', { name: /^필터(?: · \d+)?$/ });
    await expect(button).toBeVisible();
    await button.click();
    const popover = page.getByRole('dialog', { name: '필터', exact: true });
    await expect(popover).toBeVisible();
    await popover.getByRole('combobox', { name: '상태', exact: true }).click();
    await page.getByRole('option', { name: '정비', exact: true }).click();
    // ADR-0037: a management filter is a draft until 적용; the trigger shows the pending change meanwhile.
    await expect(popover.getByRole('button', { name: '적용 (1)', exact: true })).toBeEnabled();
    expect(query(page).has('status')).toBe(false);
    await expect(button).toHaveAccessibleName('필터');
    await expect(button).toContainText('미적용 1');
    await popover.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('status')).toBe('maintenance');
    await expect(button).toHaveText('필터 · 1');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await evidence(page, testInfo, 'management-detail-filter-popover');
  });

  test('1440 관리자 감사 레일은 일곱 필드와 초안 적용을 제공한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/audit?v=1');
    const rail = page.getByRole('region', { name: '필터', exact: true });
    await expect(rail.getByRole('button', { name: '필터 접기' })).toBeVisible();
    await expect(rail.getByRole('combobox')).toHaveCount(3);
    await expect(rail.getByRole('textbox')).toHaveCount(4);
    // #305: viewer-local time fields, no contract words in the labels.
    await expect(rail.getByRole('textbox', { name: '시각 이후' })).toBeVisible();
    await expect(rail.getByRole('textbox', { name: '시각 미만' })).toBeVisible();
    await expect(rail).not.toContainText('ISO');
    await expect(rail.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    await rail.getByRole('textbox', { name: '행위자 정확 일치' }).fill('kim');
    await expect(rail.getByRole('button', { name: '적용 (1)', exact: true })).toBeEnabled();
    await expect(rail).toContainText('미적용 변경 1개');
    expect(query(page).has('actor')).toBe(false);
    await evidence(page, testInfo, 'management-audit-seven-filters');
  });
});

test.describe('PageFilterBar page-key 계약 (#54)', () => {
  test('설비 q/status/maker는 동일한 page key를 쓰고 page와 전체 필터를 초기화한다', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM&page=2');
    // ADR-0037: drafts until 적용 (Enter in the search field submits), then one navigation that drops page.
    await expect(page.getByRole('button', { name: '필터 초기화' })).toHaveCount(0);
    const search = page.getByRole('searchbox', { name: '설비 ID 검색' });
    await search.fill('PHOTO');
    expect(query(page).has('q')).toBe(false);
    expect(query(page).get('page')).toBe('2');
    await search.press('Enter');
    await expect.poll(() => query(page).get('q')).toBe('PHOTO');
    await expect.poll(() => query(page).has('page')).toBe(false);
    await expect(search).toBeFocused();

    await page.goto('/equipment?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '상태', '정비');
    expect(query(page).has('status')).toBe(false);
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('status')).toBe('maintenance');
    await expect.poll(() => query(page).has('page')).toBe(false);
    await chooseFilterOption(page, '상태', '전체');
    expect(query(page).get('status')).toBe('maintenance');
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).has('status')).toBe(false);

    await page.goto('/equipment?v=1&scopeId=MEM&maker=ZZZ&page=2');
    const maker = page.getByRole('combobox', { name: 'Maker' });
    await expect(maker).toHaveText('ZZZ');
    await chooseFilterOption(page, 'Maker', 'TEL');
    expect(query(page).get('maker')).toBe('ZZZ');
    await page.getByRole('button', { name: '적용 (1)', exact: true }).click();
    await expect.poll(() => query(page).get('maker')).toBe('TEL');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/equipment?v=1&scopeId=MEM&q=PHOTO&status=maintenance&maker=ZZZ&page=2');
    await page.getByRole('button', { name: '필터 초기화' }).click();
    await expect.poll(() => query(page).has('q')).toBe(false);
    expect(query(page).has('status')).toBe(false);
    expect(query(page).has('maker')).toBe(false);
    expect(query(page).has('page')).toBe(false);
    await evidence(page, testInfo, 'equipment-filter-page-keys');
  });

  test('지표 q/status/domain은 동일한 page key를 쓰고 unknown domain을 표시하며 전체 필터를 초기화한다', async ({ page }, testInfo) => {
    await page.goto('/metrics?v=1&scopeId=MEM&page=2');
    const search = page.getByRole('searchbox', { name: '이름 또는 지표 ID' });
    await page.locator('label').filter({ hasText: '이름 또는 지표 ID' }).click();
    await expect(search).toBeFocused();
    const status = page.getByRole('combobox', { name: '상태' });
    await page.locator('label').filter({ hasText: '상태' }).click();
    await expect(status).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: '게시', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await search.fill('yield');
    await expect.poll(() => query(page).get('q')).toBe('yield');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/metrics?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '상태', '게시');
    await expect.poll(() => query(page).get('status')).toBe('published');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/metrics?v=1&scopeId=MEM&page=2');
    await chooseFilterOption(page, '도메인', '품질');
    await expect.poll(() => query(page).get('domain')).toBe('quality');
    await expect.poll(() => query(page).has('page')).toBe(false);

    await page.goto('/metrics?v=1&scopeId=MEM&domain=bogus');
    // #304 FIX1: the alert keeps the field's user name and the raw value as entered — never `key=value`.
    await expect(page.getByRole('alert')).toContainText('도메인');
    await expect(page.getByRole('alert')).toContainText('bogus');
    await expect(page.getByRole('alert')).not.toContainText('domain=');
    await expect(page.getByRole('combobox', { name: '도메인' })).toHaveText('bogus');

    await page.goto('/metrics?v=1&scopeId=MEM&q=yield&status=draft&domain=quality&page=2');
    await page.getByRole('button', { name: '필터 초기화' }).click();
    await expect.poll(() => query(page).has('q')).toBe(false);
    expect(query(page).has('status')).toBe(false);
    expect(query(page).has('domain')).toBe(false);
    expect(query(page).has('page')).toBe(false);
    await evidence(page, testInfo, 'metrics-filter-page-keys');
  });
});

// 접힘 요약 시각 계약(06 §13, DESIGN.md Filter bar): 접어도 조건을 잘라내지 않는다. ADR-0029.
test.describe('PageFilterBar 접힘 요약 (ADR-0029)', () => {
  test('접힌 요약은 조건을 자르지 않고 항목 단위로 왼쪽 정렬 줄바꿈하며 Enter로 펼친다', async ({ page }, testInfo) => {
    const longRaw = 'x'.repeat(60);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}&percentile=${longRaw}&sort=equipmentId:asc`);
    await expandPageHead(page);
    const bar = page.getByTestId('page-filter-bar');
    await expect(bar).toBeVisible();
    // 등록되지 않은 percentile은 페이지 키 오류이지만 필터 바는 원문을 요약에 그대로 남긴다.
    // #304 FIX1: the alert keeps the field's user name and the full raw value — untruncation is ADR-0029's point.
    await expect(page.getByRole('alert')).toContainText('느린 실행');
    await expect(page.getByRole('alert')).toContainText(longRaw);
    await expect(page.getByRole('alert')).not.toContainText('percentile=');

    // 1024×900 기본값은 사이드바가 접힌다(AppShell innerWidth < 1440). 접근 가능한 토글로 펼친 것을 확인한 뒤 필터를 접는다.
    const sidebarExpand = page.getByRole('button', { name: '사이드바 펼치기' });
    await expect(sidebarExpand).toBeVisible();
    await sidebarExpand.click();
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();

    const collapse = bar.getByRole('button', { name: '페이지 필터 접기' });
    await collapse.click();
    const expand = bar.getByRole('button', { name: '페이지 필터 펼치기' });
    await expect(expand).toBeFocused();
    await evidence(page, testInfo, 'page-filter-collapsed-summary');

    type Rect = { left: number; top: number; right: number; bottom: number };
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate((raw: string) => {
      const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === '페이지 필터 펼치기');
      const summaryId = button?.getAttribute('aria-describedby');
      const summary = summaryId ? document.getElementById(summaryId) : null;
      if (!button || !summary) throw new Error('접힘 요약 버튼이나 요약 span을 찾지 못했다');
      const box = button.getBoundingClientRect();
      const rectsOf = (node: Node): Rect[] => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()]
          .filter(r => r.width > 0 && r.height > 0)
          .map(r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
      };
      // 세로로 겹치는 rect를 한 밴드로 묶어 시각 줄 수를 센다.
      const bandCount = (rects: Rect[]) => {
        const bands: Rect[] = [];
        for (const r of [...rects].sort((a, b) => a.top - b.top)) {
          const band = bands.find(x => r.top < x.bottom - 0.5 && r.bottom > x.top + 0.5);
          if (band) {
            band.top = Math.min(band.top, r.top);
            band.bottom = Math.max(band.bottom, r.bottom);
          } else bands.push({ ...r });
        }
        return bands.length;
      };
      // (a)용 자료: 요약 전체 rect(텍스트 조각 + 항목 inline-block 박스). 줄 계산에는 쓰지 않는다(F1).
      const elementRects = rectsOf(summary);
      // (d)·(e)용 자료: 요약 안 텍스트 노드만 글자 단위 Range로 측정한다 — 항목 박스가 줄에 섞이지 않는다.
      const chars: { char: string; left: number; top: number; bottom: number }[] = [];
      let valueLines = 0;
      const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        if (text.includes(raw)) valueLines = bandCount(rectsOf(node));
        let offset = 0;
        for (const ch of text) {
          const range = document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + ch.length);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0) chars.push({ char: ch, left: rect.left, top: rect.top, bottom: rect.bottom });
          }
          offset += ch.length;
        }
      }
      // 글자 rect를 y 겹침으로 시각 줄로 묶는다. 줄 시작 x = 그 줄 글자 rect의 최소 left.
      const lines: { left: number; top: number; bottom: number; chars: { char: string; left: number }[] }[] = [];
      for (const c of [...chars].sort((a, b) => a.top - b.top)) {
        let line = lines.find(l => c.top < l.bottom - 0.5 && c.bottom > l.top + 0.5);
        if (!line) {
          line = { left: c.left, top: c.top, bottom: c.bottom, chars: [] };
          lines.push(line);
        }
        line.left = Math.min(line.left, c.left);
        line.chars.push({ char: c.char, left: c.left });
      }
      lines.sort((a, b) => a.top - b.top);
      for (const line of lines) line.chars.sort((a, b) => a.left - b.left);
      // 요약을 자를 수 있는 범위: 요약 span과 그 자손 전부 + 버튼과 그 조상(F2).
      const scoped = new Set<HTMLElement>([summary, ...summary.querySelectorAll<HTMLElement>('*')]);
      for (let el: HTMLElement | null = button; el; el = el.parentElement) scoped.add(el);
      const cutting: string[] = [];
      for (const el of scoped) {
        const s = getComputedStyle(el);
        const clipped = (['hidden', 'clip'].includes(s.overflowX) || ['hidden', 'clip'].includes(s.overflowY))
          && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
        if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none' || clipped) cutting.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
      return {
        button: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        elementRects, lines, cutting, valueLines,
        scrollWidth: button.scrollWidth, clientWidth: button.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        summaryText: summary.textContent ?? '',
      };
    }, longRaw);

    // (a) 요약의 모든 조각(텍스트·항목 박스)이 버튼 박스 안(1px 허용) — 밖으로 나간 글자가 없다.
    expect(m.elementRects.length).toBeGreaterThan(0);
    for (const r of m.elementRects) {
      expect(r.left).toBeGreaterThanOrEqual(m.button.left - 1);
      expect(r.right).toBeLessThanOrEqual(m.button.right + 1);
      expect(r.top).toBeGreaterThanOrEqual(m.button.top - 1);
      expect(r.bottom).toBeLessThanOrEqual(m.button.bottom + 1);
    }
    // (b) 요약이 버튼 폭을 넘지 않고 페이지에도 수평 넘침이 없다.
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
    expect(m.docScrollWidth).toBeLessThanOrEqual(m.innerWidth);
    // (c) 요약·자손·버튼·조상 어디에도 말줄임·line-clamp·실제 잘림(hidden/clip에서 scroll이 client를 넘음)이 없다.
    expect(m.cutting).toEqual([]);
    // (d) 요약이 두 줄 이상이고, 모든 시각 줄(텍스트 기준)의 시작 x가 같다(왼쪽 정렬, 1px 허용).
    expect(m.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of m.lines) expect(Math.abs(line.left - m.lines[0]!.left)).toBeLessThanOrEqual(1);
    // (e) 각 줄의 첫 비공백 글자(그 줄에서 가장 왼쪽 글자 rect의 문자)는 구분점이 아니다 — 구분점은 앞 항목 끝에 붙는다.
    for (const line of m.lines) {
      const first = line.chars.find(c => /\S/.test(c.char));
      expect(first, `줄의 첫 글자를 찾지 못했다: ${line.chars.slice(0, 8).map(c => c.char).join('')}`).toBeDefined();
      expect(first!.char).not.toBe('·');
    }
    // 긴 원문 값 자체도 요약 폭 안에서 감긴다(그 값 텍스트 노드의 시각 줄 2개 이상).
    expect(m.valueLines).toBeGreaterThanOrEqual(2);
    // (f) 긴 원문 전체가 라벨과 함께 요약 텍스트에 있다. (원문 보존 문구는 #304에서 '이 화면에서 쓸 수 없는 값'으로 바뀌었다.)
    expect(m.summaryText).toContain(`느린 실행 기준 이 화면에서 쓸 수 없는 값: ${longRaw}`);

    // 키보드: 요약 버튼에서 Enter → 펼쳐지고 포커스는 접기 토글로 이동한다.
    await expand.press('Enter');
    await expect(collapse).toBeVisible();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(bar.getByRole('combobox', { name: '느린 실행 기준' })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: '정렬' })).toBeVisible();
    await expect(collapse).toBeFocused();

    // 접힘 기억과 사이드바 상태는 storage state 없이 context마다 격리되지만, 테스트가 남긴 키를 지워 기본값으로 끝낸다.
    await page.evaluate(() => {
      localStorage.removeItem('platform:page-filter-collapsed:cycle-time');
      localStorage.removeItem('platform:page-head-collapsed:cycle-time');
      localStorage.removeItem('platform:sidebar-collapsed');
    });
  });
});

test.describe('셸 sticky 계약 (06 §7)', () => {
  test('main 스크롤 뒤에도 페이지 제목·액션은 Context에 가리지 않는다', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(contextBar(page)).toBeVisible();
    const main = page.locator('#platform-main');
    // The real overview has KPI, trend and breakdown sections; no synthetic spacer is inserted.
    await expect.poll(() => main.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100);
    await main.evaluate(el => { el.scrollTop = 100; });
    await expect.poll(() => main.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(100);
    const header = main.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    // Refresh is a secondary action, so it lives in ⋯. The controls that stay in the header are the title, the primary action, and the ⋯ trigger.
    for (const target of [mainHeading(page), header.getByRole('link', { name: '사이클타임 상세 보기', exact: true }), header.getByRole('button', { name: '더보기', exact: true })]) {
      await expect(target).toBeVisible();
      await expect.poll(() => target.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit !== null && el.contains(hit);
      })).toBe(true);
    }
    const headerBox = await header.boundingBox();
    const contextBox = await contextBar(page).boundingBox();
    expect(headerBox).not.toBeNull();
    expect(contextBox).not.toBeNull();
    expect(contextBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
    await evidence(page, testInfo, 'page-header-context-after-scroll');
  });

  test('1024px 펼친 사이드바와 상세 패널에서도 Tab으로 주 동작에 닿는다 (#303)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.addInitScript(() => localStorage.setItem('platform:sidebar-collapsed', '0'));
    await page.goto(PRODUCTIVITY.replace('&roomNames=PHOTO', ''));
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
    await page.getByRole('button', { name: 'CVD 들어가기' }).click();
    await page.getByRole('button', { name: 'STG-CVD-A 들어가기' }).click();
    await page.getByRole('button', { name: 'MEM-CVD-0149 들어가기' }).click();
    await expect.poll(() => query(page).get('drillEquipment')).toBe('MEM-CVD-0149');
    await expect(page.getByText('설비 요약', { exact: true }).first()).toBeVisible();
    const header = page.locator('#platform-main header').filter({ has: page.getByRole('heading', { level: 1 }) });
    const primary = header.getByRole('link', { name: '사이클타임 상세 보기', exact: true });
    for (let i = 0; i < 150 && !await primary.evaluate(el => el === document.activeElement); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(primary).toBeFocused();
    await expect.poll(() => primary.evaluate(el => {
      const link = el.getBoundingClientRect();
      const band = el.closest('header')!.getBoundingClientRect();
      return link.left >= band.left && link.right <= band.right && link.top >= band.top && link.bottom <= band.bottom;
    })).toBe(true);
    await expect.poll(() => header.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await evidence(page, testInfo, 'page-header-primary-focus-1024');
  });

  // AA2-1 (#398): at 1024 with the expanded sidebar and the drill detail panel every ADR-0035 yield is
  // spent, and the measured header (clientWidth 292, scrollWidth 404) let the left group's shrink-0
  // controls spill under Data Trust — a click on the star opened Data Trust instead of the favorite.
  test('1024px 펼친 사이드바·설비 상세에서 별과 Data Trust 상자는 겹치지 않고 별은 눌린다 (#398)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.addInitScript(() => localStorage.setItem('platform:sidebar-collapsed', '0'));
    await page.goto(`${PRODUCTIVITY}&drillRoom=PHOTO&drillStgroup=STG-PHOTO-A&drillEquipment=MEM-PHOTO-0103`);
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
    await expect(page.getByText('설비 요약', { exact: true }).first()).toBeVisible();
    const header = page.locator('#platform-main header').filter({ has: page.getByRole('heading', { level: 1 }) });
    // The star's accessible name flips between 즐겨찾기에 추가/즐겨찾기에서 제거 with aria-pressed.
    const star = header.getByRole('button', { name: /즐겨찾기/ });
    const trust = header.getByRole('button', { name: '데이터 신뢰' });
    const description = header.getByRole('button', { name: /물리 점유율/ });
    const noOverlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    const starBox = await star.boundingBox();
    const trustBox = await trust.boundingBox();
    const descriptionBox = await description.boundingBox();
    expect(starBox).not.toBeNull();
    expect(trustBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(noOverlap(starBox!, trustBox!)).toBe(true);
    expect(noOverlap(descriptionBox!, trustBox!)).toBe(true);
    await expect.poll(() => star.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && el.contains(hit);
    })).toBe(true);
    const pressed = await star.getAttribute('aria-pressed');
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
    await evidence(page, testInfo, 'page-header-star-hit-1024');
  });

  // UX-1 (#398): the yield widths predate the left group's rem minimum, so 1024 collapsed (overview) and 1440
  // collapsed (drill + detail) scrolled the header while Data Trust's summary and the badge were still shown.
  for (const { width, drill } of [{ width: 1024, drill: false }, { width: 1440, drill: true }]) {
    test(`사이드바를 접은 ${width}px ${drill ? '설비 상세' : '개요'}에서 머리는 모든 양보 전에 가로로 넘치지 않는다 (#398)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => localStorage.setItem('platform:sidebar-collapsed', '1'));
      await page.goto(`${PRODUCTIVITY}${drill ? '&drillRoom=PHOTO&drillStgroup=STG-PHOTO-A&drillEquipment=MEM-PHOTO-0103' : ''}`);
      await expectScopeValid(page, 'MEM · 메모리');
      await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toBeVisible();
      if (drill) await expect(page.getByText('설비 요약', { exact: true }).first()).toBeVisible();
      const header = page.locator('#platform-main header').filter({ has: page.getByRole('heading', { level: 1 }) });
      await expect(header.getByRole('button', { name: '데이터 신뢰' })).toBeVisible();
      // Compact mode keeps the button, so only the badge itself shows that no stage was yielded too far.
      await expect(header.getByRole('button', { name: '데이터 신뢰' }).getByText('잠정')).toBeVisible();
      await expect.poll(() => header.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      await evidence(page, testInfo, `page-header-collapsed-no-scroll-${width}`);
    });
  }

  // #303: the open detail panel narrows the page, and the header yields description → trust → badge instead of
  // hiding the title or pushing the primary action off screen behind a horizontal scroll.
  for (const width of [1440, 1280]) {
    test(`상세 패널이 열린 ${width}px에서도 제목은 보이고 주 동작은 화면 안, 머리는 가로로 넘치지 않는다 (#303)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${PRODUCTIVITY.replace('&roomNames=PHOTO', '')}`);
      await expectScopeValid(page, 'MEM · 메모리');
      await page.getByRole('button', { name: 'CVD 들어가기' }).click();
      await page.getByRole('button', { name: 'STG-CVD-A 들어가기' }).click();
      await page.getByRole('button', { name: 'MEM-CVD-0149 들어가기' }).click();
      await expect.poll(() => query(page).get('drillEquipment')).toBe('MEM-CVD-0149');
      await expect(page.getByText('설비 요약', { exact: true }).first()).toBeVisible();
      const header = page.locator('#platform-main header').filter({ has: page.getByRole('heading', { level: 1 }) });
      const metrics = await header.evaluate(el => {
        const h1 = el.querySelector('h1')!.getBoundingClientRect();
        // The right-hand group ends with the primary action.
        const primary = el.lastElementChild!.lastElementChild!.getBoundingClientRect();
        return { titleWidth: h1.width, lastRight: primary.right, viewport: window.innerWidth, scroll: el.scrollWidth, client: el.clientWidth };
      });
      expect(metrics.titleWidth).toBeGreaterThan(0);
      expect(metrics.lastRight).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
      await evidence(page, testInfo, `page-header-yield-${width}`);
    });
  }
});

test.describe('Context 바 우선순위 넘침 (06 §7, ADR-0015)', () => {
  // Measured 2026-10-05: the full row needs about 1018px; the bar has about 1148px before the detail slot opens and 708px after.
  test('상세 슬롯을 같은 1280px 뷰포트에서 열면 자체 폭 변화로 라벨과 기간 프리셋이 접힌다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    await expect(visibleContextLabel(page)).toBeVisible();
    await expect(contextBar(page).getByRole('radio', { name: '1일', exact: true })).toBeVisible();
    await expectContextBounds(page);
    const before = { inline: await contextBar(page).getByRole('button').allTextContents(), overflow: await overflowCount(page) };
    await evidence(page, testInfo, 'context-before-detail-1280');
    await row.getByRole('button', { name: /보기$/ }).click();
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible();
    await expect(contextBar(page).getByRole('radio', { name: '1일', exact: true })).toHaveCount(0);
    await expect(visibleContextLabel(page)).toHaveCount(0);
    expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
    await expectContextBounds(page);
    const after = { inline: await contextBar(page).getByRole('button').allTextContents(), overflow: await overflowCount(page) };
    await testInfo.attach('context-own-width-before-after', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
    await evidence(page, testInfo, 'context-after-detail-1280');
  });

  test('넓은 폭(1920px) 생산성 개요에서는 1일 프리셋과 모든 조건이 인라인이다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 800 });
    await page.goto(PRODUCTIVITY);
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(contextBar(page).getByRole('radio', { name: '1일', exact: true })).toBeVisible();
    await expect(visibleContextLabel(page)).toBeVisible();
    await expect(contextBar(page).getByRole('button', { name: /개 더/ })).toHaveCount(0);
    await expectContextBounds(page);
    await evidence(page, testInfo, 'context-wide-1920');
  });

  // #218: at the most common width the period presets and every condition stay inline. The "전역 CONTEXT" label is
  // the first item to hide when the row is short; with FeedbackOps control sizes (ADR-0023) the 1440px productivity row
  // measured about 20-40px over the 1148px bar (2026-10-07), so the label hides here. The label-first step is covered by
  // the shell unit test.
  test('1440px 생산성 개요는 기간 프리셋·모든 조건이 인라인이다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto(PRODUCTIVITY);
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(contextBar(page).getByRole('button', { name: /개 더/ })).toHaveCount(0);
    await expect(contextBar(page).getByRole('radio', { name: '1일', exact: true })).toBeVisible();
    await expectContextBounds(page);
    await evidence(page, testInfo, 'context-1440-presets-inline');
  });

  // At 1280px with the detail slot open the compact row fits without overflow (see the first test), so overflow editing is checked at 1024px.
  test('상세 슬롯이 열린 1024px에서도 한 줄이며 넘침에서 편집한다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103');
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toBeVisible();
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = contextBar(page);
    await expect(bar).toBeVisible();
    await expectContextBounds(page);
    await expect(bar.getByRole('button', { name: /^기간:/ })).toBeVisible();
    await evidence(page, testInfo, 'context-single-row-1024');
    await bar.getByRole('button', { name: /^조건 \d+개 더/ }).click();
    const overflow = page.getByRole('dialog', { name: '추가 Context 조건' });
    await expect(overflow.getByRole('button', { name: /설비 선택/ })).toBeVisible();
    await overflow.getByRole('button', { name: /설비 선택/ }).click();
    await expect(page.getByRole('radio', { name: '빈 선택' })).toBeVisible();
    await page.getByRole('radio', { name: '빈 선택' }).click();
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('equipmentSelection')).toBe('none');
    await expect(bar.getByRole('button', { name: /개 적용 중$/ })).toBeVisible();
    await expectContextBounds(page);
    await evidence(page, testInfo, 'context-overflow-editor-1024');
  });
});

test.describe('딥링크 복원 (06 §6.4)', () => {
  test('전역 Context와 page 소유 상태를 URL에서 그대로 복원한다', async ({ page }, testInfo) => {
    const url = `${PRODUCTIVITY}&granularity=day`;
    await page.goto(url);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = contextBar(page);
    await expect(bar.getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'room_name PHOTO' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: '집계 단위' }).getByRole('radio', { name: '일' })).toBeChecked();
    expect(query(page).toString()).toBe(new URL(url, 'http://x').searchParams.toString());
    await evidence(page, testInfo, 'restored');

    await page.reload();
    await expect(page.getByRole('radiogroup', { name: '집계 단위' }).getByRole('radio', { name: '일' })).toBeChecked();
    await expect(contextBar(page).getByRole('button', { name: 'room_name PHOTO' })).toBeVisible();
  });

  test('기간이 빠진 시간 적용 메뉴는 서버 기준시각으로 기본 기간을 절대값으로 URL에 기록한다', async ({ page }, testInfo) => {
    // The mock server's defaultRangeTo is 2026-09-26T09:00:00 (a fixture value): never browser now or midnight rounding (§6.3).
    await page.goto('/analytics/productivity?v=1&scopeId=MEM');
    await expect.poll(() => query(page).get('to')).toBe('2026-09-26T09:00:00');
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    const preset = await periodPreset(page, '1일');
    await expect(preset.locator).toBeChecked();
    await preset.close();
    await evidence(page, testInfo, 'default-period');
    await page.reload();
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
  });

  test('지원하지 않는 URL 버전은 자동 보정하지 않고 계약 오류로 보인다', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=2&scopeId=MEM');
    await expect(page.getByRole('alert')).toContainText('주소에 쓸 수 없는 값이 있습니다');
    await expect(page.getByRole('button', { name: '조건 초기화' })).toBeVisible();
    expect(query(page).get('v')).toBe('2');
    await evidence(page, testInfo, 'contract-error');
  });

  test('주소 오류 화면의 조건 초기화는 눌린 뒤 포커스를 main으로 보낸다', async ({ page }) => {
    await page.goto('/equipment?v=2&scopeId=MEM');
    await page.getByRole('button', { name: '조건 초기화' }).click();
    await expect(page.getByRole('button', { name: '조건 초기화' })).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
  });

  test('표 정렬·페이지·드로어 탭을 등록된 page key로 복원하고 새로고침에도 유지한다', async ({ page }, testInfo) => {
    // Fixture: MEM equipment list fills page 1 (25/row) and overflows to page 2.
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    const focus = await page.locator('[data-row-id]').first().getAttribute('data-row-id');
    expect(focus).toBeTruthy();

    await page.goto(`/equipment?v=1&scopeId=MEM&sort=status:desc&page=2&focus=${focus}&tab=audit`);
    // URL keys are kept as registered page keys — not stripped, not rewritten.
    expect(query(page).get('sort')).toBe('status:desc');
    expect(query(page).get('page')).toBe('2');
    expect(query(page).get('focus')).toBe(focus);
    expect(query(page).get('tab')).toBe('audit');
    const statusHeader = page.locator('[role="columnheader"][data-column="status"]');
    await expect(statusHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(tableStatusLine(page)).toContainText(/2\/\d+/);
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog').getByRole('tab', { name: '변경 이력' })).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'equipment-page-keys');

    await page.reload();
    expect(query(page).get('sort')).toBe('status:desc');
    expect(query(page).get('page')).toBe('2');
    expect(query(page).get('focus')).toBe(focus);
    expect(query(page).get('tab')).toBe('audit');
    await expect(statusHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(tableStatusLine(page)).toContainText(/2\/\d+/);
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog').getByRole('tab', { name: '변경 이력' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Scope 전환은 manifest가 선언한 page 키만 지우고, 뒤로 가면 이전 URL을 그대로 복원한다', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM&page=2');
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(tableStatusLine(page)).toContainText(/2\/\d+/);

    await switchScope(page, 'FDRY');
    await expectScopeValid(page, 'FDRY · 파운드리');
    // contextResetKeys(['page']) is dropped by setGlobal itself — same navigation, no follow-up rewrite.
    expect(query(page).get('scopeId')).toBe('FDRY');
    expect(query(page).has('page')).toBe(false);
    await evidence(page, testInfo, 'scope-switch-drops-page');

    // History traversal restores the entry exactly — the page key must survive Back (06 §6.4).
    await page.goBack();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe('/equipment?v=1&scopeId=MEM&page=2');
    await expect(tableStatusLine(page)).toContainText(/2\/\d+/);
    await evidence(page, testInfo, 'back-restores-page');
  });
});

test.describe('셸 고정 상세 슬롯 (06 §13, ADR-0013)', () => {
  for (const width of [1440, 1280]) {
    test(`focus로 열린 상세가 표 옆에 놓이고 닫기·Back/Forward로 복원된다 (${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/equipment?v=1&scopeId=MEM');
      const main = page.getByRole('main');
      const row = main.locator('[data-row-id]').first();
      await expect(row).toBeVisible();
      const focus = await row.getAttribute('data-row-id');
      const closedWidth = (await main.boundingBox())!.width;
      // The row action writes the registered focus key; no direct DOM or Kernel access.
      const trigger = row.getByRole('button', { name: /보기$/ });
      await trigger.click();
      await expect.poll(() => query(page).get('focus')).toBe(focus);
      const slot = page.getByRole('complementary', { name: '상세 패널' });
      const dialog = slot.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'false');
      await expect(dialog.getByRole('button', { name: '상세 닫기' })).toBeFocused();
      await expect(page.locator('#root')).not.toHaveAttribute('inert');
      await expect(page.getByTestId('drawer-scrim')).toHaveCount(0);
      const panelBox = (await slot.boundingBox())!;
      const mainBox = (await main.boundingBox())!;
      expect(panelBox.width).toBe(440);
      expect(panelBox.y).toBe(0);
      expect(panelBox.height).toBe(900);
      expect(mainBox.width).toBeLessThan(closedWidth);
      // Wide table columns scroll inside this viewport; compare its visible edge, not the overflowing inner table.
      const tableBox = (await main.getByLabel('스크롤 가능한 행 영역', { exact: true }).boundingBox())!;
      expect(tableBox.x + tableBox.width).toBeLessThanOrEqual(panelBox.x);
      const checkbox = row.getByRole('checkbox');
      await checkbox.click();
      await expect(checkbox).toBeChecked();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('link', { name: '전체 화면' })).toBeVisible();
      await evidence(page, testInfo, `docked-detail-${width}`);

      await dialog.getByRole('button', { name: '상세 닫기' }).click();
      await expect.poll(() => query(page).has('focus')).toBe(false);
      await expect(dialog).toHaveCount(0);
      await expect(slot).toBeHidden();
      await expect(page.getByRole('complementary', { name: '상세 패널' })).toHaveCount(0);
      await page.goBack();
      await expect.poll(() => query(page).get('focus')).toBe(focus);
      await expect(dialog).toBeVisible();
      await page.goForward();
      await expect.poll(() => query(page).has('focus')).toBe(false);
      await expect(dialog).toHaveCount(0);
      await page.goBack();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: '상세 닫기' }).focus();
      await page.keyboard.press('Escape');
      await expect.poll(() => query(page).has('focus')).toBe(false);
      await expect(dialog).toHaveCount(0);
      await evidence(page, testInfo, `docked-detail-closed-${width}`);
    });
  }

  test('상세를 닫으면 상세 전용 tab도 같이 지워지고 목록 필터·전역 Context는 유지된다 (#299 B-05)', async ({ page }) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    await page.goto(`/equipment?v=1&scopeId=MEM&q=PHOTO&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');

    // 닫기 버튼 경로.
    await dialog.getByRole('button', { name: '상세 닫기' }).click();
    await expect.poll(() => query(page).has('focus')).toBe(false);
    await expect.poll(() => query(page).has('tab')).toBe(false);
    expect(query(page).get('q')).toBe('PHOTO');
    expect(query(page).get('scopeId')).toBe('MEM');

    // 패널 Esc 경로: 같은 딥링크로 다시 열어 패널 안에서 닫는다.
    await page.goto(`/equipment?v=1&scopeId=MEM&q=PHOTO&focus=${focus}&tab=validity`);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '상세 닫기' }).focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => query(page).has('focus')).toBe(false);
    await expect.poll(() => query(page).has('tab')).toBe(false);
    expect(query(page).get('q')).toBe('PHOTO');
    expect(query(page).get('scopeId')).toBe('MEM');
  });

  test('알 수 없는 drawer tab은 경고 탭으로 보이고 Back 복원 뒤에도 경고가 보인다 (W-350)', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // Start on a valid tab: Radix Tabs seeds its internal state once at mount, so the regression needs the
    // drawer mounted on a real tab first and then reaching the unknown tab by history traversal.
    await page.goto(`/equipment?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/equipment?v=1&scopeId=MEM&focus=${focus}&tab=bogus`);
    await expect.poll(() => query(page).get('tab')).toBe('bogus');
    await expect(dialog.getByRole('alert')).toContainText('등록되지 않은 탭입니다.');
    await dialog.getByRole('button', { name: '속성 열기' }).click();
    await expect.poll(() => query(page).has('tab')).toBe(false);
    await expect(dialog.getByRole('tab', { name: '속성' })).toHaveAttribute('aria-selected', 'true');

    // Back to the unknown tab with the same drawer mounted: the alert tab is selected again.
    await page.goBack();
    await expect.poll(() => query(page).get('tab')).toBe('bogus');
    await expect(dialog.getByRole('alert')).toContainText('등록되지 않은 탭입니다.');
    await evidence(page, testInfo, 'equipment-unknown-tab-back-restore');
  });

  test('알 수 없는 탭 복구 버튼을 키보드로 누르면 선택된 탭으로 포커스가 간다 (#353)', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // W-350과 같이 유효 탭으로 마운트한 뒤 히스토리 순회로 알 수 없는 탭에 닿는다.
    await page.goto(`/equipment?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/equipment?v=1&scopeId=MEM&focus=${focus}&tab=bogus`);
    await expect.poll(() => query(page).get('tab')).toBe('bogus');
    await expect(dialog.getByRole('alert')).toContainText('등록되지 않은 탭입니다.');
    await dialog.getByRole('button', { name: '속성 열기' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('tab', { name: '속성' })).toBeFocused();
    await evidence(page, testInfo, 'equipment-unknown-tab-recovery-focus');
  });

  test('탭 내용 안에 포커스가 있을 때 history로 탭이 바뀌면 선택된 탭으로 포커스가 간다 (#353)', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // The tab list itself stays; only the controlled tab value changes (Back with `tab` dropped).
    await page.goto(`/equipment?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    const inner = dialog.getByRole('tabpanel').getByRole('button').first();
    await inner.focus();
    await expect(inner).toBeFocused();
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/equipment?v=1&scopeId=MEM&focus=${focus}`);
    await expect(dialog.getByRole('tab', { name: '속성' })).toBeFocused();
    await evidence(page, testInfo, 'equipment-tab-content-focus-history');
  });
});

test.describe('메뉴 간 Context 보존과 미적용 표시 (06 §6, §22)', () => {
  test('메뉴를 옮겨도 등록된 전역 Context는 URL에 그대로 남는다', async ({ page }, testInfo) => {
    await page.goto(`${PRODUCTIVITY}&granularity=day`);
    await expectScopeValid(page, 'MEM · 메모리');
    // The sidebar draws only the current section (15 §3.2): reach 설비 마스터 through the 설비관리 section, which opens its first menu.
    await railSection(page, '설비관리').click();
    await expect(mainHeading(page)).toHaveText('설비 마스터');
    const q = query(page);
    expect(q.get('scopeId')).toBe('MEM');
    expect(q.get('from')).toBe('2026-09-25T09:00:00');
    expect(q.get('to')).toBe('2026-09-26T09:00:00');
    expect(q.getAll('roomNames')).toEqual(['PHOTO']);
    // page-owned state of the origin is never copied implicitly (§22).
    expect(q.has('granularity')).toBe(false);
    // time is 'reference' on equipment master: carried and labelled, not applied.
    await expect(contextBar(page).getByRole('button', { name: /^기간:/ })).toContainText('참조만');
    await evidence(page, testInfo, 'equipment-after-link');
  });

  test('지원하지 않는 Context는 지우지 않고 "미사용"으로 표시하고, 지원 메뉴로 가면 조회에 적용된다', async ({ page }, testInfo) => {
    // Pick a Lot that really exists in the period so the destination can prove the filter, not just the chip.
    await page.goto(`/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    await showSlowExecutions(page);
    const lots = await lotColumn(page);
    const lot = lots[0];
    expect(lots.some(l => l !== lot), 'fixture needs more than one Lot in the unfiltered period').toBe(true);

    await page.goto(`/equipment?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}&lotIds=${lot}`);
    await expectScopeValid(page, 'MEM · 메모리');
    const lotEditor = await contextEditor(page, '지우기 Lot');
    const lotChip = lotEditor.locator.locator('..');
    await expect(lotChip).toContainText(lot);
    await expect(lotChip).toContainText('이 화면에서 미사용');
    await evidence(page, testInfo, 'lot-not-used');
    await lotEditor.close();

    await railSection(page, '생산성 분석').click();
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '사이클타임 상세' }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    expect(query(page).getAll('lotIds')).toEqual([lot]);
    const appliedEditor = await contextEditor(page, '지우기 Lot');
    const appliedLot = appliedEditor.locator.locator('..');
    await expect(appliedLot).toContainText(lot);
    await expect(appliedLot).not.toContainText('이 화면에서 미사용');
    await appliedEditor.close();
    await showSlowExecutions(page);
    const filtered = await lotColumn(page);
    expect(filtered.length).toBeGreaterThan(0);
    expect(new Set(filtered)).toEqual(new Set([lot]));
    await evidence(page, testInfo, 'lot-applied');
  });
});

test.describe('권한 — 메뉴 비노출·직접 URL 거부 (06 §6.2, §17)', () => {
  test('권한 없는 메뉴는 내비게이션에 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    for (const hidden of ['설비 마스터', '생산성 개요', '사이클타임 상세', '공정 마스터 예정']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
    await evidence(page, testInfo, 'viewer-nav');
  });

  test('권한 없는 메뉴의 직접 URL은 화면 대신 권한 거부를 보인다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(page.getByText('permission=equipment:view')).toHaveCount(0);
    await expect(page.getByText('설비 마스터')).toBeVisible();
    await expect(page.getByText('권한 담당자에게 요청하세요')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await evidence(page, testInfo, 'viewer-direct-url');
  });

  test('권한 없는 Scope는 다른 Scope로 대체하지 않고 서버 거부로 보인다', async ({ page }, testInfo) => {
    await page.goto(`/analytics/productivity?v=1&scopeId=XIA&${PERIOD}`);
    await expect(page.getByRole('button', { name: /^Scope:/ })).toContainText('접근 불가');
    await expect(page.getByText('이 Scope에 접근 권한이 없습니다').first()).toBeVisible();
    expect(query(page).get('scopeId')).toBe('XIA');
    await evidence(page, testInfo, 'forbidden-scope');
  });

  test('Scope 확인이 실패하면 "확인 중"에 멈추지 않고 실패와 다시 시도를 보이며, 서버가 돌아오면 다시 시도로 화면이 열린다 (#167)', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('table')).toBeVisible();
    await setScenario(page, 'Scope 확인 실패');
    await switchScope(page, 'FDRY');
    const main = page.getByRole('main');
    await expect(main.getByText('Scope를 확인하지 못했습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Scope:/ })).toContainText('확인 실패');
    await expect(page.getByRole('table')).toHaveCount(0);
    await evidence(page, testInfo, 'scope-check-failed');

    await setScenario(page, '정상');
    await main.getByRole('button', { name: '다시 시도' }).click();
    await expectScopeValid(page, 'FDRY · 파운드리');
    await expect(page.getByRole('table')).toBeVisible();
  });
});

test.describe('워크스페이스 (06 §9.1)', () => {
  const ADMIN_URL = `/admin/roles?v=1&scopeId=MEM&${PERIOD}&selectedEquipmentIds=MEM-PHOTO-0103&page=2`;
  // #314: the equipment table applies selectedEquipmentIds (1 row), so page=2 there is out of range and is
  // clamped away. lotIds is a registered global the equipment master does not apply — it stays in the URL
  // without narrowing the 54 rows, so page=2 is a real page and Back can restore it exactly.
  const EQUIPMENT_URL = `/equipment?v=1&scopeId=MEM&${PERIOD}&lotIds=LOT-0001&page=2`;

  test('권한이 좁은 역할은 메뉴가 허락하는 공간 카드만 보고 운영 콘솔 메뉴가 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    await expect(systemSwitcher(page)).toBeVisible();
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('button', { name: /^BRAVO/ })).toHaveAttribute('aria-current', 'true');
    // #252 (ADR-0065): the two planned workspaces carry no entry permission, so every signed-in role sees them.
    await expect(popover.getByRole('button', { name: /^(표준 로그 개발|개선 실행)/ })).toHaveCount(2);
    // CLAS shares MARS's analytics:view gate (#590), so a viewer sees neither.
    await expect(popover.getByRole('button', { name: /^(MARS|CLAS|운영 콘솔)/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toHaveCount(0);
    await page.getByRole('button', { name: '메뉴 검색…' }).click();
    await expect(page.getByRole('option', { name: /권한\/역할 관리/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await evidence(page, testInfo, 'viewer-limited-spaces');
  });

  test('engineer는 전환기에 MARS·BRAVO·CLAS 카드를 갖고 운영 콘솔은 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('button', { name: /^MARS/ })).toHaveAttribute('aria-current', 'true');
    await expect(popover.getByRole('button', { name: /^BRAVO/ })).toBeVisible();
    await expect(popover.getByRole('button', { name: /^CLAS/ })).toBeVisible();
    await expect(popover.getByRole('button', { name: /^운영 콘솔/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toHaveCount(0);
    await evidence(page, testInfo, 'engineer-two-spaces');
  });

  test('진입 권한이 없는 공간의 직접 URL은 메뉴 권한 검사 전에 공간 거부를 보인다', async ({ page }, testInfo) => {
    for (const role of ['engineer', 'viewer'] as const) {
      await signInAs(page, role);
      await page.goto(ADMIN_URL);
      await expect(page.getByRole('status').filter({ hasText: '이 공간에 들어갈 수 없습니다' })).toBeVisible();
      // 본문은 Registry 공간 라벨과 요청 문장이다. 레일에는 이 공간이 없다.
      await expect(page.getByRole('main')).toContainText('운영 콘솔');
      await expect(page.getByRole('main')).toContainText('권한 담당자에게 요청하세요');
      await expect(page.getByRole('heading', { name: '권한/역할 관리' })).toHaveCount(0);
      // Denial never rewrites the address: pathname and the four global keys stay exactly as entered.
      expect(new URL(page.url()).pathname).toBe('/admin/roles');
      const q = query(page);
      expect(q.get('scopeId')).toBe('MEM');
      expect(q.get('from')).toBe('2026-09-25T09:00:00');
      expect(q.get('to')).toBe('2026-09-26T09:00:00');
      expect(q.get('selectedEquipmentIds')).toBe('MEM-PHOTO-0103');
      await evidence(page, testInfo, `space-denial-${role}`);
    }
  });

  test('관리자는 전환기로 운영 콘솔을 오가며 전역 Context를 보존한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(EQUIPMENT_URL);
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toHaveCount(0);
    await page.getByRole('button', { name: '메뉴 검색…' }).click();
    // Palette spans every accessible space; the secondary line names the space first.
    await expect(page.getByRole('option', { name: /권한\/역할 관리/ })).toContainText('운영 콘솔');
    await expect(page.getByRole('option', { name: /설비 마스터/ })).toContainText('MARS');
    await page.keyboard.press('Escape');
    await evidence(page, testInfo, 'admin-analytics');

    await chooseSystem(page, '운영 콘솔');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/roles');
    const q = query(page);
    expect(q.get('scopeId')).toBe('MEM');
    expect(q.get('from')).toBe('2026-09-25T09:00:00');
    expect(q.get('to')).toBe('2026-09-26T09:00:00');
    expect(q.get('lotIds')).toBe('LOT-0001');
    // Globals survive the switch; page-owned state does not.
    expect(q.get('page')).toBeNull();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toHaveCount(0);
    // Current markers: the switcher names the system, the rail section carries aria-current="true" (not "page").
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: 운영 콘솔');
    await expect(railSection(page, '관리·감사')).toHaveAttribute('aria-current', 'true');
    await evidence(page, testInfo, 'admin-operations');

    // The switch pushed a history entry: Back lands on the exact origin URL (page=2 included, 06 §6.4)
    // with the analytics sidebar restored, and Forward returns to the console URL.
    await page.goBack();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(EQUIPMENT_URL);
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    await expect(railSection(page, '설비관리')).toHaveAttribute('aria-current', 'true');
    await evidence(page, testInfo, 'admin-history-back');

    await page.goForward();
    // Forward returns to the entry switchSpace pushed: console home path, globals kept, page key dropped
    // (compared decoded — the kernel's buildQuery percent-encodes values in the pushed URL).
    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/roles');
    const fwd = query(page);
    expect(fwd.get('scopeId')).toBe('MEM');
    expect(fwd.get('from')).toBe('2026-09-25T09:00:00');
    expect(fwd.get('to')).toBe('2026-09-26T09:00:00');
    expect(fwd.get('lotIds')).toBe('LOT-0001');
    expect(fwd.get('page')).toBeNull();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toBeVisible();
    await evidence(page, testInfo, 'admin-history-forward');

    await chooseSystem(page, 'MARS');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/equipment');
    const back = query(page);
    expect(back.get('scopeId')).toBe('MEM');
    expect(back.get('from')).toBe('2026-09-25T09:00:00');
    expect(back.get('to')).toBe('2026-09-26T09:00:00');
    expect(back.get('lotIds')).toBe('LOT-0001');
    expect(back.get('page')).toBe('2');
    await evidence(page, testInfo, 'admin-back');
  });
});

test.describe('플랫폼 홈 · 전역 화면 (ADR-0028, ADR-0070)', () => {
  test('viewer는 홈에서 공지와 내 VOC를 열고, 전역 화면에는 업무 사이드바 대신 플랫폼 사이드바가 있다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '플랫폼 홈' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeVisible();
    // Outside a system the switcher stays, names no current system, and the rail has no section area.
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴');
    await expect(page.getByRole('group', { name: '시스템 섹션' })).toHaveCount(0);
    await (await headerMore(page)).getByRole('link', { name: '내 VOC' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/voc');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: '공지 목록' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/notices');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeVisible();
    await evidence(page, testInfo, 'viewer-home-global');
  });

  test('여러 공간이 있는 역할도 전역 화면에서는 현재 시스템·섹션 표식이 없고, 공간 화면에서만 표시한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/notices');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴');
    await expect(page.getByRole('group', { name: '시스템 섹션' })).toHaveCount(0);
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('button', { name: /^MARS/ })).toBeVisible();
    await expect(popover.getByRole('button', { name: /^BRAVO/ })).toBeVisible();
    for (const name of [/^MARS/, /^BRAVO/]) await expect(popover.getByRole('button', { name })).not.toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    await expect(railSection(page, '설비관리')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설비 마스터' })).toHaveAttribute('aria-current', 'page');
    await evidence(page, testInfo, 'global-rail-marker');
  });
});

test.describe('전역 기능 자리 (ADR-0070, 06 §9.1·§10)', () => {
  test('전환기의 플랫폼 메뉴에서 알림을 열면 팝오버가 닫히고 플랫폼 사이드바가 그 화면을 가리킨다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    const popover = await openSwitcher(page);
    const platformMenu = popover.getByRole('navigation', { name: '플랫폼 메뉴' });
    await expect(platformMenu.getByRole('link')).toHaveText(['홈', '알림', '설문', '권한 요청', '내 VOC', '공지']);
    await evidence(page, testInfo, 'platform-menu-switcher');
    await platformMenu.getByRole('link', { name: '알림' }).click();
    await expect(popover).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/notifications');
    await expect(page.getByRole('main').getByRole('heading', { name: '알림' })).toBeFocused();
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '알림' })).toHaveAttribute('aria-current', 'page');
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴');
  });

  test('mock 미리보기의 알림 화면은 실서버 필요 상태를 보이고 FeedbackOps 목록을 열지 않는다 (ADR-0071)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/notifications');
    await expect(page.getByRole('main').getByRole('heading', { name: '알림' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    await expect(page.getByTestId('home-inbox-list')).toHaveCount(0);
  });

  test('레일 알림 종은 mock에서 배지 없이 보이고 키보드로 팝오버를 열고 모두 보기로 알림 화면에 간다 (#652)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    const rail = page.getByRole('navigation', { name: '앱 레일' });
    const bell = rail.getByRole('button', { name: /^알림/ });
    await expect(bell).toHaveAccessibleName('알림');
    await expect(bell).not.toHaveText(/\d/);
    await bell.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '알림' });
    await expect(dialog.getByRole('status')).toContainText('실서버 필요');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(bell).toBeFocused();
    await bell.click();
    await page.getByRole('dialog', { name: '알림' }).getByRole('link', { name: '모두 보기' }).click();
    await expect(page.getByRole('dialog', { name: '알림' })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/notifications');
    await expect(page.getByRole('main').getByRole('heading', { name: '알림' })).toBeFocused();
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '알림' })).toHaveAccessibleName('알림');
  });

  test('설문 전체 페이지는 mock에서 실서버 필요 상태를 보이고 응답 주소는 설문 아래에 놓이며 잘못된 설문 ID는 찾을 수 없음이다 (#653)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    const popover = await openSwitcher(page);
    await popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '설문' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/surveys');
    await expect(page.getByRole('main').getByRole('heading', { name: '설문' })).toBeFocused();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    const sidebarSurveys = page.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '설문', exact: true });
    await expect(sidebarSurveys).toHaveAttribute('aria-current', 'page');

    await page.goto('/surveys/11111111-1111-4111-8111-111111111111/respond');
    await expect(page.getByRole('main').getByRole('heading', { name: '설문 응답' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    await expect(sidebarSurveys).toHaveAttribute('aria-current', 'page');
    const switcher = await openSwitcher(page);
    await expect(switcher.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link')).toHaveText(['홈', '알림', '설문', '권한 요청', '내 VOC', '공지']);

    await page.goto('/surveys/not-a-uuid/respond');
    await expect(page.getByText('설문을 찾을 수 없습니다')).toBeVisible();
  });

  test('플랫폼 사이드바는 업무 사이드바와 접힘 상태를 함께 쓴다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/');
    const platformNav = page.getByRole('navigation', { name: '플랫폼 메뉴' });
    await expect(platformNav.getByRole('group').first()).toBeVisible();
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toBeVisible();
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toBeVisible();
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
  });

  test('메뉴 검색은 플랫폼 메뉴 목적지를 플랫폼 › 그룹 › 메뉴로 찾는다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/');
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox', { name: '메뉴 검색' }).fill('권한 요청');
    const option = page.getByRole('option', { name: /권한 요청/ });
    await expect(option).toContainText('플랫폼 › 내 활동 › 권한 요청');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/permission-requests');
  });

  test('사용자 메뉴의 언어 항목이 화면 언어를 바꾼다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: '앱 레일' });
    await rail.getByRole('button', { name: '사용자 메뉴' }).click();
    await page.getByRole('menuitem', { name: /^언어/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('menuitem', { name: /^Language/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });

  for (const width of [1440, 1024]) {
    test(`전역 화면 배치: 사이드바가 본문을 가리지 않는다 (${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await signInAs(page, 'viewer');
      for (const path of ['/', '/voc']) {
        await page.goto(path);
        await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeVisible();
        const overflow = await page.evaluate(() => {
          const main = document.querySelector('#platform-main')!;
          const aside = document.querySelector('aside[data-collapsed]')!;
          return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, asideRight: aside.getBoundingClientRect().right, mainLeft: main.getBoundingClientRect().left };
        });
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        expect(overflow.asideRight).toBeLessThanOrEqual(overflow.mainLeft);
        if (path === '/') await evidence(page, testInfo, `platform-sidebar-${width}`);
      }
    });
  }
});

test.describe('목적지 단건 조회 (06 §6.2, §22)', () => {
  test('설비 상세 직접 URL은 그 설비의 room 권한을 다시 검증하고 Selection으로 대체하지 않는다', async ({ page }, testInfo) => {
    // The page header and the active EquipmentPanel tab fetch independently (two getEntity calls, 06 §22).
    // Before any negative assertion, wait for BOTH surfaces to reach their expected terminal state — the
    // status/id block under the h1 (header query) and the active tabpanel (panel query) — and for no
    // aria-busy to remain in main. Otherwise a fast correct header plus a slower panel that later renders
    // a substituted Selection row or an unauthorized row would pass.
    const header = page.getByRole('main').locator('[data-platform-page-content] > [aria-busy]'); // Header query boundary; the shared banner can precede it
    const panel = page.getByRole('tabpanel'); // Radix mounts only the active tab's content

    // 1. Granted room (PHOTO): the URL id's own row renders on both surfaces, and the inherited Selection stays untouched in the URL.
    // MEM-PHOTO-0105 (the inherited Selection) shares model Lithius-Pro; its stgroup STG-PHOTO-B is the row that must not render.
    await page.goto('/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM&selectedEquipmentIds=MEM-PHOTO-0105');
    await expect(header.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(panel.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(panel.getByText('STG-PHOTO-A')).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0);
    expect(query(page).get('selectedEquipmentIds')).toBe('MEM-PHOTO-0105');
    await expect(page.getByRole('main')).not.toContainText('STG-PHOTO-B');
    await evidence(page, testInfo, 'entity-room-granted');

    // 2. Same site, ungranted room (DIFF): the site grant holds, but the row's room is re-checked server-side — on both surfaces.
    // The heading shows the URL id, which contains DIFF, so the leak check uses model/stgroup/maker instead of the room token.
    await page.goto('/equipment/MEM-DIFF-0176?v=1&scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(mainHeading(page)).toHaveText('MEM-DIFF-0176'); // the URL id, not a fetched field
    await expect(header.getByText('이 Scope에 접근 권한이 없습니다')).toBeVisible();
    await expect(header.getByText('No grant for equipment')).toBeVisible();
    await expect(panel.getByText('이 Scope에 접근 권한이 없습니다')).toBeVisible();
    await expect(panel.getByText('No grant for equipment')).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0);
    const denied = await page.getByRole('main').innerText();
    expect(denied).not.toContain('XP8');
    expect(denied).not.toContain('STG-DIFF-A');
    expect(denied).not.toContain('ASM');
    await evidence(page, testInfo, 'entity-room-denied');

    // 3. Unknown id: a successful zero (empty) on both surfaces, never a denial and never another row's fields.
    await page.goto('/equipment/DOES-NOT-EXIST?v=1&scopeId=MEM');
    const emptyBanner = page.getByRole('main').getByRole('group', { name: '위젯 상태 요약' });
    await expect(page.getByRole('main').locator('[data-outcome-banner]')).toHaveCount(1);
    await expect(emptyBanner).toContainText('위젯 2개');
    await expect(page.getByRole('main').getByRole('group', { name: '설비 요약', exact: true })).toBeVisible();
    await expect(panel.getByRole('group', { name: '설비 상세', exact: true })).toBeVisible();
    await expect(header.getByText('조건에 맞는 결과가 없습니다')).toBeVisible();
    await expect(panel.getByText('조건에 맞는 결과가 없습니다')).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0);
    const missing = await page.getByRole('main').innerText();
    expect(missing).not.toContain('이 Scope에 접근 권한이 없습니다');
    expect(missing).not.toContain('Lithius-Pro');
    expect(missing).not.toContain('XP8');
    expect(missing).not.toContain('STG-PHOTO-A');
    expect(missing).not.toContain('STG-DIFF-A');
    await evidence(page, testInfo, 'entity-empty');
  });
});

test.describe('Scope·세션 전환 시 이전 결과 비노출 (06 §11, §19)', () => {
  test('Scope를 바꾸는 순간 이전 Scope의 결과는 사라지고 로딩으로 바뀐다', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await setScenario(page, '느린 응답 (+2.2s)');
    const kpis = page.getByRole('region', { name: '네 지표 요약' });
    const card = kpis.getByRole('button', { name: /^물리 점유율/ });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await evidence(page, testInfo, 'before-switch');

    await switchScope(page, 'FDRY');
    await expect(card).toHaveCount(0);
    await expect(kpis.locator('[aria-busy="true"]').first()).toBeVisible();
    await evidence(page, testInfo, 'during-switch');
    // room_name is site-bound and cleared on a site change (ADR-0004).
    expect(query(page).get('scopeId')).toBe('FDRY');
    expect(query(page).has('roomNames')).toBe(false);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await evidence(page, testInfo, 'after-switch');
  });

  test('같은 Scope에서 Context(기간)를 바꿔도 이전 기간의 결과는 보이지 않는다', async ({ page }, testInfo) => {
    // No scope revalidation here, so only the query identity (usePlatformQuery) can hide the old result.
    await page.goto(PRODUCTIVITY);
    await setScenario(page, '느린 응답 (+2.2s)');
    const kpis = page.getByRole('region', { name: '네 지표 요약' });
    const card = kpis.getByRole('button', { name: /^물리 점유율/ });
    await expect(card).toBeVisible({ timeout: 10_000 });

    const preset = await periodPreset(page, '7일');
    await preset.locator.click();
    await preset.close();
    await expect.poll(() => query(page).get('from')).toBe('2026-09-19T09:00:00');
    await expect(card).toHaveCount(0);
    await expect(kpis.locator('[aria-busy="true"]').first()).toBeVisible();
    await evidence(page, testInfo, 'during-period-change');
  });

  test('최근 Scope 적용을 키보드로 누르면 포커스가 main으로 간다 (#353)', async ({ page }, testInfo) => {
    // E2E fixture에는 platform:lastScope가 없어 유효 Scope로 한 번 진입해 Kernel이 저장하게 한다.
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('main').locator('[data-row-id]').first()).toBeVisible({ timeout: 10_000 });
    await page.goto('/equipment?v=1');
    const apply = page.getByRole('button', { name: /^최근 Scope 적용/ });
    await expect(apply).toBeVisible();
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#platform-main')).toBeFocused();
    await evidence(page, testInfo, 'scope-apply-focus-main');
  });

  test('역할(세션)을 바꾸면 이전 사용자의 결과를 보이지 않는다', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await setScenario(page, '느린 응답 (+2.2s)');
    const card = page.getByRole('region', { name: '네 지표 요약' }).getByRole('button', { name: /^물리 점유율/ });
    await expect(card).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '역할(데모 전환)' }).click();
    await page.getByRole('menuitemradio', { name: /플랫폼 관리자/ }).click();
    await expect(card).toHaveCount(0);
    await evidence(page, testInfo, 'during-role-switch');
    await expect(card).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('공통 상태 화면 (06 §19)', () => {
  const EQUIPMENT = '/equipment?v=1&scopeId=MEM';
  for (const { scenario, title, retry } of [
    { scenario: '서버 오류 (error)', title: '데이터를 불러오지 못했습니다', retry: true },
    { scenario: '시간 초과 (timeout)', title: '조회 시간이 초과되었습니다', retry: true },
    { scenario: '0건 (empty)', title: '조건에 맞는 결과가 없습니다', retry: false },
    { scenario: '권한 거부 (forbidden)', title: '이 Scope에 접근 권한이 없습니다', retry: false },
  ]) {
    test(`${scenario} → "${title}"`, async ({ page }, testInfo) => {
      await page.goto(EQUIPMENT);
      await expect(page.getByRole('table')).toBeVisible();
      await setScenario(page, scenario);
      const state = page.getByRole('main').getByText(title);
      await expect(state).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
      if (retry) await expect(page.getByRole('main').getByRole('button', { name: '다시 시도' })).toBeVisible();
      await evidence(page, testInfo, scenario);
    });
  }
});

test.describe('공유 위젯 응답 (06 §19, #55)', () => {
  test('생산성의 같은 오류 네 개는 배너 하나와 이름 있는 간결 상태 네 개로 표시한다', async ({ page }, testInfo) => {
    await page.goto('/analytics/productivity?v=1&scopeId=MEM');
    await expect(page.getByRole('heading', { name: '네 지표 요약' })).toBeVisible();
    await setScenario(page, '서버 오류 (error)');
    const main = page.getByRole('main');
    const banner = main.getByRole('group', { name: '위젯 상태 요약' });
    await expect(main.locator('[data-outcome-banner]')).toHaveCount(1);
    await expect(banner).toContainText('위젯 4개에서 같은 응답(서버 오류)이 확인되었습니다.');
    await expect(banner.getByText('데이터를 불러오지 못했습니다')).toBeVisible();
    await expect(banner.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
    await expect(banner).not.toContainText('Correlation ID');
    await expect(main.locator('[data-widget-state]')).toHaveCount(4);
    for (const name of ['네 지표 요약', 'Job 처리량 추세', '점유 구성', '확인할 항목']) {
      const state = main.getByRole('group', { name, exact: true });
      await expect(state).toBeVisible();
      await expect(state.getByText('데이터를 불러오지 못했습니다')).toBeVisible();
      await expect(state.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
      await expect(state).toContainText('corr-');
    }
    await expect(main.getByRole('alert')).toHaveCount(0);
    await expect(main.locator('[data-outcome-announcer="assertive"]')).toContainText('위젯 4개에서 같은 응답');
    await expect(main.getByText('네 지표 요약', { exact: true })).toHaveCount(1);
    await evidence(page, testInfo, 'shared-error-banner');
  });

  test('일부 위젯 실패에서 단일 실패는 배너 없이 전체 상태를 유지한다', async ({ page }, testInfo) => {
    // The scenario fails every other query. Equipment detail has two queries;
    // productivity has four and therefore intentionally groups its two equal failures.
    await page.goto('/equipment/MEM-PHOTO-0103?v=1&scopeId=MEM');
    const loadedHeader = page.getByRole('main').locator('[data-platform-page-content] > [aria-busy]');
    const loadedPanel = page.getByRole('tabpanel');
    await expect(loadedHeader.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(loadedPanel.getByText('MEM-PHOTO-0103')).toBeVisible();
    await setScenario(page, '일부 위젯 실패');
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toHaveCount(1);
    await expect(main.getByRole('alert')).toContainText('Widget query failed (partial scenario)');
    await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(main.locator('[data-outcome-banner]')).toHaveCount(0);
    await expect(main.locator('[data-widget-state]')).toHaveCount(0);
    await expect(main.getByRole('button', { name: '다시 시도' })).toHaveCount(1);
    await evidence(page, testInfo, 'single-widget-failure');
  });
});

test.describe('화면 오류 격리 (06 §4 전역 Error Boundary)', () => {
  test('메뉴 화면이 렌더 중 예외를 던져도 셸·내비게이션은 살고, Correlation ID를 보이며, 다시 시도는 원인이 남아 있으면 새 Correlation ID로 다시 가두고, 원인이 사라지면 복구한다', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    const main = page.getByRole('main');
    await setScenario(page, '응답 형식 오류 (malformed)');
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toBeVisible();
    await expect(main.getByText(/Correlation ID: client-/)).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Scope:/ })).toBeVisible();
    await evidence(page, testInfo, 'route-error');

    const firstId = await main.getByText(/Correlation ID: client-/).innerText();
    await main.getByRole('button', { name: '다시 시도' }).click();
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toBeVisible();
    await expect(main.getByText(/Correlation ID: client-/)).not.toHaveText(firstId);

    await setScenario(page, '정상');
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toHaveCount(0);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
  });

  test('오류 화면의 홈 링크로 다른 메뉴로 벗어난다', async ({ page }) => {
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await setScenario(page, '응답 형식 오류 (malformed)');
    const main = page.getByRole('main');
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toBeVisible();
    await main.getByRole('link', { name: '홈' }).click();
    await expect(page).not.toHaveURL(/\/analytics\/productivity/);
    // The scenario is still on, so the home screen fails on its own data — and that failure is contained the same way.
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toBeVisible();
    await setScenario(page, '정상');
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toHaveCount(0);
    await expect(mainHeading(page)).not.toHaveText('생산성 개요');
  });
});

test.describe('메뉴 간 링크 허용 여부 (06 §22 — 목적지 권한을 링크가 안다)', () => {
  const METRIC_USAGE = '/metrics/cycle_time?v=1&version=4';

  test('분석 권한이 없는 역할(viewer)에게는 사용처 열기 링크가 열리지 않고 사유가 보인다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto(METRIC_USAGE);
    const main = page.getByRole('main');
    await expect(main.getByText('열 권한이 없습니다').first()).toBeVisible();
    await expect(main.getByRole('link', { name: '사용처 열기' })).toHaveCount(0);
    await evidence(page, testInfo, 'link-not-allowed');
  });

  test('분석 권한이 있는 역할(admin)에게는 같은 링크가 열린다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(METRIC_USAGE);
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: '사용처 열기' }).first()).toBeVisible();
    await expect(main.getByText('열 권한이 없습니다')).toHaveCount(0);
  });
});

test.describe('returnTo 복귀 (06 §22)', () => {
  test('상세로 갔다가 복귀 버튼을 누르면 떠난 URL로 정확히 돌아온다', async ({ page }, testInfo) => {
    await page.goto(`/equipment?v=1&scopeId=MEM&${PERIOD}&status=active`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    const origin = page.url().replace(/^https?:\/\/[^/]+/, '');

    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/equipment\/[^?]+\?/);
    expect(query(page).get('returnTo')).toBe(origin);
    await evidence(page, testInfo, 'detail');

    await (await headerMore(page)).getByRole('link', { name: '← 설비 마스터' }).click();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(origin);
    await expect(page.getByRole('table')).toBeVisible();
    await evidence(page, testInfo, 'returned');
  });

  test('복귀로 다시 열린 상세 패널은 제목 포커스를 빼앗지 않고, 첫 Escape가 패널을 닫는다 (#356, ADR-0032)', async ({ page }, testInfo) => {
    await page.goto(`/equipment?v=1&scopeId=MEM&${PERIOD}`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/equipment\/[^?]+\?/);
    await (await headerMore(page)).getByRole('link', { name: '← 설비 마스터' }).click();

    const heading = page.getByRole('heading', { level: 1, name: '설비 마스터' });
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(dialog.getByRole('button', { name: '상세 닫기' })).not.toBeFocused();
    // The return click leaves the pointer on the title; Radix opens its tooltip after 700 ms.
    // Every table row has tab stops before the panel, so the bound is generous.
    await heading.hover();
    await page.waitForTimeout(800);
    for (let i = 0; i < 300 && (await dialog.locator(':focus').count()) === 0; i++) await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await evidence(page, testInfo, 'returned-panel-title-focus');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('메뉴 사이 Back으로 다시 열린 상세 패널도 제목 포커스를 빼앗지 않는다 (#356, ADR-0032)', async ({ page }, testInfo) => {
    await page.goto(`/equipment?v=1&scopeId=MEM&${PERIOD}`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    // Same-screen open still claims the close button (06 §13).
    await expect(dialog.getByRole('button', { name: '상세 닫기' })).toBeFocused();
    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/equipment\/[^?]+\?/);
    await page.goBack();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '설비 마스터' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: '상세 닫기' })).not.toBeFocused();
    await evidence(page, testInfo, 'history-back-panel-title-focus');
  });

  test('전체 화면 링크는 보던 탭을 목적지 tab으로 넘긴다 (06 §13)', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    const drawerTab = page.getByRole('dialog').getByRole('tab', { name: '유효구간 이력' });
    await drawerTab.click();
    await expect.poll(() => query(page).get('tab')).toBe('validity');

    const link = page.getByRole('dialog').getByRole('link', { name: '전체 화면' });
    const href = await link.getAttribute('href');
    expect(new URL(href!, 'http://localhost').searchParams.get('tab')).toBe('validity');
    await link.click();
    await expect(page).toHaveURL(/\/equipment\/[^?]+\?/);
    await expect(page.getByRole('main').getByRole('tablist', { name: '설비 상세 탭' }).getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'fullscreen-carries-tab');
  });

  test('사이클타임 bucket·bin·정렬을 returnTo에 그대로 남기고 복귀 후에도 유지한다', async ({ page }, testInfo) => {
    const base = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
    // Read a bucket and bin that really contain the first slow execution, so the filter keeps a row (deterministic fixture).
    await page.goto(`${base}&sort=anchor:asc`);
    await expandPageHead(page);
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    await expect(page.getByRole('combobox', { name: '느린 실행 기준' })).toBeVisible();
    await showSlowExecutions(page);
    const first = await firstRowByColumn(page);
    const anchor = first['시작'].replace(' ', 'T');
    const bucket = `${anchor.slice(0, 13)}:00:00`;
    const bucketEnd = new Date(Date.parse(`${bucket}Z`) + 3_600_000).toISOString().slice(0, 19); // default granularity = hour
    const minutes = Number(first['사이클타임 (분)'].replace(/,/g, ''));
    const bin = minutes < 30 ? '0-30' : minutes < 45 ? '30-45' : minutes < 60 ? '45-60' : minutes < 75 ? '60-75' : minutes < 90 ? '75-90' : '90+';
    const binMin = bin === '90+' ? 90 : Number(bin.split('-')[0]);
    const binMax = bin === '90+' ? Infinity : Number(bin.split('-')[1]);

    // The filter must actually restrict: the unfiltered table needs a row outside the chosen bucket or bin.
    const unfiltered = await rowMapsByColumn(page);
    const outside = unfiltered.some(row => {
      const rowBucket = `${row['시작'].replace(' ', 'T').slice(0, 13)}:00:00`;
      const rowMin = Number(row['사이클타임 (분)'].replace(/,/g, ''));
      return rowBucket !== bucket || rowMin < binMin || rowMin >= binMax;
    });
    expect(outside, 'fixture needs an unfiltered row outside the chosen bucket/bin').toBe(true);

    const origin = `${base}&sort=anchor:asc&bucket=${bucket}&bin=${bin}`;

    // Row-level contract: every displayed row sits in [bucket, bucket+1h), inside the bin range, ascending by 시작.
    const expectRowsFiltered = async () => {
      await showSlowExecutions(page);
      const rows = await rowMapsByColumn(page);
      expect(rows.length).toBeGreaterThan(0);
      const anchors = rows.map(row => row['시작'].replace(' ', 'T'));
      for (const [i, value] of anchors.entries()) {
        expect(value >= bucket && value < bucketEnd, `row ${i} 시작 ${value} inside [${bucket}, ${bucketEnd})`).toBe(true);
        const min = Number(rows[i]['사이클타임 (분)'].replace(/,/g, ''));
        expect(min >= binMin && min < binMax, `row ${i} 사이클타임 ${min} inside bin ${bin}`).toBe(true);
        if (i > 0) expect(value >= anchors[i - 1], `row ${i} ordered by 시작 ascending (sort=anchor:asc)`).toBe(true);
      }
      return rows.length;
    };

    await page.goto(origin);
    await expandPageHead(page);
    await expect(page.getByRole('button', { name: '버킷 필터 해제' })).toBeVisible();
    await expect(page.getByRole('button', { name: '분포 필터 해제' })).toBeVisible();
    expect(query(page).get('sort')).toBe('anchor:asc');
    await expect(page.getByRole('combobox', { name: '정렬' })).toHaveText('시작 오래된');
    // The first unfiltered row is inside bucket+bin by construction, so the filter must still show a row.
    const filteredCount = await expectRowsFiltered();
    expect(filteredCount).toBeGreaterThanOrEqual(1);
    await expect(page.getByRole('row').getByRole('link', { name: /상세$/ }).first()).toBeVisible();
    await evidence(page, testInfo, 'cycle-page-keys');

    await page.getByRole('row').getByRole('link', { name: /상세$/ }).first().click();
    await expect(page).toHaveURL(/\/analytics\/executions\/[^?]+\?/);
    expect(query(page).get('returnTo')).toBe(origin);

    // execution-detail's back button follows returnOrigin() (same href as returnTarget()).
    await (await headerMore(page)).getByRole('link', { name: '← 사이클타임 상세' }).click();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(origin);
    await expandPageHead(page);
    await expect(page.getByRole('button', { name: '버킷 필터 해제' })).toBeVisible();
    await expect(page.getByRole('button', { name: '분포 필터 해제' })).toBeVisible();
    expect(query(page).get('sort')).toBe('anchor:asc');
    await expect(page.getByRole('combobox', { name: '정렬' })).toHaveText('시작 오래된');
    expect(await expectRowsFiltered()).toBe(filteredCount);
    await evidence(page, testInfo, 'cycle-returned');
  });

  test('앱 밖을 가리키는 returnTo는 따르지 않고 상위 메뉴로 돌아간다', async ({ page }, testInfo) => {
    await page.goto(`/equipment/EQ-X?v=1&scopeId=MEM&returnTo=${encodeURIComponent('https://example.com/phish')}`);
    const back = (await headerMore(page)).getByRole('link', { name: '← 설비 마스터' });
    await expect(back).toBeVisible();
    const href = await back.getAttribute('href');
    expect(href).toMatch(/^\/equipment\?/);
    expect(href).not.toContain('example.com');
    await evidence(page, testInfo, 'unsafe-return-to');
  });
});

test.describe('메뉴 활용률 (06 §4, docs/05 — kernel이 recordUsage로 계측, 콘솔은 집계만 읽는다)', () => {
  const DIRECT_URL = '/admin/usage';

  test('권한 없는 역할(engineer)은 메뉴가 비노출이고 직접 URL은 공간 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 활용률' })).toHaveCount(0);

    await page.goto(DIRECT_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 공간에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(main).toContainText('권한 담당자에게 요청하세요');
    // The client gate refuses without redirecting: the URL the user typed stays exact.
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_URL);
    await evidence(page, testInfo, 'usage-engineer-space-denied');
  });

  test('viewer도 메뉴가 비노출이고 직접 URL은 공간 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 활용률' })).toHaveCount(0);

    await page.goto(DIRECT_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 공간에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(main).toContainText('권한 담당자에게 요청하세요');
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_URL);
    await evidence(page, testInfo, 'usage-viewer-space-denied');
  });

  test('관리자: 설비를 다녀오면 설비 마스터 행의 방문 수가 정확히 +1이다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    // The usage store lives in the tab's JS realm, so the round trip must be SPA navigation (command
    // palette spans every accessible space) — a document reload restarts the mock server and erases counts.
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByRole('main').getByRole('table').first()).toBeVisible({ timeout: 10_000 });
    const paletteTo = async (menu: RegExp) => {
      await page.getByRole('button', { name: '메뉴 검색…' }).click();
      await page.getByRole('option', { name: menu }).click();
    };

    await paletteTo(/메뉴 활용률/);
    const before = await usageVisits(page, 'equipment-master');

    // One more real visit: exactly one more entry for equipment-master (dedupe is per stay).
    await paletteTo(/설비 마스터/);
    await expect(page.getByRole('main').getByRole('table').first()).toBeVisible({ timeout: 10_000 });
    await paletteTo(/메뉴 활용률/);
    const after = await usageVisits(page, 'equipment-master');
    expect(after).toBe(before + 1);
    await evidence(page, testInfo, 'usage-visit-counted');
  });

  test('사이드바로 메뉴를 옮기면 도착 entry에 via sidebar와 앞 메뉴 id가 실린다 (#605)', async ({ page }) => {
    await signInAs(page, 'admin');
    // The sidebar shows only the chosen rail section; the console's admin section has two menus (roles → audit).
    await page.goto('/admin/roles');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await nav.getByRole('link', { name: '변경 감사' }).click();
    await expect(page).toHaveURL(/\/admin\/audit/);
    await expect.poll(async () => (await storedUsageEvents(page)).filter(e => e.name === 'entry' && e.via === 'sidebar').length, { timeout: 10_000 }).toBeGreaterThan(0);
    const rows = (await storedUsageEvents(page)).filter(e => e.name === 'entry');
    expect(rows[0]).toMatchObject({ menuId: 'admin-roles', via: 'direct', fromMenuId: null });
    expect(rows[1]).toMatchObject({ menuId: 'admin-audit', via: 'sidebar', fromMenuId: 'admin-roles' });
  });
});

test.describe('메뉴 레지스트리 (06 §9.1 — console declarations read back through the client registry)', () => {
  const DIRECT_URL = '/admin/registry';
  const DIRECT_FOCUS_URL = `${DIRECT_URL}?v=1&focus=equipment-master`;
  const NEEDLES = ['레지스트리', 'admin-registry', '메뉴 레지스트리'];

  // Kernel per-user recent store (packages/kernel/src/platform.tsx): localStorage key
  // `platform:recent:${userId}` (userId = role id on the mock adapter), value Recent[] = { menuId, url, at }.
  // The denied operations row is seeded first (it must never surface) plus one row the role does own,
  // so a passing assertion means the visibleMenus guard filtered it — not that the list is simply empty.
  const seedRecent = (page: Page, role: 'engineer' | 'viewer', accessible: { menuId: string; url: string }) =>
    page.addInitScript(({ key, accessible }) => {
      localStorage.setItem(key, JSON.stringify([
        { menuId: 'admin-registry', url: '/admin/registry', at: 1_000 },
        { ...accessible, at: 900 },
      ]));
    }, { key: `platform:recent:${role}`, accessible });

  const searchPalette = async (page: Page, needle: string) => {
    await page.getByRole('button', { name: '메뉴 검색…' }).click();
    await page.getByRole('dialog').getByRole('combobox').fill(needle);
  };

  test('권한 없는 역할(engineer)은 메뉴가 비노출이고 직접 URL은 공간 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await seedRecent(page, 'engineer', { menuId: 'equipment-master', url: '/equipment' });
    await page.goto('/equipment?v=1&scopeId=MEM');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    // Absence proves nothing before the shell has rendered: wait for a link this role does own.
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 레지스트리' })).toHaveCount(0);

    // The palette spans every space the session may enter, so an operations leak would surface here.
    const palette = page.getByRole('dialog');
    for (const needle of NEEDLES) {
      await searchPalette(page, needle);
      await expect(palette.getByRole('option', { name: /메뉴 레지스트리/ })).toHaveCount(0);
      await expect(palette).toContainText('일치하는 메뉴가 없습니다.');
      await page.keyboard.press('Escape');
    }

    // Recent list: the seeded accessible row renders; the operations row must be dropped by the
    // Sidebar's visibleMenus guard, not by the list happening to be empty.
    const recentList = page.getByRole('region', { name: '최근 방문' });
    await expect(recentList.getByRole('link', { name: '최근 방문: 설비 마스터' })).toBeVisible();
    await expect(recentList.getByRole('link', { name: '최근 방문: 메뉴 레지스트리' })).toHaveCount(0);
    await expect(recentList.locator('a[href="/admin/registry"]')).toHaveCount(0);

    await page.goto(DIRECT_FOCUS_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 공간에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(main).toContainText('권한 담당자에게 요청하세요');
    // The space gate replaces the page: no registry table and no declaration drawer/dialog content.
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(main.getByText('requiresScope')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The client gate refuses without redirecting: the URL the user typed stays exact.
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_FOCUS_URL);
    await evidence(page, testInfo, 'registry-engineer-space-denied');
  });

  test('viewer도 메뉴가 비노출이고 직접 URL은 공간 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await seedRecent(page, 'viewer', { menuId: 'metric-catalog', url: '/metrics' });
    await page.goto('/metrics');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 레지스트리' })).toHaveCount(0);

    const palette = page.getByRole('dialog');
    for (const needle of NEEDLES) {
      await searchPalette(page, needle);
      await expect(palette.getByRole('option', { name: /메뉴 레지스트리/ })).toHaveCount(0);
      await expect(palette).toContainText('일치하는 메뉴가 없습니다.');
      await page.keyboard.press('Escape');
    }

    const recentList = page.getByRole('region', { name: '최근 방문' });
    await expect(recentList.getByRole('link', { name: '최근 방문: 지표 카탈로그' })).toBeVisible();
    await expect(recentList.getByRole('link', { name: '최근 방문: 메뉴 레지스트리' })).toHaveCount(0);
    await expect(recentList.locator('a[href="/admin/registry"]')).toHaveCount(0);

    await page.goto(DIRECT_FOCUS_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 공간에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(main).toContainText('권한 담당자에게 요청하세요');
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(main.getByText('requiresScope')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_FOCUS_URL);
    await evidence(page, testInfo, 'registry-viewer-space-denied');
  });

  test('관리자: 팔레트 검색으로 메뉴 레지스트리(운영 콘솔)에 도달한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/equipment?v=1&scopeId=MEM');
    // Positive control for the non-exposure checks above: the same search finds the menu for admin.
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await searchPalette(page, '레지스트리');
    const option = page.getByRole('dialog').getByRole('option', { name: /메뉴 레지스트리/ });
    await expect(option).toHaveCount(1);
    await expect(option).toContainText('운영 콘솔');
    await option.click();
    await expect(page.getByRole('main').getByRole('table').first()).toBeVisible({ timeout: 10_000 });
    // The palette navigates through linkTo: the target is the menu's v=1 deep link and keeps the current global scope (§6.1).
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(`${DIRECT_URL}?v=1&scopeId=MEM`);
    await evidence(page, testInfo, 'registry-admin-palette');
  });

  test('관리자: equipment-master 행이 경로·권한을 보여주고 행 동작으로 선언 드로어를 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(DIRECT_URL);
    const row = page.getByRole('main').getByRole('table').first().locator('[data-row-id="equipment-master"]');
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('/equipment');
    await expect(row).toContainText('equipment:view');

    await row.getByRole('button', { name: 'equipment-master 보기' }).click();
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toContainText('requiresScope');
    // The drawer is opened by writing the focus page key (§6.1): the URL carries it.
    expect(page.url()).toContain('focus=equipment-master');
    await evidence(page, testInfo, 'registry-admin-declaration');
  });
});

test.describe('권한/역할 (06 §9.1, §17 — console access directory, read-only)', () => {
  test('engineer는 메뉴가 비노출이고 직접 URL에서 공간 거부를 본다', async ({ page }, testInfo) => {
    const directUrl = '/admin/roles?v=1&focus=admin';
    await signInAs(page, 'engineer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toHaveCount(0);

    await page.goto(directUrl);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 공간에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(main).toContainText('권한 담당자에게 요청하세요');
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(directUrl);
    await evidence(page, testInfo, 'roles-engineer-space-denied');
  });

  test('admin은 세 주체를 조회하고 engineer 사이트 범위 드로어를 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/admin/roles');
    const table = page.getByRole('main').getByRole('table', { name: '권한/역할 목록' });
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.getByRole('row')).toHaveCount(4);
    for (const name of ['Platform Admin', 'Process Engineer', 'Field Requester']) {
      await expect(table.getByRole('row').filter({ hasText: name })).toBeVisible();
    }

    const engineerRow = table.getByRole('row').filter({ hasText: 'Process Engineer' });
    await expect(engineerRow).toContainText('4/9');
    await engineerRow.getByRole('button', { name: 'engineer 보기' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('focus')).toBe('engineer');
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('tab', { name: '사이트 범위' }).click();
    const memScope = drawer.getByRole('listitem').filter({ hasText: 'MEM' });
    await expect(memScope).toContainText('PHOTO, ETCH, CVD');
    const xiaRow = drawer.getByRole('listitem').filter({ hasText: 'XIA' });
    await expect(xiaRow).toContainText('부여 없음');
    // The sortable room-count column is also named "room 부여"; exclude that heading and catch action labels.
    await expect(page.getByRole('button', { name: /^(?!room 부여$).*(?:부여|회수)$/ })).toHaveCount(0);
    await evidence(page, testInfo, 'roles-admin-engineer-site-scope');
  });

  test('드로어 탭 선택이 URL tab에 남고 새로고침 뒤에도 복원된다 (06 §13)', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/admin/roles');
    const table = page.getByRole('main').getByRole('table', { name: '권한/역할 목록' });
    await expect(table).toBeVisible({ timeout: 10_000 });
    await table.getByRole('row').filter({ hasText: 'Process Engineer' }).getByRole('button', { name: 'engineer 보기' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('tab', { name: '사이트 범위' }).click();
    await expect.poll(() => query(page).get('tab')).toBe('sites');
    await page.reload();
    await expect(page.getByRole('dialog').getByRole('tab', { name: '사이트 범위' })).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'roles-drawer-tab-survives-reload');
  });

  test('permission page key는 목록을 필터링하고 잘못된 값은 경고한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/admin/roles?v=1&permission=console:access');
    const table = page.getByRole('main').getByRole('table', { name: '권한/역할 목록' });
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('row').filter({ hasText: 'Platform Admin' })).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Process Engineer' })).toHaveCount(0);
    await expect(table.getByRole('row').filter({ hasText: 'Field Requester' })).toHaveCount(0);
    await evidence(page, testInfo, 'roles-console-access-filter');

    await page.goto('/admin/roles?v=1&permission=bogus');
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toContainText('권한 “bogus”');
    await expect(main.getByRole('table')).toHaveCount(0);
    await evidence(page, testInfo, 'roles-invalid-permission-filter');
  });
});

test.describe('차트 계약 (06 §16 — Brush → 구간 적용 확인, 주석 Scope 격리, manifest features)', () => {
  const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const trend = (page: Page) => page.getByRole('region', { name: '사이클타임 추세' });

  async function applyRoomInQueryBar(page: Page, room: string) {
    const bar = contextBar(page);
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    await bar.getByRole('button', { name: '공정', exact: true }).click();
    await page.getByRole('option', { name: room, exact: true }).click();
    await page.keyboard.press('Escape');
    await bar.getByRole('button', { name: '적용', exact: true }).click();
  }

  async function brush(page: Page) {
    const frame = trend(page);
    await frame.getByRole('button', { name: '구간 선택' }).click();
    const plot = frame.getByRole('img', { name: /^사이클타임 추세/ });
    await expect(plot).toBeVisible();
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect(frame.getByRole('region', { name: '선택 요약' })).toContainText('선택 구간');
  }

  test('Brush는 URL을 바꾸지 않고, 구간 적용은 확인을 거쳐야만 전역 기간을 바꾼다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    await brush(page);
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');

    const frame = trend(page);
    await frame.getByRole('button', { name: '분석 구간 적용…' }).click();
    const confirmRow = frame.getByRole('group', { name: '구간 적용 확인' });
    await expect(confirmRow).toBeVisible();
    // Nothing is applied while the confirmation is open, and cancelling leaves the period alone.
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    await confirmRow.getByRole('button', { name: '취소' }).click();
    await expect(confirmRow).toBeHidden();
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    await evidence(page, testInfo, 'apply-confirm');

    await frame.getByRole('button', { name: '분석 구간 적용…' }).click();
    await frame.getByRole('group', { name: '구간 적용 확인' }).getByRole('button', { name: '적용' }).click();
    await expect.poll(() => query(page).get('from')).not.toBe('2026-09-25T09:00:00');
    expect(query(page).get('from')! < query(page).get('to')!).toBe(true);
    expect(query(page).get('from')).toMatch(/^2026-09-25T\d\d:\d\d:\d\d$/);
  });

  test('선택 요약과 시작·끝 조작은 차트 카드 안에 머문다 (#307)', async ({ page }) => {
    await page.goto(CYCLE);
    const frame = trend(page);
    await expect(frame.getByRole('img', { name: /^사이클타임 추세/ })).toBeVisible();
    await frame.getByRole('button', { name: '1시간', exact: true }).click();
    const summary = frame.getByRole('region', { name: '선택 요약' });
    await expect(summary).toContainText('선택 구간');
    await expect.poll(async () => {
      const [card, inner] = await Promise.all([frame.boundingBox(), summary.boundingBox()]);
      return card !== null && inner !== null && inner.x + inner.width <= card.x + card.width;
    }).toBe(true);
  });

  test('키보드만으로 빠른 구간을 골라 분석 구간을 적용한다 (#307)', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    const frame = trend(page);
    // PERIOD is 24 h of hourly bars, so "1시간" is the last bar, ending at the query end.
    await frame.getByRole('button', { name: '1시간', exact: true }).press('Enter');
    const summary = frame.getByRole('region', { name: '선택 요약' });
    await expect(summary).toContainText('2026-09-26 08:00 – 2026-09-26 09:00');
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');

    await frame.getByRole('button', { name: '분석 구간 적용…' }).press('Enter');
    const confirmRow = frame.getByRole('group', { name: '구간 적용 확인' });
    await expect(confirmRow).toContainText('2026-09-26 08:00:00 → 2026-09-26 09:00:00');
    await evidence(page, testInfo, 'keyboard-preset-confirm');
    await confirmRow.getByRole('button', { name: '적용' }).press('Enter');
    await expect.poll(() => query(page).get('from')).toBe('2026-09-26T08:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
  });

  test('키보드만으로 시작·끝을 골라 선택하고 분석 구간을 적용한다 (#374)', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    const frame = trend(page);
    const plot = frame.getByRole('img', { name: /^사이클타임 추세/ });
    await expect(plot).toBeVisible();

    const start = frame.getByRole('combobox', { name: '구간 시작' });
    const end = frame.getByRole('combobox', { name: '구간 끝' });
    const summary = frame.getByRole('region', { name: '선택 요약' });
    async function tabToControl(accessibleName: string, control: Locator) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await page.keyboard.press('Tab');
        const activeSnapshot = await page.locator(':focus').ariaSnapshot();
        if (activeSnapshot.includes(`"${accessibleName}"`)) {
          await expect(control).toBeFocused();
          return;
        }
      }
      throw new Error(`Tab did not reach ${accessibleName} within 40 steps`);
    }

    // A fill chart (cycle-time is a workspace page, ADR-0067 decision 21) shows the start/end form on demand: open it with the
    // keyboard from `구간 선택`, which puts focus on the start control. Then Tab traversal from an earlier action still reaches it.
    await frame.getByRole('button', { name: '구간 선택', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(start).toBeFocused();
    await frame.getByRole('button', { name: '초기화', exact: true }).focus();
    await tabToControl('구간 시작', start);

    // fallbackRange spans 09:00–09:00 next day; two start steps pick 11:00 and one end step picks 08:00.
    const initialStart = '2026-09-25 09:00';
    const chosenStart = '2026-09-25 11:00';
    const initialEnd = '2026-09-26 09:00';
    const chosenEnd = '2026-09-26 08:00';
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: initialStart, exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: '2026-09-25 10:00', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: chosenStart, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(start).toContainText(chosenStart);
    await expect(start).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(end).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: initialEnd, exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('option', { name: chosenEnd, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(end).toContainText(chosenEnd);
    await expect(end).toBeFocused();

    await expect(summary).toContainText('선택 구간 없음');
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');

    const choose = frame.getByRole('button', { name: '선택', exact: true });
    await page.keyboard.press('Tab');
    await expect(choose).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(summary).toContainText(`선택 구간: ${chosenStart} – ${chosenEnd}`);
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');

    const applyRange = frame.getByRole('button', { name: '분석 구간 적용…' });
    await page.keyboard.press('Tab');
    await expect(applyRange).toBeFocused();
    await page.keyboard.press('Enter');
    const confirmRow = frame.getByRole('group', { name: '구간 적용 확인' });
    await expect(confirmRow).toContainText(`${chosenStart}:00 → ${chosenEnd}:00`);
    await evidence(page, testInfo, 'keyboard-start-end-confirm');
    await confirmRow.getByRole('button', { name: '적용', exact: true }).press('Enter');
    await expect.poll(() => query(page).get('from')).toBe('2026-09-25T11:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T08:00:00');
  });

  test('주석은 사이트(Scope)별로 저장되어 다른 사이트에는 보이지 않고, 돌아오면 다시 보인다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await brush(page);
    const frame = trend(page);
    await frame.getByRole('button', { name: '주석' }).click();
    await frame.getByRole('textbox', { name: '주석 내용' }).fill('MEM 전용 PM 작업');
    await frame.getByRole('button', { name: '저장' }).click();
    const note = frame.getByText(/MEM 전용 PM 작업/);
    await expect(note).toBeVisible();
    await evidence(page, testInfo, 'annotation-mem');

    await switchScope(page, 'FDRY');
    await expectScopeValid(page, 'FDRY · 파운드리');
    // Apply mode (ADR-0061): the Scope switch clears the required room; pick it again in the query bar and apply
    // in-app (a reload would reset the in-browser mock and lose the annotation).
    await applyRoomInQueryBar(page, 'PHOTO');
    await expect(trend(page).getByRole('button', { name: '구간 선택' })).toBeVisible();
    await expect(trend(page).getByText(/MEM 전용 PM 작업/)).toHaveCount(0);
    await evidence(page, testInfo, 'annotation-fdry-isolated');

    await switchScope(page, 'MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    await applyRoomInQueryBar(page, 'PHOTO');
    await expect(trend(page).getByText(/MEM 전용 PM 작업/)).toBeVisible();
  });

  test('주석 삭제를 키보드로 확정하면 포커스가 남은 주석의 삭제 버튼으로 옮겨진다 (06 §26)', async ({ page }) => {
    const tag = `삭제포커스${Date.now()}`;
    await page.goto(CYCLE);
    const frame = trend(page);
    await brush(page);
    for (const suffix of ['가', '나']) {
      const annotate = frame.getByRole('button', { name: '주석', exact: true });
      if (await annotate.isDisabled()) await brush(page);
      await annotate.click();
      await frame.getByRole('textbox', { name: '주석 내용' }).fill(`${tag}-${suffix}`);
      await frame.getByRole('button', { name: '저장' }).click();
      await expect(frame.getByText(`${tag}-${suffix}`)).toBeVisible();
    }
    const mine = frame.getByRole('button', { name: new RegExp(`^삭제: ${tag}-`) });
    await expect(mine).toHaveCount(2);
    const firstName = (await mine.first().getAttribute('aria-label'))!;
    const secondName = (await mine.nth(1).getAttribute('aria-label'))!;

    const first = frame.getByRole('button', { name: firstName, exact: true });
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    const confirmRow = frame.getByRole('group', { name: `삭제 확인: ${firstName.replace('삭제: ', '')}` });
    const confirm = confirmRow.getByRole('button', { name: '삭제 확정' });
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(frame.getByRole('button', { name: firstName, exact: true })).toHaveCount(0);
    // Chromium blurs the removed button; focus must still land on the remaining note, not body.
    await expect(frame.getByRole('button', { name: secondName, exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(secondName);
  });

  test('차트 동작은 메뉴 manifest features를 따른다: 사이클타임은 비교·주석·내보내기, 생산성 개요는 내보내기만', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    const frame = trend(page);
    for (const name of ['비교', '주석', '내보내기']) await expect(frame.getByRole('button', { name })).toBeVisible();

    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    const charts = page.getByRole('region').filter({ has: page.getByRole('toolbar', { name: '차트 동작' }) });
    await expect(charts.first().getByRole('button', { name: '구간 선택' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: '차트 동작' }).first().getByRole('button', { name: '내보내기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '주석' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '비교' })).toHaveCount(0);
    await evidence(page, testInfo, 'features-productivity');
  });
});

// 사이클타임은 3b에서 PanelWorkspace로 옮겨 갔다. 차트 2개가 한 행에 서는 정렬 검사는 AnalysisLayout 소비자(차트 2개 이상)가 없어
// 내렸다(.planning/backlog.md). 접기·칩·기억·포커스는 남은 소비자인 OperationTime으로 검사한다.
test.describe('분석 레이아웃 접기 (06 §12.6, ADR-0022)', () => {
  test('접힌 차트·분해 영역을 기억하여 칩으로 복원하고 포커스를 옮긴다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clas/operation-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    const ranking = page.getByRole('region', { name: '설비별 동작시간', exact: true });
    await expect(ranking).toBeVisible();
    const collapsed = page.getByRole('group', { name: '접힌 항목' });
    await expect(collapsed).toHaveCount(0);

    await page.getByRole('button', { name: '설비별 동작시간 접기' }).click();
    const rankingChip = collapsed.getByRole('button', { name: '설비별 동작시간 펼치기' });
    await expect(rankingChip).toBeVisible();
    await expect(rankingChip).toBeFocused();
    await expect(ranking).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-ranking-collapsed');
    await page.reload();
    await expect(rankingChip).toBeVisible();
    await expect(ranking).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-collapse-persisted');

    await rankingChip.click();
    await expect(page.getByRole('button', { name: '설비별 동작시간 접기' })).toBeFocused();
    await expect(ranking).toBeVisible();
    await expect(collapsed).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-ranking-restored');

    // The breakdown's title carries the equipment id, so match its fixed tail.
    await page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ }).click();
    const flowChip = collapsed.getByRole('button', { name: /모듈별 동작 흐름 펼치기$/ });
    await expect(flowChip).toBeFocused();
    await expect(page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ })).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-breakdown-collapsed');
    await flowChip.click();
    await expect(page.getByRole('button', { name: /모듈별 동작 흐름 접기$/ })).toBeFocused();
    await expect(collapsed).toHaveCount(0);
    await evidence(page, testInfo, 'analysis-breakdown-restored');
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
    // The preference is written 300 ms after the change.
    await page.waitForTimeout(600);
    const stored = () => page.evaluate(() => Object.entries(localStorage)
      .filter(([key]) => /^platform:workspace:v1:.+:cycle-time:drilldown$/.test(key)).map(([, value]) => JSON.parse(value) as { preset: string; hidden: string[] }));
    expect(await stored()).toMatchObject([{ preset: 'focus', hidden: ['distribution'] }]);

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

test.describe('드릴다운 (06 §6.4, §12.7, §22, ADR-0025)', () => {
  const STEP = `${PRODUCTIVITY}&drillRoom=PHOTO&drillStgroup=STG-PHOTO-A&drillEquipment=MEM-PHOTO-0103`;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('단계마다 기록 하나 — Back 한 번에 한 단계', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await expectScopeValid(page, 'MEM · 메모리');
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'PHOTO 들어가기' }).click();
    await expect.poll(() => query(page).get('drillRoom')).toBe('PHOTO');
    expect(query(page).has('drillStgroup')).toBe(false);
    await page.goBack();
    await expect.poll(() => query(page).has('drillRoom')).toBe(false);

    await page.getByRole('button', { name: 'PHOTO 들어가기' }).click();
    await page.getByRole('button', { name: 'STG-PHOTO-A 들어가기' }).click();
    await expect.poll(() => query(page).get('drillStgroup')).toBe('STG-PHOTO-A');
    await page.goBack();
    await expect.poll(() => query(page).has('drillStgroup')).toBe(false);
    expect(query(page).get('drillRoom')).toBe('PHOTO');

    await page.getByRole('button', { name: 'STG-PHOTO-A 들어가기' }).click();
    await page.getByRole('button', { name: 'MEM-PHOTO-0103 들어가기' }).click();
    await expect.poll(() => query(page).get('drillEquipment')).toBe('MEM-PHOTO-0103');
    await evidence(page, testInfo, 'drill-step-3');
    await page.goBack();
    await expect.poll(() => query(page).has('drillEquipment')).toBe(false);
    expect(query(page).get('drillStgroup')).toBe('STG-PHOTO-A');
    expect(query(page).get('drillRoom')).toBe('PHOTO');
  });

  test('경로 칩으로 올라가면 뒤 단계 키가 URL에서 사라진다', async ({ page }, testInfo) => {
    await page.goto(STEP);
    await expectScopeValid(page, 'MEM · 메모리');
    await page.getByRole('button', { name: '공정: PHOTO', exact: true }).click();
    await expect.poll(() => query(page).get('drillRoom')).toBe('PHOTO');
    expect(query(page).has('drillStgroup')).toBe(false);
    expect(query(page).has('drillEquipment')).toBe(false);
    await page.getByRole('button', { name: '전체', exact: true }).click();
    await expect.poll(() => query(page).has('drillRoom')).toBe(false);
    expect(query(page).has('drillStgroup')).toBe(false);
    expect(query(page).has('drillEquipment')).toBe(false);
    await evidence(page, testInfo, 'drill-path-up');
  });

  test('전역 Context 기간 변경이 단계 키를 지우고 Back이 복원한다', async ({ page }, testInfo) => {
    const origin = `${PRODUCTIVITY}&drillRoom=PHOTO&drillStgroup=STG-PHOTO-A`;
    await page.goto(origin);
    await expect(page.getByRole('navigation', { name: '드릴 경로' })).toBeVisible();
    expect(query(page).get('drillRoom')).toBe('PHOTO');
    const preset = await periodPreset(page, '7일');
    await preset.locator.click();
    await preset.close();
    await expect.poll(() => query(page).has('drillRoom')).toBe(false);
    expect(query(page).has('drillStgroup')).toBe(false);
    await evidence(page, testInfo, 'drill-context-cleared');
    await page.goBack();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(origin);
    expect(query(page).get('drillStgroup')).toBe('STG-PHOTO-A');
  });

  test('앞 단계 없이 drillStgroup만 있는 URL은 형식 오류이고 값을 바꾸지 않는다', async ({ page }, testInfo) => {
    const broken = `${PRODUCTIVITY}&drillStgroup=STG-PHOTO-A`;
    await page.goto(broken);
    const alert = page.getByRole('alert');
    // ADR-0034: the step's user name and the quoted raw value, never `key=value`.
    await expect(alert).toContainText('StGroup “STG-PHOTO-A”는 앞 단계 없이 쓸 수 없습니다.');
    await expect(alert).not.toContainText('drillStgroup=');
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(broken);
    expect(query(page).has('drillRoom')).toBe(false);
    await expect(page.getByRole('region', { name: '네 지표 요약' })).toHaveCount(0);
    await evidence(page, testInfo, 'drill-invalid');
  });

  test('3단계에서 설비 상세로 갔다가 단계 키와 상세 슬롯이 복원된다', async ({ page }, testInfo) => {
    await page.goto(STEP);
    await expectScopeValid(page, 'MEM · 메모리');
    await page.getByRole('link', { name: '설비 상세로' }).click();
    await expect(page).toHaveURL(/\/equipment\/MEM-PHOTO-0103/);
    const back = (await headerMore(page)).getByRole('link', { name: '← 생산성 개요 (PHOTO › STG-PHOTO-A › MEM-PHOTO-0103)' });
    await expect(back).toBeVisible();
    await evidence(page, testInfo, 'drill-equipment-return');
    await back.click();
    await expect.poll(() => query(page).get('drillRoom')).toBe('PHOTO');
    expect(query(page).get('drillStgroup')).toBe('STG-PHOTO-A');
    expect(query(page).get('drillEquipment')).toBe('MEM-PHOTO-0103');
    await expect(page.getByRole('dialog')).toContainText('MEM-PHOTO-0103');
    await evidence(page, testInfo, 'drill-slot-restored');
  });

  test('결과에 없는 설비로 직접 들어오면 URL을 유지하고 공통 상태가 본문과 상세 슬롯을 가린다', async ({ page }, testInfo) => {
    const missing = `${PRODUCTIVITY}&drillRoom=PHOTO&drillStgroup=STG-PHOTO-A&drillEquipment=NO-SUCH`;
    await page.goto(missing);
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(page.getByRole('status').filter({ hasText: '이 조건에서 없는 값: NO-SUCH' })).toBeVisible();
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(missing);
    await expect(page.getByRole('table', { name: '설비 점유' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'EquipmentID' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await evidence(page, testInfo, 'drill-equipment-missing');
  });
});


test.describe('메뉴 이동 포커스 (06 §26)', () => {
  test('팔레트와 사이드바 키보드 이동 뒤 새 화면 제목에 포커스가 남는다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(mainHeading(page)).toHaveText('설비 마스터');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: '메뉴 검색' }).fill('생산성');
    // Space labels also match the query; select the intended menu through the keyboard.
    const targetIndex = (await page.getByRole('option').allTextContents()).findIndex(label => label.includes('생산성 개요'));
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    for (let index = 0; index < targetIndex; index++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(mainHeading(page)).toBeFocused();
    await evidence(page, testInfo, 'palette-menu-heading-focus');
    // Rail section button, by keyboard: the new title takes the focus.
    await railSection(page, '설비관리').focus();
    await page.keyboard.press('Enter');
    await expect(mainHeading(page)).toHaveText('설비 마스터');
    await expect(mainHeading(page)).toBeFocused();
    await evidence(page, testInfo, 'rail-section-heading-focus');
    // System switcher, by keyboard: open focuses the current card, Tab stays inside, a real choice closes it and the title takes the focus.
    await systemSwitcher(page).focus();
    await page.keyboard.press('Enter');
    const popover = page.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
    await expect(popover.getByRole('button', { name: /^MARS/ })).toBeFocused();
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab');
      await expect(popover.locator(':focus')).toHaveCount(1);
    }
    await popover.getByRole('button', { name: /^BRAVO/ }).focus();
    await page.keyboard.press('Enter');
    await expect(popover).toHaveCount(0);
    await expect(mainHeading(page)).toHaveText('지표 카탈로그');
    await expect(mainHeading(page)).toBeFocused();
    await evidence(page, testInfo, 'switcher-menu-heading-focus');
  });
});

test.describe('키보드 상세 포커스 복귀 (06 §13·§26)', () => {
  test('권한 목록에서 키보드로 상세를 닫으면 같은 행의 보기로 돌아온다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/admin/roles?v=1');
    try {
      const opener = page.getByRole('row').filter({ has: page.getByRole('button', { name: /보기$/ }) }).first().getByRole('button', { name: /보기$/ });
      await expect(opener).toBeVisible();
      // Reach the action through the keyboard, then activate it without a pointer click.
      for (let attempt = 0; attempt < 100 && !(await opener.evaluate(node => node === document.activeElement)); attempt++) await page.keyboard.press('Tab');
      await expect(opener).toBeFocused();
      await opener.evaluate(node => node.setAttribute('data-focus-return-opener', 'true'));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '상세 닫기' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(url => !url.searchParams.has('focus'));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const sameOpener = page.locator('[data-focus-return-opener]');
      await expect(sameOpener).toHaveCount(1);
      expect(await sameOpener.evaluate(node => node.isConnected)).toBe(true);
      await expect(sameOpener).toBeFocused();
      await evidence(page, testInfo, 'roles-keyboard-focus-return');
    } catch (error) {
      const focusState = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          activeElement: active ? { tag: active.tagName, id: active.id, role: active.getAttribute('role'), label: active.getAttribute('aria-label'), text: active.textContent?.slice(0, 200), connected: active.isConnected } : null,
          hasFocus: document.hasFocus(),
          url: location.href,
          focusKey: new URLSearchParams(location.search).get('focus'),
          detailSlots: Array.from(document.querySelectorAll('aside[aria-label]')).map(slot => ({ label: slot.getAttribute('aria-label'), open: slot.getAttribute('data-open'), hidden: slot.hasAttribute('hidden'), dialogs: slot.querySelectorAll('[role="dialog"]').length })),
          marker: Array.from(document.querySelectorAll('[data-focus-return-opener]')).map(node => ({ connected: node.isConnected, focused: node === active })),
        };
      });
      await testInfo.attach('roles-keyboard-focus-state', { body: JSON.stringify(focusState, null, 2), contentType: 'application/json' });
      throw error;
    }
  });

  // #312: a closing overlay kept mounted by its exit motion stayed the topmost Radix layer and took the next Escape.
  const closeOverlay: Record<string, (page: Page) => Promise<void>> = {
    '툴팁이': async page => {
      await page.getByRole('heading', { level: 1 }).focus();
      await expect(page.getByRole('tooltip')).toHaveCount(1);
    },
    '팝오버가': async page => {
      const trigger = page.getByRole('button', { name: /컬럼|열 설정/ }).first();
      await trigger.click();
      await expect(page.locator('[data-radix-popper-content-wrapper]').first()).toBeVisible();
      await trigger.click();
    },
    '대화상자가': async page => {
      await page.getByRole('button', { name: '메뉴 검색…' }).click();
      await expect(page.getByRole('combobox')).toBeFocused();
      await page.getByRole('button', { name: '닫기' }).click();
    },
  };
  for (const [overlay, close] of Object.entries(closeOverlay)) {
    test(`${overlay} 닫힌 직후의 Escape도 상세를 닫는다`, async ({ page }) => {
      await signInAs(page, 'admin');
      await page.goto('/admin/roles?v=1');
      const opener = page.getByRole('row').filter({ has: page.getByRole('button', { name: /보기$/ }) }).first().getByRole('button', { name: /보기$/ });
      await expect(opener).toBeVisible();
      await close(page);
      // Radix hands focus back to the closed overlay's trigger in a deferred task (FocusScope unmount, setTimeout 0).
      // Let that task run first; under load it otherwise lands after opener.focus() and Enter reopens the overlay.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      await opener.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '상세 닫기' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(url => !url.searchParams.has('focus'), { timeout: 2000 });
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }
});

test.describe('지표 목록→상세 복귀 (06 §22)', () => {
  test('검색·정렬 복원과 진입 방식별 상세 머리 복귀 링크', async ({ page }, testInfo) => {
    await page.goto('/metrics?v=1&q=time&sort=nameSort:asc');
    await page.getByRole('table', { name: '지표 카탈로그', exact: true }).getByRole('link', { name: 'cycle_time', exact: true }).click();
    await expect(page).toHaveURL(/\/metrics\/cycle_time\?/);
    const header = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await header.getByRole('button', { name: '이 버전을 분석 Context로 사용', exact: true }).click();
    await expect.poll(() => query(page).get('metricId')).toBe('cycle_time');
    await evidence(page, testInfo, 'metric-detail-return');
    const menu = await headerMore(page);
    const back = menu.getByRole('link', { name: '← 지표 카탈로그', exact: true });
    await expect(back).toHaveCount(1);
    await expect(menu.getByRole('link', { name: '카탈로그', exact: true })).toHaveCount(0);
    await back.click();
    await expect.poll(() => query(page).get('q')).toBe('time');
    expect(query(page).get('sort')).toBe('nameSort:asc');
    expect(query(page).has('metricId')).toBe(false);
    expect(query(page).has('metricVersion')).toBe(false);
    await expect(page.getByText('출발 화면의 Context로 돌아왔습니다. 상세에서 바꾼 항목을 되돌렸습니다: 지표·버전', { exact: true })).toBeVisible();

    await page.goto('/metrics/cycle_time?v=1&version=3');
    const direct = await headerMore(page);
    await expect(direct.getByRole('link', { name: '카탈로그', exact: true })).toHaveCount(1);
    await expect(direct.getByRole('link', { name: '← 지표 카탈로그', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'metric-detail-direct');
  });

  test('Context 적용 없이 복귀하면 되돌림 알림이 없다', async ({ page }, testInfo) => {
    await page.goto('/metrics?v=1&q=time&sort=nameSort:asc');
    await page.getByRole('table', { name: '지표 카탈로그', exact: true }).getByRole('link', { name: 'cycle_time', exact: true }).click();
    await (await headerMore(page)).getByRole('link', { name: '← 지표 카탈로그', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: '지표 카탈로그', exact: true })).toBeVisible();
    expect(query(page).get('q')).toBe('time');
    expect(query(page).get('sort')).toBe('nameSort:asc');
    await expect(page.getByText(/출발 화면의 Context로 돌아왔습니다/)).toHaveCount(0);
    await evidence(page, testInfo, 'metric-return-unchanged-context');
  });

  test('viewer에게 열 수 없는 복귀 메뉴 이름을 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/metrics/cycle_time?v=1&version=4&returnTo=%2Fadmin%2Froles%3Fv%3D1');
    const main = page.getByRole('main');
    await expect((await headerMore(page)).getByRole('link', { name: '← 지표 카탈로그', exact: true })).toHaveAttribute('href', '/metrics?v=1');
    await expect(main.getByText('권한/역할 관리', { exact: false })).toHaveCount(0);
    await evidence(page, testInfo, 'metric-return-denied-origin');
  });

  // #325-2: the tab=history deep link lands with the section heading below the sticky page header, not under it.
  // The arrival scroll runs only after pair·definition answered, and the mock delays every request randomly —
  // so the test waits for the gate's rendered evidence first (success banner + definition content), then
  // re-measures heading and offset until the landing holds. No single early read, no fixed sleep: the poll
  // retried until it passes is what survives the randomized latency (W-s9 F2).
  test('tab=history 딥링크는 변경 이력 헤딩을 sticky 머리 아래에 내려앉는다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const landingBelowStickyHeader = (heading: Locator) => expect(async () => {
      // PlatformPage measures the sticky header (breadcrumb/title row + Context bar) into this custom property.
      const offset = Number.parseFloat(await page.evaluate(
        () => getComputedStyle(document.querySelector('[data-platform-page]')!).getPropertyValue('--page-sticky-offset'),
      )) || 0;
      // Fresh navigation starts the scroll container (shell `#platform-main`) at 0; only the arrival
      // scrollIntoView moves it. Requiring scrollTop > 0 means the judged frame is after the scroll ran,
      // never a pre-scroll snapshot of the not-yet-grown page.
      const scrolled = await page.evaluate(() => (document.getElementById('platform-main') as HTMLElement | null)?.scrollTop ?? 0);
      const box = await heading.boundingBox();
      expect(box, '도착한 헤딩이 사각형을 가진다').not.toBeNull();
      expect(scrolled).toBeGreaterThan(0);
      expect(box!.y).toBeGreaterThanOrEqual(offset);
      expect(box!.y).toBeLessThan(900);
    }).toPass();
    // The pair verdict (success reply, not an error state) and the definition answer render only after both
    // queries above every anchor have answered — the same gate the arrival scroll waits on.
    const gateEvidenceVisible = () => {
      const banner = expect(page.getByText('전역 지표 쌍 없음', { exact: true })).toBeVisible();
      const definition = expect(page.getByText('버전을 고르기 전에는 정의를 보여 주지 않습니다.', { exact: true })).toBeVisible();
      return Promise.all([banner, definition]);
    };

    await page.goto('/metrics/cycle_time?v=1&tab=history');
    const historyHeading = page.getByRole('heading', { name: '변경 이력', level: 2 });
    await expect(historyHeading).toBeVisible();
    // The history query answered: the AuditTimeline rendered its list (no compact skeleton above the scroll).
    const historyPanel = page.locator('section').filter({ has: page.locator('#metric-section-history') });
    await expect(historyPanel.locator('ol')).toBeVisible();
    await gateEvidenceVisible();
    await landingBelowStickyHeader(historyHeading);
    await evidence(page, testInfo, 'metric-history-anchor-below-sticky-header');

    // U1: the version-less tab=definition arrival obeys the same landing contract — the anchor id sits on
    // the Panel h2, so the heading itself (not the placeholder sentence under it) clears the sticky header.
    await page.goto('/metrics/cycle_time?v=1&tab=definition');
    const definitionHeading = page.getByRole('heading', { name: '정의', exact: true, level: 2 });
    await expect(definitionHeading).toBeVisible();
    await gateEvidenceVisible();
    await landingBelowStickyHeader(definitionHeading);
    await evidence(page, testInfo, 'metric-definition-anchor-below-sticky-header');
  });
});


test.describe('표 쪽 이동 포커스 (06 §26)', () => {
  test('범위 밖 page 딥링크는 마지막 쪽으로 맞추고 히스토리를 늘리지 않는다 (06 §15, #314)', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/equipment?v=1&scopeId=MEM&sort=status:desc&page=9');
    await expect.poll(() => query(page).get('page')).toBe('3');
    expect(query(page).get('sort')).toBe('status:desc');
    await expect(tableStatusLine(page)).toContainText('54건 · 3/3 페이지');
    await expect(page.getByRole('main').locator('[data-row-id]').first()).toBeVisible();
    await evidence(page, testInfo, 'table-page-clamped');
    // replace, not push: one Back leaves the app instead of returning to page=9.
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('마지막 쪽과 첫 쪽에 도달하면 반대쪽 버튼으로 포커스를 옮긴다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/equipment?v=1&scopeId=MEM');
    await expect(page.getByText(/1\/2 페이지/)).toBeVisible();
    const next = page.getByRole('button', { name: '다음', exact: true });
    const previous = page.getByRole('button', { name: '이전', exact: true });
    await expect(next).not.toHaveAttribute('aria-disabled');
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/2\/2 페이지/)).toBeVisible();
    await expect(previous).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/1\/2 페이지/)).toBeVisible();
    await expect(next).toBeFocused();
    await evidence(page, testInfo, 'pager-focus-return');
  });
});

test.describe('표 높이·고정 동작 열 (06 §15, ADR-0037)', () => {
  test('짧은 VOC 결과는 240px보다 작고 행 영역에 빈 스크롤이 없다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/voc?v=1');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    // E2E sets VITE_FEEDBACKOPS_ORIGIN (#251), so the VOC row action is a link, not the disabled button.
    await expect(rows.getByRole('link', { name: /보기$/ }).first()).toBeVisible();
    await expect.poll(() => rows.evaluate(el => el.clientHeight)).toBeGreaterThan(0);
    await expect.poll(() => rows.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(240);
    await expect.poll(() => rows.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
    await evidence(page, testInfo, 'voc-content-height');
  });

  test('긴 설비 결과는 안쪽에서 스크롤하고 쪽 넘김은 화면 안에 있다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/equipment?v=1&scopeId=MEM');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await expect(rows.getByRole('button', { name: /보기$/ }).first()).toBeVisible();
    await expect.poll(() => rows.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    const next = page.getByRole('button', { name: '다음', exact: true });
    await expect.poll(() => next.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    })).toBe(true);
    await evidence(page, testInfo, 'equipment-cap-pager');
  });

  test('1280px에서 상세를 열어도 본문은 넘치지 않고 건수는 한 줄이다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/equipment?v=1&scopeId=MEM');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    await rows.getByRole('button', { name: /보기$/ }).first().click();
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('#platform-main').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const count = page.getByText(/^\d+건 · \d+\/\d+ 페이지$/);
    await expect(count).toBeVisible();
    await expect.poll(() => count.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map(box => box.top)).size;
    })).toBe(1);
    await evidence(page, testInfo, 'equipment-detail-1280');
  });

  test('감사 표는 선택 열 없이 양쪽 스크롤 끝에서도 첫 상세 링크가 보인다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, 'admin');
    await page.goto('/admin/audit?v=1');
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    const table = rows.getByRole('table');
    const detail = table.getByRole('row').filter({ has: page.getByRole('link', { name: /상세$/ }) }).first().getByRole('link', { name: /상세$/ });
    await expect(detail).toBeVisible();
    await expect(table.getByRole('checkbox')).toHaveCount(0);
    await expect.poll(() => rows.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    for (const end of ['right', 'left'] as const) {
      await rows.evaluate((el, side) => { el.scrollLeft = side === 'right' ? el.scrollWidth : 0; }, end);
      await expect.poll(() => rows.evaluate((el, side) => side === 'right'
        ? Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) <= 1 : el.scrollLeft === 0, end)).toBe(true);
      await expect.poll(() => detail.evaluate(el => {
        const viewport = el.closest('[aria-label="스크롤 가능한 행 영역"]');
        if (!viewport) return false;
        const frame = viewport.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const left = frame.left + viewport.clientLeft, top = frame.top + viewport.clientTop;
        return box.left >= left && box.right <= left + viewport.clientWidth && box.top >= top && box.bottom <= top + viewport.clientHeight;
      })).toBe(true);
      await evidence(page, testInfo, `audit-action-${end}`);
    }
  });

  // #399 AC-3: at 1024 with the expanded sidebar and the docked detail panel the scrollport is ~226px, so the full 128px
  // action column cannot stay pinned; the compact 72px icon form stays pinned and still opens the row's drawer.
  test('1024px 펼친 사이드바·상세 패널에서 동작 열은 72px 아이콘으로 고정되고 눌린다 (#399)', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await signInAs(page, 'admin');
    await page.addInitScript(() => localStorage.setItem('platform:sidebar-collapsed', '0'));
    await page.goto('/admin/roles?v=1');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    const firstOpen = rows.getByRole('button', { name: / 보기$/ }).first();
    await expect(firstOpen).toBeVisible();
    const id = (await firstOpen.getAttribute('aria-label'))!.replace(/ 보기$/, '');
    await page.goto(`/admin/roles?v=1&focus=${encodeURIComponent(id)}`);
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toBeVisible();
    const open = rows.getByRole('button', { name: `${id} 보기`, exact: true });
    await expect(open).toBeVisible();
    const cell = open.locator('xpath=ancestor::*[@role="cell"][1]');
    await expect.poll(() => cell.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
    await expect.poll(() => cell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeGreaterThanOrEqual(71);
    await expect.poll(() => cell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeLessThanOrEqual(73);
    await evidence(page, testInfo, 'roles-compact-action-1024');
    // Keep the dock open: the table stays compact. Activating another row's compact action switches the drawer to that row.
    const other = rows.getByRole('button', { name: / 보기$/ }).nth(1); // row A (`id`) is the first row
    await expect(other).toBeVisible();
    const otherName = (await other.getAttribute('aria-label'))!;
    const otherId = otherName.replace(/ 보기$/, '');
    const otherCell = other.locator('xpath=ancestor::*[@role="cell"][1]');
    expect(Math.round(await otherCell.evaluate(el => el.getBoundingClientRect().width))).toBeLessThanOrEqual(73);
    await other.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`focus=${encodeURIComponent(otherId)}`));
    // Escape closes the dock; the table widens and the same action node, now in its full text form, keeps the focus.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '상세 닫기', exact: true })).toHaveCount(0);
    await expect.poll(() => otherCell.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeGreaterThanOrEqual(127);
    const restored = rows.getByRole('button', { name: otherName, exact: true });
    await expect(restored).toHaveText('보기');
    await expect(restored).toBeFocused();
  });
});

test.describe('FeedbackOps 공간별 진입(#251)', () => {
  test('admin의 MARS·BRAVO 사이드바 블록은 그 공간의 managedSystem만 담은 새 탭 링크 넷이고, 운영 콘솔에는 블록이 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analytics = await managedSystemOf(page, 'MARS');
    await page.goto('/metrics');
    const metrics = await managedSystemOf(page, 'BRAVO');
    expect(metrics).not.toBe(analytics);
    await evidence(page, testInfo, 'feedbackops-space-links');
    await page.goto('/admin/roles?v=1');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
  });

  test('사용자 메뉴의 FeedbackOps 전체 링크는 admin에게 보이고 /home을 새 탭으로 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    await expect(page.getByRole('navigation', { name: '앱 레일' }).getByRole('link', { name: /FeedbackOps 전체/ })).toHaveCount(0);
    const overall = await feedbackOpsOverallLink(page);
    await expect(overall).toHaveAttribute('href', `${ORIGIN}/home`);
    await expect(overall).toHaveAttribute('target', '_blank');
    await expect(overall).toHaveAttribute('rel', /noopener/);
    await expect(overall).toHaveAttribute('rel', /noreferrer/);
    await evidence(page, testInfo, 'feedbackops-overall-admin');
  });

  for (const role of ['engineer', 'viewer'] as const) {
    test(`사용자 메뉴의 FeedbackOps 전체 링크는 ${role}에게 보이지 않는다`, async ({ page }) => {
      await signInAs(page, role);
      await page.goto('/metrics');
      await expect(page.getByRole('navigation', { name: '앱 레일' })).toBeVisible();
      await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
      await page.keyboard.press('Escape');
    });
  }
});

test.describe('FeedbackOps 진입 링크 회귀(#451, 06 §22)', () => {
  test('Context 변경·화면 이동 뒤 platformReturn은 현재 URL을 가리킨다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analyticsSystem = await managedSystemOf(page, 'MARS');
    const initialUrl = page.url();

    await switchScope(page, 'FDRY');
    await expect.poll(() => query(page).get('scopeId')).toBe('FDRY');
    expect(page.url()).not.toBe(initialUrl);
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);

    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await nav.getByRole('link', { name: '사이클타임 상세' }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    expect(new URL(page.url()).pathname).not.toBe('/analytics/productivity');
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);
    await evidence(page, testInfo, 'feedbackops-return-current-url');
  });

  test('내 VOC 커서 페이지에서도 FeedbackOps 복귀 URL을 갱신한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/voc?v=1');
    await expect(mainHeading(page)).toBeVisible();

    const create = page.getByRole('link', { name: 'VOC 등록' });
    const rows = page.getByLabel('스크롤 가능한 행 영역', { exact: true });
    const firstRowLink = rows.getByRole('link', { name: /FeedbackOps에서 보기$/ }).first();
    await expect(create).toBeVisible();
    await expect(firstRowLink).toBeVisible();
    const initialReturn = page.url();
    const initialRowUrl = await expectMyVocLinks(page, initialReturn);

    await page.getByRole('button', { name: '더 보기', exact: true }).click();
    await expect.poll(() => query(page).get('cursor')).toBe('mock:engineer:2');
    await expect.poll(async () => (await linkUrl(firstRowLink)).searchParams.get('selected'))
      .not.toBe(initialRowUrl.searchParams.get('selected'));
    const cursorReturn = page.url();
    await expectMyVocLinks(page, cursorReturn);
    await evidence(page, testInfo, 'feedbackops-return-voc-cursor');
  });

  test('새로고침·Back·Forward 뒤에도 공간 링크는 현재 URL과 managedSystem을 유지한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analyticsSystem = await managedSystemOf(page, 'MARS');

    await page.goto('/metrics');
    const metricsSystem = await managedSystemOf(page, 'BRAVO');
    await page.reload();
    expect(await managedSystemOf(page, 'BRAVO')).toBe(metricsSystem);

    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/analytics/productivity');
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);

    await page.goForward();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/metrics');
    expect(await managedSystemOf(page, 'BRAVO')).toBe(metricsSystem);
    await evidence(page, testInfo, 'feedbackops-return-history-forward');
  });

  test('지원하지 않는 전역 필터는 FeedbackOps 링크의 최상위 키에 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    const urls = [
      PRODUCTIVITY,
      `/equipment?v=1&scopeId=MEM&${PERIOD}&selectedEquipmentIds=MEM-PHOTO-0103`,
    ];
    for (const url of urls) {
      await page.goto(url);
      if (url === PRODUCTIVITY) {
        expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
        expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
        expect(query(page).get('scopeId')).toBe('MEM');
        expect(query(page).get('roomNames')).toBe('PHOTO');
      } else {
        expect(query(page).get('selectedEquipmentIds')).toBe('MEM-PHOTO-0103');
      }
      await managedSystemOf(page, 'MARS');
      const links = await page.getByRole('navigation', { name: 'FeedbackOps · MARS' }).getByRole('link').all();
      const destinations: string[] = [];
      for (const link of links) {
        const href = await linkUrl(link);
        if (href.pathname === '/vocs' && href.searchParams.get('action') === 'create') {
          expectExactQueryKeys(href, ['action', 'managedSystem', 'platformReturn']);
          destinations.push('vocs:create');
        } else if (href.pathname === '/vocs' && href.searchParams.get('view') === 'inbox') {
          expectExactQueryKeys(href, ['view', 'managedSystem', 'platformReturn']);
          destinations.push('vocs:inbox');
        } else if (href.pathname === '/tasks') {
          expectExactQueryKeys(href, ['managedSystem', 'platformReturn']);
          destinations.push('tasks');
        } else if (href.pathname === '/surveys') {
          expectExactQueryKeys(href, ['managedSystem', 'platformReturn']);
          destinations.push('surveys');
        } else {
          throw new Error(`Unexpected FeedbackOps destination: ${href.pathname}`);
        }
      }
      expect(destinations.sort()).toEqual(['surveys', 'tasks', 'vocs:create', 'vocs:inbox']);
    }

    await page.goto('/voc?v=1');
    await expect(mainHeading(page)).toBeVisible();
    await expectMyVocLinks(page, page.url());
    await evidence(page, testInfo, 'feedbackops-query-keys');
  });

  test('거부·미등록 경로에는 공간 블록이 없고 viewer의 BRAVO에는 있다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    // Menu denial inside a mapped space draws no block.
    await page.goto(PRODUCTIVITY);
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    // Space denial draws no block either.
    await page.goto('/admin/roles?v=1');
    await expect(page.getByRole('status').filter({ hasText: '이 공간에 들어갈 수 없습니다' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    await page.goto('/nope-451');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    await page.goto('/metrics');
    expect(await managedSystemOf(page, 'BRAVO')).toMatch(UUID);
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(1);
    await evidence(page, testInfo, 'feedbackops-block-viewer');
  });

  // One test per role: each gets a fresh page, so exactly one `signInAs` init script writes the role.
  async function expectNoBlockOnGlobalScreens(page: Page) {
    for (const path of ['/', '/notices', '/voc']) {
      await page.goto(path);
      await expect(mainHeading(page)).toBeVisible();
      await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    }
  }

  test('공간 하나(viewer)는 전역 화면에 블록이 없고 BRAVO에만 블록이 있으며 전체 링크가 없다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto('/metrics');
    await managedSystemOf(page, 'BRAVO');
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(1);
    await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('공간 둘(engineer)은 전환기로 옮긴 공간마다 그 공간 블록을 그리고 전체 링크가 없다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto(PRODUCTIVITY);
    const analytics = await managedSystemOf(page, 'MARS');
    await chooseSystem(page, 'BRAVO');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/metrics');
    expect(await managedSystemOf(page, 'BRAVO')).not.toBe(analytics);
    await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('공간 셋(admin)은 두 공간 블록, 운영 콘솔 블록 없음, 전체 링크 있음', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto(PRODUCTIVITY);
    const analytics = await managedSystemOf(page, 'MARS');
    await chooseSystem(page, 'BRAVO');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/metrics');
    expect(await managedSystemOf(page, 'BRAVO')).not.toBe(analytics);
    await chooseSystem(page, '운영 콘솔');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/roles');
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await expect(await feedbackOpsOverallLink(page)).toBeVisible();
    await evidence(page, testInfo, 'feedbackops-space-count-admin');
  });
});

test.describe('일괄 적용 조회 바 (06 §11·§19, ADR-0061)', () => {
  async function expandQuery(page: Page) {
    const bar = contextBar(page);
    await expect(bar).toBeVisible();
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    return bar;
  }
  test('bare URL은 조회 전이며 편집·Enter는 주소를 바꾸지 않고 적용 후 완료를 표시한다', async ({ page }, testInfo) => {
    await page.goto('/analytics/cycle-time?scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = await expandQuery(page);
    await expandPageHead(page);
    await expect(page.getByText('요약 조회 완료', { exact: false })).toHaveCount(0);
    await expect(bar.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
    const original = page.url();
    await bar.getByRole('button', { name: '공정', exact: true }).click();
    await page.getByRole('option', { name: 'PHOTO', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '일', exact: true }).click();
    await page.keyboard.press('Enter');
    expect(page.url()).toBe(original);
    await expect(page.getByText('요약 조회 완료', { exact: false })).toHaveCount(0);
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('granularity')).toBe('day');
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('요약 조회 완료');
    const applied = page.url();
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    expect(page.url()).toBe(applied);
    await evidence(page, testInfo, 'query-bar-applied');
  });
  test('deep link와 Back/Forward는 적용값을 복원하고 초안 page 값은 적용까지 결과에 섞이지 않는다', async ({ page }) => {
    await page.goto(`/analytics/cycle-time?scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    const strip = page.getByRole('region', { name: '적용된 조회 조건' });
    await expect(strip).toContainText('요약 조회 완료');
    const bar = await expandQuery(page);
    await expandPageHead(page);
    const original = page.url();
    await page.getByRole('button', { name: '주', exact: true }).click();
    expect(page.url()).toBe(original);
    await expect(strip).not.toContainText('집계 주');
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('granularity')).toBe('week');
    await page.goBack();
    await expect.poll(() => page.url()).toBe(original);
    await page.goForward();
    await expect.poll(() => query(page).get('granularity')).toBe('week');
  });
  test('제한 역할의 공정 후보와 Scope 즉시 전환은 서버 권한을 따른다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto(`/analytics/cycle-time?scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    const bar = await expandQuery(page);
    await expectScopeValid(page, 'MEM · 메모리');
    await bar.getByRole('button', { name: '공정', exact: true }).click();
    await expect(page.getByRole('option', { name: 'DIFF', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await switchScope(page, 'FDRY');
    await expect.poll(() => query(page).get('scopeId')).toBe('FDRY');
    expect(query(page).has('roomNames')).toBe(false);
    await expect(bar.getByRole('button', { name: '적용', exact: true })).toBeDisabled();
  });
  test('선택 칸 전환은 각 초안을 보존하고 편집 패널을 닫는다', async ({ page }) => {
    await signInAs(page, 'engineer');
    // `칸 N 선택` is the grid pane head's button; the dock selects by its tabs.
    await page.addInitScript(() => { localStorage.setItem('platform:board-layout-engine', 'grid'); });
    await page.addInitScript(period => {
      const screen = { menuId: 'cycle-time', params: {}, query: `?scopeId=MEM&roomNames=PHOTO&${period}` };
      localStorage.setItem('platform:board:engineer', JSON.stringify({ v: 1, activeSheetId: 'drafts', sheets: [{ id: 'drafts', name: '초안', layout: '1x2', selected: 0, panes: [screen, screen] }] }));
    }, PERIOD);
    await page.goto('/board?sheet=drafts');
    await page.getByRole('region', { name: '칸 1 · 분석 Context' }).getByRole('button', { name: '조회 조건 펼치기' }).click();
    await page.getByRole('button', { name: '최근 7일', exact: true }).click();
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '칸 2 선택' }).click();
    await expect(page.getByRole('region', { name: '칸 2 · 분석 Context' })).toContainText('적용 안 된 변경 0개');
    await page.getByRole('button', { name: '칸 1 선택' }).click();
    await expect(page.getByRole('region', { name: '칸 1 · 분석 Context' })).toContainText('적용 안 된 변경 1개');
  });
  test('최근 조건은 bare 재방문과 수동 선택에서 초안만 복원하고 적용 때 분석 요청을 한 번 보낸다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.setViewportSize({ width: 1280, height: 900 });
    const requestCount = () => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
      .filter(entry => (entry as PerformanceMark).detail?.endpoint === 'analytics.cycle.kpi').length);
    await page.goto('/analytics/cycle-time?scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    let bar = await expandQuery(page);
    await expandPageHead(page);
    await bar.getByRole('button', { name: '공정', exact: true }).click();
    await page.getByRole('option', { name: 'PHOTO', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '일', exact: true }).click();
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('요약 조회 완료');
    await page.getByRole('button', { name: '주', exact: true }).click();
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('granularity')).toBe('week');
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('집계 주');
    await bar.getByRole('button', { name: '최근 조건', exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await page.goto('/analytics/cycle-time?scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    bar = await expandQuery(page);
    await expandPageHead(page);
    await expect(page.getByRole('button', { name: '주', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const before = await requestCount();
    expect(before).toBe(0);
    await expect(page.getByText('요약 조회 완료', { exact: false })).toHaveCount(0);
    await bar.getByRole('button', { name: '최근 조건', exact: true }).click();
    await page.getByRole('option', { name: /집계 일/ }).click();
    await expect(page.getByRole('button', { name: '일', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await requestCount()).toBe(before);
    expect(query(page).has('granularity')).toBe(false);
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('요약 조회 완료');
    expect(await requestCount()).toBe(before + 1);
    await evidence(page, testInfo, 'query-history-draft-restore');
  });

});

test.describe('차트 카탈로그 — 종류별 상호작용 (06 §16, #530)', () => {
  const catalog = `/analytics/chart-catalog?v=1&scopeId=MEM&${PERIOD}`;
  const kinds = [
    ['line', '선'], ['bar', '막대'], ['heatmap', '히트맵'], ['donut', '도넛'],
    ['scatter', '산점도'], ['boxPlot', '상자그림'], ['pareto', '파레토'],
    ['topNBar', 'TopN 막대'], ['lane', 'Lane 시간선'],
  ] as const;
  for (const [kind, label] of kinds) {
    test(`${label} — 그려짐과 선택 결과`, async ({ page }, testInfo) => {
      await signInAs(page, 'engineer');
      await page.goto(`${catalog}&kind=${kind}`);
      await expect(mainHeading(page)).toHaveText('차트 카탈로그');
      const workspace = page.getByRole('region', { name: '차트 작업 영역', exact: true });
      await expect(workspace.getByRole('img')).toBeVisible();
      await expect.poll(() => workspace.locator('canvas').evaluateAll(canvases => canvases.some(canvas => {
        const element = canvas as HTMLCanvasElement;
        const context = element.getContext('2d');
        return !!context && context.getImageData(0, 0, element.width, element.height).data.some((value, index) => index % 4 === 3 && value > 0);
      }))).toBe(true);
      const url = page.url();
      const summary = workspace.getByRole('region', { name: '선택 요약' });
      if (kind === 'line' || kind === 'bar') {
        await summary.getByRole('button', { name: '선택', exact: true }).click();
        await expect(summary).toContainText('n=8');
        await workspace.getByRole('button', { name: '비교', exact: true }).click();
        await expect(workspace.getByRole('group', { name: '범례', exact: true })).toContainText('이전 동일 기간');
      } else if (kind === 'lane') {
        await expect(workspace.getByText('Lane 1', { exact: true })).toBeVisible();
        const timeline = workspace.getByRole('region', { name: 'Lane 시간선 차트', exact: true });
        await timeline.focus(); await timeline.press('Enter');
        await expect(summary).toContainText(/Lane 1 · .*2026-\d\d-\d\d \d\d:\d\d:\d\d – 2026-\d\d-\d\d \d\d:\d\d:\d\d/);
        await timeline.press('Escape'); await expect(summary).toContainText('선택 없음');
      } else {
        if (kind === 'topNBar') {
          await expect(workspace.getByRole('button', { name: '숨기기', exact: true })).toHaveAttribute('aria-expanded', 'true');
        }
        await workspace.getByRole('button', { name: '표로 보기', exact: true }).click();
        const table = workspace.getByRole('table', { name: `${label} 차트`, exact: false });
        if (kind === 'topNBar') await expect(table.getByText('Item 1', { exact: true })).toBeVisible();
        const checkbox = table.getByRole('checkbox').first();
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await expect(summary.getByRole('button', { name: '상세', exact: true })).toBeVisible();
        await summary.getByRole('button', { name: '상세', exact: true }).click();
        await expect(workspace.getByRole('status', { name: '상세 결과' })).toContainText('상세 대상:');
      }
      expect(page.url()).toBe(url);
      await evidence(page, testInfo, `chart-catalog-${kind}-selection`);
    });
  }
  test('미지원 동작은 차트에 없고 지원 패널에 이유가 있다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${catalog}&kind=heatmap`);
    const workspace = page.getByRole('region', { name: '차트 작업 영역', exact: true });
    await expect(workspace.getByRole('img')).toBeVisible();
    for (const name of ['확대', '비교', '주석']) await expect(workspace.getByRole('button', { name, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '동작·지원 열기', exact: true }).click();
    const panel = page.getByRole('complementary', { name: '동작·지원' });
    await expect(panel).toContainText('Zoom · 미지원');
    await expect(panel).toContainText('이 종류의 차트 계약에서 제공하지 않음');
    await expect(panel).toContainText('단일 실제 항목');
    await expect(panel).toContainText('06 §16');
    await evidence(page, testInfo, 'chart-catalog-support-reasons');
  });
  test('kind 딥링크·새로고침·뒤로·앞으로', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${catalog}&kind=scatter`);
    const scatter = page.getByRole('tab', { name: /^산점도 / });
    await expect(scatter).toHaveAttribute('aria-selected', 'true');
    await page.reload(); await expect(scatter).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: /^도넛 / }).click();
    await expect(page).toHaveURL(/kind=donut/);
    await page.goBack(); await expect(scatter).toHaveAttribute('aria-selected', 'true');
    await page.goForward(); await expect(page.getByRole('tab', { name: /^도넛 / })).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'chart-catalog-kind-history');
  });
});

// #680 (ADR-0075): a fill page's head (notes + page filter + chips) folds to one line; shared responses become a thin strip.
test.describe('페이지 머리 접기 (#680)', () => {
  const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const HEAD_KEY = 'platform:page-head-collapsed:cycle-time';
  /** Upper bound of the workspace top (px) at 1440×900 with the query bar and the page head collapsed: measured 230.8 (315 before #680), plus 9px for font metrics on CI. */
  const COLLAPSED_WORKSPACE_TOP_MAX = 240;
  const line = (page: Page) => page.locator('[data-page-head-line]');
  const workspaceTop = async (page: Page) => (await page.locator('[data-panel-workspace]').boundingBox())!.y;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('platform:e2e-head-reset')) return;
      localStorage.removeItem('platform:page-head-collapsed:cycle-time');
      localStorage.removeItem('platform:page-filter-collapsed:cycle-time');
      localStorage.removeItem('platform:query-bar-collapsed:cycle-time');
      sessionStorage.setItem('platform:e2e-head-reset', '1');
    });
  });

  test('fill 페이지는 접힌 채 시작하고, 조회 조건까지 접으면 작업 영역이 위쪽 한계 안에서 시작한다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(line(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('page-filter-bar')).toBeHidden();
    await page.getByRole('button', { name: '조회 조건 접기' }).click();
    await expect(page.locator('[data-panel-workspace]')).toBeVisible();
    await expect.poll(() => workspaceTop(page)).toBeLessThanOrEqual(COLLAPSED_WORKSPACE_TOP_MAX);
    await evidence(page, testInfo, 'page-head-collapsed-1440x900');
  });

  test('펼침·접힘은 새로고침 뒤에도 유지된다', async ({ page }) => {
    await page.goto(CYCLE);
    await page.getByRole('button', { name: '페이지 머리 펼치기' }).click();
    await expect(page.getByRole('button', { name: '페이지 머리 접기' })).toBeFocused();
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    await page.getByRole('button', { name: '페이지 머리 접기' }).click();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toBeFocused();
    await page.reload();
    await expect(page.getByRole('button', { name: '페이지 머리 펼치기' })).toBeVisible();
    await expect(page.getByTestId('page-filter-bar')).toBeHidden();
  });

  test('서버 오류 응답은 얇은 띠로 뜨고 #platform-main이 스크롤되지 않는다', async ({ page }, testInfo) => {
    await page.goto(CYCLE);
    await expect(page.locator('[data-panel-workspace]')).toBeVisible();
    await page.getByRole('button', { name: '조회 조건 접기' }).click();
    await setScenario(page, '서버 오류 (error)');
    const strip = page.getByRole('main').locator('[data-outcome-banner]');
    await expect(strip).toHaveCount(1);
    await expect(strip).toHaveAttribute('data-outcome-compact', 'true');
    await expect(strip).toContainText('서버 오류 ·');
    await expect(strip.getByRole('button', { name: '자세히' })).toBeVisible();
    await expect(strip.getByRole('button', { name: '다시 시도' })).toBeVisible();
    expect(await page.locator('#platform-main').evaluate(element => element.scrollHeight > element.clientHeight + 1)).toBe(false);
    await evidence(page, testInfo, 'page-head-thin-strip-1440x900');
  });

  test('접힌 줄에 적용된 버킷 칩이 보이고, 초안 페이지 조건은 미적용 표식으로 남는다', async ({ page }) => {
    await page.goto(`${CYCLE}&bucket=2026-09-25T09:00:00`);
    await expect(line(page)).toContainText('버킷');
    await expect(line(page)).not.toContainText('미적용 변경 있음');
    await page.getByRole('button', { name: '페이지 머리 펼치기' }).click();
    await page.getByRole('button', { name: '주', exact: true }).click();
    await page.getByRole('button', { name: '페이지 머리 접기' }).click();
    await expect(line(page)).toContainText('미적용 변경 있음');
    await expect(line(page)).toContainText('버킷');
  });

  test('틀린 페이지 키(granularity)면 저장값과 무관하게 펼친 채 시작하고 페이지 조건 기본값이 보인다', async ({ page }) => {
    await page.addInitScript(key => { if (!sessionStorage.getItem('platform:e2e-head-seeded')) { localStorage.setItem(key, 'true'); sessionStorage.setItem('platform:e2e-head-seeded', '1'); } }, HEAD_KEY);
    await page.goto(`${CYCLE}&granularity=zzz`);
    await expect(page.getByRole('button', { name: '페이지 머리 접기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '페이지 조건 기본값' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
