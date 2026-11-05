import { expect, test, type Page } from '@playwright/test';
import { PRODUCTIVITY } from './contract-helpers';
import { mainHeading, setScenario, signInAs } from './support';

/**
 * #1365 — a tab, card, version or revision switch redraws only what changes and keeps the previous result until the new one arrives
 * (query lifecycle 06 §19 `keepPrevious`, ADR-0114). Black-box node-identity check: tag every element under `<main>` and the regions we
 * compare, act under the slow scenario (+2.2 s, so the window is long), and count how many tagged elements are still the same objects and
 * whether a loading skeleton (`LoadingBlock` = `role=status` + `aria-busy`) appeared. Reusable for any screen: `tagNodes` → act → `survivors`.
 *
 * Thresholds: the changing section keeps ≥ 0.85 of its elements (its series-bound parts follow the new data); an untouched section keeps
 * ≥ 0.95. The probe on the mock app measured 1.0 for the untouched sections of the Productivity overview except 0.986–0.989 on some runs;
 * the cause of that small turnover was not isolated, so the untouched threshold is set from that measurement, not from a proof.
 */
type Region = { name: string; selector: string };

async function tagNodes(page: Page, regions: Region[]) {
  await page.evaluate((list) => {
    const w = window as unknown as { __skeletons: number; __regions: Record<string, Element[]> };
    w.__skeletons = 0;
    w.__regions = {};
    for (const r of list) {
      const root = document.querySelector(r.selector);
      w.__regions[r.name] = root ? Array.from(root.querySelectorAll('*')) : [];
    }
    const scan = () => { if (document.querySelector('main [role="status"][aria-busy]')) w.__skeletons += 1; };
    new MutationObserver(scan).observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true });
  }, regions);
}
/** Share of the elements that sat inside the region when tagged and are still attached. New elements do not count against it. */
async function survivors(page: Page, name: string) {
  return page.evaluate((key) => {
    const before = (window as unknown as { __regions: Record<string, Element[]> }).__regions[key] ?? [];
    const kept = before.filter(el => el.isConnected).length;
    return { total: before.length, kept, share: before.length === 0 ? 0 : kept / before.length };
  }, name);
}
const skeletonsSeen = (page: Page) => page.evaluate(() => (window as unknown as { __skeletons: number }).__skeletons);
const noBusy = (page: Page) => expect(page.locator('main [role="status"][aria-busy], main [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });

/** Loads the page, switches to the slow scenario (a scenario change reloads the page once under it: wait it out) and tags the regions. */
async function openSlow(page: Page, url: string, ready: () => Promise<void>, regions: Region[]) {
  await signInAs(page, 'engineer');
  await page.goto(url);
  await ready();
  await noBusy(page);
  await setScenario(page, '느린 응답 (+2.2s)');
  await ready();
  await noBusy(page);
  await tagNodes(page, regions);
}

test.describe('탭·카드·버전 전환은 바뀐 부분만 다시 그린다 (06 §19 keepPrevious, #1365)', () => {
  test.describe('생산성 개요', () => {
    const regions: Region[] = [
      { name: '주요 추세', selector: 'main section[aria-label="주요 추세"]' },
      { name: '점유 구성', selector: 'main section[aria-label="점유 구성"]' },
      { name: '확인할 항목', selector: 'main section[aria-label="확인할 항목"]' },
      { name: '머리', selector: 'main header' },
    ];
    test.beforeEach(async ({ page }) => {
      await openSlow(page, PRODUCTIVITY, async () => {
        await expect(mainHeading(page)).toHaveText('생산성 개요');
        await expect(page.getByRole('region', { name: '주요 추세' }).getByRole('img').first()).toBeVisible({ timeout: 15_000 });
      }, regions);
    });

    test('위쪽 카드를 누르면 주요 추세만 새로 읽고, 이전 차트는 새 결과가 올 때까지 남는다', async ({ page }) => {
      await page.getByRole('button', { name: /비Process 체류/ }).first().click();
      await expect(page).toHaveURL(/kpi=dwell/);
      await page.waitForTimeout(600); // mid-request: the slow scenario holds the reply for 2.2 s
      expect(await skeletonsSeen(page)).toBe(0);
      expect((await survivors(page, '주요 추세')).share, 'trend frame kept while it reloads').toBeGreaterThanOrEqual(0.85);
      for (const name of ['점유 구성', '확인할 항목', '머리']) {
        const r = await survivors(page, name);
        expect(r.total, `${name} rendered`).toBeGreaterThan(0);
        expect(r.share, `${name} elements kept while the trend reloads`).toBeGreaterThanOrEqual(0.95);
      }
      await noBusy(page);
      expect(await skeletonsSeen(page)).toBe(0);
      expect((await survivors(page, '주요 추세')).share).toBeGreaterThanOrEqual(0.85);
    });

    test('점유 구성의 그룹 기준 탭을 바꾸면 그 섹션만 새로 읽고 나머지는 다시 그리지 않는다', async ({ page }) => {
      await page.getByRole('radio', { name: 'StGroup' }).click();
      await expect(page).toHaveURL(/axis=stgroup/);
      await page.waitForTimeout(600);
      expect(await skeletonsSeen(page)).toBe(0);
      expect((await survivors(page, '점유 구성')).share, 'breakdown frame kept while it reloads').toBeGreaterThanOrEqual(0.85);
      for (const name of ['주요 추세', '확인할 항목', '머리']) {
        expect((await survivors(page, name)).share, `${name} elements kept`).toBeGreaterThanOrEqual(0.95);
      }
      await noBusy(page);
      expect(await skeletonsSeen(page)).toBe(0);
    });
  });

  test('지표 상세: 버전 버튼을 누르면 화면 틀과 이전 정의가 남고 로딩 뼈대가 뜨지 않는다', async ({ page }) => {
    const regions: Region[] = [
      { name: '버전', selector: 'main :has(> #metric-section-version)' },
      { name: '정의', selector: 'main :has(> #metric-section-definition)' },
      { name: '머리', selector: 'main header' },
    ];
    await openSlow(page, '/bravo/metric-detail/cycle_time?v=1&version=4', async () => {
      await expect(page.getByRole('button', { name: /^v3/ })).toBeVisible({ timeout: 15_000 });
    }, regions);
    await page.getByRole('button', { name: /^v3/ }).click();
    await expect(page).toHaveURL(/version=3/);
    await page.waitForTimeout(600);
    expect(await skeletonsSeen(page)).toBe(0);
    // The chosen version is marked at once, before the reply for it arrives.
    await expect(page.getByRole('button', { name: /^v3/ })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['버전', '정의', '머리']) {
      const r = await survivors(page, name);
      expect(r.total, `${name} rendered`).toBeGreaterThan(0);
      expect(r.share, `${name} elements kept`).toBeGreaterThanOrEqual(0.85);
    }
    await noBusy(page);
    expect(await skeletonsSeen(page)).toBe(0);
  });

  test('로그 지식: Item 상세에서 리비전을 고르면 이전 리비전이 남고 로딩 뼈대가 뜨지 않는다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await page.goto('/log/knowledge/items?v=1');
    await page.getByRole('link', { name: 'KI-1' }).first().click();
    const ready = async () => { await expect(page.getByRole('region', { name: '리비전' })).toBeVisible({ timeout: 15_000 }); };
    await ready();
    await noBusy(page);
    await setScenario(page, '느린 응답 (+2.2s)');
    await ready();
    await noBusy(page);
    await tagNodes(page, [{ name: '리비전', selector: 'main [aria-label="리비전"]' }, { name: '머리', selector: 'main header' }]);
    await page.getByRole('region', { name: '리비전' }).getByRole('button', { name: /r2/ }).click();
    await expect(page).toHaveURL(/rev=2/);
    await page.waitForTimeout(600);
    expect(await skeletonsSeen(page)).toBe(0);
    for (const name of ['리비전', '머리']) {
      const r = await survivors(page, name);
      expect(r.total, `${name} rendered`).toBeGreaterThan(0);
      expect(r.share, `${name} elements kept`).toBeGreaterThanOrEqual(0.85);
    }
    await expect(page.getByText(/이전 리비전 r2을 보고 있습니다/)).toBeVisible({ timeout: 15_000 });
    expect(await skeletonsSeen(page)).toBe(0);
  });
});
