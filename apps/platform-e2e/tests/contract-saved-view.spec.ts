import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './origin-guard';
import { PERIOD, startWithQueryBarOpen } from './contract-helpers';
import { expectAppliedChip, queryEditor, shareQueryConditions, pickTargetRoom, contextBar, evidence, expandQueryBar, mainHeading, query, queryBar, showSlowExecutions, signInAs } from './support';

/**
 * Platform contract checks for Saved Views (docs/06 §21). Cycle Time and HW Time observe the same store and query bar.
 */
const CYCLE = `/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
const PHOTO_CHIP = '공정 PHOTO';
const trigger = (page: Page) => page.getByRole('button', { name: /^저장된 뷰:/ });
const reviewScreen = (page: Page) => page.getByRole('region', { name: '검토 본문', exact: true });
const modifiedBadge = (page: Page) => trigger(page).getByText('수정됨');
const toast = (page: Page, text: RegExp | string) => page.getByText(text).first();
async function openCycle(page: Page, url = CYCLE) {
  await page.goto(url);
  await expect(mainHeading(page)).toHaveText('사이클타임 상세');
  await expandQueryBar(page);
  await expect(trigger(page)).toBeVisible();
}

/**
 * Folds the query bar and waits until it stays folded. A bar with no applied query opens itself after mount (see
 * `expandQueryBar`), so a single visibility check can run before the editor opens and leave it over the workspace (#3057).
 */
async function closeQueryEditor(page: Page) {
  const bar = queryBar(page);
  const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
  const collapse = bar.getByRole('button', { name: '조회 조건 접기' });
  await expect(expand.or(collapse).first()).toBeVisible();
  await expect(async () => {
    if (await collapse.isVisible()) await collapse.click({ timeout: 2_000 });
    await expect(expand).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole('dialog', { name: '조회 조건', exact: true })).toHaveCount(0, { timeout: 2_000 });
  }).toPass();
}

/**
 * Folds a query bar that the test opened through the stored preference (`startWithQueryBarOpen`): the bar is open on
 * arrival, so wait for its fold button instead of guessing whether the editor has opened yet (#3057).
 */
async function foldOpenQueryEditor(page: Page) {
  await queryBar(page).getByRole('button', { name: '조회 조건 접기' }).click();
  await expect(queryBar(page).getByRole('button', { name: '조회 조건 펼치기' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '조회 조건', exact: true })).toHaveCount(0);
}

/** The selector popover's view list; opening it again while open would close it. */
async function openList(page: Page): Promise<Locator> {
  await expandQueryBar(page);
  await trigger(page).click();
  const list = page.getByRole('list', { name: '뷰 목록' });
  await expect(list).toBeVisible();
  return list;
}
async function openFoldedViewPicker(page: Page): Promise<Locator> {
  await queryBar(page).getByRole('button', { name: '조회 조건 동작', exact: true }).click();
  await page.getByRole('menuitem', { name: '뷰 선택', exact: true }).click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('searchbox', { name: '뷰 이름 검색' }) });
  await expect(picker).toBeVisible();
  return picker;
}
const rowOf = (list: Locator, name: string) => list.getByRole('listitem').filter({ hasText: name });
async function pickView(page: Page, name: string) {
  const list = await openList(page);
  await rowOf(list, name).getByRole('button').first().click();
}

/** Opens `새 뷰로 저장` and fills the name; the caller chooses the audience and submits. */
async function startSave(page: Page, name: string, unit: RegExp = /^메뉴 뷰/) {
  await expandQueryBar(page);
  await queryEditor(page).getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('menuitem', { name: /새 뷰로 저장|내 복사본으로 저장/ }).click();
  const dialog = page.getByRole('dialog', { name: '뷰 저장' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: unit }).click();
  await dialog.getByLabel('뷰 이름').fill(name);
  return dialog;
}
async function savePrivate(page: Page, name: string) {
  const dialog = await startSave(page, name);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(toast(page, `"${name}" 뷰를 저장했습니다.`)).toBeVisible();
  await expandQueryBar(page);
  await expect(trigger(page)).toHaveAccessibleName(`저장된 뷰: ${name}`);
}
/** Saves through the audience picker: `groups` checks the named groups, `official` asks for approval. */
async function saveShared(page: Page, name: string, target: { groups: string[] } | { official: true }) {
  const dialog = await startSave(page, name);
  await dialog.getByRole('radio', { name: /^공유 대상 지정/ }).click();
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '공유 대상' });
  await expect(picker).toBeVisible();
  if ('official' in target) await picker.getByRole('radio', { name: '공식 신청' }).click();
  else { await picker.getByRole('radio', { name: '그룹' }).click(); for (const group of target.groups) await picker.getByRole('checkbox', { name: group }).check(); }
  await picker.getByRole('button', { name: '공유 대상 저장' }).click();
  await expect(picker).toHaveCount(0);
}
async function openManagement(page: Page) {
  await page.getByRole('button', { name: '뷰 관리', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '뷰 관리' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openApprovalReview(page: Page, name: string) {
  await closeQueryEditor(page);
  await openFoldedViewPicker(page);
  const dialog = await openManagement(page);
  await dialog.getByRole('radio', { name: '승인 대기' }).click();
  await dialog.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await dialog.getByRole('button', { name: '검토 열기' }).click();
  const review = page.getByRole('region', { name: '승인 검토' });
  await expect(reviewScreen(page).getByRole('heading', { name: '사이클타임 상세', exact: true })).toBeVisible();
  return review;
}

async function captureCycleCopy(page: Page, testInfo: Parameters<typeof evidence>[1], name: string, body: Locator, granularity: '일' | '주') {
  await expect(body.locator('[data-context-chip-measure]')).toContainText(/공정\s*PHOTO/);
  await expect(body.locator('[data-context-chip-measure]')).toContainText(new RegExp(`집계\\s*${granularity}`));
  const trend = body.getByRole('region', { name: '사이클타임 추세', exact: true });
  await expect(trend).toBeVisible();
  await expect.poll(() => trend.locator('canvas').evaluateAll(canvases => canvases.some(canvas => {
    const { width, height } = canvas as HTMLCanvasElement;
    const pixels = (canvas as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, width, height).data;
    return pixels?.some((value, index) => index % 4 === 3 && value > 0) ?? false;
  }))).toBe(true);
  await evidence(page, testInfo, name);
}

const savedReviewState = (page: Page) => page.evaluate(() => Object.keys(localStorage).sort()
  .filter(key => /^platform:(saved-views|workspace):/.test(key))
  .map(key => [key, localStorage.getItem(key)]));

test.describe('HW Time saved views and shared conditions', () => {
  test('restores source-table column groups and shares the applied conditions', async ({ page }) => {
    const TWO_DAYS = 'from=2026-09-24T09:00:00&to=2026-09-26T09:00:00';
    await signInAs(page, 'engineer');
    await startWithQueryBarOpen(page, 'hw-time');
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await page.goto(`/mars/hw-time?v=1&scopeId=MEM&roomNames=PHOTO&pins=table&${TWO_DAYS}`);
    const workspace = page.getByRole('region', { name: 'HW Time 분석 영역', exact: true });
    const tableTab = workspace.getByRole('tab', { name: '원본 표', exact: true });
    await foldOpenQueryEditor(page);
    await tableTab.click();
    const table = page.locator('[data-dock-panel="table"]');
    const tablePin = workspace.getByRole('button', { name: '원본 표 고정', exact: true });
    await expect(tablePin).toHaveAttribute('aria-pressed', 'true');
    const groupHeader = table.getByRole('columnheader', { name: /HW 비교 묶음/ }).first();
    const columns = table.getByRole('button', { name: '컬럼', exact: true });
    await columns.click();
    await page.getByRole('button', { name: '묶음 만들기', exact: true }).click();
    const name = page.getByRole('textbox', { name: '묶음 이름', exact: true });
    const editor = page.getByRole('dialog').filter({ has: name });
    await editor.getByRole('checkbox').nth(0).check();
    await editor.getByRole('checkbox').nth(1).check();
    await name.fill('HW 비교 묶음');
    await editor.getByRole('button', { name: '묶기', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(groupHeader).toBeVisible();
    await savePrivate(page, 'E2E HW Time PHOTO');

    const list = await openList(page);
    await list.getByRole('button', { name: 'E2E HW Time PHOTO 동작' }).click();
    await page.getByRole('menuitem', { name: '내 기본으로 지정' }).click();
    await expect(toast(page, '개인 기본 뷰로 지정했습니다.')).toBeVisible();
    await page.goto('/hw-time/steps?v=1&scopeId=MEM&roomNames=ETCH&pins=table');
    await expect.poll(() => query(page).get('from')).toBe('2026-09-25T00:00:00');
    expect(query(page).get('roomNames')).toBe('ETCH');

    await foldOpenQueryEditor(page);
    await tableTab.click();
    await columns.click();
    await page.getByRole('button', { name: '기본값으로', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(groupHeader).toHaveCount(0);
    await tablePin.click();
    await expect(tablePin).toHaveAttribute('aria-pressed', 'false');
    await pickTargetRoom(page, queryBar(page), 'PHOTO');
    expect(query(page).get('roomNames')).toBe('ETCH');
    await pickView(page, 'E2E HW Time PHOTO');
    await page.getByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' }).getByRole('button', { name: '버리고 이동' }).click();
    await expandQueryBar(page);
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: E2E HW Time PHOTO');
    await expect.poll(() => query(page).get('roomNames')).toBe('PHOTO');
    await expect.poll(() => query(page).get('from')).toBe('2026-09-24T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
    await closeQueryEditor(page);
    await tableTab.click();
    await expect(tablePin).toHaveAttribute('aria-pressed', 'true');
    await expect(groupHeader).toBeVisible();

    await shareQueryConditions(page);
    const link = new URL(await page.getByRole('textbox', { name: '복사할 링크' }).inputValue());
    expect(link.searchParams.get('roomNames')).toBe('PHOTO');
    expect(link.searchParams.get('from')).toBe('2026-09-24T09:00:00');
    expect(link.searchParams.get('to')).toBe('2026-09-26T09:00:00');
    expect(link.searchParams.getAll('pins')).toContain('table');
    await page.goto(link.href);
    await expect(tableTab).toBeVisible();
    expect(query(page).get('roomNames')).toBe('PHOTO');
    expect(query(page).get('from')).toBe('2026-09-24T09:00:00');
    await foldOpenQueryEditor(page);
    await tableTab.click();
    await expect(tablePin).toHaveAttribute('aria-pressed', 'true');
    await expect(table.getByRole('row').filter({ has: page.getByRole('cell') }).first()).toBeVisible();
  });
});

test.describe('06 §21 저장된 뷰', () => {
  test('메뉴 뷰가 원본 표의 열 묶음을 복원하고 묶음 편집을 수정됨으로 표시한다', async ({ page }, testInfo) => {
    // Cycle time is a saved-view menu whose slow-executions table opts into editable column groups.
    await signInAs(page, 'engineer');
    await openCycle(page);
    await closeQueryEditor(page);
    await showSlowExecutions(page);
    const table = page.locator('[data-dock-panel="slow"]');
    await table.getByRole('button', { name: '컬럼', exact: true }).click();
    await page.getByRole('button', { name: '묶음 만들기', exact: true }).click();
    const name = page.getByRole('textbox', { name: '묶음 이름', exact: true });
    const editor = page.getByRole('dialog').filter({ has: name });
    await editor.getByRole('checkbox').nth(0).check();
    await editor.getByRole('checkbox').nth(1).check();
    await name.fill('E2E 비교 묶음');
    await editor.getByRole('button', { name: '묶기', exact: true }).click();
    await page.keyboard.press('Escape');
    await savePrivate(page, 'E2E 표 묶음');
    await expect(modifiedBadge(page)).toHaveCount(0);
    await closeQueryEditor(page);
    await table.getByRole('button', { name: '컬럼', exact: true }).click();
    await page.getByRole('button', { name: '기본값으로', exact: true }).click();
    await page.keyboard.press('Escape');
    await expandQueryBar(page);
    await expect(modifiedBadge(page)).toBeVisible();
    await evidence(page, testInfo, 'saved-table-groups-reset');
    await queryEditor(page).getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('menuitem', { name: '저장본으로 되돌리기', exact: true }).click();
    await closeQueryEditor(page);
    await showSlowExecutions(page);
    await expect(table.getByRole('columnheader', { name: /E2E 비교 묶음/ }).first()).toBeVisible();
    await expandQueryBar(page);
    await expect(modifiedBadge(page)).toHaveCount(0);
    await evidence(page, testInfo, 'saved-table-groups');
  });
  test('조건을 저장하고 다른 뷰를 적용한 뒤 고치면 수정됨이 뜨고, 저장한 뷰를 다시 고르면 그 조건으로 돌아온다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 일 단위 PHOTO');
    await expect(modifiedBadge(page)).toHaveCount(0);

    await pickView(page, '내 야간 점검');
    await expandQueryBar(page);
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: 내 야간 점검');
    await expectAppliedChip(page, PHOTO_CHIP, { present: false });

    // The seed view holds no room, which leaves the required 공정 empty: choosing one and applying is the edit that makes the view modified.
    const bar = contextBar(page);
    await pickTargetRoom(page, bar, 'PHOTO');
    await queryEditor(page, bar).getByRole('button', { name: '적용', exact: true }).click();
    const picker = await openFoldedViewPicker(page);
    await expect(picker.getByText('수정됨', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'modified');

    await rowOf(picker.getByRole('list', { name: '뷰 목록' }), 'E2E 일 단위 PHOTO').getByRole('button').first().click();
    await page.getByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' }).getByRole('button', { name: '버리고 이동' }).click();
    await expandQueryBar(page, bar);
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: E2E 일 단위 PHOTO');
    await expectAppliedChip(page, PHOTO_CHIP);
    await expectAppliedChip(page, '집계 일');
    await expect(modifiedBadge(page)).toHaveCount(0);
  });

  test('승인 검토 #2765: 공식 신청을 관리자가 검토하고 승인한다', async ({ page, context }, testInfo) => {
    // One stored-view history across two roles: first request, owner withdrawal of an edit, and the edited proposal's comparison and panel access. Measured 32 s on the CI shard against the 30 s default.
    test.slow();
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await saveShared(page, 'E2E 그룹 공유', { groups: ['포토공정1팀 (3명)', '주간 리뷰 모임 (3명)'] });
    await expect(toast(page, /"E2E 그룹 공유" 뷰를 저장하고 공유 대상을 정했습니다/)).toBeVisible();
    await saveShared(page, 'E2E 공식 신청', { official: true });
    await expect(toast(page, /"E2E 공식 신청" 뷰를 저장하고 공식 등록을 신청했습니다/)).toBeVisible();

    const list = await openList(page);
    await expect(rowOf(list, 'E2E 그룹 공유')).toContainText('포토공정1팀 외 1');
    // Asking for official publishing never changes who can see the view: the audience stays private and only the approval moves.
    await expect(rowOf(list, 'E2E 공식 신청')).toContainText('나만');
    await expect(rowOf(list, 'E2E 공식 신청')).toContainText('승인 대기');
    await page.keyboard.press('Escape');

    // Each role gets its own page of the same browser context (the stored views are shared, the role script is installed once per page).
    const adminPage = await context.newPage();
    await signInAs(adminPage, 'admin');
    await adminPage.goto(`${CYCLE}&granularity=week`);
    await captureCycleCopy(adminPage, testInfo, '2765-before', adminPage.getByRole('main'), '주');
    const before = adminPage.url();
    const review = await openApprovalReview(adminPage, 'E2E 공식 신청');
    expect(adminPage.url()).toBe(before);
    await expect(review).toContainText('승인본 → 신청본');
    await expect(review.getByText('현재 화면: 신청본', { exact: true })).toBeVisible();
    const proposal = reviewScreen(adminPage);
    await expect(proposal.getByRole('button', { name: PHOTO_CHIP, exact: true })).toBeDisabled();
    const metadata = adminPage.getByRole('complementary', { name: '승인 검토' });
    await expect(metadata.getByText('승인 후 공개 대상', { exact: true })).toBeVisible();
    await expect(metadata.getByText('공식', { exact: true })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: '승인본 화면 보기' })).toHaveCount(0);
    await captureCycleCopy(adminPage, testInfo, '2765-after-first-request', proposal, '일');
    await review.getByRole('button', { name: '승인', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expectAppliedChip(adminPage, '집계 주');

    await openCycle(page);
    const after = await openList(page);
    await expect(rowOf(after, 'E2E 공식 신청')).toContainText('공식');
    await expect(rowOf(after, 'E2E 공식 신청')).not.toContainText('승인 대기');
    await page.keyboard.press('Escape');

    // The UI disables editing an approved copy. Seed the mock store's pending-edit shape from the approved record.
    await page.evaluate(() => {
      const key = (owner: string) => 'platform:saved-views:v1:' + JSON.stringify([1, owner, 'cycle-time']);
      const bucket = JSON.parse(localStorage.getItem(key('engineer')) ?? '{}');
      const view = bucket.views?.find((row: { name: string }) => row.name === 'E2E 공식 신청');
      if (!view) throw new Error('Approved view fixture was not found');
      view.version += 1;
      const copy = { ...view, id: 'u-seojia|cycle-time|2765', ownerId: 'u-seojia', name: 'E2E 이전 승인본' };
      view.pending = { ...view, approval: 'pending', page: [['granularity', 'week']] };
      localStorage.setItem(key('engineer'), JSON.stringify(bucket));
      // A different owner lets the engineer exercise the MARS Space approver's list.
      const pending = { ...view.pending, id: copy.id, ownerId: copy.ownerId, name: 'E2E 수정 후' };
      localStorage.setItem(key(copy.ownerId), JSON.stringify({ schemaVersion: 1, views: [{ ...copy, pending }] }));
    });
    await openCycle(page);
    const ownerReview = await openApprovalReview(page, 'E2E 공식 신청');
    await expect(reviewScreen(page).locator('[data-context-chip-measure]')).toContainText(/집계\s*주/);
    await ownerReview.getByRole('button', { name: '신청 거두기' }).click();
    await expect(ownerReview).toHaveCount(0);
    await openCycle(page, `${CYCLE}&granularity=week`);
    const restored = await openList(page);
    const restoredRow = rowOf(restored, 'E2E 공식 신청');
    await expect(restoredRow).toContainText('공식');
    await expect(restoredRow).not.toContainText('승인 대기');
    await restoredRow.getByRole('button').first().click();
    await expectAppliedChip(page, '집계 일');

    await adminPage.goto(CYCLE);
    await expect(adminPage.getByRole('tab', { name: '사이클타임 추세', selected: true })).toBeVisible();
    const comparisonAddress = adminPage.url();
    const comparison = await openApprovalReview(adminPage, 'E2E 수정 후');
    await expect(comparison.getByText('현재 화면: 신청본', { exact: true })).toBeVisible();
    const toggle = adminPage.getByRole('button', { name: '승인본 화면 보기' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await captureCycleCopy(adminPage, testInfo, '2765-after-proposal', proposal, '주');
    await test.step('검토 도구 모음 아래에서 제목과 문맥에 접근할 수 있다 (#3258 A1)', async () => {
      const heading = proposal.getByRole('heading', { name: '사이클타임 상세', exact: true });
      await expect(heading).toBeVisible();
      const toolbarBottom = await comparison.evaluate(node => node.getBoundingClientRect().bottom);
      for (const element of [heading, proposal.locator('[data-page-scope-chip]'), proposal.locator('[data-breadcrumb-system]'), proposal.locator('[data-breadcrumb-section]')]) {
        await expect.soft(element).toBeVisible();
        expect.soft(await element.evaluate((node, bottom) => {
          const rect = node.getBoundingClientRect();
          return rect.top >= bottom && node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }, toolbarBottom)).toBe(true);
      }
      const reject = comparison.getByRole('button', { name: '반려…' });
      await reject.focus();
      await adminPage.keyboard.press('Tab');
      expect.soft(await proposal.evaluate(node => node.contains(document.activeElement))).toBe(true);
    });
    await test.step('숨은 조회 조건을 읽기 전용으로 열 수 있다 (#3258 A2)', async () => {
      const lane = proposal.locator('[data-context-chip-lane]');
      const overflow = lane.getByRole('button', { name: /^\+\d+$|^조건 \d+개 더 보기$/ });
      await expect(overflow).toBeVisible();
      const count = Number((await overflow.innerText()).slice(1));
      const expected = (await lane.locator('[data-context-chip-measure] > span').filter({ hasNotText: /^\+0+$/ }).allTextContents()).slice(-count);
      const state = await savedReviewState(adminPage);
      await expect(overflow).toBeEnabled();
      await overflow.press('Enter');
      const disclosure = adminPage.getByRole('dialog', { name: '나머지 조건' });
      await expect(disclosure).toBeVisible();
      const summaries = disclosure.getByRole('listitem').getByRole('group');
      await expect(summaries).toHaveCount(count);
      for (const [index, label] of expected.entries()) await expect(summaries.nth(index)).toHaveAccessibleName(label);
      await expect(disclosure.getByRole('button')).toHaveCount(0);
      await expect(disclosure).toHaveCSS('opacity', '1');
      await evidence(adminPage, testInfo, '3258-overflow');
      await adminPage.keyboard.press('Escape');
      await expect(overflow).toBeFocused();
      await overflow.click();
      await expect(disclosure).toBeVisible();
      await adminPage.keyboard.press('Escape');
      await expect(disclosure).toBeHidden();

      for (const key of ['Tab', 'Shift+Tab']) {
        await test.step(`패널을 닫고 ${key} 순서를 이어 간다 (#3258 C4)`, async () => {
          await overflow.focus();
          await adminPage.keyboard.press(key);
          const destination = await adminPage.locator(':focus').elementHandle();
          await overflow.press('Enter');
          await expect(disclosure).toBeFocused();
          await adminPage.keyboard.press(key);
          await expect.soft(disclosure).toBeHidden({ timeout: 2_000 });
          const focus = await destination.evaluate(node => ({
            matched: node === document.activeElement,
            expected: node.outerHTML.slice(0, 200),
            actual: document.activeElement?.outerHTML.slice(0, 200),
          }));
          expect.soft(focus.matched, `${key} from +N: expected ${focus.expected}, focused ${focus.actual}`).toBe(true);
          if (await disclosure.isVisible()) await adminPage.keyboard.press('Escape');
        });
      }

      await test.step('미리보기 제목을 누르면 패널이 닫힌다 (#3258 C2)', async () => {
        await overflow.press('Enter');
        await expect(disclosure).toBeVisible();
        const heading = proposal.getByRole('heading', { name: '사이클타임 상세', exact: true });
        // Keep the browser from moving focus to an ancestor so this click tests pointer dismissal.
        await heading.evaluate(node => node.addEventListener('mousedown', event => event.preventDefault(), { once: true }));
        await heading.click();
        await expect.soft(disclosure).toBeHidden({ timeout: 2_000 });
        if (await disclosure.isVisible()) await adminPage.keyboard.press('Escape');
      });

      await test.step('모든 조건이 펼쳐지면 검토 화면에 포커스가 남는다 (#3258 C1)', async () => {
        const viewport = adminPage.viewportSize()!;
        for (const focusDisclosure of [false, true]) {
          await overflow.focus();
          if (focusDisclosure) {
            await overflow.press('Enter');
            await expect(disclosure).toBeFocused();
          }
          await adminPage.setViewportSize({ ...viewport, width: 2560 });
          await expect(overflow).toHaveCount(0);
          await expect.soft(adminPage.getByRole('main')).toBeFocused({ timeout: 2_000 });
          await adminPage.setViewportSize(viewport);
          await expect(overflow).toBeVisible();
        }
      });

      await expect(proposal.getByRole('button', { name: PHOTO_CHIP, exact: true })).toBeDisabled();
      await expect(adminPage).toHaveURL(comparisonAddress);
      expect(await savedReviewState(adminPage)).toEqual(state);
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(comparison.getByText('현재 화면: 승인본', { exact: true })).toBeVisible();
    await captureCycleCopy(adminPage, testInfo, '2765-after-approved', proposal, '일');
    const savedState = await savedReviewState(adminPage);
    const summary = proposal.getByRole('tab', { name: '사이클타임 요약', exact: true });
    const slow = proposal.getByRole('tab', { name: '느린 실행', exact: true });
    await expect(summary).toHaveAttribute('aria-selected', 'false');
    await expect(slow).toHaveAttribute('aria-selected', 'false');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-selected', 'true');
    await expect(proposal.getByText('실행 수', { exact: true })).toBeVisible();
    await expect(summary).toBeFocused();
    await adminPage.keyboard.press('End');
    await expect(slow).toBeFocused();
    await expect(slow).toHaveAttribute('aria-selected', 'true');
    const executions = proposal.getByRole('grid', { name: '느린 실행 목록' });
    await expect(executions.getByRole('columnheader', { name: 'Equipment', exact: true })).toBeVisible();
    await expect(executions.getByRole('gridcell', { name: 'PHOTO', exact: true }).first()).toBeVisible();
    await expect(adminPage).toHaveURL(comparisonAddress);
    expect(await savedReviewState(adminPage)).toEqual(savedState);
    await adminPage.getByRole('button', { name: '검토 닫기' }).click();
    await expect(comparison).toHaveCount(0);
    await expect(adminPage.getByRole('tab', { name: '사이클타임 추세', selected: true })).toBeVisible();
    await expect(adminPage).toHaveURL(comparisonAddress);
    expect(await savedReviewState(adminPage)).toEqual(savedState);
    await openCycle(page, `${CYCLE}&granularity=day`);
    const approverList = await openList(page);
    const pendingRow = rowOf(approverList, 'E2E 수정 후');
    await expect(pendingRow).toContainText('승인 대기');
    await expect(rowOf(approverList, 'E2E 이전 승인본')).toHaveCount(0);
    await pendingRow.getByRole('button').first().click();
    await expectAppliedChip(page, '집계 주');
  });

  for (const action of ['reject', 'withdraw'] as const) {
    test(`승인 검토 #2765: ${action}`, async ({ page, context }, testInfo) => {
      const name = `E2E ${action}`;
      const rejectionReason = '조회 기간 확인 필요';
      await signInAs(page, 'engineer');
      await openCycle(page, `${CYCLE}&granularity=day`);
      await saveShared(page, name, { official: true });
      const reviewer = action === 'reject' ? await context.newPage() : page;
      if (action === 'reject') { await signInAs(reviewer, 'admin'); await reviewer.goto(CYCLE); }
      const review = await openApprovalReview(reviewer, name);
      if (action === 'reject') {
        await review.getByRole('button', { name: '반려…' }).click();
        const dialog = reviewer.getByRole('dialog', { name: '반려' });
        const submit = dialog.getByRole('button', { name: '반려', exact: true });
        await expect(submit).toBeDisabled();
        await dialog.getByRole('textbox', { name: '반려 이유' }).fill(rejectionReason);
        await submit.click();
      } else {
        await expect(reviewer.getByRole('heading', { name: '이전 승인본과 차이' })).toHaveCount(0);
        await captureCycleCopy(page, testInfo, '2765-owner-withdraw', reviewScreen(page), '일');
        await review.getByRole('button', { name: '신청 거두기' }).click();
      }
      await expect(review).toHaveCount(0);
      await openCycle(page);
      const row = rowOf(await openList(page), name);
      await expect(row).toBeVisible();
      await expect(row).not.toContainText('승인 대기');
      if (action === 'reject') {
        const management = await openManagement(page);
        const savedViews = management.getByRole('list', { name: '저장한 뷰', exact: true });
        const rejected = rowOf(savedViews, name);
        await expect(rejected.getByText('반려됨', { exact: true })).toBeVisible();
        await rejected.getByRole('button', { name: new RegExp(`^${name}`) }).click();
        const receipt = management.getByRole('region', { name, exact: true });
        await expect(receipt.getByText(rejectionReason, { exact: true })).toBeVisible();
      }
    });
  }

  test('새로고침은 선택한 뷰와 조건을 그대로 두고, 복사한 주소는 같은 조건을 연다', async ({ page, context }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 링크 왕복');
    const link = page.url();

    await page.reload();
    await expandQueryBar(page);
    await expect(trigger(page)).toHaveAccessibleName('저장된 뷰: E2E 링크 왕복');
    expect(query(page).toString()).toBe(new URL(link).searchParams.toString());
    // The selected view id stays out of the address (06 §21.3).
    expect([...query(page).keys()].join(',')).not.toMatch(/view/i);

    const copy = await context.newPage();
    await copy.goto(link);
    await expect(mainHeading(copy)).toHaveText('사이클타임 상세');
    await expectAppliedChip(copy, PHOTO_CHIP);
    await expectAppliedChip(copy, '집계 일');
    // A new tab has no selected view: the same conditions open without claiming a view.
    await expandQueryBar(copy);
    await expect(trigger(copy)).not.toHaveAccessibleName('저장된 뷰: E2E 링크 왕복');
    await evidence(copy, testInfo, 'copied-link');
    await copy.close();
  });

  test('개인 기본 뷰는 조건 없는 진입에만 적용되고 replace 한 번으로 쓰이며, 명시한 주소는 덮어쓰지 않는다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await openCycle(page, `${CYCLE}&granularity=day`);
    await savePrivate(page, 'E2E 기본 뷰');
    const list = await openList(page);
    await list.getByRole('button', { name: 'E2E 기본 뷰 동작' }).click();
    await page.getByRole('menuitem', { name: '내 기본으로 지정' }).click();
    await expect(toast(page, '개인 기본 뷰로 지정했습니다.')).toBeVisible();

    // A bare route takes the default; the explicit address keeps what it says.
    await page.goto('about:blank');
    await page.goto('/analytics/cycle-time?v=1&scopeId=MEM');
    // The chip exists only when the default view was applied (the menu default alone shows 집계 일), so waiting on it first exposes a default that never applied.
    await expectAppliedChip(page, PHOTO_CHIP);
    await expectAppliedChip(page, '집계 일');
    await page.goBack();
    await expect(page).toHaveURL('about:blank');

    // Wait until the selector finished its list and default read (the list opens with the default marked), then compare the whole address.
    const explicit = `${CYCLE}&granularity=week`;
    await openCycle(page, explicit);
    const afterLoad = await openList(page);
    await expect(rowOf(afterLoad, 'E2E 기본 뷰')).toContainText('내 기본');
    await page.keyboard.press('Escape');
    await expandQueryBar(page);
    await expect(trigger(page)).not.toHaveAccessibleName('저장된 뷰: E2E 기본 뷰');
    await expectAppliedChip(page, '집계 주');
    expect(query(page).toString()).toBe(new URL(explicit, page.url()).searchParams.toString());
  });

  test('권한 밖 Scope 뷰는 열 수 없음으로 이름과 내용 없이 보이고, 낡은 뷰는 적용되지 않아 범위가 넓어지지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await openCycle(page);
    const before = query(page).toString();
    const list = await openList(page);
    await expect(list.getByText('볼 수 없는 뷰 · 조회 권한이 없는 공정이 포함되어 있습니다.')).toBeVisible();
    await expect(page.getByText('CMP 설비 비교')).toHaveCount(0);

    await expect(rowOf(list, 'LOT 추이 (이전 형식)')).toContainText('낡음');
    await rowOf(list, 'LOT 추이 (이전 형식)').getByRole('button').first().click();
    // The conditions are exactly as opened, so nothing is lost and no confirmation comes before the stale answer; the row already says 낡음.
    await expect(page.getByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' })).toHaveCount(0);
    await expect(toast(page, /메뉴 화면 버전이 달라 적용하지 못했습니다/)).toBeVisible();
    expect(query(page).toString()).toBe(before);
    await expectAppliedChip(page, PHOTO_CHIP);
    await expandQueryBar(page);
    await expect(trigger(page)).not.toHaveAccessibleName('저장된 뷰: LOT 추이 (이전 형식)');

    await openList(page);
    const dialog = await openManagement(page);
    await expect(dialog.getByText('열 수 없음')).toBeVisible();
    await expect(dialog.getByText('낡음').first()).toBeVisible();
    await evidence(page, testInfo, 'denied-and-stale');
  });
});

test.describe('My Menus saved-view sharing', () => {
  test('opens a group-shared view in the recipient Scope and removes it after membership is revoked', async ({ page, context }, testInfo) => {
    const name = 'E2E 내 메뉴 공유';
    const group = 'E2E 내 메뉴 그룹';
    const adminAnchor = 'E2E 관리자 내 메뉴';
    const myMenus = (tab: Page) => tab.getByRole('region', { name: '내 메뉴', exact: true });
    const sharePicker = async (viewName: string) => {
      const dialog = await startSave(page, viewName);
      await expect(dialog.getByRole('checkbox', { name: '내 메뉴에 올리기' })).toBeChecked();
      await dialog.getByRole('radio', { name: /^공유 대상 지정/ }).click();
      await dialog.getByRole('button', { name: '저장', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '공유 대상' });
      await picker.getByRole('radio', { name: '그룹', exact: true }).click();
      return picker;
    };

    await signInAs(page, 'engineer');
    await openCycle(page);
    const picker = await sharePicker(name);
    await picker.getByRole('button', { name: '새 그룹 만들기' }).click();
    const create = page.getByRole('dialog', { name: '새 그룹 만들기' });
    await create.getByLabel('그룹 이름').fill(group);
    await create.getByLabel('멤버 검색').fill('오세진');
    await create.getByRole('checkbox', { name: /오세진/ }).check();
    await create.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(picker.getByRole('checkbox', { name: new RegExp(group) })).toBeChecked();
    await picker.getByRole('button', { name: '공유 대상 저장' }).click();
    await expect(toast(page, `"${name}" 뷰를 저장하고 공유 대상을 정했습니다.`)).toBeVisible();
    await expect(picker).toHaveCount(0);
    await expect(myMenus(page).getByRole('group', { name: '내가 만든 것' }).getByRole('link', { name: new RegExp(name) })).toBeVisible();

    const recipient = await context.newPage();
    await signInAs(recipient, 'admin');
    await openCycle(recipient, `/analytics/cycle-time?v=1&scopeId=FDRY&${PERIOD}`);
    await savePrivate(recipient, adminAnchor);
    await recipient.goto(`/analytics/productivity?v=1&scopeId=FDRY&${PERIOD}`);
    const sharedLink = myMenus(recipient).getByRole('group', { name: '공유받음' }).getByRole('link', { name: new RegExp(`${name}.*공정 엔지니어`) });
    await expect(sharedLink).toBeVisible();
    await evidence(recipient, testInfo, 'my-menus-shared');
    await sharedLink.click();
    await expect(mainHeading(recipient)).toHaveText('사이클타임 상세');
    await expandQueryBar(recipient);
    await expect(trigger(recipient)).toHaveAccessibleName(`저장된 뷰: ${name}`);
    expect(query(recipient).get('scopeId')).toBe('FDRY');
    expect(query(recipient).has('savedViewToken')).toBe(false);

    await openCycle(page);
    const editPicker = await sharePicker('E2E 공유 변경 확인');
    await editPicker.getByRole('button', { name: `${group} 편집` }).click();
    const edit = page.getByRole('dialog', { name: '그룹 편집' });
    await edit.getByRole('button', { name: /오세진.*제거/ }).click();
    await edit.getByRole('button', { name: '변경 저장' }).click();
    await expect(edit).toHaveCount(0);
    await editPicker.getByRole('button', { name: '취소', exact: true }).click();

    await recipient.reload();
    await expect(myMenus(recipient).getByRole('link', { name: new RegExp(adminAnchor) })).toBeVisible();
    // The owned anchor and shared count come from the same completed sidebar list read.
    await expect(myMenus(recipient).getByRole('button', { name: '공유받음 0', exact: true })).toBeVisible();
    await expect(sharedLink).toHaveCount(0);
    await evidence(recipient, testInfo, 'my-menus-membership-revoked');
  });
});
