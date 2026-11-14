import { expect, test } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, headerMore } from './contract-helpers';
import { evidence, expectScopeValid, mainHeading, signInAs } from './support';

test.describe('다른 화면에서 열기 (06 §22, #1930)', () => {
  test('생산성 행 목록에서 설비 상세를 열고 분석 Selection을 보존한다', async ({ page }, testInfo) => {
    // A Selection of another equipment: opening one object must not change the analysis Selection (§22).
    await page.goto(`${PRODUCTIVITY}&selectedEquipmentIds=MEM-PHOTO-0111`);
    await expectScopeValid(page, 'MEM · 메모리');
    const attention = page.getByRole('region', { name: '확인할 항목', exact: true });
    const trigger = attention.getByRole('button', { name: / 다른 화면에서 열기$/ }).first();
    await expect(trigger).toBeVisible();
    const id = (await trigger.getAttribute('aria-label'))!.replace(/ 다른 화면에서 열기$/, '');
    const selection = new URL(page.url()).searchParams.getAll('selectedEquipmentIds');
    expect(selection).toEqual(['MEM-PHOTO-0111']);
    await trigger.click();
    const list = page.getByRole('group', { name: `${id} 다른 화면에서 열기`, exact: true });
    await expect(list.getByRole('button', { name: '설비 상세', exact: true })).toBeVisible();
    await evidence(page, testInfo, 'productivity-object-links');
    await list.getByRole('button', { name: '설비 상세', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/mars/equipment-detail/${encodeURIComponent(id)}\\?`));
    expect(new URL(page.url()).searchParams.getAll('selectedEquipmentIds')).toEqual(selection);
    await expect(mainHeading(page)).toBeFocused(); // arrival focus (06 §26)
  });

  test('CLAS 머리 목록은 설비 상세를 표시하고 자기 메뉴를 제외한다', async ({ page }, testInfo) => {
    const id = 'MEM-PHOTO-0103';
    await page.goto(`/clas/operation-time?v=1&scopeId=MEM&${PERIOD}&eqp=${id}`);
    await expect(mainHeading(page)).toHaveText('CLAS');
    await expectScopeValid(page, 'MEM · 메모리');
    const overflow = await headerMore(page);
    const group = overflow.getByRole('group', { name: `${id} 다른 화면에서 열기`, exact: true });
    await expect(group.getByRole('button', { name: '설비 상세', exact: true })).toBeVisible();
    await expect(group.getByRole('button', { name: 'CLAS', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'clas-header-object-links');
  });

  test('실행 상세 머리는 경로 설비의 목록을 자체 동작 뒤에 표시한다', async ({ page }, testInfo) => {
    const id = 'MEM-PHOTO-0103';
    await page.goto(`/mars/execution-detail/${id}?v=1&scopeId=MEM&${PERIOD}&entityType=job&anchor=2456001`);
    await expect(mainHeading(page)).toContainText(id);
    await expectScopeValid(page, 'MEM · 메모리');
    const overflow = await headerMore(page);
    const group = overflow.getByRole('group', { name: `${id} 다른 화면에서 열기`, exact: true });
    await expect(group.getByRole('button', { name: '설비 상세', exact: true })).toBeVisible();
    await expect(group.getByRole('button', { name: 'CLAS', exact: true })).toBeVisible();
    await expect(overflow.getByRole('link', { name: '설비 상세', exact: true })).toHaveCount(0);
    await evidence(page, testInfo, 'execution-header-object-links');
  });

  test('page 키로 받는 목적지(CLAS)도 출발 화면으로 돌아가는 길을 준다', async ({ page }) => {
    await page.goto(PRODUCTIVITY);
    await expectScopeValid(page, 'MEM · 메모리');
    const trigger = page.getByRole('region', { name: '확인할 항목', exact: true }).getByRole('button', { name: / 다른 화면에서 열기$/ }).first();
    const id = (await trigger.getAttribute('aria-label'))!.replace(/ 다른 화면에서 열기$/, '');
    await trigger.click();
    await page.getByRole('group', { name: `${id} 다른 화면에서 열기`, exact: true }).getByRole('button', { name: 'CLAS', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/clas/operation-time\\?.*eqp=${encodeURIComponent(id)}`));
    await expect(mainHeading(page)).toBeFocused();
    // The destination shows the object it was opened for: the ranking's selection names it (#2187).
    await expect(page.getByRole('region', { name: '설비별 동작시간', exact: true }).getByRole('region', { name: '선택 요약', exact: true })).toContainText(id);
    await (await headerMore(page)).getByRole('link', { name: '← 생산성 개요', exact: true }).click();
    await expect(page).toHaveURL(/\/mars\/productivity-overview\?/);
  });
  test('주소로 연 설비가 순위 차트 상위 N 밖이어도 선택 요약이 그 설비를 말한다 (#2187)', async ({ page }) => {
    // Admin sees every MEM room (54 synthetic equipment): this one ranks below the response's 30-row cap. Its flow draws, and the ranking says where it is.
    await signInAs(page, 'admin');
    await page.goto(`/clas/operation-time?v=1&scopeId=MEM&${PERIOD}&eqp=MEM-ETCH-0122`);
    await expectScopeValid(page, 'MEM · 메모리');
    await expect(page.getByRole('region', { name: '설비별 동작시간', exact: true }).getByRole('region', { name: '선택 요약', exact: true })).toContainText('MEM-ETCH-0122 · 상위 10개 밖');
  });
});
