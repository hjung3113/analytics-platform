import { expect, test, type Page } from '@playwright/test';
import { contextBar, evidence, signInAs } from './support';

const BASE = '/analytics-platform/demo';
const DETAIL = `${BASE}/bravo/metric-detail/cycle_time?v=1&version=3`;

async function headerMore(page: Page) {
  const header = page.getByRole('main').locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  await header.getByRole('button', { name: '더보기', exact: true }).click();
  const menu = page.getByRole('group', { name: '기타 페이지 동작' });
  await expect(menu).toBeVisible();
  return menu;
}

test.describe('하위 경로 배포 (06 §6.4)', () => {
  test('직접 딥링크·메뉴 이동·Back/Forward·href·링크 복사는 배포 base를 유지한다', async ({ page }, testInfo) => {
    await signInAs(page, 'engineer');
    await page.goto(DETAIL);
    const versionCopy = (await headerMore(page)).getByRole('button', { name: '버전 링크 복사', exact: true });
    await expect(versionCopy).toBeVisible();
    await versionCopy.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    const catalog = (await headerMore(page)).getByRole('link', { name: '카탈로그', exact: true });
    await expect(catalog).toHaveAttribute('href', `${BASE}/bravo/metric-catalog?v=1`);
    await catalog.click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/bravo/metric-catalog\\?v=1$`));
    await contextBar(page).getByRole('button', { name: '링크 복사', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${BASE}/bravo/metric-detail/cycle_time\\?v=1&version=3$`));
    await expect((await headerMore(page)).getByRole('button', { name: '버전 링크 복사', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${BASE}/bravo/metric-catalog\\?v=1$`));
    await expect(page.getByRole('table', { name: '지표 카탈로그', exact: true })).toBeVisible();
    await evidence(page, testInfo, 'base-path-navigation');
  });
});

test('차트 카탈로그의 /demo/ 직접 kind 링크와 새로고침 (06 §16, #530)', async ({ page }, testInfo) => {
  await signInAs(page, 'engineer');
  await page.goto(`${BASE}/mars/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=pareto`);
  await expect(page.getByRole('heading', { name: '차트 카탈로그', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^파레토 / })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: '차트 작업 영역', exact: true }).getByRole('img')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /^파레토 / })).toHaveAttribute('aria-selected', 'true');
  expect(new URL(page.url()).pathname).toBe(`${BASE}/mars/chart-catalog`);
  await evidence(page, testInfo, 'base-path-chart-catalog');
});

// ci probe: base-path spec only
