import { expect, test, type Page } from '@playwright/test';
import { evidence, mainHeading, query, signInAs } from './support';
import { openSwitcher } from './contract-helpers';

/**
 * #1099 B navigation (ADR-0110): the 업무 흐름 space and the reduced 운영 콘솔, global 내 활동 with 내 Task and 소통, and the list scope only where a menu declares it.
 * The e2e run uses the mock adapter (`FeatureBridge` renders `실서버 필요`), so the scope picker's choices and server states are the page tests'
 * and the conductor's real-server check; this describe pins composition, order, landing, entry and keyboard reach.
 */
const SYSTEM = '33333333-3333-4333-8333-333333333333';
const sections = (page: Page) => page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' });

test.describe('#1099 B 업무 흐름·운영 콘솔과 내 활동·소통', () => {
  test('admin의 전환기 플랫폼 메뉴는 홈·알림·내 Task·권한 요청·공지·FAQ·VOC·설문 순이다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/bravo/metric-catalog');
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('navigation', { name: '플랫폼 메뉴' }).getByRole('link')).toHaveText(['홈', '알림', '내 Task', '권한 요청', '공지', 'FAQ', 'VOC', '설문']);
    await evidence(page, testInfo, 'navigation-my-activity-order');
  });

  test('업무 흐름 레일은 일곱 섹션, 운영 콘솔 레일은 두 섹션을 정해진 순서로 보이고 기능 업무 시스템 행은 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/flow/dashboard');
    const flowLabels = ['대시보드', 'VOC 처리', 'Finding', 'Task', '설문 운영', '연동', '설정'];
    await expect.poll(async () => (await sections(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''))).filter(label => flowLabels.includes(label))).toEqual(flowLabels);
    const popover = await openSwitcher(page);
    await expect(popover.getByRole('button', { name: /^FeedbackOps/ })).toHaveCount(0);
    await evidence(page, testInfo, 'navigation-flow-sections');
    await page.goto('/operations/admin-roles');
    const operationsLabels = ['플랫폼 관리', '권한'];
    await expect.poll(async () => (await sections(page).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? ''))).filter(label => operationsLabels.includes(label))).toEqual(operationsLabels);
    await evidence(page, testInfo, 'navigation-console-sections');
  });

  test('내 Task는 전역 /my-tasks에서 열리고 옛 FeedbackOps 주소는 없다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(`/my-tasks?managedSystem=${SYSTEM}`);
    await expect(mainHeading(page)).toHaveText('내 Task');
    expect(query(page).get('managedSystem')).toBe(SYSTEM);
    for (const retired of ['/feedbackops', '/feedbackops/my-tasks', '/feedbackops/fo-my-tasks']) {
      await page.goto(retired);
      await expect(page.getByRole('main')).not.toContainText('내 Task');
      expect(new URL(page.url()).pathname).toBe(retired);
    }
  });

  test('목록 범위는 업무 흐름 메뉴에만 있고 플랫폼 관리 메뉴에는 마운트되지 않는다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(`/flow/inbox?managedSystem=${SYSTEM}`);
    await expect(page.getByText('목록 범위')).toBeVisible();
    await page.goto('/operations/admin-roles');
    await expect(page.getByRole('main').getByRole('heading', { name: '권한/역할 관리' })).toBeVisible();
    await expect(page.getByText('목록 범위')).toHaveCount(0);
  });

  test('팔레트(Ctrl+K)는 내 Task와 업무 흐름 목적지를 전체 경로로 구분해 찾고, 취소하면 열었던 곳으로 포커스가 돌아온다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/flow/dashboard');
    const opener = page.getByRole('button', { name: '메뉴 검색…' });
    await opener.focus();
    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').fill('Task');
    await expect(dialog.getByRole('option', { name: /내 활동.*내 Task/ })).toHaveCount(1);
    await expect(dialog.getByRole('option', { name: /업무 흐름.*Task.*Task 보드/ })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
