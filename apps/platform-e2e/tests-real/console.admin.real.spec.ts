import { randomUUID } from 'node:crypto';
import { evidence, expect, mainHeading, test, usageVisits, waitForAuditSearch } from './support';

test.describe('운영 콘솔 실서버 (06 §4·§9.1·§17)', () => {
  test('두 콘솔 메뉴 진입 뒤 서버 활용률 집계가 각각 +1 된다', async ({ page }, testInfo) => {
    await page.goto('/operations/admin-usage');
    await expect(mainHeading(page)).toHaveText('메뉴 활용률');
    const rolesBefore = await usageVisits(page, 'admin-roles');
    const registryBefore = await usageVisits(page, 'admin-registry');

    await page.goto('/operations/admin-roles');
    await expect(mainHeading(page)).toHaveText('권한/역할 관리');
    await page.goto('/operations/admin-registry');
    await expect(mainHeading(page)).toHaveText('메뉴 레지스트리');
    await page.goto('/operations/admin-usage');

    await expect.poll(() => usageVisits(page, 'admin-roles'), { timeout: 15_000 }).toBe(rolesBefore + 1);
    await expect.poll(() => usageVisits(page, 'admin-registry'), { timeout: 15_000 }).toBe(registryBefore + 1);
    await evidence(page, testInfo, 'real-usage-deltas');
  });

  test('접근 카탈로그는 core seed의 두 계정을 보여준다', async ({ page }, testInfo) => {
    await page.goto('/operations/admin-roles');
    await expect(mainHeading(page)).toHaveText('권한/역할 관리');
    const table = page.getByRole('table', { name: '권한/역할 목록' });
    await expect(table).toBeVisible();
    await expect(table).toContainText('Mock Admin');
    await expect(table).toContainText('Mock User');
    await evidence(page, testInfo, 'real-access-directory');
  });

  test('감사 목록은 존재하지 않는 행위자를 명시적 빈 결과로 보여준다', async ({ page }, testInfo) => {
    const actor = randomUUID();
    // No target type/id: the console and backend audit parsers disagree on target types (#1091), but both accept an actor filter.
    const search = waitForAuditSearch(page, actor);
    await page.goto(`/operations/admin-audit?actor=${actor}`);
    const response = await search;
    expect(response.status(), 'audit-trail search must return HTTP 200').toBe(200);
    expect(((await response.json()) as { outcome?: unknown }).outcome, 'audit-trail search must answer empty for an unknown actor').toBe('empty');
    await expect(mainHeading(page)).toHaveText('변경 감사');
    await expect(page.getByRole('main').getByText('조건에 맞는 결과가 없습니다')).toBeVisible();
    await evidence(page, testInfo, 'real-audit-empty');
  });

  // Known contract defect #1091: the console accepts equipment/metric/annotation target types, the FeedbackOps backend only its own, so `type=equipment` ends in `Invalid audit filter`.
  test.fixme('대상 유형 필터는 존재하지 않는 대상을 명시적 빈 결과로 보여준다 (#1091)', async ({ page }, testInfo) => {
    const targetId = randomUUID();
    const search = waitForAuditSearch(page, { type: 'equipment', targetId });
    await page.goto(`/operations/admin-audit?type=equipment&targetId=${targetId}`);
    const response = await search;
    expect(response.status(), 'audit-trail search must return HTTP 200 for a target type filter').toBe(200);
    expect(((await response.json()) as { outcome?: unknown }).outcome, 'audit-trail search must answer empty for an unknown target').toBe('empty');
    await expect(mainHeading(page)).toHaveText('변경 감사');
    await expect(page.getByRole('main').getByText('조건에 맞는 결과가 없습니다')).toBeVisible();
    await evidence(page, testInfo, 'real-audit-target-empty');
  });

  test('직접 URL에서 장비 메뉴 선언의 경로와 권한을 읽는다', async ({ page }, testInfo) => {
    await page.goto('/operations/admin-registry');
    await expect(mainHeading(page)).toHaveText('메뉴 레지스트리');
    const row = page.getByRole('table', { name: '메뉴 레지스트리 목록' }).locator('[data-row-id="equipment-master"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('/mars/equipment-master');
    await expect(row).toContainText('equipment:view');
    await evidence(page, testInfo, 'real-registry-declaration');
  });
});
