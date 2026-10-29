import {
  evidence,
  expect,
  expectLoadedOrEmpty,
  expectSuccessfulFoReads,
  mainHeading,
  test,
  waitForFoRead,
} from './support';

test.describe('FeedbackOps 실서버 브리지 화면 (06 §9.1·§22)', () => {
  test('공간 대시보드는 실제 요약과 열린 요청 결과를 표시한다', async ({ page }, testInfo) => {
    const summary = waitForFoRead(page, '/dashboard/summary', { managed_system_id: 'all' });
    const requests = waitForFoRead(page, '/permission-requests/mine', { status: undefined });
    await page.goto('/operations/dashboard');
    await expectSuccessfulFoReads([summary, requests]);
    await expect(mainHeading(page)).toHaveText('대시보드');
    await expect(page.getByRole('main').getByText('열린 요청이 없습니다.')).toBeVisible();
    await evidence(page, testInfo, 'real-feedbackops-dashboard');
  });

  test('연동 대시보드는 요약 API 뒤 실제 큐 데이터 또는 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const summary = waitForFoRead(page, '/dashboard/summary', { managed_system_id: 'all' });
    const systems = waitForFoRead(page, '/managed-systems', {
      include_archived: 'true',
      limit: '500',
    });
    await page.goto('/operations/integration');
    await expectSuccessfulFoReads([summary, systems]);
    await expect(page.getByTestId('integration-dashboard').getByRole('heading', { level: 1 })).toHaveText('연동 액션 대시보드');
    await expectLoadedOrEmpty(
      page.getByTestId('integration-dashboard-queues'),
      page
        .getByRole('main')
        .getByText('이 범위에서 표시할 큐가 없습니다.')
        .or(page.getByTestId('integration-zero-queues'))
        .or(page.getByRole('main').getByText('처리할 항목 없음')),
    );
    await evidence(page, testInfo, 'real-feedbackops-integration');
  });

  test('Evidence 화면은 실제 목록 API의 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const inventory = waitForFoRead(page, '/evidence-highlights');
    await page.goto('/operations/evidence');
    await expectSuccessfulFoReads([inventory]);
    await expect(mainHeading(page)).toHaveText('Evidence');
    await expect(page.getByRole('main').getByText('표시할 Evidence가 없습니다.')).toBeVisible();
    await evidence(page, testInfo, 'real-feedbackops-evidence');
  });

  test('엔티티 링크 화면은 실제 목록 API의 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const inventory = waitForFoRead(page, '/entity-links', {
      scope: 'workspace',
      limit: '50',
    });
    await page.goto('/operations/entity-links');
    await expectSuccessfulFoReads([inventory]);
    await expect(mainHeading(page)).toHaveText('엔티티 링크');
    await expect(page.getByRole('main').getByText('엔티티 링크가 없습니다.')).toBeVisible();
    await evidence(page, testInfo, 'real-feedbackops-entity-links');
  });

  test('커버리지 화면은 실제 요약과 참조 목록 뒤 데이터 또는 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const summary = waitForFoRead(page, '/dashboard/summary', { managed_system_id: 'all' });
    const systems = waitForFoRead(page, '/managed-systems', {
      include_archived: 'true',
      limit: '500',
    });
    const areas = waitForFoRead(page, '/analytics-areas', {
      include_archived: 'true',
      limit: '500',
      offset: '0',
    });
    await page.goto('/operations/coverage');
    await expectSuccessfulFoReads([summary, systems, areas]);
    await expect(page.getByTestId('integration-coverage').getByRole('heading', { level: 1 })).toHaveText('커버리지');
    await expectLoadedOrEmpty(
      page.getByTestId('coverage-signals'),
      page.getByRole('main').getByText('표시할 커버리지가 없습니다'),
    );
    await evidence(page, testInfo, 'real-feedbackops-coverage');
  });
});
