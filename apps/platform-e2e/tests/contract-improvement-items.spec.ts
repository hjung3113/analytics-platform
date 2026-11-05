import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

// Menu-query/menu-action Consumers: observable permission, versioned confirmation and URL Context contracts.
test.describe('개선 아이템 (§5 권한 · §13 표/확인 · §22 Context 링크)', () => {
  test('목록 → 상세 → 확인 후 상태 변경 → Context로 만들기', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/improvement-items?v=1&scopeId=MEM&view=all');
    await expect(page.getByRole('columnheader', { name: /^담당/ })).toBeVisible();
    await expect(page.getByText('효과 확인 대기', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'IM-1', exact: true }).click();
    await expect(page.getByText('이송 대기 시간 증가', { exact: true })).toBeVisible();
    await expect(page.getByText('2026-11-01 00:00:00 – 2026-11-05 00:00:00 KST', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '조치 중', exact: true }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByLabel('조치 · 필수', { exact: true }).fill('E2E 확인 조치');
    await evidence(page, testInfo, 'improvement-status-confirmation');
    await confirm.getByRole('button', { name: '상태 변경 확인', exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText('E2E 확인 조치', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '조치 완료', exact: true })).toBeVisible();
    // Normal navigation preserves the in-tab deterministic mock store; no injected app state.
    await page.getByRole('link', { name: '목록', exact: true }).click();
    await page.getByRole('button', { name: '개선 아이템 남기기', exact: true }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('분석에서 가져온 Context', { exact: true })).toBeVisible();
    await drawer.getByLabel('문제 · 필수', { exact: true }).fill('E2E 기록한 문제');
    await drawer.getByLabel('외부 키', { exact: true }).fill('EQ-E2E');
    await drawer.getByLabel('표시 이름', { exact: true }).fill('E2E 설비');
    await drawer.getByRole('button', { name: '대상 추가', exact: true }).click();
    await drawer.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByText('E2E 기록한 문제', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/improvement-items\/13280000-/);
    await evidence(page, testInfo, 'improvement-created-detail');
  });

  test('빈 결과는 검색과 보기와 만들기를 유지하고 읽기 전용 권한은 따로 보인다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/improvement-items?v=1&scopeId=MEM&view=all&q=NO_MATCH_1328');
    await expect(page.getByText('조건에 맞는 결과가 없습니다', { exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: '문제·조치 검색', exact: true })).toHaveValue('NO_MATCH_1328');
    await expect(page.getByRole('button', { name: '개선 아이템 남기기', exact: true })).toBeEnabled();
    await expect(page.getByRole('tab', { name: '내 담당', exact: true })).toBeVisible();
    await evidence(page, testInfo, 'improvement-empty-with-controls');
    await page.getByRole('button', { name: '조건 지우기', exact: true }).click();
    await expect(page.getByRole('link', { name: 'IM-1', exact: true })).toBeVisible();
    await signInAs(page, 'viewer');
    await page.reload();
    await expect(page.getByText('개선 아이템을 만들거나 상태를 바꾸려면 improvement.manage 권한이 필요합니다.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '개선 아이템 남기기', exact: true })).toHaveCount(0);
  });
});
