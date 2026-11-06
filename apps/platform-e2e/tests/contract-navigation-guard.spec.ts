import { expect, type Page, test } from '@playwright/test';
import { PRODUCTIVITY } from './contract-helpers';
import { evidence, mainHeading, signInAs } from './support';

// No real screen adopts useUnsavedGuard yet, so the guarded cases drive the mock-only demo fixture
// 「편집 중 시뮬레이션」 in the demo tools (apps/platform-web/src/dev/EditSimulation.tsx, #1388 node c).
// The first case pins the opt-in default: a menu that registers nothing never asks.
// A reload (beforeunload) cannot be observed here; the Kernel unit tests own it.
test.describe('메뉴 이동 가드 (06 §6.4, §26)', () => {
  test('가드 등록 없는 메뉴의 링크·팔레트·Back은 확인 없이 이동하고 도착 제목에 포커스한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await page.getByRole('link', { name: '사이클타임 상세 보기', exact: true }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    await expect(mainHeading(page)).toBeFocused();
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);

    await page.goBack();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expect(mainHeading(page)).toBeFocused();
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);

    await page.getByRole('navigation', { name: '시스템 레일' }).getByRole('button', { name: '메뉴 검색…', exact: true }).click();
    const search = page.getByRole('combobox', { name: '메뉴 검색', exact: true });
    await search.fill('사이클타임 상세');
    await page.getByRole('option', { name: /사이클타임 상세/ }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    await expect(mainHeading(page)).toBeFocused();
    await expect(search).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: '저장하지 않은 변경이 있습니다' })).toHaveCount(0);
    await evidence(page, testInfo, '가드 없는 이동의 도착 포커스');
  });
});

const CHART_CATALOG = '/mars/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=pareto';
const DEFAULT_TITLE = '저장하지 않은 변경이 있습니다';
const CUSTOM_MESSAGE = '스펙 편집기의 변경 3건이 저장되지 않았습니다';
const dialog = (page: Page) => page.getByRole('alertdialog', { name: DEFAULT_TITLE });
const sidebar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });
const stay = (page: Page) => dialog(page).getByRole('button', { name: '머무르기', exact: true });
const leave = (page: Page) => dialog(page).getByRole('button', { name: '변경 버리고 이동', exact: true });
const simulation = (page: Page) => page.getByTestId('edit-simulation');
const draftField = (page: Page) => simulation(page).getByRole('textbox', { name: '변경 내용', exact: true });
const pathname = (page: Page) => new URL(page.url()).pathname;

/** Opens the demo tools popover (it closes on Escape; the fixture state lives outside it). */
async function openDemoTools(page: Page) {
  await page.getByRole('button', { name: '응답 시나리오', exact: true }).click();
  await expect(simulation(page)).toBeVisible();
}

/** Turns the fixture on and types a change (dirty), then closes the popover. */
async function makeDirty(page: Page, { customMessage = false }: { customMessage?: boolean } = {}) {
  await openDemoTools(page);
  const enable = simulation(page).getByRole('checkbox', { name: '편집 중 시뮬레이션', exact: true });
  if ((await enable.getAttribute('aria-checked')) !== 'true') await enable.click();
  if (customMessage) await simulation(page).getByRole('checkbox', { name: '사용자 지정 메시지', exact: true }).click();
  await draftField(page).fill('규칙 A 수정');
  await page.keyboard.press('Escape');
  await expect(simulation(page)).toHaveCount(0);
}

async function expectDraft(page: Page, value: string) {
  await openDemoTools(page);
  await expect(draftField(page)).toHaveValue(value);
  await page.keyboard.press('Escape');
  await expect(simulation(page)).toHaveCount(0);
}

test.describe('메뉴 이동 가드 — 편집 중 시뮬레이션 (06 §6.4, §26)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto(CHART_CATALOG);
    await expect(mainHeading(page)).toHaveText('차트 카탈로그');
  });

  test('사이드바 링크: 기본 문구의 alertdialog, 머무르기·Escape는 URL과 입력을 지키고 버리고 이동은 이동하며 초안을 비운다', async ({ page }, testInfo) => {
    await makeDirty(page);
    const before = page.url();
    const link = sidebar(page).getByRole('link', { name: '생산성 개요', exact: true });

    await link.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('이동하면 변경이 사라집니다.');
    await expect(dialog(page)).toContainText('생산성 개요');
    await evidence(page, testInfo, '이동 확인 대화상자');
    await stay(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expectDraft(page, '규칙 A 수정');

    await link.click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expectDraft(page, '규칙 A 수정');

    await link.click();
    await leave(page).click();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expect(dialog(page)).toHaveCount(0);
    expect(pathname(page)).toBe('/mars/productivity-overview');
    await expectDraft(page, '');
  });

  test('같은 메뉴 안의 탭 변경(pathname 동일)은 확인을 열지 않는다', async ({ page }) => {
    await makeDirty(page);
    const tab = page.getByRole('tab', { selected: false }).first();
    await expect(tab).toBeVisible();
    const before = page.url();
    await tab.click();
    await expect(page).not.toHaveURL(before);
    expect(pathname(page)).toBe('/mars/chart-catalog');
    await expect(dialog(page)).toHaveCount(0);
    await expectDraft(page, '규칙 A 수정');
  });

  test('Ctrl+K 팔레트 목적지: 확인 뒤 머무르면 질의를 지킨 팔레트로 돌아가고 버리면 이동한다', async ({ page }) => {
    await makeDirty(page);
    const before = page.url();
    await page.keyboard.press('ControlOrMeta+k');
    const search = page.getByRole('combobox', { name: '메뉴 검색', exact: true });
    await expect(search).toBeVisible();
    await search.fill('지표 카탈로그');
    await page.getByRole('option', { name: /지표 카탈로그/ }).first().click();
    await expect(dialog(page)).toBeVisible();

    await stay(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(before);
    await expect(search).toBeVisible();
    await expect(search).toHaveValue('지표 카탈로그');

    await page.getByRole('option', { name: /지표 카탈로그/ }).first().click();
    await leave(page).click();
    await expect(mainHeading(page)).toHaveText('지표 카탈로그');
    await expect(search).toHaveCount(0);
  });

  test('앱 안 이동 한 번 뒤 브라우저 Back: 머무르면 URL을 지키고 버리면 되돌아간다', async ({ page }) => {
    await sidebar(page).getByRole('link', { name: '생산성 개요', exact: true }).click();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await makeDirty(page);
    const here = page.url();

    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(here); // the Kernel's history compensation is asynchronous: wait until the person is back before deciding
    await stay(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(page.url()).toBe(here);
    await expect(mainHeading(page)).toHaveText('생산성 개요');

    await page.goBack();
    await expect(dialog(page)).toBeVisible();
    await expect(page).toHaveURL(here);
    await leave(page).click();
    await expect(mainHeading(page)).toHaveText('차트 카탈로그');
    expect(pathname(page)).toBe('/mars/chart-catalog');
  });

  test('사용자 지정 메시지는 고정 결과 문장 위에 함께 보인다', async ({ page }) => {
    await makeDirty(page, { customMessage: true });
    await sidebar(page).getByRole('link', { name: '생산성 개요', exact: true }).click();
    await expect(dialog(page)).toBeVisible();
    const lines = dialog(page).locator('p');
    await expect(lines.nth(0)).toHaveText(CUSTOM_MESSAGE);
    await expect(lines.nth(1)).toHaveText('이동하면 변경이 사라집니다.');
    await stay(page).click();
  });

  test('초안을 지우면 등록이 풀려 확인 없이 이동한다', async ({ page }) => {
    await makeDirty(page);
    await openDemoTools(page);
    await simulation(page).getByRole('button', { name: '초기화', exact: true }).click();
    await expect(draftField(page)).toHaveValue('');
    await page.keyboard.press('Escape');
    await sidebar(page).getByRole('link', { name: '생산성 개요', exact: true }).click();
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    await expect(dialog(page)).toHaveCount(0);
  });
});
