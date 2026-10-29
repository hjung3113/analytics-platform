import { resolve } from 'node:path';
import { expect, test } from './support';
import type { APIRequestContext, Browser } from '@playwright/test';

/**
 * Server persistence of saved views (ADR-0099, #1105). Real cookie session + CSRF, no SQL, no product-table seed.
 *
 * The real session holds no `analytics:view` and no Scope (`platform-port` `permissions.ts`, `buildSession` → `scopes: []`), so the only
 * saved-view menu (`cycle-time`, `requiresScope`) is route-denied for both harness actors and no saved-view UI can be opened. Every case
 * below therefore drives the same wire the UI uses (cookie + `X-CSRF-Token` from `/bootstrap`, strict version-1 command bodies) with two
 * real browser contexts: the `admin` (default storage state) and the `user` login. Actors are derived from `/bootstrap`, never hard-coded.
 */
const USER_STATE = resolve(import.meta.dirname, '../test-results-real/auth/user.json');
const COMMANDS = '/api/v1/platform/saved-views/commands';
const MENU = 'cycle-time';
const KEY = { menuId: MENU };

type Actor = { api: APIRequestContext; id: string; name: string; csrf: string };
type Entry = { ok: true; value: { view: { id: string; name: string; version: number; ownerId: string; visibility: { kind: string }; approval: string } } } | { ok: false; reason: string };

async function actorOf(api: APIRequestContext): Promise<Actor> {
  const response = await api.get('/api/v1/platform/bootstrap');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { csrfToken: string; session: { user: { id: string; name: string } } };
  return { api, id: body.session.user.id, name: body.session.user.name, csrf: body.csrfToken };
}

async function send<T>(actor: Actor, body: Record<string, unknown>): Promise<T> {
  const response = await actor.api.post(COMMANDS, { headers: { 'X-CSRF-Token': actor.csrf }, data: { version: 1, ...body } });
  expect(response.status(), `${String(body.op)} → HTTP`).toBe(200);
  return (await response.json()) as T;
}

const draft = (name: string) => ({ schemaVersion: 1, kind: 'menu-view', name, menuId: MENU, menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, panels: null });

async function saveView(owner: Actor, name: string) {
  const saved = await send<Entry>(owner, { op: 'save', draft: draft(name) });
  if (!saved.ok) throw new Error(`save failed: ${saved.reason}`);
  return saved.value.view;
}

async function bothActors(browser: Browser, admin: APIRequestContext, baseURL: string) {
  const other = await browser.newContext({ storageState: USER_STATE, baseURL });
  return { admin: await actorOf(admin), user: await actorOf(other.request), close: () => other.close() };
}

/** What `actor` sees for one id: the full entry, the denied stub, or nothing. Never the name of a view it may not see. */
const seen = (actor: Actor, id: string) => send<{ view?: { name: string }; denied?: true; reason?: string } | null>(actor, { op: 'get', id });

test.describe('저장된 뷰 서버 영속화 (#1105)', () => {
  test('저장한 뷰는 서버에 남고, 비공개 뷰는 다른 사용자에게 이름·내용 없이 열 수 없음으로만 보인다', async ({ request, browser, baseURL }) => {
    const { admin, user, close } = await bothActors(browser, request, baseURL!);
    try {
      expect(user.id).not.toBe(admin.id);
      const name = `E2E 서버 뷰 ${Date.now()}`;
      const view = await saveView(admin, name);
      expect(view.ownerId).toBe(admin.id);
      expect(view.visibility).toEqual({ kind: 'private' });

      const mine = await send<Array<{ view?: { id: string; name: string } }>>(admin, { op: 'list', key: KEY });
      expect(mine.some(item => item.view?.id === view.id && item.view.name === name)).toBe(true);

      const theirs = await send<unknown[]>(user, { op: 'list', key: KEY });
      expect(JSON.stringify(theirs)).not.toContain(name);
      const stub = await seen(user, view.id);
      expect(stub === null || stub.denied === true).toBe(true);
      expect(JSON.stringify(stub)).not.toContain(name);
      expect(JSON.stringify(stub)).not.toContain(admin.id);
    } finally {
      await close();
    }
  });

  test('공유한 사람은 열람과 기본 지정을 할 수 있고, 공유를 풀면 접근과 기본을 잃는다', async ({ request, browser, baseURL }) => {
    const { admin, user, close } = await bothActors(browser, request, baseURL!);
    try {
      const name = `E2E 공유 뷰 ${Date.now()}`;
      const view = await saveView(admin, name);

      const shared = await send<Entry>(admin, { op: 'setVisibility', id: view.id, visibility: { kind: 'people', userIds: [user.id] }, expectedVersion: view.version });
      expect(shared.ok).toBe(true);
      const sharedVersion = shared.ok ? shared.value.view.version : 0;

      const opened = await seen(user, view.id);
      expect(opened?.view?.name).toBe(name);
      expect(await send(user, { op: 'setDefault', key: KEY, id: view.id })).toEqual({ ok: true, value: null });
      expect(await send(user, { op: 'getDefaultId', key: KEY })).toBe(view.id);

      const unshared = await send<Entry>(admin, { op: 'setVisibility', id: view.id, visibility: { kind: 'private' }, expectedVersion: sharedVersion });
      expect(unshared.ok).toBe(true);
      const after = await seen(user, view.id);
      expect(after === null || after.denied === true).toBe(true);
      expect(JSON.stringify(after)).not.toContain(name);
      expect(await send(user, { op: 'getDefaultId', key: KEY })).toBeNull();
      expect(JSON.stringify(await send<unknown[]>(user, { op: 'list', key: KEY }))).not.toContain(name);
    } finally {
      await close();
    }
  });

  test('공식 신청은 승인 대기로만 남고, 콘솔 관리자가 승인하면 모두에게 보이며, 회수하면 접근과 기본을 잃는다', async ({ request, browser, baseURL }) => {
    const { admin, user, close } = await bothActors(browser, request, baseURL!);
    try {
      const name = `E2E 공식 뷰 ${Date.now()}`;
      const view = await saveView(user, name);

      const requested = await send<Entry>(user, { op: 'requestOfficial', id: view.id, expectedVersion: view.version });
      expect(requested.ok).toBe(true);
      if (!requested.ok) return;
      // Asking never changes who can see it: still private, approval pending.
      expect(requested.value.view.visibility).toEqual({ kind: 'private' });
      expect(requested.value.view.approval).toBe('pending');
      // ADR-0099 section 2: console approvers can inspect pending applications.
      const pendingForApprover = await seen(admin, view.id);
      expect(pendingForApprover).toMatchObject({ view: { name, approval: 'pending' }, capabilities: { canApprove: true } });

      // The second actor without console access cannot decide.
      const denied = await send<Entry>(user, { op: 'decide', id: view.id, decision: 'approve', expectedVersion: requested.value.view.version });
      expect(denied).toMatchObject({ ok: false, reason: 'forbidden' });

      const approved = await send<Entry>(admin, { op: 'decide', id: view.id, decision: 'approve', expectedVersion: requested.value.view.version });
      expect(approved.ok).toBe(true);
      if (!approved.ok) return;
      expect(approved.value.view.visibility).toEqual({ kind: 'official' });
      expect(approved.value.view.approval).toBe('approved');

      expect((await seen(admin, view.id))?.view?.name).toBe(name);
      expect(await send(admin, { op: 'setDefault', key: KEY, id: view.id })).toEqual({ ok: true, value: null });
      expect(await send(admin, { op: 'getDefaultId', key: KEY })).toBe(view.id);

      const revoked = await send<Entry>(admin, { op: 'revoke', id: view.id, expectedVersion: approved.value.view.version });
      expect(revoked.ok).toBe(true);
      const after = await seen(admin, view.id);
      expect(after === null || after.denied === true).toBe(true);
      expect(JSON.stringify(after)).not.toContain(name);
      expect(await send(admin, { op: 'getDefaultId', key: KEY })).toBeNull();
    } finally {
      await close();
    }
  });

  test('그룹에 속하지 않은 소유자도 같은 작업 공간의 사람 조회로 정확한 이름을 찾을 수 있다', async ({ request, browser, baseURL }) => {
    const { admin, user, close } = await bothActors(browser, request, baseURL!);
    try {
      const name = `E2E 소유자 이름 ${Date.now()}`;
      const view = await saveView(admin, name);
      const shared = await send<Entry>(admin, { op: 'setVisibility', id: view.id, visibility: { kind: 'people', userIds: [user.id] }, expectedVersion: view.version });
      expect(shared.ok).toBe(true);

      const opened = await seen(user, view.id);
      expect(opened?.view?.name).toBe(name);
      // The list carries only the owner id; the screen resolves the name by an exact lookup of that id (the owner shares no group with the reader).
      const found = await send<Array<{ userId: string; displayName: string }>>(user, { op: 'searchPeople', query: admin.id });
      expect(found.find(person => person.userId === admin.id)?.displayName).toBe(admin.name);
      expect(admin.name).not.toBe('');
    } finally {
      await close();
    }
  });

  test('이 브라우저에 남은 내 로컬 뷰를 한 번 서버로 옮기고 원본은 그대로 둔다', async ({ page }) => {
    await page.goto('/home');
    const me = await page.evaluate(async () => ((await (await fetch('/api/v1/platform/bootstrap', { credentials: 'same-origin' })).json()) as { session: { user: { id: string } } }).session.user.id);
    const name = `E2E 로컬 이전 ${Date.now()}`;
    const bucketKey = 'platform:saved-views:v1:' + JSON.stringify([1, me, MENU]);
    const raw = JSON.stringify({ schemaVersion: 1, views: [{ id: `${me}|${MENU}|1`, schemaVersion: 1, kind: 'menu-view', name, ownerId: me, version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', menuId: MENU, menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, panels: null }] });
    await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [bucketKey, raw]);
    // The import runs once while the assembly is created, on any page; no saved-view menu is needed.
    const imports = page.waitForResponse(r => new URL(r.url()).pathname === COMMANDS && (r.request().postDataJSON() as { op: string }).op === 'importLocal');
    await page.reload();
    expect((await imports).status()).toBe(200);
    expect(await page.evaluate(key => localStorage.getItem(key), bucketKey)).toBe(raw);

    const admin = await actorOf(page.context().request);
    const listed = await send<Array<{ view?: { name: string; ownerId: string; visibility: { kind: string } } }>>(admin, { op: 'list', key: KEY });
    const imported = listed.filter(item => item.view?.name === name);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.view).toMatchObject({ ownerId: admin.id, visibility: { kind: 'private' } });

    // A second load reuses the receipt: the row is neither duplicated nor kept out, and the original stays byte-identical.
    await page.reload();
    await expect.poll(async () => (await send<Array<{ view?: { name: string } }>>(admin, { op: 'list', key: KEY })).filter(item => item.view?.name === name).length).toBe(1);
    expect(await page.evaluate(key => localStorage.getItem(key), bucketKey)).toBe(raw);
  });
});
