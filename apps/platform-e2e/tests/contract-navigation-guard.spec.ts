import { expect, test } from '@playwright/test';
import { PRODUCTIVITY } from './contract-helpers';
import { evidence, mainHeading, signInAs } from './support';

// There is no test-menu assembly seam or useUnsavedGuard adopter in the mock app.
// Dirty registration, stay/discard and compensated Back use the real Kernel in
// @ap/shell's LeaveConfirmDialog.test.tsx. This black-box check pins the opt-in default.
test.describe('메뉴 이동 가드 (06 §6.4, §26)', () => {
  test('가드 등록 없는 메뉴의 링크·팔레트·Back은 확인 없이 이동하고 도착 제목에 포커스한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await page.getByRole('link', { name: '사이클타임 상세 보기', exact: true }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    await expect(mainHeading(page)).toBeFocused();
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);

    await page.goBack();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expect(mainHeading(page)).toBeFocused();
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);

    await page.getByRole('navigation', { name: '시스템 레일' }).getByRole('button', { name: '메뉴 검색…', exact: true }).click();
    const search = page.getByRole('combobox', { name: '메뉴 검색', exact: true });
    await search.fill('사이클타임 상세');
    await page.getByRole('option', { name: /사이클타임 상세/ }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    await expect(mainHeading(page)).toBeFocused();
    await expect(search).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);
    await evidence(page, testInfo, '가드 없는 이동의 도착 포커스');
  });
});
