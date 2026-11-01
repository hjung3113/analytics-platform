import { expect, test, type Page } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, railSection, systemSwitcher, openSwitcher, chooseSystem, headerMore } from './contract-helpers';
import { contextBar, evidence, expectScopeValid, mainHeading, query, setScenario, signInAs, storedUsageEvents, usageVisits } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
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
  // The bar draws no visible "전역 Context" label (06 §7, #914); "전역 Context" is only the region's accessible name.
  return contextBar(page).getByText('전역 Context', { exact: true });
}

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
      const trust = header.getByRole('button', { name: /데이터 신뢰|로직 버전 혼재/ });
      await expect(trust).toBeVisible();
      // Compact mode keeps the button, so the badges show that neither yielded too far.
      await expect(trust.getByText('잠정')).toBeVisible();
      // The overview's KPI range spans the mock logic cutover (#1008); the drilled equipment summary has no logic-version case.
      if (!drill) await expect(trust.getByText('로직 버전 혼재')).toBeVisible();
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
  test('상세 슬롯을 같은 1280px 뷰포트에서 열면 자체 폭 변화로 기간 프리셋이 접힌다', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expectScopeValid(page, 'MEM · 메모리');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    await expect(visibleContextLabel(page)).toHaveCount(0);
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
    await expect(visibleContextLabel(page)).toHaveCount(0);
    await expect(contextBar(page).getByRole('button', { name: /개 더/ })).toHaveCount(0);
    await expectContextBounds(page);
    await evidence(page, testInfo, 'context-wide-1920');
  });

  // #218: at the most common width the period presets and every condition stay inline. The bar draws no "전역 Context" label
  // (06 §7, #914), so only the controls' widths decide the presets' fold.
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&focus=MEM-PHOTO-0103');
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

test.describe('셸 고정 상세 슬롯 (06 §13, ADR-0013)', () => {
  for (const width of [1440, 1280]) {
    test(`focus로 열린 상세가 표 옆에 놓이고 닫기·Back/Forward로 복원된다 (${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&q=PHOTO&focus=${focus}&tab=validity`);
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
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&q=PHOTO&focus=${focus}&tab=validity`);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '상세 닫기' }).focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => query(page).has('focus')).toBe(false);
    await expect.poll(() => query(page).has('tab')).toBe(false);
    expect(query(page).get('q')).toBe('PHOTO');
    expect(query(page).get('scopeId')).toBe('MEM');
  });

  test('알 수 없는 drawer tab은 경고 탭으로 보이고 Back 복원 뒤에도 경고가 보인다 (W-350)', async ({ page }, testInfo) => {
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // Start on a valid tab: Radix Tabs seeds its internal state once at mount, so the regression needs the
    // drawer mounted on a real tab first and then reaching the unknown tab by history traversal.
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}&tab=bogus`);
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // W-350과 같이 유효 탭으로 마운트한 뒤 히스토리 순회로 알 수 없는 탭에 닿는다.
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}&tab=bogus`);
    await expect.poll(() => query(page).get('tab')).toBe('bogus');
    await expect(dialog.getByRole('alert')).toContainText('등록되지 않은 탭입니다.');
    await dialog.getByRole('button', { name: '속성 열기' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('tab', { name: '속성' })).toBeFocused();
    await evidence(page, testInfo, 'equipment-unknown-tab-recovery-focus');
  });

  test('탭 내용 안에 포커스가 있을 때 history로 탭이 바뀌면 선택된 탭으로 포커스가 간다 (#353)', async ({ page }, testInfo) => {
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const row = page.getByRole('main').locator('[data-row-id]').first();
    await expect(row).toBeVisible();
    const focus = await row.getAttribute('data-row-id');

    // The tab list itself stays; only the controlled tab value changes (Back with `tab` dropped).
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}&tab=validity`);
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    await expect(dialog.getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    const inner = dialog.getByRole('tabpanel').getByRole('button').first();
    await inner.focus();
    await expect(inner).toBeFocused();
    await page.evaluate(href => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `/mars/equipment-master?v=1&scopeId=MEM&focus=${focus}`);
    await expect(dialog.getByRole('tab', { name: '속성' })).toBeFocused();
    await evidence(page, testInfo, 'equipment-tab-content-focus-history');
  });
});

test.describe('워크스페이스 (06 §9.1)', () => {
  const ADMIN_URL = `/operations/admin-roles?v=1&scopeId=MEM&${PERIOD}&selectedEquipmentIds=MEM-PHOTO-0103&page=2`;
  // #314: the equipment table applies selectedEquipmentIds (1 row), so page=2 there is out of range and is
  // clamped away. lotIds is a registered global the equipment master does not apply — it stays in the URL
  // without narrowing the 54 rows, so page=2 is a real page and Back can restore it exactly.
  const EQUIPMENT_URL = `/mars/equipment-master?v=1&scopeId=MEM&${PERIOD}&lotIds=LOT-0001&page=2`;

  test('권한이 좁은 역할은 메뉴가 허락하는 공간 카드만 보고 운영 콘솔 메뉴가 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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

  // #1099: operations is visible through its accessible member menus; only admin has these grants in the mock.
  test('운영 콘솔은 열린 멤버 메뉴가 있는 admin에게 보이고 대시보드·VOC(수신함·Triage)·목록 범위가 실서버 필요 상태로 열린다', async ({ page }, testInfo) => {
    for (const role of ['engineer', 'viewer'] as const) {
      await signInAs(page, role);
      await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
      const popover = await openSwitcher(page);
      await expect(popover.getByRole('button', { name: /^FeedbackOps/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await signInAs(page, 'admin');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('button', { name: /^운영 콘솔/ })).toBeVisible();
    await expect(popover.getByRole('button', { name: /^FeedbackOps/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await chooseSystem(page, '운영 콘솔');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/dashboard');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '대시보드' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('플랫폼 서버');
    await expect(page.getByRole('button', { name: '새로고침' })).toBeDisabled();
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    await expect(page.getByText('목록 범위', { exact: true })).toBeVisible();
    await expect(page.getByTitle('실서버 필요').filter({ hasText: '전체' })).toBeDisabled();
    await evidence(page, testInfo, 'feedbackops-dashboard-mock');
    // #761: the VOC group (수신함, Triage) is bridge menus too; without a feature API each body is 실서버 필요.
    // The sidebar draws only the current section, so the rail's VOC section brings its menus in.
    await railSection(page, 'VOC').click();
    await expect(nav.getByRole('link', { name: '수신함' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Triage' })).toBeVisible();
    await nav.getByRole('link', { name: '수신함' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/inbox');
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    await nav.getByRole('link', { name: 'Triage' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/triage');
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    // #761 p2: Clusters is the third bridge menu of the group.
    await nav.getByRole('link', { name: 'Clusters', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/clusters');
    await expect(page.getByRole('main').getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    // #761 p1b: the sidebar views are links under their menus; in the mock no count badge is drawn (a badge would add the count to the link's accessible name, so the exact names prove it).
    await expect(nav.getByRole('link', { name: '연결 없음', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: '미배정', exact: true })).toBeVisible();
    await nav.getByRole('link', { name: '높음', exact: true }).click();
    await expect.poll(() => { const url = new URL(page.url()); return `${url.pathname}?tab=${url.searchParams.get('tab')}`; }).toBe('/operations/triage?tab=high');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: '높음', exact: true })).toHaveAttribute('aria-current', 'page');
    // #761 p3: the 저장된 보기 section is drawn by the shell; in the mock its body is 실서버 필요, and the collapsed sidebar has no section.
    const savedViews = page.getByRole('region', { name: '저장된 보기' });
    await expect(savedViews).toContainText('실서버 필요');
    await page.getByRole('button', { name: '사이드바 접기' }).click();
    await expect(page.getByRole('region', { name: '저장된 보기' })).toHaveCount(0);
    await page.getByRole('button', { name: '사이드바 펼치기' }).click();
    await evidence(page, testInfo, 'feedbackops-voc-mock');
  });

  test('공통 공간 권한 없는 운영 콘솔의 직접 URL은 멤버 메뉴 권한으로 거부한다', async ({ page }, testInfo) => {
    for (const role of ['engineer', 'viewer'] as const) {
      await signInAs(page, role);
      await page.goto(ADMIN_URL);
      await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
      // 본문은 Registry 공간 라벨과 요청 문장이다. 레일에는 이 공간이 없다.
      await expect(page.getByRole('main')).toContainText('권한/역할 관리');
      await expect(page.getByRole('main')).toContainText('관리자에게 요청하세요');
      await expect(page.getByRole('heading', { name: '권한/역할 관리' })).toHaveCount(0);
      // Denial never rewrites the address: pathname and the four global keys stay exactly as entered.
      expect(new URL(page.url()).pathname).toBe('/operations/admin-roles');
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
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/dashboard');
    const q = query(page);
    expect(q.get('scopeId')).toBe('MEM');
    expect(q.get('from')).toBe('2026-09-25T09:00:00');
    expect(q.get('to')).toBe('2026-09-26T09:00:00');
    expect(q.get('lotIds')).toBe('LOT-0001');
    // Globals survive the switch; page-owned state does not.
    expect(q.get('page')).toBeNull();
    await expect(nav.getByRole('link', { name: '대시보드' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toHaveCount(0);
    // Current markers: the switcher names the system, the rail section carries aria-current="true" (not "page").
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: 운영 콘솔');
    await expect(railSection(page, '대시보드')).toHaveAttribute('aria-current', 'true');
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
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/dashboard');
    const fwd = query(page);
    expect(fwd.get('scopeId')).toBe('MEM');
    expect(fwd.get('from')).toBe('2026-09-25T09:00:00');
    expect(fwd.get('to')).toBe('2026-09-26T09:00:00');
    expect(fwd.get('lotIds')).toBe('LOT-0001');
    expect(fwd.get('page')).toBeNull();
    await expect(nav.getByRole('link', { name: '대시보드' })).toBeVisible();
    await evidence(page, testInfo, 'admin-history-forward');

    await chooseSystem(page, 'MARS');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/equipment-master');
    const back = query(page);
    expect(back.get('scopeId')).toBe('MEM');
    expect(back.get('from')).toBe('2026-09-25T09:00:00');
    expect(back.get('to')).toBe('2026-09-26T09:00:00');
    expect(back.get('lotIds')).toBe('LOT-0001');
    expect(back.get('page')).toBe('2');
    await evidence(page, testInfo, 'admin-back');
  });

  test('옛 메뉴 주소는 정식 주소로 replace되고 search(v1·returnTo)는 바이트 그대로 남으며 기록 길이는 늘지 않는다 (ADR-0093)', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByRole('main')).toBeVisible();
    const before = await page.evaluate(() => history.length);
    // from/to are given, so the default-period write that follows a redirect has nothing to add.
    const search = '?v=1&scopeId=MEM&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00&returnTo=%2Fequipment%3Fv%3D1';
    await page.goto(`/hw-time/steps${search}`);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/hw-time-steps');
    expect(new URL(page.url()).search).toBe(search);
    // goto adds exactly one entry; a push by the alias redirect would make it two.
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
  });
});

test.describe('플랫폼 홈 · 전역 화면 (ADR-0028, ADR-0070)', () => {
  test('viewer는 홈에서 공지와 내 VOC를 열고, 전역 화면에는 업무 사이드바 대신 플랫폼 사이드바가 있다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/home');
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
    await page.goto('/home');
    await page.getByRole('link', { name: '공지 목록' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/notices');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' })).toBeVisible();
    await evidence(page, testInfo, 'viewer-home-global');
  });

  test('mock에서는 홈에 내 할 일 구역도 실서버 필요 안내도 없고, 업무 시스템 다음에 즐겨찾기가 이어진다 (#657)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: '플랫폼 홈' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '즐겨찾기' })).toBeVisible();
    await expect(page.getByRole('region', { name: '내 할 일' })).toHaveCount(0);
    await expect(page.getByText('실서버 필요')).toHaveCount(0);
    const systems = await page.getByRole('region', { name: '업무 시스템' }).boundingBox();
    const favorites = await page.getByRole('heading', { name: '즐겨찾기' }).boundingBox();
    expect(systems!.y).toBeLessThan(favorites!.y);
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    await expect(railSection(page, '설비관리')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설비 마스터' })).toHaveAttribute('aria-current', 'page');
    await evidence(page, testInfo, 'global-rail-marker');
  });
});

test.describe('전역 기능 자리 (ADR-0070, 06 §9.1·§10)', () => {
  test('전환기의 플랫폼 메뉴에서 알림을 열면 팝오버가 닫히고 플랫폼 사이드바가 그 화면을 가리킨다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    const popover = await openSwitcher(page);
    const platformMenu = popover.getByRole('navigation', { name: '플랫폼 메뉴' });
    await expect(platformMenu.getByRole('link')).toHaveText(['홈', '알림', '내 VOC', '응답 설문', '권한 요청', '공지']);
    await evidence(page, testInfo, 'platform-menu-switcher');
    await platformMenu.getByRole('link', { name: '알림' }).click();
    await expect(popover).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/notifications');
    await expect(page.getByRole('main').getByRole('heading', { name: '알림' })).toBeFocused();
    await expect(page.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '알림' })).toHaveAttribute('aria-current', 'page');
    await expect(systemSwitcher(page)).toHaveAccessibleName('시스템 및 플랫폼 메뉴');
  });

  test('mock 미리보기의 알림 화면은 실서버 필요 상태를 보이고 기능 목록을 열지 않는다 (ADR-0071)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/notifications');
    await expect(page.getByRole('main').getByRole('heading', { name: '알림' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
    await expect(page.getByTestId('home-inbox-list')).toHaveCount(0);
  });

  test('레일 알림 종은 mock에서 배지 없이 보이고 키보드로 팝오버를 열고 모두 보기로 알림 화면에 간다 (#652)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    const rail = page.getByRole('navigation', { name: '시스템 레일' });
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
    await page.goto('/bravo/metric-catalog');
    const popover = await openSwitcher(page);
    await popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '설문' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/survey');
    await expect(page.getByRole('main').getByRole('heading', { name: '응답 설문' })).toBeFocused();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    const sidebarSurveys = page.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '응답 설문', exact: true });
    await expect(sidebarSurveys).toHaveAttribute('aria-current', 'page');

    await page.goto('/survey/11111111-1111-4111-8111-111111111111/respond');
    await expect(page.getByRole('main').getByRole('heading', { name: '설문 응답' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    await expect(sidebarSurveys).toHaveAttribute('aria-current', 'page');
    const switcher = await openSwitcher(page);
    await expect(switcher.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link')).toHaveText(['홈', '알림', '내 VOC', '응답 설문', '권한 요청', '공지']);

    await page.goto('/survey/not-a-uuid/respond');
    await expect(page.getByText('설문을 찾을 수 없습니다')).toBeVisible();
  });

  test('내 VOC는 mock에서 실서버 필요 상태를 보이고 상세 주소는 내 VOC 아래에 놓이며 잘못된 VOC ID는 찾을 수 없음이다 (#654)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    const popover = await openSwitcher(page);
    await popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '내 VOC' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/voc');
    await expect(page.getByRole('main').getByRole('heading', { name: '내 VOC' })).toBeFocused();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    const sidebarVoc = page.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '내 VOC', exact: true });
    await expect(sidebarVoc).toHaveAttribute('aria-current', 'page');

    await page.goto('/voc/11111111-1111-4111-8111-111111111111');
    await expect(page.getByRole('main').getByRole('heading', { name: '내 VOC 상세' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    await expect(sidebarVoc).toHaveAttribute('aria-current', 'page');

    await page.goto('/voc/not-a-uuid');
    await expect(page.getByText('VOC를 찾을 수 없습니다')).toBeVisible();
  });

  test('권한 요청은 mock에서 실서버 필요 상태를 보이고 사이드바 항목에 예정 표시가 없다 (#657)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    const popover = await openSwitcher(page);
    await popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link', { name: '권한 요청' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/permission-requests');
    await expect(page.getByRole('main').getByRole('heading', { name: '권한 요청' })).toBeFocused();
    await expect(page.getByRole('status')).toContainText('실서버 필요');
    const sidebar = page.getByRole('navigation', { name: '플랫폼 메뉴' });
    await expect(sidebar.getByRole('link', { name: '권한 요청', exact: true })).toHaveAttribute('aria-current', 'page');
    // 공지 has no screen yet and keeps its own 예정 label; only 권한 요청 lost it.
    await expect(sidebar.getByRole('link', { name: '권한 요청', exact: true })).not.toContainText('예정');
  });

  test('VOC 등록은 사이드바 링크가 아니라 레일 버튼의 서랍이고 mock에서는 실서버 필요 상태를 보인다 (#656)', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    await expect(page.getByRole('navigation', { name: '기능 · BRAVO' }).getByRole('link', { name: 'VOC 등록' })).toHaveCount(0);
    await page.getByRole('button', { name: 'VOC 등록', exact: true }).click();
    const drawer = page.getByRole('complementary', { name: 'VOC 등록' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('status').filter({ hasText: '실서버 필요' })).toBeVisible();
  });

  test('플랫폼 사이드바는 업무 사이드바와 접힘 상태를 함께 쓴다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/home');
    const platformNav = page.getByRole('navigation', { name: '플랫폼 메뉴' });
    await expect(platformNav.getByRole('group').first()).toBeVisible();
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toBeVisible();
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toBeVisible();
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: '사이드바 접기' })).toBeVisible();
  });

  test('메뉴 검색은 플랫폼 메뉴 목적지를 플랫폼 › 그룹 › 메뉴로 찾는다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/home');
    await page.keyboard.press('Control+K');
    await page.getByRole('combobox', { name: '메뉴 검색' }).fill('권한 요청');
    const option = page.getByRole('option', { name: /권한 요청/ });
    await expect(option).toContainText('플랫폼 › 내 활동 › 권한 요청');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/permission-requests');
  });

  test('사용자 메뉴의 언어 항목이 화면 언어를 바꾼다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await page.goto('/home');
    const rail = page.getByRole('navigation', { name: '시스템 레일' });
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
    await expect(page).not.toHaveURL(/\/mars\/productivity-overview/);
    // The scenario is still on, so the home screen fails on its own data — and that failure is contained the same way.
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toBeVisible();
    await setScenario(page, '정상');
    await expect(main.getByText('이 화면에서 오류가 발생했습니다')).toHaveCount(0);
    await expect(mainHeading(page)).not.toHaveText('생산성 개요');
  });
});

test.describe('메뉴 활용률 (06 §4, docs/05 — kernel이 recordUsage로 계측, 콘솔은 집계만 읽는다)', () => {
  const DIRECT_URL = '/operations/admin-usage';

  test('권한 없는 역할(engineer)은 메뉴가 비노출이고 직접 URL은 메뉴 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 활용률' })).toHaveCount(0);

    await page.goto(DIRECT_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(main).toContainText('메뉴 활용률');
    await expect(main).toContainText('관리자에게 요청하세요');
    // The client gate refuses without redirecting: the URL the user typed stays exact.
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_URL);
    await evidence(page, testInfo, 'usage-engineer-space-denied');
  });

  test('viewer도 메뉴가 비노출이고 직접 URL은 메뉴 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/bravo/metric-catalog');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '메뉴 활용률' })).toHaveCount(0);

    await page.goto(DIRECT_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(main).toContainText('메뉴 활용률');
    await expect(main).toContainText('관리자에게 요청하세요');
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_URL);
    await evidence(page, testInfo, 'usage-viewer-space-denied');
  });

  test('관리자: 설비를 다녀오면 설비 마스터 행의 방문 수가 정확히 +1이다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    // The usage store lives in the tab's JS realm, so the round trip must be SPA navigation (command
    // palette spans every accessible space) — a document reload restarts the mock server and erases counts.
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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
    await page.goto('/operations/admin-roles');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await nav.getByRole('link', { name: '변경 감사' }).click();
    await expect(page).toHaveURL(/\/operations\/admin-audit/);
    await expect.poll(async () => (await storedUsageEvents(page)).filter(e => e.name === 'entry' && e.via === 'sidebar').length, { timeout: 10_000 }).toBeGreaterThan(0);
    const rows = (await storedUsageEvents(page)).filter(e => e.name === 'entry');
    expect(rows[0]).toMatchObject({ menuId: 'admin-roles', via: 'direct', fromMenuId: null });
    expect(rows[1]).toMatchObject({ menuId: 'admin-audit', via: 'sidebar', fromMenuId: 'admin-roles' });
  });
});

test.describe('메뉴 레지스트리 (06 §9.1 — console declarations read back through the client registry)', () => {
  const DIRECT_URL = '/operations/admin-registry';
  const DIRECT_FOCUS_URL = `${DIRECT_URL}?v=1&focus=equipment-master`;
  const NEEDLES = ['레지스트리', 'admin-registry', '메뉴 레지스트리'];

  // Kernel per-user recent store (packages/sdk/kernel/src/platform.tsx): localStorage key
  // `platform:recent:${userId}` (userId = role id on the mock adapter), value Recent[] = { menuId, url, at }.
  // The denied operations row is seeded first (it must never surface) plus one row the role does own,
  // so a passing assertion means the visibleMenus guard filtered it — not that the list is simply empty.
  const seedRecent = (page: Page, role: 'engineer' | 'viewer', accessible: { menuId: string; url: string }) =>
    page.addInitScript(({ key, accessible }) => {
      localStorage.setItem(key, JSON.stringify([
        { menuId: 'admin-registry', url: '/operations/admin-registry', at: 1_000 },
        { ...accessible, at: 900 },
      ]));
    }, { key: `platform:recent:${role}`, accessible });

  const searchPalette = async (page: Page, needle: string) => {
    await page.getByRole('button', { name: '메뉴 검색…' }).click();
    await page.getByRole('dialog').getByRole('combobox').fill(needle);
  };

  test('권한 없는 역할(engineer)은 메뉴가 비노출이고 직접 URL은 메뉴 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await seedRecent(page, 'engineer', { menuId: 'equipment-master', url: '/mars/equipment-master' });
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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
    await expect(recentList.locator('a[href="/operations/admin-registry"]')).toHaveCount(0);

    await page.goto(DIRECT_FOCUS_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(main).toContainText('메뉴 레지스트리');
    await expect(main).toContainText('관리자에게 요청하세요');
    // The member-menu gate replaces the page: no registry table and no declaration drawer/dialog content.
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(main.getByText('requiresScope')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The client gate refuses without redirecting: the URL the user typed stays exact.
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_FOCUS_URL);
    await evidence(page, testInfo, 'registry-engineer-space-denied');
  });

  test('viewer도 메뉴가 비노출이고 직접 URL은 메뉴 거부다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await seedRecent(page, 'viewer', { menuId: 'metric-catalog', url: '/bravo/metric-catalog' });
    await page.goto('/bravo/metric-catalog');
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
    await expect(recentList.locator('a[href="/operations/admin-registry"]')).toHaveCount(0);

    await page.goto(DIRECT_FOCUS_URL);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(main).toContainText('메뉴 레지스트리');
    await expect(main).toContainText('관리자에게 요청하세요');
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(main.getByText('requiresScope')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(DIRECT_FOCUS_URL);
    await evidence(page, testInfo, 'registry-viewer-space-denied');
  });

  test('관리자: 팔레트 검색으로 메뉴 레지스트리(운영 콘솔)에 도달한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    // Positive control for the non-exposure checks above: the same search finds the menu for admin.
    await expect(page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await searchPalette(page, '레지스트리');
    const option = page.getByRole('dialog').getByRole('option', { name: /메뉴 레지스트리/ });
    await expect(option).toHaveCount(1);
    await expect(option).toContainText('운영 콘솔');
    await expect(option).toContainText('플랫폼 관리');
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
    await expect(row).toContainText('/mars/equipment-master');
    await expect(row).toContainText('equipment:view');

    await row.getByRole('button', { name: 'equipment-master 보기' }).click();
    await expect(page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog')).toContainText('requiresScope');
    // The drawer is opened by writing the focus page key (§6.1): the URL carries it.
    expect(page.url()).toContain('focus=equipment-master');
    await evidence(page, testInfo, 'registry-admin-declaration');
  });
});

test.describe('권한/역할 (06 §9.1, §17 — console access directory, read-only)', () => {
  test('engineer는 메뉴가 비노출이고 직접 URL에서 메뉴 거부를 본다', async ({ page }, testInfo) => {
    const directUrl = '/operations/admin-roles?v=1&focus=admin';
    await signInAs(page, 'engineer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '설비 마스터' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한/역할 관리' })).toHaveCount(0);

    await page.goto(directUrl);
    const main = page.getByRole('main');
    await expect(main).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(main).toContainText('권한/역할 관리');
    await expect(main).toContainText('관리자에게 요청하세요');
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(directUrl);
    await evidence(page, testInfo, 'roles-engineer-space-denied');
  });

  test('admin은 세 주체를 조회하고 engineer 사이트 범위 드로어를 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/operations/admin-roles');
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
    await page.goto('/operations/admin-roles');
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

  test('permission 조건은 목록을 필터링하고 잘못된 값은 경고한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/operations/admin-roles?v=1&filter=permission:in:console:access');
    const table = page.getByRole('main').getByRole('table', { name: '권한/역할 목록' });
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByRole('row').filter({ hasText: 'Platform Admin' })).toBeVisible();
    await expect(table.getByRole('row').filter({ hasText: 'Process Engineer' })).toHaveCount(0);
    await expect(table.getByRole('row').filter({ hasText: 'Field Requester' })).toHaveCount(0);
    await evidence(page, testInfo, 'roles-console-access-filter');

    await page.goto('/operations/admin-roles?v=1&filter=permission:in:bogus');
    const main = page.getByRole('main');
    await expect(main.getByRole('alert')).toContainText('권한 “permission:in:bogus”');
    await expect(main.getByRole('table')).toHaveCount(0);
    await evidence(page, testInfo, 'roles-invalid-permission-filter');
  });
});

test.describe('메뉴 이동 포커스 (06 §26)', () => {
  test('팔레트와 사이드바 키보드 이동 뒤 새 화면 제목에 포커스가 남는다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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

