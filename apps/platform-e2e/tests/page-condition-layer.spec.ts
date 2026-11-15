import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

// The samples are opt-in so existing routes keep their established declarations in the default assembly.
// Run with VITE_PAGE_CONDITION_SAMPLES=1 E2E_PORT=4190 pnpm exec playwright test -g 'Page condition layer S3'.
test.describe('Page condition layer S3', () => {
  test.skip(process.env.VITE_PAGE_CONDITION_SAMPLES !== '1', 'Requires the removable synthetic sample assembly');
  test.beforeEach(async ({ page }) => { await signInAs(page, 'engineer'); });
  const period = 'v=1&scopeId=MEM&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00';

  test('apply sample: open, focus, edit, apply and close', async ({ page }, testInfo) => {
    await page.goto(`/mars/analytics/productivity?${period}&sampleChoice=syntheticAlpha`);
    const trigger = page.getByRole('button', { name: '페이지 조건', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const layer = page.getByRole('dialog', { name: '페이지 조건', exact: true });
    await expect(layer).toHaveAttribute('aria-modal', 'false');
    await expect(layer.getByRole('heading', { name: '페이지 조건', exact: true })).toBeFocused();
    await layer.getByRole('checkbox', { name: '합성 Alpha', exact: true }).check();
    expect(new URL(page.url()).searchParams.getAll('sampleMany')).toEqual([]);
    await layer.getByRole('button', { name: '적용', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll('sampleMany')).toEqual(['syntheticAlpha']);
    await evidence(page, testInfo, 'apply-layer');
    await layer.getByRole('button', { name: '페이지 조건 닫기' }).click();
    await expect(layer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('live sample: changes write through and one Back restores the opening conditions', async ({ page }, testInfo) => {
    await page.goto(`/mars/analytics/chart-catalog?${period}`);
    const trigger = page.getByRole('button', { name: '페이지 조건', exact: true });
    await trigger.click();
    const layer = page.getByRole('dialog', { name: '페이지 조건', exact: true });
    await expect(layer.getByRole('button', { name: '적용', exact: true })).toHaveCount(0);
    await layer.getByRole('checkbox', { name: '합성 Alpha', exact: true }).check();
    await layer.getByRole('checkbox', { name: '합성 Beta', exact: true }).check();
    await expect.poll(() => new URL(page.url()).searchParams.getAll('sampleMany')).toEqual(['syntheticAlpha', 'syntheticBeta']);
    await expect(layer.getByRole('checkbox', { name: '합성 항목 1', exact: true })).toBeVisible();
    await evidence(page, testInfo, 'live-layer');
    await layer.getByRole('heading', { name: '페이지 조건', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.getAll('sampleMany')).toEqual([]);
  });
});
