import { expect, test, type Page } from '@playwright/test';
import { mainHeading, query, signInAs } from './support';

/**
 * FeedbackOps › 연동 (#762 p2): 연동 액션 대시보드, Evidence, 엔티티 링크 and 커버리지 as bridge menus. The e2e run uses the mock adapter, where `FoBridge` renders only `실서버 필요`,
 * so no screen or drawer mounts here; the in-place drawers are covered by the page tests and the conductor's real-server check.
 */
const EVIDENCE = '99999999-9999-4999-8999-999999999999';
const MENUS = ['연동 액션 대시보드', 'Evidence', '엔티티 링크', '커버리지'];

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const sections = (page: Page) => page.getByRole('navigation', { name: '앱 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('FeedbackOps 연동 그룹(#762 p2)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('레일 연동 섹션은 네 메뉴를 순서대로 보이고 Findings 행은 없다', async ({ page }) => {
    await page.goto('/feedbackops');
    await sections(page).getByRole('button', { name: '연동', exact: true }).click();
    await expect.poll(async () => (await sidebar(page).getByRole('link').allInnerTexts()).map(text => text.trim()).filter(text => MENUS.includes(text) || text === 'Findings' || text === '전체 Finding')).toEqual(MENUS);
  });

  test.describe('각 메뉴 본문은 실서버 필요다', () => {
    for (const [name, path] of [['연동 액션 대시보드', '/feedbackops/integration'], ['Evidence', '/feedbackops/evidence'], ['엔티티 링크', '/feedbackops/entity-links'], ['커버리지', '/feedbackops/coverage']] as const) {
      test(name, async ({ page }) => {
        await page.goto('/feedbackops');
        await sections(page).getByRole('button', { name: '연동', exact: true }).click();
        await sidebar(page).getByRole('link', { name, exact: true }).click();
        await expect.poll(() => new URL(page.url()).pathname).toBe(path);
        await expect(mainHeading(page)).toHaveText(name);
        await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
      });
    }
  });

  test('레일 섹션은 대시보드, VOC, Findings, Tasks, 연동 순이다', async ({ page }) => {
    await page.goto('/feedbackops');
    const wanted = ['대시보드', 'VOC', 'Findings', 'Tasks', '연동'];
    // Rail section buttons are icon buttons named by `aria-label` (AppRail.tsx); poll until the rail has rendered.
    await expect.poll(async () => (await sections(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''))).filter(label => wanted.includes(label))).toEqual(wanted);
  });

  test('Evidence의 focus 주소는 Evidence를 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto(`/feedbackops/evidence?focus=${EVIDENCE}`);
    await expect(sidebar(page).getByRole('link', { name: 'Evidence', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    expect(query(page).get('focus')).toBe(EVIDENCE);
    await expect(sidebar(page).getByRole('link', { name: 'Evidence', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('틀린 view 값은 커버리지 화면 대신 거절 화면이고 주소는 그대로다', async ({ page }) => {
    await page.goto('/feedbackops/coverage?view=bogus');
    await expect(page.getByText('주소의 view 값이 올바르지 않습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
    expect(query(page).get('view')).toBe('bogus');
  });
});
