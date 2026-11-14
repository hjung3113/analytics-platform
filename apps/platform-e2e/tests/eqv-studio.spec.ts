import { expect, test, type Page } from '@playwright/test';
import { evidence } from './support';
import { chooseSystem } from './contract-helpers';

/**
 * EV Studio Layouts (#1654, #1607 step 6): the `도구 › Top View 작성 › 레이아웃` menu on the mock server. Black-box: the engineer holds all three
 * Studio permissions in the mock (the mock has no partial role), so the read-only, edit-only and publish-only states are covered by
 * the menu's permission-matrix unit test and, on the real server, by hand. The layout is the mock's synthetic `sample-layout`.
 */
/** The Revision the Studio mock seeds (the real hash of its fixture); the edited publish must differ from it. */
const SEEDED_REVISION = 'sha256:0cd25afbcf9beeb516b7d6c65b16d12ba648c688c70c8c0b2db994170e1ec0f5';
const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test.describe('eqv studio layouts (06 §5·§17·§19)', () => {
  test('engineer edits a label, saves, publishes a Revision and promotes it to an EV Template', async ({ page }, testInfo) => {
    await page.goto('/');
    await chooseSystem(page, '도구');
    await page.getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name: 'Top View 작성', exact: true }).click();
    await sidebar(page).getByRole('link', { name: '레이아웃', exact: true }).click();
    // The mock also seeds the 설비 온보딩 equipment's Layout (#1658), which lists first: open the synthetic sample by name.
    await page.getByRole('region', { name: 'Layouts' }).getByRole('button', { name: 'sample-layout', exact: true }).click();
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
    // The mock seeds one published Revision of the fixture (#1656), so the dialog compares with it and lists the label change.
    await expect(publish.getByText(/^비교 기준:/)).toBeVisible();
    await expect(publish.getByRole('table', { name: 'Layout 변경 목록' }).getByRole('cell', { name: '변경', exact: true }).first()).toBeVisible();
    await publish.getByRole('button', { name: '게시', exact: true }).click();
    await expect(page.locator('[data-toast-stack]').getByText('Revision을 게시했습니다', { exact: true })).toBeVisible();
    await expect(heading(page)).toContainText('게시됨');

    // Promote: open the published Revision (read-only), then promote it.
    // Newest first: the Revision just published sits above the seeded one.
    await page.getByRole('region', { name: 'Revision 이력' }).getByRole('button', { name: /게시됨/ }).first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBe('sample-layout');
    await expect.poll(() => new URL(page.url()).searchParams.get('revision')).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(page.getByRole('button', { name: '초안 저장', exact: true })).toHaveCount(0);
    // It is the edited Revision, not the seeded one: a different hash than the seed, and the drawing shows the renamed Component.
    expect(new URL(page.url()).searchParams.get('revision')).not.toBe(SEEDED_REVISION);
    // The label is the drawn Component's SVG title (not visible text), so assert it is in the opened document.
    await expect(page.locator('svg title', { hasText: /^Edited proc ·/ })).toHaveCount(1);
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
