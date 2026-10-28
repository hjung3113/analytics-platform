import { expect, test } from '@playwright/test';

test('백엔드 연결 실패 화면에서 다시 시도를 안내한다', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByText('서버에 연결할 수 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
});
