import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { requireSafeRealDatabaseEnv } from './database-safety';
import { expect, mainHeading, test } from './support';

type Snapshot = { values: Record<string, unknown>; importedAt: string | null };
const userState = resolve(import.meta.dirname, '../test-results-real/auth/user.json');

/** The public HTTP port only (ADR-0098): what the person's account holds on the server. */
async function serverPreferences(page: Page): Promise<Snapshot> {
  const response = await page.request.get('/api/v1/platform/preferences');
  expect(response.status()).toBe(200);
  const body = await response.json() as { outcome: string; data: Snapshot };
  expect(body.outcome).toBe('ok');
  return body.data;
}

async function accountId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/platform/bootstrap');
  expect(response.status()).toBe(200);
  const body = await response.json() as { session: { user: { id: string } } };
  expect(body.session.user.id).toBeTruthy();
  return body.session.user.id;
}

const tableKey = (raw: string) => `columns:h1_${createHash('sha256').update(raw, 'utf8').digest('hex')}`;

// Isolate only these accounts' preferences so prior real-suite mounts do not acknowledge this import.
function clearPreferences(adminId: string, userId: string): void {
  const database = requireSafeRealDatabaseEnv();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![adminId, userId, database.workspaceId].every(id => uuid.test(id))) {
    throw new Error('Preference cleanup requires UUID account and workspace IDs.');
  }
  const result = spawnSync('psql', [
    '-X', '-h', database.migrate.host, '-p', String(database.migrate.port),
    '-U', database.migrate.username, '-d', database.migrate.database,
    '-v', 'ON_ERROR_STOP=1', '-c',
    `DELETE FROM platform.preferences WHERE workspace_id = '${database.workspaceId}' AND actor_id IN ('${adminId}', '${userId}')`,
  ], {
    encoding: 'utf8',
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
      PGHOSTADDR: '127.0.0.1',
      PGPASSWORD: database.migrate.password,
      PGSERVICEFILE: '/dev/null',
    },
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim().slice(0, 500) || result.error?.message;
    throw new Error(`Could not clear preferences in ${database.database}; psql exit ${result.status ?? 'unknown'}${detail ? `: ${detail}` : ''}.`);
  }
}

test.describe('사용자 설정 서버 영속화 (#1104)', () => {
  test('첫 가져오기, 새로고침, 계정 분리와 재가져오기 방지', async ({ page, browser, baseURL }) => {
    const other = await browser.newContext({ storageState: userState, baseURL });
    let accountIds: [string, string] | undefined;
    try {
      const otherPage = await other.newPage();
      const adminId = await accountId(page);
      const userId = await accountId(otherPage);
      expect(userId).not.toBe(adminId);
      accountIds = [adminId, userId];
      clearPreferences(...accountIds);
      expect((await serverPreferences(page)).importedAt).toBeNull();

      const table = { sizing: { name: 200 }, visibility: {}, pinning: { left: [], right: [] } };
      const rawTable = JSON.stringify(table);
      const rawKey = 'platform:table:e2e-seeded';
      const ambiguousKey = 'equipment-master:columns:v1';
      const otherFavoritesKey = `platform:favorites:${userId}`;
      const otherFavorites = JSON.stringify(['must-not-move']);
      await page.addInitScript(({ rawKey, ambiguousKey, rawTable, otherFavoritesKey, otherFavorites }) => {
        if (localStorage.getItem('platform:seeded-1104')) return;
        localStorage.setItem('platform:seeded-1104', '1');
        localStorage.setItem(rawKey, rawTable);
        localStorage.setItem(ambiguousKey, rawTable);
        localStorage.setItem('platform:lang', 'en');
        localStorage.setItem(otherFavoritesKey, otherFavorites);
      }, { rawKey, ambiguousKey, rawTable, otherFavoritesKey, otherFavorites });
      await page.goto('/home');
      await expect(mainHeading(page)).toBeVisible();
      await expect.poll(async () => (await serverPreferences(page)).importedAt).not.toBeNull();
      const imported = await serverPreferences(page);
      expect(imported.values[tableKey(rawKey)]).toEqual(table);
      expect(imported.values[tableKey(ambiguousKey)]).toBeUndefined();
      expect(imported.values.lang).toBe('en');
      expect(imported.values.favorites).toBeUndefined();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [rawKey, ambiguousKey, 'platform:lang', otherFavoritesKey]))
        .toEqual([rawTable, rawTable, 'en', otherFavorites]);

      // An actual UI write establishes an admin value distinct from the other account.
      await page.getByRole('button', { name: 'User menu' }).click();
      await page.getByRole('menuitem', { name: /^Language/ }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await expect.poll(async () => (await serverPreferences(page)).values.lang).toBe('ko');

      await otherPage.goto('/home');
      await expect(mainHeading(otherPage)).toBeVisible();
      await expect.poll(async () => (await serverPreferences(otherPage)).importedAt).not.toBeNull();
      const otherLang = (await serverPreferences(otherPage)).values.lang;
      if (otherLang !== 'en') {
        await expect(otherPage.locator('html')).toHaveAttribute('lang', 'ko');
        await otherPage.getByRole('button', { name: '사용자 메뉴' }).click();
        await otherPage.getByRole('menuitem', { name: /^언어/ }).click();
      }
      await expect.poll(async () => (await serverPreferences(otherPage)).values.lang).toBe('en');
      await expect.poll(async () => (await serverPreferences(page)).values.lang).toBe('ko');
      await otherPage.reload();
      await expect(otherPage.locator('html')).toHaveAttribute('lang', 'en');
      await expect(otherPage.getByRole('button', { name: 'User menu' })).toBeVisible();
      expect((await serverPreferences(otherPage)).values.lang).toBe('en');

      // The changed record is deliberately retained, but the acknowledged server value must not change.
      const changedTable = JSON.stringify({ ...table, sizing: { name: 350 } });
      await page.evaluate(({ rawKey, changedTable }) => localStorage.setItem(rawKey, changedTable), { rawKey, changedTable });
      await page.reload();
      await expect(mainHeading(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await expect(page.getByRole('button', { name: '사용자 메뉴' })).toBeVisible();
      const reloaded = await serverPreferences(page);
      expect(reloaded.importedAt).toBe(imported.importedAt);
      expect(reloaded.values[tableKey(rawKey)]).toEqual(table);
      expect(reloaded.values.lang).toBe('ko');
      expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [rawKey, ambiguousKey, 'platform:lang', otherFavoritesKey]))
        .toEqual([changedTable, rawTable, 'en', otherFavorites]);
      expect((await serverPreferences(otherPage)).values.lang).toBe('en');
    } finally {
      await Promise.all([page.context().close(), other.close()]);
      if (accountIds) clearPreferences(...accountIds);
    }
  });
});
