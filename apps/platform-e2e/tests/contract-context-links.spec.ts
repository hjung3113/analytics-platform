import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, railSection, headerMore, periodPreset } from './contract-helpers';
import { contextBar, evidence, expandPageHead, expectScopeValid, firstRowByColumn, lotColumn, mainHeading, query, rowMapsByColumn, setScenario, showSlowExecutions, signInAs, switchScope, tableStatusLine } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
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

test.describe('딥링크 복원 (06 §6.4)', () => {
  test('전역 Context와 page 소유 상태를 URL에서 그대로 복원한다', async ({ page }, testInfo) => {
    const url = `${PRODUCTIVITY}&granularity=day`;
    await page.goto(url);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = contextBar(page);
    await expect(bar.getByRole('button', { name: '기간: 09-25 09:00 → 09-26 09:00 (24h)' })).toBeVisible();
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
    await page.goto('/mars/productivity-overview?v=1&scopeId=MEM');
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
    await page.goto('/mars/equipment-master?v=2&scopeId=MEM');
    await expect(page.getByRole('alert')).toContainText('주소에 쓸 수 없는 값이 있습니다');
    await expect(page.getByRole('button', { name: '조건 초기화' })).toBeVisible();
    expect(query(page).get('v')).toBe('2');
    await evidence(page, testInfo, 'contract-error');
  });

  test('주소 오류 화면의 조건 초기화는 눌린 뒤 포커스를 main으로 보낸다', async ({ page }) => {
    await page.goto('/mars/equipment-master?v=2&scopeId=MEM');
    await page.getByRole('button', { name: '조건 초기화' }).click();
    await expect(page.getByRole('button', { name: '조건 초기화' })).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
  });

  test('표 정렬·페이지·드로어 탭을 등록된 page key로 복원하고 새로고침에도 유지한다', async ({ page }, testInfo) => {
    // Fixture: MEM equipment list fills page 1 (25/row) and overflows to page 2.
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByTestId('page-filter-bar')).toBeVisible();
    const focus = await page.locator('[data-row-id]').first().getAttribute('data-row-id');
    expect(focus).toBeTruthy();

    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&sort=status:desc&page=2&focus=${focus}&tab=audit`);
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM&page=2');
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
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe('/mars/equipment-master?v=1&scopeId=MEM&page=2');
    await expect(tableStatusLine(page)).toContainText(/2\/\d+/);
    await evidence(page, testInfo, 'back-restores-page');
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
    await page.goto(`/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
    await showSlowExecutions(page);
    const lots = await lotColumn(page);
    const lot = lots[0];
    expect(lots.some(l => l !== lot), 'fixture needs more than one Lot in the unfiltered period').toBe(true);

    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&roomNames=PHOTO&${PERIOD}&lotIds=${lot}`);
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
    await page.goto('/bravo/metric-catalog');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    for (const hidden of ['설비 마스터', '생산성 개요', '사이클타임 상세', '공정 마스터 예정']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
    await evidence(page, testInfo, 'viewer-nav');
  });

  test('권한 없는 메뉴의 직접 URL은 화면 대신 권한 거부를 보인다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(page.getByText('permission=equipment:view')).toHaveCount(0);
    await expect(page.getByText('설비 마스터')).toBeVisible();
    await expect(page.getByText('관리자에게 요청하세요')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await evidence(page, testInfo, 'viewer-direct-url');
  });

  test('권한 없는 Scope는 다른 Scope로 대체하지 않고 서버 거부로 보인다', async ({ page }, testInfo) => {
    await page.goto(`/mars/productivity-overview?v=1&scopeId=XIA&${PERIOD}`);
    await expect(page.getByRole('button', { name: /^Scope:/ })).toContainText('접근 불가');
    await expect(page.getByText('이 Scope에 접근 권한이 없습니다').first()).toBeVisible();
    expect(query(page).get('scopeId')).toBe('XIA');
    await evidence(page, testInfo, 'forbidden-scope');
  });

  test('Scope 확인이 실패하면 "확인 중"에 멈추지 않고 실패와 다시 시도를 보이며, 서버가 돌아오면 다시 시도로 화면이 열린다 (#167)', async ({ page }, testInfo) => {
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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
    await page.goto('/mars/equipment-detail/MEM-PHOTO-0103?v=1&scopeId=MEM&selectedEquipmentIds=MEM-PHOTO-0105');
    await expect(header.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(panel.getByText('MEM-PHOTO-0103')).toBeVisible();
    await expect(panel.getByText('STG-PHOTO-A')).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0);
    expect(query(page).get('selectedEquipmentIds')).toBe('MEM-PHOTO-0105');
    await expect(page.getByRole('main')).not.toContainText('STG-PHOTO-B');
    await evidence(page, testInfo, 'entity-room-granted');

    // 2. Same site, ungranted room (DIFF): the site grant holds, but the row's room is re-checked server-side — on both surfaces.
    // The heading shows the URL id, which contains DIFF, so the leak check uses model/stgroup/maker instead of the room token.
    await page.goto('/mars/equipment-detail/MEM-DIFF-0176?v=1&scopeId=MEM');
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
    await page.goto('/mars/equipment-detail/DOES-NOT-EXIST?v=1&scopeId=MEM');
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
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
    await expect(page.getByRole('main').locator('[data-row-id]').first()).toBeVisible({ timeout: 10_000 });
    await page.goto('/mars/equipment-master?v=1');
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

test.describe('메뉴 간 링크 허용 여부 (06 §22 — 목적지 권한을 링크가 안다)', () => {
  const METRIC_USAGE = '/bravo/metric-detail/cycle_time?v=1&version=4';

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
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&${PERIOD}&status=active`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    const origin = page.url().replace(/^https?:\/\/[^/]+/, '');

    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/mars\/equipment-detail\/[^?]+\?/);
    expect(query(page).get('returnTo')).toBe(origin);
    await evidence(page, testInfo, 'detail');

    await (await headerMore(page)).getByRole('link', { name: '← 설비 마스터' }).click();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(origin);
    await expect(page.getByRole('table')).toBeVisible();
    await evidence(page, testInfo, 'returned');
  });

  test('복귀로 다시 열린 상세 패널은 제목 포커스를 빼앗지 않고, 첫 Escape가 패널을 닫는다 (#356, ADR-0032)', async ({ page }, testInfo) => {
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&${PERIOD}`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/mars\/equipment-detail\/[^?]+\?/);
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
    await page.goto(`/mars/equipment-master?v=1&scopeId=MEM&${PERIOD}`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    const dialog = page.getByRole('complementary', { name: '상세 패널' }).getByRole('dialog');
    // Same-screen open still claims the close button (06 §13).
    await expect(dialog.getByRole('button', { name: '상세 닫기' })).toBeFocused();
    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/mars\/equipment-detail\/[^?]+\?/);
    await page.goBack();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '설비 마스터' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: '상세 닫기' })).not.toBeFocused();
    await evidence(page, testInfo, 'history-back-panel-title-focus');
  });

  test('전체 화면 링크는 보던 탭을 목적지 tab으로 넘긴다 (06 §13)', async ({ page }, testInfo) => {
    await page.goto('/mars/equipment-master?v=1&scopeId=MEM');
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
    await expect(page).toHaveURL(/\/mars\/equipment-detail\/[^?]+\?/);
    await expect(page.getByRole('main').getByRole('tablist', { name: '설비 상세 탭' }).getByRole('tab', { name: '유효구간 이력' })).toHaveAttribute('aria-selected', 'true');
    await evidence(page, testInfo, 'fullscreen-carries-tab');
  });

  test('사이클타임 bucket·bin·정렬을 returnTo에 그대로 남기고 복귀 후에도 유지한다', async ({ page }, testInfo) => {
    const base = '/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
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
    await expect(page).toHaveURL(/\/mars\/execution-detail\/[^?]+\?/);
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
    await page.goto(`/mars/equipment-detail/EQ-X?v=1&scopeId=MEM&returnTo=${encodeURIComponent('https://example.com/phish')}`);
    const back = (await headerMore(page)).getByRole('link', { name: '← 설비 마스터' });
    await expect(back).toBeVisible();
    const href = await back.getAttribute('href');
    expect(href).toMatch(/^\/mars\/equipment-master\?/);
    expect(href).not.toContain('example.com');
    await evidence(page, testInfo, 'unsafe-return-to');
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
    await expect(page).toHaveURL(/\/mars\/equipment-detail\/MEM-PHOTO-0103/);
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


test.describe('지표 목록→상세 복귀 (06 §22)', () => {
  test('검색·정렬 복원과 진입 방식별 상세 머리 복귀 링크', async ({ page }, testInfo) => {
    await page.goto('/bravo/metric-catalog?v=1&q=time&sort=nameSort:asc');
    await page.getByRole('table', { name: '지표 카탈로그', exact: true }).getByRole('link', { name: 'cycle_time', exact: true }).click();
    await expect(page).toHaveURL(/\/bravo\/metric-detail\/cycle_time\?/);
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

    await page.goto('/bravo/metric-detail/cycle_time?v=1&version=3');
    const direct = await headerMore(page);
    await expect(direct.getByRole('link', { name: '카탈로그', exact: true })).toHaveCount(1);
    await expect(direct.getByRole('link', { name: '← 지표 카탈로그', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'metric-detail-direct');
  });

  test('Context 적용 없이 복귀하면 되돌림 알림이 없다', async ({ page }, testInfo) => {
    await page.goto('/bravo/metric-catalog?v=1&q=time&sort=nameSort:asc');
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
    await page.goto('/bravo/metric-detail/cycle_time?v=1&version=4&returnTo=%2Foperations%2Fadmin-roles%3Fv%3D1');
    const main = page.getByRole('main');
    await expect((await headerMore(page)).getByRole('link', { name: '← 지표 카탈로그', exact: true })).toHaveAttribute('href', '/bravo/metric-catalog?v=1');
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

    await page.goto('/bravo/metric-detail/cycle_time?v=1&tab=history');
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
    await page.goto('/bravo/metric-detail/cycle_time?v=1&tab=definition');
    const definitionHeading = page.getByRole('heading', { name: '정의', exact: true, level: 2 });
    await expect(definitionHeading).toBeVisible();
    await gateEvidenceVisible();
    await landingBelowStickyHeader(definitionHeading);
    await evidence(page, testInfo, 'metric-definition-anchor-below-sticky-header');
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
    await page.goto('/mars/cycle-time?scopeId=MEM');
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
    await page.goto(`/mars/cycle-time?scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
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
    await page.goto(`/mars/cycle-time?scopeId=MEM&roomNames=PHOTO&${PERIOD}`);
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
    await expect(page.getByRole('region', { name: '칸 2 · 분석 Context' })).not.toContainText('미적용 변경');
    await page.getByRole('button', { name: '칸 1 선택' }).click();
    await expect(page.getByRole('region', { name: '칸 1 · 분석 Context' })).toContainText('미적용 변경 1개 · 공유에서 제외');
  });
  test('최근 조건은 bare 재방문과 수동 선택에서 초안만 복원하고 적용 때 분석 요청을 한 번 보낸다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.setViewportSize({ width: 1280, height: 900 });
    const requestCount = () => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
      .filter(entry => (entry as PerformanceMark).detail?.endpoint === 'analytics.cycle.kpi').length);
    await page.goto('/mars/cycle-time?scopeId=MEM');
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
    await page.goto('/mars/cycle-time?scopeId=MEM');
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

test.describe('조건 묶음 (06 §6.4·§11, ADR-0083)', () => {
  const BOTH = encodeURIComponent(JSON.stringify({ maker: ['TEL'], stgroup: ['STG-PHOTO-A'] }));
  const STG_ONLY = encodeURIComponent(JSON.stringify({ stgroup: ['STG-PHOTO-A'] }));
  const base = `/mars/cycle-time?scopeId=MEM&roomNames=PHOTO&${PERIOD}`;
  const kpiRequests = (page: Page) => page.evaluate(() => performance.getEntriesByName('platform:mock-menu-query')
    .filter(entry => (entry as PerformanceMark).detail?.endpoint === 'analytics.cycle.kpi').length);
  async function openBar(page: Page) {
    const bar = contextBar(page);
    await expect(bar).toBeVisible();
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    return bar;
  }
  const switcher = (scope: Locator | Page) => scope.getByRole('radiogroup', { name: '조건 묶음' });
  const condition = (page: Page) => JSON.parse(query(page).get('equipmentGroup') ?? 'null') as Record<string, string[]> | null;

  test('기본 설비 기준은 Maker·Model만 보이고 StGroup은 미적용 칩으로 남으며, 조직 기준 전환은 적용 때만 한 번 조회한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(`${base}&equipmentGroup=${BOTH}`);
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = await openBar(page);
    await expandPageHead(page);
    await bar.getByRole('button', { name: '적용', exact: true }).click().catch(() => undefined);
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('요약 조회 완료');
    await expect(switcher(bar).getByRole('radio', { name: '설비 기준' })).toBeChecked();
    await expect(bar.getByText(/StGroup .* · 설비 기준에서 미적용/)).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Maker', exact: true })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'StGroup', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'condition-preset-default');

    // Request boundaries: settle first, observe a request-free draft phase, then count exactly one applied query.
    const busy = page.locator('[role="status"][aria-busy="true"]');
    await expect(busy).toHaveCount(0);
    const before = await kpiRequests(page);
    await switcher(bar).getByRole('radio', { name: '조직 기준' }).click();
    await expect(switcher(bar).getByRole('radio', { name: '조직 기준' })).toBeChecked();
    await page.waitForTimeout(1000);
    expect(await kpiRequests(page)).toBe(before);
    expect(query(page).get('conditionSet')).toBeNull();
    await bar.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('conditionSet')).toBe('organization');
    await expect.poll(() => kpiRequests(page)).toBeGreaterThan(before);
    await expect(busy).toHaveCount(0);
    await expect(page.getByRole('region', { name: '적용된 조회 조건' })).toContainText('요약 조회 완료');
    await page.waitForTimeout(1000);
    expect(await kpiRequests(page)).toBe(before + 1);
    await expect(bar.getByText(/Maker .* · 조직 기준에서 미적용/)).toBeVisible();
    // The global Condition is untouched: both axes stay in the URL.
    expect(condition(page)).toEqual({ maker: ['TEL'], stgroup: ['STG-PHOTO-A'] });
    await evidence(page, testInfo, 'condition-preset-organization');
  });
  test('conditionSet 없이 StGroup만 담은 링크는 조직 기준으로 열린다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto(`${base}&equipmentGroup=${STG_ONLY}`);
    await expectScopeValid(page, 'MEM · 메모리');
    const bar = await openBar(page);
    await expect(switcher(bar).getByRole('radio', { name: '조직 기준' })).toBeChecked();
    await expect(bar.getByText(/미적용/)).toHaveCount(0);
  });
  test('다른 메뉴로 가도 전역 Condition의 Maker 값은 그대로다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto(`${base}&equipmentGroup=${BOTH}`);
    await expectScopeValid(page, 'MEM · 메모리');
    const source = await openBar(page);
    await switcher(source).getByRole('radio', { name: '조직 기준' }).click();
    await source.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => query(page).get('conditionSet')).toBe('organization');
    await expect(page.locator('[role="status"][aria-busy="true"]')).toHaveCount(0);
    // Reach the destination through the app's own navigation; the destination URL is never supplied by the test.
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '생산성 개요' }).click();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    expect(condition(page)).toEqual({ maker: ['TEL'], stgroup: ['STG-PHOTO-A'] });
    const bar = await openBar(page);
    await expect(bar).toContainText('TEL');
    await expect(switcher(bar)).toHaveCount(0);
  });
  test('보드 칸의 조회 조건에도 전환기가 있고 그 칸만 바뀐다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.addInitScript(() => { localStorage.setItem('platform:board-layout-engine', 'grid'); });
    await page.addInitScript(([period, group]) => {
      const screen = { menuId: 'cycle-time', params: {}, query: `?scopeId=MEM&roomNames=PHOTO&${period}&equipmentGroup=${group}` };
      localStorage.setItem('platform:board:engineer', JSON.stringify({ v: 1, activeSheetId: 'sets', sheets: [{ id: 'sets', name: '묶음', layout: '1x2', selected: 0, panes: [screen, screen] }] }));
    }, [PERIOD, BOTH]);
    await page.goto('/board?sheet=sets');
    const first = page.getByRole('region', { name: '칸 1 · 분석 Context' });
    await first.getByRole('button', { name: '조회 조건 펼치기' }).click();
    await switcher(page).getByRole('radio', { name: '조직 기준' }).click();
    await expect(switcher(page).getByRole('radio', { name: '조직 기준' })).toBeChecked();
    // Close pane 1's popover first: it overlays the board and would take the next click.
    await page.keyboard.press('Escape');
    await expect(switcher(page)).toHaveCount(0);
    await page.getByRole('button', { name: '칸 2 선택' }).click();
    await page.getByRole('region', { name: '칸 2 · 분석 Context' }).getByRole('button', { name: '조회 조건 펼치기' }).click();
    await expect(switcher(page).getByRole('radio', { name: '설비 기준' })).toBeChecked();
  });
});

