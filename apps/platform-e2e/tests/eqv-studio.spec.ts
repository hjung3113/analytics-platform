import { expect, test, type Page } from '@playwright/test';
import { evidence } from './support';
import { chooseSystem } from './contract-helpers';

/**
 * EV Studio Layouts (#1654, #1607 step 6): the `도구 › Top View 작성 › 레이아웃` menu on the mock server. Black-box: the engineer holds all three
 * Studio permissions in the mock (the mock has no partial role), so the read-only, edit-only and publish-only states are covered by
 * the menu's permission-matrix unit test and, on the real server, by hand. The layout is the mock's synthetic `sample-layout`.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test.describe('eqv studio layouts', () => {
  test('engineer edits a label, saves, publishes a Revision and promotes it to an EV Template', async ({ page }, testInfo) => {
    await page.goto('/');
    await chooseSystem(page, '도구');
    await page.getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name: 'Top View 작성', exact: true }).click();
    await sidebar(page).getByRole('link', { name: '레이아웃', exact: true }).click();
    await expect(heading(page)).toContainText('sample-layout');
    await expect(page.locator('[data-component-id]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('개략도 · 실측 아님 · 제조사 도면 아님', { exact: true })).toBeVisible();

    // Edit: select a Component on the drawing and rename it.
    await page.locator('[data-component-id="proc-a"]').first().click();
    await page.getByLabel('이름', { exact: true }).fill('Edited proc');
    await expect(heading(page)).toContainText('저장 안 됨');
    await expect(page.getByRole('button', { name: 'Revision 게시', exact: true })).toBeDisabled();
    await evidence(page, testInfo, 'eqv-studio-edited');

    // Save, then publish the saved draft.
    await page.getByRole('button', { name: '초안 저장', exact: true }).click();
    await expect(page.locator('[data-toast-stack]').getByText('초안을 저장했습니다', { exact: true })).toBeVisible();
    await expect(heading(page)).not.toContainText('저장 안 됨');
    await page.getByRole('button', { name: 'Revision 게시', exact: true }).click();
    const publish = page.getByRole('alertdialog');
    await expect(publish.getByText('첫 Revision', { exact: true })).toBeVisible();
    await publish.getByRole('button', { name: '게시', exact: true }).click();
    await expect(page.locator('[data-toast-stack]').getByText('Revision을 게시했습니다', { exact: true })).toBeVisible();
    await expect(heading(page)).toContainText('게시됨');

    // Promote: open the published Revision (read-only), then promote it.
    await page.getByRole('region', { name: 'Revision 이력' }).getByRole('button', { name: /게시됨/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('sample-layout');
    await expect.poll(() => new URL(page.url()).searchParams.get('revision')).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(page.getByRole('button', { name: '초안 저장', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'EV Template으로 승격', exact: true }).click();
    const promote = page.getByRole('alertdialog');
    await promote.getByLabel('ID', { exact: false }).fill('e2e-template');
    await promote.getByLabel('이름', { exact: false }).fill('E2E template');
    await promote.getByRole('button', { name: '승격', exact: true }).click();
    await expect(page.locator('[data-toast-stack]').getByText('EV Template e2e-template 승격 완료 · 삭제 불가', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'EV Templates' }).getByRole('button', { name: 'e2e-template' })).toBeVisible();
    await evidence(page, testInfo, 'eqv-studio-promoted');
  });
});
