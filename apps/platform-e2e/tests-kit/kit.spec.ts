import { expect, test } from '@playwright/test';

test.describe('Start kit browser check — mock 통과', () => {
  test('public session sees the public synthetic menu', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('platform:role', JSON.stringify('viewer')));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '키트 개요', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '키트 개요', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '사내 업무', exact: true })).toHaveCount(0);
    await testInfo.attach('public synthetic menu', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('in-house session follows the menu link from the first screen', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('platform:role', JSON.stringify('engineer')));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '키트 개요', exact: true })).toBeVisible();
    const destination = page.getByRole('link', { name: '사내 업무', exact: true });
    const href = await destination.getAttribute('href');
    expect(href).toBeTruthy();
    await destination.click();
    await expect(page).toHaveURL(new URL(href!, testInfo.project.use.baseURL).href);
    await expect(destination).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: '사내 업무', exact: true })).toBeVisible();
    await testInfo.attach('in-house synthetic menu', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
