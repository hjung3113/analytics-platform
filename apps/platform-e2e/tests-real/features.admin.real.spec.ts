import { randomUUID } from 'node:crypto';
import {
  evidence,
  expect,
  expectLoadedOrEmpty,
  expectSuccessfulFoReads,
  mainHeading,
  test,
  waitForFoRead,
} from './support';

test.describe('기능 실서버 브리지 화면 (06 §9.1·§22)', () => {
  test('공간 대시보드는 실제 요약과 열린 요청 결과를 표시한다', async ({ page }, testInfo) => {
    const summary = waitForFoRead(page, '/dashboard/summary', { managed_system_id: 'all' });
    const requests = waitForFoRead(page, '/permission-requests/mine', { status: undefined });
    await page.goto('/flow/dashboard');
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
    await page.goto('/flow/integration');
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

  test('근거 화면은 실제 목록 API의 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const inventory = waitForFoRead(page, '/evidence-highlights');
    await page.goto('/flow/evidence');
    await expectSuccessfulFoReads([inventory]);
    await expect(mainHeading(page)).toHaveText('근거');
    await expect(page.getByRole('main').getByText('표시할 근거가 없습니다.')).toBeVisible();
    await evidence(page, testInfo, 'real-feedbackops-evidence');
  });

  test('연결 관계 화면은 실제 목록 API의 유효한 빈 결과를 표시한다', async ({ page }, testInfo) => {
    const inventory = waitForFoRead(page, '/entity-links', {
      scope: 'workspace',
      limit: '50',
    });
    await page.goto('/flow/entity-links');
    await expectSuccessfulFoReads([inventory]);
    await expect(mainHeading(page)).toHaveText('연결 관계');
    await expect(page.getByRole('main').getByText('연결 관계가 없습니다.')).toBeVisible();
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
    await page.goto('/flow/coverage');
    await expectSuccessfulFoReads([summary, systems, areas]);
    await expect(page.getByTestId('integration-coverage').getByRole('heading', { level: 1 })).toHaveText('커버리지');
    await expectLoadedOrEmpty(
      page.getByTestId('coverage-signals'),
      page.getByRole('main').getByText('표시할 커버리지가 없습니다'),
    );
    await evidence(page, testInfo, 'real-feedbackops-coverage');
  });
});


// Mock assembly intentionally has no feature API. This checks the real VOC consumer
// through the existing authenticated assembly, using only public HTTP and UI.
test.describe('VOC 처리함 상세 폭별 배치 (06 §13, #1530)', () => {
  test('도킹은 한 열, 1440·1280 크게 보기는 18rem 속성 열과 독립 스크롤이다', async ({ page }, testInfo) => {
    const systemResponse = await page.request.post('/api/features/managed-systems', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { slug: `drawer-${randomUUID()}`, name: 'Detail region verification' },
    });
    expect(systemResponse.status()).toBe(201);
    const system = await systemResponse.json() as { id: string };
    const created = await page.request.post('/api/features/vocs', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: {
        primary_managed_system_id: system.id,
        title: '폭별 배치 검증 VOC',
        description_rich_content: { type: 'doc', content: Array.from({ length: 45 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `본문 ${index + 1}: 스크롤 보존 검증.` }] })) },
      },
    });
    expect(created.status()).toBe(201);
    const voc = await created.json() as { id: string };

    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/flow/inbox?focus=${voc.id}&managedSystem=${system.id}`);
      const dialog = page.getByRole('dialog', { name: /폭별 배치 검증 VOC/ });
      await expect(dialog).toBeVisible();
      const expandSidebar = page.getByRole('button', { name: '사이드바 펼치기', exact: true });
      if (await expandSidebar.isVisible()) await expandSidebar.click();
      const main = dialog.getByRole('region', { name: '본문 및 대화', exact: true });
      const body = dialog.locator('[data-detail-region="body"]');
      const properties = dialog.getByRole('region', { name: '속성', exact: true });
      const activity = dialog.locator('[data-detail-region="activity"]');
      await expect(properties.getByRole('heading', { name: '분류 (읽기 전용)' })).toBeAttached();
      expect((await dialog.boundingBox())?.width).toBeCloseTo(439, 0);
      expect(await dialog.locator('[data-detail-regions]').evaluate(el => Array.from(el.children, child => child.getAttribute('data-detail-region')))).toEqual(['body', 'properties', 'activity']);
      const narrow = await Promise.all([body.boundingBox(), properties.boundingBox(), activity.boundingBox()]);
      expect(narrow[1]?.x).toBe(narrow[0]?.x);
      expect(narrow[2]!.y).toBeGreaterThanOrEqual(narrow[1]!.y + narrow[1]!.height);
      expect(await properties.evaluate(el => getComputedStyle(el).overflowY)).toBe('visible');
      await evidence(page, testInfo, `voc-regions-docked-${width}`);

      await dialog.getByRole('button', { name: '크게 보기' }).click();
      await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(960);
      await expect.poll(() => properties.evaluate(el => getComputedStyle(el).position)).toBe('sticky');
      expect((await properties.boundingBox())?.width).toBeCloseTo(288, 0);
      const wideBody = await body.boundingBox(); const wideProperties = await properties.boundingBox(); const wideActivity = await activity.boundingBox();
      expect(wideProperties!.x).toBeGreaterThanOrEqual(wideBody!.x + wideBody!.width - 1);
      expect(wideActivity?.x).toBe(wideBody?.x);
      expect(await properties.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
      for (const region of [main, properties]) {
        await expect(region).toHaveAttribute('tabindex', '0');
        await region.focus(); await expect(region).toBeFocused();
      }
      const titleX = (await dialog.getByRole('heading', { level: 2 }).boundingBox())!.x;
      expect(await body.evaluate(el => el.getBoundingClientRect().x + parseFloat(getComputedStyle(el).paddingLeft))).toBeCloseTo(titleX, 0);
      const heading = await properties.getByRole('heading', { name: '분류 (읽기 전용)' }).boundingBox();
      const action = await properties.getByRole('button', { name: '분류에서 변경' }).boundingBox();
      expect(Math.abs((heading!.y + heading!.height / 2) - (action!.y + action!.height / 2))).toBeLessThanOrEqual(1);
      const propertiesTop = (await properties.boundingBox())!.y;
      await main.evaluate(el => { el.scrollTop = 400; el.setAttribute('data-node-probe', 'retained'); });
      await expect.poll(() => main.evaluate(el => el.scrollTop)).toBe(400);
      expect((await properties.boundingBox())!.y).toBeCloseTo(propertiesTop, 0);
      await evidence(page, testInfo, `voc-regions-expanded-${width}`);
      await dialog.getByRole('button', { name: '원래 크기로' }).click();
      await expect(main).toHaveAttribute('data-node-probe', 'retained');
      expect(await main.evaluate(el => el.scrollTop)).toBe(400);
    }
  });
});
