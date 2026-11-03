import { expect, test, type Page } from '@playwright/test';
import { mainHeading, query, signInAs } from './support';
import { PRODUCTIVITY } from './contract-helpers';

/**
 * 기능 › 관리자 (#764 p2, ADR-0110): 시스템, 분석 영역 and 흐름 정책 (업무 흐름 설정) plus 권한 요청 검토 and 부여 목록 (운영 콘솔 권한) as bridge menus. The e2e run uses the mock adapter, where `FeatureBridge` renders only `실서버 필요`,
 * so no screen or drawer mounts here; the screens, the drawers and `Coverage → 설정` (needs the real recovery data) are covered by the page and bridge tests and the conductor's real-server check.
 * In the mock only admin holds `features:access` (and `console:access` with it), so a persona with `features:access` alone does not exist here; that case is the harness test in `@ap/menu-feature-admin`.
 */
const ROW = '99999999-9999-4999-8999-999999999999';
const SETTINGS_MENUS = ['시스템', '분석 영역', '흐름 정책'];
const ACCESS_MENUS = ['권한 요청 검토', '부여 목록'];

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const sections = (page: Page) => page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('업무 흐름 설정·운영 콘솔 권한 그룹(#764 p2, #1099c)', () => {
  test('admin의 업무 흐름 레일 설정 섹션은 세 메뉴를 순서대로 보인다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/flow/dashboard');
    await sections(page).getByRole('button', { name: '설정', exact: true }).click();
    await expect.poll(async () => (await sidebar(page).getByRole('link').allInnerTexts()).map(text => text.trim()).filter(text => SETTINGS_MENUS.includes(text))).toEqual(SETTINGS_MENUS);
  });

  test('admin의 운영 콘솔 레일 권한 섹션은 두 메뉴를 순서대로 보인다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/operations/admin-roles');
    await sections(page).getByRole('button', { name: '권한', exact: true }).click();
    await expect.poll(async () => (await sidebar(page).getByRole('link').allInnerTexts()).map(text => text.trim()).filter(text => ACCESS_MENUS.includes(text))).toEqual(ACCESS_MENUS);
  });

  for (const role of ['engineer', 'viewer'] as const) {
    test(`${role}에게는 업무 흐름·운영 콘솔도 설정·권한 섹션도 없다`, async ({ page }) => {
      await signInAs(page, role);
      await page.goto('/bravo/metric-catalog');
      await expect(page.getByRole('navigation', { name: '시스템 레일' })).toBeVisible();
      await expect(sections(page).getByRole('button', { name: '설정', exact: true })).toHaveCount(0);
      await expect(sections(page).getByRole('button', { name: '권한', exact: true })).toHaveCount(0);
    });
  }

  test.describe('각 화면 본문은 실서버 필요다', () => {
    test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });
    for (const [name, path] of [
      ['시스템', '/flow/managed-systems'],
      ['분석 영역', '/flow/analytics-areas'],
      ['권한 요청 검토', '/operations/permission-request-review'],
      ['부여 목록', '/operations/permission-grants'],
      ['흐름 정책', '/flow/settings'],
    ] as const) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await expect(mainHeading(page)).toHaveText(name);
        await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
        await expect(sidebar(page).getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
      });
    }
  });

  test.describe('목록 범위는 흐름 설정 메뉴에서 꺼져 있고 권한 메뉴에는 없다', () => {
    const system = '33333333-3333-4333-8333-333333333333';
    test('흐름 정책의 선택기가 비활성이고 주소의 managedSystem은 그대로다', async ({ page }) => {
      await signInAs(page, 'admin');
      await page.goto(`/flow/settings?managedSystem=${system}`);
      await expect(page.getByText('목록 범위', { exact: true })).toBeVisible();
      // Without a feature API the picker is disabled for the 실서버 필요 reason as well; the 흐름 설정 tooltip is the `ScopeControl` test's and the real-server check's.
      await expect(page.getByTitle(/실서버 필요|Managed System 범위를 지원하지 않습니다/).filter({ hasText: '전체' })).toBeDisabled();
      expect(query(page).get('managedSystem')).toBe(system);
    });

    test('권한 요청 검토에는 목록 범위가 마운트되지 않는다', async ({ page }) => {
      await signInAs(page, 'admin');
      await page.goto(`/operations/permission-request-review?managedSystem=${system}`);
      await expect(mainHeading(page)).toHaveText('권한 요청 검토');
      await expect(page.getByText('목록 범위', { exact: true })).toHaveCount(0);
    });
  });

  test.describe('틀린 주소 값은 화면 대신 거절 화면이고 주소는 그대로다', () => {
    test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });
    for (const [path, key, value] of [
      ['/flow/analytics-areas', 'system', 'x'],
      ['/flow/analytics-areas', 'focus', 'not-a-uuid'],
      ['/operations/permission-request-review', 'tab', 'bogus'],
      ['/operations/permission-grants', 'tab', 'bogus'],
      ['/flow/settings', 'section', 'other'],
    ] as const) {
      test(`${path} ${key}=${value}`, async ({ page }) => {
        await page.goto(`${path}?${key}=${value}`);
        await expect(page.getByText(`주소의 ${key} 값이 올바르지 않습니다`)).toBeVisible();
        await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
        expect(query(page).get(key)).toBe(value);
      });
    }
  });

  test('focus·section 주소는 새로고침해도 남는다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(`/operations/permission-request-review?tab=approved&focus=${ROW}`);
    await page.reload();
    expect(query(page).get('focus')).toBe(ROW);
    expect(query(page).get('tab')).toBe('approved');
    await page.goto('/flow/settings?section=coverage');
    await page.reload();
    expect(query(page).get('section')).toBe('coverage');
  });

  test('공간 하단 항목은 관리자 메뉴를 열지 않는다(관리자는 하단 블록에 없다)', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    await expect(page.getByRole('navigation', { name: '기능 · MARS' }).getByRole('link', { name: /Managed System|관리자/ })).toHaveCount(0);
  });
});
