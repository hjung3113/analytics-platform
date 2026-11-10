import { expect, test, type Page } from '@playwright/test';
import { evidence } from './support';
import { chooseSystem } from './contract-helpers';

/**
 * 설비 온보딩 (#1658, #1607 step 8): `도구 › Top View 작성 › 설비 온보딩` on the mock server. Black-box: the equipment, Sample Window and rules
 * are the mock's synthetic `eq-synth-*` seed; the engineer holds every Studio permission in the mock. The read-only state is covered by the
 * menu's unit tests (no partial role in the mock).
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
// The menu's own address keys: the Kernel also carries global Context (`from`/`to` time) across menus (kernel §6.4), which is not this menu's state.
const GLOBAL_CONTEXT_KEYS = new Set(['v', 'from', 'to', 'relativePeriod']);
const keys = (page: Page) => [...new URL(page.url()).searchParams.keys()].filter((key) => !GLOBAL_CONTEXT_KEYS.has(key)).sort();

test.describe('eqv studio onboarding', () => {
  test('engineer opens an equipment from the Fleet, reviews Mapping and publishes from 검증·게시', async ({ page }, testInfo) => {
    await page.goto('/');
    await chooseSystem(page, '도구');
    await page.getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name: 'Top View 작성', exact: true }).click();
    await sidebar(page).getByRole('link', { name: '설비 온보딩', exact: true }).click();
    await expect(page.getByText('게시됨 · Drift 미확인', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('관측 없음', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'eqv-onboarding-fleet');

    await page.getByRole('button', { name: 'eq-synth-01 열기', exact: true }).click();
    await expect(heading(page)).toContainText('eq-synth-01');
    expect(keys(page)).toEqual(['equipment']);
    const steps = page.getByRole('tablist', { name: '온보딩 단계' });

    await steps.getByRole('tab', { name: /^Mapping/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('mapping');
    await expect(page.getByRole('listbox', { name: 'Alias 목록' })).toBeVisible();
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('개략도 · 실측 아님 · 제조사 도면 아님', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'eqv-onboarding-mapping');

    await steps.getByRole('tab', { name: /^검증·게시/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('validate');
    const review = page.getByRole('button', { name: '게시 검토', exact: true });
    await expect(review).toBeEnabled({ timeout: 15_000 });
    await review.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Mapping을 게시할까요?', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/^열린 binding\(2026-01-01T10:04:30\.000 ~\)을 2026-01-01T10:30:00\.000에서 닫습니다$/)).toBeVisible();
    await evidence(page, testInfo, 'eqv-onboarding-publish-review');
    await dialog.getByRole('button', { name: '게시', exact: true }).click();
    await expect(page.locator('[data-toast-stack]').getByText('Mapping을 게시했습니다', { exact: true })).toBeVisible();
    // The publish stored a Baseline Inventory, so Drift is now judged in the browser: the title leaves «게시됨 · Drift 미확인».
    await expect(heading(page)).not.toContainText('Drift 미확인');
    expect(keys(page)).toEqual(['equipment', 'step']);

    // Back walks the tabs, then the equipment, back to the Fleet.
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('mapping');
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBeNull();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('equipment')).toBeNull();
    await expect(page.getByRole('button', { name: 'eq-synth-01 열기', exact: true })).toBeVisible();
  });
});
