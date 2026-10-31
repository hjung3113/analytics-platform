// Throwaway capture script for #1189 prototype (not a test). Usage: node w1189-capture.mjs now A B C
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5191';
const out = new URL('../../.review/captures/1189/', import.meta.url).pathname;
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['now', 'A', 'B', 'C'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
async function load(path, v) {
  const url = base + path + (v === 'now' ? '' : `?variant=${v}`);
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('platform:role', JSON.stringify('admin')); });
  await page.reload();
  await page.waitForSelector('#platform-main');
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], [data-skeleton], .animate-pulse'), null, { timeout: 15000 }).catch(() => console.warn('busy still present', path, v));
  await page.waitForTimeout(600);
}
async function go(path, v) {
  await page.goto(base + path + (v === 'now' ? '' : `?variant=${v}`));
  await page.waitForSelector('#platform-main');
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], [data-skeleton], .animate-pulse'), null, { timeout: 15000 }).catch(() => console.warn('busy still present', path, v));
  await page.waitForTimeout(1200);
}
for (const v of variants) {
  // Seed a realistic state: two systems visited (resume + recent), then home.
  await load('/mars/productivity-overview', v);
  await go('/clas/operation-time', v);
  await go('/home', v);
  await page.mouse.move(1400, 880);
  await page.screenshot({ path: `${out}home-${v}.png` });
  await go('/mars/productivity-overview', v);
  await page.mouse.move(1400, 880);
  await page.screenshot({ path: `${out}switcher-trigger-${v}.png`, clip: { x: 0, y: 0, width: 320, height: 200 } });
  const proto = page.locator('[data-proto-switcher-trigger]');
  const trigger = (await proto.count()) > 0 ? proto.first() : page.locator('nav[aria-label="시스템 레일"] button[aria-haspopup="dialog"]').first();
  await trigger.click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}switcher-${v}.png` });
  console.log('captured', v);
}
await browser.close();
