import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support';

/**
 * 로그 지식 허브 › 카탈로그 가져오기 마법사 (#1195 c). The mock server answers the five import actions and `importDetail` like the real one:
 * a pasted list is checked, conflicts are skipped, the apply runs in several calls, and nothing reaches the catalog before 「적용」.
 */
const FIXTURE = [
  '설비사명\t공정명\t모델명', 'Alpha Semicap\tEtch\tAlpha 100', 'Alpha Semicap\tEtch, Planarization\tAlpha 200', 'Delta Corp\tEtch, Dry Clean\tDelta 1', 'Delta Corp\t\tDelta 2',
  'Beta Systems\tDeposition\tBeta 30 (retired)', 'Gamma Tech (retired)\tEtch\tGamma 2', 'Alpha Semicap\t\tAlpha', '\tEtch\tNo Maker',
].join('\n');
const step = (page: Page) => page.locator('[aria-label="가져오기 단계"] [aria-current="step"]');

async function openWizard(page: Page) {
  await signInAs(page, 'admin');
  await page.goto('/log/knowledge/catalog?tab=model');
  await page.getByRole('button', { name: '가져오기' }).click();
  await expect(page.getByRole('heading', { name: '1. 목록 붙여넣기' })).toBeFocused();
}
async function check(page: Page, text: string) {
  await page.getByLabel('붙여넣을 목록').fill(text);
  await page.getByRole('button', { name: '검사' }).click();
}
/** The model-name cell of a catalog row (code and name can read the same, so the name column is addressed on its own). */
const nameCell = (page: Page, name: string) => page.locator('[role="cell"][data-column="name"]').filter({ hasText: new RegExp(`^${name}$`) });
/** Leaves the wizard (the dialog's 그만두기), searches the catalog for `name` and counts its name cells once the filtered result has settled. */
const catalogHas = async (page: Page, name: string) => {
  await page.getByRole('button', { name: '목록으로' }).click();
  await page.getByRole('button', { name: '그만두기' }).click();
  await expect(nameCell(page, 'Alpha 100')).toBeVisible();
  const search = page.getByPlaceholder('모델 코드·이름 검색');
  await search.fill(name);
  await search.press('Enter');
  // A bare count of zero would also pass while the query is still loading. The unfiltered list's first row has to be gone and no widget busy,
  // so the count below reads the finished filtered result.
  await expect(nameCell(page, 'Alpha 100')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // A failed query also removes the table and clears the busy flag, so absence only counts next to a successful outcome:
  // no error alert, and either the searched row or the table's own 0건 count (the catalog table renders no empty-state sentence).
  await expect(page.getByRole('alert')).toHaveCount(0);
  const found = await nameCell(page, name).count();
  if (found === 0) await expect(page.getByText(/^0건/)).toBeVisible();
  return found;
};

test.describe('카탈로그 가져오기 마법사(#1195 c)', () => {
  test('붙여넣기 → 검사 → 확인 필요 행 건너뛰기 → 적용 → 결과', async ({ page }) => {
    await openWizard(page);
    await check(page, FIXTURE);
    await expect(page.getByText('아직 아무것도 저장되지 않았습니다').first()).toBeVisible();
    await expect(step(page)).toContainText('검사 결과');
    await expect(page.getByRole('heading', { name: '2. 검사 결과' })).toBeFocused();
    await expect(page.getByText(/새로 만들 설비사 1 · 공정 1/)).toBeVisible();
    await page.getByRole('button', { name: '다음 단계' }).click();
    await expect(step(page)).toContainText('확인 필요 행 정리');
    await expect(page.getByText('확인이 필요한 행 3개')).toBeVisible();
    await expect(page.getByRole('button', { name: '다음 단계' })).toBeDisabled();
    await page.getByRole('button', { name: '모두 건너뛰기' }).click();
    await page.getByRole('button', { name: '다음 단계' }).click();
    await page.getByRole('button', { name: '적용' }).click();
    await expect(page.getByText('적용했습니다')).toBeVisible({ timeout: 15_000 });
    await expect(step(page)).toContainText('적용 결과');
    await page.getByRole('button', { name: '카탈로그로 돌아가기' }).click();
    await page.getByPlaceholder('모델 코드·이름 검색').fill('Delta');
    await page.getByPlaceholder('모델 코드·이름 검색').press('Enter');
    await expect(nameCell(page, 'Delta 1')).toBeVisible();
  });

  test('머리글이 빠지면 어느 머리글인지 알려 주고 다시 검사할 수 있다', async ({ page }) => {
    await openWizard(page);
    await check(page, '설비사명\t공정명\nAlpha Semicap\tEtch');
    await expect(page.getByText(/‘모델명’ 머리글이 없습니다/)).toBeVisible();
    await expect(step(page)).toContainText('목록 붙여넣기');
    await expect(page.getByRole('button', { name: '검사' })).toBeEnabled();
  });

  test('200행을 넘는 작업도 결과 표 내보내기에 모든 행이 들어 있다', async ({ page }, testInfo) => {
    const rows = Array.from({ length: 250 }, (_, i) => `Bulk Co\tEtch\tBulk ${String(i + 1).padStart(3, '0')}`);
    await openWizard(page);
    await check(page, ['설비사명\t공정명\t모델명', ...rows].join('\n'));
    await expect(step(page)).toContainText('검사 결과');
    await page.getByRole('button', { name: '다음 단계' }).click();
    await page.getByRole('button', { name: '적용' }).click();
    await expect(page.getByText('적용했습니다')).toBeVisible({ timeout: 30_000 });
    const exportButton = page.getByRole('button', { name: '내보내기' });
    await expect(exportButton).toBeVisible();
    await exportButton.click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /필터 결과 전체.*CSV로 내보내기/ }).click();
    const file = testInfo.outputPath('import-result.csv');
    await (await download).saveAs(file);
    const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim() !== '');
    expect(lines.length - 1).toBe(250);
    expect(lines.some(line => line.includes('Bulk 250'))).toBe(true);
    expect(lines.some(line => line.includes('Bulk 001'))).toBe(true);
  });

  test('적용 전에 나가면 확인을 받고 작업을 취소하며 카탈로그는 그대로다', async ({ page }) => {
    await openWizard(page);
    await check(page, FIXTURE);
    await expect(step(page)).toContainText('검사 결과');
    await page.getByRole('button', { name: '목록으로' }).click();
    await expect(page.getByText('가져오기를 그만둘까요?')).toBeVisible();
    await page.getByRole('button', { name: '계속하기' }).click();
    await expect(page.getByText('가져오기를 그만둘까요?')).toBeHidden();
    await expect(step(page)).toContainText('검사 결과');
    expect(await catalogHas(page, 'Delta 1')).toBe(0);
  });
});
