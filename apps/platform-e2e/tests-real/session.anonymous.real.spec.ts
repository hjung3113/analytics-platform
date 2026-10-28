import { expect, test } from './support';

test.describe('실서버 세션 진입 (06 §4)', () => {
  test('비로그인 직접 진입은 원래 목적지를 로그인 URL에 보존한다', async ({ page }) => {
    await page.goto('/operations/admin-roles?v=1');
    await expect(page).toHaveURL(/\/auth\/login\?return_to=/);
    const returnTo = new URL(page.url()).searchParams.get('return_to');
    expect(returnTo).toBe('/operations/admin-roles?v=1');
  });
});
