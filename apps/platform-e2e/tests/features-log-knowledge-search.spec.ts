import { expect, test } from '@playwright/test';
import { evidence, signInAs } from './support';

const query = 'STEP_PROCESS before PROCESS_START';

test.describe('통합 검색 URL·상세·키보드 계약 (#1509, §6.4·§13·§22)', () => {
  test('방향 주소를 복원하고 반대 방향을 별도 구역으로 열며 해석을 끈다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`/log/knowledge/search?v=1&q=${encodeURIComponent(query)}`);
    await expect(page.getByText(/방향으로 해석:/)).toBeVisible();
    const main = page.getByRole('region', { name: '검색 결과', exact: true });
    await expect(main.getByRole('link', { name: 'KI-1', exact: true })).toBeVisible();
    const opposite = page.getByRole('checkbox', { name: '반대 방향도 보기', exact: true });
    await expect(opposite).not.toBeChecked();
    await opposite.check();
    await expect(page).toHaveURL(/opposite=true/);
    const reverse = page.getByRole('region', { name: '반대 방향', exact: true });
    await expect(reverse.getByRole('link', { name: 'KI-6', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'KI-6', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'opposite-section');
    await page.getByRole('button', { name: '방향 해석 끄기', exact: true }).click();
    await expect(page.getByText(/방향으로 해석:/)).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: '통합 검색어', exact: true })).toHaveValue('STEP_PROCESS PROCESS_START');
    await page.reload();
    await expect(page.getByRole('searchbox', { name: '통합 검색어', exact: true })).toHaveValue('STEP_PROCESS PROCESS_START');
  });

  test('검색 결과에서 Item으로 이동한 뒤 관계 서랍의 키보드 입력과 접기를 유지한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(`/log/knowledge/search?v=1&q=${encodeURIComponent(query)}`);
    await page.getByRole('region', { name: '검색 결과', exact: true }).getByRole('link', { name: 'KI-1', exact: true }).click();
    await expect(page.getByRole('heading', { name: /챔버 압력 로그 지연/ })).toBeVisible();
    await page.getByRole('button', { name: '수정', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '기술 Item 수정', exact: true });
    const relation = drawer.getByRole('group', { name: '관계 1', exact: true });
    await expect(relation.getByRole('combobox')).toHaveCount(0);
    await relation.getByRole('button', { name: '관계 1 수정', exact: true }).click();
    const source = relation.getByRole('combobox', { name: 'Event A', exact: true });
    await source.focus();
    await source.press('ArrowDown');
    const search = page.getByPlaceholder('Event 키 입력', { exact: true });
    await search.fill('CHAMBER/CUSTOM_READY');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(source).toContainText('CHAMBER/CUSTOM_READY');
    await relation.getByRole('button', { name: '입력 접기', exact: true }).click();
    await expect(relation).toContainText('CHAMBER/CUSTOM_READY');
    await expect(relation.getByText('명세에 없는 Event', { exact: true })).toBeVisible();
    await evidence(page, testInfo, 'relation-summary');
  });
});
