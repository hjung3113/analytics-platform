import { expect, test, type Page } from '@playwright/test';
import { evidence, mainHeading, query, signInAs } from './support';

/**
 * 기능 › Tasks (#763, ADR-0110): Task 요청, Task 보드, 내 Task, 마일스톤 and the hidden Task 목록 as bridge menus. The e2e run uses the mock adapter, where `FeatureBridge` renders
 * only `실서버 필요`, so no screen or drawer mounts here; the drawer round trip is covered by the page tests and the conductor's real-server check.
 */
const TASK = '99999999-9999-4999-8999-999999999999';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
/** Rail section buttons of the current system (15 §3.2). */
function railSection(page: Page, name: string) {
  return page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name, exact: true });
}

test.describe('업무 흐름 Task 그룹(#763, #1099c)', () => {
  test.beforeEach(async ({ page }) => { await signInAs(page, 'admin'); });

  test('레일 Task 섹션은 Task 보드를 보이고 Task 목록은 숨기며 내 Task는 전역 /my-tasks에서 열리고, 본문은 실서버 필요다', async ({ page }, testInfo) => {
    await page.goto('/flow/dashboard');
    await railSection(page, 'Task').click();
    await expect(sidebar(page).getByRole('link', { name: 'Task 보드', exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: '내 Task', exact: true })).toHaveCount(0);
    await expect(sidebar(page).getByRole('link', { name: 'Task 목록' })).toHaveCount(0);

    await sidebar(page).getByRole('link', { name: 'Task 보드', exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/flow/tasks');
    await expect(mainHeading(page)).toHaveText('Task 보드');
    await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');

    await page.goto('/my-tasks');
    await expect(mainHeading(page)).toHaveText('내 Task');
    await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
    await evidence(page, testInfo, 'feedbackops-tasks-sidebar');
  });

  test('레일 Task 섹션 행은 Task 요청, Task 보드, 마일스톤 순이고 Task 목록과 내 Task는 없으며, 두 새 메뉴 본문은 실서버 필요다', async ({ page }) => {
    await page.goto('/flow/dashboard');
    await railSection(page, 'Task').click();
    const labels = await sidebar(page).getByRole('link').allTextContents();
    expect(labels.map(label => label.trim()).filter(label => ['Task 요청', 'Task 보드', '내 Task', '마일스톤', 'Task 목록'].includes(label))).toEqual(['Task 요청', 'Task 보드', '마일스톤']);
    for (const [path, heading] of [['/flow/task-requests', 'Task 요청'], ['/flow/milestones', '마일스톤']] as const) {
      await page.goto(path);
      await expect(mainHeading(page)).toHaveText(heading);
      await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
    }
  });

  test('마일스톤 주소는 마일스톤을 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto('/flow/milestones?focus=m-1');
    await expect(sidebar(page).getByRole('link', { name: '마일스톤', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    expect(query(page).get('focus')).toBe('m-1');
    await expect(sidebar(page).getByRole('link', { name: '마일스톤', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('Task 요청의 틀린 reviewer 값은 거절 화면이고 값 지우기는 reviewer만 지운다', async ({ page }) => {
    await page.goto(`/flow/task-requests?reviewer=x&reviewerTeam=${TASK}`);
    await expect(page.getByText('주소의 reviewer 값이 올바르지 않습니다')).toBeVisible();
    await page.getByRole('button', { name: '값 지우기' }).click();
    await expect.poll(() => query(page).has('reviewer')).toBe(false);
    expect(query(page).get('reviewerTeam')).toBe(TASK);
  });

  test('Task 목록 주소는 부모 Task 보드를 현재로 표시하고 새로고침해도 focus가 남는다', async ({ page }) => {
    await page.goto(`/flow/task-list?focus=${TASK}`);
    await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
    await expect(sidebar(page).getByRole('link', { name: 'Task 보드', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/flow/task-list');
    expect(query(page).get('focus')).toBe(TASK);
    await expect(sidebar(page).getByRole('link', { name: 'Task 보드', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('보드의 틀린 publicUpdate 값은 화면 대신 거절 화면이고 주소는 그대로다', async ({ page }) => {
    await page.goto('/flow/tasks?publicUpdate=x');
    await expect(page.getByText('주소의 publicUpdate 값이 올바르지 않습니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '값 지우기' })).toBeVisible();
    expect(query(page).get('publicUpdate')).toBe('x');
  });

  test('MARS 바닥 블록의 Task는 같은 탭에서 /flow/task-list를 managedSystem과 함께 연다', async ({ page }) => {
    await page.goto('/mars/productivity-overview?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO');
    await page.getByRole('navigation', { name: '기능 · MARS' }).getByRole('link', { name: /^Task/ }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/flow/task-list');
    expect(query(page).get('managedSystem')).toMatch(UUID);
  });
});
