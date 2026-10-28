import {
  evidence,
  expect,
  expectLoadedOrEmpty,
  expectSuccessfulFoReads,
  mainHeading,
  test,
  waitForFoRead,
} from './support';

test.describe('플랫폼 홈과 전역 화면 실서버 (ADR-0070, 06 §9.1)', () => {
  test('홈은 core 권한으로 접근 가능한 업무 시스템만 노출한다', async ({ page }, testInfo) => {
    const homeReads = [
      waitForFoRead(page, '/me/answerable-surveys'),
      waitForFoRead(page, '/notifications', { unread: 'true', limit: '100' }),
      waitForFoRead(page, '/permission-requests/mine', { status: 'all' }),
    ];
    await page.goto('/home');
    await expectSuccessfulFoReads(homeReads);
    await expect(mainHeading(page)).toHaveText('플랫폼 홈');
    const systems = page.getByRole('region', { name: '업무 시스템' });
    await expect(systems).toBeVisible();
    for (const label of ['운영 콘솔', 'FeedbackOps', '표준 로그 개발', '개선 실행']) {
      await expect(systems.getByRole('link', { name: new RegExp(label) })).toBeVisible();
    }
    await expect(systems.getByRole('link', { name: /MARS/ })).toHaveCount(0);
    // The notice card's menuQuery HTTP 404 is a documented limit (#708, backlog); only the tested FO content is asserted.
    await expect(systems).not.toContainText('불러오지 못했습니다');
    await evidence(page, testInfo, 'real-platform-home');
  });

  test('메뉴 검색으로 운영 콘솔의 레지스트리로 이동한다', async ({ page }, testInfo) => {
    const homeReads = [
      waitForFoRead(page, '/me/answerable-surveys'),
      waitForFoRead(page, '/notifications', { unread: 'true', limit: '100' }),
      waitForFoRead(page, '/permission-requests/mine', { status: 'all' }),
    ];
    await page.goto('/home');
    await expectSuccessfulFoReads(homeReads);
    await expect(page.getByRole('region', { name: '업무 시스템' })).toBeVisible();
    await page.getByRole('button', { name: '메뉴 검색…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: '메뉴 검색' }).fill('메뉴 레지스트리');
    const option = dialog.getByRole('option', { name: /메뉴 레지스트리/ });
    await expect(option).toContainText('운영 콘솔');
    await option.click();
    await expect(page).toHaveURL(/\/operations\/admin-registry/);
    await expect(mainHeading(page)).toHaveText('메뉴 레지스트리');
    await evidence(page, testInfo, 'real-menu-search');
  });

  test('알림과 내 VOC는 실제 조회 결과 또는 유효한 빈 결과를 보여준다', async ({ page }, testInfo) => {
    const notifications = waitForFoRead(page, '/notifications', {
      unread: 'true',
      limit: undefined,
      cursor: undefined,
    });
    await page.goto('/notifications');
    await expectSuccessfulFoReads([notifications]);
    await expect(mainHeading(page)).toHaveText('알림');

    const main = page.getByRole('main');
    await expectLoadedOrEmpty(
      main.getByRole('list'),
      main.getByText('읽지 않은 알림이 없습니다.'),
    );

    const myVocs = waitForFoRead(page, '/vocs', { view: 'my' });
    await page.goto('/voc');
    await expectSuccessfulFoReads([myVocs]);
    await expect(mainHeading(page)).toHaveText('내 VOC');
    await expectLoadedOrEmpty(
      main.getByRole('region', { name: 'VOC 목록' }).getByRole('row'),
      main.getByText('내가 제출한 VOC가 없습니다'),
    );
    await evidence(page, testInfo, 'real-global-bridges');
  });
});
