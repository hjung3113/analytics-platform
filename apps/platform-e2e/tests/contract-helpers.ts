import { expect, type Page } from '@playwright/test';
import { browserPreferenceKey, contextBar, expandQueryBar } from './support';

export const PERIOD = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
export const PRODUCTIVITY = `/mars/productivity-overview?v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`;

/** The menu's stored query-bar choice (`'true'` collapsed, `'false'` open): a saved-state key of the Kernel contract, written in one place. */
export const queryBarCollapsedKey = (menuId: string) => browserPreferenceKey('query-bar-collapsed', menuId);
/** Stores «open» before every load, so the query bar starts expanded: an applied address starts collapsed without a stored choice (#1892). */
export async function startWithQueryBarOpen(page: Page, menuId: string) {
  await page.addInitScript(key => localStorage.setItem(key, 'false'), queryBarCollapsedKey(menuId));
}

/** Rail section buttons of the current system (15 §3.2). `exact` keeps '생산성 분석' apart from the switcher's '… 현재: MARS'. */
export function railSection(page: Page, name: string) {
  return page.getByRole('navigation', { name: '시스템 레일' }).getByRole('group', { name: '시스템 섹션' }).getByRole('button', { name, exact: true });
}
export function systemSwitcher(page: Page) {
  return page.getByRole('navigation', { name: '시스템 레일' }).getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ });
}
/** Opens the switcher and returns its popover. */
export async function openSwitcher(page: Page) {
  await systemSwitcher(page).click();
  const popover = page.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
  await expect(popover).toBeVisible();
  return popover;
}
/** Picks a system card in the switcher; the popover closes first and the Kernel moves. */
export async function chooseSystem(page: Page, name: string) {
  const popover = await openSwitcher(page);
  await popover.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(popover).toHaveCount(0);
}

/** Secondary page actions live in the header ⋯ menu at every width (#303, ADR-0035). */
export async function headerMore(page: Page) {
  const header = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await header.getByRole('button', { name: '더보기', exact: true }).click();
  const menu = page.getByRole('group', { name: '기타 페이지 동작' });
  await expect(menu).toBeVisible();
  return menu;
}
export async function liveContextEditor(page: Page, bar = contextBar(page)) {
  const editor = page.getByRole('dialog', { name: '전역 Context', exact: true });
  if (!await editor.isVisible()) {
    await bar.getByRole('button', { name: '조회 조건 펼치기', exact: true }).click();
  }
  await expect(editor).toBeVisible();
  return editor;
}

export async function liveContextActions(page: Page) {
  await contextBar(page).getByRole('button', { name: '조회 조건 동작', exact: true }).click();
  return page.getByRole('dialog', { name: '조회 조건 동작', exact: true });
}

export async function periodPreset(page: Page, name: string, bar = contextBar(page)) {
  await expect(bar).toBeVisible();
  if (await bar.getAttribute('data-query-bar') !== null) {
    await expandQueryBar(page, bar);
    const disclosure = bar.getByRole('button', { name: '조회 조건 접기', exact: true });
    const editorId = await disclosure.getAttribute('aria-controls');
    const editor = page.locator(`[id="${editorId}"]`);
    const apply = { name: '적용', exact: true };
    return { locator: editor.getByRole('button', { name, exact: true }), apply: async () => {
      await editor.getByRole('button', apply).or(bar.getByRole('button', apply)).click();
    } };
  }
  const liveLine = await bar.getAttribute('data-live-context-line') !== null;
  const editor = liveLine ? await liveContextEditor(page, bar) : bar;
  const trigger = editor.getByRole('button', { name: /^기간:/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '기간', exact: true });
  const locator = dialog.getByRole('button', { name, exact: true });
  await expect(locator).toBeVisible();
  return { locator, apply: async () => {
    await dialog.getByRole('button', { name: '적용', exact: true }).click();
    if (liveLine) {
      await expect(dialog).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  } };
}
