import { expect, test } from '@playwright/test';
import { contextBar, evidence, expectScopeValid, mainHeading, query, setScenario, signInAs, switchScope } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
const PERIOD = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const PRODUCTIVITY = `/analytics/productivity?v=1&scopeId=ICH&${PERIOD}&roomNames=PH-101`;

test.describe('딥링크 복원 (06 §6.4)', () => {
  test('전역 Context와 page 소유 상태를 URL에서 그대로 복원한다', async ({ page }, testInfo) => {
    const url = `${PRODUCTIVITY}&granularity=day`;
    await page.goto(url);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expectScopeValid(page, 'ICH · Site A');
    const bar = contextBar(page);
    await expect(bar.getByRole('button', { name: '기간: 2026-09-25T09:00:00 – 2026-09-26T09:00:00' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'room_name PH-101' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: '집계 단위 (페이지 소유)' }).getByRole('radio', { name: '일' })).toBeChecked();
    expect(query(page).toString()).toBe(new URL(url, 'http://x').searchParams.toString());
    await evidence(page, testInfo, 'restored');

    await page.reload();
    await expect(page.getByRole('radiogroup', { name: '집계 단위 (페이지 소유)' }).getByRole('radio', { name: '일' })).toBeChecked();
    await expect(contextBar(page).getByRole('button', { name: 'room_name PH-101' })).toBeVisible();
  });

  test('기간이 빠진 시간 적용 메뉴는 기본 기간을 절대값으로 URL에 기록한다', async ({ page }, testInfo) => {
    await page.goto('/analytics/productivity?v=1&scopeId=ICH');
    await expect.poll(() => query(page).get('from')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(query(page).get('to')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    await expect(contextBar(page).getByRole('radio', { name: '1일' })).toBeChecked();
    await evidence(page, testInfo, 'default-period');
  });

  test('지원하지 않는 URL 버전은 자동 보정하지 않고 계약 오류로 보인다', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=2&scopeId=ICH');
    await expect(page.getByRole('alert')).toContainText('URL 계약 오류');
    await expect(page.getByRole('button', { name: 'Context 초기화' })).toBeVisible();
    expect(query(page).get('v')).toBe('2');
    await evidence(page, testInfo, 'contract-error');
  });
});

test.describe('메뉴 간 Context 보존과 미적용 표시 (06 §6, §22)', () => {
  test('메뉴를 옮겨도 등록된 전역 Context는 URL에 그대로 남는다', async ({ page }, testInfo) => {
    await page.goto(`${PRODUCTIVITY}&granularity=day`);
    await expectScopeValid(page, 'ICH · Site A');
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '설비 마스터' }).click();
    await expect(mainHeading(page)).toHaveText('설비 마스터');
    const q = query(page);
    expect(q.get('scopeId')).toBe('ICH');
    expect(q.get('from')).toBe('2026-09-25T09:00:00');
    expect(q.get('to')).toBe('2026-09-26T09:00:00');
    expect(q.getAll('roomNames')).toEqual(['PH-101']);
    // page-owned state of the origin is never copied implicitly (§22).
    expect(q.has('granularity')).toBe(false);
    // time is 'reference' on equipment master: carried and labelled, not applied.
    await expect(contextBar(page).getByRole('button', { name: /^기간:/ })).toContainText('참조만');
    await evidence(page, testInfo, 'equipment-after-link');
  });

  test('지원하지 않는 Context는 지우지 않고 "미사용"으로 표시하고, 지원 메뉴로 가면 적용된다', async ({ page }, testInfo) => {
    await page.goto('/equipment?v=1&scopeId=ICH&lotIds=LOT-A1023');
    await expectScopeValid(page, 'ICH · Site A');
    const lotChip = contextBar(page).locator('span', { has: page.getByRole('button', { name: '지우기 Lot' }) });
    await expect(lotChip).toContainText('LOT-A1023');
    await expect(lotChip).toContainText('이 화면에서 미사용');
    await evidence(page, testInfo, 'lot-not-used');

    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '사이클타임 상세' }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    expect(query(page).getAll('lotIds')).toEqual(['LOT-A1023']);
    await expect(contextBar(page)).toContainText('LOT-A1023');
    await expect(contextBar(page)).not.toContainText('이 화면에서 미사용');
    await evidence(page, testInfo, 'lot-applied');
  });
});

test.describe('권한 — 메뉴 비노출·직접 URL 거부 (06 §6.2, §17)', () => {
  test('권한 없는 메뉴는 내비게이션에 보이지 않는다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.getByRole('link', { name: '지표 카탈로그' })).toBeVisible();
    for (const hidden of ['설비 마스터', '생산성 개요', '사이클타임 상세', '공정 마스터 예정']) {
      await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
    }
    await evidence(page, testInfo, 'viewer-nav');
  });

  test('권한 없는 메뉴의 직접 URL은 화면 대신 권한 거부를 보인다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/equipment?v=1&scopeId=ICH');
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(page.getByText('permission=equipment:view')).toBeVisible();
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
});

test.describe('Scope·세션 전환 시 이전 결과 비노출 (06 §11, §19)', () => {
  test('Scope를 바꾸는 순간 이전 Scope의 결과는 사라지고 로딩으로 바뀐다', async ({ page }, testInfo) => {
    await page.goto(PRODUCTIVITY);
    await setScenario(page, '느린 응답 (+2.2s)');
    const kpis = page.getByRole('region', { name: '네 지표 요약' });
    const card = kpis.getByRole('button', { name: /^물리 점유율/ });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await evidence(page, testInfo, 'before-switch');

    await switchScope(page, 'CJU');
    await expect(card).toHaveCount(0);
    await expect(kpis.locator('[aria-busy="true"]').first()).toBeVisible();
    await evidence(page, testInfo, 'during-switch');
    // room_name is site-bound and cleared on a site change (ADR-0004).
    expect(query(page).get('scopeId')).toBe('CJU');
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

    await contextBar(page).getByRole('radio', { name: '7일' }).click();
    await expect.poll(() => query(page).get('from')).toBe('2026-09-19T09:00:00');
    await expect(card).toHaveCount(0);
    await expect(kpis.locator('[aria-busy="true"]').first()).toBeVisible();
    await evidence(page, testInfo, 'during-period-change');
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
  const EQUIPMENT = '/equipment?v=1&scopeId=ICH';
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

test.describe('returnTo 복귀 (06 §22)', () => {
  test('상세로 갔다가 "이전 화면으로"를 누르면 떠난 URL로 정확히 돌아온다', async ({ page }, testInfo) => {
    await page.goto(`/equipment?v=1&scopeId=ICH&${PERIOD}&status=active`);
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('table').getByRole('button', { name: '보기' }).first().click();
    await expect.poll(() => query(page).get('focus')).not.toBeNull();
    const origin = page.url().replace(/^https?:\/\/[^/]+/, '');

    await page.getByRole('link', { name: '전체 화면' }).click();
    await expect(page).toHaveURL(/\/equipment\/[^?]+\?/);
    expect(query(page).get('returnTo')).toBe(origin);
    await evidence(page, testInfo, 'detail');

    await page.getByRole('link', { name: '이전 화면으로' }).click();
    await expect.poll(() => page.url().replace(/^https?:\/\/[^/]+/, '')).toBe(origin);
    await expect(page.getByRole('table')).toBeVisible();
    await evidence(page, testInfo, 'returned');
  });

  test('앱 밖을 가리키는 returnTo는 따르지 않고 상위 메뉴로 돌아간다', async ({ page }, testInfo) => {
    await page.goto(`/equipment/EQ-X?v=1&scopeId=ICH&returnTo=${encodeURIComponent('https://example.com/phish')}`);
    const back = page.getByRole('link', { name: '이전 화면으로' });
    await expect(back).toBeVisible();
    const href = await back.getAttribute('href');
    expect(href).toMatch(/^\/equipment\?/);
    expect(href).not.toContain('example.com');
    await evidence(page, testInfo, 'unsafe-return-to');
  });
});
