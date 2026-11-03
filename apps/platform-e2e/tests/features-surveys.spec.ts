import { expect, test, type Page } from '@playwright/test';
import { mainHeading, query, signInAs } from './support';
import { PRODUCTIVITY } from './contract-helpers';

/**
 * 기능 › Surveys (#764 p1, ADR-0110): 설문 관리 and its hidden builder, results and follow-up screens as bridge menus. The e2e run uses the mock adapter, where `FeatureBridge` renders only `실서버 필요`,
 * so no screen or drawer mounts here; the in-place drawer and the child screens are covered by the page tests and the conductor's real-server check.
 */
const SURVEY = '99999999-9999-4999-8999-999999999999';

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const sections = (page: Page) => page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('업무 흐름 설문 운영 그룹(#764 p1, #1099c)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('레일 설문 운영 섹션은 설문 관리 한 메뉴만 보이고 하위 화면 셋은 사이드바에 없다', async ({ page }) => {
    await page.goto('/flow/dashboard');
    await sections(page).getByRole('button', { name: '설문 운영', exact: true }).click();
    await expect.poll(async () => (await sidebar(page).getByRole('link').allInnerTexts()).map(text => text.trim()).filter(text => /^설문 /.test(text))).toEqual(['설문 관리']);
  });

  test.describe('각 화면 본문은 실서버 필요다', () => {
    for (const [name, path] of [
      ['설문 관리', '/flow/survey-management'],
      ['설문 빌더', `/flow/survey-builder/${SURVEY}`],
      ['설문 결과', `/flow/survey-results/${SURVEY}`],
      ['설문 후속 조치', `/flow/survey-follow-up/${SURVEY}`],
    ] as const) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await expect(mainHeading(page)).toHaveText(name);
        await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
      });
    }
  });

  test('하위 화면은 설문 관리를 현재로 표시한다', async ({ page }) => {
    await page.goto(`/flow/survey-results/${SURVEY}`);
    await expect(sidebar(page).getByRole('link', { name: '설문 관리', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('UUID가 아닌 surveyId는 찾을 수 없음 화면이다', async ({ page }) => {
    await page.goto('/flow/survey-builder/not-a-uuid');
    await expect(page.getByText('설문을 찾을 수 없습니다')).toBeVisible();
  });

  test('틀린 status 값은 목록 대신 거절 화면이고 주소는 그대로다', async ({ page }) => {
    await page.goto('/flow/survey-management?status=bogus');
    await expect(page.getByText('주소의 status 값이 올바르지 않습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
    expect(query(page).get('status')).toBe('bogus');
  });

  test('focus 주소는 설문 관리를 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto(`/flow/survey-management?focus=${SURVEY}`);
    await expect(sidebar(page).getByRole('link', { name: '설문 관리', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    expect(query(page).get('focus')).toBe(SURVEY);
  });

  test('공간 하단 설문 항목은 새 탭이 아니라 이 탭에서 설문 관리를 그 공간의 managedSystem으로 연다', async ({ page }) => {
    await page.goto(PRODUCTIVITY);
    const link = page.getByRole('navigation', { name: '기능 · MARS' }).getByRole('link', { name: /^설문/ });
    await expect(link).not.toHaveAttribute('target', /.+/);
    await link.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/flow/survey-management');
    expect(query(page).getAll('managedSystem')).toHaveLength(1);
    await expect(mainHeading(page)).toHaveText('설문 관리');
  });
});
