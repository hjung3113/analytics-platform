import { expect, test as base, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { requireSafeRealDatabaseEnv } from './database-safety';

export { expect };

/** Drop every inherited libpq `PG*` variable; an empty PGSERVICE is a service lookup, so unset is the only neutral value. */
function inheritedWithoutLibpq(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('PG')));
}

export const test = base.extend<{ realDatabaseIsolation: void }>({
  realDatabaseIsolation: [async ({ page }, use) => {
    const database = requireSafeRealDatabaseEnv();
    const result = spawnSync('psql', [
      '-X', '-h', database.migrate.host, '-p', String(database.migrate.port),
      '-U', database.migrate.username, '-d', database.migrate.database,
      '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM core.rate_limits',
    ], {
      encoding: 'utf8',
      env: {
        ...inheritedWithoutLibpq(process.env),
        PGHOSTADDR: '127.0.0.1',
        PGPASSWORD: database.migrate.password,
        PGSERVICEFILE: '/dev/null',
      },
    });
    if (result.error || result.status !== 0) {
      const detail = result.stderr.trim().slice(0, 500);
      throw new Error(`Could not reset rate limits in ${database.database}; psql exit ${result.status ?? 'unknown'}${detail ? `: ${detail}` : ''}.`);
    }

    const rateLimited: string[] = [];
    page.on('response', response => {
      if (response.status() !== 429) return;
      const url = new URL(response.url());
      rateLimited.push(`${response.request().method()} ${url.pathname}`);
    });
    await use();
    expect(rateLimited, `Unexpected HTTP 429 responses: ${rateLimited.join(', ') || 'none'}`).toEqual([]);
  }, { auto: true }],
});

export const mainHeading = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 });

/** Match a real FeedbackOps read before navigation so shell rendering cannot satisfy the wait. */
export function waitForFoRead(
  page: Page,
  path: string,
  search: Readonly<Record<string, string | undefined>> = {},
): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    if (url.pathname !== `/api/fo${path}` || response.request().method() !== 'GET') return false;
    return Object.entries(search).every(([key, value]) =>
      value === undefined ? !url.searchParams.has(key) : url.searchParams.get(key) === value,
    );
  });
}

export async function expectSuccessfulFoReads(reads: readonly Promise<Response>[]): Promise<void> {
  const responses = await Promise.all(reads);
  for (const response of responses) {
    expect(
      response.status(),
      `Expected a successful FeedbackOps read: ${response.request().method()} ${new URL(response.url()).pathname}`,
    ).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
  }
}

/** Live DOM can show several valid markers at once (many rows, or a zero strip plus its caption): require at least one. */
export async function expectLoadedOrEmpty(loaded: Locator, empty: Locator): Promise<void> {
  await expect(loaded.or(empty).first()).toBeVisible();
}

/** Match the real audit search POST before navigation; the adapter sends the query as the JSON body. */
export function waitForAuditSearch(page: Page, match: string | { actor?: string; type?: string; targetId?: string }): Promise<Response> {
  const expected = typeof match === 'string' ? { actor: match } : match;
  return page.waitForResponse((response) => {
    const request = response.request();
    if (new URL(response.url()).pathname !== '/api/v1/platform/audit-trail/search' || request.method() !== 'POST') return false;
    const body = request.postDataJSON() as Record<string, unknown> | null;
    return Object.entries(expected).every(([key, value]) => body?.[key] === value);
  });
}

export async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(`evidence:${name}`, { body: await page.screenshot(), contentType: 'image/png' });
}

/** Read the persisted server usage count directly; the rendered table does not refetch after mount. */
export async function usageVisits(page: Page, rowId: string): Promise<number> {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/platform/usage-summary?preset=all', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  });
  expect(result.status, 'usage-summary must return HTTP 200').toBe(200);

  type UsageEnvelope = {
    outcome?: unknown;
    data?: { menus?: Array<{ menuId?: unknown; visits?: unknown }> } | null;
  };
  const envelope = result.body as UsageEnvelope | null;
  expect(envelope?.outcome, 'usage-summary must return a successful envelope').toBe('ok');
  expect(envelope?.data, 'usage-summary must include data').not.toBeNull();
  const menus = envelope?.data?.menus;
  expect(Array.isArray(menus), 'usage-summary must include its menu rows').toBe(true);
  const row = menus?.find((menu) => menu.menuId === rowId);
  if (row === undefined) return 0;
  expect(typeof row.visits, `usage-summary visits for ${rowId} must be numeric`).toBe('number');
  return row.visits as number;
}
