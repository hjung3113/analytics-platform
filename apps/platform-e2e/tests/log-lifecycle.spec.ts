import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

const PROJECT = '14470000-0000-4000-8000-000000000101';
const ROUND = '14470000-0000-4000-8000-000000000201';
const REQUEST = '14470000-0000-4000-8000-000000000301';
const roundPath = `/log-dev/log-model-round/${PROJECT}/${ROUND}`;

test.describe('log-lifecycle screens', () => {
  test('model table opens its stable development project and Round; Gate stays alongside at both desktop widths', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-models');
    await expect(page.getByRole('table', { name: '모델 목록' })).toBeVisible();
    await expect(page.getByText('개발 건 없음', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'ETCH-300', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/log-dev/log-model-project/${PROJECT}`));
    await expect(page.getByRole('list', { name: '개발 단계' }).getByRole('listitem')).toHaveCount(5);
    await page.getByRole('button', { name: 'Round 3', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(roundPath));
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toBeVisible();
    await expect(page.getByText('불완전 · 필수 규칙 2건 미검증', { exact: true })).toBeVisible();
    const gate = page.getByRole('complementary', { name: 'Gate 결정' });
    await expect(gate.getByRole('radio', { name: '승인', exact: true })).toBeDisabled();
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const rulesBox = await page.getByRole('table', { name: '규칙 결과', exact: true }).boundingBox();
      const gateBox = await gate.boundingBox();
      expect(rulesBox).not.toBeNull(); expect(gateBox).not.toBeNull();
      expect(gateBox!.x).toBeGreaterThan(rulesBox!.x);
      expect(gateBox!.x + gateBox!.width).toBeLessThanOrEqual(width);
      await evidence(page, testInfo, `round-gate-${width}`);
    }
  });

  test('request drawer restores from URL and opens attempts/results; registration from a Round fixes that Round', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`/log-dev/log-validation-requests?request=${REQUEST}`);
    await expect(page.getByRole('heading', { name: '검증 요청 상세' })).toBeVisible();
    await expect(page.getByRole('region', { name: '시도 이력', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Round 결과 열기' }).click();
    await expect(page).toHaveURL(new RegExp(roundPath));
    await page.getByRole('button', { name: '요청 등록', exact: true }).click();
    await expect(page.getByLabel('Round (필수)', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Round (필수)', { exact: true })).toHaveValue(ROUND);
    await evidence(page, testInfo, 'register-fixed-round');
  });

  test('rule filters restore after reload and excerpts require an explicit read', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`${roundPath}?result=NOT_CHECKED`);
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toContainText('SEQ-002');
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).not.toContainText('TIME-001');
    await expect(page.getByText('보관 기간 지남으로 삭제됨', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '발췌 보기', exact: true }).click();
    await expect(page.getByText('보관 기간 지남으로 삭제됨', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('table', { name: '규칙 결과', exact: true })).toContainText('SEQ-002');
    await evidence(page, testInfo, 'rule-filter-restored');
  });
});
