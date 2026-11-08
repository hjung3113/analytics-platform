import type { Response } from '@playwright/test';
import { evidence, expect, expectLoadedOrEmpty, expectSuccessfulFoReads, mainHeading, test, waitForFoRead } from './support';

import { withTokenEvidenceSafety } from './token-evidence-safety';

// Playwright 1.63 checks this independently of trace/video/screenshot when writing error-context.md.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

// A one-time credential must not be persisted in Playwright traces or automatic failure screenshots.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test.describe('API 토큰 개인 발급·일회 표시·폐기 (ADR-0116 §7, #1443)', () => {
  const createdTokenIds = new Set<string>();
  const captures: Promise<void>[] = [];
  let captureFailed = false;
  const captureIssuedToken = (response: Response) => {
    if (new URL(response.url()).pathname !== '/api/features/api-tokens' || response.request().method() !== 'POST' || !response.ok()) return;
    captures.push(response.json().then((body: { item: { id: string } }) => {
      createdTokenIds.add(body.item.id);
    }).catch(() => { captureFailed = true; }));
  };
  test.beforeEach(async ({ page }) => {
    createdTokenIds.clear(); captures.length = 0; captureFailed = false;
    // Register before issuance: a test timeout can interrupt the click or its following wait.
    page.on('response', captureIssuedToken);
  });
  test.afterEach(async ({ context, page }, testInfo) => {
    // Hook budget is independent of an exhausted test timeout. Context requests still work after page.close().
    testInfo.setTimeout(30_000);
    await withTokenEvidenceSafety(async () => {
      await Promise.all(captures);
      if (captureFailed) throw new Error('Token metadata capture failed');
    }, async () => {
      if (createdTokenIds.size === 0) return;
      const bootstrap = await context.request.get('/api/v1/platform/bootstrap', { timeout: 5_000 });
      if (!bootstrap.ok()) throw new Error('Token cleanup bootstrap failed');
      const { csrfToken } = await bootstrap.json() as { csrfToken: string };
      let failed = false;
      for (const id of createdTokenIds) {
        try {
          const response = await context.request.post(`/api/features/api-tokens/${encodeURIComponent(id)}/revoke`, {
            headers: { 'x-csrf-token': csrfToken }, timeout: 5_000,
          });
          if (!response.ok()) failed = true;
        } catch { failed = true; }
      }
      if (failed) throw new Error('Token cleanup failed');
    }, () => context.close());
    page.off('response', captureIssuedToken);
  });
  test('목록 문맥에서 발급하고 값을 닫은 뒤 폐기한다', async ({ page }, testInfo) => {
    await withTokenEvidenceSafety(async () => {
    const list = waitForFoRead(page, '/api-tokens', { limit: '25' });
    await page.goto('/tokens');
    await expectSuccessfulFoReads([list]);
    await expect(mainHeading(page)).toHaveText('API 토큰');
    await expectLoadedOrEmpty(page.getByRole('table', { name: '토큰 목록' }), page.getByText('아직 발급한 토큰이 없습니다'));
    const name = `E2E token ${testInfo.testId}-${Date.now()}`; // unique per run: revoked rows of earlier runs stay in the list
    await page.getByRole('button', { name: '토큰 발급', exact: true }).click();
    const detail = page.getByRole('complementary', { name: '상세 패널' });
    await detail.getByLabel('토큰 이름').fill(name);
    const issued = page.waitForResponse(response => new URL(response.url()).pathname === '/api/features/api-tokens' && response.request().method() === 'POST');
    await detail.getByRole('button', { name: '토큰 발급', exact: true }).click();
    createdTokenIds.add(await (await issued).json().then((body: { item: { id: string } }) => body.item.id));
    // Secret window: no Playwright locator touches the value input and no locator matcher runs, because a failing
    // matcher records an element preview (attributes, incl. `value`) or a body aria snapshot in the reporter's step log.
    // Every check is an in-page boolean; only actions on buttons and the checkbox use locators.
    const secretIsValid = await page.evaluate(() => {
      const el = document.getElementById('token-secret');
      return el instanceof HTMLInputElement && /^ap_[0-9a-f]{8}_[A-Za-z0-9_-]{43,}$/.test(el.value);
    });
    expect(secretIsValid).toBe(true);
    await detail.getByRole('checkbox', { name: '안전한 곳에 보관했습니다' }).check();
    const reissueBlocked = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter(b => b.textContent?.trim() === '토큰 발급' && !b.closest('aside'))
      .every(b => b.disabled));
    expect(reissueBlocked).toBe(true);
    await detail.getByRole('button', { name: '완료 · 토큰 값 닫기' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '계속 보기' }).click();
    const stillShown = await page.evaluate(() => {
      const el = document.getElementById('token-secret');
      return el instanceof HTMLInputElement && el.checkVisibility();
    });
    expect(stillShown).toBe(true);
    await detail.getByRole('button', { name: '완료 · 토큰 값 닫기' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '토큰 값 닫기', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('token-secret') === null);
    // Window closed: the value is gone from the DOM, ordinary locator matchers are safe again.
    await expect(page.getByLabel('토큰 값 · 한 번만 표시')).toHaveCount(0);
    const row = page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
    await row.getByRole('button', { name: `${name} 폐기`, exact: true }).click();
    const refreshed = waitForFoRead(page, '/api-tokens', { limit: '25' });
    await page.getByRole('alertdialog').getByRole('button', { name: '토큰 폐기', exact: true }).click();
    await expectSuccessfulFoReads([refreshed]);
    await expect(row).toContainText('폐기됨');
    await expect(row.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: '토큰 발급', exact: true }).click();
    await expect(detail.getByLabel('토큰 이름')).toHaveValue('');
    await expect(page.getByLabel('토큰 값 · 한 번만 표시')).toHaveCount(0);
    await detail.getByRole('button', { name: '취소', exact: true }).click();
    await evidence(page, testInfo, 'personal-token-revoked-no-secret');
    // Revocation belongs to afterEach, which still runs with a fresh budget after this test times out.
    }, async () => { await Promise.all(captures); }, () => page.close());
  });
});
