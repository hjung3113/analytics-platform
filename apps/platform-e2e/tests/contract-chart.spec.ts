import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, periodPreset } from './contract-helpers';
import { contextBar, evidence, expectScopeValid, mainHeading, query, showSlowExecutions, signInAs, switchScope } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
test.describe('차트 계약 (06 §16 — Brush → 구간 적용 확인, 주석 Scope 격리, manifest features)', () => {
  const CYCLE = `/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
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
    await expect(frame.getByRole('region', { name: '선택 요약' })).toContainText(/선택 구간: /); // the empty state reads `선택 구간 없음`
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

  test('주석이 있는 차트에서 끄는 중 폭이 바뀌어도 Brush 선택이 끝난다 (#808)', async ({ page }) => {
    // A note makes the option follow the plot width, so a resize mid-drag re-applies the option. Replacing the brush component
    // then dropped the brush being drawn: no brushEnd, and the selection stayed the previous one.
    await page.goto(CYCLE);
    await brush(page);
    const frame = trend(page);
    await frame.getByRole('button', { name: '주석' }).click();
    await frame.getByRole('textbox', { name: '주석 내용' }).fill('끌기 중 폭 변경');
    await frame.getByRole('button', { name: '저장' }).click();
    await expect(frame.getByText(/끌기 중 폭 변경/)).toBeVisible();
    const summary = frame.getByRole('region', { name: '선택 요약' });
    const before = await summary.innerText();
    // The saved note moves the plot: measure it again.
    const plot = frame.getByRole('img', { name: /^사이클타임 추세/ });
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(box.x + box.width * 0.1, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + box.width * (0.1 + 0.1 * i / 8), y); await page.waitForTimeout(30); }
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(300);
    for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + box.width * (0.2 + 0.1 * i / 8), y); await page.waitForTimeout(30); }
    await page.mouse.up();
    await expect(summary).toContainText(/선택 구간: /);
    await expect.poll(() => summary.innerText(), { message: 'the brush drawn across the resize became the selection' }).not.toBe(before);
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

test.describe('차트 카탈로그 — 종류별 상호작용 (06 §16, #530)', () => {
  const catalog = `/mars/chart-catalog?v=1&scopeId=MEM&${PERIOD}`;
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
  test('분해 막대 — 합계 열·합계 없음·트리 드릴 (#580h)', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${catalog}&kind=breakdown`);
    await expect(page.getByRole('tab', { name: /^분해 막대 / })).toHaveAttribute('aria-selected', 'true');
    const workspace = page.getByRole('region', { name: '차트 작업 영역', exact: true });
    const stacked = workspace.getByRole('region', { name: /상태별 시간/ });
    // The Frame's accessible table opens from its 더보기 menu.
    await stacked.getByRole('button', { name: '더보기', exact: true }).click();
    await page.getByRole('button', { name: '같은 데이터를 표로 보기' }).click();
    await expect(stacked.getByRole('table').getByRole('columnheader', { name: '합계', exact: true })).toBeVisible();
    await expect(workspace.locator('[data-breakdown-server-total]')).toContainText(/서버 합계 — 그룹 A [\d.]+% · 그룹 B 없음/);
    await workspace.getByRole('checkbox', { name: '최소·최대 표시' }).check();
    await expect(workspace.getByRole('checkbox', { name: '최소·최대 표시' })).toBeChecked();
    const tree = workspace.getByRole('tree', { name: '분해 트리' });
    const group = tree.getByRole('treeitem', { name: /그룹 B/ });
    await group.focus(); await group.press('Enter');
    await expect(page).toHaveURL(/node=B(&|$)/);
    await expect(tree.getByRole('treeitem', { name: /그룹 B/ })).toHaveAttribute('aria-current', 'true');
    await evidence(page, testInfo, 'chart-catalog-breakdown-drill');
    // A global Context change drops the drill (node); Back restores it.
    const preset = await periodPreset(page, '7일');
    await preset.locator.click();
    await preset.close();
    await expect(page).not.toHaveURL(/node=/);
    await expect(page).toHaveURL(/kind=breakdown/);
    await page.goBack();
    await expect(page).toHaveURL(/node=B(&|$)/);
    await expect(page.getByRole('tree', { name: '분해 트리' }).getByRole('treeitem', { name: /그룹 B/ })).toHaveAttribute('aria-current', 'true');
    // A deep link shows the current item; an unknown node is rejected, not shown as the root.
    await page.goto(`${catalog}&kind=breakdown&node=A1a`);
    await expect(page.getByRole('tree', { name: '분해 트리' }).getByRole('treeitem', { name: /공정 A1a/ })).toHaveAttribute('aria-current', 'true');
    await page.goto(`${catalog}&kind=breakdown&node=not-a-place`);
    await expect(page.getByText('이 조건에서 없는 값: not-a-place')).toBeVisible();
    await expect(page).toHaveURL(/node=not-a-place/);
  });
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

test.describe('휠 스크롤 (#700, 06 §16·§15, 16 §4.1)', () => {
  // 워커가 쓰고 실행하지 못한 검사: 호스트가 처음 돌린다. #platform-main 에 높이를 주입해 스크롤 여유를 만든 뒤 휠을 돌린다.
  const CYCLE = `/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const main = (page: Page) => page.locator('#platform-main');
  const trendPlot = (page: Page) => page.getByRole('img', { name: /^사이클타임 추세/ });
  const workspace = (page: Page) => page.getByRole('region', { name: '사이클타임 분석 영역', exact: true });

  /** Gives the page scroll container real room and returns after asserting it. */
  async function giveRoom(page: Page, scroller: Locator) {
    await scroller.evaluate(element => {
      const spacer = document.createElement('div');
      spacer.dataset.e2eSpacer = '';
      spacer.style.cssText = 'height:2000px;flex:none';
      element.appendChild(spacer);
    });
    expect(await scroller.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(300);
  }
  /** Sum of scrollTop over the element's scrollable ancestors: "the nearest scroll container moved", whichever it is (Chrome latches a wheel gesture to the first container that can scroll). */
  const ancestorScroll = (locator: Locator) => locator.evaluate(element => {
    let total = 0;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) total += node.scrollTop;
    }
    return total;
  });
  async function centerOf(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(CYCLE);
    await expect(trendPlot(page)).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('차트 위 일반 휠은 가장 가까운 스크롤 컨테이너를 스크롤한다', async ({ page }) => {
    await giveRoom(page, main(page));
    await main(page).evaluate(element => { element.scrollTop = 0; });
    const at = await centerOf(trendPlot(page));
    const before = await ancestorScroll(trendPlot(page));
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => ancestorScroll(trendPlot(page))).toBeGreaterThan(before);
  });

  test('차트 위 Shift+휠은 확대하고 페이지는 움직이지 않는다', async ({ page }) => {
    await giveRoom(page, main(page));
    const plot = trendPlot(page);
    const at = await centerOf(plot);
    const url = page.url();
    const top = await main(page).evaluate(element => element.scrollTop);
    // Every comparison is between two settled frames with the pointer resting on the same point, so the hover tooltip and
    // axis pointer are identical in both and only the interaction can make them differ (a moved pointer alone must not pass).
    // Compare only the x-axis tick strip at the plot's bottom: the zoom window changes the ticks, while the hover tooltip and
    // axis pointer (near the pointer at the centre) stay out of it.
    const axisStrip = { x: at.box.x, y: at.box.y + at.box.height - 30, width: at.box.width, height: 28 };
    const settled = async (x: number, y: number) => { await page.mouse.move(x, y); await page.waitForTimeout(600); return page.screenshot({ clip: axisStrip, animations: 'disabled' }); };
    const flat = await settled(at.x, at.y);
    await page.keyboard.down('Shift');
    // Zoom well in (three notches) so the zoomed window has room to pan in both directions.
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    await page.keyboard.up('Shift');
    const zoomed = await settled(at.x, at.y);
    expect(zoomed.equals(flat), 'Shift+wheel zoomed the plot').toBe(false);
    expect(await main(page).evaluate(element => element.scrollTop)).toBe(top);
    expect(page.url()).toBe(url);
  });

  test('확대한 그림을 끌면 보이는 구간이 옮겨간다 (#705)', async ({ page }) => {
    // Press on the empty plot area above the line, then drag a quarter of the width to the left. The first drag after a zoom
    // is the regression: pressing re-rendered the page, a notMerge setOption rebuilt the inside dataZoom and the drag was lost.
    const plot = trendPlot(page);
    const at = await centerOf(plot);
    const axisStrip = { x: at.box.x, y: at.box.y + at.box.height - 30, width: at.box.width, height: 28 };
    const settled = async (x: number, y: number) => { await page.mouse.move(x, y); await page.waitForTimeout(600); return page.screenshot({ clip: axisStrip, animations: 'disabled' }); };
    const start = { x: at.x, y: at.box.y + at.box.height * 0.2 };
    const flat = await settled(start.x, start.y);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    await page.keyboard.up('Shift');
    const zoomed = await settled(start.x, start.y);
    expect(zoomed.equals(flat), 'Shift+wheel zoomed the plot').toBe(false);
    const dx = -at.box.width * 0.25;
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(start.x + (dx * i) / 12, start.y); await page.waitForTimeout(30); }
    await page.mouse.up();
    const panned = await settled(start.x, start.y);
    expect(panned.equals(zoomed), 'the drag moved the zoomed window').toBe(false);
    expect(panned.equals(flat), 'the window is still zoomed after the drag').toBe(false);
  });

  test('확대 버튼은 그대로 동작한다', async ({ page }) => {
    const frame = page.getByRole('region', { name: '사이클타임 추세' });
    const flat = await trendPlot(page).screenshot();
    await frame.getByRole('button', { name: '확대' }).click();
    await expect.poll(async () => !(await trendPlot(page).screenshot()).equals(flat)).toBe(true);
  });

  test('탭 머리 위 휠: 넘치지 않는 줄은 바깥 스크롤로 넘기고, 넘치는 줄은 가로 스크롤을 유지한다', async ({ page }) => {
    await giveRoom(page, main(page));
    const strip = workspace(page).locator('.dv-tabs-container').first();
    await expect(strip).toBeVisible();
    const at = await centerOf(strip);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => main(page).evaluate(element => element.scrollTop)).toBeGreaterThan(0);

    // Force an overflowing strip on the two-tab group (분포 · 느린 실행): the second tab starts clipped, the wheel scrolls the strip
    // until it is reachable, and the page stays put while the strip still has room (dockview keeps the wheel until its edge).
    await page.addStyleTag({ content: '.ap-dock .dv-tab { flex-shrink: 0; min-width: 600px; }' });
    const slowTab = workspace(page).getByRole('tab', { name: '느린 실행' });
    // `has` matches inside each strip, so its locator must not start at the workspace (an ancestor of the strip).
    const slowStrip = workspace(page).locator('.dv-tabs-container').filter({ has: page.getByRole('tab', { name: '느린 실행' }) });
    await slowStrip.scrollIntoViewIfNeeded();
    const clipped = () => slowStrip.evaluate(element => { const tab = [...element.querySelectorAll('[role="tab"]')].pop()!.getBoundingClientRect(); const box = element.getBoundingClientRect(); return tab.right > box.right + 1; });
    expect(await slowStrip.evaluate(element => element.scrollWidth > element.clientWidth + 1), 'the forced strip overflows').toBe(true);
    expect(await clipped(), 'the last tab starts clipped').toBe(true);
    const mainTop = await main(page).evaluate(element => element.scrollTop);
    const stripBox = (await slowStrip.boundingBox())!;
    await page.mouse.move(stripBox.x + 40, stripBox.y + stripBox.height / 2);
    for (let i = 0; i < 8 && await clipped(); i++) await page.mouse.wheel(0, 150);
    expect(await clipped(), 'wheel revealed the last tab').toBe(false);
    expect(await main(page).evaluate(element => element.scrollTop)).toBe(mainTop);
    await slowTab.click();
    await expect(slowTab).toHaveAttribute('aria-selected', 'true');
    await expect(workspace(page).getByLabel('스크롤 가능한 행 영역')).toBeVisible();
  });

  test('느린 실행 표를 끝까지 내리면 이어지는 휠은 바깥 컨테이너를 스크롤한다', async ({ page }) => {
    await giveRoom(page, main(page));
    await showSlowExecutions(page);
    const area = workspace(page).getByLabel('스크롤 가능한 행 영역');
    await expect(area).toBeVisible();
    const at = await centerOf(area);
    // Row heights settle after the first layout, so pin the bottom until two reads 300 ms apart agree.
    const pinBottom = () => area.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollHeight; });
    await expect.poll(async () => { const first = await pinBottom(); await page.waitForTimeout(300); return (await pinBottom()) === first && await area.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop <= 1); }).toBe(true);
    const before = await ancestorScroll(area);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
    await expect.poll(() => ancestorScroll(area)).toBeGreaterThan(before);
  });

  test('분석 보드 dock의 비넘침 탭 줄 위 휠도 바깥으로 넘어간다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.addInitScript(({ value }) => {
      localStorage.setItem('platform:board-layout-engine', 'dock');
      localStorage.setItem('platform:board:engineer', JSON.stringify(value));
    }, { value: { v: 1, activeSheetId: 'w', sheets: [{ id: 'w', name: '도킹', layout: '1x2', selected: 0, panes: [0, 1].map(i => ({ menuId: 'productivity-overview', params: {}, query: `?v=1&scopeId=MEM&${PERIOD}&roomNames=${['PHOTO', 'ETCH'][i]}` })) }] } });
    await page.goto('/board?sheet=dock');
    const strip = page.locator('[data-dock-layout] .dv-tabs-container').first();
    await expect(strip).toBeVisible();
    const scroller = main(page);
    await giveRoom(page, scroller);
    const at = await centerOf(strip);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  });
});



