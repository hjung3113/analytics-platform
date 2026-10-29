import { expect, test, type Page } from '@playwright/test';
import { mainHeading, query, signInAs } from './support';

/**
 * FeedbackOps › Findings (#762 p1): 전체 Finding as a bridge menu. The e2e run uses the mock adapter, where `FeatureBridge` renders only `실서버 필요`, so no screen or drawer mounts here;
 * the drawer round trip is covered by the page tests and the conductor's real-server check.
 */
const FINDING = '99999999-9999-4999-8999-999999999999';

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const sections = (page: Page) => page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('FeedbackOps Findings 그룹(#762 p1)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('레일 Finding 섹션은 전체 Finding을 보이고, 본문은 실서버 필요다', async ({ page }) => {
    await page.goto('/operations/dashboard');
    await sections(page).getByRole('button', { name: 'Finding', exact: true }).click();
    await sidebar(page).getByRole('link', { name: '전체 Finding', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/findings');
    await expect(mainHeading(page)).toHaveText('전체 Finding');
    await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
  });

  test('레일 섹션은 VOC, Finding, Task 관리 순이다', async ({ page }) => {
    await page.goto('/operations/dashboard');
    const wanted = ['VOC', 'Finding', 'Task 관리'];
    // Rail section buttons are icon buttons named by `aria-label` (AppRail.tsx); poll until the rail has rendered.
    await expect.poll(async () => (await sections(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''))).filter(label => wanted.includes(label))).toEqual(wanted);
  });

  test('focus 주소는 전체 Finding을 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto(`/operations/findings?focus=${FINDING}`);
    await expect(sidebar(page).getByRole('link', { name: '전체 Finding', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    expect(query(page).get('focus')).toBe(FINDING);
    await expect(sidebar(page).getByRole('link', { name: '전체 Finding', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('틀린 status 값은 화면 대신 거절 화면이고 주소는 그대로다', async ({ page }) => {
    await page.goto('/operations/findings?status=bogus');
    await expect(page.getByText('주소의 status 값이 올바르지 않습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
    expect(query(page).get('status')).toBe('bogus');
  });
});
