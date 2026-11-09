// One-off visual self-check for W-1189p; not a committed E2E spec.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const out = new URL('../../.review/selfcheck/', import.meta.url).pathname;
const observations = [];
let browser;
try { browser = await chromium.launch(); }
catch { browser = await chromium.launch({ channel: 'chrome' }); }
try {
  for (const variant of (process.env.SELFCHECK_VARIANTS?.split(',') ?? ['A', 'B', 'C', 'now'])) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      localStorage.setItem('platform:role', JSON.stringify('admin'));
      localStorage.setItem('platform:lang', 'ko');
      localStorage.setItem('platform:sidebar-collapsed', '0');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const suffix = variant === 'now' ? '' : `&variant=${variant}`;
    async function load(path) {
      await page.goto(`http://127.0.0.1:4198${path}?v=1&scopeId=MEM${suffix}`);
      await page.locator('#platform-main h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      await page.mouse.move(1400, 880);
    }
    await load('/home');
    await page.screenshot({ path: `${out}home-empty-${variant}.png` });
    await load('/mars/productivity-overview');
    const add = page.getByRole('button', { name: '즐겨찾기에 추가', exact: true });
    if (await add.count()) await add.click();
    await load('/clas/operation-time');
    await load('/home');
    await page.screenshot({ path: `${out}home-${variant}.png` });
    observations.push({ variant, kind: 'homeGroups', headings: await page.getByRole('region', { name: '업무 시스템', exact: true }).getByRole('heading').evaluateAll(els => els.map(el => ({ text: el.textContent, x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, parentX: el.parentElement.getBoundingClientRect().x, parentWidth: el.parentElement.getBoundingClientRect().width }))) });
    observations.push({ variant, kind: 'home', systems: await page.getByRole('region', { name: '업무 시스템', exact: true }).getByRole('link').evaluateAll(els => els.map(el => ({ text: el.textContent, href: el.getAttribute('href'), height: el.getBoundingClientRect().height }))) });
    const remove = page.locator('#platform-main').getByRole('button', { name: '즐겨찾기에서 제거', exact: true });
    if (await remove.count()) {
      await remove.focus();
      await remove.click();
      await page.waitForTimeout(100);
      observations.push({ variant, kind: 'favoriteRemoval', active: await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent })) });
    }
    const dismiss = page.getByRole('button', { name: '이번 방문 동안 닫기', exact: true }).first();
    if (await dismiss.count()) { await dismiss.click(); observations.push({ variant, kind: 'noticeDismiss', remaining: await page.getByRole('button', { name: '이번 방문 동안 닫기', exact: true }).count() }); }

    await load('/mars/productivity-overview');
    const trigger = variant === 'now' ? page.getByRole('button', { name: /시스템 및 플랫폼 메뉴/, includeHidden: true }) : page.locator('[data-proto-switcher-trigger]');
    if (variant === 'C') {
      await trigger.hover();
      await page.waitForTimeout(350);
      observations.push({ variant, kind: 'expandedTooltip', count: await page.getByRole('tooltip').count() });
      await page.mouse.move(1400, 880);
    }
    await trigger.click();
    await page.waitForTimeout(300);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    observations.push({ variant, kind: 'open', active: await page.evaluate(() => document.activeElement?.textContent), box: await dialog.boundingBox(), cards: await dialog.locator('[data-switcher-card]').count(), rows: await dialog.locator('[data-switcher-card]').evaluateAll(els => els.map(el => ({ height: el.getBoundingClientRect().height, weight: getComputedStyle(el).fontWeight, background: getComputedStyle(el).backgroundColor, current: el.getAttribute('aria-current'), icons: el.querySelectorAll('svg').length }))) });
    observations.push({ variant, kind: 'triggerGeometry', geometry: await trigger.evaluate(el => {
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { target: box(el), visual: box(el.firstElementChild), glyph: box(el.firstElementChild.firstElementChild), headHeight: el.closest('aside')?.firstElementChild.getBoundingClientRect().height };
    }) });
    await page.mouse.move(1400, 880);
    await page.screenshot({ path: `${out}switcher-${variant}.png` });
    const focusWalk = [];
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab');
      focusWalk.push(await page.evaluate(() => ({ inside: !!document.activeElement?.closest('[role=dialog]'), name: document.activeElement?.textContent })));
    }
    observations.push({ variant, kind: 'focusTrap', allInside: focusWalk.every(item => item.inside), focused: focusWalk.map(item => item.name) });

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(300);
    observations.push({ variant, kind: 'escape', focusReturned: await trigger.evaluate(el => el === document.activeElement) });
    await trigger.click();
    await page.waitForTimeout(300);
    await page.locator('[data-switcher-card]').filter({ hasText: 'BRAVO' }).click();
    await page.waitForURL('**/bravo/**');
    await page.waitForTimeout(400);
    observations.push({ variant, kind: 'arrival', url: page.url(), focus: await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent })) });
    if (variant === 'C' || variant === 'now') {
      await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
      const collapsedTrigger = variant === 'now' ? page.getByRole('button', { name: /시스템 및 플랫폼 메뉴/, includeHidden: true }) : page.locator('[data-proto-switcher-trigger]');
      observations.push({ variant, kind: 'collapsedGeometry', head: await page.locator('aside[data-collapsed="true"] > div').first().boundingBox(), expand: await page.getByRole('button', { name: '사이드바 펼치기', exact: true }).boundingBox(), trigger: await collapsedTrigger.boundingBox() });
      await collapsedTrigger.click();
      await page.waitForTimeout(300);
      await page.mouse.move(1400, 880);
      await page.screenshot({ path: `${out}switcher-${variant}-collapsed.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForTimeout(300);
      observations.push({ variant, kind: 'collapsed', triggerVisible: await collapsedTrigger.isVisible(), expandVisible: await page.getByRole('button', { name: '사이드바 펼치기', exact: true }).isVisible(), focusReturned: await collapsedTrigger.evaluate(el => el === document.activeElement) });
    }
    const homeLink = variant === 'C' ? page.getByRole('navigation', { name: '시스템 레일' }).getByRole('link', { name: '플랫폼 홈', exact: true }) : null;
    if (homeLink) {
      await homeLink.click();
      await page.waitForURL('**/home?**');
      observations.push({ variant, kind: 'railHome', url: page.url() });
    }
    observations.push({ variant, kind: 'pageerrors', errors });
    await context.close();
    console.log(`captured ${variant}`);
  }
} finally {
  await browser.close();
  await writeFile(`${out}${process.env.SELFCHECK_VARIANTS ? `observations-fix1-confirm-${process.env.SELFCHECK_VARIANTS}` : 'observations-fix1'}.json`, JSON.stringify(observations, null, 2));
}
