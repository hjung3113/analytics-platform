import { expect, test } from '@playwright/test';
import { evidence, setScenario, signInAs } from './support';

const DS = '14810000-0000-4000-8000-000000000001';
const RUN = '14810000-0000-4000-8000-000000000401';
const FAILED = '14810000-0000-4000-8000-000000000403';
const detail = `/log-dev/log-dataset/${DS}`;
const comparison = (run: string) => `/log-dev/log-dataset-run/${DS}/${run}`;

test.describe('log-datasets screens (06 §6·§15·§17·§18·§19)', () => {
  test('server list paging and search open a stable detail with all five tabs at both desktop widths', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-datasets');
    const table = page.getByRole('table', { name: '테스트 데이터셋 목록', exact: true });
    await expect(table).toBeVisible();
    await expect(page.getByText('40건 · 1/2 페이지', { exact: true })).toBeVisible();
    const search = await page.getByRole('searchbox', { name: '데이터셋 검색' }).boundingBox();
    const status = await page.getByRole('combobox', { name: '상태', exact: true }).boundingBox();
    expect(Math.abs(search!.y - status!.y)).toBeLessThan(10);
    await expect(table.getByRole('link', { name: '전원 복구 경계 01', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(table.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(15);
    await page.getByRole('searchbox', { name: '데이터셋 검색' }).fill('찾을 수 없는 데이터셋');
    await expect(page.getByText('조건에 맞는 테스트 데이터셋이 없습니다.')).toBeVisible();
    await expect(page.getByText('검색어나 상태 필터를 변경해 주세요.')).toBeVisible();
    await page.getByRole('searchbox', { name: '데이터셋 검색' }).fill('전원 복구 경계 01');
    await table.getByRole('link', { name: '전원 복구 경계 01', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(detail));
    await expect(page.getByRole('region', { name: '데이터셋 개요', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /탐색에서 열기/ }).first()).toBeDisabled();
    await page.getByRole('tab', { name: 'Revision', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Revision 이력' })).toBeVisible();
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    const expected = page.getByRole('table', { name: 'Baseline b3 기대 결과' });
    await expect(expected).toBeVisible();
    const evidenceControl = expected.getByRole('button', { name: 'R-01 근거 위치 전체 보기' });
    await evidenceControl.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'R-01 근거 위치 전체 보기' })).toContainText('synthetic/power-start.log · 10행');
    await page.keyboard.press('Escape');
    await expect(evidenceControl).toBeFocused();
    await expect(page.getByText('명세 고정값 변경', { exact: true })).toBeVisible();
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const left = await expected.boundingBox();
      const right = await page.getByRole('region', { name: 'Baseline', exact: true }).boundingBox();
      expect(left).not.toBeNull(); expect(right).not.toBeNull();
      expect(right!.x).toBeGreaterThan(left!.x);
      expect(left!.width / right!.width).toBeGreaterThan(1.8);
      expect(left!.width / right!.width).toBeLessThan(2.3);
      expect(right!.x + right!.width).toBeLessThanOrEqual(width);
      await evidence(page, info, `baseline-${width}`);
    }
    await page.getByRole('tab', { name: '회귀 실행', exact: true }).click();
    await expect(page.getByRole('region', { name: '회귀 실행 요청', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '비교', exact: true }).click();
    await expect(page.getByText('비교할 회귀 실행을 선택하세요.')).toBeVisible();
  });

  test('comparison fixes the run, filters on the server and appends a review label without changing the script result', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto(comparison(RUN));
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
    await expect(page.getByText('필수 미검사 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^not_comparable / }).click();
    const table = page.getByRole('table', { name: 'Baseline 대비 규칙 결과' });
    await expect(table.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(1);
    await expect(table).toContainText('R-04');
    await expect(table).toContainText('NOT_CHECKED');
    await table.getByRole('button', { name: 'R-04 검토 전' }).click();
    const drawer = page.getByRole('dialog', { name: '결과 검토 라벨' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('textbox', { name: '검토 사유' }).fill('합성 엔진 지원 범위 확인');
    await drawer.getByRole('button', { name: '결과 검토 라벨 남기기' }).click();
    await expect(drawer.getByRole('status')).toContainText('결과 검토 라벨을 남겼습니다.');
    await evidence(page, info, 'review-label');
    await page.keyboard.press('Escape');
    await expect(table).toContainText('needs_review');
    await expect(table).toContainText('NOT_CHECKED');
    await page.reload();
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('filter')).toBe(false);
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Baseline b3 기대 결과' })).toBeVisible();
    await page.getByRole('tab', { name: '비교', exact: true }).click();
    await expect(page.getByRole('region', { name: '실행 커버리지', exact: true })).toBeVisible();
  });

  test('request drawer pins the approved baseline and shows queued registration and the concurrent limit', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto(detail);
    await page.getByRole('tab', { name: '회귀 실행', exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: '회귀 실행 요청', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: '회귀 실행 요청' });
      await expect(drawer.getByText('r3 · Baseline b2', { exact: true })).toBeVisible();
      await drawer.getByRole('button', { name: '회귀 실행 요청 등록', exact: true }).click();
      if (i < 3) await expect(drawer.getByRole('status')).toContainText('검증 요청: 대기');
      else await expect(drawer.getByRole('alert')).toContainText('동시 실행 한도 3건에 도달했습니다.');
      await evidence(page, info, i < 3 ? `request-queued-${i}` : 'request-failed');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: '회귀 실행 요청', exact: true })).toBeFocused();
    }
  });

  test('failed attempts stay unclassified and approval requires its session permission', async ({ page }, info) => {
    await signInAs(page, 'viewer');
    await page.goto(detail);
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    await expect(page.getByText(/Baseline 승인 권한이 없습니다/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '초안 b3 승인' })).toBeDisabled();
    await evidence(page, info, 'approval-denied');
    await page.goto(comparison(FAILED));
    await expect(page.getByText(/성공한 시도가 없어 실행 커버리지와 규칙 분류를 계산하지 않았습니다/)).toBeVisible();
    await expect(page.getByText('미산출', { exact: true })).toBeVisible();
    await expect(page.getByText('실행 0', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Baseline 대비 규칙 결과' })).toHaveCount(0);
    await expect(page.getByText('비교 결과를 제공할 수 없습니다.')).toBeVisible();
    await evidence(page, info, 'comparison-unavailable');
  });

  test('self approval is recorded and a missing source is visibly unavailable', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto(detail);
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    await page.getByRole('textbox', { name: '승인 사유' }).fill('합성 데이터 기대 결과 검토 완료');
    await page.getByRole('button', { name: '초안 b3 승인' }).click();
    await expect(page.getByText(/자기 승인/).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: '승인 사유' })).toHaveCount(0);
    await evidence(page, info, 'self-approved');
    await page.goto('/log-dev/log-dataset/14810000-0000-4000-8000-000000000002');
    await expect(page.getByText('원본 부재 · 열람 불가', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Baseline', exact: true }).click();
    await expect(page.getByText('초안 없음 · 이 Revision에 등록된 Baseline이 없습니다.')).toBeVisible();
    await evidence(page, info, 'source-unavailable');
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
    await expect(drawer.getByText('실행 프로파일: ep-9', { exact: true })).toBeVisible();
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

  test('loading retains headers and skeletons while keeping stale rows hidden', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-datasets');
    const table = page.getByRole('table', { name: '테스트 데이터셋 목록', exact: true });
    await expect(table).toBeVisible();
    await setScenario(page, '느린 응답 (+2.2s)');
    await page.getByRole('searchbox', { name: '데이터셋 검색' }).fill('경계');
    await expect(table).toHaveAttribute('aria-busy', 'true');
    await expect(table.getByRole('columnheader', { name: '이름', exact: true })).toBeVisible();
    await expect(table.getByRole('cell')).toHaveCount(0);
    await expect(table.locator('.animate-pulse')).not.toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: '데이터셋 검색' })).toBeVisible();
    await expect(table).toHaveAttribute('aria-busy', 'false');
  });

  test('loading and failure remain distinct from an empty list', async ({ page }, info) => {
    await signInAs(page, 'admin');
    await page.goto('/log-dev/log-datasets');
    await expect(page.getByRole('table', { name: '테스트 데이터셋 목록', exact: true })).toBeVisible();
    await setScenario(page, '서버 오류 (error)');
    // Scenario changes invalidate the mounted query through the adapter subscription.

    await expect(page.getByText('데이터를 불러오지 못했습니다.')).toBeVisible();
    await expect(page.getByText('등록된 테스트 데이터셋이 없습니다.')).toHaveCount(0);
    await evidence(page, info, 'list-error');
  });
});
