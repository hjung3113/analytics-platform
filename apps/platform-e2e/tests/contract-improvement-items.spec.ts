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

  test('조치일 Context 비교 링크를 효과 확인과 함께 저장하고 다시 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto('/improvement-items/13280000-0000-4000-8000-000000000003?v=1&scopeId=MEM');
    await expect(page.getByText('2026-10-28 00:00:00 – 2026-11-04 00:00:00 KST', { exact: true })).toBeVisible();
    await expect(page.getByText('2026-11-04 00:00:00 – 2026-11-11 00:00:00 KST', { exact: true })).toBeVisible();
    const comparison = page.getByRole('link', { name: '분석 화면에서 전후 비교 열기', exact: true });
    const href = await comparison.getAttribute('href');
    expect(href).toMatch(/^\/mars\/cycle-time\?/);
    const url = new URL(href!, page.url());
    expect(url.searchParams.get('from')).toBe('2026-11-04T00:00:00');
    expect(url.searchParams.get('to')).toBe('2026-11-11T00:00:00');
    await page.getByRole('button', { name: '효과 확인에 이 비교 사용', exact: true }).click();
    await page.getByRole('button', { name: '효과 확인됨', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox', { name: '선택한 비교 링크 함께 저장' })).toBeChecked();
    await dialog.getByRole('combobox', { name: '효과 확인 결과 · 필수' }).click();
    await page.getByRole('option', { name: '효과 있음', exact: true }).click();
    await dialog.getByLabel('판단 메모', { exact: true }).fill('분석 화면에서 전후 기간 확인');
    await evidence(page, testInfo, 'improvement-effect-confirmation');
    await dialog.getByRole('button', { name: '상태 변경 확인', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('분석 화면에서 전후 기간 확인', { exact: true })).toBeVisible();
    const saved = page.getByRole('link', { name: '저장한 비교 열기', exact: true });
    await expect(saved).toHaveAttribute('href', href!);
    await expect(page.getByRole('combobox', { name: '앞뒤 구간 길이' })).toHaveCount(0);
    await evidence(page, testInfo, 'improvement-effect-verified');
    const popupPromise = page.waitForEvent('popup');
    await saved.click();
    const analysis = await popupPromise;
    await expect(analysis).toHaveURL(url.href);
    // The analysis screen lands on the after window (equal windows, so its Compare interaction reaches the before window
    // once a query runs); this screen only carries the Context, it never queries.
    await expect(analysis.getByText('11-04 00:00 → 11-11 00:00 (7일)', { exact: true }).first()).toBeVisible();
    await analysis.close();
  });
});
