import { expect, test, type Page } from '@playwright/test';
import { evidence, expectScopeValid, query, signInAs } from './support';

/**
 * HW Time (#690, node 690m): the four menus share one drill contract (06 §12.7) and one workspace/board contract (§12.8).
 * One spec, parameterised by menu: L1 → L2 → L3, Back, reload at L3, and the board pane at the same drill path.
 * Mount and re-read assertions stay in the SDK tests; this only observes roles, names and the URL.
 */
type Entry = 'table' | 'chart';
const MENUS: { id: string; label: string; path: string; entry: Entry }[] = [
  { id: 'hw-time-steps', label: 'HW Time 단계별', path: '/hw-time/steps', entry: 'chart' },
  { id: 'hw-time-compare', label: 'HW Time 비교', path: '/hw-time/compare', entry: 'chart' },
  { id: 'hw-time-overview', label: 'HW Time 개요', path: '/hw-time/overview', entry: 'chart' },
  { id: 'hw-time-table', label: 'HW Time 표', path: '/hw-time/table', entry: 'table' },
];
const MODULE = 'PM1';
const MOTION = 'Chuck';

/** The menu's own visible entry: a `<값> 들어가기` row action in the table, the chart's point picker + `선택 지점 실행` in the chart menus. */
async function enter(page: Page, entry: Entry, value: string) {
  if (entry === 'table') {
    await page.getByRole('button', { name: `${value} 들어가기` }).first().click();
    return;
  }
  const picker = page.getByRole('combobox', { name: '차트 지점 선택' });
  await expect(picker).toBeEnabled();
  const option = picker.locator('option').filter({ hasText: ` · ${value} · ` }).first();
  await picker.selectOption({ value: (await option.getAttribute('value'))! });
  await page.getByRole('button', { name: '선택 지점 실행' }).click();
}

const drillPath = (page: Page) => page.getByRole('navigation', { name: '드릴 경로' });

test.describe('HW Time 메뉴 4종 — 드릴 · 작업 영역 · 보드 (06 §12.7 드릴 · §12.8)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAs(page, 'engineer');
  });

  for (const menu of MENUS) {
    test(`${menu.label}: L1 → L3, Back, 새로고침, 분석 보드 칸`, async ({ page }, testInfo) => {
      await page.goto(`${menu.path}?v=1&scopeId=MEM`);
      await expectScopeValid(page, 'MEM · 메모리');
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(menu.label);
      expect(query(page).has('drillModule')).toBe(false);

      await enter(page, menu.entry, MODULE);
      await expect.poll(() => query(page).get('drillModule')).toBe(MODULE);
      expect(query(page).has('drillMotion')).toBe(false);
      await expect(drillPath(page)).toContainText(MODULE);

      await enter(page, menu.entry, MOTION);
      await expect.poll(() => query(page).get('drillMotion')).toBe(MOTION);
      expect(query(page).get('drillModule')).toBe(MODULE);
      await expect(drillPath(page)).toContainText(MOTION);
      await evidence(page, testInfo, `${menu.id}-l3`);

      await page.goBack();
      await expect.poll(() => query(page).has('drillMotion')).toBe(false);
      expect(query(page).get('drillModule')).toBe(MODULE);
      await expect(drillPath(page)).not.toContainText(MOTION);
      await page.goForward();
      await expect.poll(() => query(page).get('drillMotion')).toBe(MOTION);

      await page.reload();
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(menu.label);
      expect(query(page).get('drillModule')).toBe(MODULE);
      expect(query(page).get('drillMotion')).toBe(MOTION);
      await expect(drillPath(page)).toContainText(MOTION);

      const more = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
      await more.getByRole('button', { name: '더보기', exact: true }).click();
      await page.getByRole('group', { name: '기타 페이지 동작' }).getByRole('button', { name: '분석 보드에 열기…' }).click();
      const dialog = page.getByRole('dialog', { name: '분석 보드에 열기' });
      await dialog.getByRole('radio', { name: '새 시트' }).click();
      await dialog.getByRole('button', { name: '열기' }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe('/board');
      const pane = page.getByRole('group', { name: '칸 1' });
      await expect(page.getByRole('tab', { name: `칸 1 · ${menu.label}` })).toHaveAttribute('aria-selected', 'true');
      await expect(pane.getByRole('navigation', { name: '드릴 경로' })).toContainText(MOTION);
      await expect(pane.getByRole('navigation', { name: '드릴 경로' })).toContainText(MODULE);
      await evidence(page, testInfo, `${menu.id}-board-pane`);
    });
  }
});
