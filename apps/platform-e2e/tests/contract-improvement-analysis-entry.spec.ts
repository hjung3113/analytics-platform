import { expect, test } from '@playwright/test';
import { headerMore } from './contract-helpers';
import { evidence, signInAs } from './support';

test.describe('분석에서 개선 아이템 완결 (#1408 · §13 확인 · §22 Context 링크)', () => {
  test('분석 ⋯ → Context가 채워진 서랍 → 기록 → 조치 → 효과 확인', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/mars/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&selectedEquipmentIds=MEM-PHOTO-0103&metricId=cycle_time&metricVersion=4&from=2026-11-01T00:00:00&to=2026-11-05T00:00:00&percentile=p95');
    const actions = await headerMore(page);
    await actions.getByRole('button', { name: '개선 아이템 남기기', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '개선 아이템 남기기', exact: true });
    await expect(drawer).toBeVisible();
    const context = drawer.getByRole('region', { name: '분석에서 가져온 Context' });
    await expect(context.getByText('사이클타임 상세', { exact: true })).toBeVisible();
    await expect(context.getByText('MEM-PHOTO-0103', { exact: true })).toBeVisible();
    await expect(context.getByText('2026-11-01 00:00:00 – 2026-11-05 00:00:00 KST', { exact: true })).toBeVisible();
    const source = new URL((await context.getByRole('link', { name: '분석 화면 열기' }).getAttribute('href'))!, page.url());
    expect(source.pathname).toBe('/mars/cycle-time');
    expect(source.searchParams.get('percentile')).toBe('p95');
    await expect(drawer.getByRole('button', { name: 'MEM-PHOTO-0103 제거' })).toBeVisible();
    await drawer.getByLabel('문제 · 필수', { exact: true }).fill('E2E 분석 진입점 문제');
    await drawer.getByLabel('조치', { exact: true }).fill('E2E 분석 진입점 조치');
    await evidence(page, testInfo, 'improvement-analysis-prefilled');
    await drawer.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/improvement-items\/13280000-/);
    await expect(page.getByText('E2E 분석 진입점 문제', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '조치 중', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '상태 변경 확인', exact: true });
    await dialog.getByRole('button', { name: '상태 변경 확인', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: '조치 완료', exact: true }).click();
    await dialog.getByLabel('조치일 · 필수', { exact: true }).fill('2026-11-04');
    await dialog.getByRole('button', { name: '상태 변경 확인', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: '효과 확인됨', exact: true }).click();
    await dialog.getByRole('combobox', { name: '효과 확인 결과 · 필수' }).click();
    await page.getByRole('option', { name: '효과 있음', exact: true }).click();
    await dialog.getByLabel('판단 메모', { exact: true }).fill('분석 Context를 보존한 개선 효과 확인');
    await dialog.getByRole('button', { name: '상태 변경 확인', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('분석 Context를 보존한 개선 효과 확인', { exact: true })).toBeVisible();
    await expect(page.getByText('효과 있음', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'improvement-analysis-effect-verified');
  });
  test('CLAS에서 고른 설비(eqp)가 대상 제안이 된다 (#1430 Q3 · 메뉴 선언 subjectPageKeys)', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/clas/operation-time?v=1&scopeId=MEM&from=2026-11-01T00:00:00&to=2026-11-05T00:00:00&roomNames=PHOTO&eqp=MEM-PHOTO-0105');
    const actions = await headerMore(page);
    await actions.getByRole('button', { name: '개선 아이템 남기기', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '개선 아이템 남기기', exact: true });
    await expect(drawer.getByRole('button', { name: /MEM-PHOTO-0105 제거/ })).toBeVisible();
    await expect(drawer.getByText('등록된 대상이 없습니다.')).toBeHidden();
  });

  test('생산성 개요(overview)에도 ⋯ 「개선 아이템 남기기」가 있고 드릴 설비를 제안한다 (#1430)', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/mars/productivity-overview?v=1&scopeId=MEM&roomNames=PHOTO&drillEquipment=MEM-PHOTO-0103');
    const actions = await headerMore(page);
    await actions.getByRole('button', { name: '개선 아이템 남기기', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '개선 아이템 남기기', exact: true });
    await expect(drawer.getByRole('button', { name: /MEM-PHOTO-0103 제거/ })).toBeVisible();
  });

  test('목록에서 연 만들기 서랍의 같은 메뉴 뒤로는 입력을 묻는다 (#1430 UX-1)', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/improvement-items?v=1&view=all');
    await page.getByRole('button', { name: '개선 아이템 남기기', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '개선 아이템 남기기', exact: true });
    await drawer.getByLabel('문제 · 필수', { exact: true }).fill('뒤로 확인');
    await page.goBack();
    await expect(page.getByText('저장하지 않은 변경이 있습니다')).toBeVisible();
    await page.getByRole('button', { name: '머무르기' }).click();
    await expect(drawer.getByLabel('문제 · 필수', { exact: true })).toHaveValue('뒤로 확인');
  });
});
