import { expect, test } from '@playwright/test';
import { signInAs } from './support';

// Alpha 100 links the mock's synthetic Layout as its model default (menus/log-dev/log-knowledge/src/mock/topview.ts); Alpha 200 has nothing linked.
const linked = '00000003-0000-4000-8000-000000000008';
const unlinked = '00000003-0000-4000-8000-000000000009';

test.describe('hub model topview', () => {
  test('a linked model shows the drawing region and the disclosure', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(`/log/knowledge/models/${linked}?v=1&scopeId=MEM`);
    const section = page.getByRole('region', { name: 'Top View', exact: true });
    await expect(section.getByText(/^적용: 모델 기본 · Layout sample-layout/)).toBeVisible();
    await expect(section.getByTestId('model-topview-slot').locator('svg').first()).toBeVisible();
    await expect(section.getByText('개략도 · 실측 아님 · 제조사 도면 아님', { exact: true })).toBeVisible();
    await expect(section.getByText('Top View를 확인할 수 없습니다', { exact: false })).toHaveCount(0);
  });

  test('an unlinked model shows 미연결', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(`/log/knowledge/models/${unlinked}?v=1&scopeId=MEM`);
    const section = page.getByRole('region', { name: 'Top View', exact: true });
    await expect(section.getByText('미연결', { exact: true })).toBeVisible();
    await expect(section.getByText('연결된 Top View가 없습니다', { exact: true })).toBeVisible();
    // No drawing; the 기준 SW select (and its icon) stays in this state.
    await expect(section.getByTestId('model-topview-slot')).toHaveCount(0);
  });
});
