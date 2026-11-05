import { expect, test, type Page } from '@playwright/test';
import { mainHeading, query, signInAs } from './support';

/**
 * 기능 › 연동 (#762 p2, ADR-0110): 연동 대시보드, 연결 관계 and 커버리지 (연동 섹션) plus 근거 (Finding 섹션) as bridge menus. The e2e run uses the mock adapter, where `FeatureBridge` renders only `실서버 필요`,
 * so no screen or drawer mounts here; the in-place drawers are covered by the page tests and the conductor's real-server check.
 */
const EVIDENCE = '99999999-9999-4999-8999-999999999999';
const MENUS = ['연동 대시보드', '연결 관계', '커버리지'];

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const sections = (page: Page) => page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('기능 연동 그룹(#762 p2)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('레일 연동 섹션은 세 메뉴를 순서대로 보이고 Findings·근거 행은 없다', async ({ page }) => {
    await page.goto('/flow/dashboard');
    await sections(page).getByRole('button', { name: '연동', exact: true }).click();
    await expect.poll(async () => (await sidebar(page).getByRole('link').allInnerTexts()).map(text => text.trim()).filter(text => MENUS.includes(text) || text === 'Findings' || text === '전체 Finding' || text === '근거')).toEqual(MENUS);
  });

  test.describe('각 메뉴 본문은 실서버 필요다', () => {
    for (const [name, path, section] of [['연동 대시보드', '/flow/integration', '연동'], ['근거', '/flow/evidence', 'Finding'], ['연결 관계', '/flow/entity-links', '연동'], ['커버리지', '/flow/coverage', '연동']] as const) {
      test(name, async ({ page }) => {
        await page.goto('/flow/dashboard');
        await sections(page).getByRole('button', { name: section, exact: true }).click();
        await sidebar(page).getByRole('link', { name, exact: true }).click();
        await expect.poll(() => new URL(page.url()).pathname).toBe(path);
        await expect(mainHeading(page)).toHaveText(name);
        await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
      });
    }
  });

  test('업무 흐름 레일 섹션은 대시보드, VOC 처리, Finding, Task, 설문 운영, 연동, 설정 순이다(#1099c)', async ({ page }) => {
    await page.goto('/flow/dashboard');
    const wanted = ['대시보드', 'VOC 처리', 'Finding', 'Task', '설문 운영', '연동', '설정'];
    // Rail section buttons are icon buttons named by `aria-label` (AppRail.tsx); poll until the rail has rendered.
    await expect.poll(async () => (await sections(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''))).filter(label => wanted.includes(label))).toEqual(wanted);
  });

  test('근거의 focus 주소는 근거를 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto(`/flow/evidence?focus=${EVIDENCE}`);
    await expect(sidebar(page).getByRole('link', { name: '근거', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    expect(query(page).get('focus')).toBe(EVIDENCE);
    await expect(sidebar(page).getByRole('link', { name: '근거', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('틀린 view 값은 커버리지 화면 대신 거절 화면이고 주소는 그대로다', async ({ page }) => {
    await page.goto('/flow/coverage?view=bogus');
    await expect(page.getByText('주소의 view 값이 올바르지 않습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
    expect(query(page).get('view')).toBe('bogus');
  });
});
