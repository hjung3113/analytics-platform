import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERIOD, PRODUCTIVITY, railSection, chooseSystem } from './contract-helpers';
import { evidence, mainHeading, query, signInAs, switchScope } from './support';

/**
 * Platform contract checks (#44). Each `describe` is one contract area of docs/06; each test is one reported check.
 * Menu screens are only the consumers the contract is observed through — assertions target kernel/shell behavior.
 */
const ORIGIN = 'https://feedbackops.example';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The three space entries: VOC (#760) and Task (#763) open in this tab inside the shell, only 설문 is a new-tab link. All three are scoped to exactly one Managed System uuid. */
async function managedSystemOf(page: Page, space: string) {
  const block = page.getByRole('navigation', { name: `FeedbackOps · ${space}` });
  await expect(block).toBeVisible();
  const links = block.getByRole('link');
  await expect(links).toHaveCount(3);
  const found = new Set<string>();
  const inShell = [['VOC', '/feedbackops/fo-inbox'], ['Task', '/feedbackops/fo-task-list']] as const;
  for (const [index, [name, pathname]] of inShell.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAccessibleName(`${name} — ${space}, FeedbackOps`);
    await expect(link).not.toHaveAttribute('target', /.+/);
    const url = new URL((await link.getAttribute('href'))!, page.url());
    expect(url.pathname).toBe(pathname);
    expect(url.searchParams.getAll('managedSystem')).toHaveLength(1);
    found.add(url.searchParams.get('managedSystem')!);
  }
  const survey = links.nth(2);
  await expect(survey).toHaveAttribute('target', '_blank');
  await expect(survey).toHaveAttribute('rel', /noopener/);
  await expect(survey).toHaveAttribute('rel', /noreferrer/);
  const url = new URL((await survey.getAttribute('href'))!);
  expect(url.origin).toBe(ORIGIN);
  const values = url.searchParams.getAll('managedSystem');
  expect(values).toHaveLength(1);
  expect(values[0]).toMatch(UUID);
  expect(values[0]).not.toBe('all');
  // FeedbackOps links back to the page the link was drawn on (FO ADR-0071, #448).
  expect(url.searchParams.getAll('platformReturn')).toEqual([page.url()]);
  found.add(values[0]);
  expect(found.size).toBe(1);
  expect([...found][0]).toMatch(UUID);
  expect([...found][0]).not.toBe('all');
  return [...found][0];
}

/** `FeedbackOps 전체` lives in the user menu (ADR-0070): opens `사용자 메뉴` and returns the menu item. */
async function feedbackOpsOverallLink(page: Page) {
  await page.getByRole('navigation', { name: '앱 레일' }).getByRole('button', { name: '사용자 메뉴' }).click();
  return page.getByRole('menuitem', { name: 'FeedbackOps 전체 — 새 탭' });
}

function expectExactQueryKeys(url: URL, keys: string[]) {
  expect([...url.searchParams.keys()].sort()).toEqual([...keys].sort());
}

async function linkUrl(link: Locator) {
  const href = await link.getAttribute('href');
  expect(href).not.toBeNull();
  return new URL(href!, 'http://platform.invalid');
}


test.describe('FeedbackOps 공간별 진입(#251)', () => {
  test('admin의 MARS·BRAVO 사이드바 블록은 그 공간의 managedSystem만 담은 링크 셋(VOC·Task 셸 안, 설문 새 탭)이고, 운영 콘솔에는 블록이 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analytics = await managedSystemOf(page, 'MARS');
    await page.goto('/bravo/metric-catalog');
    const metrics = await managedSystemOf(page, 'BRAVO');
    expect(metrics).not.toBe(analytics);
    await evidence(page, testInfo, 'feedbackops-space-links');
    await page.goto('/operations/admin-roles?v=1');
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
  });

  test('사용자 메뉴의 FeedbackOps 전체 링크는 admin에게 보이고 /home을 새 탭으로 연다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    await expect(page.getByRole('navigation', { name: '앱 레일' }).getByRole('link', { name: /FeedbackOps 전체/ })).toHaveCount(0);
    const overall = await feedbackOpsOverallLink(page);
    await expect(overall).toHaveAttribute('href', `${ORIGIN}/home`);
    await expect(overall).toHaveAttribute('target', '_blank');
    await expect(overall).toHaveAttribute('rel', /noopener/);
    await expect(overall).toHaveAttribute('rel', /noreferrer/);
    await evidence(page, testInfo, 'feedbackops-overall-admin');
  });

  for (const role of ['engineer', 'viewer'] as const) {
    test(`사용자 메뉴의 FeedbackOps 전체 링크는 ${role}에게 보이지 않는다`, async ({ page }) => {
      await signInAs(page, role);
      await page.goto('/bravo/metric-catalog');
      await expect(page.getByRole('navigation', { name: '앱 레일' })).toBeVisible();
      await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
      await page.keyboard.press('Escape');
    });
  }
});

test.describe('FeedbackOps 진입 링크 회귀(#451, 06 §22)', () => {
  test('Context 변경·화면 이동 뒤 platformReturn은 현재 URL을 가리킨다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analyticsSystem = await managedSystemOf(page, 'MARS');
    const initialUrl = page.url();

    await switchScope(page, 'FDRY');
    await expect.poll(() => query(page).get('scopeId')).toBe('FDRY');
    expect(page.url()).not.toBe(initialUrl);
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);

    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await nav.getByRole('link', { name: '사이클타임 상세' }).click();
    await expect(mainHeading(page)).toHaveText('사이클타임 상세');
    expect(new URL(page.url()).pathname).not.toBe('/mars/productivity-overview');
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);
    await evidence(page, testInfo, 'feedbackops-return-current-url');
  });

  test('새로고침·Back·Forward 뒤에도 공간 링크는 현재 URL과 managedSystem을 유지한다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    const analyticsSystem = await managedSystemOf(page, 'MARS');

    await page.goto('/bravo/metric-catalog');
    const metricsSystem = await managedSystemOf(page, 'BRAVO');
    await page.reload();
    expect(await managedSystemOf(page, 'BRAVO')).toBe(metricsSystem);

    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/productivity-overview');
    expect(await managedSystemOf(page, 'MARS')).toBe(analyticsSystem);

    await page.goForward();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/bravo/metric-catalog');
    expect(await managedSystemOf(page, 'BRAVO')).toBe(metricsSystem);
    await evidence(page, testInfo, 'feedbackops-return-history-forward');
  });

  test('지원하지 않는 전역 필터는 FeedbackOps 링크의 최상위 키에 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    const urls = [
      PRODUCTIVITY,
      `/mars/equipment-master?v=1&scopeId=MEM&${PERIOD}&selectedEquipmentIds=MEM-PHOTO-0103`,
    ];
    for (const url of urls) {
      await page.goto(url);
      if (url === PRODUCTIVITY) {
        expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
        expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
        expect(query(page).get('scopeId')).toBe('MEM');
        expect(query(page).get('roomNames')).toBe('PHOTO');
      } else {
        expect(query(page).get('selectedEquipmentIds')).toBe('MEM-PHOTO-0103');
      }
      await managedSystemOf(page, 'MARS');
      const links = await page.getByRole('navigation', { name: 'FeedbackOps · MARS' }).getByRole('link').all();
      const destinations: string[] = [];
      for (const link of links) {
        const href = await linkUrl(link);
        if (href.pathname === '/feedbackops/fo-inbox') {
          expectExactQueryKeys(href, ['v', 'managedSystem', 'returnTo']);
          destinations.push('vocs:inbox');
        } else if (href.pathname === '/feedbackops/fo-task-list') {
          expectExactQueryKeys(href, ['v', 'managedSystem', 'returnTo']);
          destinations.push('tasks');
        } else if (href.pathname === '/surveys') {
          expectExactQueryKeys(href, ['managedSystem', 'platformReturn']);
          destinations.push('surveys');
        } else {
          throw new Error(`Unexpected FeedbackOps destination: ${href.pathname}`);
        }
      }
      expect(destinations.sort()).toEqual(['surveys', 'tasks', 'vocs:inbox']);
    }

    await evidence(page, testInfo, 'feedbackops-query-keys');
  });

  test('거부·미등록 경로와 feedbackops:access 없는 viewer의 BRAVO에는 공간 블록이 없다', async ({ page }, testInfo) => {
    await signInAs(page, 'viewer');
    // Menu denial inside a mapped space draws no block.
    await page.goto(PRODUCTIVITY);
    await expect(page.getByRole('status').filter({ hasText: '이 메뉴에 대한 권한이 없습니다' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    // Space denial draws no block either.
    await page.goto('/operations/admin-roles?v=1');
    await expect(page.getByRole('status').filter({ hasText: '이 공간에 들어갈 수 없습니다' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    await page.goto('/nope-451');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);

    // Without feedbackops:access there is no block at all, even in a space the viewer may enter (ADR-0081 decision 8).
    await page.goto('/bravo/metric-catalog');
    await expect(mainHeading(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await evidence(page, testInfo, 'feedbackops-block-viewer');
  });

  // One test per role: each gets a fresh page, so exactly one `signInAs` init script writes the role.
  async function expectNoBlockOnGlobalScreens(page: Page) {
    for (const path of ['/', '/notices', '/voc']) {
      await page.goto(path);
      await expect(mainHeading(page)).toBeVisible();
      await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    }
  }

  test('공간 하나(viewer)는 전역 화면과 BRAVO 모두에 블록이 없고 전체 링크가 없다', async ({ page }) => {
    await signInAs(page, 'viewer');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto('/bravo/metric-catalog');
    await expect(mainHeading(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('공간 둘(engineer)은 전환기로 옮긴 어느 공간에도 블록이 없고 전체 링크가 없다', async ({ page }) => {
    await signInAs(page, 'engineer');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await chooseSystem(page, 'BRAVO');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/bravo/metric-catalog');
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await expect(await feedbackOpsOverallLink(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('공간 셋(admin)은 두 공간 블록, 운영 콘솔 블록 없음, 전체 링크 있음', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await expectNoBlockOnGlobalScreens(page);
    await page.goto(PRODUCTIVITY);
    const analytics = await managedSystemOf(page, 'MARS');
    await chooseSystem(page, 'BRAVO');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/bravo/metric-catalog');
    expect(await managedSystemOf(page, 'BRAVO')).not.toBe(analytics);
    await chooseSystem(page, '운영 콘솔');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/operations/admin-roles');
    await expect(page.getByRole('navigation', { name: /^FeedbackOps/ })).toHaveCount(0);
    await expect(await feedbackOpsOverallLink(page)).toBeVisible();
    await evidence(page, testInfo, 'feedbackops-space-count-admin');
  });
});

test.describe('FeedbackOps 바닥 블록 셸 안 이동(#760)', () => {
  const returnRow = (page: Page) => page.locator('[data-return-row]');

  test('VOC는 같은 탭에서 /feedbackops/fo-inbox로 열리고 되돌아가기 줄이 본문 맨 위에 서며, FO 안 이동에도 남고, 복귀하면 원래 기간·Scope로 돌아온다', async ({ page }, testInfo) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    await expect(mainHeading(page)).toHaveText('생산성 개요');
    const start = page.url();
    await page.getByRole('navigation', { name: 'FeedbackOps · MARS' }).getByRole('link', { name: /^VOC/ }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/feedbackops/fo-inbox');
    expect([...query(page).keys()].sort()).toEqual(['managedSystem', 'returnTo', 'v']);
    expect(query(page).get('managedSystem')).toMatch(UUID);
    expect(query(page).get('returnTo')).toBe(new URL(start).pathname + new URL(start).search);
    await expect(returnRow(page)).toBeVisible();
    await expect(returnRow(page).getByRole('link', { name: '← 생산성 개요로 돌아가기' })).toBeVisible();
    await expect(returnRow(page)).toContainText('MARS에서 왔습니다');
    await evidence(page, testInfo, 'feedbackops-return-row');

    // Moving inside FeedbackOps keeps the way back.
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: 'Triage' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/feedbackops/fo-triage');
    await expect(returnRow(page)).toBeVisible();
    expect(query(page).get('returnTo')).toBe(new URL(start).pathname + new URL(start).search);

    await returnRow(page).getByRole('link', { name: '← 생산성 개요로 돌아가기' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/mars/productivity-overview');
    expect(query(page).get('from')).toBe('2026-09-25T09:00:00');
    expect(query(page).get('to')).toBe('2026-09-26T09:00:00');
    expect(query(page).get('scopeId')).toBe('MEM');
    expect(query(page).has('returnTo')).toBe(false);
  });

  test('전환기로 FeedbackOps에 들어오면 줄이 없고, FO 안 이동으로도 만들어지지 않는다', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto(PRODUCTIVITY);
    await chooseSystem(page, 'FeedbackOps');
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/feedbackops/);
    await expect(mainHeading(page)).toBeVisible();
    await expect(returnRow(page)).toHaveCount(0);
    expect(query(page).has('returnTo')).toBe(false);
    // The landing is the dashboard; the VOC section brings Triage into the sidebar, then FO-internal moves must not create a row or a returnTo.
    await railSection(page, 'VOC').click();
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: 'Triage' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/feedbackops/fo-triage');
    await expect(returnRow(page)).toHaveCount(0);
    expect(query(page).has('returnTo')).toBe(false);
  });
});

