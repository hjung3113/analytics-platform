// One-off #1189q visual harness, adapted from w1189p; not an E2E spec.
const { writeFile } = await import('node:fs/promises');
const keepSpace = globalThis.w1189qKeepSpace === true;
const root = '/Users/hyojung/orca/workspaces/analytics-platform/1189q-home-unified-proto';
const out = `${root}/.review/selfcheck/`;
const task = await taskSpace('W-1189q self-check');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
const observations = [];
async function capture(path) {
  await page.evaluate(async () => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) await Promise.all(dialog.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  const shot = await page.cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path, Buffer.from(shot.data, 'base64'));
}
// Restore pre-existing state for this dedicated local origin at completion; no profile-wide clearing.
await page.goto('http://127.0.0.1:4198/home?v=1&scopeId=MEM');
const original = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
const batches = ['current', 'D', 'E', 'F', 'D-merged', 'E-merged', 'F-merged'];
try {
for (const batch of batches) {
  const variant = batch.split('-')[0];
  const suffix = variant === 'current' ? '' : `&variant=${variant}${batch.endsWith('-merged') ? '&merged=1' : ''}`;
  await page.evaluate(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('platform:role', JSON.stringify('admin'));
    localStorage.setItem('platform:lang', 'ko');
    localStorage.setItem('platform:sidebar-collapsed', '0');
  });
  async function load(path) {
    await page.goto(`http://127.0.0.1:4198${path}?v=1&scopeId=MEM${suffix}`);
    await page.waitForSelector('#platform-main h1', { state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => { const main = document.getElementById('platform-main'); if (main) main.scrollTop = 0; });
    await page.mouse.move(1438, 898);
  }
  await load('/home');
  if (batch === 'current') await writeFile(`${out}snapshot-current.txt`, await page.snapshot());
  await capture(`${out}home-empty-${batch}.png`);
  await load('/mars/productivity-overview');
  await page.click('loc=role:button[name="즐겨찾기에 추가"]');
  await load('/clas/operation-time');
  await load('/home');
  await capture(`${out}home-${batch}.png`);
  if (variant === 'D') {
    observations.push({ batch, kind: 'homeCollapse', state: await page.evaluate(() => ({ collapsed: document.querySelector('[data-proto-stage-sidebar]')?.getAttribute('data-collapsed'), saved: localStorage.getItem('platform:sidebar-collapsed') })) });
    await page.click('button[aria-label="사이드바 펼치기"]');
    observations.push({ batch, kind: 'homeDisplayToggle', saved: await page.evaluate(() => localStorage.getItem('platform:sidebar-collapsed')) });
    await page.keyboard.press('[');
  }
  observations.push({ batch, kind: 'home', geometry: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio, mainScroll: document.getElementById('platform-main')?.scrollWidth, headings: [...document.querySelectorAll('#platform-main h2')].map(el => el.textContent) })) });
  await load('/mars/productivity-overview');
  if (variant !== 'current') await writeFile(`${out}snapshot-${batch}.txt`, await page.snapshot());
  const trigger = variant === 'current' ? 'button[aria-label*="시스템 및 플랫폼 메뉴"]' : '[data-proto-nav-trigger]';
  await page.click(trigger);
  await page.waitForSelector('[role="dialog"]');
  await page.mouse.move(1438, 898);
  await capture(`${out}nav-${batch}.png`);
  observations.push({ batch, kind: 'open', focus: await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent, inside: !!document.activeElement?.closest('[role="dialog"]') })) });
  const focusWalk = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    focusWalk.push(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  }
  observations.push({ batch, kind: 'focusTrap', allInside: focusWalk.every(Boolean) });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), trigger, { timeout: 4000 });
  observations.push({ batch, kind: 'escape', returned: await page.evaluate(selector => document.activeElement === document.querySelector(selector), trigger) });
  if (batch === 'D') {
    await page.click('button[aria-label="분석 출처"]');
    await page.waitForSelector('[role="menuitemradio"]');
    await page.click('[role="menuitemradio"]:text-is("CLAS")');
    await page.waitForSelector('[role="menu"]', { state: 'hidden' });
    await page.waitForFunction(() => document.body.style.pointerEvents !== 'none' && document.activeElement === document.querySelector('button[aria-label="분석 출처"]'));
    observations.push({ batch, kind: 'sourceGap', disabled: await page.evaluate(() => document.querySelectorAll('[data-proto-stage-sidebar] [aria-disabled="true"]').length) });
    await page.click(trigger);
    await page.waitForSelector('[role="dialog"]');
    await page.mouse.move(1438, 898);
    await capture(`${out}nav-D-source-CLAS.png`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), trigger);
    await page.click('button[aria-label="분석 출처"]');
    await page.waitForSelector('[role="menuitemradio"]');
    await page.click('[role="menuitemradio"]:text-is("전체")');
    await page.waitForSelector('[role="menu"]', { state: 'hidden' });
    await page.waitForFunction(() => document.body.style.pointerEvents !== 'none' && document.activeElement === document.querySelector('button[aria-label="분석 출처"]'));
  }
  const hasSidebar = await page.evaluate(() => !!document.querySelector('aside[data-collapsed]'));
  if (hasSidebar) {
    await page.focus('button[aria-label="사이드바 접기"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('aside[data-collapsed="true"]');
    await page.click(trigger);
    await page.waitForSelector('[role="dialog"]');
    await page.mouse.move(1438, 898);
    await capture(`${out}collapsed-${batch}.png`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), trigger, { timeout: 4000 });
  } else observations.push({ batch, kind: 'collapsed', status: 'N/A: no sidebar' });
  // Exercise selection only after capturing the specified states.
  if (hasSidebar) { await page.focus('button[aria-label="사이드바 펼치기"]'); await page.keyboard.press('Enter'); await page.waitForSelector('aside[data-collapsed="false"]'); }
  await page.click(trigger);
  await page.waitForSelector('[role="dialog"]');
  if (variant === 'E' || variant === 'F') {
    await page.fill(variant === 'E' ? 'input[aria-label="메뉴판 검색"]' : 'input[aria-label="이동할 메뉴 검색"]', 'CLAS');
    observations.push({ batch, kind: 'oldNameAlias', matches: await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] a')].map(el => el.textContent)) });
    await page.click(variant === 'E' ? 'nav[aria-label="전체 메뉴"] a[href*="/clas/operation-time"]' : 'nav[aria-label="검색 결과"] a[href*="/clas/operation-time"]');
    await page.waitForURL('**/clas/operation-time?**');
  } else if (variant === 'D') {
    await page.click('[role="dialog"] a[href*="/log-dev/"]');
    await page.waitForURL('**/log-dev/**');
  } else {
    await page.click('[data-switcher-card]:has-text("BRAVO")');
    await page.waitForURL('**/bravo/**');
  }
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.tagName === 'H1', undefined, { timeout: 4000 });
  observations.push({ batch, kind: 'arrival', url: await page.url(), titleFocused: await page.evaluate(() => document.activeElement?.tagName === 'H1') });
  await load('/home');
  if (variant === 'E') {
    if (!batch.endsWith('-merged')) {
      await page.focus('[role="radio"]:text-is("시스템별")');
      await page.keyboard.press('ArrowRight');
      observations.push({ batch, kind: 'alternateGrouping', stages: await page.evaluate(() => [...document.querySelectorAll('#platform-main h2')].map(el => el.textContent)) });
    }
    await page.fill('#platform-main input[aria-label="메뉴판 검색"]', 'no-such-menu-1189');
    observations.push({ batch, kind: 'emptySearch', shown: await page.evaluate(() => document.getElementById('platform-main')?.textContent?.includes('검색 결과가 없습니다')) });
    await page.fill('#platform-main input[aria-label="메뉴판 검색"]', '');
  }
  await page.focus('loc=role:button[name="즐겨찾기에서 제거"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.tagName === 'P');
  observations.push({ batch, kind: 'favoriteRemoval', focus: await page.evaluate(() => document.activeElement?.textContent) });
  const noticeCount = await page.evaluate(() => document.querySelectorAll('button[aria-label="이번 방문 동안 닫기"]').length);
  if (noticeCount) {
    await page.click('button[aria-label="이번 방문 동안 닫기"]');
    observations.push({ batch, kind: 'noticeDismiss', before: noticeCount, after: await page.evaluate(() => document.querySelectorAll('button[aria-label="이번 방문 동안 닫기"]').length) });
  }
  console.log(`captured ${batch}`);
}
} finally {
await page.evaluate(state => {
  localStorage.clear(); sessionStorage.clear();
  for (const [key, value] of Object.entries(state.local)) localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(state.session)) sessionStorage.setItem(key, value);
}, original);
await writeFile(`${out}observations.json`, JSON.stringify(observations, null, 2));
}
if (!keepSpace) await task.finish({ keep: [] });
console.log({ spaceId: task.spaceId, done: true, kept: keepSpace });
