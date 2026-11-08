import { expect, test } from '@playwright/test';
import { evidence, mainHeading, signInAs } from './support';

test.describe('서비스 토큰 메뉴의 관리자 표시 (06 §9.1, ADR-0116 §7, #1443)', () => {
  test('admin은 권한 그룹에서 서비스 토큰을 열며 mock에서는 실서버 필요를 표시한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/operations/permission-grants');
    await expect(page.getByRole('link', { name: '서비스 토큰', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '서비스 토큰', exact: true }).click();
    await expect(mainHeading(page)).toHaveText('서비스 토큰');
    await expect(page.getByRole('main').getByRole('status')).toContainText('실서버 필요');
    await evidence(page, testInfo, 'service-token-admin-menu');
  });

  test('viewer는 서비스 토큰 메뉴를 보지 못하고 직접 주소도 거부된다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    await page.goto('/operations/service-tokens');
    await expect(page.getByRole('main')).toContainText('이 메뉴에 대한 권한이 없습니다');
    await expect(page.getByRole('link', { name: '서비스 토큰', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('service-tokens')).toHaveCount(0);
    await evidence(page, testInfo, 'service-token-viewer-denied');
  });
});
