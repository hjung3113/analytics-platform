import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

const DS = '14810000-0000-4000-8000-000000000001';
const RUN = '14810000-0000-4000-8000-000000000401';
const detail = `/log-dev/log-dataset/${DS}`;
const comparison = (run: string) => `/log-dev/log-dataset-run/${DS}/${run}`;

test.describe('log-datasets screens (06 §6·§15·§17·§18·§19)', () => {
  test('list opens a stable detail; Baseline keyboard focus and layout at both desktop widths', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-datasets');
    const table = page.getByRole('table', { name: '테스트 데이터셋 목록', exact: true });
    // The screen mounts a loading table and replaces it, toolbar included, when the list arrives (#2286).
    // Measure only after the loaded rows show: a control resolved during loading is detached by then and boundingBox() returns null.
    await expect(table.getByRole('link', { name: '전원 복구 경계 01', exact: true })).toBeVisible();
    await expect(table).not.toHaveAttribute('aria-busy', 'true');
    const search = await page.getByRole('searchbox', { name: '데이터셋 검색' }).boundingBox();
    const status = await page.getByRole('combobox', { name: '상태', exact: true }).boundingBox();
    expect(search, 'search box laid out').not.toBeNull();
    expect(status, 'status filter laid out').not.toBeNull();
    expect(Math.abs(search!.y - status!.y)).toBeLessThan(10);
    await table.getByRole('link', { name: '전원 복구 경계 01', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(detail));
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    const expected = page.getByRole('table', { name: 'Baseline b3 기대 결과' });
    await expect(expected).toBeVisible();
    const evidenceControl = expected.getByRole('button', { name: 'R-01 근거 위치 전체 보기' });
    await evidenceControl.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'R-01 근거 위치 전체 보기' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(evidenceControl).toBeFocused();
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const baseline = page.getByRole('region', { name: 'Baseline', exact: true });
      // The split settles after the resize: poll the ratio instead of reading one frame.
      await expect.poll(async () => {
        const [l, r] = [await expected.boundingBox(), await baseline.boundingBox()];
        return l && r ? l.width / r.width : 0;
      }).toBeGreaterThan(1.8);
      await expect.poll(async () => {
        const [l, r] = [await expected.boundingBox(), await baseline.boundingBox()];
        return l && r ? l.width / r.width : Infinity;
      }).toBeLessThan(2.3);
      const left = await expected.boundingBox();
      const right = await baseline.boundingBox();
      expect(left).not.toBeNull(); expect(right).not.toBeNull();
      expect(right!.x).toBeGreaterThan(left!.x);
      expect(right!.x + right!.width).toBeLessThanOrEqual(width);
      await evidence(page, info, `baseline-${width}`);
    }
  });

  test('comparison deep link retains its run across reload and tab changes', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(comparison(RUN));
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^not_comparable / }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('filter')).toBe(false);
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Baseline b3 기대 결과' })).toBeVisible();
    await page.getByRole('tab', { name: '비교', exact: true }).click();
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
  });

  test('second Suite deep links retain older run paging, rerun choices and request targets', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(detail);
    await page.getByRole('tab', { name: '회귀 실행', exact: true }).click();
    await page.getByRole('combobox', { name: '회귀 Suite', exact: true }).click();
    await page.getByRole('option', { name: '전원 복구 장기 회귀', exact: true }).click();
    await page.getByRole('button', { name: '비교 열기', exact: true }).first().click();
    await expect(page.getByRole('combobox', { name: '회귀 Suite', exact: true })).toHaveText('전원 복구 장기 회귀');
    await page.reload();
    await expect(page.getByRole('combobox', { name: '회귀 Suite', exact: true })).toHaveText('전원 복구 장기 회귀');
    await page.getByRole('button', { name: '회귀 실행 요청', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '회귀 실행 요청', exact: true });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '다음', exact: true }).first().click();
    await expect(page.getByText('27건 · 2페이지', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: '비교할 회귀 실행', exact: true }).click();
    await page.getByRole('option').nth(2).click();
    await expect(page).toHaveURL(/000000000725/);
    await expect(page.getByText('27건 · 2페이지', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: '같은 Revision 재실행 비교', exact: true }).click();
    await page.getByRole('option').last().click();
    await expect(page.getByText('재실행 비교: 14810000-0000-4000-8000-000000000726 → 14810000-0000-4000-8000-000000000725')).toBeVisible();
    await page.getByText('27건 · 2페이지', { exact: true }).locator('..').getByRole('button', { name: '이전', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '비교할 회귀 실행', exact: true })).not.toHaveText('회귀 실행 선택');
    await expect(page.getByRole('combobox', { name: '같은 Revision 재실행 비교', exact: true })).not.toHaveText('재실행 비교 대상 선택');
    await page.getByRole('combobox', { name: '회귀 Suite', exact: true }).click();
    await page.getByRole('option', { name: '전원 복구 회귀', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(detail + '(?:\\?|$)'));
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toHaveCount(0);
  });
});
