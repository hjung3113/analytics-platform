import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

let server: ChildProcess | undefined;
let origin: string;
const context = (page: Page) => page.getByTestId('round-trip-context').textContent().then((value) => JSON.parse(value!));

// Keep d2's kit and entry untouched. This independent fixture uses the installed kit's tarballs/toolchain.
test.beforeAll(async () => {
  const kit = process.env.AP_SDK_KIT_DIR;
  if (!kit) throw new Error('AP_SDK_KIT_DIR is required');
  const root = resolve(kit, 'round-trip');
  cpSync(resolve(import.meta.dirname, '../../../tooling/sdk/fixtures/out-of-repo-assembly/round-trip'), root, { recursive: true });
  const port = await new Promise<number>((done, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      if (!address || typeof address === 'string') throw new Error('No fixture port');
      socket.close((error) => error ? reject(error) : done(address.port));
    });
  });
  origin = `http://127.0.0.1:${port}`;
  server = spawn(resolve(kit, 'node_modules/.bin/vite'), [root, '--config', resolve(root, 'vite.config.ts'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: kit, stdio: 'pipe' });
  let output = '';
  server.stdout?.on('data', (chunk) => { output += chunk; });
  server.stderr?.on('data', (chunk) => { output += chunk; });
  await expect.poll(async () => {
    if (server?.exitCode !== null) throw new Error(`Fixture server exited: ${output}`);
    try { return (await fetch(origin)).status; } catch { return 0; }
  }, { timeout: 60_000 }).toBe(200);
});
test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((done) => server!.once('exit', () => done()));
    server.kill('SIGTERM');
    await exited;
  }
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('platform:role', JSON.stringify('engineer')));
  await page.goto(`${origin}/inhouse`);
  await expect(page.getByRole('cell', { name: 'all-A', exact: true })).toBeVisible();
});

test.describe('§10.4 kit round trip — mock 통과', () => {
  test('injected other axis and own page filter survive URL reload', async ({ page }) => {
    await page.getByLabel('Axis group').selectOption('team');
    await page.getByLabel('Row filter').selectOption('new');
    await expect(page).toHaveURL(/rtFilter=new/);
    await page.reload();
    await expect(page.getByLabel('Axis group')).toHaveValue('team');
    await expect(page.getByLabel('Row filter')).toHaveValue('new');
    await expect(page.getByRole('cell', { name: 'team-A', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'new-A', exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'team-A', exact: true }) })).toContainText('4');
  });

  test('one mock endpoint supplies Trust and MeasureMeta to the table', async ({ page }) => {
    const response = page.waitForResponse((reply) => reply.url().endsWith('/api/round-trip') && reply.status() === 200);
    await page.getByLabel('Row filter').selectOption('new');
    const envelope = await (await response).json();
    expect(envelope.trust.source).toBe('kit-round-trip');
    expect(envelope.data.measure).toEqual({ unit: 'count', reaggregation: 'sum', metricVersion: 'kit-v1' });
    await expect(page.getByRole('cell', { name: 'kit-round-trip', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'count / sum / kit-v1', exact: true })).toBeVisible();
  });

  test('GlobalContext stays deep-equal through filter, save, reload and restore', async ({ page }) => {
    const before = await context(page);
    await page.getByLabel('Axis group').selectOption('team');
    await page.getByLabel('Row filter').selectOption('new');
    await page.getByRole('button', { name: 'Save menu view', exact: true }).click();
    await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Saved');
    await page.reload();
    await page.getByLabel('Axis group').selectOption('chamberType');
    await page.getByLabel('Row filter').selectOption('all');
    await page.getByRole('button', { name: 'Restore menu view', exact: true }).click();
    await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Restored');
    expect(await context(page)).toEqual(before);
  });

  test('real moved store reloads a persisted menu view and restores its page keys', async ({ page }, testInfo) => {
    await page.getByLabel('Axis group').selectOption('team');
    await page.getByLabel('Row filter').selectOption('new');
    await page.getByRole('button', { name: 'Save menu view', exact: true }).click();
    await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Saved');
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('platform:saved-views:v1:')));
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0][1]).views).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'menu-view', page: expect.arrayContaining([['rtFilter', 'new'], ['rtAxis', 'team']]) })]));
    // Clear URL state before the reload: restoration must read storage, not the old URL or an in-memory view.
    await page.goto(`${origin}/inhouse?rtFilter=all&rtAxis=kit%3Azone`);
    await page.reload();
    await expect(page.getByLabel('Axis group')).toHaveValue('chamberType');
    await page.getByRole('button', { name: 'Restore menu view', exact: true }).click();
    await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Restored');
    await expect(page.getByLabel('Axis group')).toHaveValue('team');
    await expect(page.getByLabel('Row filter')).toHaveValue('new');
    await expect(page).toHaveURL(/rtFilter=new/);
    await expect(page.getByRole('cell', { name: 'new-A', exact: true })).toBeVisible();
    await testInfo.attach('restored menu view — mock 통과', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('late first response cannot replace newer rendered rows', async ({ page }) => {
    let release!: () => void;
    let intercepted!: () => void;
    const held = new Promise<void>((done) => { release = done; });
    const first = new Promise<void>((done) => { intercepted = done; });
    await page.route('**/api/round-trip', async (route) => {
      if (route.request().postDataJSON().params.filter !== 'old') return route.continue();
      const response = await route.fetch();
      intercepted();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page.getByLabel('Row filter').selectOption('old');
      await first;
      await page.getByLabel('Row filter').selectOption('new');
      await expect(page.getByRole('cell', { name: 'new-A', exact: true })).toBeVisible();
      const delivered = page.waitForResponse((response) => response.request().postDataJSON()?.params?.filter === 'old');
      release();
      expect((await (await delivered).json()).data.rows[0].name).toBe('old-A');
      // The fixture records completion after the uncancelled transport resolves; then let React paint.
      await expect(page.getByTestId('completed-requests')).toContainText('old');
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      await expect(page.getByRole('cell', { name: 'new-A', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'old-A', exact: true })).toHaveCount(0);
    } finally { release(); }
  });
});
