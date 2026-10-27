import { expect, type Page } from '@playwright/test';
import { contextBar } from './support';

export const PERIOD = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
export const PRODUCTIVITY = `/mars/productivity-overview?v=1&scopeId=MEM&${PERIOD}&roomNames=PHOTO`;

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
export async function periodPreset(page: Page, name: string) {
  const bar = contextBar(page);
  await expect(bar).toBeVisible();
  if (await bar.getAttribute('data-query-bar') !== null) {
    const expand = bar.getByRole('button', { name: '조회 조건 펼치기' });
    if (await expand.count()) await expand.click();
    return { locator: bar.getByRole('button', { name: name === '1일' ? '최근 24시간' : name === '7일' ? '최근 7일' : name, exact: true }), close: async () => {
      await bar.getByRole('button', { name: '적용', exact: true }).click();
    } };
  }
  const trigger = bar.getByRole('button', { name: /^기간:/ });
  await expect(trigger).toBeVisible();
  const inline = bar.getByRole('radio', { name, exact: true });
  if (await inline.isVisible()) return { locator: inline, close: async () => {} };
  await trigger.click();
  const locator = page.getByRole('radio', { name, exact: true });
  await expect(locator).toBeVisible();
  return { locator, close: async () => {
    if (await trigger.getAttribute('aria-expanded') === 'true') await page.keyboard.press('Escape');
  } };
}
