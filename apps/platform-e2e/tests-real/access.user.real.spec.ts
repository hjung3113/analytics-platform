import {
  evidence,
  expect,
  expectSuccessfulFoReads,
  mainHeading,
  test,
  waitForHomeReads,
} from './support';

test.describe('core 사용자 공간 접근 거부 (06 §9.1)', () => {
  test('mock-user-1은 콘솔과 FeedbackOps 공간을 보지 못하고 콘솔 직접 URL이 거부된다', async ({ page }, testInfo) => {
    const homeReads = waitForHomeReads(page);
    await page.goto('/home');
    await expectSuccessfulFoReads(homeReads);
    await expect(mainHeading(page)).toHaveText('플랫폼 홈');
    const systems = page.getByRole('region', { name: '업무 시스템' });
    await expect(systems).toBeVisible();
    await expect(systems.getByRole('link', { name: /표준 로그 개발/ })).toBeVisible();
    await expect(systems.getByRole('link', { name: /개선 실행/ })).toBeVisible();
    await expect(systems.getByRole('link', { name: /운영 콘솔/ })).toHaveCount(0);
    await expect(systems.getByRole('link', { name: /FeedbackOps/ })).toHaveCount(0);

    await page.goto('/operations/admin-roles');
    const main = page.getByRole('main');
    await expect(main).toContainText('이 업무 시스템에 들어갈 수 없습니다');
    await expect(main).toContainText('운영 콘솔');
    await expect(page).toHaveURL(/\/operations\/admin-roles$/);
    await evidence(page, testInfo, 'real-user-console-denied');
  });
});
